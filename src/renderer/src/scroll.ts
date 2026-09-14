export function isNearBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = 72,
): boolean {
  return scrollHeight - scrollTop - clientHeight < threshold;
}

export function previousPromptOffset(
  promptOffsets: number[],
  scrollTop: number,
  threshold = 20,
): number | null {
  const previous = promptOffsets.filter(
    (offset) => offset < scrollTop - threshold,
  );
  return previous.at(-1) ?? null;
}

export function nextPromptOffset(
  promptOffsets: number[],
  scrollTop: number,
  threshold = 20,
): number | null {
  return promptOffsets.find((offset) => offset > scrollTop + threshold) ?? null;
}
