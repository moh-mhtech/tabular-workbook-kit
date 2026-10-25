/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MixedTextInput } from "./MixedTextInput.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("MixedTextInput", () => {
  it("shows * when values differ and edits from the first value", () => {
    const commits: string[] = [];
    render(<MixedTextInput values={["0%", "G3"]} onCommit={(value) => commits.push(value)} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("*");
    fireEvent.focus(input);
    expect(input.value).toBe("0%");
    fireEvent.change(input, { target: { value: "G3A" } });
    fireEvent.blur(input);
    expect(commits).toEqual(["G3A"]);
  });

  it("shows the shared value when every cell matches", () => {
    render(<MixedTextInput values={["G3A", "G3A"]} onCommit={() => undefined} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("G3A");
  });

  it("replaces the displayed value when the source changes", () => {
    const { rerender } = render(<MixedTextInput values={["AlternateShare"]} onCommit={() => undefined} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("AlternateShare");
    rerender(<MixedTextInput values={["LastShare"]} onCommit={() => undefined} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("LastShare");
  });

  it("does not commit when the value is unchanged", () => {
    const commits: string[] = [];
    render(<MixedTextInput values={["Mix"]} onCommit={(value) => commits.push(value)} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(commits).toEqual([]);
  });
});
