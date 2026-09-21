export type GlossaryTerm = {
  term: string;
  definition: string;
  avoid?: string;
};

export type GlossarySection = {
  heading: string;
  terms: GlossaryTerm[];
};

export type GlossaryDoc = {
  title: string;
  intro: string;
  sections: GlossarySection[];
};

export function parseGlossary(markdown: string): GlossaryDoc {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = "Glossary";
  const introParts: string[] = [];
  const sections: GlossarySection[] = [];
  let section: GlossarySection | null = null;
  let term: GlossaryTerm | null = null;
  let seenHeading = false;

  const flushTerm = () => {
    if (!term || !section) return;
    term.definition = term.definition.trim();
    section.terms.push(term);
    term = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const titleMatch = /^#\s+(.+)$/.exec(line);
    if (titleMatch && title === "Glossary") {
      title = titleMatch[1]!;
      continue;
    }
    const headingMatch = /^#{2,3}\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushTerm();
      seenHeading = true;
      section = { heading: headingMatch[1]!, terms: [] };
      sections.push(section);
      continue;
    }
    const termMatch = /^\*\*(.+?)\*\*:\s*(.*)$/.exec(line);
    if (termMatch) {
      flushTerm();
      if (!section) {
        section = { heading: "Language", terms: [] };
        sections.push(section);
        seenHeading = true;
      }
      term = { term: termMatch[1]!, definition: termMatch[2] ?? "" };
      continue;
    }
    if (term && line.startsWith("_Avoid_:")) {
      term.avoid = line.slice("_Avoid_:".length).trim();
      continue;
    }
    if (term) {
      if (line) term.definition = `${term.definition} ${line}`.trim();
      continue;
    }
    if (!seenHeading && line) introParts.push(line);
  }
  flushTerm();
  return {
    title,
    intro: introParts.join(" ").trim(),
    sections: sections.filter((candidate) => candidate.terms.length > 0),
  };
}
