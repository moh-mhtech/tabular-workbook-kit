import { bandCellKey, type Primitive, type TableSnapshot } from "./types.js";

/** Cell format wins, then the attribute column, then period/columnFormats. */
export function resolveCellFormat(
  table: TableSnapshot,
  columnId: string,
  cell?: { format?: string },
  rowId?: string,
): string | undefined {
  if (cell?.format) return cell.format;
  const band = rowId ? table.bandCellFormats?.[bandCellKey(rowId, columnId)] : undefined;
  if (band) return band;
  const attr = table.attributeColumns.find((column) => column.id === columnId);
  return attr?.format ?? table.columnFormats?.[columnId];
}

export function rawEditValue(value: Primitive): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

export function formatDisplayValue(value: Primitive, pattern?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  const trimmed = pattern?.trim();
  if (!trimmed || /^general$/i.test(trimmed)) {
    return formatSignificantNumber(value, { digits: 3, grouping: true });
  }
  try {
    return formatExcelNumber(value, trimmed);
  } catch {
    return formatSignificantNumber(value, { digits: 3, grouping: true });
  }
}

const COMPACT_UNITS = [
  { div: 1e12, suffix: "T" },
  { div: 1e9, suffix: "B" },
  { div: 1e6, suffix: "M" },
  { div: 1e3, suffix: "K" },
] as const;

type CompactUnit = (typeof COMPACT_UNITS)[number]["suffix"];

function unitFromMask(mask: string): CompactUnit | undefined {
  const match = /([KMBT])/i.exec(mask);
  return match ? (match[1]!.toUpperCase() as CompactUnit) : undefined;
}

/** Significant digits, but never fewer digits than the integer part. */
function formatSignificantNumber(
  value: number,
  options: { digits: number; grouping: boolean; compact?: boolean; unit?: CompactUnit },
): string {
  const digits = Math.min(21, Math.max(1, options.digits));
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (options.unit) {
    const spec = COMPACT_UNITS.find((unit) => unit.suffix === options.unit)!;
    if (value === 0) return `${presentCanonical("0", options.grouping)}${options.unit}`;
    return `${sign}${presentCanonical(canonicalFrom(abs / spec.div, digits), options.grouping)}${options.unit}`;
  }
  if (value === 0) return presentCanonical("0", options.grouping);
  if (options.compact && abs >= 1000) {
    return `${sign}${formatCompact(abs, digits)}`;
  }
  return `${sign}${presentCanonical(canonicalFrom(abs, digits), options.compact ? false : options.grouping)}`;
}

function canonicalFrom(abs: number, digits: number): string {
  if (abs === 0) return "0";
  const integerDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 0;
  return integerDigits > digits ? String(Math.trunc(abs)) : trimInsignificantZeros(abs.toPrecision(digits));
}

function formatCompact(abs: number, digits: number): string {
  let index = COMPACT_UNITS.findIndex((unit) => abs >= unit.div);
  if (index < 0) return presentCanonical(canonicalFrom(abs, digits), false);
  while (index >= 0) {
    const unit = COMPACT_UNITS[index]!;
    const canonical = canonicalFrom(abs / unit.div, digits);
    if (Number(canonical) >= 1000 && index > 0) {
      index -= 1;
      continue;
    }
    return `${presentCanonical(canonical, false)}${unit.suffix}`;
  }
  const top = COMPACT_UNITS[0]!;
  return `${presentCanonical(canonicalFrom(abs / top.div, digits), false)}${top.suffix}`;
}

function presentCanonical(canonical: string, grouping: boolean): string {
  const decimal = new Intl.NumberFormat(undefined).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  const group = new Intl.NumberFormat(undefined).formatToParts(1000).find((part) => part.type === "group")?.value ?? ",";
  const [intPart, frac] = canonical.split(".");
  const int = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group) : intPart;
  return frac !== undefined ? `${int}${decimal}${frac}` : int;
}

function stripTrailingZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

function trimInsignificantZeros(text: string): string {
  if (/e/i.test(text)) return expandScientific(text);
  return stripTrailingZeros(text);
}

function expandScientific(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (!match) return text;
  const [, sign = "", intPart, frac = "", expStr] = match;
  const exp = Number(expStr);
  const digits = `${intPart}${frac}`;
  const point = intPart.length + exp;
  if (point <= 0) {
    return stripTrailingZeros(`${sign}0.${"0".repeat(-point)}${digits}`);
  }
  if (point >= digits.length) {
    return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  }
  return stripTrailingZeros(`${sign}${digits.slice(0, point)}.${digits.slice(point)}`);
}

function formatExcelNumber(value: number, pattern: string): string {
  const sections = splitSections(pattern);
  if (value < 0 && sections[1] !== undefined) {
    return formatSection(Math.abs(value), sections[1]);
  }
  if (value === 0 && sections[2] !== undefined) {
    return formatSection(0, sections[2]);
  }
  const formatted = formatSection(Math.abs(value), sections[0] ?? "");
  if (value < 0 && !formatted.includes("-")) return `-${formatted}`;
  return formatted;
}

function splitSections(pattern: string): string[] {
  const sections: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
      continue;
    }
    if (ch === "\\" && !quoted) {
      current += ch + (pattern[++i] ?? "");
      continue;
    }
    if (ch === ";" && !quoted) {
      sections.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  sections.push(current);
  return sections;
}

function formatSection(value: number, section: string): string {
  let prefix = "";
  let suffix = "";
  let mask = "";
  let seenMask = false;
  let i = 0;
  while (i < section.length) {
    const ch = section[i]!;
    if (ch === '"') {
      i += 1;
      let lit = "";
      while (i < section.length && section[i] !== '"') lit += section[i++];
      if (section[i] === '"') i += 1;
      if (seenMask) suffix += lit;
      else prefix += lit;
      continue;
    }
    if (ch === "\\") {
      const lit = section[i + 1] ?? "";
      i += 2;
      if (seenMask) suffix += lit;
      else prefix += lit;
      continue;
    }
    if (ch === "[") {
      while (i < section.length && section[i] !== "]") i += 1;
      if (section[i] === "]") i += 1;
      continue;
    }
    if (ch === "A" || ch === "a") {
      seenMask = true;
      mask += ch;
      i += 1;
      continue;
    }
    if (seenMask && suffix === "" && /[KMBT]/i.test(ch)) {
      mask += ch;
      i += 1;
      continue;
    }
    if (ch === "G" || ch === "g") {
      seenMask = true;
      mask += ch;
      i += 1;
      while (i < section.length && /[0-9]/.test(section[i]!)) {
        mask += section[i];
        i += 1;
      }
      continue;
    }
    if (ch === "0" || ch === "#" || ch === "?" || ch === "." || ch === "," || ch === "%") {
      seenMask = true;
      mask += ch;
      i += 1;
      continue;
    }
    if (seenMask) suffix += ch;
    else prefix += ch;
    i += 1;
  }

  if (!mask && /^[KMBT]$/i.test(prefix) && !suffix) {
    mask = prefix;
    prefix = "";
  }
  if (!mask) return `${prefix}${suffix}`;

  let n = value;
  const percent = mask.includes("%");
  if (percent) n *= 100;
  const compactAuto = /a/i.test(mask);
  const unit = compactAuto ? undefined : unitFromMask(mask);
  const compact = compactAuto || !!unit;
  const sig = /g(\d*)/i.exec(mask);
  if (sig || compact) {
    const grouping = !compactAuto && /[#0]\s*,\s*[#0]/.test(mask);
    const formatted = formatSignificantNumber(n, {
      digits: sig?.[1] ? Number(sig[1]) : 3,
      grouping,
      compact,
      unit,
    });
    const pct = percent && !prefix.includes("%") && !suffix.includes("%") ? "%" : "";
    return `${prefix}${formatted}${pct}${suffix}`;
  }
  const maskNoPct = mask.replace(/%/g, "");
  const [intRaw = "", fracRaw = ""] = maskNoPct.split(".");
  let intMask = intRaw;
  let scale = 0;
  while (intMask.endsWith(",")) {
    scale += 1;
    intMask = intMask.slice(0, -1);
  }
  if (scale) n /= 1000 ** scale;
  const grouping = /[#0]\s*,\s*[#0]/.test(intMask);
  const minInt = Math.min(21, Math.max((intMask.match(/0/g) ?? []).length, 1));
  const minFrac = (fracRaw.match(/0/g) ?? []).length;
  const maxFrac = (fracRaw.match(/[0#?]/g) ?? []).length;
  const formatted = new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: minInt,
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
    useGrouping: grouping,
  }).format(n);
  const pct = percent && !prefix.includes("%") && !suffix.includes("%") ? "%" : "";
  return `${prefix}${formatted}${pct}${suffix}`;
}
