import { overlayKey, type WorkbookSnapshot } from "../model/types.js";

function input(value: number | string | boolean | null) {
  return { kind: "input" as const, value };
}

function formula(text: string) {
  return { kind: "formula" as const, formula: text };
}

function months(build: (periodId: string, label: string) => ReturnType<typeof formula> | ReturnType<typeof input>) {
  const labels = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const cells: Record<string, ReturnType<typeof formula> | ReturnType<typeof input>> = {};
  labels.forEach((label, i) => {
    const id = `2025-${String(i + 1).padStart(2, "0")}`;
    cells[id] = build(id, label);
  });
  return cells;
}

export function createPlaygroundWorkbook(): WorkbookSnapshot {
  const paramsId = "tbl-params";
  const aarsalgRow = "row-aarsalg";
  const vaekstRow = "row-vaekst";

  return {
    id: "wb-playground",
    name: "Playground 2025",
    calendar: { startMonth: "2025-01", monthCount: 12 },
    sheets: [
      { id: "sheet-params", name: "Parametre", tableIds: ["tbl-params"], locked: true },
      { id: "sheet-forud", name: "Forudsætninger", tableIds: ["tbl-salg"] },
      { id: "sheet-kap", name: "Kapacitet", tableIds: ["tbl-staff"] },
      { id: "sheet-res", name: "Resultat", tableIds: ["tbl-resultat"] },
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
          { id: aarsalgRow, key: "Årssalg", cells: { Value: input(8_000_000) } },
          { id: vaekstRow, key: "Vækst", cells: { Value: input(0.03) } },
          { id: "row-vat", key: "Vat", cells: { Value: input(0.25) } },
          { id: "row-andel-cnc", key: "AndelCNC", cells: { Value: input(0.8) } },
          { id: "row-andel-out", key: "AndelOutsource", cells: { Value: input(0.12) } },
          { id: "row-andel-plade", key: "AndelPladebuk", cells: { Value: input(0.08) } },
          {
            id: "row-start",
            key: "Start",
            cells: {
              Value: formula(
                "=IF(Params[Vækst]=0,Params[Årssalg]/12,Params[Årssalg]*Params[Vækst]/((1+Params[Vækst])^12-1))",
              ),
            },
          },
        ],
      },
      {
        id: "tbl-salg",
        name: "Salg",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [],
        rows: [
          {
            id: "row-cnc",
            key: "CNC",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[AndelCNC]")
                : formula("=[@-1][@]*(1+Params[Vækst])"),
            ),
          },
          {
            id: "row-out",
            key: "Outsource",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[AndelOutsource]")
                : formula("=[@-1][@]*(1+Params[Vækst])"),
            ),
          },
          {
            id: "row-plade",
            key: "Pladebuk",
            cells: months((_id, label) =>
              label === "Jan"
                ? formula("=Params[Start]*Params[AndelPladebuk]")
                : formula("=[@-1][@]*(1+Params[Vækst])"),
            ),
          },
          {
            id: "row-salg-total",
            key: "Total",
            cells: months(() => formula("=Salg[@][CNC]+Salg[@][Outsource]+Salg[@][Pladebuk]")),
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
                formula("=IFS(Salg[@][Total]>700000,2,Salg[@][Total]>400000,1,TRUE,1)"),
              ),
            },
          },
        ],
      },
      {
        id: "tbl-resultat",
        name: "Resultat",
        yearColumns: [{ id: "yc-2025", year: 2025, grain: "month" }],
        attributeColumns: [],
        rows: [
          {
            id: "row-oms",
            key: "Omsætning",
            cells: months(() => formula("=Salg[@][Total]")),
          },
          {
            id: "row-lon",
            key: "Løn",
            cells: months(() => formula("=Staff[@][Karol]*Staff[@][RequiredFTE]")),
          },
          {
            id: "row-res",
            key: "Resultat",
            cells: months(() => formula("=Resultat[@][Omsætning]-Resultat[@][Løn]")),
          },
        ],
      },
    ],
    scenarios: [
      {
        id: "scn-vaekst",
        name: "Vækst",
        overlays: {
          [overlayKey(paramsId, aarsalgRow, "Value")]: 10_000_000,
        },
      },
    ],
    activeScenarioId: null,
  };
}
