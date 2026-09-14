import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../shared/types";
import { firstForkPromptTurnId, prependHistoryItems } from "./history";

function item(id: string): ChatItem {
  return {
    id,
    kind: "assistant",
    title: "Codex",
    text: id,
    status: "completed",
  };
}

describe("prependHistoryItems", () => {
  it("places older items first without duplicating cursor anchors", () => {
    expect(
      prependHistoryItems(
        [item("current")],
        [item("older"), item("current")],
      ).map((entry) => entry.id),
    ).toEqual(["older", "current"]);
  });
});

describe("firstForkPromptTurnId", () => {
  it("returns the first user turn after the inherited parent boundary", () => {
    const inherited = { ...item("parent"), turnId: "parent-turn" };
    const assistant = { ...item("assistant"), turnId: "fork-turn" };
    const prompt = {
      ...item("prompt"),
      kind: "user" as const,
      turnId: "fork-turn",
    };

    expect(
      firstForkPromptTurnId([inherited, assistant, prompt], "parent-turn"),
    ).toBe("fork-turn");
  });

  it("waits until the parent boundary is loaded", () => {
    expect(firstForkPromptTurnId([item("prompt")], "parent-turn")).toBeNull();
  });
});
