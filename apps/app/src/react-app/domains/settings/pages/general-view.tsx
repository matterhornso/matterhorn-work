/** @jsxImportSource react */
import {
  ArrowRight,
  ArrowUpRight,
  Archive,
  Cloud,
  Cog,
  CreditCard,
  Cpu,
  FileText,
  FolderLock,
  Image as ImageIcon,
  LifeBuoy,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Paintbrush,
  Puzzle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Wallet as WalletIcon,
} from "lucide-react";

import { t } from "../../../../i18n";
import type { SettingsTab } from "../../../../app/types";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { isSettingsTabVisibleAtLaunch } from "../../../../app/lib/launch-features";
import type {
  MatterhornCapabilityStatus,
  MatterhornSettingsSectionCapability,
} from "@matterhorn-work/types/backend-capabilities";
import { getTaskLogStatusLabel, useWorkflowTaskLog, type TaskLogSource } from "./use-workflow-task-log";
import {
  getSettingsTabStatus,
  settingsReadinessStatusLabel,
  type SettingsReadinessStatus,
} from "../shell/settings-page";

export type GeneralSettingsViewProps = {
  onNavigateTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  runtimeWorkspaceId?: string;
  workspaceResolutionPending?: boolean;
  matterhornServerClient?: MatterhornServerClient | null;
  backendSettingsSections?: MatterhornSettingsSectionCapability[] | null;
  onOpenMemoryReview: () => void;
  onOpenNotes: () => void;
  onOpenOutputs: () => void;
  onSendFeedback: () => void;
  onJoinDiscord: () => void;
  onReportIssue: () => void;
};

type SettingsHubCard = {
  tab: SettingsTab;
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: SettingsReadinessStatus;
  developerOnly?: boolean;
};

type ProjectSurfaceSection = "memory" | "notes" | "outputs" | "feedback";
type ProjectSurfaceStatus = SettingsReadinessStatus | "Engine offline";

type ProjectSurfaceCard = {
  section: ProjectSurfaceSection;
  icon: typeof Sparkles;
  title: string;
  desc: string;
  actionLabel: string;
};

const workspaceCards: SettingsHubCard[] = [
  { tab: "preferences", icon: Cog, title: "Preferences", desc: "Model and reasoning controls.", status: "Working" },
  { tab: "permissions", icon: FolderLock, title: "Permissions", desc: "Folders the agent can use.", status: "Working" },
  { tab: "wallet", icon: WalletIcon, title: "Wallet", desc: "Wallet connections and signing boundaries.", status: "Preview" },
  { tab: "generated-media", icon: ImageIcon, title: "Generated media", desc: "Image and NFT publishing readiness.", status: "Platform setup" },
  { tab: "extensions", icon: Puzzle, title: "MCPs & Tools", desc: "MCP servers and connectors.", status: "Working" },
  { tab: "advanced", icon: Wrench, title: "Advanced", desc: "Runtime and developer options.", status: "Developer", developerOnly: true },
];

const globalCards: SettingsHubCard[] = [
  { tab: "ai", icon: Cpu, title: "Models", desc: "Choose models and connect providers.", status: "Connect provider" },
  { tab: "cloud-account", icon: Cloud, title: "Matterhorn Cloud", desc: "Account and organization.", status: "Configure cloud" },
  { tab: "appearance", icon: Paintbrush, title: "Appearance", desc: "Theme and text size.", status: "Working" },
  { tab: "updates", icon: RefreshCcw, title: "Updates", desc: "Version and update channel.", status: "Desktop only" },
  { tab: "billing", icon: CreditCard, title: "Billing", desc: "Plans, checkout, and charging status.", status: "Preview" },
  { tab: "cloud-workers", icon: Cloud, title: "Cloud Workers Preview", desc: "Cloud worker instances.", status: "Cloud only", developerOnly: true },
  { tab: "environment", icon: Terminal, title: "Environment", desc: "Local runtime variables.", status: "Developer", developerOnly: true },
  { tab: "recovery", icon: ShieldCheck, title: "Recovery", desc: "Reset and repair diagnostics.", status: "Preview", developerOnly: true },
];

const projectSurfaceCards: ProjectSurfaceCard[] = [
  {
    section: "memory",
    icon: Archive,
    title: "Memory review",
    desc: "Review suggestions before saving.",
    actionLabel: "Open",
  },
  {
    section: "notes",
    icon: NotebookPen,
    title: "Notes",
    desc: "Workspace notes and quick jots.",
    actionLabel: "Open",
  },
  {
    section: "outputs",
    icon: FileText,
    title: "Outputs",
    desc: "Receipts, files, and run evidence.",
    actionLabel: "Review",
  },
  {
    section: "feedback",
    icon: MessageCircle,
    title: "Feedback",
    desc: "Local feedback for product quality only.",
    actionLabel: "Send",
  },
];

const FEEDBACK_ACTION_CLASS =
  "matterhorn-feedback-action inline-flex items-center gap-1.5 rounded-md px-0.5 py-1 text-[12px] font-medium text-dls-secondary transition-colors duration-150 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--matterhorn-blue-rgb)/0.28)]";
const SETTINGS_HUB_SECTION_CLASS = "rounded-lg bg-dls-surface-muted/[0.06] p-3";
const SETTINGS_HUB_GRID_CLASS = "grid grid-cols-1 gap-1 @lg/settings-general:grid-cols-2";

function capabilityStatusToSettingsStatus(status: MatterhornCapabilityStatus): SettingsReadinessStatus {
  if (status === "working") return "Working";
  if (status === "needs_setup") return "Review access";
  if (status === "preview") return "Preview";
  return "Not supported here";
}

function getSectionStatus(
  sectionId: ProjectSurfaceSection,
  sections?: MatterhornSettingsSectionCapability[] | null,
) {
  if (!sections?.length) return "Engine offline";
  const section = sections?.find((item) => item.section === sectionId);
  return section ? capabilityStatusToSettingsStatus(section.status) : "Not supported here";
}

function shouldShowSettingsStatus(status: SettingsReadinessStatus | ProjectSurfaceStatus) {
  return String(status).toLowerCase() !== "working";
}

function SettingsCard(props: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: SettingsHubCard["status"];
  onClick: () => void;
}) {
  const showStatus = shouldShowSettingsStatus(props.status);
  const statusLabel = showStatus ? settingsReadinessStatusLabel(props.status) : null;
  const statusClass =
    props.status === "Connect wallet" ||
    props.status === "Connect provider" ||
    props.status === "Configure MCP" ||
    props.status === "Review access" ||
    props.status === "Platform setup" ||
    props.status === "Configure cloud"
        ? "text-sky-300"
        : props.status === "Preview" || props.status === "Preview only"
          ? "text-amber-300"
          : props.status === "Developer"
            ? "text-violet-300"
          : "text-dls-secondary";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-dls-surface-muted/[0.065] px-3 py-3 text-left transition-colors hover:bg-dls-surface-muted/[0.12] focus:outline-none focus-visible:bg-dls-surface-muted/[0.12] focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.28)]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--dls-accent-rgb)/0.10)] text-dls-text transition-colors group-hover:bg-[rgb(var(--dls-accent-rgb)/0.16)]">
        <props.icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <div className="min-w-0 text-[13px] font-medium leading-5 text-dls-text">{props.title}</div>
          {statusLabel ? (
            <span className={`shrink-0 text-[11px] font-medium ${statusClass}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-dls-secondary">{props.desc}</div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-dls-secondary" />
    </button>
  );
}

function ProjectSurfaceRow(props: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: ProjectSurfaceStatus;
  actionLabel: string;
  requiresWorkspace?: boolean;
  workspaceReady?: boolean;
  workspaceResolutionPending?: boolean;
  onClick: () => void;
}) {
  const waitingForWorkspace = Boolean(
    props.requiresWorkspace &&
      props.workspaceResolutionPending &&
      !props.workspaceReady,
  );
  const missingWorkspace = Boolean(
    props.requiresWorkspace &&
      !props.workspaceResolutionPending &&
      !props.workspaceReady,
  );
  const actionLabel = missingWorkspace ? "Create workspace" : props.actionLabel;
  const showStatus = missingWorkspace || shouldShowSettingsStatus(props.status);
  const statusLabel = showStatus
    ? missingWorkspace
      ? "Workspace needed"
      : props.status === "Engine offline"
        ? props.status
        : settingsReadinessStatusLabel(props.status)
    : null;
  const statusClass =
    missingWorkspace
      ? "text-dls-muted"
      : props.status === "Connect wallet" ||
          props.status === "Connect provider" ||
          props.status === "Configure MCP" ||
          props.status === "Review access" ||
          props.status === "Platform setup" ||
          props.status === "Configure cloud"
            ? "text-sky-300"
            : props.status === "Preview" || props.status === "Preview only"
              ? "text-amber-300"
          : props.status === "Engine offline"
            ? "text-red-300"
          : "text-dls-secondary";

  return (
    <button
      type="button"
      aria-busy={waitingForWorkspace || undefined}
      disabled={waitingForWorkspace}
      onClick={props.onClick}
      className="group flex min-w-0 items-center gap-3 rounded-md bg-dls-surface-muted/[0.065] px-3 py-3 text-left transition-colors hover:bg-dls-surface-muted/[0.12] focus:outline-none focus-visible:bg-dls-surface-muted/[0.12] focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.34)] disabled:cursor-default disabled:opacity-75 disabled:hover:bg-dls-surface-muted/[0.065]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dls-hover/55 text-dls-text transition-colors group-hover:bg-dls-hover">
        <props.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 text-[13px] font-medium leading-5 text-dls-text">{props.title}</div>
          {statusLabel ? (
            <span className={`shrink-0 text-[11px] font-medium ${statusClass}`}>{statusLabel}</span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-dls-secondary">
          {missingWorkspace ? "Create or connect a workspace first." : props.desc}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center text-[12px] font-medium text-dls-accent">
        <span>{actionLabel}</span>
        <ArrowRight size={13} />
      </div>
    </button>
  );
}

function formatTaskDesk(deskId?: string) {
  if (!deskId) return "Matterhorn";
  if (deskId === "wellness") return "Longevity";
  if (deskId === "mcps") return "MCPs";
  return deskId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTaskTime(updatedAt: number) {
  if (!updatedAt) return "Just now";
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatTaskSource(source: TaskLogSource) {
  return source === "backend" ? "Workflow" : "Session";
}

function taskTitle(log: { visibleUserIntent?: string; sessionId: string }) {
  const intent = log.visibleUserIntent?.trim();
  if (intent) return intent;
  return `Task ${log.sessionId.slice(0, 8)}`;
}

function TaskLogsSection(props: {
  workspaceId?: string;
  matterhornServerClient?: MatterhornServerClient | null;
}) {
  const { logs, isLoading, error } = useWorkflowTaskLog(
    props.workspaceId,
    props.matterhornServerClient ?? undefined,
  );

  return (
    <section className="rounded-lg bg-dls-surface-muted/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dls-hover/45 text-dls-secondary">
            <ListChecks size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-dls-text">Workflow task log</div>
            <p className="mt-0.5 text-[12px] leading-5 text-dls-text">Tracked workflow runs and wait states for this workspace.</p>
          </div>
        </div>
        <span className="shrink-0 pt-0.5 text-[11px] font-medium text-dls-secondary">
          {logs.length ? `${logs.length} recent` : "No runs yet"}
        </span>
      </div>

      <div className="mt-3 grid gap-1">
        {isLoading ? (
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">Loading task logs...</div>
        ) : error ? (
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">{error}</div>
        ) : logs.length ? (
          logs.slice(0, 5).map((log) => (
            <div key={log.id} className="grid gap-1 rounded-md px-2.5 py-2.5">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-dls-text">{taskTitle(log)}</span>
                <span className="shrink-0 text-[11px] text-dls-secondary">{formatTaskTime(log.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-dls-secondary">
                <span>{formatTaskDesk(log.deskId)}</span>
                <span>{getTaskLogStatusLabel(log)}</span>
                {log.waitingCount ? <span>{log.waitingCount} waiting</span> : null}
                <span>{formatTaskSource(log.source)}</span>
              </div>
              {log.outputBasePath ? (
                <div className="truncate rounded-md bg-dls-surface px-2 py-1 font-mono text-[10px] leading-4 text-dls-secondary">
                  {log.outputBasePath}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">Tracked workflow tasks will appear here when they start, wait, or finish.</div>
        )}
      </div>
    </section>
  );
}

export function GeneralSettingsView(props: GeneralSettingsViewProps) {
  const projectSurfaceActions: Record<ProjectSurfaceSection, () => void> = {
    memory: props.onOpenMemoryReview,
    notes: props.onOpenNotes,
    outputs: props.onOpenOutputs,
    feedback: props.onSendFeedback,
  };

  return (
    <div className="@container/settings-general w-full max-w-4xl space-y-6">
      {/* Workspace settings */}
      <section className={SETTINGS_HUB_SECTION_CLASS}>
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Workspace</div>
        <div className={SETTINGS_HUB_GRID_CLASS}>
          {workspaceCards
            .filter((card) => isSettingsTabVisibleAtLaunch(card.tab))
            .filter((card) => props.developerMode || !card.developerOnly)
            .map((card) => {
              const liveStatus = getSettingsTabStatus(card.tab, props.backendSettingsSections);
              return (
                <SettingsCard
                  key={card.tab}
                  icon={card.icon}
                  title={card.title}
                  desc={card.desc}
                  status={liveStatus ?? card.status}
                  onClick={() => props.onNavigateTab(card.tab)}
                />
              );
            })}
        </div>
      </section>

      {/* Global settings */}
      <section className={SETTINGS_HUB_SECTION_CLASS}>
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Global</div>
        <div className={SETTINGS_HUB_GRID_CLASS}>
          {globalCards
            .filter((card) => isSettingsTabVisibleAtLaunch(card.tab))
            .filter((card) => props.developerMode || !card.developerOnly)
            .map((card) => {
              const liveStatus = getSettingsTabStatus(card.tab, props.backendSettingsSections);
              return (
                <SettingsCard
                  key={card.tab}
                  icon={card.icon}
                  title={card.title}
                  desc={card.desc}
                  status={liveStatus ?? card.status}
                  onClick={() => props.onNavigateTab(card.tab)}
                />
              );
            })}
        </div>
      </section>

      {/* Project surfaces */}
      <section className={SETTINGS_HUB_SECTION_CLASS}>
        <div className="px-2 pb-1 text-sm font-semibold text-dls-text">Project surfaces</div>
        <p className="px-2 pb-2 text-[12px] leading-5 text-dls-secondary">
          Open the workspace evidence surfaces with live backend status.
        </p>
        <div className={SETTINGS_HUB_GRID_CLASS}>
          {projectSurfaceCards.map((card) => (
            <ProjectSurfaceRow
              key={card.section}
              icon={card.icon}
              title={card.title}
              desc={card.desc}
              status={getSectionStatus(card.section, props.backendSettingsSections)}
              actionLabel={card.actionLabel}
              requiresWorkspace={card.section !== "feedback"}
              workspaceReady={Boolean(props.runtimeWorkspaceId)}
              workspaceResolutionPending={props.workspaceResolutionPending}
              onClick={projectSurfaceActions[card.section]}
            />
          ))}
        </div>
      </section>

      <TaskLogsSection
        workspaceId={props.runtimeWorkspaceId}
        matterhornServerClient={props.matterhornServerClient}
      />

      {/* Feedback */}
      <section className="rounded-lg bg-dls-surface-muted/[0.08] p-4">
        <div className="flex flex-col gap-3 @lg/settings-general:flex-row @lg/settings-general:items-end @lg/settings-general:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LifeBuoy size={14} className="text-dls-secondary" />
              <div className="text-[13px] font-medium text-dls-text">{t("settings.feedback_title")}</div>
            </div>
            <div className="mt-1 max-w-[58ch] text-[12px] leading-5 text-dls-secondary">{t("settings.feedback_desc")}</div>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 @lg/settings-general:w-auto @lg/settings-general:shrink-0">
            <button
              type="button"
              className={FEEDBACK_ACTION_CLASS}
              onClick={props.onSendFeedback}
            >
              {t("settings.send_feedback")}
              <ArrowUpRight size={11} />
            </button>
            <button
              type="button"
              className={FEEDBACK_ACTION_CLASS}
              onClick={props.onJoinDiscord}
            >
              {t("settings.join_discord")}
              <ArrowUpRight size={11} />
            </button>
            <button
              type="button"
              className={FEEDBACK_ACTION_CLASS}
              onClick={props.onReportIssue}
            >
              {t("settings.report_issue")}
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
