import type { CalendarSnapshot } from "./types.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_ALIASES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export interface Period {
  id: string;
  year: number;
  month: number;
  label: string;
  index: number;
}

export function parseMonthId(id: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(id);
  if (!match) {
    throw new Error(`Invalid period id "${id}". Expected YYYY-MM.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in period id "${id}".`);
  }
  return { year, month };
}

export function periodId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(id: string, count: number): string {
  const { year, month } = parseMonthId(id);
  const zero = year * 12 + (month - 1) + count;
  const nextYear = Math.floor(zero / 12);
  const nextMonth = (zero % 12) + 1;
  return periodId(nextYear, nextMonth);
}

export function buildPeriods(calendar: CalendarSnapshot): Period[] {
  return Array.from({ length: calendar.monthCount }, (_, index) => {
    const id = addMonths(calendar.startMonth, index);
    const { year, month } = parseMonthId(id);
    return {
      id,
      year,
      month,
      label: MONTH_LABELS[month - 1],
      index,
    };
  });
}

export function quarterId(period: Period): string {
  const q = Math.ceil(period.month / 3);
  return `${period.year}-Q${q}`;
}

export function yearId(period: Period): string {
  return String(period.year);
}

export function resolvePeriodToken(token: string, periods: Period[]): Period | undefined {
  const trimmed = token.trim();
  const byId = periods.find((p) => p.id === trimmed);
  if (byId) return byId;
  const byLabel = periods.find((p) => p.label.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) return byLabel;
  const alias = EN_ALIASES[trimmed.toLowerCase()];
  if (alias !== undefined) {
    return periods.find((p) => p.month === alias + 1);
  }
  return undefined;
}

const groupedNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return groupedNumber.format(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}
