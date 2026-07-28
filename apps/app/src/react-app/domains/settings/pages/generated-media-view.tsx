/** @jsxImportSource react */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Download,
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  Store,
  Trash2,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatterhornCapabilityStatus } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornGeneratedMediaDiagnosticCheck,
  MatterhornGeneratedMediaDiagnosticsResponse,
  MatterhornGeneratedMediaProductionSmokePlan,
  MatterhornGeneratedMediaProductionSmokeStage,
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
  SettingsNotice,
  RefreshButton,
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
} from "../backend-capability-status";
import { settingsStorageLocationLabel } from "../state/privacy-display";
import { useStatusToasts } from "../../shell-feedback/status-toasts";

export type GeneratedMediaSettingsViewProps = {
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  onOpenWorkspaceChat: () => void;
  onOpenRunHistory: () => void;
  onOpenImageProviderSetup?: () => void;
  onOpenBilling?: () => void;
};

function statusToneClass(status: MatterhornCapabilityStatus | "unavailable" | "local") {
  const tone = status === "local" ? "neutral" : status === "unavailable" ? "error" : backendCapabilityTone(status);
  if (tone === "ready") return "bg-emerald-500/10 text-emerald-300";
  if (tone === "setup") return "bg-dls-hover/70 text-dls-secondary";
  if (tone === "preview") return "bg-amber-500/10 text-amber-300";
  if (tone === "error") return "bg-red-500/10 text-red-300";
  return "bg-dls-hover/70 text-dls-secondary";
}

function StatusText(props: { status: MatterhornCapabilityStatus | "unavailable" | "local"; label?: string }) {
  const label =
    props.label ??
    (props.status === "unavailable"
      ? "Workspace unavailable"
      : props.status === "local"
        ? "Local"
        : props.status === "needs_setup"
          ? "Platform setup"
        : backendCapabilityLabel(props.status));
  return (
    <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-medium", statusToneClass(props.status))}>
      {label}
    </span>
  );
}

function diagnosticToneClass(status: MatterhornGeneratedMediaDiagnosticCheck["status"]) {
  if (status === "pass") return "bg-emerald-500/10 text-emerald-300";
  if (status === "warning") return "bg-amber-500/10 text-amber-300";
  return "bg-red-500/10 text-red-300";
}

function DiagnosticStatusText(props: { status: MatterhornGeneratedMediaDiagnosticCheck["status"] }) {
  const label = props.status === "pass" ? "Passed" : props.status === "warning" ? "Review" : "Failed";
  return (
    <span className={cn("inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[11px] font-medium", diagnosticToneClass(props.status))}>
      {label}
    </span>
  );
}

function productionModeLabel(mode: MatterhornGeneratedMediaProductionSmokePlan["mode"]) {
  if (mode === "production_candidate") return "Production candidate";
  if (mode === "local_test") return "Local test";
  return "Platform setup";
}

function productionStageLabel(status: MatterhornGeneratedMediaProductionSmokeStage["status"]) {
  if (status === "ready") return "Ready";
  if (status === "manual") return "User action";
  return "Blocked";
}

function productionStageToneClass(status: MatterhornGeneratedMediaProductionSmokeStage["status"]) {
  if (status === "ready") return "bg-emerald-500/10 text-emerald-300";
  if (status === "manual") return "bg-amber-500/10 text-amber-300";
  return "bg-red-500/10 text-red-300";
}

function writeScopeLabel(scope: MatterhornGeneratedMediaProductionSmokeStage["writeScope"]) {
  if (scope === "workspace_output") return "Workspace output";
  if (scope === "public_storage") return "Public storage";
  if (scope === "wallet_signed_transaction") return "Wallet transaction";
  return "No write";
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 py-1">
      {items.map(([label, value]) => (
        <span key={label} className="inline-flex items-baseline gap-1.5 text-xs text-dls-secondary">
          <span className="font-semibold tabular-nums text-dls-text">{value}</span>
          {label}
        </span>
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

function safeDownloadFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function decodeReportText(data: ArrayBuffer) {
  return new TextDecoder().decode(data);
}

function downloadMarkdownFile(filename: string, data: ArrayBuffer, contentType: string | null) {
  if (typeof document === "undefined") return;
  const blob = new Blob([data], { type: contentType ?? "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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
    return <p className="py-4 text-sm text-dls-secondary">Loading generated media...</p>;
  }
  if (!props.items.length) {
    return (
      <div className="py-6 text-sm leading-6 text-dls-secondary">
        No generated images yet. Create one from chat and it will appear here with its output and NFT draft state.
      </div>
    );
  }

  return (
    <div className="grid gap-1">
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
            aria-label={`Delete local generated image ${image.id}`}
            className="h-7 gap-1 px-2 text-[11px] text-red-300 hover:text-red-200"
            onClick={props.onDelete}
            disabled={props.deleting}
          >
            <Trash2 className="size-3" />
            {props.deleting ? "Deleting" : "Delete local"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DiagnosticsRows(props: {
  diagnostics?: MatterhornGeneratedMediaDiagnosticsResponse;
  loading: boolean;
  error?: string | null;
}) {
  if (props.loading) {
    return <p className="py-3 text-sm text-dls-secondary">Running generated media diagnostics...</p>;
  }
  if (props.error) {
    return <SettingsNotice tone="error">{props.error}</SettingsNotice>;
  }
  if (!props.diagnostics) {
    return (
      <p className="py-2 text-sm leading-6 text-dls-secondary">
        Run diagnostics to safely check provider setup, Walrus reachability, Sui publishing config, and non-custody guarantees.
      </p>
    );
  }
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-2.5">
        <p className="text-sm text-dls-secondary">{props.diagnostics.summary}</p>
        <DiagnosticStatusText status={props.diagnostics.status} />
      </div>
      {props.diagnostics.checks.map((check) => (
        <div key={check.id} className="grid gap-2 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
              <ShieldCheck className="size-4 shrink-0 text-dls-secondary" />
              <span>{check.label}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-dls-secondary">{check.summary}</p>
          </div>
          <div className="flex items-center gap-2">
            {typeof check.durationMs === "number" ? (
              <span className="text-[11px] tabular-nums text-dls-muted">{check.durationMs} ms</span>
            ) : null}
            <DiagnosticStatusText status={check.status} />
          </div>
        </div>
      ))}
      <ProductionSmokePlanRows plan={props.diagnostics.productionSmokePlan} />
    </div>
  );
}

function ProductionSmokePlanRows(props: { plan: MatterhornGeneratedMediaProductionSmokePlan }) {
  const blockers = props.plan.blockers.filter((requirement) => requirement.status !== "configured");
  return (
    <div className="grid gap-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-dls-text">Production smoke plan</p>
            <span className="rounded-md bg-dls-hover/70 px-2 py-0.5 text-[11px] font-medium text-dls-secondary">
              {productionModeLabel(props.plan.mode)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-dls-secondary">{props.plan.summary}</p>
        </div>
        <span className="text-[11px] text-dls-muted">
          {props.plan.publicWritesOnlyAfterUserAction ? "Public writes require user action" : "Review writes"}
        </span>
      </div>

      <div className="grid gap-2">
        {props.plan.stages.map((stage) => (
          <div key={stage.id} className="grid gap-2 rounded-md bg-dls-surface-muted/25 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-medium text-dls-text">{stage.label}</span>
                <span className="text-[11px] text-dls-secondary">{writeScopeLabel(stage.writeScope)}</span>
                {stage.requiresWallet ? <span className="text-[11px] text-dls-secondary">Wallet required</span> : null}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-dls-secondary">{stage.summary}</p>
            </div>
            <span className={cn("inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-medium", productionStageToneClass(stage.status))}>
              {productionStageLabel(stage.status)}
            </span>
          </div>
        ))}
      </div>

      {blockers.length ? (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-dls-text">Production blockers</p>
          <div className="flex flex-wrap gap-1.5">
            {blockers.map((requirement) => (
              <code key={`${requirement.key}:${requirement.envVar ?? requirement.label}`} className="rounded-sm bg-dls-surface px-1.5 py-0.5 font-mono text-[10px] text-dls-secondary">
                {requirement.envVar ?? requirement.label}
              </code>
            ))}
          </div>
        </div>
      ) : null}
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
    return <p className="py-4 text-sm text-dls-secondary">Loading NFT drafts...</p>;
  }
  if (!props.drafts.length) {
    return <p className="py-6 text-sm text-dls-secondary">No NFT drafts yet.</p>;
  }

  return (
    <div className="grid gap-1">
      {props.drafts.slice(0, 5).map((draft) => {
        const showDelete = canDeleteDraft(draft);
        const deleting = props.deletingDraftId === draft.id;
        return (
          <div key={draft.id} className="grid gap-2 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
                  aria-label={`Delete local NFT draft ${draft.id}`}
                  className="h-7 gap-1 px-2 text-[11px] text-red-300 hover:text-red-200"
                  onClick={() => props.onDeleteDraft(draft)}
                  disabled={deleting}
                >
                  <Trash2 className="size-3" />
                  {deleting ? "Deleting" : "Delete local"}
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

function DataControlActionChips(props: { label: string; actions: MatterhornDataControlAction[]; destructive?: boolean }) {
  if (!props.actions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-dls-muted">{props.label}</span>
      {props.actions.slice(0, 4).map((action) => (
        <span
          key={action.id}
          className={cn(
            "rounded-md bg-dls-hover/50 px-2 py-1 text-[11px] text-dls-secondary",
            props.destructive && "bg-red-500/10 text-red-300",
          )}
        >
          {action.label} · {actionStatus(action)}
        </span>
      ))}
    </div>
  );
}

function DataControlRows(props: { stores: MatterhornDataControlStore[]; loading: boolean }) {
  if (props.loading) {
    return <p className="py-3 text-sm text-dls-secondary">Loading data controls...</p>;
  }
  if (!props.stores.length) {
    return <p className="py-3 text-sm text-dls-secondary">Generated media data controls are unavailable.</p>;
  }
  return (
    <div className="grid gap-1">
      {props.stores.map((store) => {
        const exportActions = store.export.actions;
        const deleteActions = store.deletion.actions;
        return (
          <div key={store.storeId} className="grid gap-2 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
                  <Database className="size-4 shrink-0 text-dls-secondary" />
                  <span>{store.store.label}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  {settingsStorageLocationLabel(store.store)} · {store.retention.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-dls-muted">
                  {store.export.label}: {store.export.summary}
                </p>
                <p className="mt-1 text-xs leading-5 text-dls-muted">
                  {store.deletion.label}: {store.deletion.summary}
                </p>
              </div>
              <StatusText status={store.store.status} />
            </div>
            <DataControlActionChips label="Export" actions={exportActions} />
            <DataControlActionChips label="Delete" actions={deleteActions} destructive />
          </div>
        );
      })}
    </div>
  );
}

function GeneratedMediaWorkspaceState(props: { engineConnected: boolean }) {
  return (
    <div className="flex max-w-xl flex-col items-start py-10">
      <span className="mb-4 flex size-9 items-center justify-center rounded-md bg-dls-surface-muted/[0.12] text-dls-secondary">
        <ImageIcon className="size-4" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-dls-text">
        {props.engineConnected ? "Select a workspace" : "Generated media is unavailable"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-dls-secondary">
        {props.engineConnected
          ? "Choose a workspace from the sidebar to review its images, NFT drafts, publishing readiness, and data controls."
          : "Reconnect the Matterhorn Desks engine, then open a workspace to manage generated media."}
      </p>
      <p className="mt-3 text-xs leading-5 text-dls-muted">
        Generated media is workspace-scoped so files, receipts, and deletion controls stay attached to the correct project.
      </p>
    </div>
  );
}

export function GeneratedMediaSettingsView(props: GeneratedMediaSettingsViewProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStatusToasts();
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [readinessReportStatus, setReadinessReportStatus] = useState<string | null>(null);
  const [readinessReportBusy, setReadinessReportBusy] = useState<"copy" | "download" | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [libraryView, setLibraryView] = useState<"images" | "drafts">("images");
  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const enabled = Boolean(props.matterhornServerClient && workspaceId);

  const capabilitiesQuery = useQuery({
    queryKey: ["settings-generated-media-capabilities"],
    enabled: Boolean(props.matterhornServerClient),
    staleTime: 30_000,
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Desks engine is offline.");
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
      showToast({
        title: "Generated image deleted",
        description: "The local output file and metadata were removed.",
        tone: "success",
      });
      await refreshGeneratedMediaData();
    },
    onError: (deleteError) => {
      const message = deleteError instanceof Error ? deleteError.message : "Generated image could not be deleted.";
      setDeleteStatus(message);
      showToast({ title: "Generated image was not deleted", description: message, tone: "error" });
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
      showToast({
        title: "NFT draft deleted",
        description: "The local draft was removed. Public receipts are retained when present.",
        tone: "success",
      });
      await refreshGeneratedMediaData();
    },
    onError: (deleteError) => {
      const message = deleteError instanceof Error ? deleteError.message : "NFT draft could not be deleted.";
      setDeleteStatus(message);
      showToast({ title: "NFT draft was not deleted", description: message, tone: "error" });
    },
    onSettled: () => setDeletingDraftId(null),
  });

  const diagnosticsMutation = useMutation({
    mutationFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !workspaceId) throw new Error("Open a workspace to run generated media diagnostics.");
      return client.generatedMediaDiagnostics(workspaceId);
    },
    onMutate: () => setDiagnosticsError(null),
    onSuccess: (diagnostics) => {
      showToast({
        title: diagnostics.status === "fail" ? "Diagnostics found blockers" : "Diagnostics complete",
        description: diagnostics.summary,
        tone: diagnostics.status === "fail" ? "warning" : "info",
      });
    },
    onError: (diagnosticError) => {
      const message = diagnosticError instanceof Error ? diagnosticError.message : "Generated media diagnostics could not run.";
      setDiagnosticsError(message);
      showToast({ title: "Diagnostics could not run", description: message, tone: "error" });
    },
  });

  const fetchReadinessReport = async () => {
    const client = props.matterhornServerClient;
    if (!client || !workspaceId) throw new Error("Open a workspace to export generated media readiness.");
    return client.downloadGeneratedMediaReadinessReport(workspaceId);
  };

  const copyReadinessReport = async () => {
    setReadinessReportBusy("copy");
    setReadinessReportStatus(null);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard is unavailable in this browser.");
      }
      const report = await fetchReadinessReport();
      await navigator.clipboard.writeText(decodeReportText(report.data));
      setReadinessReportStatus("Copied generated media readiness report.");
      showToast({
        title: "Readiness report copied",
        description: "The generated media setup report is on your clipboard.",
        tone: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not copy the readiness report.";
      setReadinessReportStatus(message);
      showToast({ title: "Readiness report was not copied", description: message, tone: "error" });
    } finally {
      setReadinessReportBusy(null);
    }
  };

  const downloadReadinessReport = async () => {
    setReadinessReportBusy("download");
    setReadinessReportStatus(null);
    try {
      const report = await fetchReadinessReport();
      const filename = report.filename ?? `matterhorn-generated-media-readiness-${safeDownloadFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.md`;
      downloadMarkdownFile(filename, report.data, report.contentType);
      setReadinessReportStatus("Downloaded generated media readiness report.");
      showToast({
        title: "Readiness report downloaded",
        description: filename,
        tone: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not download the readiness report.";
      setReadinessReportStatus(message);
      showToast({ title: "Readiness report was not downloaded", description: message, tone: "error" });
    } finally {
      setReadinessReportBusy(null);
    }
  };

  const deleteImage = (item: MatterhornGeneratedMediaHistoryItem) => {
    if (!canDeleteImage(item)) {
      setDeleteStatus("Delete local NFT drafts before deleting this image.");
      showToast({
        title: "Delete NFT drafts first",
        description: "Images with local NFT drafts stay linked until those drafts are removed.",
        tone: "warning",
      });
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
      showToast({
        title: "Draft has public evidence",
        description: "Public storage, mint, or listing records are retained for accountability.",
        tone: "warning",
      });
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
  const imageProviderSetupRequired = publishingSetupRequirements.some((requirement) =>
    requirement.envVar === "OPENAI_API_KEY" || requirement.envVar === "MATTERHORN_IMAGE_PROVIDER"
  );
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

  if (!enabled) {
    return (
      <SettingsStack>
        <GeneratedMediaWorkspaceState engineConnected={Boolean(props.matterhornServerClient)} />
      </SettingsStack>
    );
  }

  return (
    <SettingsStack>
      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>Production readiness</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Image generation, public storage, Sui minting, and listing are reported by the local backend.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
          <SettingsSectionHeaderActions>
            <StatusText status={publishingStatus} />
            <RefreshButton busy={isRefreshing} onRefresh={refreshAll}>Refresh generated media status</RefreshButton>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeader>

        {capabilitiesQuery.isError ? (
          <SettingsNotice tone="error">
            Generated media capabilities could not load. Check the local Matterhorn Desks engine.
          </SettingsNotice>
        ) : null}

        {publishingReadiness.length ? (
          <>
            <NftPublishingReadinessRows
              items={publishingReadiness}
              title="Publishing path"
              description="Image creation can work before public storage or NFT publishing is configured."
              surface
              needsSetupLabel="Platform setup"
            />
            <NftPublishingSetupRows
              requirements={publishingSetupRequirements}
              title="Platform setup"
              description="These services are configured by the Matterhorn platform operator, not by an end user."
            />
            {imageProviderSetupRequired && props.onOpenImageProviderSetup ? (
              <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Add an OpenAI image provider to generate real images from chat.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1.5 border-0 bg-dls-surface-muted/[0.12] text-xs shadow-none hover:bg-dls-surface-muted/[0.18]"
                  onClick={props.onOpenImageProviderSetup}
                >
                  <ImageIcon className="size-3.5" />
                  Open image provider setup
                </Button>
              </div>
            ) : null}
            {props.onOpenBilling && capabilities ? (
              <div className="flex flex-col gap-2 py-2 text-sm text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Plan limits apply to image generation and public NFT publishing. Local drafts remain available.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1.5 text-xs"
                  onClick={props.onOpenBilling}
                >
                  <Store className="size-3.5" />
                  Open billing
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="py-4 text-sm text-dls-secondary">Loading publishing readiness...</p>
        )}
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader>
          <SettingsSectionHeaderContent>
            <SettingsSectionHeaderTitle>Media library</SettingsSectionHeaderTitle>
            <SettingsSectionHeaderDescription>
              Generated images and local NFT drafts for this workspace.
            </SettingsSectionHeaderDescription>
          </SettingsSectionHeaderContent>
          <SettingsSectionHeaderActions>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 px-2 text-xs", libraryView === "images" ? "bg-dls-surface-muted/[0.12] text-dls-text" : "bg-transparent text-dls-secondary")}
              aria-pressed={libraryView === "images"}
              onClick={() => setLibraryView("images")}
            >
              Images
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 px-2 text-xs", libraryView === "drafts" ? "bg-dls-surface-muted/[0.12] text-dls-text" : "bg-transparent text-dls-secondary")}
              aria-pressed={libraryView === "drafts"}
              onClick={() => setLibraryView("drafts")}
            >
              NFT drafts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 border-0 bg-dls-surface-muted/[0.12] text-xs shadow-none hover:bg-dls-surface-muted/[0.18]"
              onClick={props.onOpenWorkspaceChat}
            >
              <ImageIcon className="size-3.5" />
              Generate image
            </Button>
          </SettingsSectionHeaderActions>
        </SettingsSectionHeader>

        <CountStrip images={counts.images} drafts={counts.drafts} minted={counts.minted} listed={counts.listed} />
        {deleteStatus ? <SettingsNotice>{deleteStatus}</SettingsNotice> : null}
        {libraryView === "images" && historyQuery.isError ? (
          <SettingsNotice tone="error">Generated media history could not load.</SettingsNotice>
        ) : null}
        {libraryView === "images" ? (
          <RecentMediaRows
            items={historyQuery.data?.items ?? []}
            loading={historyQuery.isLoading}
            deletingImageId={deletingImageId}
            onDeleteImage={deleteImage}
          />
        ) : (
          <>
            {draftsQuery.isError ? <SettingsNotice tone="error">NFT drafts could not load.</SettingsNotice> : null}
            <DraftRows
              drafts={draftsQuery.data?.drafts ?? []}
              loading={draftsQuery.isLoading}
              deletingDraftId={deletingDraftId}
              onDeleteDraft={deleteDraft}
            />
          </>
        )}
        <Button variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-xs text-dls-secondary hover:bg-transparent hover:text-dls-text" onClick={props.onOpenRunHistory}>
          <Clock3 className="size-3.5" />
          View run history
        </Button>
      </SettingsSection>

      <SettingsSection>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 py-2">
            <span>
              <span className="block text-sm font-medium text-dls-text">Diagnostics and readiness report</span>
              <span className="mt-1 block text-xs leading-5 text-dls-secondary">Diagnostics do not generate images, upload media, sign, or submit transactions.</span>
            </span>
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-dls-secondary transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 pt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" className="gap-1.5 bg-dls-surface-muted/[0.12] text-xs" onClick={() => diagnosticsMutation.mutate()} disabled={diagnosticsMutation.isPending}>
                <ShieldCheck className="size-3.5" />
                {diagnosticsMutation.isPending ? "Checking" : "Run diagnostics"}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => void copyReadinessReport()} disabled={readinessReportBusy !== null}>
                <Copy className="size-3.5" />
                {readinessReportBusy === "copy" ? "Copying" : "Copy report"}
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => void downloadReadinessReport()} disabled={readinessReportBusy !== null}>
                <Download className="size-3.5" />
                {readinessReportBusy === "download" ? "Downloading" : "Download report"}
              </Button>
            </div>
            <DiagnosticsRows diagnostics={diagnosticsMutation.data} loading={diagnosticsMutation.isPending} error={diagnosticsError} />
            {readinessReportStatus ? <SettingsNotice>{readinessReportStatus}</SettingsNotice> : null}
          </div>
        </details>
      </SettingsSection>

      <SettingsSection>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 py-2">
            <span>
              <span className="block text-sm font-medium text-dls-text">Storage and data controls</span>
              <span className="mt-1 block text-xs leading-5 text-dls-secondary">Review retention, exports, deletion controls, and saved evidence.</span>
            </span>
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-dls-secondary transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 pt-3">
            <Button variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-xs text-dls-secondary hover:bg-transparent hover:text-dls-text" onClick={props.onOpenRunHistory}>
              <FileText className="size-3.5" />
              Review evidence
              <ArrowRight className="size-3.5" />
            </Button>
            {dataControlsQuery.isError ? <SettingsNotice tone="error">Generated media data controls could not load.</SettingsNotice> : null}
            <DataControlRows stores={dataControlStores} loading={dataControlsQuery.isLoading} />
          </div>
        </details>
      </SettingsSection>
    </SettingsStack>
  );
}
