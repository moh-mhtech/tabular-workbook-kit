import { LocaleType, mergeLocales } from "@univerjs/core";
import { createUniver } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { evaluateWithUniver, type UniverApi } from "./run.js";
import type { FormulaEngine, SheetGrid } from "./types.js";
import type { WorkbookSnapshot } from "../model/types.js";

let shared: ReturnType<typeof createUniver> | null = null;

function browserUniver() {
  if (!shared) {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:8px;height:8px;overflow:hidden;";
    document.body.appendChild(container);
    shared = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(sheetsCoreEnUS),
      },
      presets: [UniverSheetsCorePreset({ container })],
    });
  }
  return shared;
}

export class UniverEngine implements FormulaEngine {
  evaluate(snapshot: WorkbookSnapshot): Promise<Record<string, SheetGrid>> {
    return evaluateWithUniver(browserUniver().univerAPI as unknown as UniverApi, snapshot);
  }
}
