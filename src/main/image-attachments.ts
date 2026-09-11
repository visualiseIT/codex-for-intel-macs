import { readFile, stat } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import type { ImageAttachment } from "../shared/types";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 8;
const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function prepareImageAttachments(
  paths: string[],
): Promise<ImageAttachment[]> {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string"))
    throw new Error("Invalid image selection.");
  if (paths.length > MAX_IMAGES)
    throw new Error(`Attach at most ${MAX_IMAGES} images at a time.`);

  let totalBytes = 0;

  return Promise.all(
    paths.map(async (path) => {
      if (!isAbsolute(path)) throw new Error("Image paths must be absolute.");
      const mime = MIME_TYPES[extname(path).toLowerCase()];
      if (!mime) throw new Error(`${basename(path)} is not a supported image.`);
      const metadata = await stat(path);
      if (!metadata.isFile())
        throw new Error(`${basename(path)} is not a file.`);
      if (metadata.size > MAX_IMAGE_BYTES)
        throw new Error(`${basename(path)} is larger than 15 MB.`);
      totalBytes += metadata.size;
      if (totalBytes > 30 * 1024 * 1024)
        throw new Error("Attachments must be 30 MB or less in total.");
      const data = await readFile(path);
      return {
        path,
        name: basename(path),
        size: metadata.size,
        dataUrl: `data:${mime};base64,${data.toString("base64")}`,
      };
    }),
  );
}

export async function prepareFileReferences(
  paths: string[],
  cwd: string,
): Promise<string[]> {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string"))
    throw new Error("Invalid file selection.");
  if (!cwd || !isAbsolute(cwd))
    throw new Error("Choose a workspace before referencing files.");
  const workspace = resolve(cwd);
  return Promise.all(
    paths.map(async (path) => {
      const fullPath = resolve(path);
      const workspacePath = relative(workspace, fullPath);
      if (
        !workspacePath ||
        workspacePath === ".." ||
        workspacePath.startsWith(`..${sep}`) ||
        isAbsolute(workspacePath)
      )
        throw new Error(`${basename(path)} is outside the selected workspace.`);
      const metadata = await stat(fullPath);
      if (!metadata.isFile())
        throw new Error(`${basename(path)} is not a file.`);
      return workspacePath;
    }),
  );
}
