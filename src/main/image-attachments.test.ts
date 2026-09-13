import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  persistClipboardImages,
  prepareFileReferences,
  prepareImageAttachments,
} from "./image-attachments";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("prepareImageAttachments", () => {
  it("persists a pathless clipboard screenshot for Codex and history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-clipboard-"));
    directories.push(directory);

    const [image] = await persistClipboardImages(
      [
        {
          bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          mimeType: "image/png",
          name: "Clipboard screenshot",
        },
      ],
      directory,
    );

    expect(image).toMatchObject({
      name: "Clipboard screenshot",
      size: 4,
      dataUrl: "data:image/png;base64,iVBORw==",
    });
    await expect(readFile(image.path)).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("rejects unsupported clipboard image types", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-clipboard-"));
    directories.push(directory);
    await expect(
      persistClipboardImages(
        [
          {
            bytes: new Uint8Array([1]),
            mimeType: "image/svg+xml",
            name: "Vector",
          },
        ],
        directory,
      ),
    ).rejects.toThrow("not supported");
  });

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

  it("creates only workspace-relative references for general files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-files-"));
    directories.push(directory);
    const path = join(directory, "notes.txt");
    await writeFile(path, "notes");

    await expect(prepareFileReferences([path], directory)).resolves.toEqual([
      "notes.txt",
    ]);
    await expect(
      prepareFileReferences([path], join(directory, "nested")),
    ).rejects.toThrow("outside the selected workspace");
  });
});
