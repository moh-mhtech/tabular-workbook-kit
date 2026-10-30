import { SIDE_REVEAL_TAB_WIDTH } from "../model/sidePanelPin.js";
import { COLUMN_GUTTER } from "./shellLayout.js";

export function shellGridTemplateColumns(
  explorerPinned: boolean,
  propertiesPinned: boolean,
  explorerWidth: number,
  propertiesWidth: number,
  explorerRevealed: boolean,
  propertiesRevealed: boolean,
): string {
  const tabCol = `${SIDE_REVEAL_TAB_WIDTH}px`;
  const explorerCol = explorerPinned
    ? `${explorerWidth}px`
    : explorerRevealed
      ? `${SIDE_REVEAL_TAB_WIDTH + explorerWidth}px`
      : tabCol;
  const explorerGap = explorerPinned ? `${COLUMN_GUTTER}px` : "0px";
  const propertiesGap = propertiesPinned ? `${COLUMN_GUTTER}px` : "0px";
  const propertiesCol = propertiesPinned
    ? `${propertiesWidth}px`
    : propertiesRevealed
      ? `${SIDE_REVEAL_TAB_WIDTH + propertiesWidth}px`
      : tabCol;
  return `${explorerCol} ${explorerGap} 1fr ${propertiesGap} ${propertiesCol}`;
}
