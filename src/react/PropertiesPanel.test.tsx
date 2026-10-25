/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { WorkbookProvider } from "./WorkbookProvider.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inert = { evaluate: () => ({}) };

function renderValueField() {
  const session = new WorkbookSession(createSampleWorkbook(), inert);
  session.setSelection({
    kind: "cell",
    tableId: "tbl-params",
    rowId: "row-vat",
    columnId: "Value",
  });
  act(() => {
    render(
      <WorkbookProvider session={session}>
        <PropertiesPanel />
      </WorkbookProvider>,
    );
  });
  return { session, input: screen.getByLabelText("Value") as HTMLTextAreaElement };
}

afterEach(cleanup);

describe("properties value field commit navigation", () => {
  it("moves to the next row on Enter after committing", () => {
    const { session, input } = renderValueField();
    fireEvent.change(input, { target: { value: "0.3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-params",
      rowId: "row-cnc-share",
      columnId: "Value",
    });
    expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2].cells.Value).toEqual({
      kind: "input",
      value: 0.3,
    });
  });

  it("moves to the next column on Tab after committing", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    session.setSelection({
      kind: "cell",
      tableId: "tbl-sales",
      rowId: "row-cnc",
      columnId: "2025-01",
    });
    act(() => {
      render(
        <WorkbookProvider session={session}>
          <PropertiesPanel />
        </WorkbookProvider>,
      );
    });
    const input = screen.getByLabelText("Value") as HTMLTextAreaElement;
    fireEvent.keyDown(input, { key: "Tab" });
    expect(session.selection).toEqual({
      kind: "cell",
      tableId: "tbl-sales",
      rowId: "row-cnc",
      columnId: "2025-02",
    });
  });
});
