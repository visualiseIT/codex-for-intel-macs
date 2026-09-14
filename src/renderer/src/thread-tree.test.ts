import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../../shared/types";
import { buildThreadProjects, mergeThreadSummaries } from "./thread-tree";

function thread(
  id: string,
  options: Partial<ThreadSummary> = {},
): ThreadSummary {
  return {
    id,
    title: id,
    preview: id,
    cwd: "/work/project-a",
    model: null,
    createdAt: 1,
    updatedAt: 1,
    status: "idle",
    forkedFromId: null,
    forkedAtTurnId: null,
    projectId: null,
    ...options,
  };
}

describe("buildThreadProjects", () => {
  it("merges a newly returned fork into a stale thread listing", () => {
    const parent = thread("parent");
    const child = thread("child", { forkedFromId: "parent" });

    expect(mergeThreadSummaries([parent], [child])).toEqual([parent, child]);
  });

  it("groups projects and nests forks under their parents", () => {
    const parent = thread("parent", { updatedAt: 10 });
    const child = thread("child", { forkedFromId: "parent", updatedAt: 20 });
    const other = thread("other", { cwd: "/work/project-b" });
    const groups = buildThreadProjects([parent, child, other], [], new Set());

    expect(groups.map((group) => group.label)).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(groups[0].roots[0].thread.id).toBe("parent");
    expect(groups[0].roots[0].children[0].thread.id).toBe("child");
  });

  it("includes a cached parent as search context", () => {
    const parent = thread("parent");
    const child = thread("child", { forkedFromId: "parent" });
    const groups = buildThreadProjects([child], [parent], new Set());

    expect(groups[0].roots[0]).toMatchObject({
      thread: { id: "parent" },
      contextOnly: true,
    });
    expect(groups[0].roots[0].children[0]).toMatchObject({
      thread: { id: "child" },
      contextOnly: false,
    });
  });

  it("keeps an unresolved fork visible as a root", () => {
    const child = thread("child", { forkedFromId: "missing" });
    const groups = buildThreadProjects([child], [], new Set());
    expect(groups[0].roots[0].missingParentId).toBe("missing");
  });

  it("keeps malformed cyclic ancestry visible as roots", () => {
    const first = thread("first", { forkedFromId: "second" });
    const second = thread("second", {
      forkedFromId: "first",
      updatedAt: 2,
    });
    const groups = buildThreadProjects([first, second], [], new Set());

    expect(groups[0].roots.map((node) => node.thread.id)).toEqual([
      "second",
      "first",
    ]);
  });
});
