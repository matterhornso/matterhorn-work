/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";
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

type NftCapabilityStatus = "working" | "needs_setup" | "preview";

export interface SessionImageGenerationPanelProps {
  client: MatterhornServerClient;
  workspaceId: string;
  sessionId: string;
  defaultOpen?: boolean;
  onNotice?: (notice: ReactComposerNotice) => void;
  capabilitiesOverride?: NftPublishingReadinessCapabilities;
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

function nftSetupRequirementsFromError(error: unknown): MatterhornNftSetupRequirement[] {
  if (!(error instanceof MatterhornServerError)) return [];
  const details = error.details as Partial<MatterhornNftPreviewErrorDetails> | undefined;
  return Array.isArray(details?.setupRequirements) ? details.setupRequirements : [];
}

export function SessionImageGenerationPanel(props: SessionImageGenerationPanelProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const capabilityLabel = capabilitiesQuery.isLoading && !capabilities
    ? "Checking image provider..."
    : canGenerate
      ? "Ready"
      : "Needs setup";
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
      setError("Image generation needs setup.");
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
      setError(generatedImageErrorMessage(nextError));
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
      setNftSetupRequirements(setupRequirements);
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : undefined,
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
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
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
      setNftSetupRequirements(setupRequirements);
      setNftMintPreview(null);
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : undefined,
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
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
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
      setNftSetupRequirements(setupRequirements);
      setNftListingPreview(null);
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
        description: setupRequirements.length
          ? setupRequirements
            .filter((requirement) => requirement.status !== "configured")
            .map((requirement) => requirement.envVar ?? requirement.label)
            .join(", ")
          : undefined,
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
      props.onNotice?.({
        title: generatedImageErrorMessage(nextError),
        tone: "warning",
      });
    } finally {
      setNftBusy(false);
    }
  }, [generatedMediaHistoryQueryKey, nftDraft, props.client, props.onNotice, props.workspaceId, queryClient]);

  const nftCapabilities = nftDraftPublishingCapabilitiesFromBackend(capabilities);

  return (
    <div className="space-y-2" data-testid="session-image-generation-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[12px] font-medium text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--matterhorn-blue-rgb),0.32)]"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          <Image className="size-3.5" />
          <span>Generate image</span>
        </button>
        <span className="text-[11px] text-dls-muted">{capabilityLabel}</span>
      </div>

      {open ? (
        <div className="space-y-2">
          {canGenerate ? (
            <ImageGenerationComposer
              capabilityStatus={imageGenerationStatus}
              isGenerating={generating}
              onGenerate={generateImage}
            />
          ) : (
            <div className="rounded-md bg-dls-surface-muted/45 px-3 py-2 text-[12px] leading-5 text-dls-secondary">
              Image generation needs setup. Configure an image provider, or run the local app with the mock provider for testing.
            </div>
          )}
          {generating ? <GeneratedImageLoadingCard /> : null}
          {error ? (
            <GeneratedImageErrorCard
              message={error}
              onRetry={latestImage ? () => void generateImage({ prompt: latestImage.prompt }) : undefined}
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
