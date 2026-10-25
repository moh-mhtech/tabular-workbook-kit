/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { blurOnEnter } from "./blurOnEnter.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

describe("blurOnEnter", () => {
  it("blurs the field on Enter so the existing onBlur commit runs once", () => {
    const commits: string[] = [];
    render(
      <input
        aria-label="Name"
        defaultValue="Mix"
        onBlur={(event) => commits.push(event.target.value)}
        onKeyDown={blurOnEnter}
      />,
    );
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "VAT" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).not.toBe(input);
    expect(commits).toEqual(["VAT"]);
  });
});
