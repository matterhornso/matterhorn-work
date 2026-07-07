import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatterhornGeneratedImage,
  MatterhornImageNftDraft,
  MatterhornImageNftDraftInput,
  MatterhornNftDraftStatus,
  MatterhornNftListingStatus,
  MatterhornNftMintStatus,
  MatterhornNftStorageStatus,
} from "@matterhorn-work/types/generated-media";
import { exists } from "./utils.js";

export interface NftDraftStoreOptions {
  workspaceRoot: string;
  workspaceId: string;
}

function draftsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".matterhorn-work", "outputs", "nft-drafts");
}

function draftPath(workspaceRoot: string, draftId: string): string {
  return join(draftsDir(workspaceRoot), `${draftId}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function initialNftDraftFromImage(
  workspaceId: string,
  image: MatterhornGeneratedImage,
  input?: MatterhornImageNftDraftInput,
): MatterhornImageNftDraft {
  const draftId = `nft_${randomUUID().replace(/-/g, "")}`;
  const title = input?.title?.trim() || "Untitled NFT";
  const description = input?.description?.trim() || `Generated image NFT from ${image.provider}`;
  const attributes = input?.attributes ?? [
    { trait_type: "source", value: "matterhorn-generated" },
    { trait_type: "provider", value: image.provider },
    { trait_type: "model", value: image.model },
  ];
  return {
    id: draftId,
    workspaceId,
    imageId: image.id,
    title,
    description,
    creatorAddress: input?.creatorAddress ?? null,
    network: input?.network ?? "sui-testnet",
    metadata: {
      name: title,
      description,
      imageUrl: null,
      attributes,
      license: null,
      usageNote: "Minted from a Matterhorn-generated image. Public storage and minting are explicit.",
    },
    storage: {
      provider: "local",
      status: "local_only",
    },
    mint: {
      status: "not_ready",
    },
    listing: {
      status: "not_ready",
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export class MatterhornImageNftDraftStore {
  private workspaceRoot: string;
  private workspaceId: string;

  constructor(options: NftDraftStoreOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.workspaceId = options.workspaceId;
  }

  async ensureDir(): Promise<void> {
    await mkdir(draftsDir(this.workspaceRoot), { recursive: true });
  }

  async list(): Promise<MatterhornImageNftDraft[]> {
    const dir = draftsDir(this.workspaceRoot);
    if (!(await exists(dir))) return [];
    const files = await readdir(dir);
    const drafts: MatterhornImageNftDraft[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(join(dir, file), "utf8");
        drafts.push(JSON.parse(content) as MatterhornImageNftDraft);
      } catch {
        // ignore malformed draft files
      }
    }
    return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(draftId: string): Promise<MatterhornImageNftDraft | null> {
    const path = draftPath(this.workspaceRoot, draftId);
    if (!(await exists(path))) return null;
    try {
      const content = await readFile(path, "utf8");
      return JSON.parse(content) as MatterhornImageNftDraft;
    } catch {
      return null;
    }
  }

  async save(draft: MatterhornImageNftDraft): Promise<void> {
    await this.ensureDir();
    const path = draftPath(this.workspaceRoot, draft.id);
    await writeFile(path, JSON.stringify(draft, null, 2));
  }

  async create(image: MatterhornGeneratedImage, input?: MatterhornImageNftDraftInput): Promise<MatterhornImageNftDraft> {
    const draft = initialNftDraftFromImage(this.workspaceId, image, input);
    await this.save(draft);
    return draft;
  }

  async update(draftId: string, input: MatterhornImageNftDraftInput): Promise<MatterhornImageNftDraft | null> {
    const draft = await this.get(draftId);
    if (!draft) return null;

    if (input.title?.trim()) {
      draft.title = input.title.trim();
      draft.metadata.name = input.title.trim();
    }
    if (input.description?.trim() !== undefined) {
      draft.description = input.description.trim();
      draft.metadata.description = input.description.trim();
    }
    if (input.creatorAddress !== undefined) {
      draft.creatorAddress = input.creatorAddress || null;
    }
    if (input.network) {
      draft.network = input.network;
    }
    if (input.metadata) {
      draft.metadata = { ...draft.metadata, ...input.metadata };
    }
    if (input.attributes) {
      draft.metadata.attributes = input.attributes;
    }
    if (input.listingPriceMist !== undefined && draft.listing.status !== "listed") {
      draft.listing.priceMist = input.listingPriceMist || null;
    }

    draft.updatedAt = nowIso();
    await this.save(draft);
    return draft;
  }

  async updateStorageStatus(
    draftId: string,
    status: MatterhornNftStorageStatus,
    updates?: { blobId?: string; url?: string; error?: string },
  ): Promise<MatterhornImageNftDraft | null> {
    const draft = await this.get(draftId);
    if (!draft) return null;
    draft.storage.status = status;
    if (updates?.blobId !== undefined) draft.storage.blobId = updates.blobId || null;
    if (updates?.url !== undefined) draft.storage.url = updates.url || null;
    if (updates?.error !== undefined) draft.storage.error = updates.error || null;
    draft.updatedAt = nowIso();
    this.deriveDraftStatus(draft);
    await this.save(draft);
    return draft;
  }

  async updateMintStatus(
    draftId: string,
    status: MatterhornNftMintStatus,
    updates?: { transactionDigest?: string; objectId?: string; packageId?: string; error?: string },
  ): Promise<MatterhornImageNftDraft | null> {
    const draft = await this.get(draftId);
    if (!draft) return null;
    draft.mint.status = status;
    if (updates?.transactionDigest !== undefined) draft.mint.transactionDigest = updates.transactionDigest || null;
    if (updates?.objectId !== undefined) draft.mint.objectId = updates.objectId || null;
    if (updates?.packageId !== undefined) draft.mint.packageId = updates.packageId || null;
    if (updates?.error !== undefined) draft.mint.error = updates.error || null;
    draft.updatedAt = nowIso();
    this.deriveDraftStatus(draft);
    await this.save(draft);
    return draft;
  }

  async updateListingStatus(
    draftId: string,
    status: MatterhornNftListingStatus,
    updates?: { kioskId?: string; transferPolicyId?: string; priceMist?: string; error?: string },
  ): Promise<MatterhornImageNftDraft | null> {
    const draft = await this.get(draftId);
    if (!draft) return null;
    draft.listing.status = status;
    if (updates?.kioskId !== undefined) draft.listing.kioskId = updates.kioskId || null;
    if (updates?.transferPolicyId !== undefined) draft.listing.transferPolicyId = updates.transferPolicyId || null;
    if (updates?.priceMist !== undefined) draft.listing.priceMist = updates.priceMist || null;
    if (updates?.error !== undefined) draft.listing.error = updates.error || null;
    draft.updatedAt = nowIso();
    this.deriveDraftStatus(draft);
    await this.save(draft);
    return draft;
  }

  private deriveDraftStatus(draft: MatterhornImageNftDraft): void {
    if (draft.listing.status === "listed") {
      // @ts-expect-error status union is derived
      draft.status = "listed";
    } else if (draft.mint.status === "confirmed") {
      // @ts-expect-error status union is derived
      draft.status = "minted";
    } else if (draft.mint.status === "preview_ready") {
      // @ts-expect-error status union is derived
      draft.status = "mint_preview_ready";
    } else if (draft.storage.status === "uploaded" || draft.storage.status === "ready_to_upload") {
      // @ts-expect-error status union is derived
      draft.status = "storage_ready";
    } else {
      // @ts-expect-error status union is derived
      draft.status = "draft";
    }
  }
}

export function hashImageForNftId(image: MatterhornGeneratedImage): string {
  return createHash("sha256").update(image.id).update(image.sha256).digest("hex").slice(0, 16);
}
