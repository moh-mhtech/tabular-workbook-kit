export const KEY_COLUMN_ID = "__key__";
export const HEADER_ROW_ID = "__header__";

export type TimeGrain = "month" | "quarter" | "year";

export type CellKind = "input" | "formula";

export type Primitive = number | string | boolean | null;

export interface CalendarSnapshot {
  startMonth: string;
  monthCount: number;
}

export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  textColor?: string;
  fillColor?: string;
  fontSize?: number;
};

export interface ColumnSnapshot {
  id: string;
  name: string;
  format?: string;
  style?: CellStyle;
}

export interface CellSnapshot {
  kind: CellKind;
  value?: Primitive;
  formula?: string;
  format?: string;
  style?: CellStyle;
}

export interface RowSnapshot {
  id: string;
  key: string;
  cells: Record<string, CellSnapshot>;
}

export interface YearColumnSnapshot {
  id: string;
  year: number;
  grain: TimeGrain;
}

export interface TableSnapshot {
  id: string;
  name: string;
  attributeColumns: ColumnSnapshot[];
  yearColumns?: YearColumnSnapshot[];
  rows: RowSnapshot[];
  locked?: boolean;
  /** Row keys of the single data column become workbook defined names. */
  promoteRowKeys?: boolean;
  /** Number formats for period (or other non-attribute) columns. */
  columnFormats?: Record<string, string>;
  /** Styles for period (or other non-attribute) columns. */
  columnStyles?: Record<string, CellStyle>;
}

export type SheetHorizontalScroll = "table" | "sheet";

export interface SheetSnapshot {
  id: string;
  name: string;
  tableIds: string[];
  locked?: boolean;
  /** Wide tables scroll inside each table, or the whole sheet scrolls. Omitted means per table. */
  horizontalScroll?: SheetHorizontalScroll;
  /** Values typed on the grid outside every table band, keyed by `looseCellKey`. */
  looseCells?: Record<string, CellSnapshot>;
  /** When true, Explorer hides this Sheet's tables until the Sheet is viewed on the canvas. */
  explorerCollapsed?: boolean;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  overlays: Record<string, Primitive>;
}

/** Last Explorer sheet and Selection, restored on open (like Excel's saved active cell). */
export interface WorkbookViewSnapshot {
  activeSheetId: string;
  selection: Selection | null;
}

export interface WorkbookSnapshot {
  id: string;
  name: string;
  calendar: CalendarSnapshot;
  sheets: SheetSnapshot[];
  tables: TableSnapshot[];
  scenarios: ScenarioSnapshot[];
  activeScenarioId: string | null;
  view?: WorkbookViewSnapshot;
}

export interface EvaluatedCell {
  kind: CellKind;
  formula?: string;
  input: Primitive;
  overlay: boolean;
  computed: Primitive;
  error?: string;
}

export interface EvaluatedColumn {
  id: string;
  name: string;
  kind: "key" | "attribute" | "period" | "quarter" | "year";
  periodIds: string[];
}

export interface EvaluatedRow {
  id: string;
  key: string;
  cells: Record<string, EvaluatedCell>;
}

export interface EvaluatedTable {
  id: string;
  name: string;
  yearColumns: YearColumnSnapshot[];
  timeGrain: TimeGrain;
  columns: EvaluatedColumn[];
  rows: EvaluatedRow[];
}

export type CellRef = { tableId: string; rowId: string; columnId: string };

export type Selection =
  | { kind: "workbook" }
  | { kind: "sheet"; sheetId: string }
  | { kind: "table"; tableId: string }
  | { kind: "column"; tableId: string; columnId: string }
  | { kind: "row"; tableId: string; rowId: string }
  | { kind: "cell"; tableId: string; rowId: string; columnId: string; range?: CellRef[] }
  | { kind: "corner"; tableId: string }
  | { kind: "growth"; tableId: string; col: number; row: number };

export function selectedCellRefs(selection: Selection | null): CellRef[] {
  if (!isCellSelection(selection)) return [];
  if (selection.range?.length) return selection.range;
  return [{ tableId: selection.tableId, rowId: selection.rowId, columnId: selection.columnId }];
}

export function selectedTableId(selection: Selection | null): string | null {
  if (!selection || selection.kind === "workbook" || selection.kind === "sheet") return null;
  return selection.tableId;
}

export function sharedOrStar(values: readonly string[]): string {
  if (!values.length) return "";
  return values.every((value) => value === values[0]) ? values[0]! : "*";
}

export function overlayKey(tableId: string, rowId: string, columnId: string): string {
  return `${tableId}\u001f${rowId}\u001f${columnId}`;
}

export function looseCellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function parseLooseCellKey(key: string): { row: number; col: number } {
  const [row, col] = key.split(":");
  return { row: Number(row), col: Number(col) };
}

/** An empty loose cell is deleted, so presence alone does not prove the grid is occupied. */
export function hasContent(cell: CellSnapshot | undefined): boolean {
  if (!cell) return false;
  if (cell.kind === "formula") return Boolean(cell.formula);
  return cell.value !== null && cell.value !== undefined && cell.value !== "";
}

export function isCellSelection(
  selection: Selection | null,
): selection is Extract<Selection, { kind: "cell" }> {
  return selection?.kind === "cell";
}
