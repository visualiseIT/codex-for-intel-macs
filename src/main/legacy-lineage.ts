import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

const HEADER_BYTES = 256 * 1024;
const TURN_SCAN_BYTES = 2 * 1024 * 1024;

export interface LegacyForkMetadata {
  parentId: string;
  forkedAtTurnId: string | null;
}

interface SessionHeader {
  id: string;
  parentId: string | null;
  parentEndByteOffset: number | null;
  path: string;
}

async function readLegacyHeader(path: string): Promise<SessionHeader | null> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer
      .subarray(0, bytesRead)
      .toString("utf8")
      .split("\n", 1)[0];
    const parsed = JSON.parse(header) as {
      payload?: {
        id?: unknown;
        session_id?: unknown;
        forked_from_id?: unknown;
        history_base?: { end_byte_offset?: unknown };
      };
    };
    const payload = parsed.payload ?? {};
    const id =
      typeof payload.id === "string"
        ? payload.id
        : typeof payload.session_id === "string"
          ? payload.session_id
          : "";
    if (!id) return null;
    return {
      id,
      parentId:
        typeof payload.forked_from_id === "string"
          ? payload.forked_from_id
          : null,
      parentEndByteOffset:
        typeof payload.history_base?.end_byte_offset === "number" &&
        payload.history_base.end_byte_offset >= 0
          ? payload.history_base.end_byte_offset
          : null,
      path,
    };
  } finally {
    await handle.close();
  }
}

async function readTurnIdBefore(
  path: string,
  endByteOffset: number,
): Promise<string | null> {
  const handle = await open(path, "r");
  try {
    const start = Math.max(0, endByteOffset - TURN_SCAN_BYTES);
    const buffer = Buffer.alloc(endByteOffset - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start > 0) lines.shift();
    for (const line of lines.reverse()) {
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as {
          payload?: { turn_id?: unknown; root_turn_id?: unknown };
        };
        const turnId = parsed.payload?.turn_id ?? parsed.payload?.root_turn_id;
        if (typeof turnId === "string" && turnId) return turnId;
      } catch {
        // Ignore a partial line at the history boundary.
      }
    }
    return null;
  } finally {
    await handle.close();
  }
}

export async function loadLegacyForkMetadata(
  sessionsDirectory: string,
): Promise<Map<string, LegacyForkMetadata>> {
  let entries: string[];
  try {
    entries = await readdir(sessionsDirectory, { recursive: true });
  } catch {
    return new Map();
  }
  const headers = await Promise.allSettled(
    entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => readLegacyHeader(join(sessionsDirectory, entry))),
  );
  const sessions = headers.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const paths = new Map(sessions.map((session) => [session.id, session.path]));
  const forks = await Promise.all(
    sessions.flatMap((session) => {
      if (!session.parentId) return [];
      const parentPath = paths.get(session.parentId);
      return [
        (async (): Promise<[string, LegacyForkMetadata]> => [
          session.id,
          {
            parentId: session.parentId as string,
            forkedAtTurnId:
              parentPath && session.parentEndByteOffset !== null
                ? await readTurnIdBefore(
                    parentPath,
                    session.parentEndByteOffset,
                  )
                : null,
          },
        ])(),
      ];
    }),
  );
  return new Map(forks);
}

export async function loadLegacyLineage(
  sessionsDirectory: string,
): Promise<Map<string, string>> {
  return new Map(
    [...(await loadLegacyForkMetadata(sessionsDirectory))].map(
      ([id, metadata]) => [id, metadata.parentId],
    ),
  );
}
