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
  MatterhornNftPreviewErrorDetails,
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
import {
  NftDraftPanel,
} from "./nft-draft-panel";

type NftCapabilityStatus = "working" | "needs_setup" | "preview";

export interface SessionImageGenerationPanelProps {
  client: MatterhornServerClient;
  workspaceId: string;
  sessionId: string;
  defaultOpen?: boolean;
  onNotice?: (notice: ReactComposerNotice) => void;
  capabilitiesOverride?: {
    imageGeneration?: { status: MatterhornCapabilityStatus };
    walrusStorage?: { status: MatterhornCapabilityStatus };
    nftMinting?: { status: MatterhornCapabilityStatus };
    nftMarketplaceListing?: { status: MatterhornCapabilityStatus };
  };
}

function capabilityReady(status: MatterhornCapabilityStatus | undefined) {
  return status === "working" || status === "preview";
}

function nftCapabilityStatus(status: MatterhornCapabilityStatus | undefined): NftCapabilityStatus {
  if (status === "working" || status === "preview") return status;
  return "needs_setup";
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

  const capabilitiesQuery = useQuery({
    queryKey: ["session-image-generation-capabilities"],
    enabled: !props.capabilitiesOverride,
    staleTime: 30_000,
    queryFn: () => props.client.backendCapabilities(),
  });
  const generatedImagesQueryKey = useMemo(
    () => ["session-generated-images", props.workspaceId] as const,
    [props.workspaceId],
  );
  const generatedImagesQuery = useQuery({
    queryKey: generatedImagesQueryKey,
    enabled: open,
    staleTime: 10_000,
    queryFn: () => props.client.listGeneratedImages(props.workspaceId),
  });

  const capabilities = props.capabilitiesOverride ?? capabilitiesQuery.data;
  const imageGenerationStatus = capabilities?.imageGeneration?.status;
  const canGenerate = capabilityReady(imageGenerationStatus);
  const latestImage = selectedImage ?? generatedImagesQuery.data?.images?.[0] ?? null;
  const capabilityLabel = capabilitiesQuery.isLoading && !capabilities
    ? "Checking image provider..."
    : canGenerate
      ? "Ready"
      : "Needs setup";

  useEffect(() => {
    setSelectedImage(null);
    setPreviewUrl(null);
    setNftPanelOpen(false);
    setNftImage(null);
    setNftDraft(null);
    setNftSetupRequirements([]);
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
      await queryClient.invalidateQueries({ queryKey: generatedImagesQueryKey });
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
    generatedImagesQueryKey,
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
  }, [nftDraft, props.onNotice]);

  const createDraft = useCallback(async (input: MatterhornImageNftDraftInput) => {
    if (!nftImage) return;
    setNftBusy(true);
    try {
      const response = await props.client.createImageNftDraft(props.workspaceId, nftImage.id, input);
      setNftDraft(response.draft);
      setNftSetupRequirements([]);
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
  }, [nftImage, props.client, props.onNotice, props.workspaceId]);

  const nftCapabilities = {
    walrusStorage: nftCapabilityStatus(capabilities?.walrusStorage?.status),
    nftMinting: nftCapabilityStatus(capabilities?.nftMinting?.status),
    nftMarketplaceListing: nftCapabilityStatus(capabilities?.nftMarketplaceListing?.status),
  };

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
        </div>
      ) : null}

      {nftImage ? (
        <NftDraftPanel
          open={nftPanelOpen}
          onOpenChange={setNftPanelOpen}
          image={nftImage}
          imageUrl={previewUrl ?? undefined}
          capabilities={nftCapabilities}
          draft={nftDraft}
          setupRequirements={nftSetupRequirements}
          isLoading={nftBusy}
          onCreateDraft={createDraft}
          onPrepareStorage={() => void updateDraft((draftId) => props.client.prepareNftStorage(props.workspaceId, draftId))}
          onUploadStorage={() => void updateDraft((draftId) => props.client.uploadNftStorage(props.workspaceId, draftId))}
          onPreviewMint={() => void updateDraft(async (draftId) => {
            const response = await props.client.previewNftMint(props.workspaceId, draftId);
            return { draft: response.draft };
          })}
          onRecordMintReceipt={() => {
            props.onNotice?.({
              title: "Record the public mint receipt after wallet signing.",
              tone: "info",
            });
          }}
          onPreviewListing={() => void updateDraft(async (draftId) => {
            const response = await props.client.previewNftListing(props.workspaceId, draftId);
            return { draft: response.draft };
          })}
          onRecordListingReceipt={() => {
            props.onNotice?.({
              title: "Record the public listing receipt after wallet signing.",
              tone: "info",
            });
          }}
        />
      ) : null}
    </div>
  );
}
