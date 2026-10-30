import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CLEARED_CELL_STYLE, DEFAULT_CELL_FONT_SIZE } from "../../model/cellStyle.js";
import type { CellStyle } from "../../model/types.js";
import { blurOnEnter } from "../blurOnEnter.js";
import {
  WkFillColorIcon,
  WkFormatBoldIcon,
  WkFormatClearIcon,
  WkFormatItalicIcon,
  WkKeyboardArrowDownIcon,
  WkKeyboardArrowUpIcon,
  WkStrikethroughIcon,
  WkTextColorIcon,
} from "../icons.js";

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
          {kind === "text" ? <WkTextColorIcon color={swatch} /> : <WkFillColorIcon color={swatch} />}
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

  const bump = (delta: number) => {
    const from = Number(draft ?? current);
    const base = Number.isFinite(from) && from > 0 ? from : DEFAULT_CELL_FONT_SIZE;
    onCommit(clampFontSize(base + delta));
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
      <span className="wk-style-size-split" aria-hidden="true" />
      <span className="wk-style-size-steppers">
        <button type="button" aria-label="Increase font size" disabled={mixed} onClick={() => bump(1)}>
          <WkKeyboardArrowUpIcon />
        </button>
        <button type="button" aria-label="Decrease font size" disabled={mixed} onClick={() => bump(-1)}>
          <WkKeyboardArrowDownIcon />
        </button>
      </span>
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
            <WkFormatBoldIcon />
          </StyleToggle>
          <StyleToggle label="Italic" pressed={italic} onToggle={() => onCommit({ italic: italic !== true })}>
            <WkFormatItalicIcon />
          </StyleToggle>
          <StyleToggle label="Strikethrough" pressed={strike} onToggle={() => onCommit({ strikethrough: strike !== true })}>
            <WkStrikethroughIcon />
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
          <WkFormatClearIcon />
        </StyleToggle>
      </div>
    </fieldset>
  );
}
