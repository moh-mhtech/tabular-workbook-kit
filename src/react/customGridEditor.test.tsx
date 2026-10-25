/** @vitest-environment jsdom */
import { useCallback, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { clickFormulaText, pressCaretKey } from "./playgroundCanvasTest.js";
import { GridCellKind, type GridCell } from "@glideapps/glide-data-grid";
import { afterEach, describe, expect, it } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { projectTable } from "../grid/sheetProjection.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { overlayProvideOptions, ProjectedOverlayEditor, type OverlayEditorProps } from "./customGridEditor.js";
import { pointAtProjectedCell, overlayModeForActivation, type OverlayNavMode } from "./customGridOverlay.js";
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
    <ProjectedOverlayEditor
      {...props}
      initialNavMode="enter"
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

function StableEditorHost({ navMode = "enter" }: { navMode?: OverlayNavMode }) {
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
      <ProjectedOverlayEditor
        {...props}
        initialNavMode={navMode}
        editingLocation={[1, 3]}
        projection={extras.current.projection}
        layout={extras.current.layout}
      />
    ),
    [navMode],
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

function KeyEditorHost() {
  const { session } = useWorkbook();
  const snapshot = session.getSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, "tbl-params")!;
  const [value, setValue] = useState<GridCell>({
    kind: GridCellKind.Text,
    data: "Vat",
    displayData: "Vat",
    allowOverlay: true,
  });

  return (
    <ProjectedOverlayEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={() => undefined}
      isHighlighted={false}
      initialNavMode="enter"
      editingLocation={[0, 3]}
      projection={projection}
      layout={layout}
    />
  );
}

function GrowthKeyEditorHost() {
  const { session } = useWorkbook();
  const snapshot = session.getSnapshot();
  const layout = layoutWorkbook(snapshot);
  const projection = projectTable(layout, "tbl-params")!;
  const [value, setValue] = useState<GridCell>({
    kind: GridCellKind.Text,
    data: "",
    displayData: "",
    allowOverlay: true,
  });

  return (
    <ProjectedOverlayEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={() => undefined}
      isHighlighted={false}
      initialNavMode="enter"
      editingLocation={[0, projection.rowCount - 1]}
      projection={projection}
      layout={layout}
    />
  );
}

function GrowthColumnHeaderEditorHost() {
  const { session } = useWorkbook();
  const snapshot = session.getSnapshot();
  const notes = snapshot.tables.find((table) => table.name === "Notes");
  const layout = layoutWorkbook(snapshot);
  const projection = notes ? projectTable(layout, notes.id) : null;
  const [value, setValue] = useState<GridCell>({
    kind: GridCellKind.Text,
    data: "",
    displayData: "",
    allowOverlay: true,
  });
  if (!projection) return null;

  return (
    <ProjectedOverlayEditor
      value={value}
      onChange={setValue}
      onFinishedEditing={() => undefined}
      isHighlighted={false}
      initialNavMode="enter"
      editingLocation={[projection.colCount - 1, 0]}
      projection={projection}
      layout={layout}
    />
  );
}

function renderEditor(host: "loop" | "stable" | "double-click" | "key" | "growth-key" | "growth-column" = "loop") {
  const session = new WorkbookSession(createSampleWorkbook(), inert);
  if (host === "growth-column") {
    act(() => {
      session.addTable("sheet-forud", { name: "Notes" });
    });
  }
  const navMode = host === "double-click" ? overlayModeForActivation("double-click") : "enter";
  render(
    <WorkbookProvider session={session}>
      {host === "loop" ? (
        <EditorHost />
      ) : host === "key" ? (
        <KeyEditorHost />
      ) : host === "growth-key" ? (
        <GrowthKeyEditorHost />
      ) : host === "growth-column" ? (
        <GrowthColumnHeaderEditorHost />
      ) : (
        <StableEditorHost navMode={navMode} />
      )}
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

  it("edits a Key cell inline without Formula AutoComplete", () => {
    const { session } = renderEditor("key");
    const editor = cellEditor();
    expect(editor.tagName).toBe("INPUT");
    expect(editor.classList.contains("wk-inline-editor")).toBe(true);
    fireEvent.change(editor, { target: { value: "=V" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(session.formulaEdit).toBeNull();
    fireEvent.change(editor, { target: { value: "SUM" } });
    expect(editor.getAttribute("aria-invalid")).toBe("true");
  });

  it("keeps a Key cell editor the size of the cell, not a popup", () => {
    const name = overlayProvideOptions(true, 48, 28);
    expect(name.disableStyling).toBe(true);
    expect(name.disablePadding).toBe(true);
    expect(name.styleOverride).toMatchObject({
      width: 48,
      height: 28,
      maxWidth: 48,
      maxHeight: 28,
      boxShadow: "none",
    });
    expect(overlayProvideOptions(false, 110, 28).styleOverride).toMatchObject({
      minWidth: 110,
    });
    expect(overlayProvideOptions(false, 110, 28, "inline").styleOverride).toMatchObject({
      width: 110,
      height: 28,
      boxShadow: "none",
    });
  });

  it("marks an Invalid draft on a Growth-row Key cell", () => {
    renderEditor("growth-key");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "1" } });
    expect(editor.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(editor, { target: { value: "hello" } });
    expect(editor.getAttribute("aria-invalid")).toBeNull();
  });

  it("marks an Invalid draft on a Growth-column Header cell", () => {
    renderEditor("growth-column");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "A" } });
    expect(editor.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(editor, { target: { value: "B" } });
    expect(editor.getAttribute("aria-invalid")).toBeNull();
  });

  it("points like Excel: arrows and clicks insert a reference without leaving the cell", () => {
    const { session } = renderEditor("stable");
    fireEvent.change(cellEditor(), { target: { value: "=" } });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(session.formulaEdit?.draft).toBe("=CncShare");
    expect(document.activeElement).toBe(cellEditor());

    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("=OutsourceShare");

    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    act(() => {
      pointAtProjectedCell(session, projection, layout, 1, 3);
    });
    expect(cellEditor().value).toBe("=");
    expect(document.activeElement).toBe(cellEditor());

    fireEvent.keyDown(cellEditor(), { key: "F2" });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("=");
  });

  it("moves the Caret after a mouse Formula range then a click in Formula text", async () => {
    const { session } = renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=" } });
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    act(() => {
      pointAtProjectedCell(session, projection, layout, 1, 3);
      pointAtProjectedCell(session, projection, layout, 1, 4, { extend: true });
    });
    expect(editor.value).toBe("=Vat:CncShare");
    expect(session.formulaEdit?.mode).toBe("point");
    expect(document.querySelector(".wk-overlay-editor")).toBe(editor);

    const field = await clickFormulaText(4);
    expect(field).toBe(editor);
    expect(field.getAttribute("aria-label")).toBe("Cell editor");
    expect(session.formulaEdit, "clicking Formula text must not Cancel").not.toBeNull();
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field.selectionStart).toBe(4);

    await pressCaretKey("ArrowLeft");
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(3);
    expect(editor.selectionEnd).toBe(3);
    expect(editor.value).toBe("=Vat:CncShare");
    expect(session.formulaEdit?.mode).toBe("edit");
  });

  it("starts a new reference from the edit cell after an operator", () => {
    const { session } = renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=", selectionStart: 1, selectionEnd: 1 } });
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=CncShare");
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 4 });

    fireEvent.keyDown(editor, { key: "+" });
    expect(editor.value).toBe("=CncShare+");
    expect(session.formulaEdit?.activeFormulaRef).toBeNull();
    expect(session.formulaEdit?.targetCell).toEqual({ tableId: "tbl-params", col: 1, row: 3 });

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=CncShare+CncShare");

    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=CncShare+OutsourceShare");
  });

  it("does not point a cell when the draft is a literal", () => {
    renderEditor("stable");
    fireEvent.change(cellEditor(), { target: { value: "100" } });
    fireEvent.keyDown(cellEditor(), { key: "ArrowDown" });
    expect(cellEditor().value).toBe("100");
  });

  it("inserts from the suggest list on Enter without committing", () => {
    renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=Su" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /SUM/ }));
    expect(editor.value).toBe("=SUM(");
    fireEvent.change(editor, { target: { value: "=Av" } });
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(editor.value).toBe("=AVERAGE(");
    fireEvent.change(editor, { target: { value: "=Mi" } });
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: false });
    expect(editor.value).toBe("=MIN(");
  });

  it("hides suggestions on the first Escape and cancels on the second", () => {
    const { session } = renderEditor("stable");
    fireEvent.change(cellEditor(), { target: { value: "=Su" } });
    fireEvent.keyDown(cellEditor(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(session.formulaEdit?.draft).toBe("=Su");
    fireEvent.keyDown(cellEditor(), { key: "Escape" });
  });

  it("moves the Caret with arrows after a double-click into Formula text", async () => {
    const { session } = renderEditor("double-click");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=" } });
    expect(session.formulaEdit?.mode).toBe("edit");
    expect(fireEvent.keyDown(editor, { key: "ArrowDown", cancelable: true })).toBe(true);
    expect(editor.value).toBe("=");
    expect(session.formulaEdit?.draft).toBe("=");
    expect(session.formulaEdit?.mode).toBe("edit");
    editor.focus();
    editor.setSelectionRange(1, 1);
    await pressCaretKey("ArrowLeft");
    expect(editor.selectionStart).toBe(0);
  });

  it("moves the Caret with arrows after a Formula-text click then )", async () => {
    const { session } = renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=" } });
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    expect(editor.value).toBe("=CncShare");
    fireEvent.pointerDown(editor);
    expect(session.formulaEdit?.mode).toBe("edit");
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.select(editor);
    expect(editor.selectionStart).toBe(editor.value.length);
    expect(fireEvent.keyDown(editor, { key: ")", cancelable: true }), ") must stay in Edit mode").toBe(true);
    fireEvent.change(editor, { target: { value: "=CncShare)" } });
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.select(editor);
    expect(session.formulaEdit?.mode).toBe("edit");
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    await pressCaretKey("ArrowLeft");
    await pressCaretKey("ArrowLeft");
    const caret = editor.selectionStart;
    act(() => {
      session.setFormulaEditMode("point");
      session.setFormulaEditMode("edit");
    });
    expect(editor.selectionStart).toBe(caret);
    expect(editor.value).toBe("=CncShare)");
    expect(session.formulaEdit?.draft).toBe("=CncShare)");
    expect(session.formulaEdit?.mode).toBe("edit");
  });

  it("grows the Formula-edit popup from 110px toward 400px then 120px", () => {
    renderEditor("stable");
    const editor = cellEditor();
    fireEvent.change(editor, { target: { value: "=" } });
    expect(Number.parseFloat(editor.style.minWidth || editor.style.width)).toBe(110);
    expect(Number.parseFloat(editor.style.height)).toBe(28);
    fireEvent.change(editor, { target: { value: `=${"Vat+".repeat(40)}Vat` } });
    expect(Number.parseFloat(editor.style.width)).toBe(400);
    expect(Number.parseFloat(editor.style.maxHeight || editor.style.height)).toBe(120);
  });
});
