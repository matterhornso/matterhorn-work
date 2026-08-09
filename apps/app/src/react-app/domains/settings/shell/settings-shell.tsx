/** @jsxImportSource react */
import type * as React from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { t } from "../../../../i18n";
import type { SettingsTab } from "../../../../app/types";
import type { MatterhornSettingsSectionCapability } from "@matterhorn-work/types/backend-capabilities";
import {
  SettingsPage,
  SettingsSidebar,
  getCloudSettingsTabs,
  getGlobalSettingsTabs,
  getSettingsTabIcon,
  getSettingsTabLabel,
  getSettingsTabStatus,
  getWorkspaceSettingsTabs,
  settingsReadinessStatusLabel,
  shouldDisplaySettingsReadinessStatus,
} from "./settings-page";

type SettingsPageFrameProps = Omit<React.ComponentProps<typeof SettingsPage>, "children">;

export type SettingsShellProps = SettingsPageFrameProps & {
  selectedWorkspaceId: string;
  selectedWorkspaceName: string;
  selectedWorkspaceColor: string;
  workspaces: Array<{ id: string; name: string; color: string }>;
  headerStatus?: string;
  busyHint?: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onClose: () => void;
  headerLeadingSlot?: React.ReactNode;
  children: React.ReactNode;
  error?: string | null;
  errorSlot?: React.ReactNode;
  modalSlot?: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
  hideWorkspaceSwitcher?: boolean;
  backendSettingsSections?: MatterhornSettingsSectionCapability[] | null;
};

export function SettingsShell(props: SettingsShellProps) {
  const title = props.compact && props.activeTab === "cloud-account"
    ? "Profile"
    : getSettingsTabLabel(props.activeTab);

  if (props.compact) {
    const ActiveIcon = getSettingsTabIcon(props.activeTab);
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-dls-background">
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-3 shadow-[0_1px_0_rgb(var(--matterhorn-blue-rgb)/0.08)] mac:titlebar-drag">
          <div className="flex min-w-0 items-center gap-2 mac:titlebar-no-drag">
            <ActiveIcon className="size-4 shrink-0 text-dls-secondary" />
            <span className="truncate text-sm font-semibold text-dls-text">{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 mac:titlebar-no-drag">
            <SettingsSectionMenu
              activeTab={props.activeTab}
              developerMode={props.developerMode}
              onSelectTab={props.onSelectTab}
              backendSettingsSections={props.backendSettingsSections}
              compact
            />
            <Button
              variant="ghost"
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-gray-10 transition-colors hover:bg-gray-2/70 hover:text-dls-text"
              onClick={props.onClose}
              title={t("dashboard.close_settings")}
              aria-label={t("dashboard.close_settings")}
            >
              <X size={17} />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <SettingsPage {...props} showPanelHeading={false}>{props.children}</SettingsPage>

            {props.error ? (
              <div className="mx-auto w-full max-w-3xl px-4 pb-6">
                <div className="flex flex-col gap-y-3 rounded-lg border border-red-7/20 bg-red-1/40 px-5 py-4 text-sm text-red-12">
                  <div>{props.error}</div>
                  {props.errorSlot}
                </div>
              </div>
            ) : null}

            {props.modalSlot}
          </div>

          {props.footer}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden">
      <SidebarProvider open={true} className="relative min-h-0 flex-1">
        <SettingsSidebar
          activeTab={props.activeTab}
          onSelectTab={props.onSelectTab}
          developerMode={props.developerMode}
          onClose={props.onClose}
          selectedWorkspaceId={props.selectedWorkspaceId}
          selectedWorkspaceName={props.selectedWorkspaceName}
          selectedWorkspaceColor={props.selectedWorkspaceColor}
          workspaces={props.workspaces}
          onSelectWorkspace={props.onSelectWorkspace}
          hideWorkspaceSwitcher={props.hideWorkspaceSwitcher}
          backendSettingsSections={props.backendSettingsSections}
        />
        <SidebarInset className="min-h-0 overflow-hidden bg-background mac:bg-background/80 mac:[&_header]:transition-[padding-left] mac:[&_header]:duration-200 mac:[&_header]:ease-linear mac:peer-data-[state=collapsed]:[&_header]:pl-16 [&_header]:pl-16 md:[&_header]:pl-6">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-[calc(2.75rem+env(safe-area-inset-top))] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] md:hidden mac:titlebar-drag">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="size-11 mac:titlebar-no-drag md:hidden" />
                {props.headerLeadingSlot}
                <h1 className="truncate text-xs font-medium text-dls-secondary">{title}</h1>
                {props.developerMode && props.headerStatus ? (
                  <span className="hidden text-[12px] font-medium text-dls-text lg:inline">
                    {props.headerStatus}
                  </span>
                ) : null}
                {props.busyHint ? (
                  <span className="hidden text-[12px] font-medium text-dls-text lg:inline">
                    {props.busyHint}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center text-gray-10 mac:titlebar-no-drag md:hidden">
                <Button
                  variant="ghost"
                  type="button"
                  className="flex size-11 items-center justify-center rounded-md text-gray-10 transition-colors hover:bg-gray-2/70 hover:text-dls-text"
                  onClick={props.onClose}
                  title={t("dashboard.close_settings")}
                  aria-label={t("dashboard.close_settings")}
                >
                  <X size={18} />
                </Button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
              <SettingsPage {...props}>{props.children}</SettingsPage>

              {props.error ? (
                <div className="mx-auto max-w-5xl px-6 pb-24 md:px-10 md:pb-10">
                  <div className="flex flex-col gap-y-3 rounded-lg border border-red-7/20 bg-red-1/40 px-5 py-4 text-sm text-red-12">
                    <div>{props.error}</div>
                    {props.errorSlot}
                  </div>
                </div>
              ) : null}

              {props.modalSlot}
            </div>

            {props.footer}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function SettingsSectionMenu(
  props: Pick<SettingsPageFrameProps, "activeTab" | "developerMode" | "onSelectTab"> & {
    compact?: boolean;
    backendSettingsSections?: MatterhornSettingsSectionCapability[] | null;
  },
) {
  const allSections: Array<{ label: string | null; tabs: SettingsTab[] }> = [
    { label: null, tabs: ["general"] },
    { label: t("settings.group_workspace"), tabs: getWorkspaceSettingsTabs(props.developerMode) },
    { label: t("settings.group_global"), tabs: getGlobalSettingsTabs(props.developerMode) },
    { label: t("settings.group_cloud"), tabs: getCloudSettingsTabs(props.developerMode) },
  ];
  const sections = allSections.filter((section) => section.tabs.length > 0);
  const ActiveIcon = getSettingsTabIcon(props.activeTab);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            variant={props.compact ? "ghost" : "outline"}
            size="sm"
            className={props.compact
              ? "size-8 justify-center rounded-md p-0 text-gray-10 hover:bg-gray-2/70 hover:text-dls-text"
              : "min-w-0 max-w-46 justify-start gap-2"
            }
            title={props.compact ? "Switch settings section" : undefined}
            aria-label={props.compact ? "Switch settings section" : undefined}
          >
            <ActiveIcon className="size-4 shrink-0" />
            <span className={props.compact ? "sr-only" : "truncate"}>{getSettingsTabLabel(props.activeTab)}</span>
            <ChevronDown className={props.compact ? "size-3.5 shrink-0" : "ml-auto size-4 shrink-0"} />
          </Button>
        )}
      />
      <DropdownMenuContent className="w-64">
        {sections.map((section, index) => (
          <DropdownMenuGroup key={section.label ?? "root"}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {section.label ? <DropdownMenuLabel>{section.label}</DropdownMenuLabel> : null}
            {section.tabs.map((tab) => {
              const Icon = getSettingsTabIcon(tab);
              const status = getSettingsTabStatus(tab, props.backendSettingsSections);
              return (
                <DropdownMenuItem
                  key={tab}
                  onClick={() => props.onSelectTab(tab)}
                  className={props.activeTab === tab ? "bg-foreground/10 text-accent-foreground" : undefined}
                >
                  <Icon />
                  <span>{getSettingsTabLabel(tab)}</span>
                  {shouldDisplaySettingsReadinessStatus(status) && status ? (
                    <span className="ml-auto text-[10px] font-medium tracking-normal text-amber-300/85">
                      {settingsReadinessStatusLabel(status)}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
