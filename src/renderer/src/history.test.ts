import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../shared/types";
import { prependHistoryItems } from "./history";

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
