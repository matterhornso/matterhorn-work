/** @jsxImportSource react */
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Cloud,
  Cog,
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
} from "lucide-react";

import { t } from "../../../../i18n";
import type { SettingsTab } from "../../../../app/types";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import type {
  MatterhornCapabilityStatus,
  MatterhornSettingsSectionCapability,
} from "@matterhorn-work/types/backend-capabilities";
import { Button } from "@/components/ui/button";
import { getSessionActivityStatusLabel, type SessionActivityStatus } from "../../session/status/session-activity-store";
import { useWorkflowTaskLog, type TaskLogSource } from "./use-workflow-task-log";
import {
  getSettingsTabStatus,
  type SettingsReadinessStatus,
} from "../shell/settings-page";

export type GeneralSettingsViewProps = {
  onNavigateTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  runtimeWorkspaceId?: string;
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
type ProjectSurfaceStatus = SettingsReadinessStatus | "Unavailable";

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
  { tab: "generated-media", icon: ImageIcon, title: "Generated media", desc: "Image and NFT publishing readiness.", status: "Needs setup" },
  { tab: "extensions", icon: Puzzle, title: "MCPs & Tools", desc: "MCP servers and connectors.", status: "Working" },
  { tab: "advanced", icon: Wrench, title: "Advanced", desc: "Runtime and developer options.", status: "Developer", developerOnly: true },
];

const globalCards: SettingsHubCard[] = [
  { tab: "ai", icon: Sparkles, title: "AI Providers", desc: "Connect model providers.", status: "Needs setup" },
  { tab: "cloud-account", icon: Cloud, title: "Matterhorn Cloud", desc: "Account and organization.", status: "Needs setup" },
  { tab: "appearance", icon: Paintbrush, title: "Appearance", desc: "Theme and text size.", status: "Working" },
  { tab: "updates", icon: RefreshCcw, title: "Updates", desc: "Version and update channel.", status: "Desktop only" },
  { tab: "cloud-workers", icon: Cloud, title: "Cloud Workers Preview", desc: "Cloud worker instances.", status: "Cloud only", developerOnly: true },
  { tab: "environment", icon: Terminal, title: "Environment", desc: "Local runtime variables.", status: "Developer", developerOnly: true },
  { tab: "recovery", icon: ShieldCheck, title: "Recovery", desc: "Reset and repair diagnostics.", status: "Preview", developerOnly: true },
];

const projectSurfaceCards: ProjectSurfaceCard[] = [
  {
    section: "memory",
    icon: BrainCircuit,
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

function capabilityStatusToSettingsStatus(status: MatterhornCapabilityStatus): SettingsReadinessStatus {
  if (status === "working") return "Working";
  if (status === "needs_setup") return "Needs setup";
  if (status === "preview") return "Preview";
  return "Not supported here";
}

function getSectionStatus(
  sectionId: ProjectSurfaceSection,
  sections?: MatterhornSettingsSectionCapability[] | null,
) {
  if (!sections?.length) return "Unavailable";
  const section = sections?.find((item) => item.section === sectionId);
  return section ? capabilityStatusToSettingsStatus(section.status) : "Not supported here";
}

function SettingsCard(props: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: SettingsHubCard["status"];
  onClick: () => void;
}) {
  const statusClass =
    props.status === "Working"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : props.status === "Needs setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : props.status === "Preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : props.status === "Developer"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-dls-hover/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.34)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text transition-colors group-hover:bg-[rgba(var(--dls-accent-rgb),0.18)]">
        <props.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 truncate text-[13px] font-medium text-dls-text">{props.title}</div>
          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-medium tracking-normal ${statusClass}`}>
            {props.status}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-dls-text">{props.desc}</div>
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
  onClick: () => void;
}) {
  const statusClass =
    props.status === "Working"
      ? "text-emerald-300"
      : props.status === "Needs setup"
        ? "text-sky-300"
        : props.status === "Preview"
          ? "text-amber-300"
          : props.status === "Unavailable"
            ? "text-red-300"
          : "text-dls-secondary";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-dls-hover/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.34)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dls-hover/55 text-dls-text transition-colors group-hover:bg-dls-hover">
        <props.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 truncate text-[13px] font-medium text-dls-text">{props.title}</div>
          <span className={`shrink-0 text-[11px] font-medium ${statusClass}`}>{props.status}</span>
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-dls-secondary">{props.desc}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-dls-accent">
        <span>{props.actionLabel}</span>
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
    <section className="rounded-xl bg-dls-surface/70 p-4 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--dls-accent-rgb),0.12)] text-dls-text">
            <ListChecks size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-dls-text">Task Logs</div>
            <p className="mt-0.5 text-[12px] leading-5 text-dls-text">Recent desk runs, outputs, and wait states.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-dls-border/55 px-2 py-0.5 text-[11px] font-medium text-dls-secondary">
          {logs.length}
        </span>
      </div>

      <div className="mt-3 divide-y divide-dls-border/45">
        {isLoading ? (
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">Loading task logs...</div>
        ) : error ? (
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">{error}</div>
        ) : logs.length ? (
          logs.slice(0, 5).map((log) => (
            <div key={log.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-dls-text">{taskTitle(log)}</span>
                <span className="shrink-0 text-[11px] text-dls-secondary">{formatTaskTime(log.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-dls-secondary">
                <span>{formatTaskDesk(log.deskId)}</span>
                <span>{getSessionActivityStatusLabel(log.status as SessionActivityStatus)}</span>
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
          <div className="py-3 text-[12px] leading-5 text-dls-secondary">Desk tasks will appear here when they start, wait, finish, or save outputs.</div>
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
    <div className="w-full max-w-4xl space-y-6">
      {/* Workspace settings */}
      <section className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Workspace</div>
        <div className="grid gap-1 md:grid-cols-2">
          {workspaceCards
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
      <section className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Global</div>
        <div className="grid gap-1 md:grid-cols-2">
          {globalCards
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
      <section className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="px-2 pb-1 text-sm font-semibold text-dls-text">Project surfaces</div>
        <p className="px-2 pb-2 text-[12px] leading-5 text-dls-secondary">
          Open the workspace evidence surfaces with live backend status.
        </p>
        <div className="grid gap-1 md:grid-cols-2">
          {projectSurfaceCards.map((card) => (
            <ProjectSurfaceRow
              key={card.section}
              icon={card.icon}
              title={card.title}
              desc={card.desc}
              status={getSectionStatus(card.section, props.backendSettingsSections)}
              actionLabel={card.actionLabel}
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
      <section className="rounded-xl bg-dls-surface/70 p-4 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy size={14} className="text-dls-text" />
              <div className="text-[13px] font-medium text-dls-text">{t("settings.feedback_title")}</div>
            </div>
            <div className="mt-1 max-w-[58ch] text-[12px] leading-5 text-dls-text">{t("settings.feedback_desc")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={props.onSendFeedback}
            >
              <MessageCircle size={12} />
              {t("settings.send_feedback")}
              <ArrowUpRight size={11} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onJoinDiscord}
            >
              {t("settings.join_discord")}
              <ArrowUpRight size={11} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onReportIssue}
            >
              {t("settings.report_issue")}
              <ArrowUpRight size={11} />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
