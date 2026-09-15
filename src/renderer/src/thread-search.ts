import type { ChatItem } from "../../shared/types";

export function matchingMessageIds(items: ChatItem[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return items
    .filter((item) =>
      `${item.title ?? ""}\n${item.text}`.toLocaleLowerCase().includes(needle),
    )
    .map((item) => item.id);
}

export function adjacentMatchIndex(
  count: number,
  current: number,
  direction: 1 | -1,
): number {
  if (!count) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
