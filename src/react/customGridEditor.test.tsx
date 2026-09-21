/** @vitest-environment jsdom */
import { useCallback, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GridCellKind, type GridCell } from "@glideapps/glide-data-grid";
import { afterEach, describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createPlaygroundWorkbook } from "../sample/playgroundWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { SpreadsheetTextEditor, type OverlayEditorProps } from "./customGridEditor.js";
import { pointAtProjectedCell } from "./customGridOverlay.js";
import { WorkbookProvider, useWorkbook } from "./WorkbookProvider.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inert = { evaluate: () => ({}) };

const VAT_CELL: GridCell = {
  kind: GridCellKind.Text,
  data: "0.25",
  displayData: "0.25",
  allowOverlay: true,
};

function EditorHost() {
  const { session } = useWorkbook();
  const snapshot = session.getSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, "tbl-params")!;
  const [value, setValue] = useState<GridCell>(VAT_CELL);

  const Editor = (props: OverlayEditorProps) => (
    <SpreadsheetTextEditor
      {...props}
      initialNavMode="cells"
      editingLocation={[1, 3]}
      projection={projection}
      layout={layout}
    />
  );

  return (
    <Editor
      value={value}
      onChange={setValue}
      onFinishedEditing={() => undefined}
      isHighlighted={false}
    />
  );
}

function StableEditorHost() {
  const { session } = useWorkbook();
  const snapshot = session.getSnapshot();
  const extras = useRef({
    layout: layoutWorkbook(snapshot),
    projection: projectTable(layoutWorkbook(snapshot), "tbl-params")!,
  });
  extras.current.layout = layoutWorkbook(snapshot);
  extras.current.projection = projectTable(extras.current.layout, "tbl-params")!;
  const [value, setValue] = useState<GridCell>(VAT_CELL);
  const BoundEditor = useCallback(
    (props: OverlayEditorProps) => (
      <SpreadsheetTextEditor
        {...props}
        initialNavMode="cells"
        editingLocation={[1, 3]}
        projection={extras.current.projection}
        layout={extras.current.layout}
      />
    ),
    [],
  );

  return (
    <BoundEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={() => undefined}
      isHighlighted={false}
    />
  );
}

function renderEditor(host: "loop" | "stable" = "loop") {
  const session = new WorkbookSession(createPlaygroundWorkbook(), inert);
  render(
    <WorkbookProvider session={session}>
      {host === "loop" ? <EditorHost /> : <StableEditorHost />}
    </WorkbookProvider>,
  );
  return { session };
}

function cellEditor() {
  return screen.getByLabelText("Cell editor") as HTMLTextAreaElement;
}

afterEach(cleanup);

describe("custom grid editor UI", () => {
  it("does not crash with an update-depth loop when a cell editor opens", () => {
    expect(() => renderEditor()).not.toThrow();
    expect(cellEditor().value).toBe("0.25");
  });

  it("points like Excel: arrows and clicks insert a reference without leaving the cell", () => {
    const { session } = renderEditor("stable");
    fireEvent.change(cellEditor(), { target: { value: "=" } });
    fireEvent.keyDown(cellEditor(), { key: "Escape" });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("=AndelCNC");
    expect(session.formulaEdit?.draft).toBe("=AndelCNC");
    expect(document.activeElement).toBe(cellEditor());

    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("=AndelOutsource");

    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    act(() => {
      pointAtProjectedCell(session, projection, layout, 1, 3);
    });
    expect(cellEditor().value).toBe("=Vat");
    expect(document.activeElement).toBe(cellEditor());

    fireEvent.keyDown(cellEditor(), { key: "F2" });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("=Vat");
  });

  it("starts a new reference from the edit cell after an operator", () => {
    const { session } = renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=", selectionStart: 1, selectionEnd: 1 } });
    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=AndelCNC");
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });

    fireEvent.keyDown(editor, { key: "+" });
    expect(editor.value).toBe("=AndelCNC+");
    expect(session.formulaEdit?.activeFormulaRef).toBeNull();
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 3 });

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=AndelCNC+AndelCNC");

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=AndelCNC+AndelOutsource");
  });

  it("does not point a cell when the draft is a literal", () => {
    renderEditor("stable");
    fireEvent.change(cellEditor(), { target: { value: "100" } });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("100");
  });
});
