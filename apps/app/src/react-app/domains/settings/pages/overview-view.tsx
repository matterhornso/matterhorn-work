/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Circle,
  CircleUser,
  Clock3,
  Copy,
  ExternalLink,
  FolderCog,
  FolderOpen,
  Info,
  ListTodo,
  Lock,
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
import { t } from "../../../../i18n";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuickJot } from "../../notes";
import { RecentActivitySection } from "../../recent-activity/recent-activity-section";
import {
  backendCapabilityLabel,
  backendCapabilityTone,
  storageLocationLabel,
  summarizeCapability,
  summarizeModelSource,
  walletFamilySummary,
  workspaceDataPolicySummary,
  type BackendCapabilityTone,
} from "../backend-capability-status";
import { GLOBAL_HOME_SIDE_PANEL_KEY, useUiStateStore } from "../../../shell/ui-state-store";
import { workspaceNotesRoute, workspaceSessionRoute } from "../../../shell/workspace-routes";
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

export function SettingsOverviewView(props: {
  onSelectTab: (tab: SettingsTab) => void;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
}) {
  const { onSelectTab } = props;
  const navigate = useNavigate();
  const { openQuickJot } = useQuickJot();
  const setSidePanelState = useUiStateStore((state) => state.setSidePanelState);
  const [theme, setTheme] = useState<ThemeMode>(getInitialThemeMode());
  const [density, setDensity] = useState<Density>(readDensity());
  const [memoryExportStatus, setMemoryExportStatus] = useState<string | null>(null);
  const notesWorkspaceId = props.runtimeWorkspaceId?.trim() ?? "";

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
    queryKey: ["settings-memory-overview", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) return { pending: 0, confirmed: 0 };
      const [pendingSuggestions, savedRecords] = await Promise.all([
        client.listMemorySuggestions({ status: "pending", limit: 100 }),
        client.listMemory({ limit: 100 }),
      ]);
      return {
        pending: (pendingSuggestions.entries ?? []).filter((entry) => entry.status === "pending").length,
        confirmed: savedRecords.count ?? savedRecords.records.length,
      };
    },
  });

  const backendCapabilitiesQuery = useQuery({
    queryKey: ["settings-backend-capabilities"],
    enabled: Boolean(props.matterhornServerClient),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      if (!client) throw new Error("Matterhorn Work engine is offline.");
      return client.backendCapabilities();
    },
    staleTime: 30_000,
  });

  const workspaceDataMapQuery = useQuery({
    queryKey: ["settings-workspace-data-map", props.runtimeWorkspaceId],
    enabled: Boolean(props.matterhornServerClient && props.runtimeWorkspaceId),
    queryFn: async () => {
      const client = props.matterhornServerClient;
      const workspaceId = props.runtimeWorkspaceId?.trim();
      if (!client || !workspaceId) throw new Error("Open a workspace to see where project data is stored.");
      return client.workspaceDataMap(workspaceId);
    },
    staleTime: 30_000,
  });

  const openMemoryReview = useCallback(() => {
    if (!notesWorkspaceId) return;
    setSidePanelState(GLOBAL_HOME_SIDE_PANEL_KEY, "memory");
    navigate(workspaceSessionRoute(notesWorkspaceId));
  }, [navigate, notesWorkspaceId, setSidePanelState]);

  const exportMemory = useCallback(async () => {
    const client = props.matterhornServerClient;
    if (!client) return;
    setMemoryExportStatus("Exporting...");
    try {
      const response = await client.exportMemory();
      setMemoryExportStatus(`Exported ${response.export.recordCount} records.`);
    } catch (error) {
      setMemoryExportStatus(error instanceof Error ? error.message : "Could not export memory.");
    }
  }, [props.matterhornServerClient]);

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
            backendCapabilitiesQuery.data ? (
              <CapabilityBadge status={backendCapabilitiesQuery.data.security.memoryWriteGuards.status} />
            ) : backendCapabilitiesQuery.isLoading ? (
              <StatusBadge>Loading</StatusBadge>
            ) : (
              <StatusBadge tone="error">Unavailable</StatusBadge>
            )
          }
        >
          {backendCapabilitiesQuery.data ? (
            <>
              <Row
                label="Model routing"
                hint={`Default: ${summarizeModelSource(backendCapabilitiesQuery.data)}. Model list source: ${backendCapabilitiesQuery.data.models.providerListSource}.`}
                value={<CapabilityBadge status={backendCapabilitiesQuery.data.models.status} />}
              />
              <Row
                label="Notes and memory"
                hint={`Notes: ${summarizeCapability(backendCapabilitiesQuery.data.notes)} Memory: ${summarizeCapability(backendCapabilitiesQuery.data.memory)}`}
                value={
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <CapabilityBadge status={backendCapabilitiesQuery.data.notes.status} />
                    <CapabilityBadge status={backendCapabilitiesQuery.data.memory.status} />
                  </div>
                }
              />
              <Row
                label="Evidence ledger"
                hint={`Sources: ${backendCapabilitiesQuery.data.evidence.sources.join(", ")}.`}
                value={<CapabilityBadge status={backendCapabilitiesQuery.data.evidence.status} />}
              />
              <Row
                label="Wallet families"
                hint={walletFamilySummary(backendCapabilitiesQuery.data)
                  .map((wallet) => `${wallet.family}: ${backendCapabilityLabel(wallet.status)}`)
                  .join(" · ")}
                value={<CapabilityBadge status={backendCapabilitiesQuery.data.wallets.status} />}
              />
              <Row
                label="Teams"
                hint={summarizeCapability(backendCapabilitiesQuery.data.teams)}
                value={<CapabilityBadge status={backendCapabilitiesQuery.data.teams.status} />}
              />
              <Row
                label="Write guards"
                hint={summarizeCapability(backendCapabilitiesQuery.data.security.memoryWriteGuards)}
                value={<CapabilityBadge status={backendCapabilitiesQuery.data.security.memoryWriteGuards.status} />}
              />
            </>
          ) : (
            <div className="px-1 py-3 text-sm leading-6 text-dls-secondary">
              {backendCapabilitiesQuery.isLoading
                ? "Loading backend status..."
                : "The Matterhorn Work engine is offline or did not return a capability report."}
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
              Export memory
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
          status={workspaceDataMapQuery.data ? <StatusBadge tone="ready">Workspace mapped</StatusBadge> : <StatusBadge>Local first</StatusBadge>}
        >
          {workspaceDataMapQuery.data ? (
            <>
              <Row
                label="Chat history"
                hint={storageLocationLabel(workspaceDataMapQuery.data.stores.chat)}
                value={<CapabilityBadge status={workspaceDataMapQuery.data.stores.chat.status} />}
              />
              <Row
                label="Notes"
                hint={storageLocationLabel(workspaceDataMapQuery.data.stores.notes)}
                value={<CapabilityBadge status={workspaceDataMapQuery.data.stores.notes.status} />}
              />
              <Row
                label="Memory"
                hint={storageLocationLabel(workspaceDataMapQuery.data.stores.memory)}
                value={<CapabilityBadge status={workspaceDataMapQuery.data.stores.memory.status} />}
              />
              <Row
                label="Outputs"
                hint={storageLocationLabel(workspaceDataMapQuery.data.stores.outputs)}
                value={<CapabilityBadge status={workspaceDataMapQuery.data.stores.outputs.status} />}
              />
              <Row
                label="Training use"
                hint={workspaceDataPolicySummary(workspaceDataMapQuery.data)}
                value={<CapabilityBadge status={workspaceDataMapQuery.data.policy.export.status} />}
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
