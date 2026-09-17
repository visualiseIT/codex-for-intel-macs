import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../shared/types";
import {
  isReconnectNotice,
  nextPromptHistoryIndex,
  submittedPromptHistory,
} from "./prompt-history";

describe("composer prompt history", () => {
  it("keeps submitted text prompts in conversation order", () => {
    const items = [
      { id: "a", kind: "user", text: "First" },
      { id: "b", kind: "assistant", text: "Reply" },
      { id: "c", kind: "user", text: "Second" },
      { id: "d", kind: "user", text: "  " },
    ] satisfies ChatItem[];
    expect(submittedPromptHistory(items)).toEqual(["First", "Second"]);
  });

  it("cycles backward and returns to the draft moving forward", () => {
    expect(nextPromptHistoryIndex(3, null, -1)).toBe(2);
    expect(nextPromptHistoryIndex(3, 2, -1)).toBe(1);
    expect(nextPromptHistoryIndex(3, 0, -1)).toBe(0);
    expect(nextPromptHistoryIndex(3, 1, 1)).toBe(2);
    expect(nextPromptHistoryIndex(3, 2, 1)).toBeNull();
    expect(nextPromptHistoryIndex(3, null, 1)).toBeNull();
  });

  it("recognizes transient reconnect warnings", () => {
    expect(isReconnectNotice("Reconnecting... 1/5")).toBe(true);
    expect(isReconnectNotice("Reconnecting… 2 / 5")).toBe(true);
    expect(isReconnectNotice("Permission denied")).toBe(false);
  });
});
