import { buildPeriods, parseMonthId, periodId, type Period } from "./calendar.js";
import type { Selection, TableSnapshot, TimeGrain, WorkbookSnapshot, YearColumnSnapshot } from "./types.js";

export function tableYearColumns(table: TableSnapshot): YearColumnSnapshot[] {
  return table.yearColumns ?? [];
}

export function hasTimeColumns(table: TableSnapshot): boolean {
  return tableYearColumns(table).length > 0;
}

export function hideGrowthColumn(table: TableSnapshot): boolean {
  return Boolean(table.promoteRowKeys);
}

export type YearColumnSlot = {
  id: string;
  name: string;
  yearColumnId: string;
  periodIds: string[];
};

export function yearColumnSlots(yearCol: YearColumnSnapshot, periods: Period[]): YearColumnSlot[] {
  const months = periods.filter((period) => period.year === yearCol.year);
  if (yearCol.grain === "year") {
    return [
      {
        id: String(yearCol.year),
        name: String(yearCol.year),
        yearColumnId: yearCol.id,
        periodIds: months.map((period) => period.id),
      },
    ];
  }
  if (yearCol.grain === "quarter") {
    return [1, 2, 3, 4]
      .map((quarter) => {
        const periodIds = months.filter((period) => Math.ceil(period.month / 3) === quarter).map((period) => period.id);
        return {
          id: `${yearCol.year}-Q${quarter}`,
          name: `${yearCol.year}-Q${quarter}`,
          yearColumnId: yearCol.id,
          periodIds,
        };
      })
      .filter((slot) => slot.periodIds.length);
  }
  return months.map((period) => ({
    id: period.id,
    name: period.label,
    yearColumnId: yearCol.id,
    periodIds: [period.id],
  }));
}

export function visibleTimeSlots(table: TableSnapshot, periods: Period[]): YearColumnSlot[] {
  return tableYearColumns(table).flatMap((yearCol) => yearColumnSlots(yearCol, periods));
}

export function visibleTimeColCount(table: TableSnapshot, periods: Period[]): number {
  return visibleTimeSlots(table, periods).length;
}

export function slotForColumn(table: TableSnapshot, columnId: string, periods: Period[]): YearColumnSlot | undefined {
  return visibleTimeSlots(table, periods).find(
    (slot) => slot.id === columnId || (slot.periodIds.length === 1 && slot.periodIds[0] === columnId),
  );
}

export function writePeriodIds(table: TableSnapshot, columnId: string, periods: Period[]): string[] {
  const slot = visibleTimeSlots(table, periods).find((candidate) => candidate.id === columnId);
  if (slot) return slot.periodIds;
  return [columnId];
}

export function evenSplit(total: number, count: number): number[] {
  if (count <= 0) return [];
  const parts = Array.from({ length: count }, () => total / count);
  const rest = parts.slice(0, -1).reduce((sum, value) => sum + value, 0);
  parts[count - 1] = total - rest;
  return parts;
}

export function defaultYearColumn(year: number, grain: TimeGrain = "month"): YearColumnSnapshot {
  return { id: `yc-${year}`, year, grain };
}

export function resolveTimeToken(token: string, periods: Period[]): Period[] {
  const trimmed = token.trim();
  const quarter = /^(\d{4})-Q([1-4])$/i.exec(trimmed);
  if (quarter) {
    const year = Number(quarter[1]);
    const q = Number(quarter[2]);
    return periods.filter((period) => period.year === year && Math.ceil(period.month / 3) === q);
  }
  if (/^\d{4}$/.test(trimmed)) {
    const year = Number(trimmed);
    return periods.filter((period) => period.year === year);
  }
  const month = periods.find((period) => period.id === trimmed);
  if (month) return [month];
  const byLabel = periods.find((period) => period.label.toLowerCase() === trimmed.toLowerCase());
  return byLabel ? [byLabel] : [];
}

export function selectedYearColumn(
  snapshot: WorkbookSnapshot,
  selection: Selection | null,
): { tableId: string; yearColumn: YearColumnSnapshot } | null {
  if (!selection || !("tableId" in selection)) return null;
  const table = snapshot.tables.find((candidate) => candidate.id === selection.tableId);
  if (!table) return null;
  const cols = tableYearColumns(table);
  if (!cols.length) return null;
  const columnId = "columnId" in selection ? selection.columnId : undefined;
  if (columnId) {
    const periods = buildPeriods(snapshot.calendar);
    const slot =
      slotForColumn(table, columnId, periods) ??
      visibleTimeSlots(table, periods).find((candidate) => candidate.periodIds.includes(columnId));
    const match = cols.find((col) => col.id === slot?.yearColumnId);
    if (match) return { tableId: table.id, yearColumn: match };
  }
  return { tableId: table.id, yearColumn: cols[0]! };
}

export function calendarCoveringYear(
  calendar: WorkbookSnapshot["calendar"],
  year: number,
): WorkbookSnapshot["calendar"] {
  const start = parseMonthId(calendar.startMonth);
  const startIndex = start.year * 12 + (start.month - 1);
  const endIndex = startIndex + calendar.monthCount - 1;
  const yearStart = year * 12;
  const yearEnd = year * 12 + 11;
  if (yearStart >= startIndex && yearEnd <= endIndex) return calendar;
  const nextStart = Math.min(startIndex, yearStart);
  const nextEnd = Math.max(endIndex, yearEnd);
  return {
    startMonth: periodId(Math.floor(nextStart / 12), (nextStart % 12) + 1),
    monthCount: nextEnd - nextStart + 1,
  };
}
