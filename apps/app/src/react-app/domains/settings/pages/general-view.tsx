/** @jsxImportSource react */
import {
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Cog,
  FolderLock,
  LifeBuoy,
  MessageCircle,
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
import { Button } from "@/components/ui/button";

export type GeneralSettingsViewProps = {
  onNavigateTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  onSendFeedback: () => void;
  onJoinDiscord: () => void;
  onReportIssue: () => void;
};

type SettingsHubCard = {
  tab: SettingsTab;
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: "Ready" | "Needs setup" | "Preview" | "Desktop only" | "Cloud only" | "Developer";
  developerOnly?: boolean;
};

const workspaceCards: SettingsHubCard[] = [
  { tab: "preferences", icon: Cog, title: "Preferences", desc: "Default model, reasoning, and compaction.", status: "Ready" },
  { tab: "permissions", icon: FolderLock, title: "Permissions", desc: "Authorized folders and file access.", status: "Ready" },
  { tab: "extensions", icon: Puzzle, title: "MCPs & Tools", desc: "MCP servers, protocol tools, connectors, and plugins.", status: "Ready" },
  { tab: "advanced", icon: Wrench, title: "Advanced", desc: "Runtime, engine, and developer options.", status: "Developer", developerOnly: true },
];

const globalCards: SettingsHubCard[] = [
  { tab: "ai", icon: Sparkles, title: "AI Providers", desc: "Connect services that provide AI models.", status: "Needs setup" },
  { tab: "cloud-account", icon: Cloud, title: "Matterhorn Cloud", desc: "Account, sign-in, and organization.", status: "Needs setup" },
  { tab: "appearance", icon: Paintbrush, title: "Appearance", desc: "Theme, font size, and display.", status: "Ready" },
  { tab: "updates", icon: RefreshCcw, title: "Updates", desc: "App version and update channel.", status: "Desktop only" },
  { tab: "cloud-workers", icon: Cloud, title: "Cloud Workers Preview", desc: "Cloud-only worker instances after Matterhorn Cloud sign-in.", status: "Cloud only", developerOnly: true },
  { tab: "environment", icon: Terminal, title: "Environment", desc: "Local runtime variables. Requires server token.", status: "Developer", developerOnly: true },
  { tab: "recovery", icon: ShieldCheck, title: "Recovery", desc: "Disabled reset/repair diagnostics preview.", status: "Preview", developerOnly: true },
];

function SettingsCard(props: {
  icon: typeof Sparkles;
  title: string;
  desc: string;
  status: SettingsHubCard["status"];
  onClick: () => void;
}) {
  const statusClass =
    props.status === "Ready"
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
        <div className="text-[11px] text-dls-secondary">{props.desc}</div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-dls-secondary" />
    </button>
  );
}

export function GeneralSettingsView(props: GeneralSettingsViewProps) {
  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Workspace settings */}
      <section className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Workspace</div>
        <div className="grid gap-1 md:grid-cols-2">
          {workspaceCards
            .filter((card) => props.developerMode || !card.developerOnly)
            .map((card) => (
              <SettingsCard
                key={card.tab}
                icon={card.icon}
                title={card.title}
                desc={card.desc}
                status={card.status}
                onClick={() => props.onNavigateTab(card.tab)}
              />
            ))}
        </div>
      </section>

      {/* Global settings */}
      <section className="rounded-xl bg-dls-surface/70 p-3 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="px-2 pb-2 text-sm font-semibold text-dls-text">Global</div>
        <div className="grid gap-1 md:grid-cols-2">
          {globalCards
            .filter((card) => props.developerMode || !card.developerOnly)
            .map((card) => (
              <SettingsCard
                key={card.tab}
                icon={card.icon}
                title={card.title}
                desc={card.desc}
                status={card.status}
                onClick={() => props.onNavigateTab(card.tab)}
              />
            ))}
        </div>
      </section>

      {/* Feedback */}
      <section className="rounded-xl bg-dls-surface/70 p-4 shadow-[0_8px_28px_-24px_rgba(0,0,0,0.55)] ring-1 ring-dls-border/35">
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy size={14} className="text-dls-secondary" />
              <div className="text-[13px] font-medium text-dls-text">{t("settings.feedback_title")}</div>
            </div>
            <div className="mt-1 max-w-[58ch] text-[11px] leading-5 text-dls-secondary">{t("settings.feedback_desc")}</div>
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
