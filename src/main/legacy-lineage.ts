import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

const HEADER_BYTES = 256 * 1024;

async function readLegacyHeader(
  path: string,
): Promise<[string, string] | null> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer
      .subarray(0, bytesRead)
      .toString("utf8")
      .split("\n", 1)[0];
    const id = header.match(/"(?:session_id|id)"\s*:\s*"([^"]+)"/)?.[1];
    const parent = header.match(/"forked_from_id"\s*:\s*"([^"]+)"/)?.[1];
    return id && parent ? [id, parent] : null;
  } finally {
    await handle.close();
  }
}

export async function loadLegacyLineage(
  sessionsDirectory: string,
): Promise<Map<string, string>> {
  let entries: string[];
  try {
    entries = await readdir(sessionsDirectory, { recursive: true });
  } catch {
    return new Map();
  }
  const files = entries.filter((entry) => entry.endsWith(".jsonl"));
  const headers = await Promise.allSettled(
    files.map((entry) => readLegacyHeader(join(sessionsDirectory, entry))),
  );
  return new Map(
    headers.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    ),
  );
}
