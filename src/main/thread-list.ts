import type { ThreadSummary } from "../shared/types";

export function mergeRecoveredThreads(
  listed: ThreadSummary[],
  recovered: ThreadSummary[],
  searchTerm = "",
): ThreadSummary[] {
  const query = searchTerm.trim().toLocaleLowerCase();
  const merged = new Map(listed.map((thread) => [thread.id, thread]));
  for (const thread of recovered) {
    if (merged.has(thread.id)) continue;
    if (
      query &&
      !`${thread.title}\n${thread.preview}\n${thread.cwd}`
        .toLocaleLowerCase()
        .includes(query)
    )
      continue;
    merged.set(thread.id, thread);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
