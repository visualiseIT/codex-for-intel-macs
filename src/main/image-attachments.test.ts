import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareImageAttachments } from "./image-attachments";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("prepareImageAttachments", () => {
  it("prepares a supported local image for renderer preview", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-images-"));
    directories.push(directory);
    const path = join(directory, "example.png");
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await expect(prepareImageAttachments([path])).resolves.toEqual([
      {
        path,
        name: "example.png",
        size: 4,
        dataUrl: "data:image/png;base64,iVBORw==",
      },
    ]);
  });

  it("rejects unsupported files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-images-"));
    directories.push(directory);
    const path = join(directory, "notes.txt");
    await writeFile(path, "not an image");

    await expect(prepareImageAttachments([path])).rejects.toThrow(
      "not a supported image",
    );
  });
});
