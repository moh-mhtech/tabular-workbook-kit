import { useEffect, useRef, useState, type DragEvent } from "react";
import type { WorkbookSession } from "../session/WorkbookSession.js";
import {
  applyExplorerDropHint,
  dropHintsEqual,
  readExplorerDragPayload,
  resolveExplorerDropHintForNavOver,
  resolveExplorerTableListDropHint,
  type ExplorerDragPayload,
  type ExplorerDropHint,
} from "./explorerDrag.js";

function allowExplorerDrop(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

export function useExplorerDrag(
  session: WorkbookSession,
  lastSheetId: string | undefined,
  runDrop: (apply: () => void) => void = (apply) => apply(),
) {
  const dragPayloadRef = useRef<ExplorerDragPayload | null>(null);
  const dropHintRef = useRef<ExplorerDropHint | null>(null);
  const [dropHint, setDropHint] = useState<ExplorerDropHint | null>(null);

  useEffect(() => () => document.body.classList.remove("wk-explorer-dragging"), []);

  const beginDrag = (payload: ExplorerDragPayload) => {
    dragPayloadRef.current = payload;
    document.body.classList.add("wk-explorer-dragging");
  };

  const clearDragChrome = () => {
    dragPayloadRef.current = null;
    dropHintRef.current = null;
    setDropHint(null);
    document.body.classList.remove("wk-explorer-dragging");
  };

  const endDragAfterRelease = () => {
    document.body.classList.remove("wk-explorer-dragging");
    queueMicrotask(clearDragChrome);
  };

  const updateDropHint = (next: ExplorerDropHint | null) => {
    dropHintRef.current = next;
    setDropHint((prev) => (dropHintsEqual(prev, next) ? prev : next));
  };

  const commitExplorerDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = readExplorerDragPayload(event.dataTransfer, dragPayloadRef.current);
    const hint = dropHintRef.current;
    if (!payload || !hint) return;
    runDrop(() => applyExplorerDropHint(session, payload, hint));
    clearDragChrome();
  };

  const onNavDragOverCapture = (event: DragEvent) => {
    if (dragPayloadRef.current) allowExplorerDrop(event);
  };

  const onNavDragOver = (event: DragEvent) => {
    const payload = dragPayloadRef.current;
    if (!payload) return;
    allowExplorerDrop(event);
    const hint = resolveExplorerDropHintForNavOver(
      payload,
      event.currentTarget as Element,
      event.target as Element,
      event.clientY,
      lastSheetId,
    );
    updateDropHint(hint);
  };

  const onTableListDragOver = (event: DragEvent, sheetId: string) => {
    const payload = dragPayloadRef.current;
    if (!payload || payload.kind !== "table") return;
    allowExplorerDrop(event);
    updateDropHint(
      resolveExplorerTableListDropHint(payload.id, sheetId, event.currentTarget as Element, event.clientY),
    );
    event.stopPropagation();
  };

  const onSheetAppendDragOver = (event: DragEvent) => {
    const payload = dragPayloadRef.current;
    if (!payload || payload.kind !== "sheet" || !lastSheetId || payload.id === lastSheetId) return;
    allowExplorerDrop(event);
    updateDropHint({ placement: "after-sheet", sheetId: lastSheetId });
  };

  return {
    dropHint,
    beginDrag,
    commitExplorerDrop,
    endDragAfterRelease,
    onNavDragOverCapture,
    onNavDragOver,
    onTableListDragOver,
    onSheetAppendDragOver,
    allowExplorerDrop,
  };
}
