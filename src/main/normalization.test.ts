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

  it("preserves structured diffs for file change rendering", () => {
    expect(
      normalizeItem({
        type: "fileChange",
        id: "change-1",
        status: "completed",
        changes: [
          {
            path: "src/app.ts",
            kind: { type: "update", move_path: null },
            diff: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      }),
    ).toMatchObject({
      kind: "file",
      title: "1 file change",
      changes: [
        {
          path: "src/app.ts",
          kind: "update",
          diff: "@@ -1 +1 @@\n-old\n+new",
        },
      ],
    });
  });

  it("maps patch and thread lifecycle notifications", () => {
    expect(
      normalizeNotification("item/fileChange/patchUpdated", {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "change-1",
        changes: [{ path: "a.ts", kind: { type: "add" }, diff: "+hello" }],
      }),
    ).toMatchObject({
      type: "item",
      phase: "started",
      item: { id: "change-1", kind: "file" },
    });
    expect(
      normalizeNotification("thread/deleted", { threadId: "thread-1" }),
    ).toEqual({
      type: "thread-changed",
      threadId: "thread-1",
      action: "deleted",
    });
  });
});
