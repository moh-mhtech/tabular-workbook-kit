import {
  applyPointedRef,
  activeFormulaRefKey,
  cursorFormulaRef,
  isValidInsertPoint,
  pointingReplaceSpan,
  type FormulaEditMode,
} from "../react/customGridOverlay.js";
import { effectiveCell, readComputed } from "../engine/compileWorkbook.js";
import type { FormulaEngine, SheetGrid } from "../engine/types.js";
import { UniverEngine } from "../engine/univer.js";
import { buildPeriods, quarterId, yearId } from "../model/calendar.js";
import { layoutWorkbook } from "../model/layout.js";
import {
  assertGlobalName,
  canPromoteRowKeys,
  nextPromotableKey,
} from "../model/names.js";
import {
  hitTest,
  layoutSheets,
  planExpansion,
  restackedRow,
  type GridExpansion,
  type TableBand,
} from "../model/sheetView.js";
import {
  KEY_COLUMN_ID,
  looseCellKey,
  overlayKey,
  parseLooseCellKey,
  type CellSnapshot,
  type CellStyle,
  type EvaluatedCell,
  type EvaluatedColumn,
  type EvaluatedTable,
  type Primitive,
  type Selection,
  type SheetHorizontalScroll,
  type TableSnapshot,
  type TimeGrain,
  type WorkbookSnapshot,
} from "../model/types.js";
import { looksLikeFormula } from "../formula/compile.js";
import {
  calendarCoveringYear,
  defaultYearColumn,
  evenSplit,
  hasTimeColumns,
  tableYearColumns,
  writePeriodIds,
} from "../model/yearColumns.js";
import {
  assertTableName,
  emptyCells,
  nextColumnIdentifier,
  nextRowIdentifier,
  requireTable,
  rewriteColumnName,
  rewriteFormulas,
  rewriteRowKey,
  rewriteTableName,
  uid,
  uniqueName,
} from "../model/structure.js";

export type SessionListener = () => void;

export type FormulaEditOrigin = { tableId: string; col: number; row: number };

export type { FormulaEditMode };

export interface FormulaEdit {
  tableId: string;
  rowId: string;
  columnId: string;
  draft: string;
  pointing: boolean;
  mode: FormulaEditMode;
  /** Edit cell: the cell whose formula is open. */
  editCell?: FormulaEditOrigin;
  /** Target cell: grid cell currently chosen for the active formula ref. */
  targetCell?: FormulaEditOrigin;
  /** First cell of a Point range (click-drag / Shift+Arrow). */
  rangeAnchor?: FormulaEditOrigin;
  /** Active formula ref in the formula text, or null when inserting a new one. */
  activeFormulaRef?: { start: number; end: number } | null;
  activeFormulaRefKey?: string | null;
  selectionStart?: number;
  selectionEnd?: number;
}

const HISTORY_LIMIT = 100;

function cloneSnapshot(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  return structuredClone(snapshot);
}

type EvalCache = { layout: ReturnType<typeof layoutWorkbook>; values: Record<string, SheetGrid> };

export class WorkbookSession {
  private snapshot: WorkbookSnapshot;
  private engine: FormulaEngine;
  private listeners = new Set<SessionListener>();
  private cache: EvalCache | null = null;
  private computing: Promise<void> | null = null;
  private generation = 0;
  private history: WorkbookSnapshot[] = [];
  private future: WorkbookSnapshot[] = [];
  private txDepth = 0;
  private txDirty = false;
  selection: Selection | null = null;
  formulaEdit: FormulaEdit | null = null;
  revealNonce = 0;
  gridFocus: { tableId: string; col: number; row: number } | null = null;

  constructor(snapshot: WorkbookSnapshot, engine: FormulaEngine = new UniverEngine()) {
    this.snapshot = cloneSnapshot(snapshot);
    this.engine = engine;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    if (this.txDepth > 0) {
      this.txDirty = true;
      return;
    }
    this.cache = null;
    void this.recalculate().then(() => {
      for (const listener of this.listeners) listener();
    });
    for (const listener of this.listeners) listener();
  }

  private checkpoint() {
    if (this.txDepth > 0) return;
    this.pushHistory(cloneSnapshot(this.snapshot));
  }

  private pushHistory(before: WorkbookSnapshot) {
    this.history.push(before);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.future.length = 0;
  }

  /** Runs `fn` as one undo step, restoring the snapshot if any part of it throws. */
  transact<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn();
    const before = cloneSnapshot(this.snapshot);
    this.txDepth++;
    this.txDirty = false;
    try {
      const result = fn();
      this.txDepth--;
      if (this.txDirty) {
        this.txDirty = false;
        this.pushHistory(before);
        this.emit();
      }
      return result;
    } catch (err) {
      this.txDepth--;
      const dirty = this.txDirty;
      this.txDirty = false;
      if (dirty) {
        this.snapshot = before;
        this.emit();
      }
      throw err;
    }
  }

  /** Runs a mutation that restacks bands, carrying loose cells along with them. */
  private restack<T>(fn: () => T): T {
    return this.transact(() => {
      const before = bandsBySheet(this.snapshot);
      const result = fn();
      const after = bandsBySheet(this.snapshot);
      for (const sheet of this.snapshot.sheets) {
        if (!sheet.looseCells) continue;
        const was = before.get(sheet.id) ?? [];
        const is = after.get(sheet.id) ?? [];
        const moved: Record<string, CellSnapshot> = {};
        for (const [key, cell] of Object.entries(sheet.looseCells)) {
          const { row, col } = parseLooseCellKey(key);
          moved[looseCellKey(restackedRow(was, is, row), col)] = cell;
        }
        sheet.looseCells = moved;
      }
      return result;
    });
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.future.push(cloneSnapshot(this.snapshot));
    this.snapshot = previous;
    this.selection = null;
    this.formulaEdit = null;
    this.emit();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.history.push(cloneSnapshot(this.snapshot));
    this.snapshot = next;
    this.selection = null;
    this.formulaEdit = null;
    this.emit();
    return true;
  }

  async recalculate(): Promise<void> {
    const generation = ++this.generation;
    const snapshot = cloneSnapshot(this.snapshot);
    this.computing = (async () => {
      const values = await Promise.resolve(this.engine.evaluate(snapshot));
      if (generation !== this.generation) return;
      this.cache = { layout: layoutWorkbook(snapshot), values };
    })();
    return this.computing;
  }

  getSnapshot(): WorkbookSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  toSnapshot(): WorkbookSnapshot {
    return this.getSnapshot();
  }

  loadSnapshot(snapshot: WorkbookSnapshot) {
    this.snapshot = cloneSnapshot(snapshot);
    this.history.length = 0;
    this.future.length = 0;
    this.selection = null;
    this.emit();
  }

  renameWorkbook(name: string) {
    this.checkpoint();
    this.snapshot.name = name.trim() || this.snapshot.name;
    this.emit();
  }

  setCalendar(calendar: WorkbookSnapshot["calendar"]) {
    this.checkpoint();
    this.snapshot.calendar = calendar;
    this.emit();
  }

  get activeScenarioId(): string | null {
    return this.snapshot.activeScenarioId;
  }

  activateScenario(id: string | null) {
    if (id !== null && !this.snapshot.scenarios.some((s) => s.id === id)) {
      throw new Error(`Unknown scenario "${id}"`);
    }
    this.checkpoint();
    this.snapshot.activeScenarioId = id;
    this.emit();
  }

  addScenario(name?: string) {
    const scenarioName = uniqueName(
      this.snapshot.scenarios.map((s) => s.name),
      name ?? "Scenario",
    );
    this.checkpoint();
    const scenario = { id: uid("scn"), name: scenarioName, overlays: {} as Record<string, Primitive> };
    this.snapshot.scenarios.push(scenario);
    this.emit();
    return scenario;
  }

  renameScenario(id: string, name: string) {
    const scenario = this.snapshot.scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario "${id}"`);
    const next = name.trim();
    if (!next) throw new Error("Scenario name cannot be empty.");
    if (this.snapshot.scenarios.some((s) => s.id !== id && s.name.toLowerCase() === next.toLowerCase())) {
      throw new Error(`Scenario name "${next}" is already used.`);
    }
    if (next === scenario.name) return;
    this.checkpoint();
    scenario.name = next;
    this.emit();
  }

  deleteScenario(id: string) {
    const scenario = this.snapshot.scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario "${id}"`);
    this.checkpoint();
    this.snapshot.scenarios = this.snapshot.scenarios.filter((s) => s.id !== id);
    if (this.snapshot.activeScenarioId === id) this.snapshot.activeScenarioId = null;
    this.emit();
  }

  duplicateScenario(id: string) {
    const scenario = this.snapshot.scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(`Unknown scenario "${id}"`);
    this.checkpoint();
    const copy = {
      id: uid("scn"),
      name: uniqueName(
        this.snapshot.scenarios.map((s) => s.name),
        scenario.name,
      ),
      overlays: { ...scenario.overlays },
    };
    this.snapshot.scenarios.push(copy);
    this.emit();
    return copy;
  }

  private evaluated() {
    if (!this.cache) {
      throw new Error("Workbook is not calculated yet. Await session.recalculate() first.");
    }
    return this.cache;
  }

  getTable(name: string, opts: { timeGrain?: TimeGrain } = {}): EvaluatedTable {
    const grain = opts.timeGrain ?? "month";
    const { layout, values } = this.evaluated();
    const tableLayout = layout.tablesByName.get(name.toLowerCase());
    if (!tableLayout) throw new Error(`Unknown table "${name}"`);

    const monthlyCols: EvaluatedColumn[] = tableLayout.columns
      .filter((c) => c.kind !== "key")
      .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind === "period" ? "period" : c.kind,
        periodIds: c.periodId ? [c.periodId] : [],
      }));

    const rows = tableLayout.table.rows.map((row) => {
      const cells: Record<string, EvaluatedCell> = {};
      for (const col of tableLayout.columns) {
        if (col.kind === "key") continue;
        const laid = tableLayout.rows.find((r) => r.id === row.id);
        const effective = effectiveCell(this.snapshot, tableLayout.table.id, row.id, col.id);
        let computed: Primitive = null;
        let error: string | undefined;
        if (laid) {
          const raw = readComputed(values, tableLayout.sheetName, laid.rowIndex, col.colIndex);
          if (typeof raw === "string" && raw.startsWith("#")) {
            error = raw;
            computed = raw;
          } else {
            computed = normalizeComputed(raw);
          }
        }
        cells[col.id] = {
          kind: effective.kind,
          formula: effective.formula,
          input: effective.kind === "input" ? (effective.value ?? null) : null,
          overlay: effective.overlay,
          computed,
          error,
        };
      }
      return { id: row.id, key: row.key, cells };
    });

    if (grain === "month" || !hasTimeColumns(tableLayout.table)) {
      return {
        id: tableLayout.table.id,
        name: tableLayout.table.name,
        yearColumns: tableYearColumns(tableLayout.table),
        timeGrain: "month",
        columns: monthlyCols,
        rows,
      };
    }

    return aggregateTime(tableLayout.table.id, tableLayout.table.name, rows, monthlyCols, layout.periods, grain);
  }

  getCell(tableName: string, rowKey: string, columnId: string): EvaluatedCell {
    const table = this.getTable(tableName);
    const row = table.rows.find((r) => r.key === rowKey || r.id === rowKey);
    if (!row) throw new Error(`Unknown row "${rowKey}"`);
    const byName = table.columns.find(
      (c) => c.id === columnId || c.name.toLowerCase() === columnId.toLowerCase(),
    );
    const found = byName ? row.cells[byName.id] : undefined;
    if (!found) throw new Error(`Unknown column "${columnId}"`);
    return found;
  }

  setInput(tableName: string, rowKey: string, columnId: string, value: Primitive) {
    if (typeof value === "string" && looksLikeFormula(value)) {
      this.setFormula(tableName, rowKey, columnId, value);
      return;
    }
    const { table, row, colId } = this.findCell(tableName, rowKey, columnId);
    const existing = row.cells[colId];
    if (existing?.kind === "formula") {
      throw new Error("Cannot overlay or replace a formula cell with an input. Change the formula instead.");
    }
    this.checkpoint();
    if (this.snapshot.activeScenarioId) {
      const scenario = this.snapshot.scenarios.find((s) => s.id === this.snapshot.activeScenarioId);
      if (!scenario) throw new Error("Active scenario missing");
      scenario.overlays[overlayKey(table.id, row.id, colId)] = value;
    } else {
      row.cells[colId] = retainCellMeta(existing, { kind: "input", value });
    }
    this.emit();
  }

  setFormula(tableName: string, rowKey: string, columnId: string, formula: string) {
    const { row, colId } = this.findCell(tableName, rowKey, columnId);
    const existing = row.cells[colId];
    this.checkpoint();
    row.cells[colId] = retainCellMeta(existing, {
      kind: "formula",
      formula: formula.trim().startsWith("=") ? formula.trim() : `=${formula.trim()}`,
    });
    this.emit();
  }

  writeCell(tableName: string, rowKey: string, columnId: string, raw: string) {
    const { table, row } = this.findCell(tableName, rowKey, columnId);
    const periods = buildPeriods(this.snapshot.calendar);
    const periodIds = writePeriodIds(table, columnId, periods);
    const formula = looksLikeFormula(raw);
    const parsed = formula ? raw : parsePrimitive(raw);
    if (formula) {
      this.checkpoint();
      const text = raw.trim().startsWith("=") ? raw.trim() : `=${raw.trim()}`;
      for (const id of periodIds) {
        row.cells[id] = retainCellMeta(row.cells[id], { kind: "formula", formula: text });
      }
      this.emit();
      return;
    }
    const existing = periodIds.map((id) => row.cells[id]).find((cell) => cell?.kind === "formula");
    if (existing?.kind === "formula" && this.snapshot.activeScenarioId) {
      throw new Error("Cannot overlay a formula cell. Switch to Base to change the formula.");
    }
    this.checkpoint();
    const values =
      periodIds.length > 1 && typeof parsed === "number" ? evenSplit(parsed, periodIds.length) : periodIds.map(() => parsed as Primitive);
    for (let i = 0; i < periodIds.length; i++) {
      const id = periodIds[i]!;
      const value = values[i]!;
      if (this.snapshot.activeScenarioId && row.cells[id]?.kind !== "formula") {
        const scenario = this.snapshot.scenarios.find((s) => s.id === this.snapshot.activeScenarioId);
        if (!scenario) throw new Error("Active scenario missing");
        scenario.overlays[overlayKey(table.id, row.id, id)] = value;
      } else {
        row.cells[id] = retainCellMeta(row.cells[id], { kind: "input", value });
      }
    }
    this.emit();
  }

  /**
   * Commits a raw edit addressed by grid position. Inside a table band it writes
   * the cell, header, or row key; directly next to one it grows the table and
   * writes in the same undo step; anywhere else it leaves a loose cell behind.
   */
  writeGridCell(sheetId: string, row: number, col: number, raw: string) {
    const periods = buildPeriods(this.snapshot.calendar);
    const view = layoutSheets(this.snapshot, periods).find((v) => v.sheetId === sheetId);
    if (!view) throw new Error(`Unknown sheet "${sheetId}"`);
    const hit = hitTest(view, this.snapshot, row, col, periods);
    if (hit.kind === "cell") {
      this.writeCell(hit.tableId, hit.rowId, hit.columnId, raw);
      return;
    }
    if (hit.kind === "key") {
      if (raw.trim()) this.renameRow(hit.tableId, hit.rowId, raw);
      return;
    }
    if (hit.kind === "header") {
      if (hit.columnId === KEY_COLUMN_ID) return;
      if (raw.trim()) this.renameColumn(hit.tableId, hit.columnId, raw);
      return;
    }
    const plan = raw.trim() ? planExpansion(view, this.snapshot, row, col, periods) : null;
    if (!plan) {
      this.setLooseCell(sheetId, row, col, raw);
      return;
    }
    this.transact(() => {
      // The table is about to cover this coordinate, so the loose value there is
      // absorbed rather than left behind under the new band.
      this.setLooseCell(sheetId, row, col, "");
      this.expandInto(plan, raw);
    });
  }

  private expandInto(plan: GridExpansion, raw: string) {
    const table = requireTable(this.snapshot, plan.tableId);
    if (plan.direction === "below") {
      const added = this.addRow(table.id);
      if (plan.columnId === KEY_COLUMN_ID) this.renameRow(table.id, added.id, raw);
      else this.writeCell(table.id, added.id, plan.columnId, raw);
      return;
    }
    const added = this.addColumn(table.id);
    if (plan.rowId === null) this.renameColumn(table.id, added.id, raw);
    else this.writeCell(table.id, plan.rowId, added.id, raw);
  }

  setLooseCell(sheetId: string, row: number, col: number, raw: string) {
    const sheet = this.snapshot.sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new Error(`Unknown sheet "${sheetId}"`);
    const key = looseCellKey(row, col);
    const value = parsePrimitive(raw);
    if (value === null && !sheet.looseCells?.[key]) return;
    this.checkpoint();
    if (value === null) {
      delete sheet.looseCells![key];
      if (!Object.keys(sheet.looseCells!).length) delete sheet.looseCells;
    } else {
      sheet.looseCells ??= {};
      sheet.looseCells[key] = { kind: "input", value };
    }
    this.emit();
  }

  setFormulaEditDraft(draft: string) {
    if (!this.formulaEdit) return;
    if (this.formulaEdit.draft === draft) return;
    this.syncFormulaEditCursor(draft, draft.length, draft.length);
  }

  syncFormulaEditCursor(draft: string | undefined, selectionStart: number, selectionEnd: number) {
    if (!this.formulaEdit) return;
    const text = draft ?? this.formulaEdit.draft;
    const span = cursorFormulaRef(text, selectionStart, selectionEnd);
    const key = activeFormulaRefKey(span, text);
    const keyChanged = key !== this.formulaEdit.activeFormulaRefKey;
    const draftChanged = text !== this.formulaEdit.draft;
    const inserting = keyChanged && !span && isValidInsertPoint(text, selectionStart);
    if (
      !draftChanged &&
      !keyChanged &&
      this.formulaEdit.selectionStart === selectionStart &&
      this.formulaEdit.selectionEnd === selectionEnd &&
      this.formulaEdit.activeFormulaRef?.start === span?.start &&
      this.formulaEdit.activeFormulaRef?.end === span?.end
    ) {
      return;
    }
    this.formulaEdit = {
      ...this.formulaEdit,
      draft: text,
      pointing: true,
      activeFormulaRef: span,
      selectionStart,
      selectionEnd,
      activeFormulaRefKey: key,
      targetCell: inserting ? this.formulaEdit.editCell : this.formulaEdit.targetCell,
      rangeAnchor: inserting ? undefined : this.formulaEdit.rangeAnchor,
    };
    if (draftChanged || keyChanged) {
      for (const listener of this.listeners) listener();
    }
  }

  insertFormulaRef(text: string) {
    this.pointFormulaRef(text);
  }

  pointFormulaRef(ref: string, targetCell?: FormulaEditOrigin, options?: { keepAnchor?: boolean }) {
    if (!this.formulaEdit) return;
    const start = this.formulaEdit.selectionStart ?? this.formulaEdit.draft.length;
    const end = this.formulaEdit.selectionEnd ?? start;
    const replace = pointingReplaceSpan(this.formulaEdit.draft, start, end);
    const applied = applyPointedRef(
      this.formulaEdit.draft,
      this.formulaEdit.activeFormulaRef ?? (start === end ? null : replace),
      ref,
      start,
    );
    this.formulaEdit = {
      ...this.formulaEdit,
      draft: applied.draft,
      pointing: true,
      mode: "point",
      activeFormulaRef: applied.span,
      selectionStart: applied.span.start,
      selectionEnd: applied.span.end,
      activeFormulaRefKey: activeFormulaRefKey(applied.span, applied.draft),
      targetCell: targetCell ?? this.formulaEdit.targetCell,
      rangeAnchor: options?.keepAnchor
        ? (this.formulaEdit.rangeAnchor ?? targetCell ?? this.formulaEdit.targetCell)
        : (targetCell ?? this.formulaEdit.targetCell),
    };
    for (const listener of this.listeners) listener();
  }

  beginFormulaEdit(
    tableId: string,
    rowId: string,
    columnId: string,
    draft: string,
    options?: { pointing?: boolean; editCell?: FormulaEditOrigin; mode?: FormulaEditMode },
  ) {
    const pointing = options?.pointing ?? draft.trim().startsWith("=");
    const mode = options?.mode ?? "enter";
    const current = this.formulaEdit;
    if (
      current &&
      current.tableId === tableId &&
      current.rowId === rowId &&
      current.columnId === columnId &&
      current.draft === draft &&
      current.pointing === pointing
    ) {
      const next = {
        ...current,
        editCell: options?.editCell ?? current.editCell,
        mode: options?.mode ?? current.mode,
      };
      if (next.editCell !== current.editCell || next.mode !== current.mode) {
        this.formulaEdit = next;
      }
      return;
    }
    const sameCell =
      current?.tableId === tableId && current.rowId === rowId && current.columnId === columnId;
    this.formulaEdit = {
      tableId,
      rowId,
      columnId,
      draft,
      pointing,
      mode: sameCell ? (options?.mode ?? current?.mode ?? mode) : mode,
      activeFormulaRef: null,
      editCell: options?.editCell ?? (sameCell ? current.editCell : undefined),
      rangeAnchor: sameCell ? current?.rangeAnchor : undefined,
    };
    for (const listener of this.listeners) listener();
  }

  setFormulaEditMode(mode: FormulaEditMode) {
    if (!this.formulaEdit || this.formulaEdit.mode === mode) return;
    this.formulaEdit = {
      ...this.formulaEdit,
      mode,
    };
    for (const listener of this.listeners) listener();
  }

  commitFormulaEdit() {
    const edit = this.formulaEdit;
    if (!edit) return;
    const table = this.snapshot.tables.find((t) => t.id === edit.tableId);
    const row = table?.rows.find((r) => r.id === edit.rowId);
    if (table && row) this.writeCell(table.name, row.key, edit.columnId, edit.draft);
    this.formulaEdit = null;
  }

  cancelFormulaEdit() {
    this.formulaEdit = null;
    for (const listener of this.listeners) listener();
  }

  setSelection(selection: Selection | null) {
    if (JSON.stringify(this.selection) === JSON.stringify(selection)) return;
    this.selection = selection;
    for (const listener of this.listeners) listener();
  }

  setGridFocus(focus: { tableId: string; col: number; row: number } | null) {
    this.gridFocus = focus;
    for (const listener of this.listeners) listener();
  }

  revealTable(tableId: string) {
    this.selection = { kind: "table", tableId };
    this.revealNonce += 1;
    for (const listener of this.listeners) listener();
  }

  renameTable(tableIdOrName: string, name: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const next = assertTableName(name, this.snapshot, table.id);
    assertGlobalName(this.snapshot, next, { tableId: table.id });
    if (next === table.name) return;
    this.checkpoint();
    const previous = table.name;
    table.name = next;
    rewriteFormulas(this.snapshot, (formula) => rewriteTableName(formula, previous, next));
    this.emit();
  }

  renameRow(tableIdOrName: string, rowIdOrKey: string, key: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const row = table.rows.find((r) => r.id === rowIdOrKey || r.key === rowIdOrKey);
    if (!row) throw new Error(`Unknown row "${rowIdOrKey}"`);
    const next = table.promoteRowKeys
      ? assertGlobalName(this.snapshot, key, { rowId: row.id, tableId: table.id })
      : key.trim();
    if (!next) throw new Error("Row key cannot be empty.");
    if (table.rows.some((r) => r.id !== row.id && r.key.toLowerCase() === next.toLowerCase())) {
      throw new Error(`Row key "${next}" is already used.`);
    }
    this.checkpoint();
    const previous = row.key;
    row.key = next;
    rewriteFormulas(this.snapshot, (formula) => rewriteRowKey(formula, table.name, previous, next));
    this.emit();
  }

  renameColumn(tableIdOrName: string, columnIdOrName: string, name: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const col = table.attributeColumns.find((c) => c.id === columnIdOrName || c.name === columnIdOrName);
    if (!col) throw new Error("Only attribute columns can be renamed.");
    if (table.promoteRowKeys && table.attributeColumns[0]?.id === col.id) {
      throw new Error("The promoted Value column cannot be renamed.");
    }
    const next = name.trim();
    if (!next) throw new Error("Column name cannot be empty.");
    if (table.attributeColumns.some((c) => c.id !== col.id && c.name.toLowerCase() === next.toLowerCase())) {
      throw new Error(`Column name "${next}" is already used.`);
    }
    this.checkpoint();
    const previous = col.name;
    col.name = next;
    rewriteFormulas(this.snapshot, (formula) => rewriteColumnName(formula, previous, next));
    this.emit();
  }

  addRow(tableIdOrName: string, afterRowId?: string | null, opts?: { before?: boolean }) {
    return this.restack(() => {
      const table = requireTable(this.snapshot, tableIdOrName);
      const key = table.promoteRowKeys
        ? nextPromotableKey(this.snapshot)
        : nextRowIdentifier(table.rows.map((r) => r.key));
      this.checkpoint();
      const row = { id: uid("row"), key, cells: emptyCells(table) };
      const index = afterRowId ? table.rows.findIndex((r) => r.id === afterRowId || r.key === afterRowId) : -1;
      if (index >= 0) table.rows.splice(opts?.before ? index : index + 1, 0, row);
      else table.rows.push(row);
      this.selection = { kind: "cell", tableId: table.id, rowId: row.id, columnId: table.attributeColumns[0]?.id ?? KEY_COLUMN_ID };
      this.emit();
      return row;
    });
  }

  deleteRow(tableIdOrName: string, rowIdOrKey: string) {
    this.restack(() => {
      const table = requireTable(this.snapshot, tableIdOrName);
      if (table.rows.length <= 1) throw new Error("A table must keep at least one row.");
      const index = table.rows.findIndex((r) => r.id === rowIdOrKey || r.key === rowIdOrKey);
      if (index < 0) throw new Error(`Unknown row "${rowIdOrKey}"`);
      this.checkpoint();
      const [removed] = table.rows.splice(index, 1);
      for (const scenario of this.snapshot.scenarios) {
        for (const key of Object.keys(scenario.overlays)) {
          if (key.startsWith(`${table.id}\u001f${removed.id}\u001f`)) delete scenario.overlays[key];
        }
      }
      if (this.selection && "rowId" in this.selection && this.selection.rowId === removed.id) this.selection = null;
      this.emit();
    });
  }

  addColumn(tableIdOrName: string, afterColumnId?: string | null, opts?: { before?: boolean }) {
    const table = requireTable(this.snapshot, tableIdOrName);
    if (table.promoteRowKeys) {
      throw new Error("A promoteRowKeys table cannot gain extra columns.");
    }
    const name = nextColumnIdentifier(table.attributeColumns.map((c) => c.name));
    this.checkpoint();
    const col = { id: uid("col"), name };
    const index = afterColumnId
      ? table.attributeColumns.findIndex((c) => c.id === afterColumnId || c.name === afterColumnId)
      : -1;
    if (index >= 0) table.attributeColumns.splice(opts?.before ? index : index + 1, 0, col);
    else table.attributeColumns.push(col);
    for (const row of table.rows) {
      row.cells[col.id] = { kind: "input", value: null };
    }
    this.emit();
    return col;
  }

  deleteColumn(tableIdOrName: string, columnIdOrName: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const index = table.attributeColumns.findIndex((c) => c.id === columnIdOrName || c.name === columnIdOrName);
    if (index < 0) throw new Error("Only attribute columns can be deleted (period columns come from the calendar).");
    const target = table.attributeColumns[index];
    if (table.promoteRowKeys && table.attributeColumns[0]?.id === target.id) {
      throw new Error("The promoted Value column cannot be deleted.");
    }
    this.checkpoint();
    const [removed] = table.attributeColumns.splice(index, 1);
    for (const row of table.rows) delete row.cells[removed.id];
    for (const scenario of this.snapshot.scenarios) {
      for (const key of Object.keys(scenario.overlays)) {
        if (key.endsWith(`\u001f${removed.id}`)) delete scenario.overlays[key];
      }
    }
    if (this.selection && "columnId" in this.selection && this.selection.columnId === removed.id) {
      this.selection = null;
    }
    this.emit();
  }

  addYearColumn(tableIdOrName: string, year?: number, grain: TimeGrain = "month") {
    const table = requireTable(this.snapshot, tableIdOrName);
    if (table.promoteRowKeys) {
      throw new Error("A promoteRowKeys table cannot have a year column.");
    }
    const existing = tableYearColumns(table);
    const startYear = Number(this.snapshot.calendar.startMonth.slice(0, 4));
    const nextYear = year ?? (existing.length ? Math.max(...existing.map((col) => col.year)) + 1 : startYear);
    if (existing.some((col) => col.year === nextYear)) {
      throw new Error(`Year ${nextYear} is already on this table.`);
    }
    this.checkpoint();
    this.snapshot.calendar = calendarCoveringYear(this.snapshot.calendar, nextYear);
    table.yearColumns = [...existing, defaultYearColumn(nextYear, grain)];
    this.emit();
    return table.yearColumns[table.yearColumns.length - 1]!;
  }

  removeYearColumn(tableIdOrName: string, yearColumnId: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const existing = tableYearColumns(table);
    if (!existing.some((col) => col.id === yearColumnId)) {
      throw new Error(`Unknown year column "${yearColumnId}"`);
    }
    this.checkpoint();
    table.yearColumns = existing.filter((col) => col.id !== yearColumnId);
    this.emit();
  }

  clearYearColumns(tableIdOrName: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    if (!tableYearColumns(table).length) return;
    this.checkpoint();
    table.yearColumns = [];
    this.emit();
  }

  setYearColumnGrain(tableIdOrName: string, yearColumnId: string, grain: TimeGrain) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const yearCol = tableYearColumns(table).find((col) => col.id === yearColumnId);
    if (!yearCol) throw new Error(`Unknown year column "${yearColumnId}"`);
    if (yearCol.grain === grain) return;
    this.checkpoint();
    yearCol.grain = grain;
    this.emit();
  }

  setPromoteRowKeys(tableIdOrName: string, enabled: boolean) {
    const table = requireTable(this.snapshot, tableIdOrName);
    if (enabled) {
      if (!canPromoteRowKeys(table)) {
        throw new Error("promoteRowKeys requires row keys and exactly one data column with no year columns.");
      }
      for (const row of table.rows) {
        assertGlobalName(this.snapshot, row.key, { rowId: row.id, tableId: table.id });
      }
    }
    this.checkpoint();
    table.promoteRowKeys = enabled;
    this.emit();
  }

  addSheet(name?: string) {
    const sheetName = uniqueName(
      this.snapshot.sheets.map((s) => s.name),
      name ?? "Sheet",
    );
    assertGlobalName(this.snapshot, sheetName);
    this.checkpoint();
    const sheet = { id: uid("sheet"), name: sheetName, tableIds: [] as string[] };
    this.snapshot.sheets.push(sheet);
    this.emit();
    return sheet;
  }

  addTable(sheetId: string, opts: { name?: string; yearColumns?: boolean } = {}) {
    return this.restack(() => {
      const sheet = this.snapshot.sheets.find((s) => s.id === sheetId);
      if (!sheet) throw new Error(`Unknown sheet "${sheetId}"`);
      const name = assertTableName(
        opts.name ?? uniqueName(
          this.snapshot.tables.map((t) => t.name),
          "Table",
        ),
        this.snapshot,
      );
      assertGlobalName(this.snapshot, name);
      this.checkpoint();
      const valueCol = { id: uid("col"), name: "A" };
      const table: TableSnapshot = {
        id: uid("tbl"),
        name,
        yearColumns: opts.yearColumns ? [defaultYearColumn(Number(this.snapshot.calendar.startMonth.slice(0, 4)))] : [],
        attributeColumns: [valueCol],
        rows: [{ id: uid("row"), key: "1", cells: { [valueCol.id]: { kind: "input", value: null } } }],
      };
      this.snapshot.tables.push(table);
      sheet.tableIds.push(table.id);
      this.emit();
      return table;
    });
  }

  deleteTable(tableIdOrName: string) {
    this.restack(() => {
      const table = requireTable(this.snapshot, tableIdOrName);
      if (table.locked) throw new Error("The table cannot be deleted.");
      this.checkpoint();
      this.snapshot.tables = this.snapshot.tables.filter((t) => t.id !== table.id);
      for (const sheet of this.snapshot.sheets) {
        sheet.tableIds = sheet.tableIds.filter((id) => id !== table.id);
      }
      if (this.selection && "tableId" in this.selection && this.selection.tableId === table.id) {
        this.selection = null;
      }
      this.emit();
    });
  }

  deleteSheet(sheetId: string) {
    const sheet = this.snapshot.sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new Error(`Unknown sheet "${sheetId}"`);
    if (sheet.locked) throw new Error("The sheet cannot be deleted.");
    if (sheet.tableIds.length) throw new Error("Remove tables from the sheet first.");
    this.checkpoint();
    this.snapshot.sheets = this.snapshot.sheets.filter((s) => s.id !== sheet.id);
    this.emit();
  }

  setSheetHorizontalScroll(sheetId: string, mode: SheetHorizontalScroll) {
    const sheet = this.snapshot.sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new Error(`Unknown sheet "${sheetId}"`);
    const next = mode === "sheet" ? "sheet" : undefined;
    if (sheet.horizontalScroll === next) return;
    this.checkpoint();
    if (next) sheet.horizontalScroll = next;
    else delete sheet.horizontalScroll;
    this.emit();
  }

  renameSheet(sheetId: string, name: string) {
    const sheet = this.snapshot.sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new Error(`Unknown sheet "${sheetId}"`);
    const next = assertGlobalName(this.snapshot, name, { sheetId: sheet.id });
    if (next === sheet.name) return;
    this.checkpoint();
    sheet.name = next;
    this.emit();
  }

  setColumnFormat(tableIdOrName: string, columnId: string, pattern: string) {
    const table = requireTable(this.snapshot, tableIdOrName);
    const next = pattern.trim();
    this.checkpoint();
    const attr = table.attributeColumns.find((c) => c.id === columnId || c.name === columnId);
    if (attr) {
      if (next) attr.format = next;
      else delete attr.format;
    } else {
      table.columnFormats ??= {};
      const ids = writePeriodIds(table, columnId, buildPeriods(this.snapshot.calendar));
      for (const id of ids) {
        if (next) table.columnFormats[id] = next;
        else delete table.columnFormats[id];
      }
    }
    this.emit();
  }

  setCellFormat(tableIdOrName: string, rowIdOrKey: string, columnId: string, pattern: string) {
    const { table, row } = this.findCell(tableIdOrName, rowIdOrKey, columnId);
    const next = pattern.trim();
    const ids = writePeriodIds(table, columnId, buildPeriods(this.snapshot.calendar));
    this.checkpoint();
    for (const id of ids) {
      const cell = row.cells[id] ?? { kind: "input" as const, value: null };
      if (next) cell.format = next;
      else delete cell.format;
      row.cells[id] = cell;
    }
    this.emit();
  }

  setColumnStyle(tableIdOrName: string, columnId: string, patch: CellStyle) {
    const table = requireTable(this.snapshot, tableIdOrName);
    this.checkpoint();
    const attr = table.attributeColumns.find((c) => c.id === columnId || c.name === columnId);
    if (attr) attr.style = mergeStyle(attr.style, patch);
    else {
      table.columnStyles ??= {};
      const ids = writePeriodIds(table, columnId, buildPeriods(this.snapshot.calendar));
      for (const id of ids) {
        const next = mergeStyle(table.columnStyles[id], patch);
        if (next) table.columnStyles[id] = next;
        else delete table.columnStyles[id];
      }
    }
    this.emit();
  }

  setCellStyle(tableIdOrName: string, rowIdOrKey: string, columnId: string, patch: CellStyle) {
    const { table, row } = this.findCell(tableIdOrName, rowIdOrKey, columnId);
    const ids = writePeriodIds(table, columnId, buildPeriods(this.snapshot.calendar));
    this.checkpoint();
    for (const id of ids) {
      const cell = row.cells[id] ?? { kind: "input" as const, value: null };
      const next = mergeStyle(cell.style, patch);
      if (next) cell.style = next;
      else delete cell.style;
      row.cells[id] = cell;
    }
    this.emit();
  }

  private findCell(tableName: string, rowKey: string, columnId: string) {
    const table = this.snapshot.tables.find(
      (t) => t.name.toLowerCase() === tableName.toLowerCase() || t.id === tableName,
    );
    if (!table) throw new Error(`Unknown table "${tableName}"`);
    const row = table.rows.find((r) => r.key === rowKey || r.id === rowKey);
    if (!row) throw new Error(`Unknown row "${rowKey}"`);
    const layout = layoutWorkbook(this.snapshot).tables.get(table.id);
    const col =
      layout?.columns.find(
        (c) =>
          c.id === columnId ||
          c.name.toLowerCase() === columnId.toLowerCase() ||
          c.periodId === columnId,
      ) ?? table.attributeColumns.find((c) => c.id === columnId || c.name === columnId);
    const colId = col && "id" in col ? col.id : columnId;
    return { table, row, colId };
  }
}

function bandsBySheet(snapshot: WorkbookSnapshot): Map<string, TableBand[]> {
  return new Map(layoutSheets(snapshot).map((view) => [view.sheetId, view.bands] as const));
}

function parsePrimitive(raw: string): Primitive {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (t !== "" && Number.isFinite(n) && /^-?\d/.test(t)) return n;
  return raw;
}

function normalizeComputed(raw: Primitive): Primitive {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "object") {
    const message = String(raw);
    return message;
  }
  return raw;
}

function aggregateTime(
  id: string,
  name: string,
  rows: EvaluatedTable["rows"],
  columns: EvaluatedColumn[],
  periods: { id: string; year: number; month: number }[],
  grain: "quarter" | "year",
): EvaluatedTable {
  const attributes = columns.filter((c) => c.kind === "attribute");
  const buckets = new Map<string, EvaluatedColumn>();
  for (const period of periods) {
    const bid = grain === "quarter" ? quarterId(period as never) : yearId(period as never);
    const existing = buckets.get(bid);
    const periodCol = columns.find((c) => c.id === period.id);
    if (!periodCol) continue;
    if (!existing) {
      buckets.set(bid, {
        id: bid,
        name: bid,
        kind: grain,
        periodIds: [period.id],
      });
    } else {
      existing.periodIds.push(period.id);
    }
  }
  const timeCols = [...buckets.values()];
  const nextRows = rows.map((row) => {
    const cells: Record<string, EvaluatedCell> = {};
    for (const col of attributes) {
      cells[col.id] = row.cells[col.id];
    }
    for (const col of timeCols) {
      let sum = 0;
      let saw = false;
      let error: string | undefined;
      for (const pid of col.periodIds) {
        const cell = row.cells[pid];
        if (!cell) continue;
        if (cell.error) error = cell.error;
        if (typeof cell.computed === "number") {
          sum += cell.computed;
          saw = true;
        }
      }
      cells[col.id] = {
        kind: "formula",
        input: null,
        overlay: false,
        computed: error ? error : saw ? sum : null,
        error,
      };
    }
    return { ...row, cells };
  });
  return {
    id,
    name,
    yearColumns: [],
    timeGrain: grain,
    columns: [...attributes, ...timeCols],
    rows: nextRows,
  };
}

function retainCellMeta(existing: CellSnapshot | undefined, next: CellSnapshot): CellSnapshot {
  if (existing?.format) next.format = existing.format;
  if (existing?.style && Object.keys(existing.style).length) next.style = existing.style;
  return next;
}

function mergeStyle(base: CellStyle | undefined, patch: CellStyle): CellStyle | undefined {
  const next: CellStyle = { ...base };
  for (const key of ["bold", "italic", "strikethrough", "textColor", "fillColor", "fontSize"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined || value === false || value === "") delete next[key];
    else Object.assign(next, { [key]: value });
  }
  return Object.keys(next).length ? next : undefined;
}
