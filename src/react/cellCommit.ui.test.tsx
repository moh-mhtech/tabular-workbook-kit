/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GridCellKind, type GridCell } from "@glideapps/glide-data-grid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HyperFormulaEngine } from "../engine/hyperformula.js";
import {
  cellAfterCommitMove,
  projectTable,
  selectionForProjectedCell,
} from "../grid/sheetProjection.js";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { CustomSheetCanvas } from "./CustomSheetCanvas.js";
import { ProjectedOverlayEditor, SpreadsheetTextEditor } from "./customGridEditor.js";
import { applyCustomGridEdits } from "./customGridInteractions.js";
import { PropertiesPanel } from "./PropertiesPanel.js";
import { WorkbookProvider, useSnapshot, useWorkbook } from "./WorkbookProvider.js";
import { installGridDom } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VAT_CELL: GridCell = {
  kind: GridCellKind.Text,
  data: "0.25",
  displayData: "0.25",
  allowOverlay: true,
};

function CellEditorHost() {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, "tbl-params")!;
  const [value, setValue] = useState<GridCell>(VAT_CELL);

  return (
    <SpreadsheetTextEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={(next, movement = [0, 0]) => {
        const committed = next ?? value;
        applyCustomGridEdits(session, projection, layout, [{ location: [1, 3], value: committed }]);
        session.cancelFormulaEdit();
        const delta: readonly [-1 | 0 | 1, -1 | 0 | 1] = [
          movement[0] < 0 ? -1 : movement[0] > 0 ? 1 : 0,
          movement[1] < 0 ? -1 : movement[1] > 0 ? 1 : 0,
        ];
        const moved = cellAfterCommitMove(projection, layout, [1, 3], delta);
        session.setSelection(
          moved?.selection ?? selectionForProjectedCell(projection, layout, 1, 3),
        );
      }}
      isHighlighted={false}
      initialNavMode="edit"
      editingLocation={[1, 3]}
      projection={projection}
      layout={layout}
    />
  );
}

function CommitEditorHost({
  tableId,
  location,
  data,
}: {
  tableId: string;
  location: readonly [number, number];
  data: string;
}) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, tableId)!;
  const [value, setValue] = useState<GridCell>({
    kind: GridCellKind.Text,
    data,
    displayData: data,
    allowOverlay: true,
  });

  return (
    <ProjectedOverlayEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={(next, movement = [0, 0]) => {
        const committed = next ?? value;
        applyCustomGridEdits(session, projection, layout, [{ location, value: committed }]);
        session.cancelFormulaEdit();
        const delta: readonly [-1 | 0 | 1, -1 | 0 | 1] = [
          movement[0] < 0 ? -1 : movement[0] > 0 ? 1 : 0,
          movement[1] < 0 ? -1 : movement[1] > 0 ? 1 : 0,
        ];
        const moved = cellAfterCommitMove(projection, layout, location, delta);
        session.setSelection(moved?.selection ?? selectionForProjectedCell(projection, layout, location[0], location[1]));
        if (moved) session.gridFocus = { tableId, col: moved.location[0], row: moved.location[1] };
      }}
      isHighlighted={false}
      initialNavMode="edit"
      editingLocation={[location[0], location[1]]}
      projection={projection}
      layout={layout}
    />
  );
}

async function renderPlayground(withCellEditor = false) {
  const session = new WorkbookSession(createPlaygroundWorkbook(), new HyperFormulaEngine());
  await session.recalculate();
  session.setSelection({
    kind: "cell",
    tableId: "tbl-params",
    rowId: "row-vat",
    columnId: "Value",
  });
  await act(async () => {
    render(
      <WorkbookProvider session={session}>
        <div className="wk-shell">
          {withCellEditor ? <CellEditorHost /> : null}
          <CustomSheetCanvas />
          <PropertiesPanel />
        </div>
      </WorkbookProvider>,
    );
  });
  return {
    session,
    valueField: document.querySelector(".wk-formula-bar textarea") as HTMLTextAreaElement,
  };
}

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function trapErrors() {
  const alerts: string[] = [];
  const errors: unknown[] = [];
  vi.spyOn(window, "alert").mockImplementation((message) => {
    alerts.push(String(message));
  });
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
  return { alerts, errors };
}

function expectVatCommitted(session: WorkbookSession) {
  expect(session.selection).toEqual({
    kind: "cell",
    tableId: "tbl-params",
    rowId: "row-andel-cnc",
    columnId: "Value",
  });
  expect(session.getSnapshot().tables.find((table) => table.id === "tbl-params")!.rows[2].cells.Value).toEqual({
    kind: "input",
    value: 0.3,
  });
}

describe("cell commit UI", () => {
  it("commits the value field on Enter and selects the next row without erroring", async () => {
    const { alerts, errors } = trapErrors();
    const { session, valueField } = await renderPlayground();
    expect(valueField).toBeTruthy();
    await act(async () => {
      fireEvent.change(valueField, { target: { value: "0.3" } });
      fireEvent.keyDown(valueField, { key: "Enter" });
    });

    expect(alerts).toEqual([]);
    expect(errors).toEqual([]);
    expectVatCommitted(session);
  });

  it("commits the in-cell editor on Enter and selects the next row without erroring", async () => {
    const { alerts, errors } = trapErrors();
    const { session } = await renderPlayground(true);
    const editor = screen.getByLabelText("Cell editor") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(editor, { target: { value: "0.3" } });
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    expect(alerts).toEqual([]);
    expect(errors).toEqual([]);
    expectVatCommitted(session);
  });

  it("commits a Key cell on Enter and selects the next Key cell", async () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), new HyperFormulaEngine());
    await session.recalculate();
    await act(async () => {
      render(
        <WorkbookProvider session={session}>
          <CommitEditorHost tableId="tbl-params" location={[0, 3]} data="Vat" />
        </WorkbookProvider>,
      );
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Cell editor"), { key: "Enter" });
    });
    expect(session.selection).toEqual({ kind: "row", tableId: "tbl-params", rowId: "row-andel-cnc" });
    expect(session.gridFocus).toEqual({ tableId: "tbl-params", col: 0, row: 4 });
  });

  it("commits a Header cell on Tab and selects the next Header cell", async () => {
    const session = new WorkbookSession(createPlaygroundWorkbook(), new HyperFormulaEngine());
    await session.recalculate();
    await act(async () => {
      render(
        <WorkbookProvider session={session}>
          <CommitEditorHost tableId="tbl-staff" location={[1, 0]} data="Role" />
        </WorkbookProvider>,
      );
    });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Cell editor"), { key: "Tab" });
    });
    expect(session.selection).toEqual({ kind: "column", tableId: "tbl-staff", columnId: "BaseSalary" });
    expect(session.gridFocus).toEqual({ tableId: "tbl-staff", col: 2, row: 0 });
  });
});
