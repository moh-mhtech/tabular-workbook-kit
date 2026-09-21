import { describe, expect, it } from "vitest";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { applyStrikethrough, CLEARED_CELL_STYLE, resolveCellStyle, styleFont, toggleStyleFlag } from "./cellStyle.js";

const inert = { evaluate: () => ({}) };

describe("cell style", () => {
  it("prefers a cell style over the column default", () => {
    const table = createPlaygroundWorkbook().tables[0]!;
    table.attributeColumns[0]!.style = { bold: true, textColor: "#111" };
    table.rows[2]!.cells.Value!.style = { italic: true };
    expect(resolveCellStyle(table, "Value", table.rows[2]!.cells.Value)).toEqual({
      bold: true,
      textColor: "#111",
      italic: true,
    });
  });

  it("toggles flags and strikes through display text", () => {
    expect(toggleStyleFlag(undefined, "bold")).toEqual({ bold: true });
    expect(toggleStyleFlag({ bold: true }, "bold")).toEqual({});
    expect(applyStrikethrough("Vat", { strikethrough: true })).toContain("\u0336");
    expect(styleFont({ bold: true })).toBe("bold 13px");
    expect(styleFont({ italic: true, fontSize: 16 })).toBe("italic 16px");
    expect(styleFont({ fillColor: "#fff" })).toBeUndefined();
  });

  it("clears every style key so a cell falls back to the column default", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    session.setCellStyle("tbl-params", "row-vat", "Value", {
      bold: true,
      italic: true,
      fontSize: 20,
      fillColor: "#fff6d6",
      textColor: "#112233",
    });
    session.setCellStyle("tbl-params", "row-vat", "Value", CLEARED_CELL_STYLE);
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style).toBeUndefined();
  });

  it("stores cell and column styles on the session", () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
    session.setColumnStyle("tbl-params", "Value", { bold: true });
    session.setCellStyle("tbl-params", "row-vat", "Value", { italic: true, bold: false });
    const table = session.getSnapshot().tables[0]!;
    expect(table.attributeColumns[0]!.style).toEqual({ bold: true });
    expect(table.rows[2]!.cells.Value!.style).toEqual({ italic: true });
  });
});
