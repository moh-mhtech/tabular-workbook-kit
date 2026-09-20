import { describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { projectSheet, projectTable } from "../grid/sheetProjection.js";
import {
  applyCustomGridClear,
  applyCustomGridEdits,
  applyCustomGridFill,
  rawGridValue,
} from "./customGridInteractions.js";

const inert = { evaluate: () => ({}) };

describe("custom grid interactions", () => {
  it("converts editor values to session input", () => {
    expect(rawGridValue({ data: 42 })).toBe("42");
    expect(rawGridValue({ data: false })).toBe("false");
    expect(rawGridValue({ data: null })).toBe("");
  });

  it("commits a pasted range as one undo step", () => {
    const before = createPlaygroundWorkbook();
    const session = new WorkbookSession(before, inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [1, 1], value: { data: "10" } },
      { location: [1, 2], value: { data: "=1+2" } },
    ])).toBe(2);

    const params = session.getSnapshot().tables.find((table) => table.id === "tbl-params")!;
    expect(params.rows[0].cells.Value).toEqual({ kind: "input", value: 10 });
    expect(params.rows[1].cells.Value).toEqual({ kind: "formula", formula: "=1+2" });
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot()).toEqual(before);
  });

  it("ignores edits outside a table growth margin", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [2, 1], value: { data: "loose" } },
      { location: [2, 8], value: { data: "corner" } },
    ])).toBe(0);
    expect(session.getSnapshot().sheets[0].looseCells).toBeUndefined();
  });

  it("clears a range as one undo step", () => {
    const before = createPlaygroundWorkbook();
    const session = new WorkbookSession(before, inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;

    expect(applyCustomGridClear(session, projection, layout, { x: 1, y: 1, width: 1, height: 1 })).toBe(1);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[0].cells.Value).toEqual({
      kind: "input",
      value: null,
    });
    expect(session.undo()).toBe(true);
    expect(session.getSnapshot()).toEqual(before);
  });

  it("renames a table identifier through the table viewport", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-staff")!;

    expect(applyCustomGridEdits(session, projection, layout, [
      { location: [0, 1], value: { data: "CamLead" } },
      { location: [1, 0], value: { data: "Position" } },
    ])).toBe(2);

    const staff = session.getSnapshot().tables.find((table) => table.id === "tbl-staff")!;
    expect(staff.rows[0].key).toBe("CamLead");
    expect(staff.attributeColumns[0].name).toBe("Position");
  });

  it("fills downward by repeating the source cell", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectSheet(layout, "sheet-params")!;
    applyCustomGridEdits(session, projection, layout, [{ location: [1, 1], value: { data: "42" } }]);

    expect(
      applyCustomGridFill(
        session,
        projection,
        layout,
        { x: 1, y: 1, width: 1, height: 1 },
        { x: 1, y: 2, width: 1, height: 1 },
      ),
    ).toBe(1);
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[1].cells.Value).toEqual({
      kind: "input",
      value: 42,
    });
  });
});

