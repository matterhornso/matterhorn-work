/** @jsxImportSource react */
import type * as React from "react";
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  CloudCog,
  Cog,
  Container,
  FolderLock,
  Layout,
  Paintbrush,
  Puzzle,
  Bot,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Terminal,
  UserCircle,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "../../../../i18n";
import type { SettingsTab } from "../../../../app/types";
import {
  SettingsContent,
  SettingsPanel,
  SettingsPanelDescription,
  SettingsPanelHeading,
  SettingsPanelTitle,
  SettingsPanelToolbar,
  SettingsPanelToolbarActions,
  SettingsPanelToolbarButton,
  SettingsPanelToolbarMessage,
  SettingsPanelToolbarStatus,
} from "./panel";
import { WorkspaceIcon } from "../../../design-system/workspace-icon";

export function getSettingsTabIcon(tab: SettingsTab) {
  switch (tab) {
    case "overview":
      return Sparkles;
    case "ai":
      return Zap;
    case "preferences":
      return SlidersHorizontal;
    case "shell":
      return Layout;
    case "permissions":
      return FolderLock;
    case "cloud-account":
      return UserCircle;
    case "cloud-marketplaces":
      return Store;
    case "cloud-workers":
      return Container;
    case "cloud-providers":
      return CloudCog;
    case "skills":
      return Sparkles;
    case "extensions":
      return Puzzle;
    case "environment":
      return Terminal;
    case "advanced":
      return Wrench;
    case "appearance":
      return Paintbrush;
    case "updates":
      return RefreshCcw;
    case "recovery":
      return ShieldCheck;
    case "debug":
      return Bug;
    case "wallet":
      return Wallet;
    case "marketplace":
      return Bot;
    default:
      return Cog;
  }
}

export function getSettingsTabLabel(tab: SettingsTab) {
  switch (tab) {
    case "overview":
      return "Overview";
    case "ai":
      return "AI Providers";
    case "preferences":
      return "Preferences";
    case "shell":
      return "Customization";
    case "permissions":
      return "Permissions";
    case "cloud-account":
      return t("settings.tab_cloud_account");
    case "cloud-marketplaces":
      return t("settings.tab_cloud_marketplaces");
    case "cloud-workers":
      return t("settings.tab_cloud_workers");
    case "cloud-providers":
      return t("settings.tab_cloud_providers");
    case "skills":
      return t("settings.tab_skills");
    case "extensions":
      return t("settings.tab_extensions");
    case "environment":
      return t("settings.tab_environment");
    case "advanced":
      return t("settings.tab_advanced");
    case "appearance":
      return t("settings.tab_appearance");
    case "updates":
      return t("settings.tab_updates");
    case "recovery":
      return t("settings.tab_recovery");
    case "debug":
      return t("settings.tab_debug");
    case "wallet":
      return "Wallet";
    case "marketplace":
      return "Agent Templates";
    case "general":
      return "Settings";
    default:
      return t("settings.tab_general");
  }
}

export function getSettingsTabDescription(tab: SettingsTab) {
  switch (tab) {
    case "overview":
      return "Profile, appearance, safety, protocols, and diagnostics";
    case "ai":
      return "Connect services that provide AI models";
    case "preferences":
      return "Default model, reasoning, and compaction";
    case "shell":
      return "Branding, visibility, and shell controls";
    case "permissions":
      return "Authorized folders and file access";
    case "cloud-account":
      return t("settings.tab_description_cloud_account");
    case "cloud-marketplaces":
      return t("settings.tab_description_cloud_marketplaces");
    case "cloud-workers":
      return t("settings.tab_description_cloud_workers");
    case "cloud-providers":
      return t("settings.tab_description_cloud_providers");
    case "skills":
      return t("settings.tab_description_skills");
    case "extensions":
      return t("settings.tab_description_extensions");
    case "environment":
      return t("settings.tab_description_environment");
    case "advanced":
      return t("settings.tab_description_advanced");
    case "appearance":
      return t("settings.tab_description_appearance");
    case "updates":
      return t("settings.tab_description_updates");
    case "recovery":
      return t("settings.tab_description_recovery");
    case "debug":
      return t("settings.tab_description_debug");
    case "wallet":
      return "Connect a wallet for external-signing workflows.";
    case "marketplace":
      return "Preview future agent templates. Hiring and deployment are not live.";
    case "general":
      return "Overview of all settings";
    default:
      return t("settings.tab_description_general");
  }
}

export type SettingsReadinessStatus = "Ready" | "Needs setup" | "Preview" | "Desktop only" | "Cloud only";

export function getSettingsTabStatus(tab: SettingsTab): SettingsReadinessStatus | null {
  switch (tab) {
    case "preferences":
    case "permissions":
    case "appearance":
    case "extensions":
      return "Ready";
    case "wallet":
    case "ai":
    case "cloud-account":
      return "Needs setup";
    case "shell":
    case "marketplace":
    case "recovery":
      return "Preview";
    case "updates":
      return "Desktop only";
    case "cloud-workers":
      return "Cloud only";
    case "environment":
    case "debug":
      return "Preview";
    case "advanced":
      return "Desktop only";
    default:
      return null;
  }
}

export function getWorkspaceSettingsTabs(developerMode = false): SettingsTab[] {
  const tabs: SettingsTab[] = ["preferences", "permissions", "wallet", "extensions", "advanced"];
  if (developerMode) tabs.splice(4, 0, "marketplace");
  return tabs;
}

export function getGlobalSettingsTabs(developerMode: boolean): SettingsTab[] {
  const tabs: SettingsTab[] = ["overview", "ai", "shell", "appearance", "updates"];
  if (developerMode) tabs.push("environment", "recovery", "debug");
  return tabs;
}

export function getCloudSettingsTabs(developerMode = false): SettingsTab[] {
  return developerMode ? ["cloud-account", "cloud-workers"] : ["cloud-account"];
}

function SettingsTabReadinessBadge(props: { status: SettingsReadinessStatus | null }) {
  if (!props.status) return null;

  const tone =
    props.status === "Ready"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : props.status === "Needs setup"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : props.status === "Preview"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300";

  return (
    <span className={`ml-auto hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] xl:inline-flex ${tone}`}>
      {props.status}
    </span>
  );
}

type SettingsPageProps = {
  activeTab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  developerMode: boolean;
  showUpdateToolbar?: boolean;
  updateToolbarTone?: string;
  updateToolbarTitle?: string;
  updateToolbarSpinning?: boolean;
  updateToolbarLabel?: string;
  updateToolbarActionLabel?: string | null;
  updateToolbarDisabled?: boolean;
  updateRestartBlockedMessage?: string | null;
  onUpdateToolbarAction?: () => void;
  children: React.ReactNode;
};

type SettingsSidebarProps = Pick<SettingsPageProps, "activeTab" | "onSelectTab" | "developerMode"> & {
  onClose: () => void;
  selectedWorkspaceId: string;
  selectedWorkspaceName: string;
  selectedWorkspaceColor: string;
  workspaces: Array<{ id: string; name: string; color: string }>;
  onSelectWorkspace: (workspaceId: string) => void;
  hideWorkspaceSwitcher?: boolean;
};

export function SettingsSidebar(props: SettingsSidebarProps) {
  const workspaceTabs = getWorkspaceSettingsTabs(props.developerMode);
  const globalTabs = getGlobalSettingsTabs(props.developerMode);
  const cloudTabs = getCloudSettingsTabs(props.developerMode);

  return (
    <Sidebar className="mac:**:data-[sidebar=sidebar]:bg-transparent">
      <div className="hidden h-10 mac:block mac:titlebar-drag" />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton type="button" onClick={props.onClose}>
              <ArrowLeft size={14} />
              <span>{t("dashboard.back_to_app")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!props.hideWorkspaceSwitcher ? (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton type="button">
                      <WorkspaceIcon seed={props.selectedWorkspaceName} sizeClass="size-4" />
                      <span className="truncate">{props.selectedWorkspaceName}</span>
                      <ChevronDown className="ml-auto" />
                    </SidebarMenuButton>
                  }
                />
                <DropdownMenuContent className="w-(--anchor-width)">
                  {props.workspaces.map((workspace) => (
                    <DropdownMenuItem
                      key={workspace.id}
                      onClick={() => props.onSelectWorkspace(workspace.id)}
                      disabled={workspace.id === props.selectedWorkspaceId}
                    >
                      <WorkspaceIcon seed={workspace.name} sizeClass="size-4" />
                      <span className="truncate">{workspace.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Top-level hub entry */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  isActive={props.activeTab === "general"}
                  onClick={() => props.onSelectTab("general")}
                >
                  <Cog />
                  <span>{getSettingsTabLabel("general")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.group_workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceTabs.map((tab) => {
                const Icon = getSettingsTabIcon(tab);
                return (
                  <SidebarMenuItem key={tab}>
                    <SidebarMenuButton
                      type="button"
                      isActive={props.activeTab === tab}
                      onClick={() => props.onSelectTab(tab)}
                    >
                      <Icon />
                      <span>{getSettingsTabLabel(tab)}</span>
                      <SettingsTabReadinessBadge status={getSettingsTabStatus(tab)} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.group_global")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalTabs.map((tab) => {
                const Icon = getSettingsTabIcon(tab);
                return (
                  <SidebarMenuItem key={tab}>
                    <SidebarMenuButton
                      type="button"
                      isActive={props.activeTab === tab}
                      onClick={() => props.onSelectTab(tab)}
                    >
                      <Icon />
                      <span>{getSettingsTabLabel(tab)}</span>
                      <SettingsTabReadinessBadge status={getSettingsTabStatus(tab)} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.group_cloud")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {cloudTabs.map((tab) => {
                const Icon = getSettingsTabIcon(tab);
                return (
                  <SidebarMenuItem key={tab}>
                    <SidebarMenuButton
                      type="button"
                      isActive={props.activeTab === tab}
                      onClick={() => props.onSelectTab(tab)}
                    >
                      <Icon />
                      <span>{getSettingsTabLabel(tab)}</span>
                      <SettingsTabReadinessBadge status={getSettingsTabStatus(tab)} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <SettingsContent>
      <SettingsPanel>
        <SettingsPanelHeading>
          <SettingsPanelTitle>{getSettingsTabLabel(props.activeTab)}</SettingsPanelTitle>
          <SettingsPanelDescription>{getSettingsTabDescription(props.activeTab)}</SettingsPanelDescription>
        </SettingsPanelHeading>

        {props.showUpdateToolbar && props.activeTab === "general" ? (
          <SettingsPanelToolbar>
            <SettingsPanelToolbarActions>
              <SettingsPanelToolbarStatus
                tone={props.updateToolbarTone}
                title={props.updateToolbarTitle}
                spinning={props.updateToolbarSpinning}
              >
                {props.updateToolbarLabel}
              </SettingsPanelToolbarStatus>
              {props.updateToolbarActionLabel ? (
                <SettingsPanelToolbarButton
                  onClick={props.onUpdateToolbarAction}
                  disabled={props.updateToolbarDisabled}
                  title={props.updateRestartBlockedMessage ?? ""}
                >
                  {props.updateToolbarActionLabel}
                </SettingsPanelToolbarButton>
              ) : null}
            </SettingsPanelToolbarActions>
            {props.updateRestartBlockedMessage ? (
              <SettingsPanelToolbarMessage>{props.updateRestartBlockedMessage}</SettingsPanelToolbarMessage>
            ) : null}
          </SettingsPanelToolbar>
        ) : null}
      </SettingsPanel>

      {props.children}
    </SettingsContent>
  );
}
