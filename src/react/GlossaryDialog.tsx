import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GlossaryDoc } from "./glossary.js";
import { WkGlossaryIcon } from "./icons.js";
import CloseIcon from "@mui/icons-material/Close";

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
        <WkGlossaryIcon />
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
            <CloseIcon className="wk-mui-icon" sx={{ fontSize: 20 }} aria-hidden />
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
