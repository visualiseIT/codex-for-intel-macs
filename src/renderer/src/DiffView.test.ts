import { describe, expect, it } from "vitest";
import { summarizeDiff } from "./DiffView";

describe("summarizeDiff", () => {
  it("counts changed lines without counting file headers", () => {
    expect(
      summarizeDiff("--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new"),
    ).toEqual({ additions: 1, deletions: 1 });
  });
});
