/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GlossaryButton } from "./GlossaryDialog.js";
import { parseGlossary } from "./glossary.js";

const here = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

describe("glossary", () => {
  it("parses the kit CONTEXT.md into grouped terms", () => {
    const markdown = readFileSync(join(here, "../../CONTEXT.md"), "utf8");
    const doc = parseGlossary(markdown);
    expect(doc.title).toBe("Workbook kit");
    expect(doc.sections.map((section) => section.heading)).toEqual([
      "Document",
      "Tables",
      "Cells",
      "Evaluation",
      "Formulas",
      "Editing",
      "Navigation",
      "Shell",
    ]);
    const terms = doc.sections.flatMap((section) => section.terms.map((term) => term.term));
    expect(terms).toContain("Workbook");
    expect(terms).toContain("Year column");
    expect(terms).toContain("Growth row");
    expect(terms).toContain("Unused corner");
    expect(terms).toContain("Key cell");
    expect(terms).toContain("Header cell");
    expect(terms).toContain("Fill");
    expect(terms).toContain("Cancel");
    expect(terms).toContain("Mixed");
    expect(terms).toContain("Cell style");
    expect(terms).toContain("Number format");
    expect(terms).toContain("Error");
    expect(terms).toContain("Blank");
    expect(terms).toContain("Stored value");
    expect(terms).toContain("Computed value");
    expect(terms).toContain("Display value");
    expect(terms).toContain("Even-split");
    expect(terms).toContain("Grain total");
    expect(terms).toContain("Ready");
    expect(terms).toContain("Enter");
    expect(terms).toContain("Edit mode");
    expect(terms).toContain("Point");
    expect(terms).toContain("Insert point");
    expect(terms).toContain("Invalid draft");
    expect(terms).toContain("Commit");
    expect(terms).toContain("Arrow navigation");
    expect(terms).toContain("Ctrl+arrow");
    expect(terms).toContain("Shift+arrow");
    expect(terms).toContain("Shift+Ctrl+arrow");
    expect(terms).toContain("Cell range");
    expect(terms).toContain("Reveal");
    expect(terms).toContain("Properties panel");
    const table = doc.sections.flatMap((section) => section.terms).find((term) => term.term === "Table");
    expect(table?.avoid).toMatch(/table kind/i);
  });

  it("parses the host CONTEXT.md", () => {
    const markdown = readFileSync(join(here, "../../../../apps/playground/CONTEXT.md"), "utf8");
    const doc = parseGlossary(markdown);
    expect(doc.title).toMatch(/Playground/);
    const terms = doc.sections.flatMap((section) => section.terms.map((term) => term.term));
    expect(terms).toEqual(["Playground", "Project", "Parameters sheet (Parametre)", "Parameters table (Params)"]);
  });

  it("opens the glossary dialog from the toolbar button", () => {
    const doc = parseGlossary("**Cell**:\nThe value at a Table row.\n_Avoid_: A1\n");
    function App() {
      const [open, setOpen] = useState(false);
      return (
        <GlossaryButton open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} documents={[doc]} />
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Glossary" }));
    expect(screen.getByRole("dialog", { name: "Glossary" })).toBeTruthy();
    expect(screen.getByText("Cell")).toBeTruthy();
    expect(screen.getByText(/Avoid: A1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close glossary" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
