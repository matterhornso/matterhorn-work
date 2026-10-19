import { constants } from "node:fs";
import { mkdir, open, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { atomicWriteTextFile } from "./atomic-file.js";

const METADATA_MAX_BYTES = 256 * 1024;

function isImageId(value: unknown): value is string {
  // Keep legacy flat IDs as well as the current img_<UUID hex> IDs.
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[^A-Za-z0-9_-]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function imageType(format: unknown): { extension: string; contentType: string } | null {
  switch (format) {
    case "png": return { extension: "png", contentType: "image/png" };
    case "jpeg": return { extension: "jpg", contentType: "image/jpeg" };
    case "webp": return { extension: "webp", contentType: "image/webp" };
    default: return null;
  }
}

function isGeneratedImage(value: unknown, imageId: string, workspaceId: string): value is MatterhornGeneratedImage {
  if (!isRecord(value) || !isImageId(imageId) || value.id !== imageId || value.workspaceId !== workspaceId) return false;
  const type = imageType(value.format);
  if (!type || value.fileName !== `${imageId}.${type.extension}` || value.contentType !== type.contentType
    || value.relativePath !== `.matterhorn-work/outputs/images/${value.fileName}`) return false;
  return isImageId(value.outputId)
    && (value.provider === "mock" || value.provider === "openai")
    && typeof value.model === "string" && typeof value.prompt === "string"
    && (value.promptRevised === undefined || typeof value.promptRevised === "string")
    && (value.promptRedacted === undefined || typeof value.promptRedacted === "boolean")
    && typeof value.size === "string" && typeof value.quality === "string"
    && typeof value.byteLength === "number" && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0
    && typeof value.sha256 === "string" && value.sha256.length === 64 && !/[^a-fA-F0-9]/.test(value.sha256)
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
    && (value.status === "generated" || value.status === "failed")
    && isRecord(value.safety) && typeof value.safety.secretsRejected === "boolean"
    && (value.safety.publicFigureWarning === undefined || typeof value.safety.publicFigureWarning === "boolean")
    && (value.safety.copyrightWarning === undefined || typeof value.safety.copyrightWarning === "boolean");
}

// The configured workspace and storage ancestors remain operator-trusted.
// Read only the opened regular leaf; do not follow a substituted final symlink.
async function readStoredFile(path: string, maxBytes: number, expectedBytes?: number): Promise<Buffer<ArrayBuffer>> {
  if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) throw new Error("Safe image file reads are unavailable");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || !Number.isSafeInteger(before.size) || before.size > maxBytes
      || (expectedBytes !== undefined && before.size !== expectedBytes)) throw new Error("Invalid image file size or type");
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(16 * 1024, maxBytes - size + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error("Image file exceeds its size limit");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    // Metadata checks detect observable changes, not an atomic content snapshot.
    if (size !== before.size || size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("Image file changed while being read");
    }
    return Buffer.concat(chunks, size);
  } finally {
    await handle.close();
  }
}

export interface GeneratedImageStoreOptions {
  workspaceRoot: string;
  workspaceId: string;
}

function imagesDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".matterhorn-work", "outputs", "images");
}

function metadataPath(workspaceRoot: string, imageId: string): string {
  return join(imagesDir(workspaceRoot), `${imageId}.metadata.json`);
}

export function imageFilePath(workspaceRoot: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || !isImageId(fileName.slice(0, dot)) || !["png", "jpg", "webp"].includes(fileName.slice(dot + 1))) {
    throw new Error("Invalid generated image filename");
  }
  return join(imagesDir(workspaceRoot), fileName);
}

export async function readGeneratedImageFile(workspaceRoot: string, image: MatterhornGeneratedImage): Promise<Buffer<ArrayBuffer>> {
  if (!isGeneratedImage(image, image.id, image.workspaceId)) throw new Error("Invalid generated image metadata");
  return readStoredFile(imageFilePath(workspaceRoot, image.fileName), image.byteLength, image.byteLength);
}

export class MatterhornGeneratedImageStore {
  private workspaceRoot: string;
  private workspaceId: string;

  constructor(options: GeneratedImageStoreOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceId = options.workspaceId;
  }

  async ensureDir(): Promise<void> {
    await mkdir(imagesDir(this.workspaceRoot), { recursive: true, mode: 0o700 });
  }

  async save(image: MatterhornGeneratedImage): Promise<void> {
    if (!isGeneratedImage(image, image.id, this.workspaceId)) throw new Error("Invalid generated image metadata");
    const content = `${JSON.stringify(image, null, 2)}\n`;
    if (Buffer.byteLength(content) > METADATA_MAX_BYTES) throw new Error("Generated image metadata exceeds its size limit");
    await this.ensureDir();
    const path = metadataPath(this.workspaceRoot, image.id);
    await atomicWriteTextFile(path, content, { mode: 0o600 });
  }

  async get(imageId: string): Promise<MatterhornGeneratedImage | null> {
    if (!isImageId(imageId)) return null;
    const path = metadataPath(this.workspaceRoot, imageId);
    try {
      const content = await readStoredFile(path, METADATA_MAX_BYTES);
      const image: unknown = JSON.parse(content.toString("utf8"));
      return isGeneratedImage(image, imageId, this.workspaceId) ? image : null;
    } catch {
      return null;
    }
  }

  async list(): Promise<MatterhornGeneratedImage[]> {
    const dir = imagesDir(this.workspaceRoot);
    const files = await readdir(dir).catch(() => []);
    const images: MatterhornGeneratedImage[] = [];
    for (const file of files) {
      if (!file.endsWith(".metadata.json")) continue;
      const image = await this.get(file.slice(0, -".metadata.json".length));
      if (image) images.push(image);
    }
    return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(imageId: string): Promise<MatterhornGeneratedImage | null> {
    const image = await this.get(imageId);
    if (!image) return null;
    await rm(metadataPath(this.workspaceRoot, imageId), { force: true });
    await rm(imageFilePath(this.workspaceRoot, image.fileName), { force: true });
    return image;
  }
}
