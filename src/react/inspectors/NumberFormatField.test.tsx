/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../../session/WorkbookSession.js";
import { WorkbookProvider } from "../WorkbookProvider.js";
import { exampleNumberFromSelection, NumberFormatField } from "./NumberFormatField.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

const inert = { evaluate: () => ({}) };

function sessionWithSelection(kind: "aarlines" | "vat") {
  const session = new WorkbookSession(createSampleWorkbook(), inert);
  session.setSelection({
    kind: "cell",
    tableId: "tbl-params",
    rowId: kind === "aarlines" ? "row-annual" : "row-vat",
    columnId: "Value",
  });
  return session;
}

describe("exampleNumberFromSelection", () => {
  it("reads the first cell of a cell or column selection", () => {
    const session = sessionWithSelection("aarlines");
    expect(exampleNumberFromSelection(session)).toBe(8_000_000);
    session.setSelection({ kind: "column", tableId: "tbl-params", columnId: "Value" });
    expect(exampleNumberFromSelection(session)).toBe(8_000_000);
  });
});

describe("NumberFormatField", () => {
  it("shows formatting examples using the selected cell value", () => {
    render(
      <WorkbookProvider session={sessionWithSelection("vat")}>
        <NumberFormatField values={[""]} onCommit={() => undefined} />
      </WorkbookProvider>,
    );
    fireEvent.mouseEnter(screen.getByLabelText("Number format examples"));
    const tip = screen.getByRole("tooltip");
    expect(tip.parentElement).toBe(document.body);
    expect(tip.closest(".wk-outlined")).toBeNull();
    expect(tip.textContent).toContain("G3A");
    expect(tip.textContent).toContain("25%");
    expect(tip.textContent).not.toContain("8M");
  });
});
