/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  Boxes,
  BrainCircuit,
  ChevronDown,
  CheckCircle2,
  Circle,
  CircleUser,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FolderCog,
  FolderOpen,
  Info,
  ListTodo,
  Lock,
  MessageSquareText,
  Network,
  NotebookPen,
  Palette,
  Play,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from "lucide-react";

import type { MatterhornServerClient, MatterhornTaskRun } from "../../../../app/lib/matterhorn-server";
import type {
  MatterhornDataStoreDescriptor,
  MatterhornWorkspaceDataMapResponse,
} from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornDataControlStore,
  MatterhornWorkspaceDataControlsResponse,
} from "@matterhorn-work/types/backend-data-controls";
import type {
  MatterhornWorkspaceDataPolicyResponse,
  MatterhornWorkspaceFeedbackUse,
} from "@matterhorn-work/types/backend-data-policy";
import type {
  MatterhornBackendTeamAccessResponse,
  MatterhornBackendTeamAccessSummaryResponse,
  MatterhornTeamShareableTokenScope,
} from "@matterhorn-work/types/backend-team-access";
import {
  MATTERHORN_PROJECT_FEEDBACK_KINDS,
  type MatterhornProjectDataLedgerEntry,
  type MatterhornProjectDataLedgerResponse,
  type MatterhornProjectFeedbackKind,
} from "@matterhorn-work/types/project-data-ledger";
import { t } from "../../../../i18n";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useQuickJot } from "../../notes";
import { RecentActivitySection } from "../../recent-activity/recent-activity-section";
import {
  backendCapabilityLabel,
  backendCapabilityTone,
  storageLocationLabel,
  summarizeCapability,
  summarizeModelSource,
  summarizeModelRoutingPolicy,
  walletFamilySummary,
  workspaceDataPolicySummary,
  type BackendCapabilityTone,
} from "../backend-capability-status";
import { GLOBAL_HOME_SIDE_PANEL_KEY, useUiStateStore } from "../../../shell/ui-state-store";
import { workspaceNotesRoute, workspaceRunHistoryRoute, workspaceSessionRoute } from "../../../shell/workspace-routes";
import type { SettingsTab } from "../../../../app/types";
import {
  getInitialThemeMode,
  setThemeMode,
  subscribeToTheme,
  type ThemeMode,
} from "../../../../app/theme";

const APP_VERSION = String(
  import.meta.env.VITE_MATTERHORN_WORK_APP_VERSION ?? import.meta.env.VITE_OPENWORK_APP_VERSION ?? "",
).trim();
const DENSITY_STORAGE_KEY = "matterhorn:settings:density";

type Density = "comfortable" | "compact";

function readDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function applyDensity(value: Density) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.density = value;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, value);
    } catch {
      // ignore persistence failures
    }
  }
}

function safeDownloadFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function downloadJsonFile(filename: string, content: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SettingsCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 px-3 py-5 first:pt-3 last:pb-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text">
          {props.icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-dls-text">{props.title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-dls-secondary">{props.description}</p>
        </div>
        {props.status ? <div className="ml-auto shrink-0">{props.status}</div> : null}
      </div>
      {props.children ? <div className="flex flex-col divide-y divide-dls-border/45 pl-12">{props.children}</div> : null}
    </section>
  );
}

function Row(props: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 px-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dls-text">{props.label}</p>
        {props.hint ? <p className="mt-0.5 break-words text-xs leading-5 text-dls-secondary">{props.hint}</p> : null}
      </div>
      <div className="shrink-0 text-sm text-dls-secondary">{props.value}</div>
    </div>
  );
}

function StatusBadge(props: { children: ReactNode; tone?: BackendCapabilityTone | "desktop" | "cloud" }) {
  const tone =
    props.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : props.tone === "setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : props.tone === "preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : props.tone === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-300"
            : props.tone === "cloud"
              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
              : "border-dls-border bg-background text-dls-secondary";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {props.children}
    </span>
  );
}

function CapabilityBadge(props: { status?: string | null }) {
  const status =
    props.status === "working" ||
    props.status === "needs_setup" ||
    props.status === "preview" ||
    props.status === "unsupported" ||
    props.status === "error"
      ? props.status
      : "error";
  return <StatusBadge tone={backendCapabilityTone(status)}>{backendCapabilityLabel(status)}</StatusBadge>;
}

function ProjectLedgerControlSummary(props: {
  ledger?: MatterhornProjectDataLedgerResponse | null;
  loading?: boolean;
}) {
  const ledger = props.ledger;
  if (!ledger) {
    return props.loading ? <StatusBadge>Loading</StatusBadge> : <StatusBadge tone="error">Unavailable</StatusBadge>;
  }
  const exportable = ledger.items.filter((item) => item.exportable).length;
  const deletable = ledger.items.filter((item) => item.deletable).length;
  const appendOnly = ledger.items.filter((item) => item.retention === "append_only").length;
  const shownLabel = ledger.items.length < ledger.summary.total ? `shown ${ledger.items.length}` : `${ledger.summary.total}`;
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      <StatusBadge>{ledger.summary.total} events</StatusBadge>
      <StatusBadge>{exportable}/{shownLabel} exportable</StatusBadge>
      <StatusBadge>{deletable} deletable</StatusBadge>
      <StatusBadge>{appendOnly} append-only</StatusBadge>
      {ledger.summary.feedback > 0 ? <StatusBadge>{ledger.summary.feedback} feedback</StatusBadge> : null}
    </div>
  );
}

function CopyButton(props: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(props.text).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        },
        () => {},
      );
    }
  }, [props.text]);
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCopy}>
      <Copy size={13} />
      {copied ? "Copied" : props.label}
    </Button>
  );
}

const DATA_POLICY_STORE_ORDER: Array<keyof MatterhornWorkspaceDataMapResponse["stores"]> = [
  "chat",
  "notes",
  "memory",
  "outputs",
  "feedback",
  "audit",
  "taskEvents",
  "workflowRuns",
  "evidence",
];

function retentionLabel(value: MatterhornDataStoreDescriptor["retention"]) {
  if (value === "user_controlled") return "User controlled";
  if (value === "append_only") return "Append-only";
  if (value === "runtime_controlled") return "Runtime controlled";
  return "Unknown";
}

function scopeLabel(value: MatterhornDataStoreDescriptor["scope"]) {
  if (value === "workspace") return "Workspace";
  if (value === "machine_global") return "This device";
  if (value === "opencode_runtime") return "Runtime";
  if (value === "matterhorn_cloud") return "Cloud";
  return "Unknown";
}

function secretsLabel(value: MatterhornDataStoreDescriptor["containsSecrets"]) {
  if (value === "never") return "No secrets";
  if (value === "redacted") return "Redacted";
  if (value === "possible") return "Possible";
  return "Unknown";
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function controlSummary(
  controls: MatterhornWorkspaceDataControlsResponse | undefined,
  store: MatterhornDataStoreDescriptor,
  kind: "export" | "deletion",
) {
  const control = controls?.stores[store.id as keyof MatterhornWorkspaceDataControlsResponse["stores"]];
  if (!control) return kind === "export" ? yesNo(store.exportable) : yesNo(store.deletable);
  return kind === "export" ? control.export.summary : control.deletion.summary;
}

function feedbackKindLabel(value: string | null | undefined) {
  if (value === "thumbs_up") return "Worked well";
  if (value === "thumbs_down") return "Felt rough";
  if (value === "feature_request") return "Request";
  if (value === "bug") return "Bug";
  if (value === "rating") return "Rating";
  if (value === "comment") return "Comment";
  return "Feedback";
}

function feedbackKindFromEntry(entry: MatterhornProjectDataLedgerEntry): MatterhornProjectFeedbackKind | null {
  const kind = entry.metadata?.feedbackKind;
  if (typeof kind !== "string") return null;
  return MATTERHORN_PROJECT_FEEDBACK_KINDS.includes(kind as MatterhornProjectFeedbackKind)
    ? kind as MatterhornProjectFeedbackKind
    : null;
}

function feedbackTargetLabel(entry: MatterhornProjectDataLedgerEntry) {
  const type = entry.metadata?.targetSourceType;
  const id = entry.metadata?.targetSourceId;
  if (typeof type !== "string" || !type) return "workspace";
  if (typeof id === "string" && id) return `${type} · ${id}`;
  return type;
}

function feedbackRatingLabel(entry: MatterhornProjectDataLedgerEntry) {
  const rating = entry.metadata?.rating;
  return typeof rating === "number" ? `${rating}/5` : null;
}

function feedbackIdFromEntry(entry: MatterhornProjectDataLedgerEntry) {
  const feedbackId = entry.metadata?.feedbackId;
  if (typeof feedbackId === "string" && feedbackId.trim()) return feedbackId.trim();
  return entry.id.startsWith("feedback:") ? entry.id.slice("feedback:".length) : entry.id;
}

// ---------------------------------------------------------------------------
// Task History helpers
// ---------------------------------------------------------------------------

function taskStatusMeta(status: MatterhornTaskRun["status"]) {
  if (status === "completed") {
    return { icon: CheckCircle2, label: "Completed", tone: "emerald", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300" };
  }
  if (status === "failed") {
    return { icon: AlertCircle, label: "Failed", tone: "red", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300" };
  }
  if (status === "cancelled") {
    return { icon: Ban, label: "Cancelled", tone: "slate", bg: "bg-dls-surface", border: "border-dls-border", text: "text-muted-foreground" };
  }
  return { icon: Play, label: "Running", tone: "blue", bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-300" };
}

function TaskHistorySection(props: {
  matterhornServerClient: MatterhornServerClient;
  runtimeWorkspaceId: string;
}) {
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ["task-runs", props.runtimeWorkspaceId] as const,
    queryFn: () => props.matterhornServerClient.listTaskRuns(props.runtimeWorkspaceId, 10),
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    staleTime: 30_000,
    refetchInterval: 15_000,
  });

  const runs = data?.runs ?? [];

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 animate-pulse" />
          Loading task history…
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-2 rounded-md bg-red-500/10 px-3 py-3 text-xs text-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Task history could not load.</p>
              <p className="mt-0.5 break-words text-red-200/80">
                {error instanceof Error ? error.message : "Check the workspace connection and try again."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5 border-0 bg-transparent px-0 text-red-100 shadow-none hover:bg-transparent hover:text-red-50"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md bg-dls-surface-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <ListTodo className="size-3.5 shrink-0" />
          Tasks you run from desks will appear here.
        </div>
      ) : (
        <div className="divide-y divide-dls-border/45">
          {runs.map((run) => {
            const meta = taskStatusMeta(run.status);
            const StatusIcon = meta.icon;
            return (
              <div key={run.taskId} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]", meta.bg, meta.border, meta.text)}>
                  <StatusIcon className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium capitalize text-dls-text">{run.desk}</span>
                    <span className="max-w-[10rem] truncate text-[10px] font-medium text-muted-foreground">{run.sessionSlug}</span>
                    <span className={cn("ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", meta.bg, meta.border, meta.text)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-5 text-muted-foreground">{run.outcomeSummary}</p>
                  {run.artifactPaths.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {run.artifactPaths.slice(0, 3).map((path) => (
                        <span
                          key={path}
                          className="max-w-[200px] truncate rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] text-muted-foreground"
                          title={path}
                        >
                          {path}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelativeTime(run.updatedAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DataPolicySection(props: {
  dataMap: MatterhornWorkspaceDataMapResponse;
  controls?: MatterhornWorkspaceDataControlsResponse;
  dataPolicy?: MatterhornWorkspaceDataPolicyResponse;
  feedbackPolicySaving?: boolean;
  feedbackPolicyError?: string | null;
  onFeedbackPolicyChange?: (enabled: boolean) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stores = DATA_POLICY_STORE_ORDER
    .map((key) => props.dataMap.stores[key])
    .filter(Boolean);
  const highlightedControls = stores
    .map((store) => props.controls?.stores[store.id as keyof MatterhornWorkspaceDataControlsResponse["stores"]])
    .filter((control): control is MatterhornDataControlStore => Boolean(control))
    .slice(0, 4);
  const retentionPolicy = props.controls?.policy.retention ?? props.dataMap.policy.retention;
  const feedbackEnabled = (props.dataPolicy?.policy.feedbackUse ?? props.dataMap.policy.feedbackUse) !== "disabled";
  const userControlledCount = stores.filter((store) => store.retention === "user_controlled").length;
  const appendOnlyCount = stores.filter((store) => store.retention === "append_only").length;
  const exportableCount = stores.filter((store) => store.exportable).length;
  const deletableCount = stores.filter((store) => store.deletable).length;

  return (
    <div className="px-1 py-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-dls-text">Workspace data policy</p>
        <StatusBadge tone="ready">{workspaceDataPolicySummary(props.dataMap)}</StatusBadge>
      </div>
      <div className="mb-4 grid gap-2 lg:grid-cols-3">
        <div className="rounded-lg bg-dls-surface-muted/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-dls-text">Model training</p>
            <StatusBadge>Off</StatusBadge>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
            Workspace data is not used for RL or model training.
          </p>
        </div>
        <div className="rounded-lg bg-dls-surface-muted/20 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-dls-text">Feedback collection</p>
              <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
                {feedbackEnabled
                  ? "Explicit feedback only. Product quality and routing, not training."
                  : "New feedback writes are blocked. Existing feedback can still be exported or deleted."}
              </p>
            </div>
            <Switch
              size="sm"
              checked={feedbackEnabled}
              disabled={!props.onFeedbackPolicyChange || props.feedbackPolicySaving}
              onCheckedChange={(checked) => props.onFeedbackPolicyChange?.(checked)}
              aria-label="Toggle workspace feedback collection"
            />
          </div>
          {props.feedbackPolicyError ? (
            <p className="mt-2 text-[11px] leading-4 text-destructive">{props.feedbackPolicyError}</p>
          ) : props.feedbackPolicySaving ? (
            <p className="mt-2 text-[11px] leading-4 text-dls-secondary">Saving...</p>
          ) : null}
        </div>
        <div className="rounded-lg bg-dls-surface-muted/20 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-dls-text">Export and delete</p>
            <StatusBadge>{exportableCount}/{stores.length} exportable</StatusBadge>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
            {deletableCount} user-controlled stores can be deleted from their owning surfaces. {appendOnlyCount} history stores are append-only.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-dls-surface-muted/20 px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-dls-text">Retention</p>
            <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
              {userControlledCount} user-controlled stores. {retentionPolicy.windowLabel}
            </p>
          </div>
          <StatusBadge>{retentionPolicy.label}</StatusBadge>
        </div>
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger
          render={(
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-dls-secondary transition-colors hover:text-dls-text"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", detailsOpen && "rotate-180")} />
              Storage locations and controls
            </button>
          )}
        />
        <CollapsibleContent>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-xs">
              <thead className="text-dls-secondary">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Store</th>
                  <th className="pb-2 pr-4 font-medium">Location</th>
                  <th className="pb-2 pr-4 font-medium">Retention</th>
                  <th className="pb-2 pr-4 font-medium">Export</th>
                  <th className="pb-2 pr-4 font-medium">Delete</th>
                  <th className="pb-2 font-medium">Secrets</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id} className="align-top">
                    <td className="border-t border-dls-border/45 py-2 pr-4">
                      <p className="font-medium text-dls-text">{store.label}</p>
                      <p className="mt-0.5 text-[11px] text-dls-secondary">{scopeLabel(store.scope)}</p>
                    </td>
                    <td className="max-w-[260px] border-t border-dls-border/45 py-2 pr-4">
                      <span className="block truncate font-mono text-[11px] text-dls-secondary" title={storageLocationLabel(store)}>
                        {storageLocationLabel(store)}
                      </span>
                    </td>
                    <td className="border-t border-dls-border/45 py-2 pr-4 text-dls-secondary">{retentionLabel(store.retention)}</td>
                    <td className="max-w-[220px] border-t border-dls-border/45 py-2 pr-4 text-dls-secondary">
                      {controlSummary(props.controls, store, "export")}
                    </td>
                    <td className="max-w-[220px] border-t border-dls-border/45 py-2 pr-4 text-dls-secondary">
                      {controlSummary(props.controls, store, "deletion")}
                    </td>
                    <td className="border-t border-dls-border/45 py-2 text-dls-secondary">{secretsLabel(store.containsSecrets)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {props.controls ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {highlightedControls.map((control) => (
                <div key={control.storeId} className="rounded-lg bg-dls-surface-muted/20 px-3 py-2">
                  <p className="text-xs font-medium text-dls-text">{control.store.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
                    {control.export.label} · {control.deletion.label}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
      <p className="mt-3 text-xs leading-5 text-dls-secondary">
        User-controlled stores can be managed from their own surfaces. {retentionPolicy.summary}
      </p>
    </div>
  );
}

function FeedbackReviewSection(props: {
  matterhornServerClient: MatterhornServerClient;
  runtimeWorkspaceId: string;
}) {
  const [filter, setFilter] = useState<"all" | MatterhornProjectFeedbackKind>("all");
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ["settings-feedback-review", props.runtimeWorkspaceId],
    queryFn: () => props.matterhornServerClient.listProjectDataLedger(props.runtimeWorkspaceId, {
      source: "feedback",
      limit: 50,
    }),
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    staleTime: 30_000,
  });

  const items = (data?.items ?? []).filter((entry) => {
    const kind = feedbackKindFromEntry(entry);
    return filter === "all" || kind === filter;
  });
  const feedbackCount = data?.summary.feedback ?? 0;

  const deleteFeedback = useCallback(async (entry: MatterhornProjectDataLedgerEntry) => {
    const feedbackId = feedbackIdFromEntry(entry);
    if (!feedbackId) return;
    setDeletingFeedbackId(feedbackId);
    setDeleteStatus(null);
    try {
      await props.matterhornServerClient.deleteProjectFeedback(props.runtimeWorkspaceId, feedbackId);
      setDeleteStatus("Feedback deleted.");
      await refetch();
    } catch (deleteError) {
      setDeleteStatus(deleteError instanceof Error ? deleteError.message : "Feedback could not be deleted.");
    } finally {
      setDeletingFeedbackId(null);
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId, refetch]);

  const deleteAllFeedback = useCallback(async () => {
    if (feedbackCount <= 0) return;
    if (typeof window !== "undefined" && !window.confirm("Delete all local feedback for this workspace?")) return;
    setDeleteAllBusy(true);
    setDeleteStatus(null);
    try {
      const response = await props.matterhornServerClient.deleteAllProjectFeedback(props.runtimeWorkspaceId);
      setDeleteStatus(`Deleted ${response.deletedCount} feedback entr${response.deletedCount === 1 ? "y" : "ies"}.`);
      await refetch();
    } catch (deleteError) {
      setDeleteStatus(deleteError instanceof Error ? deleteError.message : "Feedback could not be cleared.");
    } finally {
      setDeleteAllBusy(false);
    }
  }, [feedbackCount, props.matterhornServerClient, props.runtimeWorkspaceId, refetch]);

  return (
    <div className="px-1 py-3">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setFilter("all")}
          >
            All {feedbackCount}
          </Button>
          {MATTERHORN_PROJECT_FEEDBACK_KINDS.map((kind) => (
            <Button
              key={kind}
              variant={filter === kind ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setFilter(kind)}
            >
              {feedbackKindLabel(kind)}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-fit px-2 text-xs text-dls-secondary hover:text-dls-text"
          disabled={feedbackCount <= 0 || deleteAllBusy}
          onClick={() => void deleteAllFeedback()}
        >
          {deleteAllBusy ? "Deleting" : "Delete all"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm leading-6 text-dls-secondary">Loading feedback...</p>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-dls-secondary">
          <span>{error instanceof Error ? error.message : "Feedback could not load."}</span>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm leading-6 text-dls-secondary">No matching local feedback yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((entry) => {
            const kind = feedbackKindFromEntry(entry);
            const rating = feedbackRatingLabel(entry);
            const feedbackId = feedbackIdFromEntry(entry);
            return (
              <div key={entry.id} className="rounded-lg px-2 py-2 transition-colors hover:bg-dls-hover/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-dls-text">{feedbackKindLabel(kind)}</span>
                  {rating ? <span className="text-xs text-dls-secondary">{rating}</span> : null}
                  <span className="text-xs text-dls-secondary">{feedbackTargetLabel(entry)}</span>
                  <span className="ml-auto text-xs text-dls-secondary">{formatRelativeTime(Date.parse(entry.timestamp))}</span>
                  {entry.deletable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-dls-secondary hover:text-dls-text"
                      disabled={deletingFeedbackId === feedbackId}
                      onClick={() => void deleteFeedback(entry)}
                    >
                      {deletingFeedbackId === feedbackId ? "Deleting" : "Delete"}
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-dls-secondary">
                  {entry.summary?.trim() || "No comment."}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {deleteStatus ? <p className="mt-3 text-xs leading-5 text-dls-secondary">{deleteStatus}</p> : null}
    </div>
  );
}

function TeamAccessControls(props: {
  client?: MatterhornServerClient | null;
  workspaceId: string;
  summary?: MatterhornBackendTeamAccessSummaryResponse;
  data?: MatterhornBackendTeamAccessResponse;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  isOpen: boolean;
  onOpen: () => void;
  refetch: () => Promise<unknown>;
}) {
  const { client, workspaceId, refetch } = props;
  const [scope, setScope] = useState<MatterhornTeamShareableTokenScope>("viewer");
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<{
    id: string;
    token: string;
    scope: MatterhornTeamShareableTokenScope;
    label?: string;
    createdAt: number;
  } | null>(null);
  const [busyTokenId, setBusyTokenId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sharedTokens = props.data?.localAccess.tokens.filter((token) => token.source === "token_store") ?? [];
  const tokenCount = props.summary?.localAccess.tokenCount ?? props.data?.localAccess.tokenCount ?? 0;
  const sharedCount = props.data ? sharedTokens.length : Math.max(0, tokenCount - 1);
  const connection = props.summary?.connection ?? props.data?.connection;
  const canUseTokenControls = Boolean(client && workspaceId && !props.isLoading && props.data);

  const createToken = useCallback(async () => {
    if (!client || !workspaceId) {
      setStatus("Open a connected workspace to create a local access token.");
      return;
    }
    setBusyTokenId("create");
    setStatus(null);
    try {
      const response = await client.createWorkspaceTeamAccessToken(workspaceId, {
        scope,
        label: label.trim() || undefined,
      });
      setCreatedToken({
        id: response.token.id,
        token: response.token.token,
        scope,
        label: response.token.label,
        createdAt: response.token.createdAt,
      });
      setLabel("");
      setStatus("Local access token created. Copy it now; it will not be shown again.");
      await refetch();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create a local access token.");
    } finally {
      setBusyTokenId(null);
    }
  }, [client, label, refetch, scope, workspaceId]);

  const revokeToken = useCallback(async (tokenId: string, tokenLabel?: string) => {
    if (!client || !workspaceId) {
      setStatus("Open a connected workspace to revoke a local access token.");
      return;
    }
    setBusyTokenId(tokenId);
    setStatus(null);
    try {
      await client.revokeWorkspaceTeamAccessToken(workspaceId, tokenId);
      if (createdToken?.id === tokenId) setCreatedToken(null);
      setStatus(`Revoked ${tokenLabel || "local access token"}.`);
      await refetch();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not revoke the local access token.");
    } finally {
      setBusyTokenId(null);
    }
  }, [client, createdToken?.id, refetch, workspaceId]);

  if (!props.isOpen) {
    return (
      <div className="flex flex-col gap-2 px-1 py-3 text-sm text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
        <span className="leading-6">
          {props.summary?.sharingMode.label ?? "Local token sharing"}: {sharedCount} shared token{sharedCount === 1 ? "" : "s"}.{" "}
          {connection?.reachableFromOtherDevices === false
            ? "This server is bound to this device."
            : "Token details stay host-protected."}
        </span>
        <Button variant="ghost" size="sm" className="w-fit px-2 text-xs" onClick={props.onOpen}>
          Manage tokens
        </Button>
      </div>
    );
  }

  if (props.isLoading) {
    return <p className="px-1 py-3 text-sm leading-6 text-dls-secondary">Loading local access tokens...</p>;
  }

  if (props.isError) {
    return (
      <div className="flex flex-col gap-2 px-1 py-3 text-sm text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
        <span>
          {props.error instanceof Error
            ? props.error.message
            : "Token management requires host access on this local server."}
        </span>
        <Button variant="ghost" size="sm" className="w-fit px-2 text-xs" onClick={() => void props.refetch()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="px-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dls-text">Local access tokens</p>
          <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
            {props.summary?.sharingMode.description ?? "Create a viewer or collaborator token for this local workspace server."}
          </p>
        </div>
        <span className="ml-auto text-xs text-dls-secondary">
          {sharedTokens.length || sharedCount} shared
        </span>
      </div>

      {connection ? (
        <div className="mt-3 grid gap-2 rounded-md bg-dls-surface/55 px-2.5 py-2 text-xs leading-5 text-dls-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-dls-text">Connect custom remote</span>
            <span className="text-dls-secondary">
              {connection.reachableFromOtherDevices ? "Reachable server URL" : "Local-only server URL"}
            </span>
            <div className="ml-auto">
              <CopyButton text={connection.serverUrl} label="Copy server URL" />
            </div>
          </div>
          <code className="block truncate font-mono text-[11px] text-dls-secondary" title={connection.serverUrl}>
            {connection.serverUrl}
          </code>
          <p>
            Teammates should open Matterhorn Work, choose Connect custom remote, then paste this URL and the one-time token.
          </p>
          {!connection.reachableFromOtherDevices ? (
            <p className="text-amber-300">
              This server is bound to {connection.host}. Share it only after you bind or tunnel the local server to a reachable address.
            </p>
          ) : null}
        </div>
      ) : null}

      {props.summary?.scopeCapabilities ? (
        <div className="mt-3 grid gap-2 text-xs leading-5 text-dls-secondary sm:grid-cols-2">
          {(["viewer", "collaborator"] as const).map((item) => {
            const capability = props.summary?.scopeCapabilities[item];
            if (!capability) return null;
            return (
              <div key={item} className="rounded-md bg-dls-surface/55 px-2.5 py-2">
                <p className="font-medium text-dls-text">{capability.label}</p>
                <p className="mt-0.5">{capability.canWriteWorkspace ? "Can read and write workspace data." : "Read-only workspace access."}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex rounded-lg bg-dls-surface/70 p-0.5">
          {(["viewer", "collaborator"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 flex-1 rounded-md px-2 text-xs capitalize text-dls-secondary hover:text-dls-text sm:flex-none",
                scope === item && "bg-dls-hover text-dls-text",
              )}
              onClick={() => setScope(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label optional"
          className="h-8 min-w-0 flex-1 text-xs"
          maxLength={80}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          disabled={!canUseTokenControls || busyTokenId === "create"}
          onClick={() => void createToken()}
        >
          {busyTokenId === "create" ? "Creating" : "Create token"}
        </Button>
      </div>

      {createdToken ? (
        <div className="mt-3 rounded-lg bg-dls-surface/70 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium capitalize text-dls-text">{createdToken.scope}</span>
            <span className="text-xs text-dls-secondary">
              {createdToken.label || createdToken.id}
            </span>
            <span className="text-xs text-dls-secondary">{formatRelativeTime(createdToken.createdAt)}</span>
            <div className="ml-auto">
              <CopyButton text={createdToken.token} label="Copy token" />
            </div>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-dls-secondary">{createdToken.token}</p>
        </div>
      ) : null}

      <div className="mt-3 space-y-1">
        {sharedTokens.length ? sharedTokens.map((token) => (
          <div key={token.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-dls-hover/60">
            <span className="text-xs font-medium capitalize text-dls-text">{token.scope}</span>
            <span className="min-w-0 max-w-[18rem] truncate text-xs text-dls-secondary">
              {token.label || token.id}
            </span>
            <span className="text-xs text-dls-secondary">{formatRelativeTime(token.createdAt)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-1.5 text-xs text-dls-secondary hover:text-dls-text"
              disabled={busyTokenId === token.id}
              onClick={() => void revokeToken(token.id, token.label || token.id)}
            >
              {busyTokenId === token.id ? "Revoking" : "Revoke"}
            </Button>
          </div>
        )) : (
          <p className="rounded-lg px-2 py-2 text-xs leading-5 text-dls-secondary">
            No shared local tokens created yet.
          </p>
        )}
      </div>

      {status ? <p className="mt-3 text-xs leading-5 text-dls-secondary">{status}</p> : null}
    </div>
  );
}

export function SettingsOverviewView(props: {
  onSelectTab: (tab: SettingsTab) => void;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
}) {
  const { onSelectTab } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openQuickJot } = useQuickJot();
  const setSidePanelState = useUiStateStore((state) => state.setSidePanelState);
  const [theme, setTheme] = useState<ThemeMode>(getInitialThemeMode());
  const [density, setDensity] = useState<Density>(readDensity());
  const [memoryExportStatus, setMemoryExportStatus] = useState<string | null>(null);
  const [ledgerExportStatus, setLedgerExportStatus] = useState<string | null>(null);
  const [supportReportStatus, setSupportReportStatus] = useState<string | null>(null);
  const notesWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const backendWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";

  useEffect(() => subscribeToTheme(() => setTheme(getInitialThemeMode())), []);

  const onThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    setTheme(mode);
  }, []);

  const onDensityChange = useCallback((value: Density) => {
    applyDensity(value);
    setDensity(value);
  }, []);

  const memoryOverviewQuery = useQuery({
    queryKey: ["settings-memory-overview", backendWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && backendWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !backendWorkspaceId) return { pending: 0, confirmed: 0 };
      const [pendingSuggestions, savedRecords] = await Promise.all([
        client.listWorkspaceMemorySuggestions(backendWorkspaceId, { status: "pending", limit: 100 }),
        client.listWorkspaceMemory(backendWorkspaceId, { limit: 100 }),
      ]);
      return {
        pending: (pendingSuggestions.entries ?? []).filter((entry) => entry.status === "pending").length,
        confirmed: savedRecords.count ?? savedRecords.records.length,
      };
    },
  });

  const workspaceBackendControlPlaneQuery = useQuery({
    queryKey: ["settings-workspace-backend-control-plane", backendWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && backendWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !backendWorkspaceId) throw new Error("Open a workspace to check backend status.");
      return client.workspaceBackendControlPlane(backendWorkspaceId);
    },
    staleTime: 30_000,
  });

  const backendCapabilitiesQuery = useQuery({
    queryKey: ["settings-backend-capabilities"],
    enabled: Boolean(props.matterhornServerClient && (!backendWorkspaceId || workspaceBackendControlPlaneQuery.isError)),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Work engine is offline.");
      return client.backendCapabilities();
    },
    staleTime: 30_000,
  });

  const workspaceReadinessQuery = useQuery({
    queryKey: ["settings-workspace-readiness", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId && workspaceBackendControlPlaneQuery.isError),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to check readiness.");
      return client.workspaceReadiness(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataMapQuery = useQuery({
    queryKey: ["settings-workspace-data-map", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId && workspaceBackendControlPlaneQuery.isError),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see where project data is stored.");
      return client.workspaceDataMap(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataControlsQuery = useQuery({
    queryKey: ["settings-workspace-data-controls", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId && workspaceBackendControlPlaneQuery.isError),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see project data controls.");
      return client.workspaceDataControls(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataPolicyQuery = useQuery({
    queryKey: ["settings-workspace-data-policy", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId && workspaceBackendControlPlaneQuery.isError),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see data policy.");
      return client.workspaceDataPolicy(workspaceId);
    },
    staleTime: 30_000,
  });

  const backendCapabilities = workspaceBackendControlPlaneQuery.data?.capabilities ?? backendCapabilitiesQuery.data;
  const workspaceReadiness = workspaceBackendControlPlaneQuery.data?.readiness ?? workspaceReadinessQuery.data;
  const workspaceDataMap = workspaceBackendControlPlaneQuery.data?.dataMap ?? workspaceDataMapQuery.data;
  const workspaceDataControls = workspaceBackendControlPlaneQuery.data?.dataControls ?? workspaceDataControlsQuery.data;
  const workspaceDataPolicy = workspaceBackendControlPlaneQuery.data?.dataPolicy ?? workspaceDataPolicyQuery.data;
  const updateWorkspaceDataPolicyMutation = useMutation({
    mutationFn: async (feedbackUse: MatterhornWorkspaceFeedbackUse) => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to update data policy.");
      return client.updateWorkspaceDataPolicy(workspaceId, { feedbackUse });
    },
    onSuccess: (policy) => {
      queryClient.setQueryData(["settings-workspace-data-policy", props.runtimeWorkspaceId], policy);
      void queryClient.invalidateQueries({ queryKey: ["settings-workspace-backend-control-plane", backendWorkspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["settings-workspace-data-map", props.runtimeWorkspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["settings-workspace-data-controls", props.runtimeWorkspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["settings-project-data-ledger", props.runtimeWorkspaceId] });
    },
  });
  const handleFeedbackPolicyChange = useCallback((enabled: boolean) => {
    updateWorkspaceDataPolicyMutation.mutate(enabled ? "eval_routing_product_quality_only" : "disabled");
  }, [updateWorkspaceDataPolicyMutation]);
  const backendCapabilitiesLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading || (workspaceBackendControlPlaneQuery.isError && backendCapabilitiesQuery.isLoading)
    : backendCapabilitiesQuery.isLoading;
  const workspaceReadinessLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading || (workspaceBackendControlPlaneQuery.isError && workspaceReadinessQuery.isLoading)
    : workspaceReadinessQuery.isLoading;
  const workspaceDataMapLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading || (workspaceBackendControlPlaneQuery.isError && workspaceDataMapQuery.isLoading)
    : workspaceDataMapQuery.isLoading;

  const projectDataLedgerQuery = useQuery({
    queryKey: ["settings-project-data-ledger", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see the project data ledger.");
      return client.listProjectDataLedger(workspaceId, { limit: 50 });
    },
    staleTime: 30_000,
  });

  const teamAccessSummaryQuery = useQuery({
    queryKey: ["settings-team-access-summary", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see team access.");
      return client.workspaceTeamAccessSummary(workspaceId);
    },
    staleTime: 30_000,
  });
  const [teamTokenManagementOpen, setTeamTokenManagementOpen] = useState(false);
  const teamAccessQuery = useQuery({
    queryKey: ["settings-team-access", props.runtimeWorkspaceId],
    enabled: Boolean(teamTokenManagementOpen && props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to manage local access tokens.");
      return client.workspaceTeamAccess(workspaceId);
    },
    staleTime: 30_000,
  });

  const exportProjectLedger = useCallback(async () => {
    const client = props.matterhornServerClient;
    const workspaceId = props.runtimeWorkspaceId?.trim();
    if (!client || !workspaceId) {
      setLedgerExportStatus("Open a connected workspace to export the project ledger.");
      return;
    }
    setLedgerExportStatus("Exporting...");
    try {
      const exportPayload = await client.exportProjectDataLedger(workspaceId, { limit: 300 });
      downloadJsonFile(
        exportPayload.filename || `matterhorn-project-ledger-${safeDownloadFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(exportPayload, null, 2),
      );
      setLedgerExportStatus(`Exported ${exportPayload.manifest.itemCount} ledger events.`);
    } catch (error) {
      setLedgerExportStatus(error instanceof Error ? error.message : "Could not export the project ledger.");
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId]);

  const exportSupportReport = useCallback(async () => {
    const client = props.matterhornServerClient;
    const workspaceId = props.runtimeWorkspaceId?.trim();
    if (!client || !workspaceId) {
      setSupportReportStatus("Open a connected workspace to download a support report.");
      return;
    }
    setSupportReportStatus("Preparing report...");
    try {
      const report = await client.workspaceBackendSupportReport(workspaceId);
      downloadJsonFile(
        report.filename || `matterhorn-backend-support-${safeDownloadFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(report, null, 2),
      );
      setSupportReportStatus("Downloaded backend support report.");
    } catch (error) {
      setSupportReportStatus(error instanceof Error ? error.message : "Could not download the support report.");
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId]);

  const openMemoryReview = useCallback(() => {
    if (!notesWorkspaceId) return;
    setSidePanelState(GLOBAL_HOME_SIDE_PANEL_KEY, "memory");
    navigate(workspaceSessionRoute(notesWorkspaceId));
  }, [navigate, notesWorkspaceId, setSidePanelState]);

  const openRunHistory = useCallback(() => {
    if (!backendWorkspaceId) return;
    navigate(workspaceRunHistoryRoute(backendWorkspaceId));
  }, [backendWorkspaceId, navigate]);

  const exportMemory = useCallback(async () => {
    const client = props.matterhornServerClient;
    if (!client) return;
    setMemoryExportStatus("Exporting...");
    try {
      const response = backendWorkspaceId
        ? await client.exportWorkspaceMemory(backendWorkspaceId)
        : await client.exportMemory();
      setMemoryExportStatus(`Exported ${response.export.recordCount} records.`);
    } catch (error) {
      setMemoryExportStatus(error instanceof Error ? error.message : "Could not export memory.");
    }
  }, [backendWorkspaceId, props.matterhornServerClient]);

  const themeOptions: Array<{ id: ThemeMode; label: string }> = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-dls-text">Settings</h1>
        <p className="mt-1 text-sm leading-6 text-dls-secondary">
          Your account, appearance, safety, protocols, extensions, workspaces, and diagnostics — all in one place.
        </p>
      </header>

      <div className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="divide-y divide-dls-border/45">
        {/* 1. Profile */}
        <SettingsCard
          icon={<CircleUser size={18} />}
          title="Profile"
          description="Your account and sign-in status."
          status={<StatusBadge tone="setup">Needs setup</StatusBadge>}
        >
          <Row
            label="Account"
            hint="You are not signed in to a Matterhorn Work account. Sign in to sync cloud workspaces. Local use needs no account."
            value={<StatusBadge tone="setup">Signed out</StatusBadge>}
          />
          <div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("cloud-account")}>
              Open account settings
            </Button>
          </div>
        </SettingsCard>

        {/* Backend control plane */}
        <SettingsCard
          icon={<ShieldCheck size={18} />}
          title="Backend status"
          description="What the local Matterhorn Work engine reports for this workspace."
          status={
            backendCapabilities ? (
              <CapabilityBadge status={backendCapabilities.security.memoryWriteGuards.status} />
            ) : backendCapabilitiesLoading ? (
              <StatusBadge>Loading</StatusBadge>
            ) : (
              <StatusBadge tone="error">Unavailable</StatusBadge>
            )
          }
        >
          {backendCapabilities ? (
            <>
              <Row
                label="Model routing"
                hint={`Default: ${summarizeModelSource(backendCapabilities)}. ${summarizeModelRoutingPolicy(backendCapabilities)}`}
                value={<CapabilityBadge status={backendCapabilities.models.status} />}
              />
              <Row
                label="Workspace readiness"
                hint={
                  workspaceReadiness
                    ? `${workspaceReadiness.summary.readyFeatures}/${workspaceReadiness.summary.totalFeatures} actions ready. ${
                        workspaceReadiness.summary.blockingChecks.length
                          ? `Blocked by ${workspaceReadiness.summary.blockingChecks.join(", ")}.`
                          : "No blockers reported."
                      }`
                    : workspaceReadinessLoading
                      ? "Checking workspace readiness."
                      : "Readiness is unavailable until the workspace engine responds."
                }
                value={
                  workspaceReadiness ? (
                    <CapabilityBadge status={workspaceReadiness.summary.status} />
                  ) : workspaceReadinessLoading ? (
                    <StatusBadge>Loading</StatusBadge>
                  ) : (
                    <StatusBadge tone="error">Unavailable</StatusBadge>
                  )
                }
              />
              {workspaceReadiness?.summary.recommendedActions.length ? (
                <div className="px-1 py-3">
                  <p className="text-sm font-medium text-dls-text">Next step</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {workspaceReadiness.summary.recommendedActions.slice(0, 3).map((action) => (
                      <div key={action.actionId} className="flex flex-col gap-1 text-sm leading-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-dls-text">{action.label}</p>
                          <p className="text-xs leading-5 text-dls-secondary">{action.description}</p>
                        </div>
                        {action.command ? (
                          <code className="shrink-0 rounded-md bg-dls-surface px-2 py-1 font-mono text-[11px] text-dls-secondary">
                            {action.command}
                          </code>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <Row
                label="Notes and memory"
                hint={`Notes: ${summarizeCapability(backendCapabilities.notes)} Memory: ${summarizeCapability(backendCapabilities.memory)}`}
                value={
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <CapabilityBadge status={backendCapabilities.notes.status} />
                    <CapabilityBadge status={backendCapabilities.memory.status} />
                  </div>
                }
              />
              <Row
                label="Evidence ledger"
                hint={`Sources: ${backendCapabilities.evidence.sources.join(", ")}.`}
                value={<CapabilityBadge status={backendCapabilities.evidence.status} />}
              />
              <Row
                label="Project ledger"
                hint={
                  projectDataLedgerQuery.data
                    ? `${projectDataLedgerQuery.data.summary.redacted} redacted. Feedback is eval/routing/product-quality only. Append-only history remains exportable for accountability.`
                    : projectDataLedgerQuery.isLoading
                      ? "Loading ledger policy and counts."
                      : "Ledger counts are unavailable until the workspace engine responds."
                }
                value={
                  <ProjectLedgerControlSummary
                    ledger={projectDataLedgerQuery.data}
                    loading={projectDataLedgerQuery.isLoading}
                  />
                }
              />
              <div className="flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-dls-secondary">
                  Download redacted project evidence or a compact backend support report.
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
                    onClick={() => void exportSupportReport()}
                    disabled={!props.matterhornServerClient || !props.runtimeWorkspaceId || workspaceBackendControlPlaneQuery.isLoading}
                  >
                    <Download className="size-3.5" />
                    Support report
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
                    onClick={() => void exportProjectLedger()}
                    disabled={!props.matterhornServerClient || !props.runtimeWorkspaceId || projectDataLedgerQuery.isLoading}
                  >
                    <Download className="size-3.5" />
                    Ledger JSON
                  </Button>
                </div>
              </div>
              {supportReportStatus || ledgerExportStatus ? (
                <p className="px-1 py-2 text-xs leading-5 text-dls-secondary">
                  {[supportReportStatus, ledgerExportStatus].filter(Boolean).join(" ")}
                </p>
              ) : null}
              <Row
                label="Wallet families"
                hint={walletFamilySummary(backendCapabilities)
                  .map((wallet) => `${wallet.family}: ${backendCapabilityLabel(wallet.status)}`)
                  .join(" · ")}
                value={<CapabilityBadge status={backendCapabilities.wallets.status} />}
              />
              <Row
                label="Teams"
                hint={teamAccessSummaryQuery.data
                  ? `${teamAccessSummaryQuery.data.sharingMode.label}. ${teamAccessSummaryQuery.data.localAccess.tokenCount} local access tokens. Owners ${teamAccessSummaryQuery.data.localAccess.byScope.owner}; collaborators ${teamAccessSummaryQuery.data.localAccess.byScope.collaborator}; viewers ${teamAccessSummaryQuery.data.localAccess.byScope.viewer}. Cloud teams: ${backendCapabilityLabel(teamAccessSummaryQuery.data.cloudTeams.status)}.`
                  : teamAccessSummaryQuery.isLoading
                    ? "Loading local access status."
                    : summarizeCapability(backendCapabilities.teams)}
                value={<CapabilityBadge status={backendCapabilities.teams.status} />}
              />
              <TeamAccessControls
                client={props.matterhornServerClient}
                workspaceId={backendWorkspaceId}
                summary={teamAccessSummaryQuery.data}
                data={teamAccessQuery.data}
                error={teamAccessQuery.error}
                isError={teamAccessQuery.isError}
                isLoading={teamAccessQuery.isLoading}
                isOpen={teamTokenManagementOpen}
                onOpen={() => setTeamTokenManagementOpen(true)}
                refetch={teamAccessQuery.refetch}
              />
              <Row
                label="Write guards"
                hint={summarizeCapability(backendCapabilities.security.memoryWriteGuards)}
                value={<CapabilityBadge status={backendCapabilities.security.memoryWriteGuards.status} />}
              />
            </>
          ) : (
            <div className="px-1 py-3 text-sm leading-6 text-dls-secondary">
              {backendCapabilitiesLoading
                ? "Loading backend status..."
                : "The Matterhorn Work engine is offline or did not return a capability report."}
            </div>
          )}
        </SettingsCard>

        {/* 1a. Data Policy */}
        <SettingsCard
          icon={<FolderCog size={18} />}
          title="Data policy"
          description="Where workspace data lives, what can be exported, and what can be deleted."
          status={
            workspaceDataMap ? (
              <CapabilityBadge status={workspaceDataMap.policy.redaction.status} />
            ) : workspaceDataMapLoading ? (
              <StatusBadge>Loading</StatusBadge>
            ) : (
              <StatusBadge tone="error">Unavailable</StatusBadge>
            )
          }
        >
          {workspaceDataMap ? (
            <DataPolicySection
              dataMap={workspaceDataMap}
              controls={workspaceDataControls}
              dataPolicy={workspaceDataPolicy}
              feedbackPolicySaving={updateWorkspaceDataPolicyMutation.isPending}
              feedbackPolicyError={updateWorkspaceDataPolicyMutation.error instanceof Error ? updateWorkspaceDataPolicyMutation.error.message : null}
              onFeedbackPolicyChange={props.matterhornServerClient && props.runtimeWorkspaceId ? handleFeedbackPolicyChange : undefined}
            />
          ) : (
            <div className="px-1 py-3 text-sm leading-6 text-dls-secondary">
              {workspaceDataMapLoading
                ? "Loading workspace data policy..."
                : "Open a connected workspace to review storage, export, and deletion policy."}
            </div>
          )}
        </SettingsCard>

        {/* 1b. Task History */}
        {props.matterhornServerClient && props.runtimeWorkspaceId ? (
          <SettingsCard
            icon={<ListTodo size={18} />}
            title="Task History"
            description="Latest desk tasks and their outputs."
          >
            <div className="pl-0">
              <TaskHistorySection
                matterhornServerClient={props.matterhornServerClient}
                runtimeWorkspaceId={props.runtimeWorkspaceId}
              />
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard
            icon={<ListTodo size={18} />}
            title="Task History"
            description="Latest desk tasks and their outputs."
          >
            <div className="flex items-center gap-2 rounded-lg border border-dls-border bg-dls-surface px-3 py-3 text-xs text-muted-foreground">
              <ListTodo className="size-3.5 shrink-0" />
              Open a workspace to see your task history.
            </div>
          </SettingsCard>
        )}

        {/* 1c. Project Activity */}
        {props.matterhornServerClient && props.runtimeWorkspaceId ? (
          <SettingsCard
            icon={<BrainCircuit size={18} />}
            title="Project Activity"
            description="Notes, tasks, outputs, and memory across this workspace."
          >
            <div className="pl-0">
              <RecentActivitySection
                matterhornServerClient={props.matterhornServerClient}
                runtimeWorkspaceId={props.runtimeWorkspaceId}
                limit={10}
                defaultExpanded={false}
                onOpenHistory={openRunHistory}
              />
            </div>
          </SettingsCard>
        ) : (
          <SettingsCard
            icon={<BrainCircuit size={18} />}
            title="Project Activity"
            description="Notes, tasks, outputs, and memory across this workspace."
          >
            <div className="flex items-center gap-2 rounded-lg border border-dls-border bg-dls-surface px-3 py-3 text-xs text-muted-foreground">
              <ListTodo className="size-3.5 shrink-0" />
              Open a workspace to see project activity.
            </div>
          </SettingsCard>
        )}

        {/* 1d. Feedback Review */}
        {props.matterhornServerClient && props.runtimeWorkspaceId ? (
          <SettingsCard
            icon={<MessageSquareText size={18} />}
            title="Feedback review"
            description="Local feedback stored for product quality and routing. No training by default."
          >
            <FeedbackReviewSection
              matterhornServerClient={props.matterhornServerClient}
              runtimeWorkspaceId={props.runtimeWorkspaceId}
            />
          </SettingsCard>
        ) : (
          <SettingsCard
            icon={<MessageSquareText size={18} />}
            title="Feedback review"
            description="Local feedback stored for product quality and routing. No training by default."
          >
            <div className="px-1 py-3 text-sm leading-6 text-dls-secondary">
              Open a workspace to review local feedback.
            </div>
          </SettingsCard>
        )}

        {/* Memory */}
        <SettingsCard
          icon={<BrainCircuit size={18} />}
          title="Memory"
          description="Review pending suggestions and manage saved memories."
          status={<StatusBadge tone={memoryOverviewQuery.data?.pending ? "setup" : "ready"}>Memory review</StatusBadge>}
        >
          <Row
            label="Pending suggestions"
            hint="Items waiting for explicit review."
            value={memoryOverviewQuery.isLoading ? "Loading" : String(memoryOverviewQuery.data?.pending ?? 0)}
          />
          <Row
            label="Saved memories"
            hint="Confirmed records available for visible chat context."
            value={memoryOverviewQuery.isLoading ? "Loading" : String(memoryOverviewQuery.data?.confirmed ?? 0)}
          />
          <div className="flex flex-wrap gap-2 px-1 py-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={openMemoryReview}
              disabled={!notesWorkspaceId}
            >
              Open Memory review
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-dls-secondary"
              onClick={() => void exportMemory()}
              disabled={!props.matterhornServerClient}
            >
              Export memory bundle
            </Button>
          </div>
          {memoryExportStatus ? (
            <p className="px-1 py-2 text-xs leading-5 text-dls-secondary">{memoryExportStatus}</p>
          ) : null}
        </SettingsCard>

        {/* Notes */}
        <SettingsCard
          icon={<NotebookPen size={18} />}
          title={t("notes.settings_title")}
          description={t("notes.settings_description")}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => navigate(notesWorkspaceId ? workspaceNotesRoute(notesWorkspaceId) : "/notes")}
            >
              <NotebookPen size={14} />
              {t("notes.open_notes")}
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={() => openQuickJot()}>
              {t("notes.quick_jot_title")}
            </Button>
          </div>
        </SettingsCard>

        {/* 2. Appearance */}
        <SettingsCard
          icon={<Palette size={18} />}
          title="Appearance"
          description="Theme, accent, and text density."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <Row
            label="Theme"
            hint="Choose light, dark, or follow your system."
            value={
              <div className="flex gap-1.5">
                {themeOptions.map((option) => (
                  <Button
                    key={option.id}
                    variant={theme === option.id ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => onThemeChange(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            }
          />
          <Row
            label="Matterhorn accent"
            hint="The accent used across the workspace."
            value={
              <span className="flex items-center gap-2">
                <span className="size-5 rounded-full border border-dls-border" style={{ backgroundColor: "var(--matterhorn-blue, #7c3aed)" }} />
                <span className="size-5 rounded-full border border-dls-border" style={{ backgroundColor: "#0D2B4E" }} />
              </span>
            }
          />
          <Row
            label="Text density"
            hint="Comfortable is roomier; compact fits more on screen."
            value={
              <div className="flex gap-1.5">
                <Button variant={density === "comfortable" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onDensityChange("comfortable")}>
                  Comfortable
                </Button>
                <Button variant={density === "compact" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onDensityChange("compact")}>
                  Compact
                </Button>
              </div>
            }
          />
          <div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("appearance")}>
              More appearance options
            </Button>
          </div>
        </SettingsCard>

        {/* 3. Safety & Wallets */}
        <SettingsCard
          icon={<ShieldCheck size={18} />}
          title="Safety & Wallets"
          description="How Matterhorn Work keeps Web3 actions safe."
          status={<StatusBadge tone="setup">Wallet setup</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            Matterhorn Work is <span className="font-medium text-dls-text">non-custodial</span>. It never holds your keys, signs silently, or moves funds on your behalf. You stay in control of every on-chain action.
          </p>
          <ul className="flex list-none flex-col divide-y divide-dls-border/45 text-sm leading-6 text-dls-secondary">
            <li className="px-1 py-3">
              <span className="font-medium text-dls-text">Bittensor:</span> actions are prepared as previews. Anything on-chain is signed in your own external Bittensor-compatible signer — Matterhorn Work cannot sign or broadcast.
            </li>
            <li className="px-1 py-3">
              <span className="font-medium text-dls-text">Hyperliquid &amp; Polymarket:</span> reads and external handoffs only. Live submission is off; your own eligible client executes trades.
            </li>
            <li className="px-1 py-3">
              <span className="font-medium text-dls-text">No secret storage:</span> Matterhorn Work never asks for or stores seed phrases, private keys, or API secrets.
            </li>
          </ul>
        </SettingsCard>

        {/* 4. Protocols */}
        <SettingsCard
          icon={<Network size={18} />}
          title="Protocols"
          description="Status of each Web3 workspace."
          status={<StatusBadge tone="ready">Boundaries visible</StatusBadge>}
        >
          <Row label="Bittensor" hint="TAO, subnets, validators, and staking previews (external signer required)." value={<StatusBadge tone="ready">Beta ready</StatusBadge>} />
          <Row label="Hyperliquid" hint="Account, orderbook, and trade handoffs. Your client executes." value={<StatusBadge tone="preview">External handoff</StatusBadge>} />
          <Row label="Polymarket" hint="Market discovery, odds, compliance, and gated handoffs." value={<StatusBadge tone="preview">Compliance gated</StatusBadge>} />
          <p className="text-xs leading-5 text-dls-secondary">
            Open a protocol workspace from the sidebar to explore its desk.
          </p>
        </SettingsCard>

        {/* 5. MCPs & Connectors */}
        <SettingsCard
          icon={<Boxes size={18} />}
          title="MCPs &amp; Connectors"
          description="Connected protocol tools, app connectors, and custom MCP servers."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            Connect Model Context Protocol (MCP) servers, protocol tools, and app connectors so Matterhorn Work can use them from chat. Some tools may be unavailable until their connector is configured or signed in.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("extensions")}>
              Manage MCPs
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("extensions")}>
              Add a custom MCP
            </Button>
          </div>
        </SettingsCard>

        {/* 6. Workspaces */}
        <SettingsCard
          icon={<FolderCog size={18} />}
          title="Workspaces"
          description="Local and shared workspaces, and diagnostics."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <p className="text-sm leading-6 text-dls-secondary">
            A workspace is a folder on your machine the agent can work in. <span className="font-medium text-dls-text">Local</span> workspaces stay on your computer. <span className="font-medium text-dls-text">Remote / shared</span> workspaces connect to a hosted worker so you can run work in the cloud.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("permissions")}>
              Authorized folders
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-dls-secondary" onClick={() => onSelectTab("advanced")}>
              Runtime diagnostics
            </Button>
          </div>
        </SettingsCard>

        {/* 7. Beta Diagnostics */}
        <SettingsCard
          icon={<Stethoscope size={18} />}
          title="Beta Diagnostics"
          description="Version info and tools for reporting issues."
          status={<StatusBadge tone="desktop">Desktop only</StatusBadge>}
        >
          <Row label="App version" value={<span className="font-mono text-xs">{APP_VERSION || "dev"}</span>} />
          <Row
            label="Run a diagnostics check"
            hint="Copy and run this in your terminal to capture a redacted readiness report."
            value={<CopyButton text="pnpm desktop:beta-doctor -- --strict --json" label="Copy command" />}
          />
          <p className="text-xs leading-5 text-dls-secondary">
            See the beta first-run and customer-evidence docs for the full checklist.
          </p>
        </SettingsCard>

        {/* 8. Privacy & Data */}
        <SettingsCard
          icon={<Lock size={18} />}
          title="Privacy &amp; Data"
          description="Where your data lives, and what is never stored."
          status={workspaceDataMap ? <StatusBadge tone="ready">Workspace mapped</StatusBadge> : <StatusBadge>Local first</StatusBadge>}
        >
          {workspaceDataMap ? (
            <>
              <Row
                label="Chat history"
                hint={storageLocationLabel(workspaceDataMap.stores.chat)}
                value={<CapabilityBadge status={workspaceDataMap.stores.chat.status} />}
              />
              <Row
                label="Notes"
                hint={storageLocationLabel(workspaceDataMap.stores.notes)}
                value={<CapabilityBadge status={workspaceDataMap.stores.notes.status} />}
              />
              <Row
                label="Memory"
                hint={storageLocationLabel(workspaceDataMap.stores.memory)}
                value={<CapabilityBadge status={workspaceDataMap.stores.memory.status} />}
              />
              <Row
                label="Outputs"
                hint={storageLocationLabel(workspaceDataMap.stores.outputs)}
                value={<CapabilityBadge status={workspaceDataMap.stores.outputs.status} />}
              />
              <Row
                label="Training use"
                hint={workspaceDataPolicySummary(workspaceDataMap)}
                value={<CapabilityBadge status={workspaceDataMap.policy.export.status} />}
              />
              <p className="px-1 py-3 text-xs leading-5 text-dls-secondary">
                Matterhorn Work never asks for or stores seed phrases, private keys, API secrets, raw signatures, or wallet exports.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-dls-secondary">
                Your chats, generated artifacts, and on-chain receipts are stored <span className="font-medium text-dls-text">locally on your machine</span> by default.
              </p>
              <ul className="flex list-none flex-col divide-y divide-dls-border/45 text-sm leading-6 text-dls-secondary">
                <li className="px-1 py-3">
                  <span className="font-medium text-dls-text">Stored locally:</span> chat history, artifacts, and public on-chain receipts/links.
                </li>
                <li className="px-1 py-3">
                  <span className="font-medium text-dls-text">Never stored:</span> seed phrases, private keys, API secrets, raw signatures, or wallet exports.
                </li>
              </ul>
            </>
          )}
        </SettingsCard>

        {/* 9. About */}
        <SettingsCard
          icon={<Info size={18} />}
          title="About"
          description="Matterhorn Work version and resources."
          status={<StatusBadge tone="ready">Ready</StatusBadge>}
        >
          <Row label="Matterhorn Work" value={<span className="font-mono text-xs">{APP_VERSION ? `v${APP_VERSION}` : "developer build"}</span>} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onSelectTab("updates")}>
              Check for updates
            </Button>
            <a
              href="https://github.com/matterhornso/matterhorn-work"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-dls-border bg-background px-2.5 py-1.5 text-xs text-dls-secondary transition-colors hover:text-dls-text"
            >
              Docs &amp; support
              <ExternalLink size={12} />
            </a>
          </div>
        </SettingsCard>
        </div>
      </div>
    </div>
  );
}
