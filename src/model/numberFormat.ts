import type { Primitive, TableSnapshot } from "./types.js";

/** Cell format wins, then the attribute column, then period/columnFormats. */
export function resolveCellFormat(
  table: TableSnapshot,
  columnId: string,
  cell?: { format?: string },
): string | undefined {
  if (cell?.format) return cell.format;
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
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 }).format(value);
  }
  try {
    return formatExcelNumber(value, trimmed);
  } catch {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 10 }).format(value);
  }
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

  if (!mask) return `${prefix}${suffix}`;

  let n = value;
  const percent = mask.includes("%");
  if (percent) n *= 100;
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
