/** Whether a table grid should recompute evaluated cells after a data notification. */
export function tableNeedsValuesRefresh(
  tableName: string,
  affectedTableNames: readonly string[] | null | undefined,
  displayDependents?: Readonly<Record<string, readonly string[]>>,
): boolean {
  if (!affectedTableNames?.length) return true;
  if (affectedTableNames.includes(tableName)) return true;
  if (!displayDependents) return true;
  for (const source of affectedTableNames) {
    const dependents = displayDependents[source];
    if (dependents?.includes(tableName)) return true;
  }
  return false;
}
