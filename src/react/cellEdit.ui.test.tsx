/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitProjectedColumnWidths, fitProjectedRowHeights } from "../grid/columnFit.js";
import { projectTable } from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { evaluatedCells } from "./CustomSheetCanvas.js";
import {
  blurFormulaBar,
  clickFormulaText,
  clickProjectedCell,
  dragProjectedCell,
  formulaBar,
  installGridDom,
  pressCaretKey,
  renderPlaygroundCanvas,
  selectProjectedCell,
  typeEqualsOnProjectedCell,
} from "./playgroundCanvasTest.js";

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
    await clickProjectedCell(session, "tbl-params", 1, 4);
    await blurFormulaBar();
    expect(session.formulaEdit).toBeNull();
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2]!.cells.Value).toEqual({
      kind: "input",
      value: 12,
    });
    expect(session.selection).toMatchObject({ tableId: "tbl-params", rowId: "row-andel-cnc" });
  });

  it("inserts a pointed ref from a grid click without leaving Value", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=" } });
      fireEvent.focus(bar);
    });
    await clickProjectedCell(session, "tbl-params", 1, 4);
    await blurFormulaBar();
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    expect(session.formulaEdit?.mode).toBe("point");
    expect(formulaBar()!.value).toBe("=AndelCNC");
  });

  it("points a Defined name with non-Latin letters like Vat", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=" } });
      fireEvent.focus(bar);
    });
    await clickProjectedCell(session, "tbl-params", 1, 1);
    await blurFormulaBar();
    expect(session.formulaEdit?.draft).toBe("=Årssalg");
    expect(session.formulaEdit?.mode).toBe("point");
    expect(formulaBar()!.value).toBe("=Årssalg");
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

  it("drag-extends a pointed range from a grid click-drag", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    await act(async () => {
      fireEvent.change(formulaBar()!, { target: { value: "=" } });
    });
    await clickProjectedCell(session, "tbl-params", 1, 3);
    await dragProjectedCell(session, "tbl-params", 1, 4);
    await blurFormulaBar();
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC");
    expect(formulaBar()!.value).toBe("=Vat:AndelCNC");
  });

  it("anchors the Formula-edit popup on the edited cell at one line, not 120px", async () => {
    const { session } = await renderPlaygroundCanvas();
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor");
    expect(Number.parseFloat(editor!.style.height)).toBe(28);
    const box = document.querySelector("#portal .gdg-style, #portal .gdg-unstyle");
    expect(box, "popup box").toBeTruthy();
    const left = Number.parseFloat(box!.getAttribute("targetx") ?? box!.style.left);
    const top = Number.parseFloat(box!.getAttribute("targety") ?? box!.style.top);
    const snapshot = session.getSnapshot();
    const layout = layoutWorkbook(snapshot);
    const projection = projectTable(layout, "tbl-params")!;
    const widths = fitProjectedColumnWidths(projection, layout, evaluatedCells(session, snapshot));
    const heights = fitProjectedRowHeights(projection, layout);
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-table-id="tbl-params"] [data-testid="data-grid-canvas"]',
    )!;
    const rect = canvas.getBoundingClientRect();
    const logicalW = Number.parseFloat(canvas.style.width);
    const scale = rect.width / logicalW;
    expect(left).toBeCloseTo(widths[0]!.width * scale, -1);
    expect(top).toBeCloseTo((heights[0]! + heights[1]! + heights[2]!) * scale, -1);
    const host = document.querySelector<HTMLElement>(".wk-overlay-editor-host");
    expect(Number.parseFloat(host!.style.height)).toBe(28);
    expect(host!.classList.contains("is-popup")).toBe(true);
    expect(Number.parseFloat(host!.style.width)).toBe(110);
  });

  it("matches the Inline draft to the Edit cell size and padding", async () => {
    const { session } = await renderPlaygroundCanvas({ formulaEditPlacement: "inline" });
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const host = document.querySelector<HTMLElement>(".wk-overlay-editor-host")!;
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    const box = document.querySelector<HTMLElement>("#portal .gdg-style, #portal .gdg-unstyle");
    expect(Number.parseFloat(host.style.width)).toBe(110);
    expect(Number.parseFloat(host.style.height)).toBe(28);
    expect(Number.parseFloat(box!.style.width)).toBe(110);
    expect(Number.parseFloat(box!.style.height)).toBe(28);
    expect(box!.style.padding).toBe("0px");
    expect(editor.style.padding).toBe("3px 8px");
  });

  it("edits Inline in the Edit cell without a Popup", async () => {
    const { session } = await renderPlaygroundCanvas({ formulaEditPlacement: "inline" });
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const host = document.querySelector<HTMLElement>(".wk-overlay-editor-host");
    expect(host!.classList.contains("is-inline")).toBe(true);
    expect(host!.classList.contains("is-popup")).toBe(false);
    expect(Number.parseFloat(host!.style.height)).toBe(28);
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    await act(async () => {
      fireEvent.change(editor, { target: { value: `=${"X".repeat(80)}` } });
    });
    expect(Number.parseFloat(host!.style.height)).toBe(28);
    expect(editor.style.whiteSpace).toBe("nowrap");
    expect(editor.style.overflowX).toBe("auto");
    expect(editor.style.overflowY).toBe("hidden");
  });

  it("scrolls Inline Formula text with the Caret", async () => {
    const { session } = await renderPlaygroundCanvas({ formulaEditPlacement: "inline" });
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    const long = `=${"X".repeat(80)}`;
    await act(async () => {
      fireEvent.change(editor, { target: { value: long } });
      editor.setSelectionRange(long.length, long.length);
      fireEvent.select(editor);
    });
    expect(editor.clientWidth).toBe(110);
    expect(editor.scrollLeft).toBe(554);
  });

  it("does not select the pointed Formula ref in the Formula-edit popup", async () => {
    const { session } = await renderPlaygroundCanvas();
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    await act(async () => {
      fireEvent.keyDown(editor, { key: "ArrowDown" });
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    expect(editor.selectionStart).toBe(editor.selectionEnd);
    expect(editor.selectionStart).toBe("=AndelCNC".length);
  });

  it("moves the Caret after typing =, dragging a Formula range, then clicking Formula text", async () => {
    const { session } = await renderPlaygroundCanvas();
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const overlay = document.querySelector(".wk-overlay-editor");
    expect(overlay, "in-cell editor").toBeInstanceOf(HTMLTextAreaElement);

    await clickProjectedCell(session, "tbl-params", 1, 3);
    await dragProjectedCell(session, "tbl-params", 1, 4);
    expect(session.formulaEdit, "mouse Formula range must not Cancel").not.toBeNull();
    expect(session.formulaEdit?.mode).toBe("point");
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC");
    expect(document.querySelector(".wk-overlay-editor"), "in-cell editor must stay open while Pointing").toBe(overlay);

    const field = await clickFormulaText(4);
    expect(field.getAttribute("aria-label"), "click must land on the in-cell editor, not Value").toBe("Cell editor");
    expect(document.querySelector(".wk-overlay-editor")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(session.formulaEdit, "clicking Formula text must not Cancel").not.toBeNull();
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(field.value).toBe("=Vat:AndelCNC");
    expect(field.selectionStart).toBe(4);
    expect(field.selectionEnd).toBe(4);

    await pressCaretKey("ArrowLeft");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(3);
    expect(field.selectionEnd).toBe(3);
    expect(field.value).toBe("=Vat:AndelCNC");
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC");
  });

  it("moves the Caret after a Formula-text click then )", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    await act(async () => {
      fireEvent.keyDown(window, { key: "F2" });
      fireEvent.change(formulaBar()!, { target: { value: "=" } });
    });
    await clickProjectedCell(session, "tbl-params", 1, 3);
    await dragProjectedCell(session, "tbl-params", 1, 4);
    expect(formulaBar()!.value).toBe("=Vat:AndelCNC");
    expect(document.activeElement).toBe(formulaBar());
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.pointerDown(bar);
      bar.setSelectionRange(bar.value.length, bar.value.length);
      fireEvent.select(bar);
    });
    expect(session.formulaEdit?.mode).toBe("edit");
    await act(async () => {
      expect(fireEvent.keyDown(formulaBar()!, { key: ")", cancelable: true }), ") must stay in Edit mode").toBe(true);
      fireEvent.change(formulaBar()!, { target: { value: "=Vat:AndelCNC)" } });
    });
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(formulaBar()!.value).toBe("=Vat:AndelCNC)");
    expect(document.activeElement).toBe(formulaBar());
    const next = formulaBar()!;
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
    fireEvent.select(next);
    await pressCaretKey("ArrowLeft");
    await pressCaretKey("ArrowLeft");
    await act(async () => {
      session.setFormulaEditMode("point");
      session.setFormulaEditMode("edit");
    });
    expect(formulaBar()!.selectionStart).toBe("=Vat:AndelCNC)".length - 2);
    expect(document.activeElement).toBe(formulaBar());
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC)");
    expect(session.formulaEdit?.mode).toBe("edit");
  });

  it("keeps the Formula range on Vat:AndelCNC after typing )", async () => {
    const { session } = await renderPlaygroundCanvas();
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    await clickProjectedCell(session, "tbl-params", 1, 3);
    await dragProjectedCell(session, "tbl-params", 1, 4);
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC");
    expect(session.formulaEdit?.rangeAnchor).toEqual({ tableId: "tbl-params", col: 1, row: 3 });
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });

    const field = await clickFormulaText("=Vat:AndelCNC".length);
    await act(async () => {
      fireEvent.keyDown(field, { key: ")", cancelable: true });
      fireEvent.change(field, { target: { value: "=Vat:AndelCNC)" } });
    });
    expect(field.value).toBe("=Vat:AndelCNC)");
    expect(session.formulaEdit?.draft).toBe("=Vat:AndelCNC)");
    expect(session.formulaEdit?.rangeAnchor).toEqual({ tableId: "tbl-params", col: 1, row: 3 });
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });
  });

  it("colors Formula refs in the Formula bar and marks Vat on the grid", async () => {
    const { session } = await renderPlaygroundCanvas();
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=Vat+AndelCNC" } });
    });
    const vat = document.querySelectorAll('[data-formula-ref="Vat"]');
    const andel = document.querySelectorAll('[data-formula-ref="AndelCNC"]');
    expect(vat.length).toBeGreaterThan(0);
    expect(andel.length).toBeGreaterThan(0);
    expect((vat[0] as HTMLElement).style.color).toBe("rgb(0, 0, 255)");
    expect((andel[0] as HTMLElement).style.color).toBe("rgb(255, 0, 0)");
    const marks = document.querySelector("[data-formula-ref-marks]")?.getAttribute("data-formula-ref-marks");
    expect(marks).toContain("#0000FF");
    expect(marks).toContain("Vat");
  });

  it("points a Formula ref on another Sheet from Explorer", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectVat(session);
    const bar = formulaBar()!;
    await act(async () => {
      fireEvent.change(bar, { target: { value: "=" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    expect(session.formulaEdit).not.toBeNull();
    expect(formulaBar()).toBeTruthy();
    await clickProjectedCell(session, "tbl-salg", 1, 1);
    expect(formulaBar()?.value).toMatch(/Salg\[/);
    expect(session.formulaEdit).not.toBeNull();
    await act(async () => {
      fireEvent.keyDown(formulaBar()!, { key: "Enter" });
    });
    expect(document.querySelector('[data-table-id="tbl-params"]')).toBeTruthy();
    expect(session.formulaEdit).toBeNull();
  });

  it("does not point a Formula ref at the Edit cell", async () => {
    const { session } = await renderPlaygroundCanvas();
    await typeEqualsOnProjectedCell(session, "tbl-params", 1, 3);
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    await act(async () => {
      fireEvent.keyDown(editor, { key: "ArrowDown" });
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "ArrowUp" });
    });
    expect(session.formulaEdit?.draft).toBe("=");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "ArrowDown" });
    });
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
  });

  it("points a Local Formula ref on the same Table", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salg" }));
    });
    await typeEqualsOnProjectedCell(session, "tbl-salg", 1, 1);
    await clickProjectedCell(session, "tbl-salg", 1, 2);
    expect(session.formulaEdit?.draft).toBe("=[@][Outsource]");
    const editor = document.querySelector<HTMLTextAreaElement>(".wk-overlay-editor")!;
    await act(async () => {
      fireEvent.keyDown(editor, { key: "F4" });
    });
    expect(session.formulaEdit?.draft).toBe("=[$Jan][$Outsource]");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "F4" });
    });
    expect(session.formulaEdit?.draft).toBe("=[@][$Outsource]");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "F4" });
    });
    expect(session.formulaEdit?.draft).toBe("=[$Jan][Outsource]");
    await act(async () => {
      fireEvent.keyDown(editor, { key: "F4" });
    });
    expect(session.formulaEdit?.draft).toBe("=[@][Outsource]");
  });

  it("shows a Growth-cell inspector with only Value", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectProjectedCell(session, "tbl-params", 0, 8);
    expect(session.selection).toMatchObject({ kind: "growth", tableId: "tbl-params" });
    expect(screen.getByRole("heading", { name: "Growth cell" })).toBeTruthy();
    expect(screen.getByLabelText("Value")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("shows a Growth-cell inspector for a data Growth cell", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectProjectedCell(session, "tbl-params", 1, 8);
    expect(session.selection).toEqual({ kind: "growth", tableId: "tbl-params", col: 1, row: 8 });
    expect(screen.getByRole("heading", { name: "Growth cell" })).toBeTruthy();
    expect(screen.getByLabelText("Value")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Table" })).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });
});
