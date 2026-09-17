import type { ChatItem } from "../../shared/types";

export function submittedPromptHistory(items: ChatItem[]): string[] {
  return items
    .filter((item) => item.kind === "user" && item.text.trim())
    .map((item) => item.text);
}

export function nextPromptHistoryIndex(
  length: number,
  current: number | null,
  direction: 1 | -1,
): number | null {
  if (!length) return null;
  if (current === null) return direction === -1 ? length - 1 : null;
  const next = current + direction;
  if (next < 0) return 0;
  if (next >= length) return null;
  return next;
}

export function isReconnectNotice(message: string): boolean {
  return /^reconnecting(?:\.{3}|…)?(?:\s+\d+\s*\/\s*\d+)?/i.test(
    message.trim(),
  );
}
