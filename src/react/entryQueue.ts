export type EntryQueueState = { col: number; row: number; chars: string } | null;

export function appendEntryQueue(
  queue: EntryQueueState,
  col: number,
  row: number,
  char: string,
): EntryQueueState {
  if (queue && queue.col === col && queue.row === row) {
    return { col, row, chars: queue.chars + char };
  }
  return { col, row, chars: char };
}

export function takeEntryQueue(queue: EntryQueueState, col: number, row: number): { queue: EntryQueueState; chars: string } {
  if (!queue || queue.col !== col || queue.row !== row) return { queue, chars: "" };
  const chars = queue.chars;
  return { queue: null, chars };
}
