import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../shared/types";
import { adjacentMatchIndex, matchingMessageIds } from "./thread-search";

const items = [
  { id: "one", kind: "user", text: "Fix the sidebar" },
  { id: "two", kind: "assistant", title: "Result", text: "Sidebar fixed" },
  { id: "three", kind: "assistant", text: "Done" },
] satisfies ChatItem[];

describe("thread search", () => {
  it("matches titles and message text case-insensitively", () => {
    expect(matchingMessageIds(items, "SIDEBAR")).toEqual(["one", "two"]);
    expect(matchingMessageIds(items, "result")).toEqual(["two"]);
    expect(matchingMessageIds(items, "  ")).toEqual([]);
  });

  it("moves through and wraps matches", () => {
    expect(adjacentMatchIndex(3, -1, 1)).toBe(0);
    expect(adjacentMatchIndex(3, -1, -1)).toBe(2);
    expect(adjacentMatchIndex(3, 2, 1)).toBe(0);
    expect(adjacentMatchIndex(3, 0, -1)).toBe(2);
    expect(adjacentMatchIndex(0, 0, 1)).toBe(-1);
  });
});
