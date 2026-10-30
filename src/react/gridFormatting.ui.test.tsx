/** @vitest-environment jsdom */
import { useMemo } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDisplayValue } from "../model/numberFormat.js";
import { layoutWorkbook } from "../model/layout.js";
import { projectTable } from "../grid/sheetProjection.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";
import { evaluatedCells, gridCell } from "./CustomSheetCanvas.js";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function SnapshotIdentityProbe({ onRender }: { onRender: (snapshot: object, getCell: () => unknown) => void }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const projection = useMemo(() => projectTable(layout, "tbl-params")!, [layout]);
  const values = useMemo(() => evaluatedCells(session, snapshot), [session, snapshot]);
  const getCell = useMemo(
    () => () => gridCell(projection, layout, values, [1, 1]),
    [layout, projection, values],
  );
  onRender(snapshot, getCell);
  return null;
}

function GridCellProbe({ col, row }: { col: number; row: number }) {
  const { session } = useWorkbook();
  const snapshot = useSnapshot();
  const layout = useMemo(() => layoutWorkbook(snapshot), [snapshot]);
  const projection = useMemo(() => projectTable(layout, "tbl-params")!, [layout]);
  const values = useMemo(() => evaluatedCells(session, snapshot), [session, snapshot]);
  const cell = gridCell(projection, layout, values, [col, row]);
  return (
    <pre data-testid="grid-cell">
      {JSON.stringify({
        displayData: cell.displayData,
        data: "data" in cell ? cell.data : undefined,
        themeOverride: cell.themeOverride,
      })}
    </pre>
  );
}

function readGridCell() {
  return JSON.parse(screen.getByTestId("grid-cell").textContent ?? "{}") as {
    displayData: string;
    data: string;
    themeOverride?: { baseFontStyle?: string; bgCell?: string; textDark?: string };
  };
}

describe("grid formatting UI", () => {
  it("gives layout memos a new snapshot identity after a style or format edit", async () => {
    const renders: Array<{ snapshot: object; getCell: () => unknown }> = [];
    const { session } = await renderWorkbookCanvas({
      extra: <SnapshotIdentityProbe onRender={(snapshot, getCell) => renders.push({ snapshot, getCell })} />,
    });
    const before = renders.at(-1)!;
    await act(async () => {
      session.setCellStyle("tbl-params", "row-annual", "Value", { bold: true });
    });
    const after = renders.at(-1)!;
    expect(after.snapshot).not.toBe(before.snapshot);
    expect(after.getCell).not.toBe(before.getCell);
  });

  it("paints number format and cell style onto the grid cell after inspector edits", async () => {
    const { session } = await renderWorkbookCanvas({
      chrome: true,
      extra: <GridCellProbe col={1} row={1} />,
    });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-annual",
        columnId: "Value",
      });
    });

    const format = screen.getByPlaceholderText("G3, #,##G3, G3A, G3K") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(format, { target: { value: "G3A" } });
      fireEvent.blur(format);
    });
    expect(readGridCell().displayData).toBe(formatDisplayValue(8_000_000, "G3A"));
    expect(readGridCell().data).toBe("8000000");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Bold"));
      fireEvent.click(screen.getByLabelText("Italic"));
      fireEvent.click(screen.getByLabelText("Strikethrough"));
    });
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/bold/);
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/italic/);
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/px/);

    const fillBtn = screen.getByRole("button", { name: "Fill color" });
    await act(async () => {
      fireEvent.click(fillBtn);
    });
    const fill = screen.getByLabelText("Fill color hex") as HTMLInputElement;
    expect(fill.value).toBe("");
    expect(fill.placeholder).toBe("");
    await act(async () => {
      fireEvent.change(fill, { target: { value: "#ffcc00" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style?.fillColor).toBe("#ffcc00");
    expect(readGridCell().themeOverride?.bgCell).toBe("#ffcc00");
    expect((fillBtn.querySelector(".wk-color-icon-bar") as HTMLElement | null)?.style.backgroundColor).toBe(
      "rgb(255, 204, 0)",
    );

    const textBtn = screen.getByRole("button", { name: "Text color" });
    await act(async () => {
      fireEvent.click(textBtn);
    });
    const text = screen.getByLabelText("Text color hex") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(text, { target: { value: "#112233" } });
    });
    expect(readGridCell().themeOverride?.textDark).toBe("#112233");
    expect((textBtn.querySelector(".wk-color-icon-bar") as HTMLElement | null)?.style.backgroundColor).toBe(
      "rgb(17, 34, 51)",
    );

    const fontSize = screen.getByLabelText("Font size") as HTMLInputElement;
    expect(fontSize.type).toBe("number");
    await act(async () => {
      fireEvent.change(fontSize, { target: { value: "14" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style?.fontSize).toBe(14);
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/14px/);
    await act(async () => {
      fireEvent.change(fontSize, { target: { value: "13" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style?.fontSize).toBe(13);
  });

  it("applies a column style to every cell in that column on the grid", async () => {
    const { session } = await renderWorkbookCanvas({
      chrome: true,
      extra: <GridCellProbe col={1} row={3} />,
    });
    await act(async () => {
      session.setSelection({ kind: "column", tableId: "tbl-params", columnId: "Value" });
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Bold"));
    });
    expect(session.getSnapshot().tables[0]!.attributeColumns[0]!.style).toEqual({ bold: true });
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/bold/);
  });

  it("grows the table grid when a cell font is larger than the default", async () => {
    const { session } = await renderWorkbookCanvas();
    const sheet = document.querySelector(".wk-table-spreadsheet") as HTMLElement;
    const beforeHeight = Number.parseFloat(sheet.style.height);
    const beforeWidth = Number.parseFloat(sheet.style.width);
    expect(beforeHeight).toBeGreaterThan(0);
    await act(async () => {
      session.setCellStyle("tbl-params", "row-vat", "Value", { fontSize: 36 });
    });
    const afterHeight = Number.parseFloat(sheet.style.height);
    const afterWidth = Number.parseFloat(sheet.style.width);
    expect(afterHeight).toBeGreaterThan(beforeHeight);
    expect(afterWidth).toBeGreaterThan(beforeWidth);
  });

  it("keeps painted style after the cell value is edited", async () => {
    const { session } = await renderWorkbookCanvas({
      extra: <GridCellProbe col={1} row={3} />,
    });
    await act(async () => {
      session.setCellStyle("tbl-params", "row-vat", "Value", {
        bold: true,
        fontSize: 20,
        fillColor: "#fff6d6",
        textColor: "#112233",
      });
    });
    await act(async () => {
      session.writeCell("Params", "Mix", "Value", "0.3");
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value).toMatchObject({
      kind: "input",
      value: 0.3,
      style: { bold: true, fontSize: 20, fillColor: "#fff6d6", textColor: "#112233" },
    });
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/bold/);
    expect(readGridCell().themeOverride?.baseFontStyle).toMatch(/20px/);
    expect(readGridCell().themeOverride?.bgCell).toBe("#fff6d6");
    expect(readGridCell().themeOverride?.textDark).toBe("#112233");
  });

  it("clears cell style from the inspector and picks a palette swatch", async () => {
    const { session } = await renderWorkbookCanvas({
      chrome: true,
      extra: <GridCellProbe col={1} row={1} />,
    });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-annual",
        columnId: "Value",
      });
      session.setCellStyle("tbl-params", "row-annual", "Value", {
        bold: true,
        italic: true,
        fillColor: "#fff6d6",
      });
    });
    expect(readGridCell().themeOverride?.bgCell).toBe("#fff6d6");
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Clear formatting"));
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style).toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "#ef4444" }));
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style?.fillColor).toBe("#ef4444");
    expect(readGridCell().themeOverride?.bgCell).toBe("#ef4444");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "None" }));
    });
    expect(session.getSnapshot().tables[0]!.rows[0]!.cells.Value!.style?.fillColor).toBeUndefined();
    expect(readGridCell().themeOverride?.bgCell).toBe("#ffffff");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    const noneHex = screen.getByLabelText("Fill color hex") as HTMLInputElement;
    expect(noneHex.value).toBe("");
    expect(noneHex.placeholder).toBe("");
  });
});
