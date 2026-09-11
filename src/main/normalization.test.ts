import { describe, expect, it } from "vitest";
import {
  normalizeItem,
  normalizeNotification,
  normalizeThread,
  normalizeTurns,
} from "./normalization";

describe("Codex protocol normalization", () => {
  it("maps stored threads into sidebar summaries", () => {
    expect(
      normalizeThread({
        id: "thread-1",
        name: null,
        preview: "Fix the tests",
        cwd: "/repo",
        model: "gpt-test",
        createdAt: 10,
        updatedAt: 20,
        status: { type: "notLoaded" },
      }),
    ).toEqual({
      id: "thread-1",
      title: "Fix the tests",
      preview: "Fix the tests",
      cwd: "/repo",
      model: "gpt-test",
      createdAt: 10,
      updatedAt: 20,
      status: "notLoaded",
    });
  });

  it("maps conversation items and sorts turns oldest first", () => {
    const items = normalizeTurns([
      {
        startedAt: 20,
        items: [{ type: "agentMessage", id: "a", text: "Done" }],
      },
      {
        startedAt: 10,
        items: [
          {
            type: "userMessage",
            id: "u",
            content: [{ type: "text", text: "Please fix it" }],
          },
        ],
      },
    ]);
    expect(items.map((item) => item.id)).toEqual(["u", "a"]);
    expect(items[0]).toMatchObject({ kind: "user", text: "Please fix it" });
  });

  it("maps streamed assistant deltas", () => {
    expect(
      normalizeNotification("item/agentMessage/delta", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "Hello",
      }),
    ).toEqual({
      type: "delta",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      delta: "Hello",
    });
  });

  it("maps command completion details", () => {
    expect(
      normalizeItem({
        type: "commandExecution",
        id: "command-1",
        command: "npm test",
        aggregatedOutput: "passed",
        status: "completed",
      }),
    ).toMatchObject({
      kind: "command",
      title: "$ npm test",
      text: "passed",
      status: "completed",
    });
  });
});
