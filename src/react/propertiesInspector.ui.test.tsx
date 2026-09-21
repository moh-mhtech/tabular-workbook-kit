/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLOR_PALETTE } from "./inspectors/StyleField.js";
import { installGridDom, pressTableKey, renderPlaygroundCanvas, selectProjectedCell } from "./playgroundCanvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function selectParamsCell(
  session: Awaited<ReturnType<typeof renderPlaygroundCanvas>>["session"],
  rowId: string,
) {
  await act(async () => {
    session.setSelection({ kind: "cell", tableId: "tbl-params", rowId, columnId: "Value" });
  });
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("properties inspector UI", () => {
  it("labels format Format, omits a Style legend, and shows the evaluated result on the value field", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-start");
    expect(screen.getByLabelText("Format")).toBeTruthy();
    expect(screen.queryByText("Number format")).toBeNull();
    expect(screen.queryByText("Style", { selector: "legend" })).toBeNull();
    expect(screen.getByLabelText("Style")).toBeTruthy();
    const value = screen.getByLabelText("Value") as HTMLTextAreaElement;
    expect(value.value.startsWith("=")).toBe(true);
    const result = document.querySelector(".wk-formula-bar .wk-outlined-end") as HTMLElement | null;
    expect(result?.textContent).toMatch(/\d/);
    expect(result?.getAttribute("title")).toBe(result?.textContent);
  });

  it("hides the name field for a multi-cell selection", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await act(async () => {
      session.setSelection({
        kind: "cell",
        tableId: "tbl-params",
        rowId: "row-andel-out",
        columnId: "Value",
        range: [
          { tableId: "tbl-params", rowId: "row-andel-out", columnId: "Value" },
          { tableId: "tbl-params", rowId: "row-andel-plade", columnId: "Value" },
        ],
      });
    });
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("*");
  });

  it("keeps format and style in sync when the selected cell changes", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-andel-out");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Format"), { target: { value: "G3A" } });
      fireEvent.blur(screen.getByLabelText("Format"));
      fireEvent.click(screen.getByLabelText("Bold"));
    });
    expect((screen.getByLabelText("Format") as HTMLInputElement).value).toBe("G3A");
    expect(screen.getByLabelText("Bold").getAttribute("aria-pressed")).toBe("true");
    await selectParamsCell(session, "row-andel-plade");
    expect((screen.getByLabelText("Format") as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText("Bold").getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AndelPladebuk");
  });

  it("updates name and value after keyboard navigation", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectProjectedCell(session, "tbl-params", 1, 5);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AndelOutsource");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.12");
    await pressTableKey("tbl-params", "ArrowDown");
    expect(session.selection).toMatchObject({ rowId: "row-andel-plade", columnId: "Value" });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("AndelPladebuk");
    expect((screen.getByLabelText("Value") as HTMLTextAreaElement).value).toBe("0.08");
  });

  it("uses None for fill and Default for text, and leaves the fill hex blank without a color", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-vat");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    expect(screen.getByRole("button", { name: "None" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Default" })).toBeNull();
    const fillHex = screen.getByLabelText("Fill color hex") as HTMLInputElement;
    expect(fillHex.value).toBe("");
    expect(fillHex.placeholder).toBe("");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "#ffffff" }));
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fillColor).toBe("#ffffff");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "None" }));
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fillColor).toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Text color" }));
    });
    expect(screen.getByRole("button", { name: "Default" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "None" })).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Text color hex"), { target: { value: "#112233" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.textColor).toBe("#112233");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Default" }));
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.textColor).toBeUndefined();
  });

  it("ignores invalid fill hex, clears fill when the hex field is emptied, and clamps font size", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-vat");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    const fill = screen.getByLabelText("Fill color hex") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fill, { target: { value: "not-a-color" } });
      fireEvent.blur(fill);
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value?.style?.fillColor).toBeUndefined();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Fill color hex"), { target: { value: "#ffcc00" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fillColor).toBe("#ffcc00");
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Fill color hex"), { target: { value: "" } });
      fireEvent.blur(screen.getByLabelText("Fill color hex"));
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fillColor).toBeUndefined();

    const fontSize = screen.getByLabelText("Font size") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fontSize, { target: { value: "200" } });
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fontSize).toBe(96);
    await act(async () => {
      fireEvent.change(fontSize, { target: { value: "0" } });
      fireEvent.blur(fontSize);
    });
    expect(session.getSnapshot().tables[0]!.rows[2]!.cells.Value!.style?.fontSize).toBeUndefined();
  });

  it("opens a hue-by-shade palette whose two lightest steps are distinct", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-vat");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill color" }));
    });
    const swatches = screen.getAllByRole("button").filter((button) => /^#[0-9a-f]{6}$/i.test(button.getAttribute("aria-label") ?? ""));
    expect(swatches).toHaveLength(COLOR_PALETTE.length * (COLOR_PALETTE[0]?.length ?? 0));
    expect(screen.getByRole("button", { name: "#ef4444" })).toBeTruthy();
    const red = COLOR_PALETTE[1]!;
    expect(red[0]).not.toBe(red[1]);
    for (const column of COLOR_PALETTE) {
      const lights = column.map(luminance);
      for (let i = 1; i < lights.length; i++) {
        expect(lights[i]).toBeLessThan(lights[i - 1]);
      }
    }
  });

  it("closes the format help tooltip on mouse leave", async () => {
    const { session } = await renderPlaygroundCanvas({ chrome: true });
    await selectParamsCell(session, "row-vat");
    const help = screen.getByLabelText("Number format examples");
    fireEvent.mouseEnter(help);
    expect(screen.getByRole("tooltip").parentElement).toBe(document.body);
    fireEvent.mouseLeave(help.closest(".wk-help")!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
