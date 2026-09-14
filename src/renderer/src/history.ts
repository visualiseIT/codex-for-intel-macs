import type { ChatItem } from "../../shared/types";

export function prependHistoryItems(
  current: ChatItem[],
  earlier: ChatItem[],
): ChatItem[] {
  const currentIds = new Set(current.map((item) => item.id));
  return [...earlier.filter((item) => !currentIds.has(item.id)), ...current];
}

export function firstForkPromptTurnId(
  items: ChatItem[],
  parentBoundaryTurnId: string | null,
): string | null {
  if (!parentBoundaryTurnId) return null;
  let boundaryIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].turnId === parentBoundaryTurnId) {
      boundaryIndex = index;
      break;
    }
  }
  if (boundaryIndex < 0) return null;
  return (
    items
      .slice(boundaryIndex + 1)
      .find(
        (item) => item.kind === "user" && item.turnId !== parentBoundaryTurnId,
      )?.turnId ?? null
  );
}
