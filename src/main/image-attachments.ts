import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { ClipboardImageInput, ImageAttachment } from "../shared/types";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 8;
const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const MIME_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function persistClipboardImages(
  images: ClipboardImageInput[],
  directory: string,
): Promise<ImageAttachment[]> {
  if (!Array.isArray(images) || images.length > MAX_IMAGES)
    throw new Error(`Paste at most ${MAX_IMAGES} images at a time.`);
  let totalBytes = 0;
  const validated = images.map((image, index) => {
    if (!image || typeof image.mimeType !== "string")
      throw new Error("Invalid clipboard image.");
    const extension = MIME_EXTENSIONS[image.mimeType];
    if (!extension) throw new Error("Clipboard image type is not supported.");
    const data = Buffer.from(image.bytes);
    totalBytes += data.byteLength;
    if (!data.byteLength || data.byteLength > MAX_IMAGE_BYTES)
      throw new Error("A clipboard image is empty or larger than 15 MB.");
    if (totalBytes > 30 * 1024 * 1024)
      throw new Error("Attachments must be 30 MB or less in total.");
    return {
      data,
      extension,
      mimeType: image.mimeType,
      name: image.name?.trim() || `Screenshot ${index + 1}`,
    };
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return Promise.all(
    validated.map(async (image) => {
      const path = join(
        directory,
        `${Date.now()}-${randomUUID()}${image.extension}`,
      );
      await writeFile(path, image.data, { mode: 0o600 });
      return {
        path,
        name: image.name,
        size: image.data.byteLength,
        dataUrl: `data:${image.mimeType};base64,${image.data.toString("base64")}`,
      };
    }),
  );
}

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
