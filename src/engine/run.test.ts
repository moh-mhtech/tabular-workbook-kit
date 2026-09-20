import { describe, expect, it } from "vitest";
import { isEvalWorkbookId } from "./run.js";

describe("isEvalWorkbookId", () => {
  it("protects on-screen workbooks from evaluation dispose", () => {
    expect(isEvalWorkbookId("eval-wb-playground-abc")).toBe(true);
    expect(isEvalWorkbookId("wb-playground-abc")).toBe(false);
  });
});
