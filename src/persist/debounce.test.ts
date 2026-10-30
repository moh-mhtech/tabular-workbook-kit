import { describe, expect, it, vi } from "vitest";
import { createSampleWorkbook } from "../../sample/createSampleWorkbook.js";
import { debouncePersistence, MemoryPersistence } from "./index.js";

describe("debouncePersistence", () => {
  it("writes once after idle and keeps the latest snapshot", async () => {
    vi.useFakeTimers();
    const inner = new MemoryPersistence();
    const saveSpy = vi.spyOn(inner, "save");
    const debounced = debouncePersistence(inner, 200);
    const base = createSampleWorkbook();

    void debounced.save({ ...base, name: "A" });
    void debounced.save({ ...base, name: "B" });
    expect(saveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((await inner.load())!.name).toBe("B");
    vi.useRealTimers();
  });

  it("flush saves immediately", async () => {
    const inner = new MemoryPersistence();
    const debounced = debouncePersistence(inner, 60_000);
    const base = createSampleWorkbook();
    void debounced.save({ ...base, name: "Now" });
    await debounced.flush();
    expect((await inner.load())!.name).toBe("Now");
  });
});
