/** @jsxImportSource react */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "lucide-react";

import { MatterhornServerError, type MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { Button } from "@/components/ui/button";
import type { ReactComposerNotice } from "../surface/composer/notice";
import type {
  MatterhornCapabilityStatus,
} from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornGeneratedImage,
  MatterhornImageGenerationInput,
  MatterhornImageNftDraft,
  MatterhornImageNftDraftInput,
  MatterhornNftListingPreviewInput,
  MatterhornNftListingPreviewResponse,
  MatterhornNftMintPreviewResponse,
  MatterhornNftPreviewErrorDetails,
  MatterhornNftReceiptRequest,
  MatterhornNftSetupRequirement,
} from "@matterhorn-work/types/generated-media";
import {
  GeneratedImageCard,
  GeneratedImageErrorCard,
  GeneratedImageLoadingCard,
} from "./generated-image-card";
import {
  ImageGenerationComposer,
} from "./image-generation-composer";
import { GeneratedMediaHistory } from "./generated-media-history";
import {
  NftDraftWalletBridge,
} from "./nft-draft-wallet-bridge";
import type { NftDraftPublishingCapabilities } from "./nft-draft-panel";
import { buildNftPublishingSetupRequirements, type NftPublishingReadinessCapabilities } from "./nft-publishing-readiness";
import { formatEntitlementReset } from "../../billing/entitlements";
import { workspaceSettingsRoute } from "../../../shell/workspace-routes";

type NftCapabilityStatus = "working" | "needs_setup" | "preview";
type GeneratedMediaErrorCopy = { title: string; description?: string; action?: "billing" };

export interface SessionImageGenerationPanelProps {
  client: MatterhornServerClient;
  workspaceId: string;
  sessionId: string;
  defaultOpen?: boolean;
  onNotice?: (notice: ReactComposerNotice) => void;
  capabilitiesOverride?: NftPublishingReadinessCapabilities;
  suggestedPrompt?: string;
}

function capabilityReady(status: MatterhornCapabilityStatus | undefined) {
  return status === "working" || status === "preview";
}

function nftCapabilityStatus(status: MatterhornCapabilityStatus | undefined): NftCapabilityStatus {
  if (status === "working" || status === "preview") return status;
  return "needs_setup";
}

export function nftDraftPublishingCapabilitiesFromBackend(
  capabilities: NftPublishingReadinessCapabilities | undefined,
): NftDraftPublishingCapabilities {
  return {
    walrusStorage: {
      ...(capabilities?.walrusStorage ?? {}),
      status: nftCapabilityStatus(capabilities?.walrusStorage?.status),
    },
    nftMinting: {
      ...(capabilities?.nftMinting ?? {}),
      status: nftCapabilityStatus(capabilities?.nftMinting?.status),
    },
    nftMarketplaceListing: {
      ...(capabilities?.nftMarketplaceListing ?? {}),
      status: nftCapabilityStatus(capabilities?.nftMarketplaceListing?.status),
    },
  };
}

function generatedImageErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Image generation failed.";
}

function generatedMediaErrorCopy(error: unknown): GeneratedMediaErrorCopy {
  if (error instanceof MatterhornServerError && (
    error.code === "billing_entitlement_required" ||
    error.code === "billing_entitlement_limit_reached"
  )) {
    const details = error.details && typeof error.details === "object"
      ? error.details as {
        entitlementLabel?: unknown;
        currentPlanId?: unknown;
        requiredPlanIds?: unknown;
        used?: unknown;
        limit?: unknown;
        reason?: unknown;
        resetsAt?: unknown;
      }
      : {};
    const label = typeof details.entitlementLabel === "string" ? details.entitlementLabel : "This action";
    const currentPlan = typeof details.currentPlanId === "string" ? formatPlanName(details.currentPlanId) : "your current plan";
    const requiredPlanIds = Array.isArray(details.requiredPlanIds)
      ? details.requiredPlanIds.filter((planId): planId is string => typeof planId === "string")
      : [];
    const upgradePlanIds = requiredPlanIds.filter((planId) => isHigherPlan(planId, details.currentPlanId));
    const requiredPlans = formatPlanList(upgradePlanIds);
    const used = typeof details.used === "number" ? details.used : null;
    const limit = typeof details.limit === "number" ? details.limit : null;
    const resetLabel = typeof details.resetsAt === "string" ? formatEntitlementReset(details.resetsAt) : null;

    if (details.reason === "limit_reached") {
      const usage = used !== null && limit !== null
        ? used > limit
          ? ` ${used} used; ${currentPlan} includes ${limit} per allowance period.`
          : ` You have used ${used} of ${limit}.`
        : "";
      const resetCopy = resetLabel ? ` ${resetLabel}.` : "";
      const nextStep = upgradePlanIds.length > 0
        ? ` Upgrade to ${requiredPlans} to continue.`
        : " Wait for the allowance to reset.";
      return {
        title: `${label} limit reached`,
        description: `${currentPlan} has reached its allowance.${usage}${resetCopy}${nextStep}`,
        action: upgradePlanIds.length > 0 ? "billing" : undefined,
      };
    }

    return {
      title: `${label} requires an upgrade`,
      description: `${currentPlan} does not include this action. Upgrade to ${requiredPlans} to continue.`,
      action: "billing",
    };
  }

  return { title: generatedImageErrorMessage(error) };
}

function formatPlanName(planId: string) {
  if (planId === "free") return "Free";
  if (planId === "plus") return "Matterhorn Plus";
  if (planId === "max") return "Matterhorn Max";
  return planId;
}

function formatPlanList(planIds: string[]) {
  if (!planIds.length) return "a paid plan";
  const names = planIds.map(formatPlanName);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function isHigherPlan(candidatePlanId: string, currentPlanId: unknown) {
  if (typeof currentPlanId !== "string") return true;
  const planRank: Record<string, number> = { free: 0, plus: 1, max: 2 };
  return (planRank[candidatePlanId] ?? -1) > (planRank[currentPlanId] ?? -1);
}

function nftSetupRequirementsFromError(error: unknown): MatterhornNftSetupRequirement[] {
  if (!(error instanceof MatterhornServerError)) return [];
  const details = error.details as Partial<MatterhornNftPreviewErrorDetails> | undefined;
  return Array.isArray(details?.setupRequirements) ? details.setupRequirements : [];
}

export function SessionImageGenerationPanel(props: SessionImageGenerationPanelProps) {
  const queryClient = useQueryClient();
  const panelId = useId();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<GeneratedMediaErrorCopy | null>(null);
  const [selectedImage, setSelectedImage] = useState<MatterhornGeneratedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nftPanelOpen, setNftPanelOpen] = useState(false);
  const [nftImage, setNftImage] = useState<MatterhornGeneratedImage | null>(null);
  const [nftDraft, setNftDraft] = useState<MatterhornImageNftDraft | null>(null);
  const [nftSetupRequirements, setNftSetupRequirements] = useState<MatterhornNftSetupRequirement[]>([]);
  const [nftBusy, setNftBusy] = useState(false);
  const [nftMintPreview, setNftMintPreview] = useState<MatterhornNftMintPreviewResponse | null>(null);
  const [nftListingPreview, setNftListingPreview] = useState<MatterhornNftListingPreviewResponse | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: ["session-image-generation-capabilities"],
    enabled: !props.capabilitiesOverride,
    staleTime: 30_000,
    queryFn: () => props.client.backendCapabilities(),
  });
  const generatedMediaHistoryQueryKey = useMemo(
    () => ["session-generated-media-history", props.workspaceId] as const,
    [props.workspaceId],
  );
  const generatedMediaHistoryQuery = useQuery({
    queryKey: generatedMediaHistoryQueryKey,
    enabled: open,
    staleTime: 10_000,
    queryFn: () => props.client.listGeneratedMediaHistory(props.workspaceId),
  });

  const capabilities = props.capabilitiesOverride ?? capabilitiesQuery.data;
  const imageGenerationStatus = capabilities?.imageGeneration?.status;
  const canGenerate = capabilityReady(imageGenerationStatus);
  const historyItems = generatedMediaHistoryQuery.data?.items ?? [];
  const latestImage = selectedImage ?? historyItems[0]?.image ?? null;
  const capabilityHint = capabilitiesQuery.isLoading && !capabilities
    ? "Checking image provider..."
    : canGenerate
      ? null
      : "Platform setup";
  const publishingSetupRequirements = useMemo(() => buildNftPublishingSetupRequirements({
    imageGeneration: capabilities?.imageGeneration,
    walrusStorage: capabilities?.walrusStorage,
    nftMinting: capabilities?.nftMinting,
    nftMarketplaceListing: capabilities?.nftMarketplaceListing,
  }), [capabilities]);

  useEffect(() => {
    setSelectedImage(null);
    setPreviewUrl(null);
    setNftPanelOpen(false);
    setNftImage(null);
    setNftDraft(null);
    setNftSetupRequirements([]);
    setNftMintPreview(null);
    setNftListingPreview(null);
  }, [props.workspaceId, props.sessionId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    if (!latestImage) return undefined;

    void props.client.getGeneratedImageFile(props.workspaceId, latestImage.id)
      .then((response) => {
        if (cancelled) return;
        const blob = new Blob([response.data], {
          type: response.contentType ?? latestImage.contentType,
        });
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [latestImage, props.client, props.workspaceId]);

  const generateImage = useCallback(async (input: MatterhornImageGenerationInput) => {
    if (!canGenerate) {
      setError({ title: "Matterhorn has not configured image generation yet." });
      return;
    }
    setOpen(true);
    setGenerating(true);
    setError(null);
    try {
      const response = await props.client.generateImage(props.workspaceId, {
        ...input,
        sessionId: props.sessionId,
      });
      if (!response.success) {
        throw new Error(response.message);
      }
      setSelectedImage(response.image);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "Image generated",
        description: "Saved to project outputs.",
        tone: "success",
      });
    } catch (nextError) {
      const copy = generatedMediaErrorCopy(nextError);
      setError(copy);
      props.onNotice?.({
        title: copy.title,
        description: copy.description,
        tone: "warning",
      });
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    generatedMediaHistoryQueryKey,
    props.client,
    props.onNotice,
    props.sessionId,
    props.workspaceId,
    queryClient,
  ]);

  const refreshDraftForImage = useCallback(async (image: MatterhornGeneratedImage) => {
    const response = await props.client.listImageNftDrafts(props.workspaceId);
    setNftDraft(response.drafts.find((draft) => draft.imageId === image.id) ?? null);
  }, [props.client, props.workspaceId]);

  const openNftDraft = useCallback(async (image: MatterhornGeneratedImage) => {
    setNftImage(image);
    setNftPanelOpen(true);
    setNftSetupRequirements([]);
    setNftMintPreview(null);
    setNftListingPreview(null);
    setNftBusy(true);
    try {
      await refreshDraftForImage(image);
    } catch {
      setNftDraft(null);
    } finally {
      setNftBusy(false);
    }
  }, [refreshDraftForImage]);

  const updateDraft = useCallback(async (
    action: (draftId: string) => Promise<{ draft: MatterhornImageNftDraft }>,
  ) => {
    if (!nftDraft) return;
    setNftBusy(true);
    try {
      const response = await action(nftDraft.id);
      setNftDraft(response.draft);
      setNftSetupRequirements([]);
      setNftMintPreview(null);
      setNftListingPreview(null);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
    } catch (nextError) {
      const setupRequirements = nftSetupRequirementsFromError(nextError);
      const copy = generatedMediaErrorCopy(nextError);
      setNftSetupRequirements(setupRequirements);
      props.onNotice?.({
        title: copy.title,
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.onNotice, queryClient]);

  const createDraft = useCallback(async (input: MatterhornImageNftDraftInput) => {
    if (!nftImage) return;
    setNftBusy(true);
    try {
      const response = await props.client.createImageNftDraft(props.workspaceId, nftImage.id, input);
      setNftDraft(response.draft);
      setNftSetupRequirements([]);
      setNftMintPreview(null);
      setNftListingPreview(null);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "NFT draft created",
        description: "Stored locally until you choose public storage or wallet signing.",
        tone: "success",
      });
    } catch (nextError) {
      const copy = generatedMediaErrorCopy(nextError);
      props.onNotice?.({
        title: copy.title,
        description: copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftImage, props.client, props.onNotice, props.workspaceId, queryClient]);

  const previewMint = useCallback(async () => {
    if (!nftDraft) return;
    setNftBusy(true);
    try {
      const response = await props.client.previewNftMint(props.workspaceId, nftDraft.id);
      setNftDraft(response.draft);
      setNftSetupRequirements(response.setupRequirements ?? []);
      setNftMintPreview(response);
      setNftListingPreview(null);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "Mint plan ready",
        description: "Review it, then sign with your connected Sui wallet.",
        tone: "info",
      });
    } catch (nextError) {
      const setupRequirements = nftSetupRequirementsFromError(nextError);
      const copy = generatedMediaErrorCopy(nextError);
      setNftSetupRequirements(setupRequirements);
      setNftMintPreview(null);
      props.onNotice?.({
        title: copy.title,
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.client, props.onNotice, props.workspaceId, queryClient]);

  const recordMintReceipt = useCallback(async (receipt: MatterhornNftReceiptRequest) => {
    if (!nftDraft) return;
    setNftBusy(true);
    try {
      const response = await props.client.recordNftMintReceipt(props.workspaceId, nftDraft.id, receipt);
      setNftDraft(response.draft);
      setNftSetupRequirements([]);
      setNftMintPreview(null);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "Mint receipt recorded",
        description: "The NFT draft now points at the public Sui object.",
        tone: "success",
      });
    } catch (nextError) {
      const copy = generatedMediaErrorCopy(nextError);
      props.onNotice?.({
        title: copy.title,
        description: copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.client, props.onNotice, props.workspaceId, queryClient]);

  const previewListing = useCallback(async (input: MatterhornNftListingPreviewInput) => {
    if (!nftDraft) return;
    setNftBusy(true);
    try {
      const response = await props.client.previewNftListing(props.workspaceId, nftDraft.id, input);
      setNftDraft(response.draft);
      setNftSetupRequirements(response.setupRequirements ?? []);
      setNftListingPreview(response);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "Listing plan ready",
        description: "Review the Sui Kiosk inputs before signing externally.",
        tone: "info",
      });
    } catch (nextError) {
      const setupRequirements = nftSetupRequirementsFromError(nextError);
      const copy = generatedMediaErrorCopy(nextError);
      setNftSetupRequirements(setupRequirements);
      setNftListingPreview(null);
      props.onNotice?.({
        title: copy.title,
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.client, props.onNotice, props.workspaceId, queryClient]);

  const recordListingReceipt = useCallback(async (receipt: MatterhornNftReceiptRequest) => {
    if (!nftDraft) return;
    setNftBusy(true);
    try {
      const response = await props.client.recordNftListingReceipt(props.workspaceId, nftDraft.id, receipt);
      setNftDraft(response.draft);
      setNftSetupRequirements([]);
      setNftListingPreview(null);
      await queryClient.invalidateQueries({ queryKey: generatedMediaHistoryQueryKey });
      props.onNotice?.({
        title: "Listing receipt recorded",
        description: "The marketplace handoff is now part of this image's evidence.",
        tone: "success",
      });
    } catch (nextError) {
      const copy = generatedMediaErrorCopy(nextError);
      props.onNotice?.({
        title: copy.title,
        description: copy.description,
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.client, props.onNotice, props.workspaceId, queryClient]);

  const nftCapabilities = nftDraftPublishingCapabilitiesFromBackend(capabilities);
  const generatedMediaSettingsHref = workspaceSettingsRoute(props.workspaceId, "generated-media");
  const billingSettingsHref = workspaceSettingsRoute(props.workspaceId, "billing");

  return (
    <div className="space-y-2 rounded-lg bg-dls-surface-muted/[0.035] px-2.5 py-2" data-testid="session-image-generation-panel">
      <div className="flex min-w-0 items-center">
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-[12px] font-medium text-dls-secondary transition-colors hover:bg-dls-hover/45 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--matterhorn-blue-rgb),0.28)]"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <Image className="size-3.5 shrink-0 text-dls-text/75" />
          <span className="truncate">Generate image</span>
          {capabilityHint ? (
            <span className="min-w-0 truncate text-[11px] font-normal text-dls-secondary/80">· {capabilityHint}</span>
          ) : null}
        </button>
      </div>

      {open ? (
        <div id={panelId} className="space-y-2">
          {canGenerate ? (
            <ImageGenerationComposer
              capabilityStatus={imageGenerationStatus}
              isGenerating={generating}
              onGenerate={generateImage}
              suggestedPrompt={props.suggestedPrompt}
            />
          ) : capabilitiesQuery.isLoading && !capabilities ? (
            <div className="rounded-md bg-dls-surface-muted/30 px-3 py-2 text-[12px] leading-5 text-dls-secondary" role="status">
              Checking image provider...
            </div>
          ) : (
            <ImageGenerationComposer
              capabilityStatus={imageGenerationStatus ?? "needs_setup"}
              isGenerating={generating}
              onGenerate={generateImage}
              setupHref={generatedMediaSettingsHref}
            />
          )}
          {generating ? <GeneratedImageLoadingCard /> : null}
          {error ? (
            <GeneratedImageErrorCard
              message={error.title}
              description={error.description}
              onRetry={latestImage ? () => void generateImage({ prompt: latestImage.prompt }) : undefined}
              actionHref={error.action === "billing"
                ? billingSettingsHref
                : undefined}
              actionLabel={error.action === "billing" ? "Open Billing" : undefined}
            />
          ) : null}
          {latestImage && !generating ? (
            <GeneratedImageCard
              image={latestImage}
              imageUrl={previewUrl ?? undefined}
              isGenerating={generating}
              onGenerateVariant={() => void generateImage({ prompt: latestImage.prompt })}
              onMakeNft={() => void openNftDraft(latestImage)}
            />
          ) : null}
          <GeneratedMediaHistory
            items={historyItems}
            selectedImageId={latestImage?.id ?? null}
            onSelectImage={setSelectedImage}
            onMakeNft={(image) => void openNftDraft(image)}
          />
        </div>
      ) : null}

      {nftImage ? (
        <NftDraftWalletBridge
          open={nftPanelOpen}
          onOpenChange={setNftPanelOpen}
          image={nftImage}
          imageUrl={previewUrl ?? undefined}
          capabilities={nftCapabilities}
          readinessSetupRequirements={publishingSetupRequirements}
          draft={nftDraft}
          mintPreview={nftMintPreview}
          listingPreview={nftListingPreview}
          setupRequirements={nftSetupRequirements}
          isLoading={nftBusy}
          onCreateDraft={createDraft}
          onPrepareStorage={() => void updateDraft((draftId) => props.client.prepareNftStorage(props.workspaceId, draftId))}
          onUploadStorage={() => void updateDraft((draftId) => props.client.uploadNftStorage(props.workspaceId, draftId))}
          onPreviewMint={previewMint}
          onRecordMintReceipt={recordMintReceipt}
          onPreviewListing={previewListing}
          onRecordListingReceipt={recordListingReceipt}
        />
      ) : null}
    </div>
  );
}
