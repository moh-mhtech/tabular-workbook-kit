/** @vitest-environment jsdom */

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { installGridDom, renderWorkbookCanvas } from "./canvasTest.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(installGridDom);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("saved view", () => {
  it("restores the active sheet and cell selection when opening a snapshot", async () => {
    const snapshot = createSampleWorkbook();
    snapshot.view = {
      activeSheetId: "sheet-assumptions",
      selection: { kind: "cell", tableId: "tbl-lines", rowId: "row-red", columnId: "2025-01" },
    };
    const { session } = await renderWorkbookCanvas({ chrome: true, snapshot });
    expect(session.getViewActiveSheetId()).toBe("sheet-assumptions");
    expect(session.selection).toEqual(snapshot.view!.selection);
  });
});
