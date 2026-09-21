import { overlayKey, type Primitive, type WorkbookSnapshot } from "../model/types.js";

export function effectiveCell(
  snapshot: WorkbookSnapshot,
  tableId: string,
  rowId: string,
  columnId: string,
): { kind: "input" | "formula"; value?: Primitive; formula?: string; overlay: boolean } {
  const table = snapshot.tables.find((t) => t.id === tableId);
  const row = table?.rows.find((r) => r.id === rowId);
  const base = row?.cells[columnId];
  if (base?.kind === "formula") {
    return { kind: "formula", formula: base.formula, overlay: false };
  }
  const scenario = snapshot.scenarios.find((s) => s.id === snapshot.activeScenarioId);
  const key = overlayKey(tableId, rowId, columnId);
  if (scenario && Object.prototype.hasOwnProperty.call(scenario.overlays, key)) {
    return { kind: "input", value: scenario.overlays[key], overlay: true };
  }
  return { kind: "input", value: base?.value ?? null, overlay: false };
}

export function readComputed(
  values: Record<string, (number | string | boolean | null)[][]>,
  sheetName: string,
  rowIndex: number,
  colIndex: number,
): Primitive {
  const raw: unknown = values[sheetName]?.[rowIndex]?.[colIndex];
  if (raw === undefined || raw === "") return null;
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) return raw;
  if (typeof raw === "object" && raw !== null) {
    const message = String(raw);
    return message.startsWith("#") ? message : String(raw);
  }
  if (typeof raw === "string" && raw.startsWith("#")) return raw;
  return raw as Primitive;
}
