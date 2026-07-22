/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArrowRight,
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

import type {
  MatterhornServerClient,
  MatterhornTaskRun,
} from "../../../../app/lib/matterhorn-server";
import type {
  MatterhornDataStoreDescriptor,
  MatterhornSettingsSectionCapability,
  MatterhornWorkspaceDataMapResponse,
} from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornDataControlAction,
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
import type { MatterhornBillingStatusResponse } from "@matterhorn-work/types/billing";
import { MATTERHORN_LAUNCH_FEATURES } from "../../../../app/lib/launch-features";
import {
  MATTERHORN_PROJECT_FEEDBACK_KINDS,
  type MatterhornProjectDataLedgerEntry,
  type MatterhornProjectDataLedgerResponse,
  type MatterhornProjectFeedbackKind,
} from "@matterhorn-work/types/project-data-ledger";
import { t } from "../../../../i18n";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useStatusToasts } from "../../shell-feedback/status-toasts";
import { useQuickJot } from "../../notes";
import { RecentActivitySection } from "../../recent-activity/recent-activity-section";
import {
  buildNftPublishingReadinessItems,
  buildNftPublishingSetupRequirements,
  NftPublishingReadinessRows,
  NftPublishingSetupRows,
  rollUpNftPublishingReadinessStatus,
} from "../../session/media";
import {
  backendCapabilityLabel,
  backendCapabilityTone,
  summarizeCapability,
  summarizeModelSource,
  summarizeModelRoutingPolicy,
  walletFamilySummary,
  workspaceDataPolicySummary,
  type BackendCapabilityTone,
} from "../backend-capability-status";
import {
  workspaceMemoryRoute,
  workspaceNotesRoute,
  workspaceRunHistoryRoute,
} from "../../../shell/workspace-routes";
import type { SettingsTab } from "../../../../app/types";
import { settingsStorageLocationLabel } from "../state/privacy-display";
import {
  useSettingsThemeMode,
  type SettingsThemeMode,
} from "../state/settings-theme";

const APP_VERSION = String(
  import.meta.env.VITE_MATTERHORN_WORK_APP_VERSION ??
    import.meta.env.VITE_OPENWORK_APP_VERSION ??
    "",
).trim();
const DENSITY_STORAGE_KEY = "matterhorn:settings:density";

type Density = "comfortable" | "compact";

function readDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "compact"
      ? "compact"
      : "comfortable";
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
  return (
    value
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workspace"
  );
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function writeClipboardText(content: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard is unavailable in this browser.");
  }
  await navigator.clipboard.writeText(content);
}

type ExportActionStatus = {
  tone: "info" | "success" | "error";
  message: string;
};

function InlineActionStatus(props: { status: ExportActionStatus | null }) {
  if (!props.status) return null;
  const isError = props.status.tone === "error";
  const icon =
    props.status.tone === "success" ? (
      <CheckCircle2 className="size-3.5 shrink-0" />
    ) : isError ? (
      <AlertCircle className="size-3.5 shrink-0" />
    ) : (
      <Clock3 className="size-3.5 shrink-0" />
    );
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 px-1 py-2 text-xs leading-5",
        isError ? "text-red-10 dark:text-red-9" : "text-dls-secondary",
        props.status.tone === "success" && "text-emerald-11",
      )}
    >
      {icon}
      <span>{props.status.message}</span>
    </p>
  );
}

function exportErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  if (/clipboard|document is not focused|writeText/i.test(error.message)) {
    return "The browser blocked clipboard access. Click the page and try again, or use Support report.";
  }
  return error.message || fallback;
}

function SettingsCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="@container/settings-overview-card flex flex-col gap-4 px-3 py-5 first:pt-3 last:pb-3">
      <div className="flex flex-col gap-3 @lg/settings-overview-card:flex-row @lg/settings-overview-card:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--dls-accent-rgb)/0.12)] text-dls-text">
            {props.icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-dls-text">
              {props.title}
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-dls-secondary">
              {props.description}
            </p>
          </div>
        </div>
        {props.status ? (
          <div className="pl-12 @lg/settings-overview-card:ml-auto @lg/settings-overview-card:pl-0">
            {props.status}
          </div>
        ) : null}
      </div>
      {props.children ? (
        <div className="flex flex-col gap-1 pl-0 @lg/settings-overview-card:pl-12">
          {props.children}
        </div>
      ) : null}
    </section>
  );
}

function Row(props: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md px-2.5 py-2.5 @lg/settings-overview-card:flex-row @lg/settings-overview-card:items-center @lg/settings-overview-card:justify-between @lg/settings-overview-card:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dls-text">{props.label}</p>
        {props.hint ? (
          <p className="mt-0.5 break-words text-xs leading-5 text-dls-secondary">
            {props.hint}
          </p>
        ) : null}
      </div>
      <div className="max-w-full text-sm text-dls-secondary @lg/settings-overview-card:shrink-0">
        {props.value}
      </div>
    </div>
  );
}

function StatusBadge(props: {
  children: ReactNode;
  tone?: BackendCapabilityTone | "desktop" | "cloud";
}) {
  const tone =
    props.tone === "ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-11"
      : props.tone === "setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-11"
        : props.tone === "preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-12 dark:text-amber-11"
          : props.tone === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-11"
            : props.tone === "cloud"
              ? "border-violet-500/30 bg-violet-500/10 text-violet-11"
              : "border-dls-border bg-background text-dls-secondary";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {props.children}
    </span>
  );
}

function UnavailableStatus(props: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-10"
      role="status"
    >
      <span className="size-1.5 rounded-full bg-red-9" aria-hidden="true" />
      {props.label ?? "Engine offline"}
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
  if (status === "working") return null;
  return (
    <StatusBadge tone={backendCapabilityTone(status)}>
      {backendCapabilityLabel(status)}
    </StatusBadge>
  );
}

function settingsCapability(
  capabilities:
    | { settings?: MatterhornSettingsSectionCapability[] }
    | null
    | undefined,
  section: MatterhornSettingsSectionCapability["section"],
): MatterhornSettingsSectionCapability | null {
  return (
    capabilities?.settings?.find((item) => item.section === section) ?? null
  );
}

function ProjectLedgerControlSummary(props: {
  ledger?: MatterhornProjectDataLedgerResponse | null;
  loading?: boolean;
}) {
  const ledger = props.ledger;
  if (!ledger) {
    return props.loading ? (
      <StatusBadge>Loading</StatusBadge>
    ) : (
      <UnavailableStatus label="Workspace unavailable" />
    );
  }
  const exportable = ledger.items.filter((item) => item.exportable).length;
  const deletable = ledger.items.filter((item) => item.deletable).length;
  const appendOnly = ledger.items.filter(
    (item) => item.retention === "append_only",
  ).length;
  const shownLabel =
    ledger.items.length < ledger.summary.total
      ? `shown ${ledger.items.length}`
      : `${ledger.summary.total}`;
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      <StatusBadge>{ledger.summary.total} events</StatusBadge>
      <StatusBadge>
        {exportable}/{shownLabel} exportable
      </StatusBadge>
      <StatusBadge>{deletable} deletable</StatusBadge>
      <StatusBadge>{appendOnly} append-only</StatusBadge>
      {ledger.summary.feedback > 0 ? (
        <StatusBadge>{ledger.summary.feedback} feedback</StatusBadge>
      ) : null}
    </div>
  );
}

const CLIPBOARD_WRITE_TIMEOUT_MS = 600;
const RELEASE_DOCTOR_COMMAND = "pnpm desktop:release-doctor -- --strict --json";

function copyTextWithSelection(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  let clipboardWrite: Promise<void> | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      clipboardWrite = navigator.clipboard.writeText(text);
    }
  } catch {
    clipboardWrite = null;
  }

  // Run the selection fallback before the first await so embedded browsers
  // still consider this part of the user's click activation.
  if (copyTextWithSelection(text)) return true;

  if (clipboardWrite) {
    try {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Clipboard write timed out.")),
          CLIPBOARD_WRITE_TIMEOUT_MS,
        );
      });
      try {
        await Promise.race([clipboardWrite, timeout]);
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function CopyButton(props: { text: string; label: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const onCopy = useCallback(async () => {
    const copied = await copyTextWithFallback(props.text);
    setCopyState(copied ? "copied" : "failed");
    if (typeof window !== "undefined") {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }, [props.text]);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs"
      onClick={() => void onCopy()}
      aria-live="polite"
    >
      <Copy size={13} />
      {copyState === "copied"
        ? "Copied"
        : copyState === "failed"
          ? "Copy failed"
          : props.label}
    </Button>
  );
}

const DATA_POLICY_STORE_ORDER: Array<
  keyof MatterhornWorkspaceDataMapResponse["stores"]
> = [
  "chat",
  "modelPreferences",
  "billing",
  "dataPolicy",
  "notes",
  "memory",
  "outputs",
  "walletEvidence",
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
  const control =
    controls?.stores[
      store.id as keyof MatterhornWorkspaceDataControlsResponse["stores"]
    ];
  if (!control)
    return kind === "export" ? yesNo(store.exportable) : yesNo(store.deletable);
  return kind === "export" ? control.export.summary : control.deletion.summary;
}

function controlAppRoute(
  control?: MatterhornDataControlStore,
): MatterhornDataControlAction | null {
  if (!control) return null;
  return (
    [...control.export.actions, ...control.deletion.actions].find(
      (action) => action.kind === "app_route" && Boolean(action.href?.trim()),
    ) ?? null
  );
}

function controlQuickActions(
  controls: MatterhornWorkspaceDataControlsResponse | undefined,
): MatterhornDataControlAction[] {
  if (!controls) return [];
  const order: Array<keyof MatterhornWorkspaceDataControlsResponse["stores"]> =
    [
      "outputs",
      "notes",
      "memory",
      "feedback",
      "modelPreferences",
      "billing",
      "walletEvidence",
      "audit",
      "dataPolicy",
    ];
  const seenLabels = new Set<string>();
  const seenRoutes = new Set<string>();
  return order
    .flatMap((storeId) => {
      const control = controls.stores[storeId];
      if (!control) return [];
      return [...control.export.actions, ...control.deletion.actions].filter(
        (action) => {
          if (action.kind !== "app_route" || !action.href?.trim()) return false;
          if (
            !MATTERHORN_LAUNCH_FEATURES.billing &&
            action.href.includes("/settings/billing")
          )
            return false;
          const labelKey = action.label.trim().toLocaleLowerCase();
          const routeKey = action.href.trim();
          if (seenLabels.has(labelKey) || seenRoutes.has(routeKey)) return false;
          seenLabels.add(labelKey);
          seenRoutes.add(routeKey);
          return true;
        },
      );
    })
    .slice(0, 7);
}

function dataControlActionTone(action: MatterhornDataControlAction) {
  if (action.destructive) return "text-red-11 hover:text-red-12";
  if (action.status === "needs_setup" || action.status === "error")
    return "text-amber-12 dark:text-amber-11 hover:text-amber-12";
  return "text-dls-secondary hover:text-dls-text";
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

function feedbackKindFromEntry(
  entry: MatterhornProjectDataLedgerEntry,
): MatterhornProjectFeedbackKind | null {
  const kind = entry.metadata?.feedbackKind;
  if (typeof kind !== "string") return null;
  return MATTERHORN_PROJECT_FEEDBACK_KINDS.includes(
    kind as MatterhornProjectFeedbackKind,
  )
    ? (kind as MatterhornProjectFeedbackKind)
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
  if (typeof feedbackId === "string" && feedbackId.trim())
    return feedbackId.trim();
  return entry.id.startsWith("feedback:")
    ? entry.id.slice("feedback:".length)
    : entry.id;
}

// ---------------------------------------------------------------------------
// Task History helpers
// ---------------------------------------------------------------------------

function taskStatusMeta(status: MatterhornTaskRun["status"]) {
  if (status === "staged") {
    return {
      icon: Circle,
      label: "Prepared",
      tone: "slate",
      bg: "bg-dls-surface",
      border: "border-dls-border",
      text: "text-muted-foreground",
    };
  }
  if (status === "waiting") {
    return {
      icon: Clock3,
      label: "Waiting",
      tone: "amber",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-12 dark:text-amber-11",
    };
  }
  if (status === "completed") {
    return {
      icon: CheckCircle2,
      label: "Completed",
      tone: "emerald",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-11",
    };
  }
  if (status === "failed") {
    return {
      icon: AlertCircle,
      label: "Failed",
      tone: "red",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-11",
    };
  }
  if (status === "cancelled") {
    return {
      icon: Ban,
      label: "Cancelled",
      tone: "slate",
      bg: "bg-dls-surface",
      border: "border-dls-border",
      text: "text-muted-foreground",
    };
  }
  return {
    icon: Play,
    label: "Running",
    tone: "blue",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-11",
  };
}

function TaskHistorySection(props: {
  matterhornServerClient: MatterhornServerClient;
  runtimeWorkspaceId: string;
}) {
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ["task-runs", props.runtimeWorkspaceId] as const,
    queryFn: () =>
      props.matterhornServerClient.listTaskRuns(props.runtimeWorkspaceId, 10),
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
                {error instanceof Error
                  ? error.message
                  : "Check the workspace connection and try again."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="w-fit border-0 bg-transparent text-red-100 shadow-none hover:bg-transparent hover:text-red-50"
            onClick={() => void refetch()}
            aria-label="Retry task history"
            title="Retry task history"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md bg-dls-surface-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <ListTodo className="size-3.5 shrink-0" />
          Tasks you run from desks will appear here.
        </div>
      ) : (
        <div className="grid gap-1">
          {runs.map((run) => {
            const meta = taskStatusMeta(run.status);
            const StatusIcon = meta.icon;
            return (
              <div
                key={run.taskId}
                className="flex items-start gap-3 rounded-md px-2.5 py-2.5"
              >
                <div
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    meta.bg,
                    meta.border,
                    meta.text,
                  )}
                >
                  <StatusIcon className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium capitalize text-dls-text">
                      {run.desk}
                    </span>
                    <span className="max-w-[10rem] truncate text-[10px] font-medium text-muted-foreground">
                      {run.sessionSlug}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        meta.bg,
                        meta.border,
                        meta.text,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-5 text-muted-foreground">
                    {run.outcomeSummary}
                  </p>
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
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatRelativeTime(run.updatedAt)}
                  </p>
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
  onOpenControlRoute?: (href: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const orderedStores = DATA_POLICY_STORE_ORDER.map(
    (key) => props.dataMap.stores[key],
  ).filter(Boolean);
  const orderedIds = new Set(orderedStores.map((store) => store.id));
  const stores = [
    ...orderedStores,
    ...Object.values(props.dataMap.stores).filter(
      (store) => !orderedIds.has(store.id),
    ),
  ];
  const quickActions = controlQuickActions(props.controls);
  const highlightedControls = stores
    .map(
      (store) =>
        props.controls?.stores[
          store.id as keyof MatterhornWorkspaceDataControlsResponse["stores"]
        ],
    )
    .filter((control): control is MatterhornDataControlStore =>
      Boolean(control),
    )
    .slice(0, 4);
  const retentionPolicy =
    props.controls?.policy.retention ?? props.dataMap.policy.retention;
  const feedbackEnabled =
    (props.dataPolicy?.policy.feedbackUse ??
      props.dataMap.policy.feedbackUse) !== "disabled";
  const userControlledCount = stores.filter(
    (store) => store.retention === "user_controlled",
  ).length;
  const appendOnlyCount = stores.filter(
    (store) => store.retention === "append_only",
  ).length;
  const exportableCount = stores.filter((store) => store.exportable).length;
  const deletableCount = stores.filter((store) => store.deletable).length;

  return (
    <div className="px-1 py-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-dls-text">
          Workspace data policy
        </p>
        <StatusBadge tone="ready">
          {workspaceDataPolicySummary(props.dataMap)}
        </StatusBadge>
      </div>
      {quickActions.length ? (
        <div className="mb-4 rounded-md bg-dls-surface-muted/[0.08] px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-dls-text">Manage data</p>
              <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">
                Open the owning surface for review, export, or deletion
                controls.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              {quickActions.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 gap-1.5 border border-dls-border bg-dls-surface-muted/60 px-3 text-xs shadow-none hover:bg-dls-surface-muted/85",
                    dataControlActionTone(action),
                  )}
                  title={action.description}
                  onClick={() => props.onOpenControlRoute?.(action.href ?? "")}
                >
                  {action.label}
                  <ArrowRight size={13} aria-hidden="true" />
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="mb-4 grid gap-2 lg:grid-cols-3">
        <div className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-dls-text">Model training</p>
            <StatusBadge>Off</StatusBadge>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
            Workspace data is not used for RL or model training.
          </p>
        </div>
        <div className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-dls-text">
                Feedback collection
              </p>
              <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
                {feedbackEnabled
                  ? "Explicit feedback only. Product quality and routing, not training."
                  : "New feedback writes are blocked. Existing feedback can still be exported or deleted."}
              </p>
            </div>
            <Switch
              size="sm"
              checked={feedbackEnabled}
              disabled={
                !props.onFeedbackPolicyChange || props.feedbackPolicySaving
              }
              onCheckedChange={(checked) =>
                props.onFeedbackPolicyChange?.(checked)
              }
              aria-label="Toggle workspace feedback collection"
            />
          </div>
          {props.feedbackPolicyError ? (
            <p className="mt-2 text-[11px] leading-4 text-destructive">
              {props.feedbackPolicyError}
            </p>
          ) : props.feedbackPolicySaving ? (
            <p className="mt-2 text-[11px] leading-4 text-dls-secondary">
              Saving...
            </p>
          ) : null}
        </div>
        <div className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-dls-text">
              Export and delete
            </p>
            <StatusBadge>
              {exportableCount}/{stores.length} exportable
            </StatusBadge>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
            {deletableCount} user-controlled stores can be deleted from their
            owning surfaces. {appendOnlyCount} history stores are append-only.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-dls-text">Retention</p>
            <p className="mt-1 text-[11px] leading-4 text-dls-secondary">
              {userControlledCount} user-controlled stores.{" "}
              {retentionPolicy.windowLabel}
            </p>
          </div>
          <StatusBadge>{retentionPolicy.label}</StatusBadge>
        </div>
      </div>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-medium text-dls-secondary transition-colors hover:text-dls-text"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  detailsOpen && "rotate-180",
                )}
              />
              Storage locations, routes, and controls
            </button>
          }
        />
        <CollapsibleContent>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
              <thead className="text-dls-secondary">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Store</th>
                  <th className="pb-2 pr-4 font-medium">Location</th>
                  <th className="pb-2 pr-4 font-medium">Manage</th>
                  <th className="pb-2 pr-4 font-medium">Retention</th>
                  <th className="pb-2 pr-4 font-medium">Export</th>
                  <th className="pb-2 pr-4 font-medium">Delete</th>
                  <th className="pb-2 font-medium">Secrets</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => {
                  const control =
                    props.controls?.stores[
                      store.id as keyof MatterhornWorkspaceDataControlsResponse["stores"]
                    ];
                  const appRoute = controlAppRoute(control);
                  return (
                    <tr key={store.id} className="align-top">
                      <td className="border-t border-dls-border/15 py-2 pr-4">
                        <p className="font-medium text-dls-text">
                          {store.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-dls-secondary">
                          {scopeLabel(store.scope)}
                        </p>
                      </td>
                      <td className="max-w-[220px] border-t border-dls-border/15 py-2 pr-4">
                        <span
                          className="block truncate font-mono text-[11px] text-dls-secondary"
                          title={settingsStorageLocationLabel(store)}
                        >
                          {settingsStorageLocationLabel(store)}
                        </span>
                      </td>
                      <td className="border-t border-dls-border/15 py-2 pr-4">
                        {appRoute?.href ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            onClick={() =>
                              props.onOpenControlRoute?.(appRoute.href ?? "")
                            }
                          >
                            {appRoute.label}
                          </button>
                        ) : (
                          <span className="text-dls-secondary">-</span>
                        )}
                      </td>
                      <td className="border-t border-dls-border/15 py-2 pr-4 text-dls-secondary">
                        {retentionLabel(store.retention)}
                      </td>
                      <td className="max-w-[190px] border-t border-dls-border/15 py-2 pr-4 text-dls-secondary">
                        {controlSummary(props.controls, store, "export")}
                      </td>
                      <td className="max-w-[190px] border-t border-dls-border/15 py-2 pr-4 text-dls-secondary">
                        {controlSummary(props.controls, store, "deletion")}
                      </td>
                      <td className="border-t border-dls-border/15 py-2 text-dls-secondary">
                        {secretsLabel(store.containsSecrets)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {props.controls ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {highlightedControls.map((control) => (
                <div
                  key={control.storeId}
                  className="rounded-lg bg-dls-surface-muted/20 px-3 py-2"
                >
                  <p className="text-xs font-medium text-dls-text">
                    {control.store.label}
                  </p>
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
        Use the Manage links for user-controlled stores. Append-only history
        stays exportable through Project history. {retentionPolicy.summary}
      </p>
    </div>
  );
}

function FeedbackReviewSection(props: {
  matterhornServerClient: MatterhornServerClient;
  runtimeWorkspaceId: string;
}) {
  const [filter, setFilter] = useState<"all" | MatterhornProjectFeedbackKind>(
    "all",
  );
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(
    null,
  );
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ["settings-feedback-review", props.runtimeWorkspaceId],
    queryFn: () =>
      props.matterhornServerClient.listProjectDataLedger(
        props.runtimeWorkspaceId,
        {
          source: "feedback",
          limit: 50,
        },
      ),
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    staleTime: 30_000,
  });

  const items = (data?.items ?? []).filter((entry) => {
    const kind = feedbackKindFromEntry(entry);
    return filter === "all" || kind === filter;
  });
  const feedbackCount = data?.summary.feedback ?? 0;

  const deleteFeedback = useCallback(
    async (entry: MatterhornProjectDataLedgerEntry) => {
      const feedbackId = feedbackIdFromEntry(entry);
      if (!feedbackId) return;
      setDeletingFeedbackId(feedbackId);
      setDeleteStatus(null);
      try {
        await props.matterhornServerClient.deleteProjectFeedback(
          props.runtimeWorkspaceId,
          feedbackId,
        );
        setDeleteStatus("Feedback deleted.");
        await refetch();
      } catch (deleteError) {
        setDeleteStatus(
          deleteError instanceof Error
            ? deleteError.message
            : "Feedback could not be deleted.",
        );
      } finally {
        setDeletingFeedbackId(null);
      }
    },
    [props.matterhornServerClient, props.runtimeWorkspaceId, refetch],
  );

  const deleteAllFeedback = useCallback(async () => {
    if (feedbackCount <= 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete all local feedback for this workspace?")
    )
      return;
    setDeleteAllBusy(true);
    setDeleteStatus(null);
    try {
      const response =
        await props.matterhornServerClient.deleteAllProjectFeedback(
          props.runtimeWorkspaceId,
        );
      setDeleteStatus(
        `Deleted ${response.deletedCount} feedback entr${response.deletedCount === 1 ? "y" : "ies"}.`,
      );
      await refetch();
    } catch (deleteError) {
      setDeleteStatus(
        deleteError instanceof Error
          ? deleteError.message
          : "Feedback could not be cleared.",
      );
    } finally {
      setDeleteAllBusy(false);
    }
  }, [
    feedbackCount,
    props.matterhornServerClient,
    props.runtimeWorkspaceId,
    refetch,
  ]);

  return (
    <div className="px-1 py-3">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex w-fit flex-wrap gap-1 rounded-md border border-dls-border/45 bg-dls-surface-muted/30 p-1"
          role="group"
          aria-label="Filter feedback"
        >
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 border px-2.5 text-xs",
              filter === "all"
                ? "border-primary/30 shadow-sm"
                : "border-transparent bg-transparent text-dls-secondary hover:border-dls-border/50 hover:bg-dls-surface-muted/70 hover:text-dls-text",
            )}
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
          >
            All {feedbackCount}
          </Button>
          {MATTERHORN_PROJECT_FEEDBACK_KINDS.map((kind) => (
            <Button
              key={kind}
              variant={filter === kind ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 border px-2.5 text-xs",
                filter === kind
                  ? "border-primary/30 shadow-sm"
                  : "border-transparent bg-transparent text-dls-secondary hover:border-dls-border/50 hover:bg-dls-surface-muted/70 hover:text-dls-text",
              )}
              onClick={() => setFilter(kind)}
              aria-pressed={filter === kind}
            >
              {feedbackKindLabel(kind)}
            </Button>
          ))}
        </div>
        {feedbackCount > 0 || deleteAllBusy ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-fit px-2 text-xs text-dls-secondary hover:text-dls-text"
            disabled={deleteAllBusy}
            onClick={() => void deleteAllFeedback()}
          >
            {deleteAllBusy ? "Deleting" : "Delete all"}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm leading-6 text-dls-secondary">
          Loading feedback...
        </p>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-dls-secondary">
          <span>
            {error instanceof Error
              ? error.message
              : "Feedback could not load."}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text"
            onClick={() => void refetch()}
            aria-label="Refresh feedback"
            title="Refresh feedback"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm leading-6 text-dls-secondary">
          No matching local feedback yet.
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((entry) => {
            const kind = feedbackKindFromEntry(entry);
            const rating = feedbackRatingLabel(entry);
            const feedbackId = feedbackIdFromEntry(entry);
            return (
              <div
                key={entry.id}
                className="rounded-lg px-2 py-2 transition-colors hover:bg-dls-hover/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-dls-text">
                    {feedbackKindLabel(kind)}
                  </span>
                  {rating ? (
                    <span className="text-xs text-dls-secondary">{rating}</span>
                  ) : null}
                  <span className="text-xs text-dls-secondary">
                    {feedbackTargetLabel(entry)}
                  </span>
                  <span className="ml-auto text-xs text-dls-secondary">
                    {formatRelativeTime(Date.parse(entry.timestamp))}
                  </span>
                  {entry.deletable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-xs text-dls-secondary hover:text-dls-text"
                      disabled={deletingFeedbackId === feedbackId}
                      onClick={() => void deleteFeedback(entry)}
                    >
                      {deletingFeedbackId === feedbackId
                        ? "Deleting"
                        : "Delete"}
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
      {deleteStatus ? (
        <p className="mt-3 text-xs leading-5 text-dls-secondary">
          {deleteStatus}
        </p>
      ) : null}
    </div>
  );
}

function teamAccessInviteText(input: {
  connection: MatterhornBackendTeamAccessResponse["connection"];
  token: {
    token: string;
    scope: MatterhornTeamShareableTokenScope;
    label?: string;
  };
}) {
  return [
    "Matterhorn Desks local access",
    `Server: ${input.connection.serverUrl}`,
    `Access token: ${input.token.token}`,
    `Scope: ${input.token.scope}`,
    input.token.label ? `Label: ${input.token.label}` : null,
    "",
    "Open Matterhorn Desks, choose Connect custom remote, then paste the server URL and access token.",
    MATTERHORN_LAUNCH_FEATURES.cloud
      ? "This is local server access, not durable Matterhorn Cloud team membership."
      : "This is scoped local server access. It does not create an online account.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function planDisplayName(planId?: string | null) {
  switch (planId) {
    case "plus":
      return "Matterhorn Plus";
    case "max":
      return "Matterhorn Max";
    default:
      return "Free";
  }
}

function teamSeatUsageText(status?: MatterhornBillingStatusResponse["status"]) {
  const usage = status?.usage.teamMembers;
  if (!usage) return null;
  const limit = usage.limit == null ? "unlimited" : String(usage.limit);
  return `${usage.used}/${limit} seats used on ${planDisplayName(status.subscription.planId)}.`;
}

function isTeamSeatBillingError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "billing_entitlement_limit_reached",
  );
}

function TeamAccessControls(props: {
  client?: MatterhornServerClient | null;
  workspaceId: string;
  summary?: MatterhornBackendTeamAccessSummaryResponse;
  data?: MatterhornBackendTeamAccessResponse;
  billingStatus?: MatterhornBillingStatusResponse["status"];
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onOpenBilling?: () => void;
  refetch: () => Promise<unknown>;
  refetchBilling?: () => Promise<unknown>;
}) {
  const { client, workspaceId, refetch, refetchBilling } = props;
  const [scope, setScope] =
    useState<MatterhornTeamShareableTokenScope>("viewer");
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
  const sharedTokens =
    props.data?.localAccess.tokens.filter(
      (token) => token.source === "token_store",
    ) ?? [];
  const tokenCount =
    props.summary?.localAccess.tokenCount ??
    props.data?.localAccess.tokenCount ??
    0;
  const sharedCount = props.data
    ? sharedTokens.length
    : Math.max(0, tokenCount - 1);
  const connection = props.summary?.connection ?? props.data?.connection;
  const teamUsage = props.billingStatus?.usage.teamMembers ?? null;
  const teamLimitReached = Boolean(
    teamUsage && teamUsage.limit != null && teamUsage.used >= teamUsage.limit,
  );
  const teamSeatLine = teamSeatUsageText(props.billingStatus);
  const canUseTokenControls = Boolean(
    client &&
    workspaceId &&
    !props.isLoading &&
    props.data &&
    !teamLimitReached,
  );

  const createToken = useCallback(async () => {
    if (!client || !workspaceId) {
      setStatus("Open a connected workspace to create a local access token.");
      return;
    }
    if (teamLimitReached) {
      setStatus(
        props.onOpenBilling
          ? "Team seats are full on this plan. Open Billing to upgrade before creating teammate tokens."
          : "Team seats are full for this workspace. Contact the workspace owner before creating another teammate token.",
      );
      return;
    }
    setBusyTokenId("create");
    setStatus(null);
    try {
      const response = await client.createWorkspaceTeamAccessToken(
        workspaceId,
        {
          scope,
          label: label.trim() || undefined,
        },
      );
      setCreatedToken({
        id: response.token.id,
        token: response.token.token,
        scope,
        label: response.token.label,
        createdAt: response.token.createdAt,
      });
      setLabel("");
      setStatus(
        "Local access token created. Copy it now; it will not be shown again.",
      );
      await refetch();
      await refetchBilling?.();
    } catch (error) {
      setStatus(
        isTeamSeatBillingError(error)
          ? props.onOpenBilling
            ? "Team seats are full on this plan. Open Billing to upgrade before creating teammate tokens."
            : "Team seats are full for this workspace. Contact the workspace owner before creating another teammate token."
          : error instanceof Error
            ? error.message
            : "Could not create a local access token.",
      );
    } finally {
      setBusyTokenId(null);
    }
  }, [
    client,
    label,
    props.onOpenBilling,
    refetch,
    refetchBilling,
    scope,
    teamLimitReached,
    workspaceId,
  ]);

  const revokeToken = useCallback(
    async (tokenId: string, tokenLabel?: string) => {
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
        await refetchBilling?.();
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not revoke the local access token.",
        );
      } finally {
        setBusyTokenId(null);
      }
    },
    [client, createdToken?.id, refetch, refetchBilling, workspaceId],
  );

  if (!props.isOpen) {
    return (
      <div className="flex flex-col gap-2 px-1 py-3 text-sm text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
        <span className="leading-6">
          {props.summary?.sharingMode.label ?? "Local token sharing"}:{" "}
          {sharedCount} shared token{sharedCount === 1 ? "" : "s"}.{" "}
          {connection?.reachableFromOtherDevices === false
            ? "Teammates can connect only after this server is reachable from their device."
            : "Teammates use Connect custom remote in the same Matterhorn interface."}
          {teamSeatLine ? ` ${teamSeatLine}` : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-xs"
          onClick={props.onOpen}
        >
          Manage tokens
        </Button>
      </div>
    );
  }

  if (props.isLoading) {
    return (
      <p className="px-1 py-3 text-sm leading-6 text-dls-secondary">
        Loading local access tokens...
      </p>
    );
  }

  if (props.isError) {
    return (
      <div className="flex flex-col gap-2 px-1 py-3 text-sm text-dls-secondary sm:flex-row sm:items-center sm:justify-between">
        <span>
          {props.error instanceof Error
            ? props.error.message
            : "Token management requires host access on this local server."}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="w-fit border-0 bg-transparent text-dls-secondary shadow-none hover:bg-transparent hover:text-dls-text"
          onClick={() => void props.refetch()}
          aria-label="Refresh local access tokens"
          title="Refresh local access tokens"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="px-1 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-dls-text">
            Local access tokens
          </p>
          <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
            {props.summary?.sharingMode.description ??
              "Create a viewer or collaborator token for this local workspace server."}
          </p>
        </div>
        <span className="ml-auto text-xs text-dls-secondary">
          {sharedTokens.length || sharedCount} shared
        </span>
      </div>

      {teamSeatLine ? (
        <div
          className={cn(
            "mt-3 flex flex-col gap-2 rounded-md px-2.5 py-2 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between",
            teamLimitReached
              ? "bg-amber-500/10 text-amber-200"
              : "bg-dls-surface/45 text-dls-secondary",
          )}
        >
          <span>
            {teamLimitReached
              ? `${teamSeatLine} Upgrade to Matterhorn Max to create teammate tokens.`
              : teamSeatLine}
          </span>
          {teamLimitReached && props.onOpenBilling ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-fit px-1.5 text-xs text-amber-100 hover:text-dls-text"
              onClick={props.onOpenBilling}
            >
              Open Billing
            </Button>
          ) : null}
        </div>
      ) : null}

      {connection ? (
        <div className="mt-3 grid gap-2 rounded-md bg-dls-surface/55 px-2.5 py-2 text-xs leading-5 text-dls-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-dls-text">
              Connect custom remote
            </span>
            <span className="text-dls-secondary">
              {connection.reachableFromOtherDevices
                ? "Reachable server URL"
                : "Local-only server URL"}
            </span>
            <div className="ml-auto">
              <CopyButton text={connection.serverUrl} label="Copy server URL" />
            </div>
          </div>
          <code
            className="block truncate font-mono text-[11px] text-dls-secondary"
            title={connection.serverUrl}
          >
            {connection.serverUrl}
          </code>
          <p>
            Teammates should open Matterhorn Desks, choose Connect custom
            remote, then paste this URL and the one-time token.
          </p>
          <p>
            {MATTERHORN_LAUNCH_FEATURES.cloud
              ? "This is local server access. Durable org invites and shared cloud workspaces still require Matterhorn Cloud."
              : "This is scoped local server access. It does not create an online account."}
          </p>
          {!connection.reachableFromOtherDevices ? (
            <p className="text-amber-12 dark:text-amber-11">
              This server is bound to {connection.host}. Share it only after you
              bind or tunnel the local server to a reachable address.
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
              <div
                key={item}
                className="rounded-md bg-dls-surface/55 px-2.5 py-2"
              >
                <p className="font-medium text-dls-text">{capability.label}</p>
                <p className="mt-0.5">
                  {capability.canWriteWorkspace
                    ? "Can read and write workspace data."
                    : "Read-only workspace access."}
                </p>
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
            <span className="text-xs font-medium capitalize text-dls-text">
              {createdToken.scope}
            </span>
            <span className="text-xs text-dls-secondary">
              {createdToken.label || createdToken.id}
            </span>
            <span className="text-xs text-dls-secondary">
              {formatRelativeTime(createdToken.createdAt)}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {connection ? (
                <CopyButton
                  text={teamAccessInviteText({
                    connection,
                    token: createdToken,
                  })}
                  label="Copy invite"
                />
              ) : null}
              <CopyButton text={createdToken.token} label="Copy token" />
            </div>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-dls-secondary">
            {createdToken.token}
          </p>
        </div>
      ) : null}

      <div className="mt-3 space-y-1">
        {sharedTokens.length ? (
          sharedTokens.map((token) => (
            <div
              key={token.id}
              className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-dls-hover/60"
            >
              <span className="text-xs font-medium capitalize text-dls-text">
                {token.scope}
              </span>
              <span className="min-w-0 max-w-[18rem] truncate text-xs text-dls-secondary">
                {token.label || token.id}
              </span>
              <span className="text-xs text-dls-secondary">
                {formatRelativeTime(token.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-1.5 text-xs text-dls-secondary hover:text-dls-text"
                disabled={busyTokenId === token.id}
                onClick={() =>
                  void revokeToken(token.id, token.label || token.id)
                }
              >
                {busyTokenId === token.id ? "Revoking" : "Revoke"}
              </Button>
            </div>
          ))
        ) : (
          <p className="rounded-lg px-2 py-2 text-xs leading-5 text-dls-secondary">
            No shared local tokens created yet.
          </p>
        )}
      </div>

      {status ? (
        <p className="mt-3 text-xs leading-5 text-dls-secondary">{status}</p>
      ) : null}
    </div>
  );
}

export function SettingsOverviewView(props: {
  onSelectTab: (tab: SettingsTab) => void;
  onOpenAddMcp?: () => void;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
}) {
  const { onSelectTab } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useStatusToasts();
  const { openQuickJot } = useQuickJot();
  const [theme, onThemeChange] = useSettingsThemeMode();
  const [density, setDensity] = useState<Density>(readDensity());
  const [memoryExportStatus, setMemoryExportStatus] = useState<string | null>(
    null,
  );
  const [ledgerExportStatus, setLedgerExportStatus] =
    useState<ExportActionStatus | null>(null);
  const [supportReportStatus, setSupportReportStatus] =
    useState<ExportActionStatus | null>(null);
  const notesWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const notesReady = Boolean(props.matterhornServerClient && notesWorkspaceId);
  const backendWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";

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
        client.listWorkspaceMemorySuggestions(backendWorkspaceId, {
          status: "pending",
          limit: 100,
        }),
        client.listWorkspaceMemory(backendWorkspaceId, { limit: 100 }),
      ]);
      return {
        pending: (pendingSuggestions.entries ?? []).filter(
          (entry) => entry.status === "pending",
        ).length,
        confirmed: savedRecords.count ?? savedRecords.records.length,
      };
    },
  });

  const workspaceBackendControlPlaneQuery = useQuery({
    queryKey: ["settings-workspace-backend-control-plane", backendWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && backendWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client || !backendWorkspaceId)
        throw new Error("Open a workspace to check backend status.");
      return client.workspaceBackendControlPlane(backendWorkspaceId);
    },
    staleTime: 30_000,
  });
  const workspaceBillingStatusQuery = useQuery({
    queryKey: ["settings-workspace-billing-status", props.runtimeWorkspaceId],
    enabled: Boolean(
      MATTERHORN_LAUNCH_FEATURES.billing &&
      props.matterhornServerClient &&
      props.runtimeWorkspaceId,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to see billing status.");
      return client.workspaceBillingStatus(workspaceId);
    },
    staleTime: 30_000,
  });

  const backendCapabilitiesQuery = useQuery({
    queryKey: ["settings-backend-capabilities"],
    enabled: Boolean(
      props.matterhornServerClient &&
      (!backendWorkspaceId || workspaceBackendControlPlaneQuery.isError),
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Desks engine is offline.");
      return client.backendCapabilities();
    },
    staleTime: 30_000,
  });

  const marketExecutionReadinessQuery = useQuery({
    queryKey: ["settings-market-execution-readiness"],
    enabled: Boolean(props.matterhornServerClient),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Desks engine is offline.");
      return client.marketExecutionReadiness();
    },
    staleTime: 30_000,
  });

  const workspaceReadinessQuery = useQuery({
    queryKey: ["settings-workspace-readiness", props.runtimeWorkspaceId],
    enabled: Boolean(
      props.matterhornServerClient &&
      props.runtimeWorkspaceId &&
      workspaceBackendControlPlaneQuery.isError,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to check readiness.");
      return client.workspaceReadiness(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataMapQuery = useQuery({
    queryKey: ["settings-workspace-data-map", props.runtimeWorkspaceId],
    enabled: Boolean(
      props.matterhornServerClient &&
      props.runtimeWorkspaceId &&
      workspaceBackendControlPlaneQuery.isError,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error(
          "Open a workspace to see where project data is stored.",
        );
      return client.workspaceDataMap(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataControlsQuery = useQuery({
    queryKey: ["settings-workspace-data-controls", props.runtimeWorkspaceId],
    enabled: Boolean(
      props.matterhornServerClient &&
      props.runtimeWorkspaceId &&
      workspaceBackendControlPlaneQuery.isError,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to see project data controls.");
      return client.workspaceDataControls(workspaceId);
    },
    staleTime: 30_000,
  });

  const workspaceDataPolicyQuery = useQuery({
    queryKey: ["settings-workspace-data-policy", props.runtimeWorkspaceId],
    enabled: Boolean(
      props.matterhornServerClient &&
      props.runtimeWorkspaceId &&
      workspaceBackendControlPlaneQuery.isError,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to see data policy.");
      return client.workspaceDataPolicy(workspaceId);
    },
    staleTime: 30_000,
  });

  const backendCapabilities =
    workspaceBackendControlPlaneQuery.data?.capabilities ??
    backendCapabilitiesQuery.data;
  const bittensorCapability =
    backendCapabilities?.wallets.families.bittensor ?? null;
  const bittensorUsesLiveProvider =
    bittensorCapability?.details?.liveProviderConfigured === true;
  const bittensorUsesFallbackData =
    bittensorCapability?.details?.dataMode === "curated_fallback";
  const marketExecutionReport = marketExecutionReadinessQuery.data?.report;
  const hyperliquidExecution = marketExecutionReport?.venues.find(
    (venue) => venue.venue === "hyperliquid",
  );
  const polymarketExecution = marketExecutionReport?.venues.find(
    (venue) => venue.venue === "polymarket",
  );
  const workspaceReadiness =
    workspaceBackendControlPlaneQuery.data?.readiness ??
    workspaceReadinessQuery.data;
  const workspaceDataMap =
    workspaceBackendControlPlaneQuery.data?.dataMap ??
    workspaceDataMapQuery.data;
  const workspaceDataControls =
    workspaceBackendControlPlaneQuery.data?.dataControls ??
    workspaceDataControlsQuery.data;
  const workspaceDataPolicy =
    workspaceBackendControlPlaneQuery.data?.dataPolicy ??
    workspaceDataPolicyQuery.data;
  const profileCapability = settingsCapability(backendCapabilities, "profile");
  const publishingReadiness = backendCapabilities
    ? buildNftPublishingReadinessItems({
        imageGeneration: backendCapabilities.imageGeneration,
        walrusStorage: backendCapabilities.walrusStorage,
        nftMinting: backendCapabilities.nftMinting,
        nftMarketplaceListing: backendCapabilities.nftMarketplaceListing,
      })
    : [];
  const publishingStatus = publishingReadiness.length
    ? rollUpNftPublishingReadinessStatus(publishingReadiness)
    : null;
  const publishingSetupRequirements = backendCapabilities
    ? buildNftPublishingSetupRequirements({
        imageGeneration: backendCapabilities.imageGeneration,
        walrusStorage: backendCapabilities.walrusStorage,
        nftMinting: backendCapabilities.nftMinting,
        nftMarketplaceListing: backendCapabilities.nftMarketplaceListing,
      })
    : [];
  const updateWorkspaceDataPolicyMutation = useMutation({
    mutationFn: async (feedbackUse: MatterhornWorkspaceFeedbackUse) => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to update data policy.");
      return client.updateWorkspaceDataPolicy(workspaceId, { feedbackUse });
    },
    onSuccess: (policy) => {
      queryClient.setQueryData(
        ["settings-workspace-data-policy", props.runtimeWorkspaceId],
        policy,
      );
      void queryClient.invalidateQueries({
        queryKey: [
          "settings-workspace-backend-control-plane",
          backendWorkspaceId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ["settings-workspace-data-map", props.runtimeWorkspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          "settings-workspace-data-controls",
          props.runtimeWorkspaceId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ["settings-project-data-ledger", props.runtimeWorkspaceId],
      });
    },
  });
  const handleFeedbackPolicyChange = useCallback(
    (enabled: boolean) => {
      updateWorkspaceDataPolicyMutation.mutate(
        enabled ? "eval_routing_product_quality_only" : "disabled",
      );
    },
    [updateWorkspaceDataPolicyMutation],
  );
  const backendCapabilitiesLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading ||
      (workspaceBackendControlPlaneQuery.isError &&
        backendCapabilitiesQuery.isLoading)
    : backendCapabilitiesQuery.isLoading;
  const workspaceReadinessLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading ||
      (workspaceBackendControlPlaneQuery.isError &&
        workspaceReadinessQuery.isLoading)
    : workspaceReadinessQuery.isLoading;
  const workspaceDataMapLoading = backendWorkspaceId
    ? workspaceBackendControlPlaneQuery.isLoading ||
      (workspaceBackendControlPlaneQuery.isError &&
        workspaceDataMapQuery.isLoading)
    : workspaceDataMapQuery.isLoading;

  const projectDataLedgerQuery = useQuery({
    queryKey: ["settings-project-data-ledger", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to see the project data ledger.");
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
      if (!client || !workspaceId)
        throw new Error("Open a workspace to see team access.");
      return client.workspaceTeamAccessSummary(workspaceId);
    },
    staleTime: 30_000,
  });
  const [teamTokenManagementOpen, setTeamTokenManagementOpen] = useState(false);
  const teamAccessQuery = useQuery({
    queryKey: ["settings-team-access", props.runtimeWorkspaceId],
    enabled: Boolean(
      teamTokenManagementOpen &&
      props.matterhornServerClient &&
      props.runtimeWorkspaceId,
    ),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId)
        throw new Error("Open a workspace to manage local access tokens.");
      return client.workspaceTeamAccess(workspaceId);
    },
    staleTime: 30_000,
  });

  const exportProjectLedger = useCallback(async () => {
    const client = props.matterhornServerClient;
    const workspaceId = props.runtimeWorkspaceId?.trim();
    if (!client || !workspaceId) {
      const message =
        "Open a connected workspace to export the project ledger.";
      setLedgerExportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Ledger export unavailable",
        description: message,
      });
      return;
    }
    setLedgerExportStatus({
      tone: "info",
      message: "Exporting ledger JSON...",
    });
    try {
      const exportPayload = await client.exportProjectDataLedger(workspaceId, {
        limit: 300,
      });
      downloadJsonFile(
        exportPayload.filename ||
          `matterhorn-project-ledger-${safeDownloadFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(exportPayload, null, 2),
      );
      const message = `Exported ${exportPayload.manifest.itemCount} ledger events.`;
      setLedgerExportStatus({ tone: "success", message });
      showToast({
        tone: "success",
        title: "Ledger exported",
        description: message,
      });
    } catch (error) {
      const message = exportErrorMessage(
        error,
        "Could not export the project ledger.",
      );
      setLedgerExportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Ledger export failed",
        description: message,
      });
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId, showToast]);

  const exportSupportReport = useCallback(async () => {
    const client = props.matterhornServerClient;
    const workspaceId = props.runtimeWorkspaceId?.trim();
    if (!client || !workspaceId) {
      const message =
        "Open a connected workspace to download a support report.";
      setSupportReportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Support report unavailable",
        description: message,
      });
      return;
    }
    setSupportReportStatus({
      tone: "info",
      message: "Preparing support report...",
    });
    try {
      const report = await client.workspaceBackendSupportReport(workspaceId);
      downloadJsonFile(
        report.filename ||
          `matterhorn-backend-support-${safeDownloadFilePart(workspaceId)}-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(report, null, 2),
      );
      const message = "Downloaded redacted backend support report.";
      setSupportReportStatus({ tone: "success", message });
      showToast({
        tone: "success",
        title: "Support report downloaded",
        description: "Billing readiness is included without secrets.",
      });
    } catch (error) {
      const message = exportErrorMessage(
        error,
        "Could not download the support report.",
      );
      setSupportReportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Support report failed",
        description: message,
      });
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId, showToast]);

  const copySupportReport = useCallback(async () => {
    const client = props.matterhornServerClient;
    const workspaceId = props.runtimeWorkspaceId?.trim();
    if (!client || !workspaceId) {
      const message = "Open a connected workspace to copy a support report.";
      setSupportReportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Support report unavailable",
        description: message,
      });
      return;
    }
    setSupportReportStatus({
      tone: "info",
      message: "Preparing support report...",
    });
    try {
      const report = await client.workspaceBackendSupportReport(workspaceId);
      await writeClipboardText(JSON.stringify(report, null, 2));
      const message = "Copied redacted backend support report.";
      setSupportReportStatus({ tone: "success", message });
      showToast({
        tone: "success",
        title: "Support report copied",
        description:
          "Paste it into a GitHub issue or support thread when needed.",
      });
    } catch (error) {
      const message = exportErrorMessage(
        error,
        "Could not copy the support report.",
      );
      setSupportReportStatus({ tone: "error", message });
      showToast({
        tone: "error",
        title: "Support report copy failed",
        description: message,
      });
    }
  }, [props.matterhornServerClient, props.runtimeWorkspaceId, showToast]);

  const openMemoryReview = useCallback(() => {
    if (!notesWorkspaceId) return;
    navigate(workspaceMemoryRoute(notesWorkspaceId));
  }, [navigate, notesWorkspaceId]);

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
      setMemoryExportStatus(
        error instanceof Error ? error.message : "Could not export memory.",
      );
    }
  }, [backendWorkspaceId, props.matterhornServerClient]);

  const themeOptions: Array<{ id: SettingsThemeMode; label: string }> = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-dls-text">
          Settings
        </h1>
        <p className="mt-1 text-sm leading-6 text-dls-secondary">
          Your account, appearance, safety, protocols, extensions, workspaces,
          and diagnostics — all in one place.
        </p>
      </header>

      <div className="rounded-lg bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="space-y-1">
          {/* 1. Profile */}
          <SettingsCard
            icon={<CircleUser size={18} />}
            title="Profile"
            description={
              MATTERHORN_LAUNCH_FEATURES.cloud
                ? "Account, local profile, and Cloud readiness."
                : "Local profile and workspace access readiness."
            }
          >
            <Row
              label={profileCapability?.label ?? "Profile status"}
              hint={
                profileCapability?.description ??
                (MATTERHORN_LAUNCH_FEATURES.cloud
                  ? "Open profile settings to manage local and Cloud account state."
                  : "Open workspace preferences to review local settings and access.")
              }
              value={
                profileCapability ? (
                  <CapabilityBadge status={profileCapability.status} />
                ) : backendCapabilitiesLoading ? (
                  <StatusBadge>Loading</StatusBadge>
                ) : (
                  <UnavailableStatus />
                )
              }
            />
            <div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() =>
                  onSelectTab(
                    MATTERHORN_LAUNCH_FEATURES.cloud
                      ? "cloud-account"
                      : "preferences",
                  )
                }
              >
                {MATTERHORN_LAUNCH_FEATURES.cloud
                  ? "Open profile settings"
                  : "Open workspace preferences"}
              </Button>
            </div>
          </SettingsCard>

          {/* Backend control plane */}
          <SettingsCard
            icon={<ShieldCheck size={18} />}
            title="Backend status"
            description="What the local Matterhorn Desks engine reports for this workspace."
            status={
              backendCapabilities ? (
                <CapabilityBadge
                  status={backendCapabilities.security.memoryWriteGuards.status}
                />
              ) : backendCapabilitiesLoading ? (
                <StatusBadge>Loading</StatusBadge>
              ) : (
                <UnavailableStatus />
              )
            }
          >
            {backendCapabilities ? (
              <>
                <Collapsible className="group/backend-details">
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5 text-left text-sm font-medium text-dls-text transition-colors hover:bg-dls-surface-muted/[0.14]">
                    <span>Technical readiness details</span>
                    <ChevronDown className="size-4 text-dls-secondary transition-transform group-data-[state=open]/backend-details:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 flex flex-col gap-1">
                    <Row
                      label="Model routing"
                      hint={`Default: ${summarizeModelSource(backendCapabilities)}. ${summarizeModelRoutingPolicy(backendCapabilities)}`}
                      value={
                        <CapabilityBadge
                          status={backendCapabilities.models.status}
                        />
                      }
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
                          <CapabilityBadge
                            status={workspaceReadiness.summary.status}
                          />
                        ) : workspaceReadinessLoading ? (
                          <StatusBadge>Loading</StatusBadge>
                        ) : (
                          <UnavailableStatus label="Workspace unavailable" />
                        )
                      }
                    />
                    {workspaceReadiness?.summary.recommendedActions.length ? (
                      <div className="px-1 py-3">
                        <p className="text-sm font-medium text-dls-text">
                          Next step
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {workspaceReadiness.summary.recommendedActions
                            .slice(0, 3)
                            .map((action) => (
                              <div
                                key={action.actionId}
                                className="flex flex-col gap-1 text-sm leading-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-dls-text">
                                    {action.label}
                                  </p>
                                  <p className="text-xs leading-5 text-dls-secondary">
                                    {action.description}
                                  </p>
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
                    {MATTERHORN_LAUNCH_FEATURES.generatedMedia &&
                    publishingReadiness.length ? (
                      <div className="px-1 py-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-dls-text">
                              Image and NFT publishing
                            </p>
                            <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
                              Generated images, public storage, Sui minting, and
                              marketplace listing readiness.
                            </p>
                          </div>
                          {publishingStatus ? (
                            <CapabilityBadge status={publishingStatus} />
                          ) : null}
                        </div>
                        <NftPublishingReadinessRows
                          items={publishingReadiness}
                        />
                        <NftPublishingSetupRows
                          requirements={publishingSetupRequirements}
                          className="mt-3"
                          description="These are backend setup gates only. Wallet signing still happens in the user's Sui wallet."
                        />
                      </div>
                    ) : null}
                    <Row
                      label="Notes and memory"
                      hint={`Notes: ${summarizeCapability(backendCapabilities.notes)} Memory: ${summarizeCapability(backendCapabilities.memory)}`}
                      value={
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <CapabilityBadge
                            status={backendCapabilities.notes.status}
                          />
                          <CapabilityBadge
                            status={backendCapabilities.memory.status}
                          />
                        </div>
                      }
                    />
                    <Row
                      label="Evidence ledger"
                      hint={`Sources: ${backendCapabilities.evidence.sources.join(", ")}.`}
                      value={
                        <CapabilityBadge
                          status={backendCapabilities.evidence.status}
                        />
                      }
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
                        Download redacted project evidence or copy a support
                        report with backend, billing, wallet, and data-policy
                        readiness.
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
                          onClick={() => void copySupportReport()}
                          disabled={
                            !props.matterhornServerClient ||
                            !props.runtimeWorkspaceId
                          }
                        >
                          <Copy className="size-3.5" />
                          Copy report
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
                          onClick={() => void exportSupportReport()}
                          disabled={
                            !props.matterhornServerClient ||
                            !props.runtimeWorkspaceId
                          }
                        >
                          <Download className="size-3.5" />
                          Support report
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-fit gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
                          onClick={() => void exportProjectLedger()}
                          disabled={
                            !props.matterhornServerClient ||
                            !props.runtimeWorkspaceId ||
                            projectDataLedgerQuery.isLoading
                          }
                        >
                          <Download className="size-3.5" />
                          Ledger JSON
                        </Button>
                      </div>
                    </div>
                    <InlineActionStatus
                      status={supportReportStatus ?? ledgerExportStatus}
                    />
                    <Row
                      label="Wallet families"
                      hint={walletFamilySummary(backendCapabilities)
                        .map(
                          (wallet) =>
                            `${wallet.family}: ${backendCapabilityLabel(wallet.status)}`,
                        )
                        .join(" · ")}
                      value={
                        <CapabilityBadge
                          status={backendCapabilities.wallets.status}
                        />
                      }
                    />
                    <Row
                      label="Teams"
                      hint={
                        teamAccessSummaryQuery.data
                          ? `${teamAccessSummaryQuery.data.sharingMode.label}. ${teamAccessSummaryQuery.data.localAccess.tokenCount} local access tokens. Owners ${teamAccessSummaryQuery.data.localAccess.byScope.owner}; collaborators ${teamAccessSummaryQuery.data.localAccess.byScope.collaborator}; viewers ${teamAccessSummaryQuery.data.localAccess.byScope.viewer}.${MATTERHORN_LAUNCH_FEATURES.cloud ? ` Cloud teams: ${backendCapabilityLabel(teamAccessSummaryQuery.data.cloudTeams.status)}.` : ""}`
                          : teamAccessSummaryQuery.isLoading
                            ? "Loading local access status."
                            : summarizeCapability(backendCapabilities.teams)
                      }
                      value={
                        <CapabilityBadge
                          status={backendCapabilities.teams.status}
                        />
                      }
                    />
                    <TeamAccessControls
                      client={props.matterhornServerClient}
                      workspaceId={backendWorkspaceId}
                      summary={teamAccessSummaryQuery.data}
                      data={teamAccessQuery.data}
                      billingStatus={workspaceBillingStatusQuery.data?.status}
                      error={teamAccessQuery.error}
                      isError={teamAccessQuery.isError}
                      isLoading={teamAccessQuery.isLoading}
                      isOpen={teamTokenManagementOpen}
                      onOpen={() => setTeamTokenManagementOpen(true)}
                      onOpenBilling={
                        MATTERHORN_LAUNCH_FEATURES.billing
                          ? () => onSelectTab("billing")
                          : undefined
                      }
                      refetch={teamAccessQuery.refetch}
                      refetchBilling={workspaceBillingStatusQuery.refetch}
                    />
                    <Row
                      label="Write guards"
                      hint={summarizeCapability(
                        backendCapabilities.security.memoryWriteGuards,
                      )}
                      value={
                        <CapabilityBadge
                          status={
                            backendCapabilities.security.memoryWriteGuards
                              .status
                          }
                        />
                      }
                    />
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <div className="px-1 py-3 text-sm leading-6 text-dls-secondary">
                {backendCapabilitiesLoading
                  ? "Loading backend status..."
                  : "The Matterhorn Desks engine is offline or did not return a capability report."}
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
                <CapabilityBadge
                  status={workspaceDataMap.policy.redaction.status}
                />
              ) : workspaceDataMapLoading ? (
                <StatusBadge>Loading</StatusBadge>
              ) : (
                <UnavailableStatus label="Workspace unavailable" />
              )
            }
          >
            {workspaceDataMap ? (
              <DataPolicySection
                dataMap={workspaceDataMap}
                controls={workspaceDataControls}
                dataPolicy={workspaceDataPolicy}
                feedbackPolicySaving={
                  updateWorkspaceDataPolicyMutation.isPending
                }
                feedbackPolicyError={
                  updateWorkspaceDataPolicyMutation.error instanceof Error
                    ? updateWorkspaceDataPolicyMutation.error.message
                    : null
                }
                onFeedbackPolicyChange={
                  props.matterhornServerClient && props.runtimeWorkspaceId
                    ? handleFeedbackPolicyChange
                    : undefined
                }
                onOpenControlRoute={(href) => navigate(href)}
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
            icon={<Archive size={18} />}
            title="Memory"
            description="Review pending suggestions and manage saved memories."
            status={
              memoryOverviewQuery.data?.pending ? (
                <StatusBadge tone="setup">
                  {memoryOverviewQuery.data.pending} to review
                </StatusBadge>
              ) : null
            }
          >
            <Row
              label="Pending suggestions"
              hint="Items waiting for explicit review."
              value={
                memoryOverviewQuery.isLoading
                  ? "Loading"
                  : String(memoryOverviewQuery.data?.pending ?? 0)
              }
            />
            <Row
              label="Saved memories"
              hint="Confirmed records available for visible chat context."
              value={
                memoryOverviewQuery.isLoading
                  ? "Loading"
                  : String(memoryOverviewQuery.data?.confirmed ?? 0)
              }
            />
            <div className="flex flex-wrap gap-2 px-1 py-3">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-dls-border/45 bg-dls-surface-muted/80 px-3 text-xs text-dls-text shadow-sm hover:bg-dls-surface-muted"
                onClick={openMemoryReview}
                disabled={!notesWorkspaceId}
              >
                Open Memory review
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border border-dls-border/45 bg-dls-surface-muted/35 px-3 text-xs text-dls-text hover:border-dls-border/70 hover:bg-dls-surface-muted/65"
                onClick={() => void exportMemory()}
                disabled={!props.matterhornServerClient}
              >
                <Download className="size-3.5" aria-hidden="true" />
                Export memory bundle
              </Button>
            </div>
            {memoryExportStatus ? (
              <p className="px-1 py-2 text-xs leading-5 text-dls-secondary">
                {memoryExportStatus}
              </p>
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
                disabled={!notesReady}
                onClick={() => {
                  if (!notesReady) {
                    showToast({
                      title: "Create a workspace before opening notes",
                      description:
                        "Notes are stored as project evidence inside a Matterhorn workspace.",
                      tone: "warning",
                    });
                    return;
                  }
                  navigate(workspaceNotesRoute(notesWorkspaceId));
                }}
              >
                <NotebookPen size={14} />
                {t("notes.open_notes")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={!notesReady}
                onClick={() => {
                  if (!notesReady) {
                    showToast({
                      title: "Create a workspace before saving notes",
                      description:
                        "Notes are stored as project evidence inside a Matterhorn workspace.",
                      tone: "warning",
                    });
                    return;
                  }
                  openQuickJot();
                }}
              >
                {t("notes.quick_jot_title")}
              </Button>
            </div>
          </SettingsCard>

          {/* 2. Appearance */}
          <SettingsCard
            icon={<Palette size={18} />}
            title="Appearance"
            description="Theme, accent, and text density."
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
                      aria-pressed={theme === option.id}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              }
            />
            <Row
              label="Brand palette"
              hint="Matterhorn's fixed interface colors."
              value={
                <span className="flex items-center gap-2 text-xs text-dls-secondary">
                  <span
                    aria-hidden="true"
                    className="size-5 rounded-full border border-dls-border"
                    style={{
                      backgroundColor: "var(--matterhorn-blue, #7c3aed)",
                    }}
                  />
                  <span
                    aria-hidden="true"
                    className="size-5 rounded-full border border-dls-border"
                    style={{ backgroundColor: "#0D2B4E" }}
                  />
                  <span>Fixed</span>
                </span>
              }
            />
            <Row
              label="Text density"
              hint="Comfortable is roomier; compact fits more on screen."
              value={
                <div className="flex gap-1.5">
                  <Button
                    variant={density === "comfortable" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => onDensityChange("comfortable")}
                    aria-pressed={density === "comfortable"}
                  >
                    Comfortable
                  </Button>
                  <Button
                    variant={density === "compact" ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => onDensityChange("compact")}
                    aria-pressed={density === "compact"}
                  >
                    Compact
                  </Button>
                </div>
              }
            />
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-dls-secondary"
                onClick={() => onSelectTab("appearance")}
              >
                More appearance options
              </Button>
            </div>
          </SettingsCard>

          {/* 3. Safety & Wallets */}
          <SettingsCard
            icon={<ShieldCheck size={18} />}
            title="Safety & Wallets"
            description="How Matterhorn Desks keeps Web3 actions safe."
            status={
              backendCapabilities ? (
                <CapabilityBadge status={backendCapabilities.wallets.status} />
              ) : null
            }
          >
            <p className="text-sm leading-6 text-dls-secondary">
              Matterhorn Desks is{" "}
              <span className="font-medium text-dls-text">non-custodial</span>.
              It never holds your keys, signs silently, or moves funds on your
              behalf. You stay in control of every on-chain action.
            </p>
            <ul className="flex list-none flex-col gap-1 text-sm leading-6 text-dls-secondary">
              <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                <span className="font-medium text-dls-text">Bittensor:</span>{" "}
                actions are prepared as previews. Anything on-chain is signed in
                your own external Bittensor-compatible signer — Matterhorn Desks
                cannot sign or broadcast.
              </li>
              <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                <span className="font-medium text-dls-text">Hyperliquid:</span>{" "}
                manual orders use a separate trade ticket. Matterhorn submits
                only after you review the exact terms and sign a short-lived
                intent in your connected wallet; agents and watches cannot
                submit.
              </li>
              <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                <span className="font-medium text-dls-text">Polymarket:</span>{" "}
                Matterhorn reads market data and prepares drafts for you to
                review and submit in your own eligible client.
              </li>
              <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                <span className="font-medium text-dls-text">
                  No secret storage:
                </span>{" "}
                Matterhorn Desks never asks for or stores seed phrases, private
                keys, or API secrets.
              </li>
            </ul>
          </SettingsCard>

          {/* 4. Protocols */}
          <SettingsCard
            icon={<Network size={18} />}
            title="Protocols"
            description="Status of each Web3 workspace."
          >
            <Row
              label="Bittensor"
              hint={
                bittensorUsesFallbackData
                  ? "Public reads use clearly labeled fallback data. Staking actions remain unsigned previews for an external signer."
                  : "Live public reads for TAO, subnets, and validators. Staking actions remain unsigned previews for an external signer."
              }
              value={
                bittensorCapability ? (
                  <StatusBadge
                    tone={bittensorUsesLiveProvider ? "ready" : "preview"}
                  >
                    {bittensorUsesLiveProvider
                      ? "Live reads · Preview"
                      : "Fallback reads · Preview"}
                  </StatusBadge>
                ) : (
                  <UnavailableStatus label="Status unavailable" />
                )
              }
            />
            <Row
              label="Hyperliquid"
              hint={
                hyperliquidExecution?.canSubmit
                  ? "Live submission is enabled only through the exact-order trade ticket after connected-wallet approval. Agents and watches cannot submit."
                  : hyperliquidExecution
                    ? "Read and preview are available. Live submission is disabled by the deployment execution switch."
                    : "Execution readiness is unavailable."
              }
              value={
                marketExecutionReadinessQuery.isLoading ? (
                  <StatusBadge>Checking</StatusBadge>
                ) : hyperliquidExecution ? (
                  <StatusBadge
                    tone={hyperliquidExecution.canSubmit ? "ready" : "preview"}
                  >
                    {hyperliquidExecution.canSubmit
                      ? "Wallet-approved execution"
                      : "Preview only"}
                  </StatusBadge>
                ) : (
                  <UnavailableStatus label="Status unavailable" />
                )
              }
            />
            <Row
              label="Polymarket"
              hint={
                polymarketExecution
                  ? "Live market discovery, odds, and compliance checks are available. Matterhorn prepares previews but live submission is disabled."
                  : "Execution readiness is unavailable."
              }
              value={
                marketExecutionReadinessQuery.isLoading ? (
                  <StatusBadge>Checking</StatusBadge>
                ) : polymarketExecution ? (
                  <StatusBadge
                    tone={polymarketExecution.canSubmit ? "ready" : "preview"}
                  >
                    {polymarketExecution.canSubmit
                      ? "Wallet-approved execution"
                      : "Preview only"}
                  </StatusBadge>
                ) : (
                  <UnavailableStatus label="Status unavailable" />
                )
              }
            />
            <p className="text-xs leading-5 text-dls-secondary">
              These labels describe what each desk can do; they are not action
              buttons. Open a protocol workspace from the sidebar to use it.
            </p>
          </SettingsCard>

          {/* 5. MCPs & Connectors */}
          <SettingsCard
            icon={<Boxes size={18} />}
            title="MCPs &amp; Connectors"
            description="Connected protocol tools, app connectors, and custom MCP servers."
          >
            <p className="text-sm leading-6 text-dls-secondary">
              Connect Model Context Protocol (MCP) servers, protocol tools, and
              app connectors so Matterhorn Desks can use them from chat. Some
              tools may be unavailable until their connector is configured or
              signed in.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onSelectTab("extensions")}
              >
                Manage MCPs
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-dls-secondary"
                onClick={
                  props.onOpenAddMcp ?? (() => onSelectTab("extensions"))
                }
              >
                Add a custom MCP
              </Button>
            </div>
          </SettingsCard>

          {/* 6. Workspaces */}
          <SettingsCard
            icon={<FolderCog size={18} />}
            title="Workspaces"
            description="Local and shared workspaces, and diagnostics."
          >
            <p className="text-sm leading-6 text-dls-secondary">
              A workspace is a folder on your machine the agent can work in.{" "}
              <span className="font-medium text-dls-text">Local</span>{" "}
              workspaces stay on your computer.{" "}
              <span className="font-medium text-dls-text">Remote / shared</span>{" "}
              workspaces connect to a hosted worker so you can run work in the
              cloud.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onSelectTab("permissions")}
              >
                Authorized folders
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-dls-secondary"
                onClick={() => onSelectTab("advanced")}
              >
                Runtime diagnostics
              </Button>
            </div>
          </SettingsCard>

          {/* 7. Release diagnostics */}
          <SettingsCard
            icon={<Stethoscope size={18} />}
            title="Release diagnostics"
            description="Version info and tools for reporting issues."
            status={<StatusBadge tone="desktop">Desktop only</StatusBadge>}
          >
            <Row
              label="App version"
              value={
                <span className="font-mono text-xs">
                  {APP_VERSION || "dev"}
                </span>
              }
            />
            <Row
              label="Run a diagnostics check"
              hint="Copy and run this in your terminal to capture a redacted readiness report."
              value={
                <CopyButton
                  text={RELEASE_DOCTOR_COMMAND}
                  label="Copy command"
                />
              }
            />
            <code className="select-all break-all rounded-md bg-dls-surface-muted/[0.12] px-3 py-2 font-mono text-[11px] leading-5 text-dls-secondary">
              {RELEASE_DOCTOR_COMMAND}
            </code>
            <p className="text-xs leading-5 text-dls-secondary">
              See the first-run and customer-evidence docs for the full
              checklist.
            </p>
          </SettingsCard>

          {/* 8. Privacy & Data */}
          <SettingsCard
            icon={<Lock size={18} />}
            title="Privacy &amp; Data"
            description="Where your data lives, and what is never stored."
            status={
              workspaceDataMap ? null : <StatusBadge>Local first</StatusBadge>
            }
          >
            {workspaceDataMap ? (
              <>
                <Row
                  label="Chat history"
                  hint={settingsStorageLocationLabel(
                    workspaceDataMap.stores.chat,
                  )}
                  value={
                    <CapabilityBadge
                      status={workspaceDataMap.stores.chat.status}
                    />
                  }
                />
                <Row
                  label="Notes"
                  hint={settingsStorageLocationLabel(
                    workspaceDataMap.stores.notes,
                  )}
                  value={
                    <CapabilityBadge
                      status={workspaceDataMap.stores.notes.status}
                    />
                  }
                />
                <Row
                  label="Memory"
                  hint={settingsStorageLocationLabel(
                    workspaceDataMap.stores.memory,
                  )}
                  value={
                    <CapabilityBadge
                      status={workspaceDataMap.stores.memory.status}
                    />
                  }
                />
                <Row
                  label="Outputs"
                  hint={settingsStorageLocationLabel(
                    workspaceDataMap.stores.outputs,
                  )}
                  value={
                    <CapabilityBadge
                      status={workspaceDataMap.stores.outputs.status}
                    />
                  }
                />
                <Row
                  label="Training use"
                  hint={workspaceDataPolicySummary(workspaceDataMap)}
                  value={
                    <CapabilityBadge
                      status={workspaceDataMap.policy.export.status}
                    />
                  }
                />
                <p className="px-1 py-3 text-xs leading-5 text-dls-secondary">
                  Matterhorn Desks never asks for or stores seed phrases,
                  private keys, API secrets, raw signatures, or wallet exports.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-dls-secondary">
                  Your chats, generated artifacts, and on-chain receipts are
                  stored{" "}
                  <span className="font-medium text-dls-text">
                    locally on your machine
                  </span>{" "}
                  by default.
                </p>
                <ul className="flex list-none flex-col gap-1 text-sm leading-6 text-dls-secondary">
                  <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                    <span className="font-medium text-dls-text">
                      Stored locally:
                    </span>{" "}
                    chat history, artifacts, and public on-chain receipts/links.
                  </li>
                  <li className="rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5">
                    <span className="font-medium text-dls-text">
                      Never stored:
                    </span>{" "}
                    seed phrases, private keys, API secrets, raw signatures, or
                    wallet exports.
                  </li>
                </ul>
              </>
            )}
          </SettingsCard>

          {/* 9. About */}
          <SettingsCard
            icon={<Info size={18} />}
            title="About"
            description="Matterhorn Desks version and resources."
          >
            <Row
              label="Matterhorn Desks"
              value={
                <span className="font-mono text-xs">
                  {APP_VERSION ? `v${APP_VERSION}` : "developer build"}
                </span>
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onSelectTab("updates")}
              >
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
