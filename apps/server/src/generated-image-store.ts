import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { exists } from "./utils.js";

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
  return join(imagesDir(workspaceRoot), fileName);
}

export class MatterhornGeneratedImageStore {
  private workspaceRoot: string;
  private workspaceId: string;

  constructor(options: GeneratedImageStoreOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceId = options.workspaceId;
  }

  async ensureDir(): Promise<void> {
    await mkdir(imagesDir(this.workspaceRoot), { recursive: true });
  }

  async save(image: MatterhornGeneratedImage): Promise<void> {
    await this.ensureDir();
    const path = metadataPath(this.workspaceRoot, image.id);
    await writeFile(path, JSON.stringify(image, null, 2));
  }

  async get(imageId: string): Promise<MatterhornGeneratedImage | null> {
    const path = metadataPath(this.workspaceRoot, imageId);
    if (!(await exists(path))) return null;
    try {
      const content = await readFile(path, "utf8");
      return JSON.parse(content) as MatterhornGeneratedImage;
    } catch {
      return null;
    }
  }

  async list(): Promise<MatterhornGeneratedImage[]> {
    const dir = imagesDir(this.workspaceRoot);
    if (!(await exists(dir))) return [];
    const files = await readdir(dir);
    const images: MatterhornGeneratedImage[] = [];
    for (const file of files) {
      if (!file.endsWith(".metadata.json")) continue;
      try {
        const content = await readFile(join(dir, file), "utf8");
        images.push(JSON.parse(content) as MatterhornGeneratedImage);
      } catch {
        // ignore malformed metadata files
      }
    }
    return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
