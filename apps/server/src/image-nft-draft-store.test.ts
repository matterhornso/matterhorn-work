import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-nft-draft-store-"));
  roots.push(root);
  const store = new MatterhornImageNftDraftStore({
    workspaceRoot: root,
    workspaceId: "ws_draft_store",
  });
  const image: MatterhornGeneratedImage = {
    id: "img_draft_store",
    workspaceId: "ws_draft_store",
    outputId: "out_draft_store",
    prompt: "A safe generated image",
    provider: "mock",
    model: "mock-image-1",
    size: "1024x1024",
    quality: "standard",
    format: "png",
    contentType: "image/png",
    fileName: "image.png",
    relativePath: ".matterhorn-work/outputs/images/image.png",
    byteLength: 1024,
    sha256: "a".repeat(64),
    createdAt: new Date().toISOString(),
    status: "generated",
    safety: {
      secretsRejected: false,
    },
  };
  const draft = await store.create(image, {
    title: "Original title",
    description: "Original description",
  });
  return { store, draft };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MatterhornImageNftDraftStore concurrency", () => {
  test("preserves independent fields across concurrent metadata edits", async () => {
    const { store, draft } = await fixture();

    await Promise.all([
      store.update(draft.id, { title: "Updated title" }),
      store.update(draft.id, { description: "Updated description" }),
    ]);

    const saved = await store.get(draft.id);
    expect(saved?.title).toBe("Updated title");
    expect(saved?.description).toBe("Updated description");
    expect(saved?.metadata.name).toBe("Updated title");
    expect(saved?.metadata.description).toBe("Updated description");
  });

  test("preserves concurrent storage and mint state transitions", async () => {
    const { store, draft } = await fixture();

    await Promise.all([
      store.updateStorageStatus(draft.id, "uploaded", {
        provider: "walrus",
        blobId: "blob-1",
        url: "https://walrus.example/blob-1",
        imageUrl: "https://walrus.example/blob-1",
      }),
      store.updateMintStatus(draft.id, "preview_ready", {
        packageId: `0x${"2".repeat(64)}`,
      }),
    ]);

    const saved = await store.get(draft.id);
    expect(saved?.storage.status).toBe("uploaded");
    expect(saved?.storage.blobId).toBe("blob-1");
    expect(saved?.metadata.imageUrl).toBe("https://walrus.example/blob-1");
    expect(saved?.mint.status).toBe("preview_ready");
    expect(saved?.mint.packageId).toBe(`0x${"2".repeat(64)}`);
  });
});
