import { describe, expect, it, vi } from "vitest";
import { layoutWorkbook } from "../model/layout.js";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { WorkbookSession } from "../session/WorkbookSession.js";
import { projectTable } from "../grid/sheetProjection.js";
import {
  commitProjectedCellEdit,
  filterRedundantGridEdits,
  projectedCellRawMatches,
} from "./commitProjectedCellEdit.js";
import { applyCustomGridEdits } from "./customGridInteractions.js";
import { appendEntryQueue, takeEntryQueue } from "./entryQueue.js";

const inert = { evaluate: () => ({}) };

describe("commitProjectedCellEdit", () => {
  it("skips redundant onCellsEdited payloads", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    applyCustomGridEdits(session, projection, layout, [{ location: [1, 3], value: { data: "9" } }]);
    expect(projectedCellRawMatches(session, projection, layout, 1, 3, "9")).toBe(true);
    const filtered = filterRedundantGridEdits(session, projection, layout, [
      { location: [1, 3], value: { data: "9" } },
    ]);
    expect(filtered).toEqual([]);
  });

  it("queues and takes typed chars for a grid focus cell", () => {
    let queue = appendEntryQueue(null, 1, 2, "2");
    queue = appendEntryQueue(queue, 1, 2, "3");
    const taken = takeEntryQueue(queue, 1, 2);
    expect(taken.chars).toBe("23");
    expect(taken.queue).toBeNull();
  });

  it("commits once when commitProjectedCellEdit is called twice with the same value", () => {
    const session = new WorkbookSession(createSampleWorkbook(), inert);
    const layout = layoutWorkbook(session.getSnapshot());
    const projection = projectTable(layout, "tbl-params")!;
    const transactSpy = vi.spyOn(session, "transact");
    commitProjectedCellEdit(session, projection, layout, [1, 3], "5");
    commitProjectedCellEdit(session, projection, layout, [1, 3], "5");
    expect(transactSpy).toHaveBeenCalledTimes(1);
    transactSpy.mockRestore();
  });
});
