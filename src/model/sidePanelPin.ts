import type { WorkbookViewSnapshot } from "./types.js";

/** Visible edge tab width while a panel is unpinned. */
export const SIDE_REVEAL_TAB_WIDTH = 28;

export function isExplorerPinned(view: WorkbookViewSnapshot): boolean {
  return view.explorerPinned !== false;
}

export function isPropertiesPinned(view: WorkbookViewSnapshot): boolean {
  return view.propertiesPinned !== false;
}
