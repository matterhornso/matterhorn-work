/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatterhornCapabilityStatus } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornGeneratedMediaHistoryItem,
  MatterhornImageNftDraft,
} from "@matterhorn-work/types/generated-media";
import type {
  MatterhornDataControlAction,
  MatterhornDataControlStore,
} from "@matterhorn-work/types/backend-data-controls";
import {
  generatedMediaStatusLabel,
  buildNftPublishingReadinessItems,
  buildNftPublishingSetupRequirements,
  NftPublishingReadinessRows,
  NftPublishingSetupRows,
  rollUpNftPublishingReadinessStatus,
} from "../../session/media";
import {
  SettingsInset,
  SettingsNotice,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSectionHeaderActions,
  SettingsSectionHeaderContent,
  SettingsSectionHeaderDescription,
  SettingsSectionHeaderTitle,
  SettingsStack,
} from "../settings-section";
import {
  backendCapabilityLabel,
  backendCapabilityTone,
  storageLocationLabel,
} from "../backend-capability-status";

export type GeneratedMediaSettingsViewProps = {
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  onOpenWorkspaceChat: () => void;
  onOpenRunHistory: () => void;
};

function statusToneClass(status: MatterhornCapabilityStatus | "unavailable" | "local") {
  const tone = status === "local" ? "neutral" : status === "unavailable" ? "error" : backendCapabilityTone(status);
  if (tone === "ready") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "setup") return "bg-sky-500/10 text-sky-300";
  if (tone === "preview") return "bg-amber-500/10 text-amber-300";
  if (tone === "error") return "bg-red-500/10 text-red-300";
  return "bg-dls-hover/70 text-dls-secondary";
}

function StatusText(props: { status: MatterhornCapabilityStatus | "unavailable" | "local"; label?: string }) {
  const label =
    props.label ??
    (props.status === "unavailable"
      ? "Unavailable"
      : props.status === "local"
        ? "Local"
        : backendCapabilityLabel(props.status));
  return (
    <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-medium", statusToneClass(props.status))}>
      {label}
    </span>
  );
}

function CountStrip(props: {
  images: number;
  drafts: number;
  minted: number;
  listed: number;
}) {
  const items = [
    ["Images", props.images],
    ["Drafts", props.drafts],
    ["Minted", props.minted],
    ["Listed", props.listed],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-dls-surface-muted/35 px-3 py-2">
          <div className="text-lg font-semibold tabular-nums text-dls-text">{value}</div>
          <div className="text-xs text-dls-secondary">{label}</div>
        </div>
      ))}
    </div>
  );
}

function formatBytes(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function compact(value: string | undefined | null) {
  if (!value) return null;
  if (value.length <= 34) return value;
  return `${value.slice(0, 18)}...${value.slice(-10)}`;
}

function isPublicDraft(draft: MatterhornImageNftDraft) {
  return draft.storage.status === "uploaded"
    || Boolean(draft.storage.blobId || draft.storage.objectId || draft.storage.transactionDigest || draft.storage.url)
    || draft.mint.status === "confirmed"
    || Boolean(draft.mint.transactionDigest || draft.mint.objectId)
    || draft.listing.status === "listed";
}

function canDeleteImage(item: MatterhornGeneratedMediaHistoryItem) {
  return item.drafts.length === 0;
}

function canDeleteDraft(draft: MatterhornImageNftDraft) {
  return !isPublicDraft(draft);
}

function RecentMediaRows(props: {
  items: MatterhornGeneratedMediaHistoryItem[];
  loading: boolean;
  deletingImageId?: string | null;
  onDeleteImage: (item: MatterhornGeneratedMediaHistoryItem) => void;
}) {
  if (props.loading) {
    return <SettingsInset className="text-sm text-dls-secondary">Loading generated media...</SettingsInset>;
  }
  if (!props.items.length) {
    return (
      <SettingsInset className="text-sm leading-6 text-dls-secondary">
        No generated images yet. Open workspace chat to generate an image and save it to Outputs.
      </SettingsInset>
    );
  }

  return (
    <div className="divide-y divide-dls-border/40">
      {props.items.slice(0, 6).map((item) => (
        <RecentMediaRow
          key={item.id}
          item={item}
          deleting={props.deletingImageId === item.image.id}
          onDelete={() => props.onDeleteImage(item)}
        />
      ))}
    </div>
  );
}

function RecentMediaRow(props: { item: MatterhornGeneratedMediaHistoryItem; deleting: boolean; onDelete: () => void }) {
  const image = props.item.image;
  const size = formatBytes(image.byteLength);
  const showDelete = canDeleteImage(props.item);
  return (
    <div className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
          <ImageIcon className="size-4 shrink-0 text-dls-secondary" />
          <span className="truncate">{image.prompt}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-dls-secondary">
          <span>{generatedMediaStatusLabel(props.item)}</span>
          <span>{image.provider}/{image.model}</span>
          <span>{image.format.toUpperCase()}</span>
          {size ? <span>{size}</span> : null}
          <span>{formatRelativeTime(Date.parse(props.item.updatedAt))}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <StatusText status="local" label={compact(image.fileName) ?? "Output"} />
        {showDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-red-300 hover:text-red-200"
            onClick={props.onDelete}
            disabled={props.deleting}
          >
            <Trash2 className="size-3" />
            {props.deleting ? "Deleting" : "Delete"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DraftRows(props: {
  drafts: MatterhornImageNftDraft[];
  loading: boolean;
  deletingDraftId?: string | null;
  onDeleteDraft: (draft: MatterhornImageNftDraft) => void;
}) {
  if (props.loading) {
    return <SettingsInset className="text-sm text-dls-secondary">Loading NFT drafts...</SettingsInset>;
  }
  if (!props.drafts.length) {
    return <SettingsInset className="text-sm text-dls-secondary">No NFT drafts yet.</SettingsInset>;
  }

  return (
    <div className="divide-y divide-dls-border/40">
      {props.drafts.slice(0, 5).map((draft) => {
        const showDelete = canDeleteDraft(draft);
        const deleting = props.deletingDraftId === draft.id;
        return (
          <div key={draft.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
                <Store className="size-4 shrink-0 text-dls-secondary" />
                <span className="truncate">{draft.title}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-dls-secondary">
                <span>{draft.network}</span>
                <span>Storage {draft.storage.status.replace(/_/g, " ")}</span>
                <span>Mint {draft.mint.status.replace(/_/g, " ")}</span>
                <span>Listing {draft.listing.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusText status="local" label={draft.status.replace(/_/g, " ")} />
              {showDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] text-red-300 hover:text-red-200"
                  onClick={() => props.onDeleteDraft(draft)}
                  disabled={deleting}
                >
                  <Trash2 className="size-3" />
                  {deleting ? "Deleting" : "Delete"}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function controlStores(stores: Record<string, MatterhornDataControlStore> | undefined) {
  if (!stores) return [];
  return ["imageOutputs", "outputs", "evidence", "audit"]
    .map((id) => stores[id])
    .filter((store): store is MatterhornDataControlStore => Boolean(store));
}

function actionStatus(action: MatterhornDataControlAction) {
  const label = action.destructive ? "Delete" : action.method ?? action.kind;
  return `${label} · ${backendCapabilityLabel(action.status)}`;
}

function DataControlRows(props: { stores: MatterhornDataControlStore[]; loading: boolean }) {
  if (props.loading) {
    return <SettingsInset className="text-sm text-dls-secondary">Loading data controls...</SettingsInset>;
  }
  if (!props.stores.length) {
    return <SettingsInset className="text-sm text-dls-secondary">Generated media data controls are unavailable.</SettingsInset>;
  }
  return (
    <div className="divide-y divide-dls-border/40">
      {props.stores.map((store) => {
        const actions = [...store.export.actions, ...store.deletion.actions].slice(0, 3);
        return (
          <div key={store.storeId} className="grid gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
                  <Database className="size-4 shrink-0 text-dls-secondary" />
                  <span>{store.store.label}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  {storageLocationLabel(store.store)} · {store.retention.label}
                </p>
              </div>
              <StatusText status={store.store.status} />
            </div>
            {actions.length ? (
              <div className="flex flex-wrap gap-1.5">
                {actions.map((action) => (
                  <span key={action.id} className="rounded-md bg-dls-hover/50 px-2 py-1 text-[11px] text-dls-secondary">
                    {actionStatus(action)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GeneratedMediaSettingsView(props: GeneratedMediaSettingsViewProps) {
  const queryClient = useQueryClient();
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const enabled = Boolean(props.matterhornServerClient && workspaceId);

  const capabilitiesQuery = useQuery({
    queryKey: ["settings-generated-media-capabilities"],
    enabled: Boolean(props.matterhornServerClient),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Work engine is offline.");
      return client.backendCapabilities();
    },
  });
  const historyQuery = useQuery({
    queryKey: ["settings-generated-media-history", workspaceId],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to load generated media.");
      return client.listGeneratedMediaHistory(workspaceId);
    },
  });
  const draftsQuery = useQuery({
    queryKey: ["settings-generated-media-drafts", workspaceId],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to load NFT drafts.");
      return client.listImageNftDrafts(workspaceId);
    },
  });
  const dataControlsQuery = useQuery({
    queryKey: ["settings-generated-media-data-controls", workspaceId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to load data controls.");
      return client.workspaceDataControls(workspaceId);
    },
  });

  const refreshGeneratedMediaData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settings-generated-media-history", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["settings-generated-media-drafts", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["settings-generated-media-data-controls", workspaceId] }),
    ]);
  };

  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to delete generated media.");
      setDeletingImageId(imageId);
      return client.deleteGeneratedImage(workspaceId, imageId);
    },
    onSuccess: async () => {
      setDeleteStatus("Local generated image deleted.");
      await refreshGeneratedMediaData();
    },
    onError: (deleteError) => {
      setDeleteStatus(deleteError instanceof Error ? deleteError.message : "Generated image could not be deleted.");
    },
    onSettled: () => setDeletingImageId(null),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to delete NFT drafts.");
      setDeletingDraftId(draftId);
      return client.deleteImageNftDraft(workspaceId, draftId);
    },
    onSuccess: async () => {
      setDeleteStatus("Local NFT draft deleted.");
      await refreshGeneratedMediaData();
    },
    onError: (deleteError) => {
      setDeleteStatus(deleteError instanceof Error ? deleteError.message : "NFT draft could not be deleted.");
    },
    onSettled: () => setDeletingDraftId(null),
  });

  const deleteImage = (item: MatterhornGeneratedMediaHistoryItem) => {
    if (!canDeleteImage(item)) {
      setDeleteStatus("Delete local NFT drafts before deleting this image.");
      return;
    }
    const label = compact(item.image.fileName) ?? item.image.id;
    if (
      typeof window !== "undefined"
      && !window.confirm(`Delete local generated image ${label}? This removes the workspace output file and metadata.`)
    ) {
      return;
    }
    setDeleteStatus(null);
    deleteImageMutation.mutate(item.image.id);
  };

  const deleteDraft = (draft: MatterhornImageNftDraft) => {
    if (!canDeleteDraft(draft)) {
      setDeleteStatus("Public storage, mint, or listing state is retained for accountability.");
      return;
    }
    if (
      typeof window !== "undefined"
      && !window.confirm(`Delete local NFT draft ${draft.title}? Public NFT state is never deleted from here.`)
    ) {
      return;
    }
    setDeleteStatus(null);
    deleteDraftMutation.mutate(draft.id);
  };

  const capabilities = capabilitiesQuery.data;
  const publishingReadiness = useMemo(() => capabilities ? buildNftPublishingReadinessItems({
    imageGeneration: capabilities.imageGeneration,
    walrusStorage: capabilities.walrusStorage,
    nftMinting: capabilities.nftMinting,
    nftMarketplaceListing: capabilities.nftMarketplaceListing,
  }) : [], [capabilities]);
  const publishingStatus = publishingReadiness.length
    ? rollUpNftPublishingReadinessStatus(publishingReadiness)
    : "unavailable";
  const publishingSetupRequirements = useMemo(() => capabilities ? buildNftPublishingSetupRequirements({
    imageGeneration: capabilities.imageGeneration,
    walrusStorage: capabilities.walrusStorage,
    nftMinting: capabilities.nftMinting,
    nftMarketplaceListing: capabilities.nftMarketplaceListing,
  }) : [], [capabilities]);
  const dataControlStores = useMemo(() => controlStores(dataControlsQuery.data?.stores), [dataControlsQuery.data?.stores]);
  const counts = historyQuery.data?.counts ?? { images: 0, drafts: 0, minted: 0, listed: 0 };
  const isRefreshing =
    capabilitiesQuery.isFetching ||
    historyQuery.isFetching ||
    draftsQuery.isFetching ||
    dataControlsQuery.isFetching;

  const refreshAll = () => {
    void capabilitiesQuery.refetch();
    void historyQuery.refetch();
    void draftsQuery.refetch();
    void dataControlsQuery.refetch();
  };

  return (
    <SettingsStack>
      {!enabled ? (
        <SettingsNotice tone="error">
          Open a connected workspace to review generated media readiness, NFT drafts, and data controls.
        </SettingsNotice>
      ) : null}

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>Production readiness</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Image generation, Walrus storage, Sui NFT minting, and marketplace listing are reported by the local backend.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
          <SettingsSectionHeaderActions>
            <StatusText status={publishingStatus} />
            <Button variant="ghost" size="icon-sm" className="border-0 bg-transparent shadow-none" onClick={refreshAll} disabled={isRefreshing}>
              <span className="sr-only">Refresh generated media status</span>
              <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            </Button>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeader>

        {capabilitiesQuery.isError ? (
          <SettingsNotice tone="error">
            Generated media capabilities could not load. Check the local Matterhorn Work engine.
          </SettingsNotice>
        ) : null}

        {publishingReadiness.length ? (
          <>
            <NftPublishingReadinessRows
              items={publishingReadiness}
              title="Publishing readiness"
              description="Image creation can work before public storage or NFT publishing is configured."
              surface
            />
            <NftPublishingSetupRows
              requirements={publishingSetupRequirements}
              description="Configure these local backend values before public storage, mint previews, or listing previews are available."
            />
          </>
        ) : (
          <SettingsInset className="text-sm text-dls-secondary">
            Loading publishing readiness...
          </SettingsInset>
        )}
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>Recent media</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Generated images are saved under workspace outputs. NFT drafts remain local until public storage or wallet receipts are recorded.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
          <SettingsSectionHeaderActions>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={props.onOpenWorkspaceChat}>
              <ExternalLink className="size-3.5" />
              Open workspace chat
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={props.onOpenRunHistory}>
              <Clock3 className="size-3.5" />
              Run history
            </Button>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeader>

        <CountStrip images={counts.images} drafts={counts.drafts} minted={counts.minted} listed={counts.listed} />
        {deleteStatus ? <SettingsNotice>{deleteStatus}</SettingsNotice> : null}
        {historyQuery.isError ? (
          <SettingsNotice tone="error">Generated media history could not load.</SettingsNotice>
        ) : null}
        <RecentMediaRows
          items={historyQuery.data?.items ?? []}
          loading={historyQuery.isLoading}
          deletingImageId={deletingImageId}
          onDeleteImage={deleteImage}
        />
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>NFT drafts</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Draft rows show local storage state, public mint receipts, and listing receipt state without exposing wallet signatures.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
        </SettingsSectionHeader>
        {draftsQuery.isError ? <SettingsNotice tone="error">NFT drafts could not load.</SettingsNotice> : null}
        <DraftRows
          drafts={draftsQuery.data?.drafts ?? []}
          loading={draftsQuery.isLoading}
          deletingDraftId={deletingDraftId}
          onDeleteDraft={deleteDraft}
        />
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>Data controls</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Review where generated media lives and which export or deletion controls are available.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
          <SettingsSectionHeaderActions>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={props.onOpenRunHistory}>
              <FileText className="size-3.5" />
              Review evidence
              <ArrowRight className="size-3.5" />
            </Button>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeader>
        {dataControlsQuery.isError ? <SettingsNotice tone="error">Generated media data controls could not load.</SettingsNotice> : null}
        <DataControlRows stores={dataControlStores} loading={dataControlsQuery.isLoading} />
      </SettingsSection>
    </SettingsStack>
  );
}
