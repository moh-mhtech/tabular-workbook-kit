import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataEditor, {
  CompactSelection,
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { effectiveCell } from "../engine/compileWorkbook.js";
import {
  projectTable,
  projectedCell,
  selectionForProjectedCell,
  type SheetGridProjection,
} from "../grid/sheetProjection.js";
import { layoutWorkbook, type WorkbookLayout } from "../model/layout.js";
import { formatDisplayValue, rawEditValue, resolveCellFormat } from "../model/numberFormat.js";
import type { EvaluatedCell, WorkbookSnapshot } from "../model/types.js";
import {
  applyCustomGridClear,
  applyCustomGridEdits,
  applyCustomGridFill,
} from "./customGridInteractions.js";
import { SpreadsheetTextEditor, type OverlayEditorProps } from "./customGridEditor.js";
import {
  isSpreadsheetPointEvent,
  pointAtProjectedCell,
  type OverlayNavMode,
} from "./customGridOverlay.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

const EMPTY_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

const CELL_THEME = {
  header: { bgCell: "#f4f7fa", textDark: "#1e3a5f" },
  formula: { textDark: "#1c4e89" },
  error: { textDark: "#b42318" },
  overlay: { bgCell: "#fff6d6" },
  extension: { bgCell: "#fbfcfe", textLight: "#9aa8b6" },
} as const;

function showError(error: unknown) {
  window.alert(error instanceof Error ? error.message : String(error));
}

function evaluatedCells(
  session: ReturnType<typeof useWorkbook>["session"],
  snapshot: WorkbookSnapshot,
): Map<string, EvaluatedCell> {
  const result = new Map<string, EvaluatedCell>();
  for (const table of snapshot.tables) {
    try {
      for (const row of session.getTable(table.name).rows) {
        for (const [columnId, cell] of Object.entries(row.cells)) {
          result.set(`${table.id}\u001f${row.id}\u001f${columnId}`, cell);
        }
      }
    } catch {
      // The provider starts calculation asynchronously; source values remain available meanwhile.
    }
  }
  return result;
}

function textCell(
  data: string,
  options: Partial<Omit<Extract<GridCell, { kind: GridCellKind.Text }>, "kind" | "data">> = {},
): GridCell {
  return {
    kind: GridCellKind.Text,
    data,
    displayData: data,
    allowOverlay: true,
    ...options,
  };
}

function gridCell(
  projection: SheetGridProjection,
  layout: WorkbookLayout,
  evaluated: Map<string, EvaluatedCell>,
  location: Item,
): GridCell {
  const [col, row] = location;
  const projected = projectedCell(projection, layout, col, row);
  if (projected.kind === "readonly") {
    return textCell("", { allowOverlay: false, readonly: true });
  }
  if (projected.kind === "extension") {
    return textCell("", { style: "faded", themeOverride: CELL_THEME.extension });
  }

  const hit = projected.hit;
  const tableLayout = layout.tables.get(hit.tableId);
  if (!tableLayout) return textCell("", { allowOverlay: false, readonly: true });
  if (hit.kind === "header") {
    const column = tableLayout.columns.find((candidate) => candidate.id === hit.columnId);
    return textCell(column?.name ?? "", {
      contentAlign: "left",
      themeOverride: CELL_THEME.header,
    });
  }
  if (hit.kind === "key") {
    const tableRow = tableLayout.table.rows.find((candidate) => candidate.id === hit.rowId);
    return textCell(tableRow?.key ?? "", {
      contentAlign: "left",
      themeOverride: CELL_THEME.header,
    });
  }

  const value = evaluated.get(`${hit.tableId}\u001f${hit.rowId}\u001f${hit.columnId}`);
  const source = effectiveCell(layout.snapshot, hit.tableId, hit.rowId, hit.columnId);
  const sourceRow = tableLayout.table.rows.find((candidate) => candidate.id === hit.rowId);
  const pattern = resolveCellFormat(tableLayout.table, hit.columnId, sourceRow?.cells[hit.columnId]);
  const raw = value?.kind === "formula" || source.kind === "formula"
    ? value?.formula ?? source.formula ?? ""
    : rawEditValue(value?.input ?? source.value ?? null);
  const computed = value?.computed ?? (source.kind === "input" ? source.value ?? null : source.formula ?? "");
  const themeOverride = value?.error
    ? CELL_THEME.error
    : value?.overlay
      ? CELL_THEME.overlay
      : value?.kind === "formula" || source.kind === "formula"
        ? CELL_THEME.formula
        : undefined;
  return textCell(raw, {
    displayData: formatDisplayValue(computed, pattern),
    contentAlign: typeof computed === "number" ? "right" : "left",
    themeOverride,
  });
}

function ensureOverlayPortal() {
  if (document.getElementById("portal")) return;
  const portal = document.createElement("div");
  portal.id = "portal";
  document.body.appendChild(portal);
}

const TABLE_ROW_HEIGHT = 28;

export function CustomSheetCanvas() {
  const { session, activeSheetId } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const sheet = layout.sheets.find((candidate) => candidate.sheetId === activeSheetId);

  useEffect(() => {
    ensureOverlayPortal();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        session.undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        session.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  if (!sheet) {
    return <main className="wk-canvas wk-table-canvases wk-empty-sheet">Select a sheet.</main>;
  }

  return (
    <main className="wk-canvas wk-table-canvases" aria-label={`${sheet.sheetName} tables`}>
      {sheet.bands.map((band) => {
        const table = snapshot.tables.find((candidate) => candidate.id === band.tableId);
        if (!table) return null;
        return (
          <section className="wk-table-viewport-card" key={table.id}>
            <button
              type="button"
              className="wk-table-viewport-title"
              onClick={() => session.setSelection({ kind: "table", tableId: table.id })}
            >
              {table.name}
            </button>
            <TableGrid tableId={table.id} />
          </section>
        );
      })}
      {!sheet.bands.length && <div className="wk-empty-sheet">This sheet has no tables.</div>}
    </main>
  );
}

function TableGrid({ tableId }: { tableId: string }) {
  const { session, setActiveSheetId } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const projection = useMemo(() => projectTable(layout, tableId), [layout, tableId]);
  const values = useMemo(() => evaluatedCells(session, snapshot), [session, snapshot]);
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_SELECTION);
  const overlayStartModeRef = useRef<OverlayNavMode>("cells");
  const overlayOpenRef = useRef(false);
  const editingLocationRef = useRef<Item | null>(null);
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;
  const editorHostRef = useRef({
    projection,
    layout,
    editingLocation: [1, 1] as Item,
    initialNavMode: "cells" as OverlayNavMode,
  });
  editorHostRef.current.projection = projection;
  editorHostRef.current.layout = layout;
  const targetCell = session.formulaEdit?.targetCell;

  useEffect(() => {
    setGridSelection(EMPTY_SELECTION);
  }, [tableId]);

  const getCellContent = useCallback(
    (location: Item): GridCell => {
      if (!projection) return textCell("", { allowOverlay: false, readonly: true });
      return gridCell(projection, layout, values, location);
    },
    [layout, projection, values],
  );

  const onGridSelectionChange = useCallback(
    (next: GridSelection) => {
      if (!projection || overlayOpenRef.current || session.formulaEdit) return;
      setGridSelection(next);
      const active = next.current?.cell;
      if (!active) return;
      editingLocationRef.current = active;
      setActiveSheetId(projection.sheetId);
      session.setSelection(selectionForProjectedCell(projection, layout, active[0], active[1]));
    },
    [layout, projection, session, setActiveSheetId],
  );

  const onCellClicked = useCallback(
    (location: Item) => {
      if (!projection || !session.formulaEdit) return;
      pointAtProjectedCell(session, projection, layout, location[0], location[1]);
    },
    [layout, projection, session],
  );

  const onCellsEdited = useCallback(
    (edits: readonly { location: Item; value: EditableGridCell }[]) => {
      if (!projection) return true;
      try {
        applyCustomGridEdits(session, projection, layout, edits);
      } catch (error) {
        showError(error);
      }
      return true;
    },
    [layout, projection, session],
  );

  const onDelete = useCallback(
    (selection: GridSelection) => {
      if (!projection) return false;
      const current = selection.current?.range;
      if (!current) return false;
      try {
        applyCustomGridClear(session, projection, layout, {
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
        });
      } catch (error) {
        showError(error);
      }
      return false;
    },
    [layout, projection, session],
  );

  const BoundEditor = useCallback((props: OverlayEditorProps) => {
    const host = editorHostRef.current;
    if (!host.projection) return null;
    return (
      <SpreadsheetTextEditor
        {...props}
        initialNavMode={host.initialNavMode}
        editingLocation={host.editingLocation}
        projection={host.projection}
        layout={host.layout}
      />
    );
  }, []);

  const provideEditor = useCallback((cell: GridCell) => {
    if (cell.kind !== GridCellKind.Text || !projection) return undefined;
    const located = cell as GridCell & { location?: Item };
    const editingLocation =
      located.location ?? editingLocationRef.current ?? gridSelectionRef.current.current?.cell;
    if (!editingLocation) return undefined;
    editorHostRef.current.editingLocation = editingLocation;
    editorHostRef.current.initialNavMode = overlayStartModeRef.current;
    const columnWidth = projection.columns[editingLocation[0]]?.width ?? 110;
    return { editor: BoundEditor, styleOverride: { minWidth: columnWidth * 2 } };
  }, [BoundEditor, projection]);

  const onEditorKeyDown = useCallback((event: { key: string }) => {
    if (event.key === "F2") overlayStartModeRef.current = "text";
  }, []);

  const onCellActivated = useCallback((cell: Item) => {
    editingLocationRef.current = cell;
    overlayOpenRef.current = true;
    editorHostRef.current.editingLocation = cell;
  }, []);

  const onFinishedEditing = useCallback(() => {
    overlayOpenRef.current = false;
    overlayStartModeRef.current = "cells";
    session.cancelFormulaEdit();
  }, [session]);

  const onFillPattern = useCallback(
    (event: { patternSource: Rectangle; fillDestination: Rectangle }) => {
      if (!projection) return;
      try {
        applyCustomGridFill(session, projection, layout, event.patternSource, event.fillDestination);
      } catch (error) {
        showError(error);
      }
    },
    [layout, projection, session],
  );

  if (!projection) return null;

  const columns: GridColumn[] = projection.columns.map((column) => ({
    id: column.id,
    title: column.title,
    width: column.width,
  }));

  return (
    <div
      className="wk-table-spreadsheet click-outside-ignore"
      style={{
        width: projection.columns.reduce((sum, column) => sum + column.width, 0) + 2,
        height: projection.rowCount * TABLE_ROW_HEIGHT + 2,
      }}
    >
      <DataEditor
        columns={columns}
        rows={projection.rowCount}
        getCellContent={getCellContent}
        getCellsForSelection={true}
        gridSelection={gridSelection}
        onGridSelectionChange={onGridSelectionChange}
        onCellClicked={onCellClicked}
        onCellsEdited={onCellsEdited}
        onDelete={onDelete}
        onFillPattern={onFillPattern}
        provideEditor={provideEditor}
        onKeyDown={onEditorKeyDown}
        onCellActivated={onCellActivated}
        onFinishedEditing={onFinishedEditing}
        isOutsideClick={(event) => !isSpreadsheetPointEvent(event)}
        highlightRegions={
          targetCell && targetCell.tableId === tableId
            ? [{ color: "rgba(42, 111, 151, 0.28)", range: { x: targetCell.col, y: targetCell.row, width: 1, height: 1 } }]
            : undefined
        }
        cellActivationBehavior="double-click"
        keybindings={{ activateCell: "F2| |Enter|shift+Enter" }}
        fillHandle={true}
        allowedFillDirections="orthogonal"
        onPaste={true}
        rowMarkers="none"
        headerHeight={0}
        rowHeight={TABLE_ROW_HEIGHT}
        rangeSelect="rect"
        columnSelect="none"
        rowSelect="none"
        smoothScrollX={true}
        smoothScrollY={true}
        width="100%"
        height="100%"
        theme={{
          accentColor: "#2a6f97",
          accentFg: "#ffffff",
          bgCell: "#ffffff",
          bgHeader: "#f4f7fa",
          borderColor: "#e2e8ef",
          textDark: "#1e3a5f",
          textMedium: "#5b6b7c",
          textLight: "#7a8a99",
          fontFamily: '"Segoe UI", sans-serif',
          baseFontStyle: "13px",
          headerFontStyle: "600 13px",
        }}
      />
    </div>
  );
}
