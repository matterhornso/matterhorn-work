/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePanelRef } from "react-resizable-panels";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  Database,
  Dumbbell,
  FileText,
  Globe,
  Mic2,
  PanelRightClose,
  Plus,
  Settings2,
  ShieldCheck,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";

import { t } from "../../../../i18n";
import { OPENWORK_EXTENSION_CATALOG } from "../../../../app/constants";
import { type MatterhornServerClient, type MatterhornServerStatus } from "../../../../app/lib/matterhorn-server";
import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import type { BootPhase } from "../../../../app/lib/startup-boot";
import type { WorkspaceInfo } from "../../../../app/lib/desktop";
import type {
  PendingPermission,
  PendingQuestion,
  ProviderListItem,
  TodoItem,
  WorkspaceConnectionState,
  WorkspaceSessionGroup,
} from "../../../../app/types";
import type { ShareWorkspaceModalProps } from "../../workspace/types";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import ProviderAuthModal, { type ProviderAuthModalProps } from "../../connections/provider-auth/provider-auth-modal";
import { RenameSessionModal } from "../modals/rename-session-modal";
import { AppSidebar } from "../sidebar/app-sidebar";
import { SessionSurface, type SessionSurfaceProps } from "../surface/session-surface";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ShareWorkspaceModal } from "../../workspace/share-workspace-modal";
import { StatusBar, type StatusBarProps } from "./status-bar";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import { useShellConfig } from "../../../shell/shell-config";
import { type SidePanelItem, useUiStateStore } from "../../../shell/ui-state-store";

import { isElectronRuntime } from "../../../../app/utils";
import { BrowserPanel } from "../browser/browser-panel";
import { ArtifactPanel } from "../artifacts/artifact-panel";
import { isCollectibleArtifactTarget, isLocalhostBrowserTarget, type OpenTarget } from "../artifacts/open-target";
import { VoicePanel } from "../voice/voice-panel";
import { WalletPanel } from "../../wallet/WalletPanel";
import { MemoryPanel } from "../../memory/memory-panel";
import { dispatchMatterhornMemorySuggestions } from "../../memory/memory-suggestion-producers";
import { TransactionApproval } from "../../wallet/TransactionApproval";
import { useSessionWallet } from "../../wallet/useSessionWallet";
import { useWallet } from "../../wallet/WalletProvider";
import { useJobCron } from "../../wallet/hooks/useJobCron";
import { CommandPalette } from "../../wallet/components/CommandPalette";
import { useWorkspaceShellLayout } from "../../../shell/workspace-shell-layout";
import { useControlAction, type MatterhornControlAction } from "../../../shell/control/control-provider";
import { getExtensionId, isMatterhornExtensionEnabled, MATTERHORN_EXTENSION_STATE_CHANGED } from "../../settings/extension-state";
import { cn } from "@/lib/utils";
import {
  buildCustomerBetaDemoStarterCards,
  buildCustomerWorkflowStarterCards,
  fetchCustomerWorkflowTemplates,
  type CustomerWorkflowIconHint,
} from "../workflows/customer-workflow-templates";

const STARTUP_SKELETON_ROWS = [
  { id: "intro", titleWidth: "42%", bodyWidth: "88%" },
  { id: "middle", titleWidth: "56%", bodyWidth: "88%" },
  { id: "final", titleWidth: "36%", bodyWidth: "74%" },
];
const GLOBAL_VOICE_SIDE_PANEL_KEY = "__matterhorn_voice__";
const VENUE_SIDE_PANELS = ["bittensor", "hyperliquid", "polymarket"] as const;
type VenueSidePanel = (typeof VENUE_SIDE_PANELS)[number];

function isVenueSidePanel(panel: SidePanelItem | null): panel is VenueSidePanel {
  return panel === "bittensor" || panel === "hyperliquid" || panel === "polymarket";
}

const CUSTOMER_WORKFLOW_ICON_COMPONENTS: Record<CustomerWorkflowIconHint, typeof BrainCircuit> = {
  bittensor: BrainCircuit,
  hyperliquid: BarChart3,
  polymarket: ShieldCheck,
  wellness: Dumbbell,
  services: FileText,
  blank: FileText,
};

type StatusBarOverrides = Pick<
  StatusBarProps,
  | "loading"
  | "showSettingsButton"
  | "settingsOpen"
>;

export type SessionPageHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  busyAction: "undo" | "redo" | null;
  onUndo: () => void | Promise<void>;
  onRedo: () => void | Promise<void>;
};

export type SessionPageSidebarProps = {
  workspaceSessionGroups: WorkspaceSessionGroup[];
  selectedWorkspaceId: string;
  selectedSessionId: string | null;
  developerMode: boolean;
  sessionStatusById: Record<string, string>;
  connectingWorkspaceId: string | null;
  workspaceConnectionStateById: Record<string, WorkspaceConnectionState>;
  newTaskDisabled: boolean;
  sidebarHydratedFromCache: boolean;
  startupPhase: BootPhase;
  onSelectWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  onPrefetchSession?: (workspaceId: string, sessionId: string) => void;
  onCreateTaskInWorkspace: (workspaceId: string) => void;
  onCreateTaskWithPrompt?: (workspaceId: string, prompt: string) => void;
  onOpenRenameWorkspace: (workspaceId: string) => void;
  onShareWorkspace: (workspaceId: string) => void;
  onRevealWorkspace: (workspaceId: string) => void;
  onRecoverWorkspace: (workspaceId: string) => Promise<boolean> | boolean | void;
  onTestWorkspaceConnection: (workspaceId: string) => Promise<boolean> | boolean | void;
  onEditWorkspaceConnection: (workspaceId: string) => void;
  onForgetWorkspace: (workspaceId: string) => void;
  onOpenCreateWorkspace: () => void;
  onReorderWorkspaces?: (workspaceIds: string[]) => void;
};

export type SessionPageSurfaceProps = Omit<
  SessionSurfaceProps,
  "client" | "workspaceId" | "sessionId" | "opencodeBaseUrl" | "matterhornToken"
>;

export type SessionPageProps = {
  selectedSessionId: string | null;
  selectedWorkspaceId: string;
  selectedWorkspaceDisplay: {
    id?: string;
    name?: string;
    displayName?: string;
    workspaceType?: WorkspaceInfo["workspaceType"];
  };
  selectedWorkspaceRoot: string;
  selectedWorkspaceError?: string | null;
  runtimeWorkspaceId: string | null;
  /**
   * Pre-built OpenCode SDK base URL for the selected workspace's owning
   * server. The parent route resolves this through `resolveWorkspaceEndpoint`
   * so we never compose `<baseUrl>/workspace/<id>/opencode` here.
   */
  opencodeBaseUrl?: string | null;
  workspaces: WorkspaceInfo[];
  clientConnected: boolean;
  matterhornServerStatus: MatterhornServerStatus;
  matterhornServerClient: MatterhornServerClient | null;
  matterhornServerToken?: string | null;
  developerMode: boolean;
  headerStatus: string;
  busyHint: string | null;
  startupPhase: BootPhase;
  providerConnectedIds: string[];
  providers?: ProviderListItem[];
  mcpConnectedCount: number;
  onSendFeedback: () => void;
  onOpenSettings: () => void;
  sidebar: SessionPageSidebarProps;
  surface?: SessionPageSurfaceProps | null;
  history?: SessionPageHistoryControls | null;
  todos: TodoItem[];
  sessionLoadingById: (sessionId: string | null) => boolean;
  shareWorkspaceModal?: ShareWorkspaceModalProps | null;
  providerAuthModal?: ProviderAuthModalProps | null;
  activePermission?: PendingPermission | null;
  permissionReplyBusy?: boolean;
  respondPermission?: (requestID: string, reply: "once" | "always" | "reject") => void;
  safeStringify?: (value: unknown) => string;
  activeQuestion?: PendingQuestion | null;
  questionReplyBusy?: boolean;
  respondQuestion?: (requestID: string, answers: string[][]) => void;
  statusBar?: Partial<StatusBarOverrides>;
  notFoundMessage?: string | null;
  onRenameSession?: (sessionId: string, title: string) => Promise<void> | void;
  onDeleteSession?: (sessionId: string) => Promise<void> | void;
  onAccessibleTargetsChange?: (targets: OpenTarget[]) => void;
  /** Settings content rendered inside the right pane when the settings rail icon is active. */
  settingsSlot?: React.ReactNode;
};

function getSidebarInitialLoading(props: SessionPageSidebarProps) {
  if (props.workspaceSessionGroups.some((group) => group.sessions.length > 0)) {
    return false;
  }
  if (props.sidebarHydratedFromCache) return false;
  if (
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready"
  ) {
    return true;
  }
  return props.workspaceSessionGroups.some(
    (group) => group.status === "loading" || group.status === "idle",
  );
}

function sessionTitleForId(groups: WorkspaceSessionGroup[], id: string | null | undefined) {
  if (!id) return "";
  const sessionsById = new Map(groups.flatMap((group) => group.sessions.map((session) => [session.id, session] as const)));
  const match = sessionsById.get(id);
  return match ? getDisplaySessionTitle(match.title) : "";
}

function isTrackableAccessibleTarget(target: OpenTarget) {
  return isCollectibleArtifactTarget(target) || isLocalhostBrowserTarget(target);
}

function hiddenAccessibleTargetsStorageKey(workspaceId: string | null | undefined, sessionId: string | null | undefined) {
  if (!workspaceId || !sessionId) return null;
  return `matterhorn.session.hiddenAccessibleTargets.v1:${workspaceId}:${sessionId}`;
}

function readHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined): Set<string> {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function writeHiddenAccessibleTargetIds(workspaceId: string | null | undefined, sessionId: string | null | undefined, ids: Set<string>) {
  const key = hiddenAccessibleTargetsStorageKey(workspaceId, sessionId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage failures
  }
}

export function SessionPage(props: SessionPageProps) {
  const { config: shellConfig } = useShellConfig();
  const wallet = useWallet();
  const sessionWallet = useSessionWallet(wallet.store);
  useJobCron(wallet.store);
  const [commandOpen, setCommandOpen] = useState(false);

  // Cmd+K / Ctrl+K command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sidebarOpen = useUiStateStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStateStore((state) => state.setSidebarOpen);
  const sessionSidePanel = useUiStateStore((state) => (
    props.selectedSessionId ? state.sidePanelState[props.selectedSessionId] ?? null : null
  ));
  const voiceSidePanelOpen = useUiStateStore((state) => state.sidePanelState[GLOBAL_VOICE_SIDE_PANEL_KEY] === "voice");
  const setSidePanelState = useUiStateStore((state) => state.setSidePanelState);
  const toggleSidePanelState = useUiStateStore((state) => state.toggleSidePanelState);
  const [artifactTarget, setArtifactTarget] = useState<OpenTarget | null>(null);
  const [openTargets, setOpenTargets] = useState<OpenTarget[]>([]);
  const [hiddenAccessibleTargetIds, setHiddenAccessibleTargetIds] = useState<Set<string>>(() => new Set());
  const [, setExtensionStateVersion] = useState(0);
  const loadedHiddenTargetsKeyRef = useRef<string | null>(null);
  const accessibleTargets = useMemo(
    () => openTargets.filter((target) => isTrackableAccessibleTarget(target) && !hiddenAccessibleTargetIds.has(target.id)),
    [hiddenAccessibleTargetIds, openTargets],
  );
  const artifactFileTargets = useMemo(() => accessibleTargets.filter(isCollectibleArtifactTarget), [accessibleTargets]);
  const visibleArtifactTarget = artifactTarget ?? artifactFileTargets[0] ?? null;
  const artifactTargetCount = artifactFileTargets.length;
  const hasArtifactTargets = artifactTargetCount > 0;
  const activeSidePanel = voiceSidePanelOpen ? "voice" : sessionSidePanel;
  const sidePanelOpen = activeSidePanel !== null;
  const browserRailActive = activeSidePanel === "browser";
  const artifactRailActive = activeSidePanel === "artifacts";
  const extensionsRailActive = activeSidePanel === "extensions";
  const voiceRailActive = activeSidePanel === "voice";
  const memoryRailActive = activeSidePanel === "memory";
  const bittensorRailActive = activeSidePanel === "bittensor";
  const hyperliquidRailActive = activeSidePanel === "hyperliquid";
  const polymarketRailActive = activeSidePanel === "polymarket";
  const protocolSidePanelOpen = isVenueSidePanel(activeSidePanel);
  const voiceExtension = useMemo(
    () => OPENWORK_EXTENSION_CATALOG.find((entry) => getExtensionId(entry) === "matterhorn-voice") ?? null,
    [],
  );
  const voiceExtensionEnabled = voiceExtension ? isMatterhornExtensionEnabled(voiceExtension) : false;
  const customerWorkflowTemplatesQuery = useQuery({
    queryKey: ["matterhorn-customer-workflow-templates"],
    queryFn: fetchCustomerWorkflowTemplates,
    staleTime: 60_000,
  });
  const customerWorkflowStarterCards = useMemo(
    () => buildCustomerWorkflowStarterCards(customerWorkflowTemplatesQuery.data),
    [customerWorkflowTemplatesQuery.data],
  );
  const mondayBetaDemoCards = useMemo(
    () => buildCustomerBetaDemoStarterCards(customerWorkflowTemplatesQuery.data),
    [customerWorkflowTemplatesQuery.data],
  );
  const customerWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.id !== "blank_chat_workflow"),
    [customerWorkflowStarterCards],
  );
  const protocolWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.panel === "bittensor" || card.panel === "hyperliquid" || card.panel === "polymarket"),
    [customerWorkflowStarterCards],
  );
  const [memorySuggestionUnreadCount, setMemorySuggestionUnreadCount] = useState(0);
  const refreshMemorySuggestionUnreadCount = useCallback(async () => {
    const client = props.matterhornServerClient;
    if (!client) {
      setMemorySuggestionUnreadCount(0);
      return;
    }
    try {
      const response = await client.listMemorySuggestions({ status: "pending", limit: 50 });
      setMemorySuggestionUnreadCount((response.entries ?? []).filter((entry) => entry.status === "pending").length);
    } catch {
      setMemorySuggestionUnreadCount(0);
    }
  }, [props.matterhornServerClient]);
  useEffect(() => {
    void refreshMemorySuggestionUnreadCount();
  }, [refreshMemorySuggestionUnreadCount]);
  useEffect(() => {
    const refresh = () => {
      void refreshMemorySuggestionUnreadCount();
    };
    window.addEventListener("matterhorn:memory-suggestions-updated", refresh);
    window.addEventListener("matterhorn:memory-suggestion", refresh);
    window.addEventListener("matterhorn:memory-suggestions-changed", refresh);
    return () => {
      window.removeEventListener("matterhorn:memory-suggestions-updated", refresh);
      window.removeEventListener("matterhorn:memory-suggestion", refresh);
      window.removeEventListener("matterhorn:memory-suggestions-changed", refresh);
    };
  }, [refreshMemorySuggestionUnreadCount]);
  const memoryInboxLabel = memorySuggestionUnreadCount > 0
    ? `Memory inbox: ${memorySuggestionUnreadCount > 99 ? "99+" : memorySuggestionUnreadCount} pending suggestions`
    : "Memory inbox: no pending suggestions";
  const businessWorkflowLaunchers = useMemo(
    () => customerWorkflowStarterCards.filter((card) => card.id === "wellness_creator_workflow"),
    [customerWorkflowStarterCards],
  );
  const blankWorkflowLauncher = useMemo(
    () => customerWorkflowStarterCards.find((card) => card.id === "blank_chat_workflow") ?? null,
    [customerWorkflowStarterCards],
  );
  const wellnessRailLauncher = useMemo(
    () => customerWorkflowStarterCards.find((card) => card.id === "wellness_creator_workflow") ?? null,
    [customerWorkflowStarterCards],
  );

  useReactRenderWatchdog("SessionPage", {
    selectedSessionId: props.selectedSessionId,
    selectedWorkspaceId: props.selectedWorkspaceId,
    clientConnected: props.clientConnected,
    startupPhase: props.startupPhase,
    hasSurface: Boolean(props.surface),
    workspaceCount: props.workspaces.length,
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const browserPanelRef = usePanelRef();
  const preserveSidePanelOnPanelOpenRef = useRef(false);
  const pendingProtocolRailPanelRef = useRef<VenueSidePanel | null>(null);

  const setCurrentSidePanel = useCallback((panel: SidePanelItem | null) => {
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, panel === "voice" ? "voice" : null);
    if (panel === "voice") return;
    setSidePanelState(props.selectedSessionId, panel);
  }, [props.selectedSessionId, setSidePanelState]);

  const toggleCurrentSidePanel = useCallback((panel: SidePanelItem) => {
    if (panel === "voice") {
      toggleSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, "voice");
      return;
    }
    setSidePanelState(GLOBAL_VOICE_SIDE_PANEL_KEY, null);
    toggleSidePanelState(props.selectedSessionId, panel);
  }, [props.selectedSessionId, setSidePanelState, toggleSidePanelState]);

  // Sync browser panel state with Electron main process IPC events.
  // When the agent calls a built-in browser tool, the main process opens
  // the WebContentsView and sends panel-opened; when hide_browser is called
  // it sends panel-closed.  Without this listener the React UI never knows
  // the panel opened and doesn't render the BrowserPanel toolbar.
  useEffect(() => {
    if (!isElectronRuntime()) return;
    const browser = (window as Window).__OPENWORK_ELECTRON__?.browser;
    if (!browser) return;
    const unsubOpen = browser.onPanelOpened?.(() => {
      if (preserveSidePanelOnPanelOpenRef.current) {
        preserveSidePanelOnPanelOpenRef.current = false;
        return;
      }
      setCurrentSidePanel("browser");
    });
    const unsubClose = browser.onPanelClosed?.(() => setCurrentSidePanel(null));
    return () => { unsubOpen?.(); unsubClose?.(); };
  }, [setCurrentSidePanel]);
  const {
    leftSidebarResizing,
    leftSidebarWidth,
    rightSidebarExpandedWidth: browserPanelWidth,
    setRightSidebarExpandedWidth: setBrowserPanelWidth,
    startLeftSidebarResize,
  } = useWorkspaceShellLayout({
    expandedRightWidth: 520,
    minRightWidth: 320,
  });
  const [browserPanelDefaultWidth, setBrowserPanelDefaultWidth] = useState(browserPanelWidth);
  const sidebarProviderStyle: CSSProperties & Record<"--sidebar-width", string> = {
    "--sidebar-width": `${leftSidebarWidth}px`,
  };
  useEffect(() => {
    if (sidePanelOpen) return;
    setBrowserPanelDefaultWidth(browserPanelWidth);
  }, [sidePanelOpen, browserPanelWidth]);
  useEffect(() => {
    loadedHiddenTargetsKeyRef.current = hiddenAccessibleTargetsStorageKey(props.selectedWorkspaceId, props.selectedSessionId);
    setArtifactTarget(null);
    setOpenTargets([]);
    setHiddenAccessibleTargetIds(readHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId));
  }, [props.selectedSessionId, props.selectedWorkspaceId]);
  useEffect(() => {
    if (loadedHiddenTargetsKeyRef.current !== hiddenAccessibleTargetsStorageKey(props.selectedWorkspaceId, props.selectedSessionId)) return;
    writeHiddenAccessibleTargetIds(props.selectedWorkspaceId, props.selectedSessionId, hiddenAccessibleTargetIds);
  }, [hiddenAccessibleTargetIds, props.selectedSessionId, props.selectedWorkspaceId]);
  useEffect(() => {
    props.onAccessibleTargetsChange?.(accessibleTargets);
  }, [accessibleTargets, props.onAccessibleTargetsChange]);
  useEffect(() => {
    if (!props.selectedSessionId) return;
    const pendingPanel = pendingProtocolRailPanelRef.current;
    if (!pendingPanel) return;
    pendingProtocolRailPanelRef.current = null;
    setCurrentSidePanel(pendingPanel);
  }, [props.selectedSessionId, setCurrentSidePanel]);
  const commitBrowserPanelWidth = useCallback(() => {
    const size = browserPanelRef.current?.getSize();
    if (size?.inPixels) setBrowserPanelWidth(Math.round(size.inPixels));
  }, [browserPanelRef, setBrowserPanelWidth]);
  const browserUrlForTarget = useCallback((target: OpenTarget) => {
    if (/^wss?:\/\//i.test(target.value)) return target.value.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
    return target.value;
  }, []);
  const openTarget = useCallback((target: OpenTarget, options?: { auto?: boolean }) => {
    if (target.kind === "url" || target.preview === "browser") {
      const url = browserUrlForTarget(target);
      if (isElectronRuntime()) {
        setCurrentSidePanel("browser");
        void window.__OPENWORK_ELECTRON__?.browser?.createTab?.(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (options?.auto && artifactTarget?.id === target.id) return;
    setArtifactTarget(target);
    preserveSidePanelOnPanelOpenRef.current = true;
    setCurrentSidePanel("artifacts");
  }, [artifactTarget?.id, browserUrlForTarget, setCurrentSidePanel]);
  const handleOpenTargetsChange = useCallback((targets: OpenTarget[]) => {
    setOpenTargets(targets);
    setArtifactTarget((current) => {
      if (!current) return current;
      const updated = targets.find((target) => target.id === current.id || target.value === current.value);
      if (!updated) return current;
      return isCollectibleArtifactTarget(updated) ? updated : null;
    });
  }, []);
  const closeRightPane = useCallback(() => {
    setCurrentSidePanel(null);
  }, [setCurrentSidePanel]);
  const openBrowserRailPane = useCallback(() => {
    toggleCurrentSidePanel("browser");
  }, [toggleCurrentSidePanel]);
  const canExposeBrowserControlActions = isElectronRuntime() && Boolean(window.__OPENWORK_ELECTRON__?.browser);
  const openBrowserPanelControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "browser.open_panel",
    label: "Open browser panel",
    description: "Open the built-in Matterhorn Work browser side panel.",
    sideEffect: "navigation",
    execute: () => {
      setCurrentSidePanel("browser");
      return { ok: true };
    },
  }), [setCurrentSidePanel]);
  useControlAction(canExposeBrowserControlActions ? openBrowserPanelControlAction : null);

  const openBrowserUrlControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "browser.open",
    label: "Open browser URL",
    description: "Open a URL in the built-in Matterhorn Work browser and reveal the browser panel.",
    sideEffect: "navigation",
    requiresArgs: true,
    args: [
      { name: "url", type: "string", required: true, description: "URL to open in the built-in browser." },
      { name: "newTab", type: "boolean", required: false, description: "When false, navigate the active tab instead of creating a new tab." },
    ],
    previewArgs: { url: "https://matterhorn.so", newTab: true },
    execute: async (args) => {
      const payload = args && typeof args === "object" ? args as { url?: unknown; newTab?: unknown } : {};
      const url = typeof payload.url === "string" ? payload.url.trim() : "";
      if (!url) return { ok: false, error: "browser.open requires a non-empty url." };
      setCurrentSidePanel("browser");
      if (payload.newTab === false) {
        await window.__OPENWORK_ELECTRON__?.browser?.navigate?.(url);
        return { url, newTab: false };
      }
      const tab = await window.__OPENWORK_ELECTRON__?.browser?.createTab?.(url);
      return { url, newTab: true, tabId: tab?.tabId ?? null };
    },
  }), [setCurrentSidePanel]);
  useControlAction(canExposeBrowserControlActions ? openBrowserUrlControlAction : null);

  const openArtifactRailPane = useCallback(() => {
    if (!hasArtifactTargets) return;
    if (!artifactRailActive) {
      preserveSidePanelOnPanelOpenRef.current = true;
    }
    toggleCurrentSidePanel("artifacts");
  }, [artifactRailActive, hasArtifactTargets, toggleCurrentSidePanel]);
  const openExtensionsRailPane = useCallback(() => {
    toggleCurrentSidePanel("extensions");
  }, [toggleCurrentSidePanel]);
  const openVoiceRailPane = useCallback(() => {
    toggleCurrentSidePanel("voice");
  }, [toggleCurrentSidePanel]);
  const openMemoryRailPane = useCallback(() => {
    toggleCurrentSidePanel("memory");
  }, [toggleCurrentSidePanel]);
  const primeProtocolRailPrompt = useCallback((
    panel: VenueSidePanel,
    options?: { prompt?: string; source?: string },
  ) => {
    const launcher = protocolWorkflowLaunchers.find((item) => item.panel === panel);
    const prompt = options?.prompt ?? launcher?.prompt;
    if (!prompt) return;
    const source = options?.source ?? "protocol-rail";
    if (props.selectedSessionId && props.surface && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("matterhorn:crypto-chat-handoff", {
        detail: {
          prompt,
          panel,
          venue: panel,
          source,
        },
      }));
      return;
    }
    pendingProtocolRailPanelRef.current = panel;
    if (props.sidebar.onCreateTaskWithPrompt) {
      props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, prompt);
      return;
    }
    props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
  }, [props.selectedSessionId, props.selectedWorkspaceId, props.sidebar, props.surface, protocolWorkflowLaunchers]);
  const openVenueRailPane = useCallback((panel: VenueSidePanel, options?: { primePrompt?: boolean; prompt?: string; source?: string }) => {
    if (options?.primePrompt && !(props.selectedSessionId && props.surface)) {
      pendingProtocolRailPanelRef.current = panel;
    }
    setCurrentSidePanel(panel);
    if (options?.primePrompt) primeProtocolRailPrompt(panel, options);
  }, [primeProtocolRailPrompt, props.selectedSessionId, props.surface, setCurrentSidePanel]);
  const removeAccessibleTarget = useCallback((target: OpenTarget) => {
    setHiddenAccessibleTargetIds((current) => new Set(current).add(target.id));
    setArtifactTarget((current) => current?.id === target.id ? null : current);
  }, []);
  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value) ?? (
        requested?.kind && requested?.value ? requested : null
      );
      if (target) openTarget(target);
    };
    const hide = (event: Event) => {
      const requested = (event as CustomEvent<OpenTarget>).detail;
      const target = accessibleTargets.find((item) => item.id === requested?.id || item.value === requested?.value);
      if (target) removeAccessibleTarget(target);
    };
    window.addEventListener("openwork-open-accessible-target", open);
    window.addEventListener("openwork-hide-accessible-target", hide);
    return () => {
      window.removeEventListener("openwork-open-accessible-target", open);
      window.removeEventListener("openwork-hide-accessible-target", hide);
    };
  }, [accessibleTargets, openTarget, removeAccessibleTarget]);
  useEffect(() => {
    const handler = () => setCurrentSidePanel(null);
    window.addEventListener("openwork-close-right-pane", handler);
    return () => window.removeEventListener("openwork-close-right-pane", handler);
  }, [setCurrentSidePanel]);
  useEffect(() => {
    const refresh = () => setExtensionStateVersion((value) => value + 1);
    window.addEventListener(MATTERHORN_EXTENSION_STATE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MATTERHORN_EXTENSION_STATE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    if (activeSidePanel === "voice" && !voiceExtensionEnabled) {
      setCurrentSidePanel(null);
    }
  }, [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);

  const openVoicePanelControlAction = useMemo<MatterhornControlAction | null>(() => (
    voiceExtensionEnabled ? {
      id: "voice.panel.open",
      label: "Open Voice Mode",
      description: "Open the sticky Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel("voice");
        return { open: true };
      },
    } : null
  ), [setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(openVoicePanelControlAction);

  const closeVoicePanelControlAction = useMemo<MatterhornControlAction | null>(() => (
    voiceExtensionEnabled && activeSidePanel === "voice" ? {
      id: "voice.panel.close",
      label: "Close Voice Mode",
      description: "Close the Voice Mode right-side panel.",
      sideEffect: "none",
      execute: () => {
        setCurrentSidePanel(null);
        return { open: false };
      },
    } : null
  ), [activeSidePanel, setCurrentSidePanel, voiceExtensionEnabled]);
  useControlAction(closeVoicePanelControlAction);
  const [showDelayedSessionLoadingState, setShowDelayedSessionLoadingState] = useState(false);

  const selectedSessionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, props.selectedSessionId),
    [props.selectedSessionId, props.sidebar.workspaceSessionGroups],
  );
  const sessionActionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionActionId),
    [props.sidebar.workspaceSessionGroups, sessionActionId],
  );
  const workspaceName =
    props.selectedWorkspaceDisplay.displayName?.trim() ||
    props.selectedWorkspaceDisplay.name?.trim() ||
    t("session.workspace_fallback");
  const providerCount = props.providerConnectedIds.length;
  const messageCountVisible = props.selectedSessionId ? 1 : 0;
  const showWorkspaceSetupEmptyState = props.workspaces.length === 0 && !props.selectedSessionId;
  const showStartupSkeleton =
    !props.selectedSessionId &&
    !props.clientConnected &&
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready";
  const showSessionLoadingState =
    Boolean(props.selectedSessionId) && props.sessionLoadingById(props.selectedSessionId) && !showWorkspaceSetupEmptyState;
  const sidebarInitialLoading = useMemo(() => getSidebarInitialLoading(props.sidebar), [props.sidebar]);
  // Derive the main-pane error from the same data the sidebar uses so the two
  // panes can never disagree. We check (in priority order):
  // 1. selectedWorkspaceError (errorsByWorkspaceId[selectedWorkspaceId])
  // 2. workspaceConnectionStateById[selectedWorkspaceId].message (covers test/recover paths)
  // 3. group.error from workspaceSessionGroups (the same source the sidebar reads)
  const selectedWorkspaceConnectionMessage = (() => {
    const state = props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId];
    if (state?.status === "error") return state.message?.trim() ?? "";
    return "";
  })();
  const selectedWorkspaceGroupError = (() => {
    const group = props.sidebar.workspaceSessionGroups.find(
      (item) => item.workspace.id === props.selectedWorkspaceId,
    );
    return group?.error?.trim() ?? "";
  })();
  const selectedWorkspaceErrorMessage =
    props.selectedWorkspaceError?.trim() ||
    selectedWorkspaceConnectionMessage ||
    selectedWorkspaceGroupError ||
    "";
  const showSelectedWorkspaceError = Boolean(selectedWorkspaceErrorMessage);
  const selectedWorkspaceErrorTitle =
    props.selectedWorkspaceDisplay.workspaceType === "remote"
      ? "Remote workspace unavailable"
      : "Matterhorn Work engine unavailable";

  const reactSessionBaseUrl = props.opencodeBaseUrl?.trim() ?? "";
  const reactSessionToken =
    props.matterhornServerToken?.trim() ||
    props.matterhornServerClient?.token?.trim() ||
    "";
  const canRenderReactSurface = Boolean(
    props.selectedSessionId &&
      props.runtimeWorkspaceId &&
      props.matterhornServerClient &&
      reactSessionBaseUrl &&
      reactSessionToken &&
      props.surface,
  );

  useEffect(() => {
    if (!showSessionLoadingState) {
      setShowDelayedSessionLoadingState(false);
      return;
    }
    const id = window.setTimeout(() => {
      setShowDelayedSessionLoadingState(true);
    }, 1000);
    return () => window.clearTimeout(id);
  }, [showSessionLoadingState]);

  useEffect(() => {
    setRenameOpen(false);
    setDeleteOpen(false);
    setRenameBusy(false);
    setDeleteBusy(false);
    setSessionActionId(null);
  }, [props.selectedSessionId]);

  const openRenameModal = (sessionId: string) => {
    if (!props.onRenameSession) return;
    setSessionActionId(sessionId);
    setRenameTitle(sessionTitleForId(props.sidebar.workspaceSessionGroups, sessionId));
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const sessionId = sessionActionId;
    const nextTitle = renameTitle.trim();
    if (!sessionId || !props.onRenameSession || !nextTitle || nextTitle === sessionActionTitle.trim()) return;
    setRenameBusy(true);
    try {
      await props.onRenameSession(sessionId, nextTitle);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    const sessionId = sessionActionId;
    if (!sessionId || !props.onDeleteSession) return;
    setDeleteBusy(true);
    try {
      await props.onDeleteSession(sessionId);
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(74,111,255,0.12),transparent_42%),var(--app-bg,#0b1020)] text-dls-text mac:bg-transparent">
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className={cn(
          "relative min-h-0 flex-1 mac:bg-transparent",
          leftSidebarResizing &&
            "**:data-[slot=sidebar-container]:transition-none **:data-[slot=sidebar-gap]:transition-none",
          !shellConfig.sidebar && "**:data-[slot=sidebar-container]:hidden **:data-[slot=sidebar-gap]:hidden",
        )}
        style={sidebarProviderStyle}
      >
        <AppSidebar
          workspaceSessionGroups={props.sidebar.workspaceSessionGroups}
          selectedWorkspaceId={props.sidebar.selectedWorkspaceId}
          developerMode={props.sidebar.developerMode}
          selectedSessionId={props.sidebar.selectedSessionId}
          showInitialLoading={sidebarInitialLoading}
          showSessionActions={Boolean(props.onRenameSession || props.onDeleteSession)}
          sessionStatusById={props.sidebar.sessionStatusById}
          connectingWorkspaceId={props.sidebar.connectingWorkspaceId}
          workspaceConnectionStateById={props.sidebar.workspaceConnectionStateById}
          newTaskDisabled={props.sidebar.newTaskDisabled}
          onSelectWorkspace={props.sidebar.onSelectWorkspace}
          onOpenSession={props.sidebar.onOpenSession}
          onPrefetchSession={props.sidebar.onPrefetchSession}
          onCreateTaskInWorkspace={props.sidebar.onCreateTaskInWorkspace}
          onOpenRenameSession={props.onRenameSession ? openRenameModal : undefined}
          onOpenDeleteSession={props.onDeleteSession ? (sessionId) => {
            setSessionActionId(sessionId);
            setDeleteOpen(true);
          } : undefined}
          onOpenRenameWorkspace={props.sidebar.onOpenRenameWorkspace}
          onShareWorkspace={props.sidebar.onShareWorkspace}
          onRevealWorkspace={props.sidebar.onRevealWorkspace}
          onRecoverWorkspace={props.sidebar.onRecoverWorkspace}
          onTestWorkspaceConnection={props.sidebar.onTestWorkspaceConnection}
          onEditWorkspaceConnection={props.sidebar.onEditWorkspaceConnection}
          onForgetWorkspace={props.sidebar.onForgetWorkspace}
          onOpenCreateWorkspace={props.sidebar.onOpenCreateWorkspace}
          onReorderWorkspaces={props.sidebar.onReorderWorkspaces}
          onStartResize={startLeftSidebarResize}
        />
        <SidebarInset className="min-h-0 overflow-hidden bg-background mac:bg-background/80 mac:[&_header]:transition-[padding-left] mac:[&_header]:duration-200 mac:[&_header]:ease-linear mac:peer-data-[state=collapsed]:[&_header]:pl-28 mac:max-md:[&_header]:pl-28">
          <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={sidePanelOpen ? commitBrowserPanelWidth : undefined}
            className="min-h-0 flex-1"
          >
            <ResizablePanel minSize="360px" className="min-w-0">
              <main className="flex h-full min-w-0 flex-col overflow-hidden border-r border-border">
          <header className="z-10 flex h-10 shrink-0 items-center justify-between border-b border-border px-4 md:px-6 mac:titlebar-drag  mac:backdrop-blur-2xl mac:backdrop-saturate-150 @container/titlebar">
            <div className="flex min-w-0 items-center gap-3">
              {shellConfig.sidebar ? <SidebarTrigger className="mac:hidden" /> : null}
              <h1 className="truncate text-[15px] font-semibold text-dls-text">
                {showWorkspaceSetupEmptyState
                  ? t("session.create_or_connect_workspace")
                  : selectedSessionTitle || t("session.default_title")}
              </h1>
              <span className="hidden truncate text-[13px] text-dls-secondary lg:inline">
                {workspaceName}
              </span>
              {props.developerMode ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.headerStatus}
                </span>
              ) : null}
              {props.busyHint ? (
                <span className="hidden text-[12px] text-dls-secondary lg:inline">
                  {props.busyHint}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 text-gray-10 mac:titlebar-no-drag">
              {/* Revert/redo moved to per-message actions */}
              {props.developerMode ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      window.localStorage.removeItem("openwork.acknowledgedProviders");
                      window.localStorage.removeItem("openwork.orgOnboardingSeen");
                    } catch {}
                  }}
                  title="Clears acknowledged providers + org onboarding so they trigger again"
                >
                  Reset notifications
                </Button>
              ) : null}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="relative min-w-0 flex-1 overflow-hidden bg-dls-surface mac:bg-dls-surface/85 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
              {showStartupSkeleton ? (
                <div className="px-6 py-14" role="status" aria-live="polite">
                  <div className="mx-auto max-w-2xl space-y-6">
                    <div className="space-y-2">
                      <div className="h-4 w-32 animate-pulse rounded-full bg-dls-hover/80" />
                      <div className="h-3 w-64 animate-pulse rounded-full bg-dls-hover/60" />
                    </div>
                    <div className="space-y-3">
                      {STARTUP_SKELETON_ROWS.map((row) => (
                        <div key={row.id} className="rounded-2xl border border-dls-border bg-dls-hover/40 p-4">
                          <div
                            className="mb-3 h-3 animate-pulse rounded-full bg-dls-hover/80"
                            style={{ width: row.titleWidth }}
                          />
                          <div className="space-y-2">
                            <div className="h-2.5 animate-pulse rounded-full bg-dls-hover/70" />
                            <div
                              className="h-2.5 animate-pulse rounded-full bg-dls-hover/60"
                              style={{ width: row.bodyWidth }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {showDelayedSessionLoadingState ? (
                <div className="px-6 py-16">
                  <div
                    className="mx-auto flex max-w-[320px] flex-col items-center gap-3 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    <OwDotTicker size="md" />
                    <div className="text-[12px] leading-5 text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  </div>
                </div>
              ) : null}

              {!showDelayedSessionLoadingState && canRenderReactSurface ? (
                <SessionSurface
                  // Spread `surface` first so the explicit per-workspace
                  // routing props below CAN'T be silently overridden by
                  // anything that leaks into `surface`. SessionSurface's
                  // server target (client/workspaceId/sessionId/opencodeBaseUrl/matterhornToken)
                  // must come from the resolved workspace endpoint passed by
                  // SessionRoute, not from anything in `surface`.
                  {...props.surface!}
                  client={props.matterhornServerClient!}
                  workspaceId={props.runtimeWorkspaceId!}
                  sessionId={props.selectedSessionId!}
                  opencodeBaseUrl={reactSessionBaseUrl}
                  matterhornToken={reactSessionToken}
                  todos={props.todos}
                  activePermission={props.activePermission}
                  permissionReplyBusy={props.permissionReplyBusy}
                  respondPermission={props.respondPermission}
                  activeQuestion={props.activeQuestion}
                  questionReplyBusy={props.questionReplyBusy}
                  respondQuestion={props.respondQuestion}
                  safeStringify={props.safeStringify}
                  onOpenTarget={openTarget}
                  onOpenTargetsChange={handleOpenTargetsChange}
                />
              ) : null}

              {!showDelayedSessionLoadingState && !canRenderReactSurface && !showStartupSkeleton ? (
                <div className={`mx-auto max-w-[800px] px-6 ${showWorkspaceSetupEmptyState ? "pt-20" : "pt-10"}`}>
                  {props.notFoundMessage ? (
                    <div className="px-6 py-16 text-center">
                      <div className="mx-auto max-w-md rounded-2xl border border-dls-border bg-dls-card px-5 py-6 shadow-[var(--dls-card-shadow)]">
                        <h3 className="text-base font-medium text-dls-text">Workspace or session not found</h3>
                        <p className="mt-2 text-sm leading-6 text-dls-secondary">{props.notFoundMessage}</p>
                      </div>
                    </div>
                  ) : showWorkspaceSetupEmptyState ? (
                    <div className="space-y-6 px-6 text-center">
                      <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border border-dls-border bg-dls-hover">
                        <Zap className="text-dls-secondary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-medium">{t("session.create_or_connect_workspace")}</h3>
                        <p className="mx-auto max-w-sm text-sm text-dls-secondary">
                          {t("workspace.empty_state_body")}
                        </p>
                      </div>
                      <div className="flex justify-center">
                        <Button onClick={props.sidebar.onOpenCreateWorkspace}>{t("workspace.create_workspace")}</Button>
                      </div>
                    </div>
                  ) : showSelectedWorkspaceError ? (
                    <div className="px-6 py-16">
                      <div className="mx-auto max-w-lg rounded-2xl border border-red-7/35 bg-red-1/40 p-5 text-left shadow-[var(--dls-card-shadow)]">
                        <div className="text-sm font-medium text-red-11">{selectedWorkspaceErrorTitle}</div>
                        <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-red-11/90">
                          {selectedWorkspaceErrorMessage}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId)}
                          >
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void Promise.resolve(props.sidebar.onTestWorkspaceConnection(props.selectedWorkspaceId))}
                          >
                            {t("workspace_list.test_connection")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => props.sidebar.onEditWorkspaceConnection(props.selectedWorkspaceId)}
                          >
                            {t("workspace_list.edit_connection")}
                          </Button>
                          {props.sidebar.workspaceConnectionStateById[props.selectedWorkspaceId]?.status === "error" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void Promise.resolve(props.sidebar.onRecoverWorkspace(props.selectedWorkspaceId))}
                            >
                              {t("workspace_list.recover")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : props.selectedSessionId ? (
                    <div className="px-6 py-16 text-center text-sm text-dls-secondary">
                      {t("session.loading_detail")}
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
                      <div className="w-full max-w-5xl space-y-7">
                        <div className="mx-auto max-w-2xl space-y-3 text-center">
                          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(var(--matterhorn-blue-rgb),0.26)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                            Matterhorn Desk launcher
                          </div>
                          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-dls-text sm:text-3xl">
                            Choose a Desk.
                          </h2>
                          <p className="mx-auto max-w-xl text-sm leading-6 text-dls-secondary">
                            Start from Bittensor, Hyperliquid, Polymarket, Wellness, or blank chat. Matterhorn opens a
                            focused desk, inserts an editable prompt, and keeps wallet, preview, and safety boundaries
                            visible before anything runs.
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-[rgba(var(--matterhorn-blue-rgb),0.35)] bg-[var(--matterhorn-blue)] px-4 py-2 text-sm font-medium text-[var(--matterhorn-ink)] transition-colors hover:bg-[#e7f8ff]"
                            disabled={props.sidebar.newTaskDisabled}
                            onClick={() => {
                              if (blankWorkflowLauncher && props.sidebar.onCreateTaskWithPrompt) {
                                props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, blankWorkflowLauncher.prompt);
                                return;
                              }
                              props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
                            }}
                          >
                            <Plus className="size-4" />
                            Create session
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-dls-border bg-dls-surface px-4 py-2 text-sm font-medium text-dls-text transition-colors hover:bg-dls-hover"
                            onClick={() => {
                              const bittensorLauncher = customerWorkflowLaunchers.find((launcher) => launcher.panel === "bittensor");
                              if (bittensorLauncher?.panel) openVenueRailPane(bittensorLauncher.panel, { primePrompt: true });
                            }}
                          >
                            <WalletIcon className="size-4" />
                            Open Bittensor desk
                          </button>
                        </div>
                        <section className="space-y-3">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-dls-text">Matterhorn Desks</h3>
                              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                                Separate interfaces for TAO, perps, prediction markets, and real-world workflows. Each opens its own rail and starts an editable prompt.
                              </p>
                            </div>
                            <span className="hidden rounded-full border border-dls-border px-2.5 py-1 text-[10px] font-medium text-dls-secondary sm:inline-flex">
                              No hidden auto-send
                            </span>
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2">
                            {protocolWorkflowLaunchers.map((launcher) => {
                              const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[launcher.iconHint];
                              return (
                                <button
                                  key={launcher.id}
                                  type="button"
                                  className="flex min-h-[156px] w-full flex-col items-start gap-3 rounded-2xl border border-[rgba(var(--matterhorn-blue-rgb),0.28)] bg-[rgba(var(--matterhorn-blue-rgb),0.06)] p-4 text-left transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.55)] hover:bg-[rgba(var(--matterhorn-blue-rgb),0.1)]"
                                  onClick={() => {
                                    if (launcher.panel) {
                                      openVenueRailPane(launcher.panel, { primePrompt: true });
                                      return;
                                    }
                                    props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
                                  }}
                                >
                                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--matterhorn-blue)] text-[var(--matterhorn-ink)]">
                                    <Icon className="size-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="text-[14px] font-semibold text-dls-text">{launcher.workspaceDisplayName ?? launcher.title}</span>
                                      <span className="rounded-full border border-[rgba(var(--matterhorn-blue-rgb),0.22)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-primary">
                                        {launcher.statusLabel}
                                      </span>
                                    </span>
                                    <span className="mt-1.5 block text-[12px] leading-5 text-dls-secondary">{launcher.description}</span>
                                    <span className="mt-3 block text-[10px] leading-relaxed text-dls-secondary/90">{launcher.safetySummary}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                        <section className="space-y-3">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-semibold text-dls-text">Monday beta demos</h3>
                              <p className="mt-1 text-xs leading-5 text-dls-secondary">
                                Guided runs for the first 10 test customers. Each inserts an editable prompt and points to an evidence command.
                              </p>
                            </div>
                            <span className="hidden rounded-full border border-dls-border px-2.5 py-1 text-[10px] font-medium text-dls-secondary sm:inline-flex">
                              Public/redacted only
                            </span>
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-2">
                            {mondayBetaDemoCards.map((demo) => {
                              const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[demo.iconHint];
                              return (
                                <button
                                  key={demo.id}
                                  type="button"
                                  className="group flex min-h-[174px] w-full flex-col items-start rounded-2xl border border-dls-border bg-dls-card p-4 text-left shadow-[var(--dls-card-shadow)] transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.45)] hover:bg-dls-hover"
                                  onClick={() => {
                                    if (demo.panel) {
                                      openVenueRailPane(demo.panel, { primePrompt: true, prompt: demo.prompt, source: "monday-beta-demo" });
                                      return;
                                    }
                                    props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, demo.prompt);
                                  }}
                                >
                                  <span className="flex w-full items-start gap-3">
                                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary">
                                      <Icon className="size-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-[13px] font-semibold text-dls-text">{demo.title}</span>
                                        <span className="rounded-full border border-[rgba(var(--matterhorn-blue-rgb),0.22)] bg-[rgba(var(--matterhorn-blue-rgb),0.08)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-primary">
                                          {demo.statusLabel}
                                        </span>
                                      </span>
                                      <span className="mt-1 block text-[11px] leading-relaxed text-dls-secondary">{demo.persona}</span>
                                    </span>
                                  </span>
                                  <span className="mt-3 block text-[11px] leading-5 text-dls-secondary">
                                    <span className="font-medium text-dls-text">Customers:</span> {demo.customers}
                                  </span>
                                  <span className="mt-2 block text-[11px] leading-5 text-dls-secondary">
                                    <span className="font-medium text-dls-text">Expected:</span> {demo.artifactSummary}
                                  </span>
                                  <span className="mt-2 block text-[10px] leading-relaxed text-dls-secondary/90">{demo.safetySummary}</span>
                                  <span className="mt-3 block max-w-full truncate rounded-lg border border-dls-border bg-dls-surface px-2.5 py-1.5 font-mono text-[10px] text-dls-secondary">
                                    {demo.evidenceCommand}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                        <section className="space-y-3">
                          <div>
                            <h3 className="text-sm font-semibold text-dls-text">Business workflows</h3>
                            <p className="mt-1 text-xs leading-5 text-dls-secondary">
                              Use the same chat engine for real-world customer work. Wellness stays separate from Web3 and markets.
                            </p>
                          </div>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-2">
                            {businessWorkflowLaunchers.map((task) => {
                              const Icon = CUSTOMER_WORKFLOW_ICON_COMPONENTS[task.iconHint];
                              return (
                                <button
                                  key={task.id}
                                  type="button"
                                  className="flex min-h-[92px] w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.45)] hover:bg-dls-hover"
                                  onClick={() => {
                                    props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, task.prompt);
                                  }}
                                >
                                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary">
                                    <Icon className="size-4" />
                                  </span>
                                  <span>
                                    <span className="flex flex-wrap items-center gap-2">
                                      <span className="text-[13px] font-medium text-dls-text">{task.title}</span>
                                      <span className="rounded-full border border-dls-border bg-dls-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                                        {task.statusLabel}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 block text-[11px] leading-relaxed text-dls-secondary">{task.description}</span>
                                    <span className="mt-2 block text-[10px] leading-relaxed text-dls-secondary/90">{task.safetySummary}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-2">
                          {blankWorkflowLauncher ? (
                            <button
                              type="button"
                              className="flex min-h-[92px] w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.45)] hover:bg-dls-hover"
                              onClick={() => {
                                props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, blankWorkflowLauncher.prompt);
                              }}
                            >
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary">
                                <FileText className="size-4" />
                              </span>
                              <span>
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-[13px] font-medium text-dls-text">{blankWorkflowLauncher.title}</span>
                                  <span className="rounded-full border border-dls-border bg-dls-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-dls-secondary">
                                    {blankWorkflowLauncher.statusLabel}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-relaxed text-dls-secondary">{blankWorkflowLauncher.description}</span>
                                <span className="mt-2 block text-[10px] leading-relaxed text-dls-secondary/90">{blankWorkflowLauncher.safetySummary}</span>
                              </span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="flex min-h-[92px] w-full items-start gap-3 rounded-xl border border-dls-border bg-dls-surface p-3.5 text-left transition-colors hover:border-[rgba(var(--matterhorn-blue-rgb),0.45)] hover:bg-dls-hover"
                            onClick={() => {
                              props.onOpenSettings?.();
                            }}
                          >
                            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--matterhorn-blue-rgb),0.12)] text-primary">
                              <Settings2 className="size-4" />
                            </span>
                            <span>
                              <span className="block text-[13px] font-medium text-dls-text">Connect MCPs</span>
                              <span className="mt-0.5 block text-[11px] leading-relaxed text-dls-secondary">Add MCP servers, protocol tools, and wallet connectors.</span>
                            </span>
                          </button>
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {shellConfig.statusBar ? (
            <StatusBar
              clientConnected={props.clientConnected}
              matterhornServerStatus={props.matterhornServerStatus}
              developerMode={props.developerMode}
              settingsOpen={props.statusBar?.settingsOpen ?? false}
              onSendFeedback={props.onSendFeedback}
              onOpenSettings={props.onOpenSettings}
              providerConnectedIds={props.providerConnectedIds}
              mcpConnectedCount={props.mcpConnectedCount}
              loading={props.statusBar?.loading ?? false}
              showSettingsButton={props.statusBar?.showSettingsButton}
            />
          ) : null}
              </main>
            </ResizablePanel>
              {sidePanelOpen ? (
              <>
                <ResizableHandle withHandle className="hidden lg:flex" />
                <ResizablePanel
                  panelRef={browserPanelRef}
                  defaultSize={`${activeSidePanel === "extensions" || activeSidePanel === "memory" ? Math.max(browserPanelDefaultWidth, 420) : protocolSidePanelOpen ? Math.max(browserPanelDefaultWidth, 440) : browserPanelDefaultWidth}px`}
                  minSize={activeSidePanel === "extensions" || activeSidePanel === "memory" ? "360px" : protocolSidePanelOpen ? "380px" : "320px"}
                  maxSize={protocolSidePanelOpen || activeSidePanel === "memory" || activeSidePanel === "extensions" ? "58%" : "70%"}
                  className="min-h-0 overflow-hidden lg:flex lg:flex-col"
                >
                  {activeSidePanel === "extensions" && props.settingsSlot ? (
                    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
                      {props.settingsSlot}
                    </div>
                  ) : activeSidePanel === "voice" ? (
                    <VoicePanel
                      client={props.matterhornServerClient}
                      sessionId={props.selectedSessionId}
                      onClose={closeRightPane}
                    />
                  ) : activeSidePanel === "memory" ? (
                    <MemoryPanel
                      client={props.matterhornServerClient}
                      sessionId={props.selectedSessionId}
                      workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
                      onClose={closeRightPane}
                    />
                  ) : activeSidePanel === "artifacts" && visibleArtifactTarget && props.matterhornServerClient && props.runtimeWorkspaceId ? (
                    <ArtifactPanel
                      client={props.matterhornServerClient}
                      workspaceId={props.runtimeWorkspaceId}
                      workspaceRoot={props.selectedWorkspaceRoot}
                      isRemoteWorkspace={props.surface?.isRemoteWorkspace ?? false}
                      target={visibleArtifactTarget}
                      targets={artifactFileTargets}
                      onSelectTarget={openTarget}
                      onClose={closeRightPane}
                    />
                  ) : activeSidePanel === "wallet" || isVenueSidePanel(activeSidePanel) ? (
                    <WalletPanel
                      store={wallet.store}
                      gasPriceGwei={sessionWallet.gasPriceGwei}
                      blockExplorerUrl={sessionWallet.blockExplorerUrl}
                      initialVenue={isVenueSidePanel(activeSidePanel) ? activeSidePanel : "bittensor"}
                    />
                  ) : (
                    <BrowserPanel onClose={closeRightPane} />
                  )}
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
          <aside className="flex w-[84px] shrink-0 flex-col items-center gap-1 border-l border-border bg-background/95 px-1.5 py-2 text-muted-foreground mac:titlebar-no-drag">
            {sidePanelOpen ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground"
                onClick={closeRightPane}
                title="Back to chat"
                aria-label="Back to chat"
              >
                <PanelRightClose size={17} />
                <span className="text-[9px] leading-none">Chat</span>
              </Button>
            ) : null}
            {isElectronRuntime() ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                  browserRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
                onClick={openBrowserRailPane}
                title="Browser"
                aria-label="Browser"
                aria-pressed={browserRailActive}
              >
                <Globe size={17} />
                <span className="text-[9px] leading-none">Browser</span>
              </Button>
            ) : null}
            {voiceExtensionEnabled ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                  voiceRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
                onClick={openVoiceRailPane}
                title="Voice Mode"
                aria-label="Voice Mode"
                aria-pressed={voiceRailActive}
              >
                <Mic2 size={17} />
                <span className="text-[9px] leading-none">Voice</span>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                artifactRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={openArtifactRailPane}
              title={hasArtifactTargets ? `Artifacts (${artifactTargetCount})` : "No artifacts yet"}
              aria-label={hasArtifactTargets ? `Artifacts (${artifactTargetCount})` : "No artifacts yet"}
              aria-pressed={artifactRailActive}
              disabled={!hasArtifactTargets}
            >
              <FileText size={17} />
              <span className="text-[9px] leading-none">Files</span>
              {artifactTargetCount > 0 ? (
                <span className="absolute right-0 top-0 flex min-w-3.5 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-3 text-primary-foreground">
                  {artifactTargetCount > 9 ? "9+" : artifactTargetCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                extensionsRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={props.settingsSlot ? openExtensionsRailPane : props.onOpenSettings}
              title="MCPs & Connectors"
              aria-label="MCPs & Connectors"
              aria-pressed={extensionsRailActive}
            >
              <Settings2 size={17} />
              <span className="text-[9px] leading-none">MCPs</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(
                "relative h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                memoryRailActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              onClick={openMemoryRailPane}
              title={`${memoryInboxLabel}. Review remembered context, use selected memories in chat, forget records, and export evidence.`}
              aria-label={`${memoryInboxLabel}. Review remembered context, use selected memories in chat, forget records, and export evidence.`}
              aria-pressed={memoryRailActive}
            >
              {memorySuggestionUnreadCount > 0 ? <Bell size={17} /> : <Database size={17} />}
              <span className="text-[9px] leading-none">Memory</span>
              {memorySuggestionUnreadCount > 0 ? (
                <span className="absolute right-0 top-0 flex min-w-3.5 translate-x-1 -translate-y-1 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-3 text-primary-foreground">
                  {memorySuggestionUnreadCount > 99 ? "99+" : memorySuggestionUnreadCount}
                </span>
              ) : null}
            </Button>
            <div className="mt-1 w-full border-t border-border/70 pt-2 text-center text-[8px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              Desks
            </div>
            {([
              {
                panel: "bittensor" as const,
                label: "Bittensor",
                title: "Bittensor: TAO, subnets, validators, and staking previews",
                active: bittensorRailActive,
                icon: BrainCircuit,
              },
              {
                panel: "hyperliquid" as const,
                label: "Hyperliquid",
                title: "Hyperliquid: account, orderbook, watches, and external-signer previews",
                active: hyperliquidRailActive,
                icon: BarChart3,
              },
              {
                panel: "polymarket" as const,
                label: "Polymarket",
                title: "Polymarket: markets, outcomes, compliance, and external-signer previews",
                active: polymarketRailActive,
                icon: ShieldCheck,
              },
            ]).map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.panel}
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground",
                    item.active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                  )}
                  onClick={() => openVenueRailPane(item.panel, { primePrompt: true })}
                  title={item.title}
                  aria-label={item.title}
                  aria-pressed={item.active}
                >
                  <Icon size={17} />
                  <span className="text-[9px] leading-none">{item.label}</span>
                </Button>
              );
            })}
            {([
              {
                id: "wellness_creator_workflow",
                label: "Wellness",
                title: "Wellness: client programs, service offers, lifecycle packets, and safe creator workflows",
                icon: Dumbbell,
                launcher: wellnessRailLauncher,
              },
            ]).map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  size="icon-sm"
                  className="h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    if (item.launcher) {
                      dispatchMatterhornMemorySuggestions({
                        desk: "wellness",
                        prompt: item.launcher.prompt,
                        source: "workflow_output",
                        sourceId: "wellness-rail-launcher",
                        workspaceId: props.selectedWorkspaceId,
                        sessionId: props.selectedSessionId,
                        templateId: item.id,
                      });
                    }
                    if (item.launcher && props.sidebar.onCreateTaskWithPrompt) {
                      props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, item.launcher.prompt);
                      return;
                    }
                    props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId);
                  }}
                  title={item.title}
                  aria-label={item.title}
                >
                  <Icon size={17} />
                  <span className="text-[9px] leading-none">{item.label}</span>
                </Button>
              );
            })}
          </aside>
          </div>
        </SidebarInset>
        {shellConfig.sidebar ? <SidebarTrigger className="hidden mac:absolute mac:left-[64px] top-[3px] z-50 mac:flex titlebar-no-drag" /> : null}
      </SidebarProvider>

      {props.providerAuthModal ? <ProviderAuthModal {...props.providerAuthModal} /> : null}

      {props.onRenameSession ? (
        <RenameSessionModal
          open={renameOpen}
          title={renameTitle}
          busy={renameBusy}
          canSave={renameTitle.trim().length > 0 && renameTitle.trim() !== sessionActionTitle.trim()}
          onClose={() => {
            if (!renameBusy) setRenameOpen(false);
          }}
          onSave={() => void submitRename()}
          onTitleChange={setRenameTitle}
        />
      ) : null}

      {props.onDeleteSession ? (
        <ConfirmModal
          open={deleteOpen}
          title={t("session.delete_session_title")}
          message={
            sessionActionTitle.trim()
              ? t("session.delete_named_session_message", { title: sessionActionTitle.trim() })
              : t("session.delete_session_generic")
          }
          confirmLabel={deleteBusy ? t("session.deleting") : t("session.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
        />
      ) : null}

      {props.shareWorkspaceModal ? <ShareWorkspaceModal {...props.shareWorkspaceModal} /> : null}

      {/* Feature 3: TX Pipeline — modal overlay for transaction approval */}
      <TransactionApproval
        store={wallet.store}
        onApprove={() => { void sessionWallet.approveTx(); }}
        onReject={sessionWallet.rejectTx}
        onExecuteBatchStep={sessionWallet.executeBatchStep}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        commands={[
          { id: "send", label: "Send tokens", shortcut: "→ Send", action: () => {/* open send panel */} },
          { id: "swap", label: "Swap tokens (CoW)", shortcut: "→ Swap", action: () => {/* open swap panel */} },
          { id: "aave", label: "Aave deposits", shortcut: "→ Aave", action: () => {/* open aave panel */} },
          { id: "bridge", label: "Bridge assets", shortcut: "→ Bridge", action: () => {/* open bridge panel */} },
          { id: "agent", label: "Agent workspace", shortcut: "→ Agent", action: () => {/* open agent panel */} },
        ]}
      />

      {/* Cloud provider notifications are now handled globally by CloudProvidersToast in app-root.tsx */}
    </div>
  );
}
