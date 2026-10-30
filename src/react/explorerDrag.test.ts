import { describe, expect, it } from "vitest";
import { dropHintAfterLastSheet } from "./explorerDrag.js";

describe("explorer drop hints", () => {
  it("marks a trailing sheet drop after the last sheet", () => {
    expect(dropHintAfterLastSheet([{ id: "sheet-a" }, { id: "sheet-b" }])).toEqual({
      placement: "after-sheet",
      sheetId: "sheet-b",
    });
  });
});
