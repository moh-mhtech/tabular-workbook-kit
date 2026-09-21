import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DataEditor, {
  CompactSelection,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { effectiveCell } from "../engine/compileWorkbook.js";
import { fitProjectedColumnWidths } from "../grid/columnFit.js";
import {
  TABLE_DATA_COLUMN_WIDTH,
  GROWTH_HEADER_MARK,
  acceptTableGridSelection,
  cellsInProjectedRange,
  isGrowthHeaderCell,
  isUnusedTableCorner,
  projectTable,
  projectedCell,
  projectedLocationForRef,
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
  applyCustomGridPaste,
  expandEditAcrossRange,
  focusAfterCommitMove,
} from "./customGridInteractions.js";
import { SpreadsheetTextEditor, type OverlayEditorProps } from "./customGridEditor.js";
import {
  isSpreadsheetPointEvent,
  pointAtProjectedCell,
  type OverlayNavMode,
} from "./customGridOverlay.js";
import { clampCanvasScroll, scrollCanvasToKeepCellVisible, scrollCanvasToKeepTableVisible } from "./sheetScroll.js";
import { arrowNavDirection, focusAdjacentTable, sheetTableProjections } from "./tableArrowNav.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

const EMPTY_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

function cellGridSelection(cell: readonly [number, number]): GridSelection {
  return {
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: {
      cell: [cell[0], cell[1]],
      range: { x: cell[0], y: cell[1], width: 1, height: 1 },
      rangeStack: [],
    },
  };
}

const SHEET_SURFACE = "#eef2f6";
const TABLE_CELL_SURFACE = "#ffffff";

const CELL_THEME = {
  header: { bgCell: "#f4f7fa", textDark: "#1e3a5f" },
  formula: { bgCell: TABLE_CELL_SURFACE, textDark: "#1c4e89" },
  error: { bgCell: TABLE_CELL_SURFACE, textDark: "#b42318" },
  overlay: { bgCell: "#fff6d6" },
  extension: { bgCell: "#fbfcfe", textLight: "#9aa8b6" },
  growthHeader: { bgCell: "#f4f7fa", textDark: "#9aa8b6", textLight: "#9aa8b6" },
  cell: { bgCell: TABLE_CELL_SURFACE },
  hidden: { bgCell: SHEET_SURFACE, borderColor: SHEET_SURFACE },
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

function growthHeaderCell(editable: boolean): GridCell {
  return textCell("", {
    displayData: GROWTH_HEADER_MARK,
    style: "faded",
    contentAlign: "center",
    allowOverlay: editable,
    readonly: !editable,
    themeOverride: CELL_THEME.growthHeader,
  });
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
    if (isUnusedTableCorner(projection, col, row)) {
      return textCell("", {
        allowOverlay: false,
        readonly: true,
        cursor: "default",
        span: [col, col],
        themeOverride: CELL_THEME.hidden,
      });
    }
    if (isGrowthHeaderCell(projection, col, row)) {
      return growthHeaderCell(false);
    }
    return textCell("", {
      allowOverlay: false,
      readonly: true,
      themeOverride: col === 0 || row === 0 ? CELL_THEME.header : CELL_THEME.cell,
    });
  }
  if (projected.kind === "extension") {
    if (isGrowthHeaderCell(projection, col, row)) {
      return growthHeaderCell(true);
    }
    return textCell("", {
      style: "faded",
      themeOverride: col === 0 || row === 0 ? CELL_THEME.header : CELL_THEME.extension,
    });
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
        : CELL_THEME.cell;
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
const SCROLLBAR_GUTTER = 16;

export function CustomSheetCanvas() {
  const { session, activeSheetId } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const sheet = layout.sheets.find((candidate) => candidate.sheetId === activeSheetId);
  const canvasRef = useRef<HTMLElement>(null);
  const selection = session.selection;
  const lastSheetIdRef = useRef(activeSheetId);
  const lastRevealRef = useRef(session.revealNonce);

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

  const horizontalScroll = snapshot.sheets.find((candidate) => candidate.id === activeSheetId)?.horizontalScroll ?? "table";

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sheetChanged = lastSheetIdRef.current !== activeSheetId;
    lastSheetIdRef.current = activeSheetId;
    if (sheetChanged) {
      canvas.scrollTop = 0;
      canvas.scrollLeft = 0;
    }
    if (lastRevealRef.current === session.revealNonce) return;
    lastRevealRef.current = session.revealNonce;
    if (selection?.kind === "table") {
      scrollCanvasToKeepTableVisible(canvas, selection.tableId, horizontalScroll);
    }
  }, [activeSheetId, horizontalScroll, selection, session.revealNonce]);

  if (!sheet) {
    return (
      <main ref={canvasRef} className="wk-canvas wk-table-canvases wk-empty-sheet">
        Select a sheet.
      </main>
    );
  }

  return (
    <main
      ref={canvasRef}
      className={`wk-canvas wk-table-canvases ${horizontalScroll === "sheet" ? "is-sheet-scroll-x" : "is-table-scroll-x"}`}
      aria-label={`${sheet.sheetName} tables`}
      onScroll={(event) => clampCanvasScroll(event.currentTarget)}
      onClick={(event) => {
        if ((event.target as HTMLElement | null)?.closest("[data-table-id]")) return;
        session.setSelection({ kind: "sheet", sheetId: sheet.sheetId });
      }}
    >
      {sheet.bands.map((band) => {
        const table = snapshot.tables.find((candidate) => candidate.id === band.tableId);
        if (!table) return null;
        return (
          <section className="wk-table-viewport-card" data-table-id={table.id} key={table.id}>
            <button
              type="button"
              className="wk-table-viewport-title"
              onClick={() => session.revealTable(table.id)}
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
  const fittedColumns = useMemo(
    () => (projection ? fitProjectedColumnWidths(projection, layout, values) : []),
    [layout, projection, values],
  );
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_SELECTION);
  const overlayStartModeRef = useRef<OverlayNavMode>("cells");
  const overlayOpenRef = useRef(false);
  const editingLocationRef = useRef<Item | null>(null);
  const gridRef = useRef<DataEditorRef | null>(null);
  const gridSelectionRef = useRef(gridSelection);
  gridSelectionRef.current = gridSelection;
  const sheetTables = useMemo(
    () => (projection ? sheetTableProjections(layout, projection.sheetId) : []),
    [layout, projection],
  );
  const editorHostRef = useRef({
    projection,
    layout,
    editingLocation: [1, 1] as Item,
    initialNavMode: "cells" as OverlayNavMode,
  });
  editorHostRef.current.projection = projection;
  editorHostRef.current.layout = layout;
  const targetCell = session.formulaEdit?.targetCell;
  const hostRef = useRef<HTMLDivElement>(null);
  const horizontalScroll = snapshot.sheets.find((sheet) => sheet.id === projection?.sheetId)?.horizontalScroll ?? "table";

  const selectedGridCell = gridSelection.current?.cell;
  const growthCellSelected = Boolean(
    projection &&
      selectedGridCell &&
      (isGrowthHeaderCell(projection, selectedGridCell[0], selectedGridCell[1]) ||
        projectedCell(projection, layout, selectedGridCell[0], selectedGridCell[1]).kind === "extension"),
  );
  const followCellSelection =
    session.gridFocus?.tableId === tableId ||
    (session.selection !== null &&
      "tableId" in session.selection &&
      session.selection.tableId === tableId &&
      (session.selection.kind !== "table" || growthCellSelected));

  useLayoutEffect(() => {
    const cell = gridSelection.current?.cell;
    if (!cell || !projection || !followCellSelection) return;
    const canvas = hostRef.current?.closest(".wk-canvas");
    if (!(canvas instanceof HTMLElement)) return;
    if (horizontalScroll === "table") gridRef.current?.scrollTo(cell[0], cell[1]);
    scrollCanvasToKeepCellVisible(
      canvas,
      tableId,
      cell[0],
      cell[1],
      fittedColumns.map((column) => column.width),
      TABLE_ROW_HEIGHT,
      horizontalScroll,
    );
  }, [fittedColumns, followCellSelection, gridSelection, horizontalScroll, projection, tableId]);

  const revealSeenRef = useRef(session.revealNonce);

  useEffect(() => {
    setGridSelection(EMPTY_SELECTION);
  }, [tableId]);

  useEffect(() => {
    if (!projection || overlayOpenRef.current || session.formulaEdit) return;
    const revealed = revealSeenRef.current !== session.revealNonce;
    revealSeenRef.current = session.revealNonce;
    const focus = session.gridFocus;
    if (focus && focus.tableId === tableId) {
      session.gridFocus = null;
      setGridSelection(cellGridSelection([focus.col, focus.row]));
      editingLocationRef.current = [focus.col, focus.row];
      gridRef.current?.focus();
      return;
    }
    const selection = session.selection;
    if (!selection || !("tableId" in selection) || selection.tableId !== tableId) {
      if (gridSelectionRef.current.current) setGridSelection(EMPTY_SELECTION);
      return;
    }
    if (selection?.kind === "table" && selection.tableId === tableId) {
      if (revealed && gridSelectionRef.current.current) setGridSelection(EMPTY_SELECTION);
      return;
    }
    if (selection?.kind !== "cell" || selection.tableId !== tableId) return;
    const location = projectedLocationForRef(projection, layout, selection);
    if (!location) return;
    const current = gridSelectionRef.current.current?.cell;
    if (current?.[0] === location[0] && current?.[1] === location[1]) return;
    setGridSelection(cellGridSelection(location));
    editingLocationRef.current = [location[0], location[1]];
  }, [layout, projection, session.formulaEdit, session.gridFocus, session.revealNonce, session.selection, tableId]);

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
      if (!acceptTableGridSelection(projection, next.current?.cell)) return;
      setGridSelection(next);
      const active = next.current?.cell;
      if (!active) return;
      editingLocationRef.current = active;
      setActiveSheetId(projection.sheetId);
      const activeSelection = selectionForProjectedCell(projection, layout, active[0], active[1]);
      const range = next.current?.range
        ? cellsInProjectedRange(projection, layout, next.current.range)
        : [];
      if (range.length) {
        const primary = activeSelection.kind === "cell" ? activeSelection : range[0]!;
        session.setSelection({ ...primary, range });
        return;
      }
      session.setSelection(activeSelection);
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
        applyCustomGridEdits(
          session,
          projection,
          layout,
          expandEditAcrossRange(projection, layout, edits, gridSelectionRef.current.current?.range),
        );
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
    if (!editingLocation || isUnusedTableCorner(projection, editingLocation[0], editingLocation[1])) return undefined;
    editorHostRef.current.editingLocation = editingLocation;
    editorHostRef.current.initialNavMode = overlayStartModeRef.current;
    const columnWidth = fittedColumns[editingLocation[0]]?.width ?? TABLE_DATA_COLUMN_WIDTH;
    return { editor: BoundEditor, styleOverride: { minWidth: columnWidth * 2 } };
  }, [BoundEditor, fittedColumns, projection]);

  const onEditorKeyDown = useCallback(
    (event: {
      key: string;
      altKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      cancel?: () => void;
      preventDefault?: () => void;
    }) => {
      if (event.key === "F2") overlayStartModeRef.current = "text";
      if (overlayOpenRef.current || session.formulaEdit) return;
      if (event.altKey || event.shiftKey) return;
      const direction = arrowNavDirection(event.key);
      if (!direction) return;
      const current = gridSelectionRef.current.current?.cell;
      if (!current) return;
      const ctrl = Boolean(event.ctrlKey || event.metaKey);
      const target = focusAdjacentTable(
        session,
        sheetTables,
        { tableId, col: current[0], row: current[1] },
        direction,
        layout,
        { ctrl, evaluated: values },
      );
      if (!target) return;
      event.cancel?.();
      event.preventDefault?.();
    },
    [layout, session, sheetTables, tableId, values],
  );

  const onCellActivated = useCallback((cell: Item) => {
    if (projection && isUnusedTableCorner(projection, cell[0], cell[1])) return;
    editingLocationRef.current = cell;
    overlayOpenRef.current = true;
    editorHostRef.current.editingLocation = cell;
  }, [projection]);

  const onFinishedEditing = useCallback(
    (_newValue?: GridCell, movement: readonly [number, number] = [0, 0]) => {
      overlayOpenRef.current = false;
      overlayStartModeRef.current = "cells";
      session.cancelFormulaEdit();
      if (!projection?.tableId) return;
      const current = editingLocationRef.current ?? gridSelectionRef.current.current?.cell;
      if (!current) return;
      const delta: readonly [-1 | 0 | 1, -1 | 0 | 1] = [
        movement[0] < 0 ? -1 : movement[0] > 0 ? 1 : 0,
        movement[1] < 0 ? -1 : movement[1] > 0 ? 1 : 0,
      ];
      try {
        const next = focusAfterCommitMove(session, projection.tableId, current, delta);
        if (!next) return;
        setGridSelection(cellGridSelection(next.location));
        editingLocationRef.current = [next.location[0], next.location[1]];
        setActiveSheetId(projection.sheetId);
      } catch (error) {
        showError(error);
      }
    },
    [projection, session, setActiveSheetId],
  );

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

  const columns: GridColumn[] = fittedColumns.map((column) => ({
    id: column.id,
    title: column.title,
    width: column.width,
  }));

  return (
    <div
      ref={hostRef}
      className="wk-table-spreadsheet click-outside-ignore"
      tabIndex={0}
      onKeyDown={(event) => onEditorKeyDown(event)}
      style={{
        width: fittedColumns.reduce((sum, column) => sum + column.width, 0) + 2,
        height: projection.rowCount * TABLE_ROW_HEIGHT + SCROLLBAR_GUTTER,
      }}
    >
      <DataEditor
        ref={gridRef}
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
        drawCell={(args, drawContent) => {
          if (isUnusedTableCorner(projection, args.col, args.row)) {
            args.ctx.fillStyle = SHEET_SURFACE;
            args.ctx.fillRect(args.rect.x, args.rect.y, args.rect.width, args.rect.height);
            return;
          }
          drawContent();
        }}
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
        onPaste={(target, values) => {
          try {
            applyCustomGridPaste(session, projection, target, values);
          } catch (error) {
            showError(error);
          }
          return false;
        }}
        verticalBorder={(col) => col > 0 && col < columns.length}
        getRowThemeOverride={(row) =>
          row === 0 || row >= projection.rowCount
            ? { horizontalBorderColor: "transparent" }
            : undefined
        }
        experimental={{ scrollbarWidthOverride: SCROLLBAR_GUTTER }}
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
          bgCell: SHEET_SURFACE,
          bgHeader: "#f4f7fa",
          borderColor: "#e2e8ef",
          headerBottomBorderColor: "transparent",
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
