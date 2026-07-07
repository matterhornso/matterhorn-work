import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MatterhornImageGenerationInput,
  MatterhornImageListResponse,
  MatterhornImageNftDraft,
  MatterhornImageNftDraftInput,
  MatterhornImageNftDraftListResponse,
  MatterhornImageNftDraftResponse,
  MatterhornImageResponse,
  MatterhornNftKioskListingTransactionPlan,
  MatterhornNftListingPreviewInput,
  MatterhornNftListingPreviewResponse,
  MatterhornNftMintTransactionPlan,
  MatterhornNftMintPreviewResponse,
  MatterhornNftPreviewErrorDetails,
  MatterhornNftPreviewStep,
  MatterhornNftSetupRequirement,
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
import { resolveNftEnvironmentConfig, type NftEnvironmentConfig } from "./image-nft-capabilities.js";
import { recordAudit } from "./audit.js";
import { recordTaskEvent } from "./task-events.js";
import { shortId } from "./utils.js";
import { uploadBlobToWalrus, WalrusUploadError } from "./walrus-storage.js";

type NftReceiptKind = "mint" | "listing";

type PublicNftReceiptMetadata = Record<string, string | number | boolean | null>;

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
      const setupErrorCodes = new Set(["image_provider_needs_setup", "image_provider_invalid_config"]);
      throw new ApiError(
        setupErrorCodes.has(result.code) ? 503 : 500,
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
    const setupRequirements = buildWalrusSetupRequirements(nftEnv);
    if (hasInvalidSetup(setupRequirements)) {
      throwNftSetupError(
        "walrus_invalid_setup",
        "Walrus public storage setup is invalid. Fix the highlighted environment values before preparing upload.",
        setupRequirements,
      );
    }
    if (!publisherConfigured || !relayConfigured) {
      throwNftSetupError(
        "walrus_needs_setup",
        "Walrus publisher and relay must be configured to prepare public storage.",
        setupRequirements,
      );
    }

    const updated = await store.updateStorageStatus(draft.id, "ready_to_upload", { provider: "walrus" });
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
    const imageStore = new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const image = await imageStore.get(draft.imageId);
    if (!image) throw new ApiError(404, "image_not_found", "Generated image not found for this NFT draft.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    const publisherConfigured = Boolean(nftEnv.walrusPublisherUrl?.trim());
    const relayConfigured = Boolean(nftEnv.walrusRelayUrl?.trim());
    const setupRequirements = buildWalrusSetupRequirements(nftEnv);
    if (hasInvalidSetup(setupRequirements)) {
      throwNftSetupError(
        "walrus_invalid_setup",
        "Walrus public storage setup is invalid. Fix the highlighted environment values before uploading.",
        setupRequirements,
      );
    }
    if (!publisherConfigured || !relayConfigured) {
      throwNftSetupError(
        "walrus_needs_setup",
        "Walrus publisher and relay must be configured to upload.",
        setupRequirements,
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFile(imageFilePath(workspace.path, image.fileName));
    } catch {
      throw new ApiError(404, "image_file_not_found", "Image file not found on disk.");
    }

    try {
      const upload = await uploadBlobToWalrus({
        publisherUrl: nftEnv.walrusPublisherUrl!,
        aggregatorUrl: nftEnv.walrusRelayUrl,
        bearerToken: nftEnv.walrusPublisherBearerToken,
        contentType: image.contentType,
        bytes,
        epochs: nftEnv.walrusStorageEpochs ?? 1,
      });
      const updated = await store.updateStorageStatus(draft.id, "uploaded", {
        provider: "walrus",
        blobId: upload.blobId,
        objectId: upload.objectId,
        transactionDigest: upload.transactionDigest,
        endEpoch: upload.endEpoch,
        url: upload.url,
        uploadedAt: upload.uploadedAt,
        error: "",
      });
      if (updated) {
        updated.metadata.imageUrl = upload.url ?? `walrus://${upload.blobId}`;
        await store.save(updated);
      }

      await recordAudit(workspace.path, {
        id: shortId(),
        workspaceId: workspace.id,
        actor: ctx.actor ?? { type: "remote" },
        action: "workspace.nft.storage_uploaded",
        target: draft.id,
        summary: `Uploaded NFT media ${draft.id} to Walrus blob ${upload.blobId}`,
        timestamp: Date.now(),
      });
      await recordTaskEvent({
        id: `task_evt_${shortId()}`,
        workspaceId: workspace.id,
        taskId: `nft_storage_${draft.id}`,
        type: "artifact_saved",
        timestamp: Date.now(),
        summary: "NFT media uploaded",
        detail: `sui;${draft.id};${upload.blobId}`,
        artifactPath: image.relativePath,
      });

      const response: MatterhornImageNftDraftResponse = { success: true, draft: updated! };
      return jsonResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Walrus upload failed.";
      await store.updateStorageStatus(draft.id, "failed", { provider: "walrus", error: message });
      if (error instanceof WalrusUploadError) {
        throw new ApiError(error.status ?? 502, error.code, message);
      }
      throw new ApiError(502, "walrus_upload_failed", message);
    }
  });

  addRoute("POST", "/workspace/:id/nft-drafts/:draftId/mint/preview", "client", async (ctx) => {
    ensureWritable(config);
    requireClientScope(ctx, "collaborator");
    const workspace = await resolveWorkspace(config, ctx.params.id);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    const setupRequirements = buildMintSetupRequirements(nftEnv);
    if (hasInvalidSetup(setupRequirements)) {
      throwNftSetupError(
        "sui_nft_invalid_setup",
        "Sui NFT minting setup is invalid. Fix the highlighted environment values before preparing a mint preview.",
        setupRequirements,
      );
    }
    if (hasMissingSetup(setupRequirements)) {
      throwNftSetupError(
        "sui_nft_package_needs_setup",
        "Sui NFT package config is required for mint previews.",
        setupRequirements,
      );
    }

    const storageUrl = publicImageUriForMint(draft);
    const inputRequirements = buildMintInputRequirements(draft);
    if (hasMissingSetup(inputRequirements)) {
      throwNftPreviewError(
        409,
        "sui_nft_public_storage_required",
        "Public image storage is required before preparing a Sui mint transaction.",
        [...setupRequirements, ...inputRequirements],
      );
    }

    const updated = await store.updateMintStatus(draft.id, "preview_ready", { packageId: nftEnv.suiNftPackageId });
    const steps: MatterhornNftPreviewStep[] = [
      {
        label: "Review metadata",
        description: "Confirm the NFT name, description, attributes, and public image URI before wallet signing.",
      },
      {
        label: "Sign in Sui wallet",
        description: "Matterhorn prepares a transaction plan only; the connected Sui wallet builds, signs, and submits.",
      },
    ];
    const transactionPlan = buildMintTransactionPlan(updated!, nftEnv, storageUrl!, steps);
    const response: MatterhornNftMintPreviewResponse = {
      success: true,
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      handoff: {
        kind: "sui_wallet_standard",
        network: draft.network,
        transactionKind: "programmable",
        packageId: nftEnv.suiNftPackageId!,
        moduleName: nftEnv.suiNftModuleName || "matterhorn_nft",
        functionName: "mint",
        storageUrl,
        metadata: updated!.metadata,
        steps,
      },
      transactionPlan,
      setupRequirements: [...setupRequirements, ...inputRequirements],
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
    ensureReceiptMatchesDraft(receipt, draft);

    const updated = await store.updateMintStatus(draft.id, "confirmed", {
      transactionDigest: receipt.transactionDigest,
      objectId: receipt.objectId,
      packageId: receipt.packageId ?? undefined,
    });
    const recordedAtMs = Date.now();
    const recordedAt = new Date(recordedAtMs).toISOString();
    const receiptMetadata = publicNftReceiptMetadata("mint", receipt);
    const receiptPath = await writePublicNftReceiptFile({
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
      draft: updated!,
      kind: "mint",
      receipt,
      recordedAt,
    });

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.nft.minted",
      target: draft.id,
      summary: `Minted NFT ${receipt.objectId} on ${receipt.network}`,
      timestamp: recordedAtMs,
      metadata: receiptMetadata,
    });
    await recordTaskEvent({
      id: `task_evt_${shortId()}`,
      workspaceId: workspace.id,
      taskId: `nft_mint_${draft.id}`,
      type: "nft_minted",
      timestamp: recordedAtMs,
      summary: "NFT minted",
      detail: `nft;${draft.id}`,
      artifactPath: receiptPath,
      metadata: receiptMetadata,
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
    const body = await readOptionalJsonBody(ctx.request);
    rejectSensitiveGeneratedMediaInput(body);
    const input = validateNftListingPreviewInput(body);
    const store = new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const draft = await store.get(ctx.params.draftId);
    if (!draft) throw new ApiError(404, "nft_draft_not_found", "NFT draft not found.");

    const nftEnv = resolveNftEnvironmentConfig(process.env);
    const setupRequirements = buildListingSetupRequirements(nftEnv);
    if (hasInvalidSetup(setupRequirements)) {
      throwNftSetupError(
        "sui_kiosk_invalid_setup",
        "Sui Kiosk listing setup is invalid. Fix the highlighted environment values before preparing a listing preview.",
        setupRequirements,
      );
    }
    if (hasMissingSetup(setupRequirements)) {
      throwNftSetupError(
        "sui_kiosk_package_needs_setup",
        "Kiosk and TransferPolicy config are required for listing previews.",
        setupRequirements,
      );
    }

    const listingInputs = resolveListingPreviewInputs(draft, nftEnv, input);
    const inputRequirements = buildListingInputRequirements(listingInputs);
    if (hasMissingSetup(inputRequirements)) {
      throwNftPreviewError(
        409,
        "sui_kiosk_listing_inputs_required",
        "A minted NFT object, item type, user Kiosk, owner cap, transfer policy, and price are required before preparing a listing transaction.",
        [...setupRequirements, ...inputRequirements],
      );
    }

    const updated = await store.updateListingStatus(draft.id, "preview_ready", {
      kioskId: listingInputs.kioskId!,
      kioskOwnerCapId: listingInputs.kioskOwnerCapId!,
      transferPolicyId: listingInputs.transferPolicyId!,
      itemType: listingInputs.nftType!,
      priceMist: listingInputs.priceMist!,
    });
    const steps: MatterhornNftPreviewStep[] = [
      {
        label: "Review listing terms",
        description: "Confirm object id, Kiosk, TransferPolicy, and price before wallet signing.",
      },
      {
        label: "Sign in Sui wallet",
        description: "Matterhorn prepares a Kiosk listing plan only; the user's wallet signs and submits.",
      },
    ];
    const transactionPlan = buildKioskListingTransactionPlan(draft, listingInputs as ResolvedListingPreviewInputsReady);
    const response: MatterhornNftListingPreviewResponse = {
      success: true,
      custody: false,
      canSubmit: false,
      signerPolicy: "client_wallet_required",
      handoff: {
        kind: "sui_wallet_standard",
        network: draft.network,
        transactionKind: "kiosk_listing",
        marketplace: "sui_kiosk",
        kioskPackageId: nftEnv.suiKioskPackageId!,
        transferPolicyPackageId: nftEnv.suiTransferPolicyPackageId!,
        priceMist: updated!.listing.priceMist ?? undefined,
        objectId: listingInputs.objectId ?? null,
        steps,
      },
      transactionPlan,
      setupRequirements: [...setupRequirements, ...inputRequirements],
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
    ensureReceiptMatchesDraft(receipt, draft);

    const updated = await store.updateListingStatus(draft.id, "listed", {
      kioskId: receipt.kioskId ?? undefined,
      transferPolicyId: receipt.transferPolicyId ?? undefined,
    });
    const recordedAtMs = Date.now();
    const recordedAt = new Date(recordedAtMs).toISOString();
    const receiptMetadata = publicNftReceiptMetadata("listing", receipt);
    const receiptPath = await writePublicNftReceiptFile({
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
      draft: updated!,
      kind: "listing",
      receipt,
      recordedAt,
    });

    await recordAudit(workspace.path, {
      id: shortId(),
      workspaceId: workspace.id,
      actor: ctx.actor ?? { type: "remote" },
      action: "workspace.nft.listed",
      target: draft.id,
      summary: `Listed NFT in kiosk ${receipt.kioskId ?? "unknown"} on ${receipt.network}`,
      timestamp: recordedAtMs,
      metadata: receiptMetadata,
    });
    await recordTaskEvent({
      id: `task_evt_${shortId()}`,
      workspaceId: workspace.id,
      taskId: `nft_listing_${draft.id}`,
      type: "nft_listed",
      timestamp: recordedAtMs,
      summary: "NFT listed",
      detail: `nft;${draft.id}`,
      artifactPath: receiptPath,
      metadata: receiptMetadata,
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

function nftReceiptRelativePath(draftId: string, kind: NftReceiptKind): string {
  const fileName = kind === "mint" ? "mint-receipt.json" : "listing-receipt.json";
  return [".matterhorn-work", "outputs", "nft-receipts", draftId, fileName].join("/");
}

function publicNftReceiptMetadata(kind: NftReceiptKind, receipt: MatterhornNftReceiptRequest): PublicNftReceiptMetadata {
  return {
    nftReceiptKind: kind,
    nftNetwork: receipt.network,
    nftTransactionDigest: receipt.transactionDigest,
    nftObjectId: receipt.objectId,
    nftPackageId: receipt.packageId ?? null,
    nftKioskId: receipt.kioskId ?? null,
    nftTransferPolicyId: receipt.transferPolicyId ?? null,
    custody: false,
    containsSignatureMaterial: false,
  };
}

async function writePublicNftReceiptFile(input: {
  workspaceRoot: string;
  workspaceId: string;
  draft: MatterhornImageNftDraft;
  kind: NftReceiptKind;
  receipt: MatterhornNftReceiptRequest;
  recordedAt: string;
}): Promise<string> {
  const relativePath = nftReceiptRelativePath(input.draft.id, input.kind);
  const filePath = join(input.workspaceRoot, ...relativePath.split("/"));
  await mkdir(join(input.workspaceRoot, ".matterhorn-work", "outputs", "nft-receipts", input.draft.id), { recursive: true });
  await writeFile(filePath, JSON.stringify({
    version: "matterhorn.nft-receipt.v1",
    kind: input.kind,
    workspaceId: input.workspaceId,
    draftId: input.draft.id,
    imageId: input.draft.imageId,
    network: input.receipt.network,
    transactionDigest: input.receipt.transactionDigest,
    objectId: input.receipt.objectId,
    packageId: input.receipt.packageId ?? null,
    kioskId: input.receipt.kioskId ?? null,
    transferPolicyId: input.receipt.transferPolicyId ?? null,
    custody: false,
    containsSignatureMaterial: false,
    recordedAt: input.recordedAt,
  }, null, 2), "utf8");
  return relativePath;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildWalrusSetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const publisherIssue = validationIssueFor(config, "MATTERHORN_WALRUS_PUBLISHER_URL");
  const relayIssue = validationIssueFor(config, "MATTERHORN_WALRUS_RELAY_URL");
  const epochsIssue = validationIssueFor(config, "MATTERHORN_WALRUS_STORAGE_EPOCHS");
  const requirements = [
    setupRequirement({
      key: "walrus_publisher",
      label: "Walrus publisher",
      envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      configured: Boolean(config.walrusPublisherUrl?.trim()),
      status: publisherIssue ? "invalid" : undefined,
      description: publisherIssue?.message ?? "Public storage needs a Walrus publisher endpoint.",
    }),
    setupRequirement({
      key: "walrus_relay",
      label: "Walrus relay",
      envVar: "MATTERHORN_WALRUS_RELAY_URL",
      configured: Boolean(config.walrusRelayUrl?.trim()),
      status: relayIssue ? "invalid" : undefined,
      description: relayIssue?.message ?? "NFT metadata needs a public aggregator or relay URL for stored image media.",
    }),
  ];
  if (epochsIssue) {
    requirements.push(setupRequirement({
      key: "walrus_storage_epochs",
      label: "Walrus storage epochs",
      envVar: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
      configured: false,
      status: "invalid",
      description: epochsIssue.message,
    }));
  }
  return requirements;
}

function buildMintSetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const networkIssue = validationIssueFor(config, "MATTERHORN_SUI_NETWORK");
  const requirements = [
    setupRequirement({
      key: "sui_nft_package",
      label: "Sui NFT package",
      envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      configured: Boolean(config.suiNftPackageId?.trim()),
      description: "Mint previews need the Move package id that defines the NFT mint entrypoint.",
    }),
    setupRequirement({
      key: "sui_nft_module",
      label: "Sui NFT module",
      envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
      configured: true,
      description: `Move module name for mint previews. Defaults to ${config.suiNftModuleName || "matterhorn_nft"}.`,
    }),
  ];
  if (networkIssue) {
    requirements.unshift(setupRequirement({
      key: "sui_network",
      label: "Sui network",
      envVar: "MATTERHORN_SUI_NETWORK",
      configured: false,
      status: "invalid",
      description: networkIssue.message,
    }));
  }
  return requirements;
}

function buildListingSetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const networkIssue = validationIssueFor(config, "MATTERHORN_SUI_NETWORK");
  const requirements = [
    setupRequirement({
      key: "sui_kiosk_package",
      label: "Sui Kiosk package",
      envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      configured: Boolean(config.suiKioskPackageId?.trim()),
      description: "Marketplace listing previews need the Kiosk package/config id.",
    }),
    setupRequirement({
      key: "sui_transfer_policy",
      label: "Sui TransferPolicy",
      envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      configured: Boolean(config.suiTransferPolicyPackageId?.trim()),
      description: "Listings need the TransferPolicy config that controls marketplace transfer rules.",
    }),
  ];
  if (networkIssue) {
    requirements.unshift(setupRequirement({
      key: "sui_network",
      label: "Sui network",
      envVar: "MATTERHORN_SUI_NETWORK",
      configured: false,
      status: "invalid",
      description: networkIssue.message,
    }));
  }
  return requirements;
}

function publicImageUriForMint(draft: MatterhornImageNftDraft): string | null {
  return draft.storage.url || draft.metadata.imageUrl || null;
}

function buildMintInputRequirements(draft: MatterhornImageNftDraft): MatterhornNftSetupRequirement[] {
  return [
    setupRequirement({
      key: "sui_public_image_uri",
      label: "Public image URI",
      configured: Boolean(publicImageUriForMint(draft)),
      description: "Upload the generated image to public storage before preparing a mint transaction.",
    }),
  ];
}

function buildMintTransactionPlan(
  draft: MatterhornImageNftDraft,
  config: ReturnType<typeof resolveNftEnvironmentConfig>,
  storageUrl: string,
  steps: MatterhornNftPreviewStep[],
): MatterhornNftMintTransactionPlan {
  const moduleName = config.suiNftModuleName || "matterhorn_nft";
  const functionName = "mint";
  const args = [
    pureArg("name", "string", draft.metadata.name),
    pureArg("description", "string", draft.metadata.description),
    pureArg("image_url", "string", storageUrl),
    pureArg("attributes_json", "string", JSON.stringify(draft.metadata.attributes ?? [])),
  ];
  if (draft.creatorAddress) {
    args.push(pureArg("creator", "address", draft.creatorAddress));
  }

  return {
    version: "matterhorn.sui.transaction-plan.v1",
    kind: "sui_move_call",
    network: draft.network,
    custody: false,
    canSubmit: false,
    requiresWalletStandard: true,
    sender: draft.creatorAddress ?? null,
    moveCalls: [
      {
        target: `${config.suiNftPackageId}::${moduleName}::${functionName}`,
        packageId: config.suiNftPackageId!,
        moduleName,
        functionName,
        typeArguments: [],
        arguments: args,
      },
    ],
    sdkHints: {
      packageName: "@mysten/sui",
      importPath: "@mysten/sui/transactions",
      builder: "new Transaction()",
    },
    missingInputs: [],
  };
}

interface ResolvedListingPreviewInputs {
  objectId?: string | null;
  nftType?: string | null;
  kioskId?: string | null;
  kioskOwnerCapId?: string | null;
  transferPolicyId?: string | null;
  priceMist?: string | null;
  sender?: string | null;
}

interface ResolvedListingPreviewInputsReady {
  objectId: string;
  nftType: string;
  kioskId: string;
  kioskOwnerCapId: string;
  transferPolicyId: string;
  priceMist: string;
  sender?: string | null;
}

function resolveListingPreviewInputs(
  draft: MatterhornImageNftDraft,
  config: ReturnType<typeof resolveNftEnvironmentConfig>,
  input: MatterhornNftListingPreviewInput,
): ResolvedListingPreviewInputs {
  return {
    objectId: input.objectId ?? draft.mint.objectId ?? null,
    nftType: input.nftType ?? draft.listing.itemType ?? config.suiNftType ?? null,
    kioskId: input.kioskId ?? draft.listing.kioskId ?? config.suiKioskId ?? null,
    kioskOwnerCapId: input.kioskOwnerCapId ?? draft.listing.kioskOwnerCapId ?? config.suiKioskOwnerCapId ?? null,
    transferPolicyId:
      input.transferPolicyId ??
      draft.listing.transferPolicyId ??
      config.suiTransferPolicyId ??
      null,
    priceMist: input.priceMist ?? draft.listing.priceMist ?? null,
    sender: input.sender ?? draft.creatorAddress ?? null,
  };
}

function buildListingInputRequirements(input: ResolvedListingPreviewInputs): MatterhornNftSetupRequirement[] {
  return [
    setupRequirement({
      key: "sui_minted_object",
      label: "Minted NFT object",
      configured: Boolean(input.objectId),
      description: "Record the public mint receipt or provide the minted NFT object id before listing.",
    }),
    setupRequirement({
      key: "sui_nft_type",
      label: "NFT item type",
      envVar: "MATTERHORN_SUI_NFT_TYPE",
      configured: Boolean(input.nftType),
      description: "Provide the full Move type for the minted NFT, for example 0x...::module::MatterhornNFT.",
    }),
    setupRequirement({
      key: "sui_kiosk_id",
      label: "User Kiosk id",
      envVar: "MATTERHORN_SUI_KIOSK_ID",
      configured: Boolean(input.kioskId),
      description: "Provide the user-owned Kiosk object id that will hold the listing.",
    }),
    setupRequirement({
      key: "sui_kiosk_owner_cap",
      label: "Kiosk owner cap",
      envVar: "MATTERHORN_SUI_KIOSK_OWNER_CAP_ID",
      configured: Boolean(input.kioskOwnerCapId),
      description: "Provide the public owner-cap object id for the user's Kiosk. Do not paste private keys or signatures.",
    }),
    setupRequirement({
      key: "sui_transfer_policy",
      label: "TransferPolicy object",
      envVar: "MATTERHORN_SUI_TRANSFER_POLICY_ID",
      configured: Boolean(input.transferPolicyId),
      description: "Provide the TransferPolicy object id that applies to this NFT type.",
    }),
    setupRequirement({
      key: "sui_listing_price",
      label: "Listing price",
      configured: Boolean(input.priceMist),
      description: "Set a listing price in MIST before preparing the Kiosk listing transaction.",
    }),
  ];
}

function buildKioskListingTransactionPlan(
  draft: MatterhornImageNftDraft,
  input: ResolvedListingPreviewInputsReady,
): MatterhornNftKioskListingTransactionPlan {
  return {
    version: "matterhorn.sui.transaction-plan.v1",
    kind: "sui_kiosk_listing",
    network: draft.network,
    custody: false,
    canSubmit: false,
    requiresWalletStandard: true,
    sender: input.sender ?? null,
    marketplace: "sui_kiosk",
    nftObjectId: input.objectId,
    nftType: input.nftType,
    kioskId: input.kioskId,
    kioskOwnerCapId: input.kioskOwnerCapId,
    transferPolicyId: input.transferPolicyId,
    priceMist: input.priceMist,
    sdkHints: {
      packageName: "@mysten/kiosk",
      builder: "KioskTransaction",
      method: "placeAndList",
    },
    missingInputs: [],
  };
}

function pureArg(
  label: string,
  type: MatterhornNftMintTransactionPlan["moveCalls"][number]["arguments"][number]["type"],
  value: string,
): MatterhornNftMintTransactionPlan["moveCalls"][number]["arguments"][number] {
  return {
    label,
    kind: "pure",
    type,
    value,
  };
}

function setupRequirement(input: {
  key: MatterhornNftSetupRequirement["key"];
  label: string;
  envVar?: string;
  configured: boolean;
  status?: MatterhornNftSetupRequirement["status"];
  description: string;
}): MatterhornNftSetupRequirement {
  return {
    key: input.key,
    label: input.label,
    envVar: input.envVar,
    status: input.status ?? (input.configured ? "configured" : "missing"),
    description: input.description,
  };
}

function validationIssueFor(
  config: NftEnvironmentConfig,
  field: NonNullable<NftEnvironmentConfig["validationIssues"]>[number]["field"],
): NonNullable<NftEnvironmentConfig["validationIssues"]>[number] | undefined {
  return config.validationIssues?.find((issue) => issue.field === field);
}

function hasMissingSetup(requirements: MatterhornNftSetupRequirement[]): boolean {
  return requirements.some((requirement) => requirement.status === "missing");
}

function hasInvalidSetup(requirements: MatterhornNftSetupRequirement[]): boolean {
  return requirements.some((requirement) => requirement.status === "invalid");
}

function nftPreviewErrorDetails(requirements: MatterhornNftSetupRequirement[]): MatterhornNftPreviewErrorDetails {
  return {
    custody: false,
    canSubmit: false,
    setupRequirements: requirements,
  };
}

function throwNftSetupError(code: string, message: string, requirements: MatterhornNftSetupRequirement[]): never {
  throw new ApiError(503, code, message, nftPreviewErrorDetails(requirements));
}

function throwNftPreviewError(
  status: number,
  code: string,
  message: string,
  requirements: MatterhornNftSetupRequirement[],
): never {
  throw new ApiError(status, code, message, nftPreviewErrorDetails(requirements));
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "invalid_json_body", "Request body is not valid JSON.");
  }
}

async function readOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
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

function validateNftListingPreviewInput(body: unknown): MatterhornNftListingPreviewInput {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  return {
    objectId: typeof b.objectId === "string" ? b.objectId.trim() : undefined,
    nftType: typeof b.nftType === "string" ? b.nftType.trim() : undefined,
    kioskId: typeof b.kioskId === "string" ? b.kioskId.trim() : undefined,
    kioskOwnerCapId: typeof b.kioskOwnerCapId === "string" ? b.kioskOwnerCapId.trim() : undefined,
    transferPolicyId: typeof b.transferPolicyId === "string" ? b.transferPolicyId.trim() : undefined,
    priceMist: typeof b.priceMist === "string" ? b.priceMist.trim() : undefined,
    sender: typeof b.sender === "string" ? b.sender.trim() : undefined,
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

function ensureReceiptMatchesDraft(receipt: MatterhornNftReceiptRequest, draft: MatterhornImageNftDraft): void {
  if (receipt.network !== draft.network) {
    throw new ApiError(400, "nft_receipt_network_mismatch", `Receipt network must match the draft network (${draft.network}).`);
  }
  const mintedObjectId = draft.mint.objectId?.trim();
  if (mintedObjectId && receipt.objectId.trim() !== mintedObjectId) {
    throw new ApiError(400, "nft_receipt_object_mismatch", "Receipt objectId must match the NFT object already recorded on this draft.");
  }
}
