import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLegacyForkMetadata, loadLegacyLineage } from "./legacy-lineage";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("loadLegacyLineage", () => {
  it("reads old snake-case fork metadata from nested rollout headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-lineage-"));
    directories.push(root);
    const nested = join(root, "2026", "09", "08");
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(nested, "rollout.jsonl"),
      `${JSON.stringify({
        type: "session_meta",
        payload: { session_id: "child", forked_from_id: "parent" },
      })}\n{"type":"event_msg"}\n`,
    );

    await expect(loadLegacyLineage(root)).resolves.toEqual(
      new Map([["child", "parent"]]),
    );
  });

  it("ignores ordinary and unreadable entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-lineage-"));
    directories.push(root);
    await writeFile(
      join(root, "ordinary.jsonl"),
      '{"type":"session_meta","payload":{"session_id":"plain"}}\n',
    );
    await expect(loadLegacyLineage(root)).resolves.toEqual(new Map());
  });

  it("recovers the fork turn from a paginated history boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-lineage-"));
    directories.push(root);
    const parentHistory = [
      JSON.stringify({
        type: "session_meta",
        payload: { session_id: "parent" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "fork-turn" },
      }),
      "",
    ].join("\n");
    await writeFile(join(root, "parent.jsonl"), parentHistory);
    await writeFile(
      join(root, "child.jsonl"),
      `${JSON.stringify({
        type: "session_meta",
        payload: {
          session_id: "child",
          forked_from_id: "parent",
          history_base: { end_byte_offset: Buffer.byteLength(parentHistory) },
        },
      })}\n`,
    );

    await expect(loadLegacyForkMetadata(root)).resolves.toEqual(
      new Map([["child", { parentId: "parent", forkedAtTurnId: "fork-turn" }]]),
    );
  });
});
