import { overlayKey, type WorkbookSnapshot } from "../src/model/types.js";

function input(value: number | string | boolean | null) {
  return { kind: "input" as const, value };
}

function formula(text: string) {
  return { kind: "formula" as const, formula: text };
}

function months(build: (periodId: string, label: string) => ReturnType<typeof formula> | ReturnType<typeof input>) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const cells: Record<string, ReturnType<typeof formula> | ReturnType<typeof input>> = {};
  labels.forEach((label, i) => {
    const id = `2025-${String(i + 1).padStart(2, "0")}`;
    cells[id] = build(id, label);
  });
  return cells;
}

export function createSampleWorkbook(): WorkbookSnapshot {
  const paramsId = "tbl-params";
  const annualRow = "row-annual";
  const growthRow = "row-growth";

  return {
    id: "wb-sample",
    name: "Sample 2025",
    calendar: { startMonth: "2025-01", monthCount: 12 },
    sheets: [
      { id: "sheet-params", name: "Parameters", tableIds: ["tbl-params"], locked: true },
      { id: "sheet-forud", name: "Assumptions", tableIds: ["tbl-sales"] },
      { id: "sheet-kap", name: "Capacity", tableIds: ["tbl-staff"] },
      { id: "sheet-res", name: "Result", tableIds: ["tbl-result"] },
    ],
    tables: [
      {
        id: paramsId,
        name: "Params",
        locked: true,
        promoteRowKeys: true,
        yearColumns: [],
        attributeColumns: [{ id: "Value", name: "Value" }],
        rows: [
          { id: annualRow, key: "AnnualSales", cells: { Value: input(8_000_000) } },
          { id: growthRow, key: "Growth", cells: { Value: input(0.03) } },
          { id: "row-vat", key: "Vat", cells: { Value: input(0.25) } },
          { id: "row-cnc-share", key: "CncShare", cells: { Value: input(0.8) } },
          { id: "row-outsource-share", key: "OutsourceShare", cells: { Value: input(0.12) } },
          { id: "row-bend-share", key: "BendShare", cells: { Value: input(0.08) } },
          {
            id: "row-start",
            key: "Start",
            cells: {
              Value: formula(
                "=IF(Params[Growth]=0,Params[AnnualSales]/12,Params[AnnualSales]*Params[Growth]/((1+Params[Growth])^12-1))",
              ),
            },
          },
        ],
      },
      {
        id: "tbl-sales",
        name: "Sales",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [],
        rows: [
          {
            id: "row-cnc",
            key: "CNC",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[CncShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-out",
            key: "Outsource",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[OutsourceShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-bending",
            key: "Bending",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[BendShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-salg-total",
            key: "Total",
            cells: months(() => formula("=Sales[@][CNC]+Sales[@][Outsource]+Sales[@][Bending]")),
          },
        ],
      },
      {
        id: "tbl-staff",
        name: "Staff",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [
          { id: "Role", name: "Role" },
          { id: "BaseSalary", name: "BaseSalary" },
        ],
        rows: [
          {
            id: "row-karol",
            key: "Karol",
            cells: {
              Role: input("CAM Programmer"),
              BaseSalary: input(45000),
              ...months(() => formula("=[BaseSalary]")),
            },
          },
          {
            id: "row-fte",
            key: "RequiredFTE",
            cells: {
              Role: input("Capacity"),
              BaseSalary: input(null),
              ...months(() =>
                formula("=IFS(Sales[@][Total]>700000,2,Sales[@][Total]>400000,1,TRUE,1)"),
              ),
            },
          },
        ],
      },
      {
        id: "tbl-result",
        name: "Result",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [],
        rows: [
          {
            id: "row-revenue",
            key: "Revenue",
            cells: months(() => formula("=Sales[@][Total]")),
          },
          {
            id: "row-wages",
            key: "Wages",
            cells: months(() => formula("=Staff[@][Karol]*Staff[@][RequiredFTE]")),
          },
          {
            id: "row-result",
            key: "Result",
            cells: months(() => formula("=Result[@][Revenue]-Result[@][Wages]")),
          },
        ],
      },
    ],
    scenarios: [
      {
        id: "scn-growth",
        name: "Growth",
        overlays: {
          [overlayKey(paramsId, annualRow, "Value")]: 10_000_000,
        },
      },
    ],
    activeScenarioId: null,
  };
}
