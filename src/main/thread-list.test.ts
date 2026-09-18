import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../shared/types";
import { mergeRecoveredThreads } from "./thread-list";

function thread(id: string, title: string, updatedAt: number): ThreadSummary {
  return {
    id,
    title,
    preview: "",
    cwd: "/project",
    model: null,
    createdAt: updatedAt,
    updatedAt,
    status: "notLoaded",
    forkedFromId: null,
    forkedAtTurnId: null,
    projectId: null,
  };
}

describe("mergeRecoveredThreads", () => {
  it("adds empty forks omitted by thread/list and keeps newest first", () => {
    expect(
      mergeRecoveredThreads(
        [thread("listed", "Listed", 10)],
        [thread("fork", "World model", 20)],
      ).map(({ id }) => id),
    ).toEqual(["fork", "listed"]);
  });

  it("does not replace fresher listed summaries", () => {
    expect(
      mergeRecoveredThreads(
        [thread("fork", "Current name", 30)],
        [thread("fork", "Stale name", 20)],
      )[0].title,
    ).toBe("Current name");
  });

  it("applies sidebar search to recovered forks", () => {
    expect(
      mergeRecoveredThreads([], [thread("fork", "World model", 20)], "world"),
    ).toHaveLength(1);
    expect(
      mergeRecoveredThreads(
        [],
        [thread("fork", "World model", 20)],
        "unrelated",
      ),
    ).toHaveLength(0);
  });
});
