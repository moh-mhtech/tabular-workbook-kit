import { LocaleType, mergeLocales } from "@univerjs/core";
import { createUniver } from "@univerjs/presets";
import { UniverSheetsNodeCorePreset } from "@univerjs/preset-sheets-node-core";
import sheetsNodeCoreEnUS from "@univerjs/preset-sheets-node-core/locales/en-US";
import { evaluateWithUniver, type UniverApi } from "./run.js";
import type { FormulaEngine, SheetGrid } from "./types.js";
import type { WorkbookSnapshot } from "../model/types.js";

let shared: ReturnType<typeof createUniver> | null = null;

function nodeUniver() {
  if (!shared) {
    shared = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(sheetsNodeCoreEnUS),
      },
      presets: [UniverSheetsNodeCorePreset()],
    });
  }
  return shared;
}

export class UniverEngine implements FormulaEngine {
  evaluate(snapshot: WorkbookSnapshot): Promise<Record<string, SheetGrid>> {
    return evaluateWithUniver(nodeUniver().univerAPI as unknown as UniverApi, snapshot);
  }
}
