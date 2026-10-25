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
      { id: "sheet-assumptions", name: "Assumptions", tableIds: ["tbl-lines"] },
      { id: "sheet-capacity", name: "Capacity", tableIds: ["tbl-teams"] },
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
          { id: annualRow, key: "AnnualUnits", cells: { Value: input(8_000_000) } },
          { id: growthRow, key: "Growth", cells: { Value: input(0.03) } },
          { id: "row-vat", key: "Mix", cells: { Value: input(0.25) } },
          { id: "row-top-share", key: "TopShare", cells: { Value: input(0.8) } },
          { id: "row-alt-share", key: "AlternateShare", cells: { Value: input(0.12) } },
          { id: "row-last-share", key: "LastShare", cells: { Value: input(0.08) } },
          {
            id: "row-start",
            key: "Start",
            cells: {
              Value: formula(
                "=IF(Params[Growth]=0,Params[AnnualUnits]/12,Params[AnnualUnits]*Params[Growth]/((1+Params[Growth])^12-1))",
              ),
            },
          },
        ],
      },
      {
        id: "tbl-lines",
        name: "Lines",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [],
        rows: [
          {
            id: "row-red",
            key: "Red",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[TopShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-secondary",
            key: "Secondary",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[AlternateShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-channel",
            key: "Channel",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[LastShare]")
                : formula("=[@-1][@]*(1+Params[Growth])"),
            ),
          },
          {
            id: "row-total",
            key: "Total",
            cells: months(() => formula("=Lines[@][Red]+Lines[@][Secondary]+Lines[@][Channel]")),
          },
        ],
      },
      {
        id: "tbl-teams",
        name: "Teams",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [
          { id: "Role", name: "Role" },
          { id: "BaseNumber", name: "BaseNumber" },
        ],
        rows: [
          {
            id: "row-karol",
            key: "Karol",
            cells: {
              Role: input("Specialist"),
              BaseNumber: input(45000),
              ...months(() => formula("=[BaseNumber]")),
            },
          },
          {
            id: "row-required",
            key: "RequiredNum",
            cells: {
              Role: input("Count"),
              BaseNumber: input(null),
              ...months(() =>
                formula("=IFS(Lines[@][Total]>700000,2,Lines[@][Total]>400000,1,TRUE,1)"),
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
            id: "row-inbound",
            key: "Inbound",
            cells: months(() => formula("=Lines[@][Total]")),
          },
          {
            id: "row-usage",
            key: "Usage",
            cells: months(() => formula("=Teams[@][Karol]*Teams[@][RequiredNum]")),
          },
          {
            id: "row-result",
            key: "Result",
            cells: months(() => formula("=Result[@][Inbound]-Result[@][Usage]")),
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
