/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blurFormulaBar,
  clickFormulaText,
  clickProjectedCell,
  dragProjectedCell,
  formulaBar,
  installGridDom,
  pressCaretKey,
  renderPlaygroundCanvas,
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
});
