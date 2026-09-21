import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GlossaryDoc } from "./glossary.js";

export function GlossaryButton({
  open,
  onOpen,
  onClose,
  documents,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  documents: GlossaryDoc[];
}) {
  return (
    <>
      <button type="button" className="wk-glossary-btn" aria-label="Glossary" title="Glossary" onClick={open ? onClose : onOpen}>
        <GlossaryIcon />
      </button>
      {open ? <GlossaryDialog documents={documents} onClose={onClose} /> : null}
    </>
  );
}

function GlossaryDialog({ documents, onClose }: { documents: GlossaryDoc[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="wk-glossary-backdrop" onMouseDown={onClose}>
      <div
        className="wk-glossary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wk-glossary-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wk-glossary-head">
          <h2 id="wk-glossary-title">Glossary</h2>
          <button type="button" className="wk-glossary-close" aria-label="Close glossary" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="wk-glossary-body">
          {documents.map((doc) => (
            <GlossaryDocument key={doc.title} doc={doc} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GlossaryDocument({ doc }: { doc: GlossaryDoc }) {
  return (
    <section className="wk-glossary-doc">
      <h3>{doc.title}</h3>
      {doc.intro ? <p className="wk-glossary-intro">{doc.intro}</p> : null}
      {doc.sections.map((section) => (
        <div key={section.heading}>
          {section.heading !== "Language" ? <h4>{section.heading}</h4> : null}
          <dl>
            {section.terms.map((term) => (
              <div key={term.term} className="wk-glossary-term">
                <dt>{term.term}</dt>
                <dd>
                  {linkCode(term.definition)}
                  {term.avoid ? <p className="wk-glossary-avoid">Avoid: {term.avoid}</p> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

function linkCode(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function GlossaryIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.2 2.4h8.3c.9 0 1.6.7 1.6 1.6v12.2c0 .5-.4.9-.9.9H5.1c-1 0-1.8-.8-1.8-1.8V3.5c0-.6.5-1.1 1.1-1.1h.8Zm.2 1.6v11.7c0 .2.2.4.4.4h8.3V4c0-.2-.2-.4-.4-.4H4.4Zm10.7-.1h.6c.9 0 1.6.7 1.6 1.6v11.3c0 1-.8 1.8-1.8 1.8h-8c.3-.3.5-.7.5-1.1h7.5c.4 0 .7-.3.7-.7V5.5c0-.2-.2-.4-.4-.4h-.7V3.9Z"
      />
    </svg>
  );
}
