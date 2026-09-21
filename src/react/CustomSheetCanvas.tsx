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
import { fitProjectedColumnWidths, fitProjectedRowHeights, TABLE_ROW_HEIGHT } from "../grid/columnFit.js";
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
import { applyStrikethrough, resolveCellStyle, styleFont } from "../model/cellStyle.js";
import { formatDisplayValue, rawEditValue, resolveCellFormat } from "../model/numberFormat.js";
import { selectedCellRefs, type Primitive } from "../model/types.js";
import { writePeriodIds } from "../model/yearColumns.js";
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
  commitLiteralEditAndSelect,
  isSpreadsheetPointEvent,
  pointAtProjectedCell,
  shouldPointGridClick,
  type OverlayNavMode,
} from "./customGridOverlay.js";
import { clampCanvasScroll, scrollCanvasToKeepCellVisible, scrollCanvasToKeepTableVisible } from "./sheetScroll.js";
import { arrowNavDirection, focusAdjacentTable, sheetTableProjections } from "./tableArrowNav.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

const EMPTY_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

function gridLocationFromPointer(
  host: HTMLElement,
  clientX: number,
  clientY: number,
  columnWidths: number[],
  rowHeights: number[],
): readonly [number, number] | null {
  const rect = host.getBoundingClientRect();
  let x = clientX - rect.left;
  let y = clientY - rect.top;
  if (x < 0 || y < 0) return null;
  let col = 0;
  for (; col < columnWidths.length; col++) {
    x -= columnWidths[col]!;
    if (x < 0) break;
  }
  if (col >= columnWidths.length) return null;
  let row = 0;
  for (; row < rowHeights.length; row++) {
    y -= rowHeights[row]!;
    if (y < 0) break;
  }
  if (row >= rowHeights.length) return null;
  return [col, row];
}

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

function pointedHighlightRange(
  target: { col: number; row: number } | undefined,
  anchor: { col: number; row: number } | undefined,
): { x: number; y: number; width: number; height: number } | undefined {
  if (!target) return undefined;
  const start = anchor ?? target;
  const x = Math.min(start.col, target.col);
  const y = Math.min(start.row, target.row);
  return {
    x,
    y,
    width: Math.abs(start.col - target.col) + 1,
    height: Math.abs(start.row - target.row) + 1,
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

function bucketComputed(
  values: Array<EvaluatedCell | undefined>,
  sources: Array<{ kind: string; value?: Primitive; formula?: string }>,
): Primitive {
  if (values.length <= 1) {
    const value = values[0];
    const source = sources[0];
    return value?.computed ?? (source?.kind === "input" ? source.value ?? null : source?.formula ?? "");
  }
  let sum = 0;
  let saw = false;
  for (const value of values) {
    if (typeof value?.computed === "number") {
      sum += value.computed;
      saw = true;
    }
  }
  if (saw) return sum;
  const source = sources[0];
  return source?.kind === "input" ? source.value ?? null : source?.formula ?? "";
}

export function evaluatedCells(
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

export function textCell(
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

export function gridCell(
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
    const slotTitle = projection.columns.find((candidate) => candidate.id === hit.columnId)?.title;
    return textCell(slotTitle || column?.name || "", {
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

  const periodIds = writePeriodIds(tableLayout.table, hit.columnId, layout.periods);
  const sources = periodIds.map((id) => effectiveCell(layout.snapshot, hit.tableId, hit.rowId, id));
  const values = periodIds.map((id) => evaluated.get(`${hit.tableId}\u001f${hit.rowId}\u001f${id}`));
  const value = values[0];
  const source = sources[0] ?? effectiveCell(layout.snapshot, hit.tableId, hit.rowId, hit.columnId);
  const sourceRow = tableLayout.table.rows.find((candidate) => candidate.id === hit.rowId);
  const pattern = resolveCellFormat(tableLayout.table, periodIds[0] ?? hit.columnId, sourceRow?.cells[periodIds[0] ?? hit.columnId]);
  const formulas = sources.map((item) => (item.kind === "formula" ? item.formula ?? "" : ""));
  const sameFormula = formulas.length > 0 && formulas.every((item) => item && item === formulas[0]);
  const computed = bucketComputed(values, sources);
  const raw = sameFormula
    ? formulas[0]!
    : value?.kind === "formula" || source.kind === "formula"
      ? value?.formula ?? source.formula ?? ""
      : rawEditValue(periodIds.length > 1 ? computed : value?.input ?? source.value ?? null);
  const style = resolveCellStyle(tableLayout.table, periodIds[0] ?? hit.columnId, sourceRow?.cells[periodIds[0] ?? hit.columnId]);
  const themeOverride = {
    ...(values.some((item) => item?.error)
      ? CELL_THEME.error
      : values.some((item) => item?.overlay)
        ? CELL_THEME.overlay
        : sameFormula || value?.kind === "formula" || source.kind === "formula"
          ? CELL_THEME.formula
          : CELL_THEME.cell),
    ...(style?.fillColor ? { bgCell: style.fillColor } : {}),
    ...(style?.textColor ? { textDark: style.textColor, textLight: style.textColor } : {}),
    ...(styleFont(style) ? { baseFontStyle: styleFont(style) } : {}),
  };
  return textCell(raw, {
    displayData: applyStrikethrough(formatDisplayValue(computed, pattern), style),
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
      if (event.target instanceof Element && event.target.closest(".wk-overlay-editor, .wk-formula-bar, textarea, input")) {
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        session.undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        session.redo();
      } else if (key === "b" || key === "i" || event.key === "5") {
        const refs = selectedCellRefs(session.selection);
        if (!refs.length) return;
        event.preventDefault();
        const flag = key === "b" ? "bold" : key === "i" ? "italic" : "strikethrough";
        session.transact(() => {
          for (const ref of refs) {
            const table = session.getSnapshot().tables.find((candidate) => candidate.id === ref.tableId);
            const row = table?.rows.find((candidate) => candidate.id === ref.rowId);
            const current = table
              ? resolveCellStyle(table, ref.columnId, row?.cells[ref.columnId])
              : undefined;
            session.setCellStyle(ref.tableId, ref.rowId, ref.columnId, { [flag]: !current?.[flag] });
          }
        });
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
        if (session.formulaEdit) session.commitFormulaEdit();
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
  const fittedRows = useMemo(
    () => (projection ? fitProjectedRowHeights(projection, layout) : []),
    [layout, projection],
  );
  const [gridSelection, setGridSelection] = useState<GridSelection>(EMPTY_SELECTION);
    const overlayStartModeRef = useRef<OverlayNavMode>("enter");
  const overlayOpenRef = useRef(false);
  const pointingDragRef = useRef(false);
  const lastClickWasDoubleRef = useRef(false);
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
    initialNavMode: "enter" as OverlayNavMode,
  });
  editorHostRef.current.projection = projection;
  editorHostRef.current.layout = layout;
  const targetCell = session.formulaEdit?.targetCell;
  const rangeAnchor = session.formulaEdit?.rangeAnchor;
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
      fittedRows,
      horizontalScroll,
    );
  }, [fittedColumns, fittedRows, followCellSelection, gridSelection, horizontalScroll, projection, tableId]);

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
      if (shouldPointGridClick(session)) {
        pointAtProjectedCell(session, projection, layout, location[0], location[1], {
          extend: pointingDragRef.current,
        });
        return;
      }
      overlayOpenRef.current = false;
      commitLiteralEditAndSelect(session, projection, layout, location[0], location[1]);
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
      if (event.key === "F2") overlayStartModeRef.current = "edit";
      if (event.key === "Enter" || event.key === " ") overlayStartModeRef.current = "enter";
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
    if (lastClickWasDoubleRef.current) overlayStartModeRef.current = "edit";
    lastClickWasDoubleRef.current = false;
  }, [projection]);

  const onFinishedEditing = useCallback(
    (_newValue?: GridCell, movement: readonly [number, number] = [0, 0]) => {
      overlayOpenRef.current = false;
      overlayStartModeRef.current = "enter";
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

  const columnWidths = fittedColumns.map((column) => column.width);
  const pointedRange = pointedHighlightRange(
    targetCell && targetCell.tableId === tableId ? targetCell : undefined,
    rangeAnchor && rangeAnchor.tableId === tableId ? rangeAnchor : undefined,
  );

  return (
    <div
      ref={hostRef}
      className="wk-table-spreadsheet click-outside-ignore"
      tabIndex={0}
      onKeyDown={(event) => onEditorKeyDown(event)}
      onPointerDown={(event) => {
        lastClickWasDoubleRef.current = event.detail >= 2;
        if (!session.formulaEdit || !projection) return;
        if ((event.target as HTMLElement | null)?.closest(".wk-overlay-editor, .wk-formula-bar, .wk-formula-suggest")) {
          return;
        }
        const location = gridLocationFromPointer(event.currentTarget, event.clientX, event.clientY, columnWidths, fittedRows);
        if (!location) return;
        const editCell = session.formulaEdit.editCell;
        if (editCell && editCell.tableId === tableId && editCell.col === location[0] && editCell.row === location[1]) {
          return;
        }
        if (shouldPointGridClick(session)) {
          pointingDragRef.current = true;
          pointAtProjectedCell(session, projection, layout, location[0], location[1]);
        }
      }}
      onPointerMove={(event) => {
        if (!pointingDragRef.current || !session.formulaEdit || !projection || event.buttons === 0) return;
        const location = gridLocationFromPointer(event.currentTarget, event.clientX, event.clientY, columnWidths, fittedRows);
        if (!location) return;
        pointAtProjectedCell(session, projection, layout, location[0], location[1], { extend: true });
      }}
      onPointerUp={() => {
        pointingDragRef.current = false;
      }}
      style={{
        width: fittedColumns.reduce((sum, column) => sum + column.width, 0) + 2,
        height: fittedRows.reduce((sum, height) => sum + height, 0) + SCROLLBAR_GUTTER,
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
          const projected = projectedCell(projection, layout, args.col, args.row);
          if (projected.kind !== "table" || projected.hit.kind !== "cell") return;
          const tableLayout = layout.tables.get(projected.hit.tableId);
          if (!tableLayout) return;
          const sourceRow = tableLayout.table.rows.find((candidate) => candidate.id === projected.hit.rowId);
          const periodIds = writePeriodIds(tableLayout.table, projected.hit.columnId, layout.periods);
          const style = resolveCellStyle(
            tableLayout.table,
            periodIds[0] ?? projected.hit.columnId,
            sourceRow?.cells[periodIds[0] ?? projected.hit.columnId],
          );
          if (!style?.strikethrough) return;
          const y = args.rect.y + args.rect.height / 2;
          args.ctx.save();
          args.ctx.strokeStyle = style.textColor ?? "#1e3a5f";
          args.ctx.lineWidth = 1;
          args.ctx.beginPath();
          args.ctx.moveTo(args.rect.x + 6, y);
          args.ctx.lineTo(args.rect.x + args.rect.width - 6, y);
          args.ctx.stroke();
          args.ctx.restore();
        }}
        provideEditor={provideEditor}
        onKeyDown={onEditorKeyDown}
        onCellActivated={onCellActivated}
        onFinishedEditing={onFinishedEditing}
        isOutsideClick={(event) => {
          if (!isSpreadsheetPointEvent(event)) return true;
          return !shouldPointGridClick(session);
        }}
        highlightRegions={
          pointedRange
            ? [{ color: "rgba(42, 111, 151, 0.28)", range: pointedRange }]
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
        rowHeight={(row) => fittedRows[row] ?? TABLE_ROW_HEIGHT}
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
