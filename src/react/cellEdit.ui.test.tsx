/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import {
  commitLiteralEditAndSelect,
  pointAtProjectedCell,
} from "./customGridOverlay.js";
import { formulaBar, installGridDom, renderPlaygroundCanvas } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function selectVat(session: Awaited<ReturnType<typeof renderPlaygroundCanvas>>["session"]) {
  return act(async () => {
    session.setSelection({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-vat",
      columnId: "Value",
    });
  });
}

describe("Excel-like cell edit UI", () => {
  it("does not show autocomplete after =, and names complete after a letter", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=" } });
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=V" } });
    });
    expect(screen.getByRole("option", { name: /Vat/ }).textContent).toContain("Vat");
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=Sa" } });
    });
    expect(screen.getByRole("option", { name: /Salg/ }).textContent).toContain("Salg");
  });

  it("inserts a name without parentheses and a function with them", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=V" } });
    });
    const vatOption = screen.getByRole("option", { name: /Vat/ });
    await act(async () => {
      fireEvent.mouseDown(vatOption);
    });
    expect(bar.value).toBe("=Vat");
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=Su" } });
      fireEvent.keyDown(formulaBar()!, { key: "Enter" });
    });
    expect(formulaBar()!.value).toBe("=SUM(");
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value).toEqual({ kind: "input", value: 0.25 });
  });

  it("commits a literal from the formula bar when another cell is clicked", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "12" } });
    });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      commitLiteralEditAndSelect(session, projection, layout, 1, 4);
    });
    expect(session.formulaEdit).toBeNull();
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 12,
    });
    expect(session.selection).toMatchObject({ tableId: "tbl-params", rowId: "row-andel-cnc" });
  });

  it("inserts a pointed ref from the formula bar without leaving Value", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=" } });
      fireEvent.focus(bar);
    });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      pointAtProjectedCell(session, projection, layout, 1, 4);
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    expect(session.formulaEdit?.mode).toBe("point");
    expect(formulaBar()!.value).toBe("=AndelCNC");
  });

  it("starts Edit in Value on F2", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    await act(async () => {
      fireEvent.keyDown(window, { key: "F2" });
    });
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(formulaBar()).toBeTruthy();
  });

  it("drag-extends a pointed range from the formula bar", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    await act(async () => {
      fireEvent.change(formulaBar()!, { target: { value: "=" } });
    });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    await act(async () => {
      pointAtProjectedCell(session, projection, layout, 1, 3);
      pointAtProjectedCell(session, projection, layout, 1, 4, { extend: true });
    });
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC");
    expect(formulaBar()!.value).toBe("=Vat:AndelCNC");
  });
});
