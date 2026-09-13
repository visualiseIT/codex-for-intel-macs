import type { ChatItem } from "../../shared/types";

export function prependHistoryItems(
  current: ChatItem[],
  earlier: ChatItem[],
): ChatItem[] {
  const currentIds = new Set(current.map((item) => item.id));
  return [...earlier.filter((item) => !currentIds.has(item.id)), ...current];
}
