/** @jsxImportSource react */
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { t } from "@/i18n";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogTitle,
  CommandEmpty,
  CommandFooter,
  CommandHeader,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, Copy, FileText, FolderOpen, Home, MessageSquarePlus, NotebookPen, PencilLine, Plus, Globe } from "lucide-react";

export type PaletteItem = {
  id: string;
  title: string;
  detail?: string;
  meta?: string;
  icon?: ReactNode;
  searchText?: string;
  action: () => void;
};

export type AccessibleTargetOption = {
  id: string;
  kind: "url" | "file";
  value: string;
  name: string;
  preview: string;
};

type PaletteMode = "root" | "sessions" | "accessible-items";

export type SessionOption = {
  workspaceId: string;
  sessionId: string;
  title: string;
  workspaceTitle: string;
  updatedAt: number;
  searchText: string;
  isActive: boolean;
};

function targetIcon(target: AccessibleTargetOption) {
  if (target.kind === "url") return <Globe className="size-4 text-primary" />;
  if (target.preview === "sheet") {
    return (
      <span className="inline-flex h-4 min-w-6 shrink-0 items-center justify-center rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-0.5 text-[7px] font-bold leading-none text-emerald-700">
        XLS
      </span>
    );
  }
  if (target.preview === "markdown") {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-primary/25 bg-primary/10 text-[8px] font-bold leading-none text-primary">
        MD
      </span>
    );
  }
  return <FileText className="size-4 text-primary" />;
}

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  /** Called when "Go home" is chosen. */
  onGoHome?: () => void;
  /** Called when "New project" is chosen. */
  onCreateNewProject?: () => void;
  /** Called when a session row is chosen. */
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  /** Called when "New session" is chosen. */
  onCreateNewSession: () => void;
  /** Called when "Open settings" is chosen. Accepts an optional route to jump straight to a tab. */
  onOpenSettings: (route?: string) => void;
  onOpenNotes?: () => void;
  onQuickJot?: () => void;
  notesEnabled?: boolean;
  workspaceReady?: boolean;
  onSendFeedback?: () => void;
  /** Optional — open a URL in the user's browser. Falls back to window.open. */
  onOpenUrl?: (url: string) => void;
  /** Optional: current session servers/artifacts exposed through Cmd/Ctrl+K. */
  accessibleTargets?: AccessibleTargetOption[];
  onOpenAccessibleTarget?: (target: AccessibleTargetOption) => void;
  onHideAccessibleTarget?: (target: AccessibleTargetOption) => void;
  currentProjectName?: string;
  projectFolderPath?: string;
  outputsPath?: string;
  onOpenProjectFolder?: () => void;
  onOpenOutputs?: () => void;
  onCopyProjectPath?: () => void;
  onCopyOutputsPath?: () => void;
  /** Optional: sessions for the second mode. */
  sessions: SessionOption[];
};

/**
 * React command palette (Cmd/Ctrl+K).
 *
 * - Root mode: "New session", "Open settings", and a link into the Sessions submode.
 * - Sessions submode: fuzzy list of every session across workspaces.
 */
export function CommandPalette(props: CommandPaletteProps) {
  const [mode, setMode] = useState<PaletteMode>("root");
  const workspaceReady = props.workspaceReady ?? true;

  useEffect(() => {
    if (!props.open) {
      setMode("root");
    }
  }, [props.open]);

  const openUrl = (url: string) => {
    if (props.onOpenUrl) {
      props.onOpenUrl(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const accessibleTargetCount = props.accessibleTargets?.length ?? 0;

  const rootItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    if (props.onGoHome) {
      items.push({
        id: "go-home",
        title: "Go home",
        detail: props.currentProjectName ? `Open ${props.currentProjectName} home` : "Open the active project home",
        meta: "Project",
        icon: <Home className="size-4 text-primary" />,
        searchText: "home project launcher back",
        action: () => {
          props.onClose();
          props.onGoHome?.();
        },
      });
    }
    if (props.onCreateNewProject) {
      items.push({
        id: "new-project",
        title: "New project",
        detail: "Create or connect a Matterhorn project",
        meta: "Project",
        icon: <Plus className="size-4 text-primary" />,
        searchText: "new project create workspace",
        action: () => {
          props.onClose();
          props.onCreateNewProject?.();
        },
      });
    }
    items.push(
      {
        id: "new-session",
        title: "New chat",
        detail: workspaceReady
          ? t("session.cmd_new_session_detail")
          : t("session.cmd_new_session_workspace_required_detail"),
        meta: workspaceReady
          ? t("session.cmd_new_session_meta")
          : t("session.cmd_new_session_workspace_required_meta"),
        icon: <MessageSquarePlus className="size-4 text-primary" />,
        searchText: workspaceReady
          ? "new chat new session task"
          : "new chat workspace required create project",
        action: () => {
          props.onClose();
          if (workspaceReady) {
            props.onCreateNewSession();
            return;
          }
          props.onCreateNewProject?.();
        },
      },
      {
        id: "sessions",
        title: t("session.cmd_sessions_title"),
        detail: t("session.cmd_sessions_detail", undefined, {
          count: props.sessions.length.toLocaleString(),
        }),
        meta: t("session.cmd_sessions_meta"),
        action: () => {
          setMode("sessions");
        },
      },
    );
    if (props.projectFolderPath && props.onOpenProjectFolder) {
      items.push({
        id: "open-project-folder",
        title: "Open project folder",
        detail: props.projectFolderPath,
        meta: "Project",
        icon: <FolderOpen className="size-4 text-primary" />,
        searchText: `open reveal project folder finder ${props.projectFolderPath}`,
        action: () => {
          props.onClose();
          props.onOpenProjectFolder?.();
        },
      });
    }
    if (props.projectFolderPath && props.onCopyProjectPath) {
      items.push({
        id: "copy-project-path",
        title: "Copy project path",
        detail: props.projectFolderPath,
        meta: "Copy",
        icon: <Copy className="size-4 text-primary" />,
        searchText: `copy project folder path ${props.projectFolderPath}`,
        action: () => {
          props.onClose();
          props.onCopyProjectPath?.();
        },
      });
    }
    if (props.outputsPath && props.onOpenOutputs) {
      items.push({
        id: "open-outputs",
        title: "Open outputs",
        detail: props.outputsPath,
        meta: "Project",
        icon: <FolderOpen className="size-4 text-primary" />,
        searchText: `open outputs files ${props.outputsPath}`,
        action: () => {
          props.onClose();
          props.onOpenOutputs?.();
        },
      });
    }
    if (props.outputsPath && props.onCopyOutputsPath) {
      items.push({
        id: "copy-outputs-path",
        title: "Copy outputs path",
        detail: props.outputsPath,
        meta: "Copy",
        icon: <Copy className="size-4 text-primary" />,
        searchText: `copy outputs path ${props.outputsPath}`,
        action: () => {
          props.onClose();
          props.onCopyOutputsPath?.();
        },
      });
    }
    items.push(
      {
        id: "accessible-items",
        title: "Outputs & servers",
        detail: accessibleTargetCount > 0
          ? `Open ${accessibleTargetCount.toLocaleString()} outputs and servers detected in this session`
          : "No outputs or servers detected in this session yet",
        meta: "Session",
        action: () => {
          setMode("accessible-items");
        },
      },
      {
        id: "open-settings",
        title: t("settings.tab_general"),
        detail: t("settings.tab_description_general"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          props.onOpenSettings();
        },
      },
      ...(props.notesEnabled ? [{
        id: "open-notes",
        title: t("notes.cmd_notes_title"),
        detail: t("notes.cmd_notes_detail"),
        meta: t("notes.cmd_notes_meta"),
        icon: <NotebookPen className="size-4 text-primary" />,
        searchText: "notes project scratchpad jot",
        action: () => {
          props.onClose();
          props.onOpenNotes?.();
        },
      },
      {
        id: "quick-jot",
        title: t("notes.cmd_quick_jot_title"),
        detail: t("notes.cmd_quick_jot_detail"),
        meta: t("notes.cmd_quick_jot_meta"),
        icon: <PencilLine className="size-4 text-primary" />,
        searchText: "quick jot note scratchpad",
        action: () => {
          props.onClose();
          props.onQuickJot?.();
        },
      }] : []),
      // Top-bar shortcuts mirror documentation / feedback plus every settings
      // tab the user is likely to reach for from Cmd/Ctrl+K.
      {
        id: "open-docs",
        title: t("session.support_docs"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          openUrl("https://matterhorn.work/docs");
        },
      },
      {
        id: "open-feedback",
        title: t("session.support_feedback"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          if (props.onSendFeedback) {
            props.onSendFeedback();
          } else {
            openUrl("https://matterhorn.work/feedback");
          }
        },
      },
      {
        id: "settings-skills",
        title: t("settings.tab_skills"),
        detail: t("settings.tab_description_skills"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          props.onOpenSettings("/settings/skills");
        },
      },
      {
        id: "settings-extensions",
        title: t("settings.tab_extensions"),
        detail: t("settings.tab_description_extensions"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          props.onOpenSettings("/settings/extensions");
        },
      },
      {
        id: "settings-appearance",
        title: t("settings.tab_appearance"),
        detail: t("settings.tab_description_appearance"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          props.onOpenSettings("/settings/appearance");
        },
      },
      {
        id: "settings-updates",
        title: t("settings.tab_updates"),
        detail: t("settings.tab_description_updates"),
        meta: t("session.cmd_settings_meta"),
        action: () => {
          props.onClose();
          props.onOpenSettings("/settings/updates");
        },
      },
    );
    return items;
  }, [accessibleTargetCount, props]);

  const sessionItems = useMemo<PaletteItem[]>(
    () =>
      props.sessions.map((item) => ({
        id: `session:${item.workspaceId}:${item.sessionId}`,
        title: item.title,
        detail: item.workspaceTitle,
        meta: item.isActive
          ? t("session.cmd_current_workspace")
          : t("session.cmd_switch"),
        searchText: item.searchText,
        action: () => {
          props.onClose();
          props.onOpenSession(item.workspaceId, item.sessionId);
        },
      })),
    [props],
  );

  const accessibleItems = useMemo<PaletteItem[]>(() => {
    const targets = props.accessibleTargets ?? [];
    return [
      ...targets.map((target) => ({
        id: `accessible:${target.id}`,
        title: target.name || target.value,
        detail: target.value,
        meta: target.kind === "url" ? "Server" : "Output",
        icon: targetIcon(target),
        searchText: `${target.name} ${target.value} ${target.preview}`.toLowerCase(),
        action: () => {
          props.onClose();
          props.onOpenAccessibleTarget?.(target);
        },
      })),
      ...targets.map((target) => ({
        id: `accessible-hide:${target.id}`,
        title: `Stop tracking ${target.name || target.value}`,
        detail: target.value,
        meta: "Hide",
        icon: targetIcon(target),
        searchText: `stop tracking hide ${target.name} ${target.value} ${target.preview}`.toLowerCase(),
        action: () => {
          props.onClose();
          props.onHideAccessibleTarget?.(target);
        },
      })),
    ];
  }, [props]);

  const handleEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (mode !== "root") {
        setMode("root");
        return;
      }
      props.onClose();
    }
  };

  const handleBackspace = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      mode !== "root"
    ) {
      event.preventDefault();
      setMode("root");
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      props.onClose();
    }
  };

  const items = mode === "sessions" ? sessionItems : mode === "accessible-items" ? accessibleItems : rootItems;

  return (
    <CommandDialog open={props.open} onOpenChange={handleOpenChange}>
      <CommandDialogPopup onKeyDownCapture={handleEscape}>
        <CommandDialogTitle>
          {mode === "sessions"
            ? t("session.palette_title_sessions")
            : mode === "accessible-items"
              ? "Outputs & servers"
              : t("session.palette_title_actions")
          }
        </CommandDialogTitle>
        <Command key={mode} items={items}>
          <CommandHeader className="flex items-center gap-0">
            {mode !== "root" && (
              <Button variant="outline" size="icon-sm" className="rounded-xl" onClick={() => setMode("root")}>
                <ChevronLeftIcon className="size-4" />
                <span className="sr-only">{t("common.back")}</span>
              </Button>
            )}
            <CommandInput
              className="w-full"
              placeholder={
                mode === "sessions"
                  ? t("session.palette_placeholder_sessions")
                  : mode === "accessible-items"
                    ? "Search outputs and servers..."
                    : t("session.palette_placeholder_actions")
              }
              onKeyDown={handleBackspace}
            />
          </CommandHeader>
          <CommandPanel>
            <CommandEmpty>{mode === "accessible-items" ? "No accessible items found for this session." : t("session.palette_no_matches")}</CommandEmpty>
            <CommandList>
              {(item: PaletteItem) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onClick={item.action}
                >
                  {item.icon ? <span className="mr-2 shrink-0">{item.icon}</span> : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.title}</div>
                    {item.detail ? (
                      <div className="truncate text-muted-foreground text-xs">
                        {item.detail}
                      </div>
                    ) : null}
                    {item.searchText ? (
                      <span className="sr-only">{item.searchText}</span>
                    ) : null}
                  </div>
                  {item.meta ? <CommandShortcut>{item.meta}</CommandShortcut> : null}
                </CommandItem>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span>{t("session.palette_hint_navigate")}</span>
            <span>{t("session.palette_hint_run")}</span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
