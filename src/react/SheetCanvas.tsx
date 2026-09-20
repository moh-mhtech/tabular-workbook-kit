import { useEffect, useRef, useState } from "react";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsTablePreset } from "@univerjs/preset-sheets-table";
import sheetsTableEnUS from "@univerjs/preset-sheets-table/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-table/lib/index.css";
import { applyViewOps } from "../engine/applyView.js";
import { definedNameRefs, snapshotToUniverData } from "../engine/compileWorkbook.js";
import { diffWorkbook } from "../engine/reconcile.js";
import { layoutWorkbook, type WorkbookLayout } from "../model/layout.js";
import { canRegisterDefinedName, getCellName } from "../model/names.js";
import { hitTest } from "../model/sheetView.js";
import type { WorkbookSnapshot } from "../model/types.js";
import { handleGridClearCommand, type GridCommand } from "./gridCommands.js";
import { useSnapshot, useWorkbook } from "./WorkbookProvider.js";

type UniverApi = ReturnType<typeof createUniver>["univerAPI"];
type UniverWorkbook = ReturnType<UniverApi["createWorkbook"]>;

interface MountedUnit {
  univerAPI: UniverApi;
  workbook: UniverWorkbook;
  applied: WorkbookSnapshot;
  queue: Promise<unknown>;
  setActiveSheet(sheetId: string): void;
}

function tryCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

function bandRange(band: { headerRow: number; startCol: number; rowCount: number; colCount: number }) {
  return {
    startRow: band.headerRow,
    startColumn: band.startCol,
    endRow: band.headerRow + band.rowCount - 1,
    endColumn: band.startCol + band.colCount - 1,
  };
}

async function registerTables(workbook: UniverWorkbook, layout: WorkbookLayout, snapshot: WorkbookSnapshot) {
  for (const view of layout.sheets) {
    const sheet = workbook.getSheetBySheetId(view.sheetId);
    if (!sheet) continue;
    for (const band of view.bands) {
      const table = snapshot.tables.find((candidate) => candidate.id === band.tableId);
      if (!table) continue;
      try {
        await sheet.addTable(table.name, bandRange(band), table.id);
      } catch {
        /* bands still show as grid cells */
      }
    }
  }
}

function captureViewport(workbook: UniverWorkbook): () => void {
  const sheet = workbook.getActiveSheet();
  if (!sheet) return () => {};
  const scroll = sheet.getScrollState();
  const selected = workbook.getActiveRange()?.getRange();
  return () => {
    const rows = sheet.getMaxRows();
    const cols = sheet.getMaxColumns();
    const now = sheet.getScrollState();
    if (
      scroll.sheetViewStartRow < rows &&
      scroll.sheetViewStartColumn < cols &&
      (now.sheetViewStartRow !== scroll.sheetViewStartRow ||
        now.sheetViewStartColumn !== scroll.sheetViewStartColumn)
    ) {
      sheet.scrollToCell(scroll.sheetViewStartRow, scroll.sheetViewStartColumn);
    }
    if (!selected || selected.startRow >= rows || selected.startColumn >= cols) return;
    const current = workbook.getActiveRange()?.getRange();
    if (current && current.startRow === selected.startRow && current.startColumn === selected.startColumn) return;
    workbook.setActiveRange(sheet.getRange(selected.startRow, selected.startColumn));
  };
}

/**
 * Univer owns one live unit per page. Per-table createUniver() calls share
 * plugin identifiers, remount in a loop, and freeze the rest of the app.
 */
export function SheetCanvas() {
  const { session, activeSheetId, setActiveSheetId } = useWorkbook();
  const snapshot = useSnapshot();
  const hostRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<MountedUnit | null>(null);
  const viewRef = useRef<{ snapshot: WorkbookSnapshot; layout: WorkbookLayout }>({
    snapshot,
    layout: layoutWorkbook(snapshot),
  });
  const applyingRef = useRef(false);
  const [generation, setGeneration] = useState(0);
  const [mountError, setMountError] = useState<string | null>(null);

  useEffect(() => {
    const frame = hostRef.current;
    if (!frame) return;
    const el = document.createElement("div");
    el.className = "wk-univer-host";
    frame.replaceChildren(el);
    const current = session.getSnapshot();
    const { layout, data } = snapshotToUniverData(current);
    viewRef.current = { snapshot: current, layout };
    let univer: ReturnType<typeof createUniver>["univer"];
    let univerAPI: UniverApi;
    try {
      ({ univer, univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS, sheetsTableEnUS),
        },
        presets: [
          UniverSheetsCorePreset({
            container: el,
            header: false,
            toolbar: false,
            footer: false,
            formulaBar: false,
            contextMenu: false,
          }),
          UniverSheetsTablePreset(),
        ],
      }));
    } catch (error) {
      setMountError(error instanceof Error ? error.message : String(error));
      return;
    }
    setMountError(null);
    const workbook = univerAPI.createWorkbook(data);
    for (const item of definedNameRefs(current)) {
      if (!canRegisterDefinedName(item.name)) continue;
      try {
        workbook.insertDefinedName(item.name, item.ref);
      } catch {
        /* structured refs still evaluate */
      }
    }

    const activate = (sheetId: string) => {
      const sheet = workbook.getSheetBySheetId(sheetId);
      if (sheet) workbook.setActiveSheet(sheet);
    };
    activate(activeSheetId);
    unitRef.current = {
      univerAPI,
      workbook,
      applied: current,
      queue: registerTables(workbook, layout, current),
      setActiveSheet: activate,
    };

    const selection = workbook.onSelectionChange((ranges) => {
      const range = ranges[0];
      const sheet = workbook.getActiveSheet();
      if (!range || !sheet) return;
      const { snapshot: shown, layout: shownLayout } = viewRef.current;
      const view = shownLayout.sheets.find((candidate) => candidate.sheetId === sheet.getSheetId());
      if (!view) return;
      setActiveSheetId(view.sheetId);
      const hit = hitTest(view, shown, range.startRow, range.startColumn, shownLayout.periods);
      if (session.formulaEdit?.pointing && (hit.kind === "cell" || hit.kind === "key")) {
        if (hit.kind === "cell") {
          const named = getCellName(shownLayout, hit.tableId, hit.rowId, hit.columnId);
          session.insertFormulaRef(
            named.defined && canRegisterDefinedName(named.defined) ? named.defined : named.structured,
          );
        }
        return;
      }
      if (hit.kind === "cell") {
        session.setSelection({
          kind: "cell",
          tableId: hit.tableId,
          rowId: hit.rowId,
          columnId: hit.columnId,
        });
      } else if (hit.kind === "key") {
        session.setSelection({ kind: "row", tableId: hit.tableId, rowId: hit.rowId });
      } else if (hit.kind === "header") {
        session.setSelection({ kind: "column", tableId: hit.tableId, columnId: hit.columnId });
      } else {
        session.setSelection({ kind: "sheet", sheetId: view.sheetId });
      }
    });

    const editEnd = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditEnd, (params) => {
      if (applyingRef.current || !params.isConfirm) return;
      const view = viewRef.current.layout.sheets.find((candidate) => candidate.sheetId === params.worksheet.getSheetId());
      if (!view) return;
      params.cancel = true;
      const raw = params.value.toPlainText().replace(/[\r\n]+$/, "");
      const target = params.workbook;
      queueMicrotask(() => {
        try {
          void target.endEditingAsync(false);
        } catch {
          /* the editor went away with the previous render */
        }
        tryCall(() => session.writeGridCell(view.sheetId, params.row, params.column, raw));
      });
    });
    const clear = univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
      if (applyingRef.current) return;
      const activeRange = workbook.getActiveRange()?.getRange() ?? null;
      const currentSheetId = workbook.getActiveSheet()?.getSheetId() ?? activeSheetId;
      if (
        handleGridClearCommand(session, event as GridCommand, {
          sheetId: currentSheetId,
          range: activeRange,
        })
      ) {
        event.cancel = true;
      }
    });
    const undo = univerAPI.addEvent(univerAPI.Event.BeforeUndo, (event) => {
      event.cancel = true;
      session.undo();
    });
    const redo = univerAPI.addEvent(univerAPI.Event.BeforeRedo, (event) => {
      event.cancel = true;
      session.redo();
    });

    return () => {
      selection.dispose();
      editEnd.dispose();
      clear.dispose();
      undo.dispose();
      redo.dispose();
      unitRef.current = null;
      univer.dispose();
      el.remove();
    };
  }, [session, generation, setActiveSheetId]);

  useEffect(() => {
    const unit = unitRef.current;
    if (!unit) return;
    const ops = diffWorkbook(unit.applied, snapshot);
    unit.applied = snapshot;
    viewRef.current = { snapshot, layout: layoutWorkbook(snapshot) };
    if (!ops.length) return;
    if (ops.some((op) => op.kind === "rebuild")) {
      setGeneration((value) => value + 1);
      return;
    }
    const apply = async () => {
      if (unitRef.current !== unit) return;
      applyingRef.current = true;
      const restore = captureViewport(unit.workbook);
      try {
        await applyViewOps(unit.univerAPI, unit.workbook, ops);
        restore();
      } finally {
        applyingRef.current = false;
      }
    };
    unit.queue = unit.queue.then(apply, apply);
  }, [snapshot]);

  useEffect(() => {
    unitRef.current?.setActiveSheet(activeSheetId);
  }, [activeSheetId]);

  if (mountError) {
    return <div className="wk-canvas wk-univer-error">Univer failed to mount: {mountError}</div>;
  }
  return <div className="wk-canvas wk-univer" ref={hostRef} />;
}
