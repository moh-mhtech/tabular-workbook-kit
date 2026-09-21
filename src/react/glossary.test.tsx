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
    expect(doc.sections.map((section) => section.heading)).toEqual(["Document", "Tables", "Cells", "Formulas", "Shell"]);
    const terms = doc.sections.flatMap((section) => section.terms.map((term) => term.term));
    expect(terms).toContain("Workbook");
    expect(terms).toContain("Year column");
    expect(terms).toContain("Cell style");
    expect(terms).toContain("Point");
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
