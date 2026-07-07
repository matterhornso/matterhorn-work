import { readFile } from "node:fs/promises";
import type {
  MatterhornImageGenerationInput,
  MatterhornImageListResponse,
  MatterhornImageNftDraftInput,
  MatterhornImageNftDraftListResponse,
  MatterhornImageNftDraftResponse,
  MatterhornImageResponse,
  MatterhornNftListingPreviewResponse,
  MatterhornNftMintPreviewResponse,
  MatterhornNftReceiptRequest,
  MatterhornNftReceiptResponse,
} from "@matterhorn-work/types/generated-media";
import type { ServerConfig, TokenScope, WorkspaceInfo } from "./types.js";
import { ApiError } from "./errors.js";
import {
  createImageGenerationProvider,
  detectSecretShapedInput,
  resolveImageGenerationProviderFromEnv,
} from "./image-generation-provider.js";
import { MatterhornGeneratedImageStore, imageFilePath } from "./generated-image-store.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import { resolveNftEnvironmentConfig } from "./image-nft-capabilities.js";
import { recordAudit } from "./audit.js";
import { recordTaskEvent } from "./task-events.js";
import { shortId } from "./utils.js";

export interface RequestContext {
  actor?: { type: "remote" | "host"; scope?: TokenScope };
  params: Record<string, string>;
  url: URL;
  request: Request;
}

export type RouteAdder = (
  method: string,
  path: string,
  authMode: "none" | "client" | "host" | "host-token",
  handler: (ctx: RequestContext) => Promise<Response>,
) => void;

export type WorkspaceResolver = (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;

export function addGeneratedMediaRoutes(
  addRoute: RouteAdder,
  config: ServerConfig,
  resolveWorkspace: WorkspaceResolver,
): void {

  addRoute("GET", "/workspace/:id/images", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const images = await store.list();
    const response: MatterhornImageListResponse = { success: true, images };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/images/generate", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body, { skipKeys: IMAGE_GENERATION_SECRET_SCAN_SKIP_KEYS });
    const input = validateImageGenerationInput(body);

    if (detectSecretShapedInput(input.prompt)) {
      throw new ApiError(400, "image_prompt_secret_rejected", "Prompt contains secret-shaped input.");
    }

    const providerConfig = resolveImageGenerationProviderFromEnv(process.env);
    const provider = createImageGenerationProvider(providerConfig);
    const result = await provider.generate({
      ...input,
      workspaceId: workspace.id,
      storageDir: workspace.path,
    });

    if (!result.success) {
      throw new ApiError(
        result.code === "image_provider_needs_setup" ? 503 : 500,
        result.code,
        result.message,
        result.details,
      );
    }

    const store = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    await store.save(result.image);

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.image.generated",
      target: result.image.relativePath,
      summary: `Generated image ${result.image.id} with ${result.image.provider}`,
      timestamp: Date.now(),
    });
    await recordTaskEvent({
      id: `task_evt_${shortId()}`,
      workspaceId: workspace.id,
      taskId: `image_gen_${result.image.id}`,
      type: "image_generated",
      timestamp: Date.now(),
      summary: "Image generated",
      detail: `${result.image.provider};${result.image.model};${result.image.relativePath}`,
      artifactPath: result.image.relativePath,
    });

    const response: MatterhornImageResponse = { success: true, image: result.image };
    return jsonResponse(response);
  });

  addRoute("GET", "/workspace/:id/images/:imageId", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const image = await store.get(ctx.params.imageId);
    if (!image) throw new ApiError(404, "image_not_found", "Generated image not found.");
    const response: MatterhornImageResponse = { success: true, image };
    return jsonResponse(response);
  });

  addRoute("GET", "/workspace/:id/images/:imageId/file", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const image = await store.get(ctx.params.imageId);
    if (!image) throw new ApiError(404, "image_not_found", "Generated image not found.");
    const filePath = imageFilePath(workspace.path, image.fileName);
    try {
      const bytes = await readFile(filePath);
      return new Response(bytes, {
        headers: {
          "Content-Type": image.contentType,
          "Content-Length": String(bytes.length),
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch {
      throw new ApiError(404, "image_file_not_found", "Image file not found on disk.");
    }
  });

  addRoute("POST", "/workspace/:id/images/:imageId/nft-draft", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body);
    const input = validateNftDraftInput(body);
    const imageStore = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const image = await imageStore.get(ctx.params.imageId);
    if (!image) throw new ApiError(404, "image_not_found", "Generated image not found.");

    const draftStore = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await draftStore.create(image, input);

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.nft.draft_created",
      target: draft.id,
      summary: `Created NFT draft ${draft.id} from image ${image.id}`,
      timestamp: Date.now(),
    });

    const response: MatterhornImageNftDraftResponse = { success: true, draft };
    return jsonResponse(response);
  });

  addRoute("GET", "/workspace/:id/nft-drafts", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const drafts = await store.list();
    const response: MatterhornImageNftDraftListResponse = { success: true, drafts };
    return jsonResponse(response);
  });

  addRoute("GET", "/workspace/:id/nft-drafts/:draftId", "client", async (ctx) => {
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");
    const response: MatterhornImageNftDraftResponse = { success: true, draft };
    return jsonResponse(response);
  });

  addRoute("PATCH", "/workspace/:id/nft-drafts/:draftId", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body);
    const input = validateNftDraftInput(body);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.update(ctx.params.draftId, input);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");
    const response: MatterhornImageNftDraftResponse = { success: true, draft };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/storage/prepare", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    const publisherConfigured = Boolean(nftEnv.walrusPublisherUrl?.trim());
    const relayConfigured = Boolean(nftEnv.walrusRelayUrl?.trim());
    if (!publisherConfigured || !relayConfigured) {
      throw new ApiError(503, "walrus_needs_setup", "Walrus publisher and relay must be configured to prepare public storage.");
    }

    const updated = await store.updateStorageStatus(draft.id, "ready_to_upload");
    const response: MatterhornImageNftDraftResponse = { success: true, draft: updated! };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/storage/upload", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    const publisherConfigured = Boolean(nftEnv.walrusPublisherUrl?.trim());
    const relayConfigured = Boolean(nftEnv.walrusRelayUrl?.trim());
    if (!publisherConfigured || !relayConfigured) {
      throw new ApiError(503, "walrus_needs_setup", "Walrus publisher and relay must be configured to upload.");
    }

    // Walrus upload is not implemented in this phase; we record a mock blob id for the preview flow.
    const blobId = `walrus://${draft.id}`;
    const url = nftEnv.walrusRelayUrl ? `${nftEnv.walrusRelayUrl}/v1/${blobId}` : undefined;
    const updated = await store.updateStorageStatus(draft.id, "uploaded", { blobId, url });
    const response: MatterhornImageNftDraftResponse = { success: true, draft: updated! };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/mint/preview", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    if (!nftEnv.suiNftPackageId?.trim()) {
      throw new ApiError(503, "sui_nft_package_needs_setup", "MATTERHORN_SUI_NFT_PACKAGE_ID is required for mint previews.");
    }

    const updated = await store.updateMintStatus(draft.id, "preview_ready", { packageId: nftEnv.suiNftPackageId });
    const response: MatterhornNftMintPreviewResponse = {
      success: true,
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      handoff: {
        kind: "sui_wallet_standard",
        network: draft.network,
        transactionKind: "programmable",
        metadata: updated!.metadata,
      },
      draft: updated!,
    };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/mint/receipt", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body);
    const receipt = validateNftReceiptRequest(body);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const updated = await store.updateMintStatus(draft.id, "confirmed", {
      transactionDigest: receipt.transactionDigest,
      objectId: receipt.objectId,
      packageId: receipt.packageId ?? undefined,
    });

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.nft.minted",
      target: draft.id,
      summary: `Minted NFT ${receipt.objectId} on ${receipt.network}`,
      timestamp: Date.now(),
    });

    const response: MatterhornNftReceiptResponse = {
      success: true,
      custody: false,
      containsSignatureMaterial: false,
      draft: updated!,
    };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/listing/preview", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    if (!nftEnv.suiKioskPackageId?.trim()) {
      throw new ApiError(503, "sui_kiosk_package_needs_setup", "MATTERHORN_SUI_KIOSK_PACKAGE_ID is required for listing previews.");
    }

    const updated = await store.updateListingStatus(draft.id, "preview_ready", {
      kioskId: nftEnv.suiKioskPackageId,
    });
    const response: MatterhornNftListingPreviewResponse = {
      success: true,
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      handoff: {
        kind: "sui_wallet_standard",
        network: draft.network,
        transactionKind: "kiosk_listing",
        priceMist: updated!.listing.priceMist ?? undefined,
      },
      draft: updated!,
    };
    return jsonResponse(response);
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/listing/receipt", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body);
    const receipt = validateNftReceiptRequest(body);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const updated = await store.updateListingStatus(draft.id, "listed", {
      kioskId: receipt.kioskId ?? undefined,
      transferPolicyId: receipt.transferPolicyId ?? undefined,
    });

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.nft.listed",
      target: draft.id,
      summary: `Listed NFT in kiosk ${receipt.kioskId ?? "unknown"} on ${receipt.network}`,
      timestamp: Date.now(),
    });

    const response: MatterhornNftReceiptResponse = {
      success: true,
      custody: false,
      containsSignatureMaterial: false,
      draft: updated!,
    };
    return jsonResponse(response);
  });
}

function ensureWritable(config: ServerConfig): void {
  if (config.readOnly) {
    throw new ApiError(403, "read_only", "Server is in read-only mode.");
  }
}

function requireClientScope(ctx: RequestContext, required: TokenScope): void {
  const scopeRank = { viewer: 1, collaborator: 2, owner: 3 };
  const actorScope = ctx.actor?.scope as TokenScope | undefined;
  const currentRank = actorScope ? scopeRank[actorScope] ?? 0 : 0;
  const requiredRank = scopeRank[required] ?? 0;
  if (currentRank < requiredRank) {
    throw new ApiError(403, "forbidden", `This action requires ${required} scope.`);
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json_body", "Request body is not valid JSON.");
  }
}

const SENSITIVE_INPUT_KEYS = new Set([
  "mnemonic",
  "privatekey",
  "private_key",
  "rawsignature",
  "raw_signature",
  "seed",
  "seedphrase",
  "seed_phrase",
  "secretkey",
  "secret_key",
  "signature",
  "signedtransaction",
  "signed_transaction",
  "walletexport",
  "wallet_export",
]);

const SENSITIVE_TEXT_PATTERNS = [
  /\b-----BEGIN (RSA |EC |OPENSSH |PGP )?(PRIVATE KEY|SECRET KEY)-----/i,
  /\bmnemonic\b/i,
  /\bprivate key\b/i,
  /\bseed phrase\b/i,
  /\bsk-[a-zA-Z0-9]{20,}\b/,
];

const IMAGE_GENERATION_SECRET_SCAN_SKIP_KEYS = new Set(["prompt"]);

function rejectSensitiveGeneratedMediaInput(
  value: unknown,
  options?: { skipKeys?: ReadonlySet<string> },
): void {
  const rejected = findSensitiveGeneratedMediaInput(value, options);
  if (rejected) {
    throw new ApiError(
      400,
      "generated_media_sensitive_input_rejected",
      "Generated media routes do not accept private keys, seed phrases, raw signatures, or wallet exports.",
    );
  }
}

function findSensitiveGeneratedMediaInput(
  value: unknown,
  options?: { skipKeys?: ReadonlySet<string> },
): boolean {
  if (typeof value === "string") {
    return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => findSensitiveGeneratedMediaInput(item, options));

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[\s-]/g, "").toLowerCase();
    if (options?.skipKeys?.has(normalized) || options?.skipKeys?.has(key)) {
      continue;
    }
    if (SENSITIVE_INPUT_KEYS.has(normalized) || SENSITIVE_INPUT_KEYS.has(key.toLowerCase())) {
      return true;
    }
    if (findSensitiveGeneratedMediaInput(nested, options)) return true;
  }
  return false;
}

function validateImageGenerationInput(body: unknown): MatterhornImageGenerationInput {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "invalid_image_generation_input", "Request body must be an object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.prompt !== "string" || !b.prompt.trim()) {
    throw new ApiError(400, "image_prompt_required", "A non-empty prompt string is required.");
  }
  return {
    prompt: b.prompt.trim(),
    size: typeof b.size === "string" ? (b.size as MatterhornImageGenerationInput["size"]) : undefined,
    quality: typeof b.quality === "string" ? (b.quality as MatterhornImageGenerationInput["quality"]) : undefined,
    format: typeof b.format === "string" ? (b.format as MatterhornImageGenerationInput["format"]) : undefined,
    model: typeof b.model === "string" ? b.model : undefined,
    n: typeof b.n === "number" ? b.n : undefined,
    sessionId: typeof b.sessionId === "string" ? b.sessionId : undefined,
    desk: typeof b.desk === "string" ? b.desk : undefined,
  };
}

function validateNftDraftInput(body: unknown): MatterhornImageNftDraftInput {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  return {
    title: typeof b.title === "string" ? b.title : undefined,
    description: typeof b.description === "string" ? b.description : undefined,
    creatorAddress: typeof b.creatorAddress === "string" ? b.creatorAddress : undefined,
    network: b.network === "sui-testnet" || b.network === "sui-mainnet" ? b.network : undefined,
    metadata: b.metadata && typeof b.metadata === "object" ? (b.metadata as MatterhornImageNftDraftInput["metadata"]) : undefined,
    attributes: Array.isArray(b.attributes) ? (b.attributes as MatterhornImageNftDraftInput["attributes"]) : undefined,
    listingPriceMist: typeof b.listingPriceMist === "string" ? b.listingPriceMist : undefined,
  };
}

function validateNftReceiptRequest(body: unknown): MatterhornNftReceiptRequest {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "invalid_nft_receipt", "Request body must be an object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.transactionDigest !== "string" || !b.transactionDigest.trim()) {
    throw new ApiError(400, "nft_receipt_digest_required", "transactionDigest is required.");
  }
  if (typeof b.objectId !== "string" || !b.objectId.trim()) {
    throw new ApiError(400, "nft_receipt_object_id_required", "objectId is required.");
  }
  if (b.network !== "sui-testnet" && b.network !== "sui-mainnet") {
    throw new ApiError(400, "nft_receipt_network_invalid", "network must be sui-testnet or sui-mainnet.");
  }
  return {
    transactionDigest: b.transactionDigest.trim(),
    objectId: b.objectId.trim(),
    network: b.network,
    packageId: typeof b.packageId === "string" ? b.packageId.trim() : undefined,
    kioskId: typeof b.kioskId === "string" ? b.kioskId.trim() : undefined,
    transferPolicyId: typeof b.transferPolicyId === "string" ? b.transferPolicyId.trim() : undefined,
  };
}
