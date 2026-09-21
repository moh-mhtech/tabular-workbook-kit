import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CLEARED_CELL_STYLE, DEFAULT_CELL_FONT_SIZE } from "../../model/cellStyle.js";
import type { CellStyle } from "../../model/types.js";
import { blurOnEnter } from "../blurOnEnter.js";

const MIN_FONT_SIZE = 1;
const MAX_FONT_SIZE = 96;
const POPOVER_WIDTH = 212;

/** Columns are hues (grey first); rows are light → dark with even-ish steps. */
export const COLOR_PALETTE: string[][] = [
  ["#ffffff", "#e5e7eb", "#9ca3af", "#6b7280", "#374151", "#111827"],
  ["#fee2e2", "#fecaca", "#f87171", "#ef4444", "#b91c1c", "#991b1b"],
  ["#ffedd5", "#fed7aa", "#fb923c", "#f97316", "#c2410c", "#9a3412"],
  ["#fef9c3", "#fde68a", "#facc15", "#eab308", "#a16207", "#854d0e"],
  ["#dcfce7", "#bbf7d0", "#4ade80", "#22c55e", "#15803d", "#166534"],
  ["#ccfbf1", "#99f6e4", "#2dd4bf", "#14b8a6", "#0f766e", "#115e59"],
  ["#dbeafe", "#bfdbfe", "#60a5fa", "#3b82f6", "#1d4ed8", "#1e40af"],
  ["#e0e7ff", "#c7d2fe", "#818cf8", "#6366f1", "#4338ca", "#3730a3"],
  ["#f3e8ff", "#e9d5ff", "#c084fc", "#a855f7", "#7e22ce", "#6b21a8"],
  ["#fce7f3", "#fbcfe8", "#f472b6", "#ec4899", "#be185d", "#9d174d"],
];

function sharedFlag(values: Array<boolean | undefined>): boolean | "mixed" {
  if (!values.length) return false;
  const first = Boolean(values[0]);
  return values.every((value) => Boolean(value) === first) ? first : "mixed";
}

function sharedText(values: Array<string | undefined>): string {
  if (!values.length) return "";
  const first = values[0] ?? "";
  return values.every((value) => (value ?? "") === first) ? first : "*";
}

function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function parseHex(raw: string): string | undefined {
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toLowerCase() : undefined;
}

function ColorWell({
  label,
  value,
  fallback,
  kind,
  onCommit,
}: {
  label: string;
  value: string;
  fallback: string;
  kind: "text" | "fill";
  onCommit: (value: string | undefined) => void;
}) {
  const mixed = value === "*";
  const hex = !mixed && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "";
  const swatch = hex || fallback;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(hex);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const shadeCount = COLOR_PALETTE[0]?.length ?? 0;

  useEffect(() => {
    setDraft(hex);
  }, [hex]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(Math.max(8, rect.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - 8);
      const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
      setPos({ top, left });
    };
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commitHex = (raw: string) => {
    const next = parseHex(raw);
    if (!next) return;
    onCommit(next);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`wk-style-color${mixed ? " is-mixed" : ""}`}
        aria-label={`${label} color`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${label} color`}
        disabled={mixed}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="wk-style-color-face" aria-hidden="true">
          {kind === "text" ? <TextColorIcon color={swatch} /> : <FillColorIcon color={swatch} />}
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="wk-color-popover"
              role="dialog"
              aria-label={`${label} color palette`}
              style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
            >
              <div
                className="wk-color-grid"
                style={{ gridTemplateColumns: `repeat(${COLOR_PALETTE.length}, 1fr)` }}
              >
                {Array.from({ length: shadeCount }, (_, row) =>
                  COLOR_PALETTE.map((column) => {
                    const color = column[row]!;
                    return (
                      <button
                        key={`${row}-${color}`}
                        type="button"
                        className={`wk-color-swatch${color.toLowerCase() === hex.toLowerCase() ? " is-selected" : ""}`}
                        style={{ background: color }}
                        aria-label={color}
                        title={color}
                        onClick={() => {
                          onCommit(color);
                          setOpen(false);
                        }}
                      />
                    );
                  }),
                )}
              </div>
              <div className="wk-color-popover-foot">
                <button
                  type="button"
                  className="wk-color-default"
                  onClick={() => {
                    onCommit(undefined);
                    setOpen(false);
                  }}
                >
                  {kind === "fill" ? "None" : "Default"}
                </button>
                <input
                  aria-label={`${label} color hex`}
                  value={draft}
                  placeholder={kind === "fill" ? undefined : fallback}
                  spellCheck={false}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setDraft(raw);
                    const next = parseHex(raw);
                    if (next) onCommit(next);
                  }}
                  onBlur={() => {
                    if (draft.trim() === "") onCommit(undefined);
                    else commitHex(draft);
                    setDraft(hex);
                  }}
                  onKeyDown={blurOnEnter}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TextColorIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.05 2.35 11.7 12h-1.85l-.8-2.25H6.95L6.15 12H4.3L8.05 2.35Zm-1.7 6.15h3.3L8.05 4.65 6.35 8.5Z"
      />
      <rect x="2.4" y="13.2" width="11.2" height="2.1" rx="0.6" fill={color} stroke="#c5d0dc" strokeWidth="0.4" />
    </svg>
  );
}

function FillColorIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.15 1.85c.5-.5 1.32-.5 1.82 0l1.9 1.9c.5.5.5 1.32 0 1.82L7.15 12.3 3.2 11.25 10.15 1.85Z"
      />
      <rect x="2.4" y="13.2" width="11.2" height="2.1" rx="0.6" fill={color} stroke="#c5d0dc" strokeWidth="0.4" />
    </svg>
  );
}

function StyleToggle({
  label,
  pressed,
  onToggle,
  children,
}: {
  label: string;
  pressed?: boolean | "mixed";
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`wk-style-toggle${pressed === true ? " is-active" : ""}${pressed === "mixed" ? " is-mixed" : ""}`}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed === true}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}

function BoldIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.5 2.25h5.1c2.15 0 3.55 1.12 3.55 2.82 0 1.12-.62 2.02-1.68 2.42 1.32.38 2.13 1.4 2.13 2.78 0 1.92-1.58 3.23-4.02 3.23H3.5V2.25Zm2.35 4.7h2.5c.95 0 1.5-.5 1.5-1.2 0-.72-.55-1.18-1.5-1.18H5.85v2.38Zm0 5.55h2.82c1.1 0 1.78-.55 1.78-1.38 0-.85-.68-1.37-1.8-1.37H5.85v2.75Z"
      />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M6.4 2.25h6.35v1.85H10.6L7.85 12h2.55v1.85H3.9V12h2.2L8.9 4.1H6.4V2.25Z" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.1 15.2 5.4 5.1h2.2l3.3 10.1H8.6l-.6-1.85H4.85L4.25 15.2H2.1Zm2.95-3.4h2.55L6.45 8.05 5.05 11.8Zm6.25 3.4V8.05h1.85c2 0 3.2.95 3.2 2.45 0 1.55-1.2 2.5-3.25 2.5h-.55v2.2H11.3Zm1.85-3.55h.45c.9 0 1.4-.45 1.4-1.05s-.5-1-1.4-1h-.45v2.05Z"
      />
      <rect x="1" y="9.05" width="18" height="2.15" rx="0.4" fill="currentColor" />
    </svg>
  );
}

function ClearFormatIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.4 2.5 8.6 12H6.85l-.7-2.15H3.5L2.8 12H1.05L4.25 2.5h1.15Zm-1.55 6.15h2.55L5.15 4.7 3.85 8.65Z"
      />
      <path
        fill="none"
        stroke="#d32f2f"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M9.5 9.6 13.7 13.8M13.7 9.6 9.5 13.8"
      />
    </svg>
  );
}

function FontSizeStepper({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (fontSize: number | undefined) => void;
}) {
  const mixed = value === "*";
  const parsed = Number(value);
  const current = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CELL_FONT_SIZE;
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [value]);

  const commitRaw = (raw: string) => {
    const next = Number(raw);
    onCommit(Number.isFinite(next) && next > 0 ? clampFontSize(next) : undefined);
  };

  return (
    <span className="wk-style-size">
      <input
        type="number"
        aria-label="Font size"
        title="Font size"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        value={mixed ? "" : (draft ?? current)}
        disabled={mixed}
        onFocus={() => setDraft(String(current))}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          if (raw === "") return;
          const next = Number(raw);
          if (Number.isFinite(next) && next > 0) onCommit(clampFontSize(next));
        }}
        onBlur={() => {
          const next = draft;
          setDraft(null);
          if (next === null) return;
          commitRaw(next);
        }}
        onKeyDown={blurOnEnter}
      />
    </span>
  );
}

export function StyleField({
  values,
  onCommit,
}: {
  values: Array<CellStyle | undefined>;
  onCommit: (style: CellStyle) => void;
}) {
  const bold = sharedFlag(values.map((style) => style?.bold));
  const italic = sharedFlag(values.map((style) => style?.italic));
  const strike = sharedFlag(values.map((style) => style?.strikethrough));
  const textColor = sharedText(values.map((style) => style?.textColor));
  const fillColor = sharedText(values.map((style) => style?.fillColor));
  const fontSize = sharedText(values.map((style) => (style?.fontSize ? String(style.fontSize) : "")));
  return (
    <fieldset className="wk-style-field" aria-label="Style">
      <div className="wk-style-toolbar">
        <div className="wk-style-toggles" role="group" aria-label="Font style">
          <StyleToggle label="Bold" pressed={bold} onToggle={() => onCommit({ bold: bold !== true })}>
            <BoldIcon />
          </StyleToggle>
          <StyleToggle label="Italic" pressed={italic} onToggle={() => onCommit({ italic: italic !== true })}>
            <ItalicIcon />
          </StyleToggle>
          <StyleToggle label="Strikethrough" pressed={strike} onToggle={() => onCommit({ strikethrough: strike !== true })}>
            <StrikeIcon />
          </StyleToggle>
        </div>
        <div className="wk-style-colors" role="group" aria-label="Colors">
          <ColorWell
            label="Text"
            kind="text"
            value={textColor}
            fallback="#1e3a5f"
            onCommit={(next) => onCommit({ textColor: next })}
          />
          <ColorWell
            label="Fill"
            kind="fill"
            value={fillColor}
            fallback="#ffffff"
            onCommit={(next) => onCommit({ fillColor: next })}
          />
        </div>
        <FontSizeStepper value={fontSize} onCommit={(next) => onCommit({ fontSize: next })} />
        <StyleToggle label="Clear formatting" onToggle={() => onCommit(CLEARED_CELL_STYLE)}>
          <ClearFormatIcon />
        </StyleToggle>
      </div>
    </fieldset>
  );
}
