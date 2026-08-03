/** @jsxImportSource react */
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import type {
  AgentPartInput,
  FilePartInput,
  ProviderListResponse,
  TextPartInput,
} from "@opencode-ai/sdk/v2/client";
import type { MatterhornBackendModelSelectionResponse } from "@matterhorn-work/types/backend-models";

import { createClient, unwrap } from "../../app/lib/opencode";
import { forkSession, revertSession, shellInSession } from "../../app/lib/opencode-session";
import {
  buildMatterhornWorkspaceBaseUrl,
  createMatterhornServerClient,
  readMatterhornServerSettings,
  type MatterhornServerClient,
  type MatterhornWorkspaceInfo,
} from "../../app/lib/matterhorn-server";
import {
  resolveWorkspaceEndpoint,
  workspaceServerId,
  type ResolvedWorkspaceEndpoint,
} from "../../app/lib/workspace-endpoint";
import { isPublicBetaWebDeployment } from "../../app/lib/matterhorn-deployment";
import { buildMatterhornEnvRuntimeKey } from "../../app/lib/matterhorn-env-runtime";
import {
  engineInfo,
  revealDesktopItemInDir,
  pickDirectory,
  resolveWorkspaceListSelectedId,
  workspaceBootstrap,
  workspaceCreate,
  workspaceCreateRemote,
  workspaceExportConfig,
  workspaceForget,
  workspaceSetRuntimeActive,
  workspaceSetSelected,
  workspaceUpdateDisplayName,
  type EngineInfo,
  type MatterhornServerInfo,
  type WorkspaceInfo,
  type WorkspaceList,
} from "../../app/lib/desktop";
import type {
  ComposerAttachment,
  ComposerDraft,
  ComposerPart,
  ModelOption,
  ModelRef,
  PendingPermission,
  PendingQuestion,
  SlashCommandOption,
  TodoItem,
  WorkspacePreset,
  WorkspaceConnectionState,
  Client,
  ProviderListItem,
  WorkspaceDisplay,
  WorkspaceSessionGroup,
} from "../../app/types";
import {
  getWorkspaceTaskLoadErrorDisplay,
  isDesktopRuntime,
  isSandboxWorkspace,
  normalizeDirectoryPath,
  normalizeSessionStatus,
  resolveModelDisplayName,
  safeStringify,
} from "../../app/utils";
import { t } from "../../i18n";
import { useLocal } from "../kernel/local-provider";
import { usePlatform } from "../kernel/platform";
import { SessionPage } from "../domains/session/chat/session-page";
import {
  clearPendingDeskTask,
  isPendingDeskTaskId,
  readPendingDeskTaskNavigation,
  readPendingDeskTaskReturn,
  writePendingDeskTask,
  type PendingDeskTaskNavigation,
} from "./pending-desk-task";
import { useQuickJot } from "../domains/notes";
import { isDesktopProviderBlocked } from "../../app/cloud/desktop-app-restrictions";
import { useCheckDesktopRestriction } from "../domains/cloud/desktop-config-provider";
import { useRestrictionNotice } from "../domains/cloud/restriction-notice-provider";
import { ReactSessionRuntime } from "../domains/session/sync/runtime-sync";
import { useSessionActivityStore } from "../domains/session/status/session-activity-store";
import {
  buildResponsePerspectiveSystemPrompt,
  readResponsePerspective,
  writeResponsePerspective,
  type ResponsePerspective,
} from "../domains/session/perspectives/response-perspective";
import {
  buildMatterhornExecutionModeSystemPrompt,
  buildMatterhornExecutionModeTools,
  executionModesEnabled,
  readMatterhornExecutionMode,
  writeMatterhornExecutionMode,
  type MatterhornExecutionMode,
} from "../domains/session/modes/execution-mode";
import { buildOpenworkEnvSystemContext } from "../domains/session/sync/env-context";
import {
  permissionKey as reactPermissionKey,
  questionKey as reactQuestionKey,
  seedPermissionState,
  seedQuestionState,
  todoKey as reactTodoKey,
} from "../domains/session/sync/session-sync";
import { CreateRemoteWorkspaceModal } from "../domains/workspace/create-remote-workspace-modal";
import { CreateWorkspaceModal } from "../domains/workspace/create-workspace-modal";
import { createProviderAuthStore, useProviderAuthStoreSnapshot } from "../domains/connections/provider-auth/store";
import { useRemoteAccessRestart } from "../domains/workspace/remote-access-restart";
import { RenameWorkspaceModal } from "../domains/workspace/rename-workspace-modal";
import { useRemoteWorkspaceConnectionEditor } from "../domains/workspace/use-remote-workspace-connection-editor";
import { useCloudProviderAutoSync } from "../domains/cloud/use-cloud-provider-auto-sync";
import {
  diagnoseRemoteWorkspaceTaskLoadFailure,
  getRemoteWorkspaceConnectionKey,
  testRemoteWorkspaceConnection,
} from "../domains/workspace/remote-workspace-diagnostics";
import { useShareWorkspaceState } from "../domains/workspace/share-workspace-state";
import { ModelPickerModal } from "../domains/session/modals/model-picker-modal";
import { CommandPalette, type AccessibleTargetOption, type SessionOption as PaletteSessionOption } from "./command-palette";
import { getDisplaySessionTitle } from "../../app/lib/session-title";
import { useBootState } from "./boot-state";
import {
  forgetWorkspaceMemory,
  readActiveWorkspaceId,
  readLastSessionFor,
  readWorkspaceOrderIds,
  writeActiveWorkspaceId,
  writeLastSessionFor,
  writeWorkspaceOrderIds,
} from "./session-memory";
import {
  publishInspectorSlice,
  recordInspectorEvent,
} from "./app-inspector";
import { saveSessionDraft } from "../domains/session/sync/draft-store";
import { useControlAction, type MatterhornControlAction } from "./control/control-provider";
import { useReactRenderWatchdog } from "./react-render-watchdog";
import { useWallet } from "../domains/wallet/WalletProvider";
import {
  buildDirectResponseSystemPrompt,
  buildMatterhornOrientationSystemPrompt,
  buildCryptoSystemPrompt,
  shouldInjectMatterhornOrientationPrompt,
  shouldInjectCryptoPrompt,
} from "../domains/wallet/prompts/crypto-system-prompt";
import {
  buildMatterhornDeskAgentSystemPrompt,
  getMatterhornDeskAgentById,
} from "@matterhorn-work/types/desk-agents";
import { getCustomerProtocolDeskVisual } from "../domains/session/workflows/protocol-desk-ui";
import {
  buildMatterhornPublicWalletContext,
  compileMatterhornSessionSystemContext,
} from "../domains/session/context/session-system-context";

import { readDenSettings } from "../../app/lib/den";
import { denSessionUpdatedEvent } from "../../app/lib/den-session-events";

import { openModelPickerEvent, pendingModelPickerProviderIdsKey } from "./new-providers-toast";
import {
  getModelBehaviorCapability,
  getModelBehaviorCapabilityLabel,
  getModelBehaviorSummary,
} from "../../app/lib/model-behavior";
import {
  beginModelOperation,
  pendingModelOperation,
  recordModelOperationAccepted,
  recordModelOperationProviderError,
  recordModelReasoningLevelSelection,
} from "../../app/lib/model-operation-metrics";
import { filterProviderList } from "../../app/utils/providers";
import { ensureDesktopLocalMatterhornConnection } from "./desktop-local-matterhorn";
import { resolveMatterhornConnection } from "./matterhorn-connection";
import { useReloadCoordinator } from "./reload-coordinator";
import { getReactQueryClient } from "../infra/query-client";
import { useStatusToasts } from "../domains/shell-feedback/status-toasts";
import { useSessionControlActions } from "../domains/session/control/session-control-actions";
import { resolveSelectedPromptModel } from "../domains/session/model-selection";
import { ProjectFeedbackDialog } from "../domains/feedback/project-feedback-dialog";
import {
  WORKSPACE_MODEL_SELECTION_CHANGED_EVENT,
  type WorkspaceModelSelectionChangedDetail,
} from "../domains/settings/model-selection-events";
import { legacySessionRoute, workspaceNotesRoute, workspaceRunHistoryRoute, workspaceSessionRoute, workspaceSettingsRoute } from "./workspace-routes";
import { GLOBAL_HOME_SIDE_PANEL_KEY, useUiStateStore } from "./ui-state-store";
import { unavailableWorkspaceToast } from "./route-recovery";
import { WorkspaceProvider } from "./workspace-provider";
import type { OpenTarget } from "../domains/session/artifacts/open-target";
import type { SettingsSurfaceProps } from "./settings-route";
import {
  ensureProviderListQuery,
  getConnectedPromptProviderItems,
  hasConnectedPromptProvider,
  isModelAvailableInConnectedProviders,
  refreshProviderListAfterEngineReload,
  useProviderListQuery,
} from "../domains/connections/provider-list-query";

const EmbeddedSettingsSurface = lazy(() => import("./settings-route").then((module) => ({
  default: module.SettingsSurface,
})));

function formatAgentDisplayName(agentId: string | null) {
  if (!agentId) return t("session.default_agent");
  const deskAgent = getMatterhornDeskAgentById(agentId);
  if (deskAgent) return deskAgent.displayName;
  return agentId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type RouteWorkspace = MatterhornWorkspaceInfo & {
  displayNameResolved: string;
};

function EmbeddedSettingsFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-muted-foreground">
      Loading settings...
    </div>
  );
}

function LazyEmbeddedSettingsSurface(props: SettingsSurfaceProps) {
  return (
    <Suspense fallback={<EmbeddedSettingsFallback />}>
      <EmbeddedSettingsSurface {...props} />
    </Suspense>
  );
}

const INTERNAL_WORKSPACE_NAME_PATTERN = /^(?:matterhorn|codex|kimi|minimax|claude)[-_].*|(?:lighthouse|uiux|ui-ux|harness|overhaul)/i;

function customerWorkspaceLabelPart(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const leaf = trimmed.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? trimmed;
  return INTERNAL_WORKSPACE_NAME_PATTERN.test(leaf) ? "" : trimmed;
}

function mapDesktopWorkspace(workspace: WorkspaceInfo): RouteWorkspace {
  return {
    ...workspace,
    displayNameResolved:
      customerWorkspaceLabelPart(workspace.displayName) ||
      customerWorkspaceLabelPart(workspace.matterhornWorkspaceName) ||
      customerWorkspaceLabelPart(workspace.name) ||
      customerWorkspaceLabelPart(workspace.path) ||
      "Matterhorn workspace",
  };
}

/**
 * Serialize an SDK error value into a string that parseSessionError can parse.
 * Preserves the original shape (name, data, message) as JSON when possible,
 * so the session surface can detect ProviderModelNotFoundError and offer
 * recovery actions like "Change model".
 */
function serializeSDKError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      const msg = (error as Record<string, unknown>).message;
      return typeof msg === "string" ? msg : String(error);
    }
  }
  return String(error);
}

function folderNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "workspace";
}

function joinWorkspacePath(root: string, child: string) {
  const trimmed = root.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return child;
  return trimmed.includes("\\") ? `${trimmed}\\${child}` : `${trimmed}/${child}`;
}

function isTransientStartupError(message: string | null | undefined) {
  const value = (message ?? "").toLowerCase();
  return (
    value.includes("timed out") ||
    value.includes("failed to fetch") ||
    value.includes("connection") ||
    value.includes("not ready")
  );
}

function workspaceLabel(workspace: MatterhornWorkspaceInfo) {
  return (
    customerWorkspaceLabelPart(workspace.displayName) ||
    customerWorkspaceLabelPart(workspace.matterhornWorkspaceName) ||
    customerWorkspaceLabelPart(workspace.name) ||
    customerWorkspaceLabelPart(workspace.path) ||
    "Matterhorn workspace"
  );
}

function customerModelProviderLabel(provider: ProviderListItem) {
  const raw = provider.name?.trim() || provider.id;
  if (/opencode/i.test(raw) || /opencode/i.test(provider.id)) {
    return "Included models";
  }
  return raw;
}

const emptyWorkspaceDisplay: WorkspaceDisplay = {
  id: "",
  name: "",
  path: "",
  preset: "default",
  workspaceType: "local",
};

const reloadAfterOrgOnboardingKey = "matterhorn.reloadAfterOrgOnboarding";

function describeRouteError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  const serialized = safeStringify(error);
  return serialized && serialized !== "{}" ? serialized : t("app.unknown_error");
}

function describeWorkspaceCreateError(error: unknown) {
  const message = describeRouteError(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("operation timed out") ||
    lower.includes("os error 60") ||
    lower.includes("etimedout")
  ) {
    return `${message}\n\nMatterhorn Desks could not read the workspace config before the filesystem timed out. This often happens when the folder is still syncing from iCloud Drive or another remote folder. Wait for the folder to finish downloading, move the workspace to a local folder, or try again.`;
  }
  return message;
}

function describeTaskCreateError(error: unknown) {
  const message = describeRouteError(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("opencode_unconfigured") ||
    lower.includes("opencode base url is missing")
  ) {
    return "The local agent engine is not connected. Start Matterhorn Desks with managed engine, or open AI settings to attach an existing engine URL.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("connection") ||
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("connection lost") ||
    lower.includes("internal_error") ||
    lower.includes("unexpected server error")
  ) {
    return "The Matterhorn Desks engine is unavailable for this workspace. Retry once it restarts, or restart Matterhorn Desks if the problem continues.";
  }
  return message;
}

function focusPromptSoon() {
  if (typeof window === "undefined") return;
  const focus = () => window.dispatchEvent(new Event("openwork:focusPrompt"));
  [0, 80, 240, 600].forEach((delay) => window.setTimeout(focus, delay));
}

const emptyPendingPermissions: PendingPermission[] = [];
const emptyPendingQuestions: PendingQuestion[] = [];
const emptyTodos: TodoItem[] = [];
const emptyModelBehaviorOptions: { value: string | null; label: string; description?: string }[] = [];

function useQueryCacheState<T>(queryKey: readonly unknown[] | null, fallback: T): T {
  const queryClient = getReactQueryClient();
  return useSyncExternalStore(
    (callback) => {
      if (!queryKey) return () => {};
      let active = true;
      let queued = false;
      const flush = () => {
        queued = false;
        if (active) callback();
      };
      const enqueueCallback = () => {
        if (queued) return;
        queued = true;
        if (typeof queueMicrotask === "function") {
          queueMicrotask(flush);
        } else {
          window.setTimeout(flush, 0);
        }
      };
      const unsubscribe = queryClient.getQueryCache().subscribe(enqueueCallback);
      return () => {
        active = false;
        unsubscribe();
      };
    },
    () => (queryKey ? queryClient.getQueryData<T>(queryKey) ?? fallback : fallback),
    () => fallback,
  );
}

function mergeRouteWorkspaces(
  serverWorkspaces: MatterhornWorkspaceInfo[],
  desktopWorkspaces: RouteWorkspace[],
): RouteWorkspace[] {
  const desktopById = new Map(desktopWorkspaces.map((workspace) => [workspace.id, workspace]));
  const desktopByPath = new Map(
    desktopWorkspaces.flatMap((workspace) => {
      const path = normalizeDirectoryPath(workspace.path ?? "");
      return path ? [[path, workspace] as const] : [];
    }),
  );

  // If a server workspace's id matches a desktop workspace marked as remote,
  // skip the server's view entirely. The local Matterhorn Desks server may have stale
  // registrations from earlier (buggy) activate calls that show up here as
  // `workspaceType: "local"`, which would otherwise clobber the desktop's
  // remote routing fields and send workspace-scoped requests back to the
  // local server.
  const remoteDesktopIds = new Set(
    desktopWorkspaces.flatMap((workspace) => workspace.workspaceType === "remote" ? [workspace.id] : []),
  );
  const filteredServer = serverWorkspaces.filter((workspace) => !remoteDesktopIds.has(workspace.id));

  const mergedServer = filteredServer.map((workspace) => {
    const match =
      desktopById.get(workspace.id) ??
      desktopByPath.get(normalizeDirectoryPath(workspace.path ?? ""));
    // For local workspaces, prefer the server's view (which knows things like
    // `path` and per-workspace runtime fields) and only fall back to the
    // desktop's display name when the server doesn't provide one.
    const merged = match
      ? {
          ...workspace,
          displayName: workspace.displayName?.trim()
            ? workspace.displayName
            : match.displayName,
          name: match.name?.trim() ? match.name : workspace.name,
        }
      : workspace;
    return {
      ...merged,
      displayNameResolved: workspaceLabel(merged),
    };
  });

  const mergedIds = new Set(mergedServer.map((workspace) => workspace.id));
  const mergedPaths = new Set(
    mergedServer.flatMap((workspace) => {
      const path = normalizeDirectoryPath(workspace.path ?? "");
      return path ? [path] : [];
    }),
  );

  const missingDesktop = desktopWorkspaces.filter((workspace) => {
    if (mergedIds.has(workspace.id)) return false;
    const normalizedPath = normalizeDirectoryPath(workspace.path ?? "");
    if (normalizedPath && mergedPaths.has(normalizedPath)) return false;
    return true;
  });

  return [...mergedServer, ...missingDesktop];
}

function orderRouteWorkspaces(workspaces: RouteWorkspace[], orderIds: string[]): RouteWorkspace[] {
  if (orderIds.length === 0) return workspaces;

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const ordered: RouteWorkspace[] = [];
  const usedIds = new Set<string>();

  for (const id of orderIds) {
    const workspace = workspaceById.get(id);
    if (!workspace || usedIds.has(id)) continue;
    ordered.push(workspace);
    usedIds.add(id);
  }

  for (const workspace of workspaces) {
    if (usedIds.has(workspace.id)) continue;
    ordered.push(workspace);
  }

  return ordered;
}

function toSessionGroups(
  workspaces: RouteWorkspace[],
  sessionsByWorkspaceId: Record<string, any[]>,
  errorsByWorkspaceId: Record<string, string | null>,
  loadingWorkspaceIds: Set<string>,
): WorkspaceSessionGroup[] {
  return workspaces.map((workspace) => ({
    workspace,
    sessions: (sessionsByWorkspaceId[workspace.id] ?? []) as WorkspaceSessionGroup["sessions"],
    status: loadingWorkspaceIds.has(workspace.id)
      ? "loading"
      : errorsByWorkspaceId[workspace.id]
        ? "error"
        : "ready",
    error: errorsByWorkspaceId[workspace.id],
  }));
}

// All workspace-scoped server URLs/clients/tokens come from
// `resolveWorkspaceEndpoint` in apps/app/src/app/lib/workspace-endpoint.ts.
// Don't compose `<baseUrl>/workspace/<id>` here.

function isActiveSessionStatus(status: unknown) {
  return status === "running" || status === "retry" || status === "busy" || status === "streaming";
}

function getSessionStatus(session: any) {
  const status = session?.status ?? session?.state ?? session?.runStatus ?? null;
  return typeof status === "string" ? status : normalizeSessionStatus(status);
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read attachment: ${file.name}`));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

async function draftToParts(draft: ComposerDraft, workspaceRoot: string) {
  const parts: Array<TextPartInput | FilePartInput | AgentPartInput> = [];
  const root = workspaceRoot.trim();

  const toAbsolutePath = (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("/")) return trimmed;
    if (/^[a-zA-Z]:\\/.test(trimmed)) return trimmed;
    if (!root) return "";
    return `${root}/${trimmed}`.replace(/\/\/+/g, "/");
  };

  const filenameFromPath = (path: string) => {
    const normalized = path.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "file";
  };

  for (const part of draft.parts) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "paste") {
      parts.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "agent") {
      parts.push({ type: "agent", name: part.name });
      continue;
    }
    if (part.type === "file") {
      const absolute = toAbsolutePath(part.path);
      if (!absolute) continue;
      parts.push({
        type: "file",
        mime: "text/plain",
        url: `file://${absolute}`,
        filename: filenameFromPath(part.path),
      });
    }
  }

  parts.push(
    ...(await Promise.all(
      draft.attachments.map(async (attachment) => ({
        type: "file" as const,
        url: await fileToDataUrl(attachment.file),
        filename: attachment.name,
        mime: attachment.mimeType,
      })),
    )),
  );

  return parts;
}

export function SessionRoute() {
  const publicBetaWeb = isPublicBetaWebDeployment();
  const executionModeFeatureEnabled = executionModesEnabled();
  const navigate = useNavigate();
  const location = useLocation();
  const { openQuickJot } = useQuickJot();
  const platform = usePlatform();
  const local = useLocal();
  const reloadCoordinator = useReloadCoordinator();
  const { showToast } = useStatusToasts();
  const checkDesktopRestriction = useCheckDesktopRestriction();
  const restrictionNotice = useRestrictionNotice();
  const wallet = useWallet();
  const params = useParams<{ workspaceId?: string; sessionId?: string }>();
  const routeWorkspaceId = params.workspaceId?.trim() || "";
  const selectedSessionId = params.sessionId?.trim() || null;
  // Changing chats must not recreate the workspace bootstrap callback. Keep
  // the latest session id in a ref so refreshRouteState can use it when it
  // reconciles legacy routes without making every chat navigation reboot the
  // full workspace route.
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  selectedSessionIdRef.current = selectedSessionId;
  const isWorkspaceHistoryRoute = Boolean(routeWorkspaceId && /\/history\/?$/.test(location.pathname));
  // A stored hint is for the settings screen to survive a refresh. It is
  // consumed here only after the person explicitly returns from setup; the
  // short-lived marker survives React Router's state loss during bootstrap.
  const pendingDeskTask = useMemo(
    () => (
      readPendingDeskTaskNavigation(location.state) ??
      readPendingDeskTaskReturn(location.search)
    ),
    [location.search, location.state],
  );
  const navigateToWorkspaceSession = useCallback((workspaceId: string, sessionId?: string | null, options?: { replace?: boolean; state?: unknown }) => {
    const id = workspaceId.trim();
    if (!id) {
      navigate(legacySessionRoute(sessionId), options);
      return;
    }
    navigate(workspaceSessionRoute(id, sessionId), options);
  }, [navigate]);

  const { markRouteReady: markBootRouteReady } = useBootState();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<MatterhornServerClient | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [hostToken, setHostToken] = useState("");
  const [workspaces, setWorkspaces] = useState<RouteWorkspace[]>([]);
  const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>(() => readWorkspaceOrderIds());
  const [sessionsByWorkspaceId, setSessionsByWorkspaceId] = useState<Record<string, any[]>>({});
  const [errorsByWorkspaceId, setErrorsByWorkspaceId] = useState<Record<string, string | null>>({});
  const [workspaceConnectionOverrides, setWorkspaceConnectionOverrides] = useState<Record<string, WorkspaceConnectionState>>({});
  const [routeError, setRouteError] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [legacySelectedWorkspaceId, setLegacySelectedWorkspaceId] = useState<string>(() => readActiveWorkspaceId() ?? "");
  const selectedWorkspaceId = routeWorkspaceId || legacySelectedWorkspaceId;
  const handlePendingDeskTaskRestored = useCallback(() => {
    const workspaceId = selectedWorkspaceId || routeWorkspaceId;
    clearPendingDeskTask(workspaceId);
    navigateToWorkspaceSession(workspaceId, selectedSessionId, { replace: true });
  }, [
    navigateToWorkspaceSession,
    routeWorkspaceId,
    selectedSessionId,
    selectedWorkspaceId,
  ]);
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? (selectedWorkspaceId ? null : workspaces[0] ?? null),
    [selectedWorkspaceId, workspaces],
  );
  // Workspace-scoped API calls (sessions, events, activate, opencode/*) must
  // hit the worker that owns the workspace, not the user's local server. The
  // single source of truth for that routing is `resolveWorkspaceEndpoint`.
  //
  // We read the latest local server's baseUrl/token through a ref so the
  // `endpointForWorkspace` callback stays permanently stable. Otherwise it
  // would change on every `setBaseUrl`/`setToken`, which used to cascade up
  // through `loadWorkspaceSessionsInBackground` and `refreshRouteState` and
  // produce a tight render-refresh-setWorkspaces loop.
  const localServerRef = useRef<{ baseUrl: string; token: string; hostToken: string }>({
    baseUrl: "",
    token: "",
    hostToken: "",
  });
  useEffect(() => {
    localServerRef.current = { baseUrl, token, hostToken };
  }, [baseUrl, hostToken, token]);
  const endpointForWorkspace = useCallback(
    (workspace: RouteWorkspace | null | undefined): ResolvedWorkspaceEndpoint | null =>
      resolveWorkspaceEndpoint(workspace, localServerRef.current),
    [],
  );
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [responsePerspective, setResponsePerspective] = useState<ResponsePerspective>("balanced");
  const [executionMode, setExecutionMode] = useState<MatterhornExecutionMode>("work");
  // One-way latch for "a refreshRouteState is currently running"; prevents
  // overlapping route refreshes from queueing up when the user clicks fast.
  const refreshInFlightRef = useRef(false);
  const reloadEventCursorByWorkspaceRef = useRef<Record<string, number | null>>({});
  const workspacesRef = useRef<RouteWorkspace[]>([]);
  const workspaceOrderIdsRef = useRef(workspaceOrderIds);
  const remoteWorkspaceCheckRunRef = useRef<Record<string, string>>({});
  const remoteWorkspaceCheckRunCounterRef = useRef(0);
  const sessionsByWorkspaceIdRef = useRef<Record<string, any[]>>({});
  const pendingCreatedSessionIdsRef = useRef<Record<string, Record<string, number>>>({});
  const staleSessionRecoveryRef = useRef("");
  const staleWorkspaceRecoveryRef = useRef("");
  const startupRetryTimerRef = useRef<number | null>(null);
  const [retryingWorkspaceIds, setRetryingWorkspaceIds] = useState<string[]>([]);
  const launchActivatedWorkspaceIdsRef = useRef(new Set<string>());
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [createWorkspaceBusy, setCreateWorkspaceBusy] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [createWorkspaceRemoteBusy, setCreateWorkspaceRemoteBusy] = useState(false);
  const [createWorkspaceRemoteError, setCreateWorkspaceRemoteError] = useState<string | null>(null);
  const [renameWorkspaceId, setRenameWorkspaceId] = useState<string | null>(null);
  const [renameWorkspaceTitle, setRenameWorkspaceTitle] = useState("");
  const [renameWorkspaceBusy, setRenameWorkspaceBusy] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteAccessibleTargets, setPaletteAccessibleTargets] = useState<OpenTarget[]>([]);
  // Model picker modal state (ported from settings-route; previously the
  // session "Pick a model" button navigated to /settings/general, which is a
  // dead-end). Loads providers lazily when the modal opens.
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  // initialTab removed — model picker no longer has tabs
  const [compactModelPickerOpen, setCompactModelPickerOpen] = useState(false);
  const [modelPickerQuery, setModelPickerQuery] = useState("");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [providerDefaults, setProviderDefaults] = useState<Record<string, string>>({});
  const [providerConnectedIds, setProviderConnectedIds] = useState<string[]>([]);
  const [disabledProviderIds, setDisabledProviderIds] = useState<string[]>([]);
  const [workspaceModelSelection, setWorkspaceModelSelection] = useState<MatterhornBackendModelSelectionResponse | null>(null);
  // Bump to re-filter provider list when den session changes (sign-in/out)
  const [denSessionVersion, setDenSessionVersion] = useState(0);
  useEffect(() => {
    const handler = () => setDenSessionVersion((v) => v + 1);
    window.addEventListener(denSessionUpdatedEvent, handler);
    return () => window.removeEventListener(denSessionUpdatedEvent, handler);
  }, []);
  // Provider IDs that were just added — used to highlight them as
  // "Recently added" in the model picker even after they've been
  // marked as seen in localStorage.
  const [recentProviderIds, setRecentProviderIds] = useState<Set<string>>(new Set());
  // Open model picker when the global toast's "Pick a new default?" is clicked
  useEffect(() => {
    const handler = (event: Event) => {
      try {
        window.localStorage.removeItem(pendingModelPickerProviderIdsKey);
      } catch {}
      const detail = (event as CustomEvent<{ newProviderIds?: string[]; initialTab?: "default" | "available" }>).detail;
      const ids = detail?.newProviderIds;
      if (ids && ids.length > 0) {
        setRecentProviderIds(new Set(ids));
      }
      setModelPickerOpen(true);
    };
    window.addEventListener(openModelPickerEvent, handler);
    return () => window.removeEventListener(openModelPickerEvent, handler);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(pendingModelPickerProviderIdsKey);
      if (!raw) return;
      window.localStorage.removeItem(pendingModelPickerProviderIdsKey);
      const parsed = JSON.parse(raw);
      const ids = Array.isArray(parsed) ? parsed : parsed?.newProviderIds;
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
        setRecentProviderIds(new Set(ids));
      }
      setModelPickerOpen(true);
    } catch {
      window.localStorage.removeItem(pendingModelPickerProviderIdsKey);
    }
  }, []);
  useEffect(() => {
    setPaletteAccessibleTargets([]);
  }, [selectedSessionId, selectedWorkspaceId]);
  useEffect(() => {
    setResponsePerspective(readResponsePerspective(selectedWorkspaceId, selectedSessionId));
  }, [selectedSessionId, selectedWorkspaceId]);
  useEffect(() => {
    setExecutionMode(readMatterhornExecutionMode(selectedWorkspaceId, selectedSessionId));
  }, [selectedSessionId, selectedWorkspaceId]);
  const handleResponsePerspectiveChange = useCallback((perspective: ResponsePerspective) => {
    setResponsePerspective(perspective);
    writeResponsePerspective(selectedWorkspaceId, selectedSessionId, perspective);
  }, [selectedSessionId, selectedWorkspaceId]);
  const handleExecutionModeChange = useCallback((mode: MatterhornExecutionMode) => {
    if (!executionModeFeatureEnabled) return;
    if (mode === executionMode) return;
    const previousMode = executionMode;
    setExecutionMode(mode);
    writeMatterhornExecutionMode(selectedWorkspaceId, selectedSessionId, mode);
    recordInspectorEvent("session.execution_mode.changed", {
      workspaceId: selectedWorkspaceId,
      sessionId: selectedSessionId,
      previousMode,
      mode,
    });
    if (client && selectedWorkspaceId && selectedSessionId) {
      void client.recordSessionExecutionMode(selectedWorkspaceId, selectedSessionId, mode, previousMode).catch(() => undefined);
    }
  }, [client, executionMode, executionModeFeatureEnabled, selectedSessionId, selectedWorkspaceId]);

  const [permissionReplyBusy, setPermissionReplyBusy] = useState(false);
  const permissionReplyBusyRef = useRef(false);
  const [questionReplyBusy, setQuestionReplyBusy] = useState(false);
  const questionReplyBusyRef = useRef(false);
  // Provider catalog cache. Used to compute the reasoning/thinking variant
  // options for whichever model is currently selected so the composer's
  // behavior pill actually shows its options (bug: was empty before).
  const [providerCatalog, setProviderCatalog] = useState<Record<string, Record<string, any>>>({});
  const [matterhornServerHostInfoState, setOpenworkServerHostInfoState] = useState<MatterhornServerInfo | null>(null);
  useReactRenderWatchdog("SessionRoute", {
    selectedSessionId,
    selectedWorkspaceId,
    loading,
    workspaceCount: workspaces.length,
    sessionGroupCount: Object.keys(sessionsByWorkspaceId).length,
    commandPaletteOpen,
    modelPickerOpen,
  });
  const [matterhornServerSettingsVersion, setOpenworkServerSettingsVersion] = useState(0);
  const [engineReloadVersion, setEngineReloadVersion] = useState(0);
  const [routeEngineInfo, setRouteEngineInfo] = useState<EngineInfo | null>(null);
  const reconnectAttemptedWorkspaceIdRef = useRef("");

  const matterhornServerSettings = useMemo(
    () => readMatterhornServerSettings(),
    [matterhornServerSettingsVersion],
  );

  const shareWorkspaceState = useShareWorkspaceState({
    workspaces,
    matterhornServerHostInfo: matterhornServerHostInfoState,
    matterhornServerSettings,
    engineInfo: routeEngineInfo,
    exportWorkspaceBusy: false,
    openLink: (url) => platform.openLink(url),
    workspaceLabel,
  });

  const activeReloadBlockingSessions = useMemo(
    () =>
      Object.values(sessionsByWorkspaceId)
        .flat()
        .flatMap((session: any) => {
          if (!isActiveSessionStatus(getSessionStatus(session))) return [];
          const id = String(session?.id ?? "");
          if (!id) return [];
          return [{
            id,
            title:
              String(session?.title ?? session?.slug ?? session?.id ?? "").trim() ||
              t("session.untitled"),
          }];
        }),
    [sessionsByWorkspaceId],
  );
  const activeSelectedWorkspaceSessionIds = useMemo(
    () =>
      (sessionsByWorkspaceId[selectedWorkspaceId] ?? []).flatMap((session: any) => {
        if (!isActiveSessionStatus(getSessionStatus(session))) return [];
        const id = String(session?.id ?? "").trim();
        return id ? [id] : [];
      }),
    [selectedWorkspaceId, sessionsByWorkspaceId],
  );
  const backgroundSessionLoadInFlight = useRef<Map<string, number>>(new Map());
  const rememberPendingCreatedSession = useCallback((workspaceId: string, sessionId: string) => {
    const id = sessionId.trim();
    if (!workspaceId || !id) return;
    pendingCreatedSessionIdsRef.current[workspaceId] = {
      ...(pendingCreatedSessionIdsRef.current[workspaceId] ?? {}),
      [id]: Date.now(),
    };
  }, []);
  const mergeFetchedSessionsWithPending = useCallback((workspaceId: string, fetched: any[], current: any[]) => {
    const pending = pendingCreatedSessionIdsRef.current[workspaceId];
    if (!pending) return fetched;

    const now = Date.now();
    const fetchedIds = new Set(fetched.flatMap((session: any) => session?.id ? [String(session.id)] : []));
    const pendingIds = Object.keys(pending);

    for (const id of pendingIds) {
      if (fetchedIds.has(id)) {
        delete pending[id];
      }
    }

    const preserved = current.filter((session: any) => {
      const id = String(session?.id ?? "");
      if (!id || fetchedIds.has(id)) return false;
      const createdAt = pending[id];
      if (typeof createdAt !== "number") return false;
      if (now - createdAt > 30_000) {
        delete pending[id];
        return false;
      }
      return true;
    });

    if (Object.keys(pending).length === 0) {
      delete pendingCreatedSessionIdsRef.current[workspaceId];
    }

    return preserved.length > 0 ? [...preserved, ...fetched] : fetched;
  }, []);
  const loadWorkspaceSessionsInBackground = useCallback(
    async (workspaces: RouteWorkspace[]) => {
      const MAX_ATTEMPTS = 6;
      const backoffMs = (attempt: number) => Math.min(500 * Math.pow(2, attempt), 4_000);

      const fetchOnce = async (workspace: RouteWorkspace, attempt: number): Promise<void> => {
        const isRemoteOpenworkWorkspace = workspace.workspaceType === "remote" && workspace.remoteType !== "opencode";
        const endpoint = endpointForWorkspace(workspace);
        if (!endpoint) {
          if (workspace.workspaceType === "remote") {
            const message = publicBetaWeb
              ? "This Cloud project is not ready yet. Return to Matterhorn Cloud to finish setup."
              : "Remote worker URL is missing. Edit connection and add a server URL.";
            setErrorsByWorkspaceId((current) => ({ ...current, [workspace.id]: message }));
            setWorkspaceConnectionOverrides((current) => ({
              ...current,
              [workspace.id]: {
                status: "error",
                message,
                checkedAt: Date.now(),
              },
            }));
            setRetryingWorkspaceIds((current) =>
              current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
            );
          }
          return;
        }
        const startedAt = backgroundSessionLoadInFlight.current.get(workspace.id) ?? 0;
        if (startedAt && Date.now() - startedAt < 5_000) return;
        const requestStartedAt = Date.now();
        backgroundSessionLoadInFlight.current.set(workspace.id, requestStartedAt);
        if (isRemoteOpenworkWorkspace) {
          setWorkspaceConnectionOverrides((current) => ({
            ...current,
            [workspace.id]: {
              status: "connecting",
              message: t("workspace_list.loading_remote_tasks"),
              checkedAt: null,
            },
          }));
        }
        try {
          const response = await endpoint.client.listSessions(endpoint.workspaceId, { limit: 200 });
          // The workspace endpoint already scopes sessions to this workspace.
          // Re-filtering by the browser-visible path breaks valid macOS aliases
          // such as /tmp and its canonical /private/tmp realpath.
          const items = response.items ?? [];
          setSessionsByWorkspaceId((current) => {
            const nextItems = mergeFetchedSessionsWithPending(workspace.id, items, current[workspace.id] ?? []);
            const next = { ...current, [workspace.id]: nextItems };
            sessionsByWorkspaceIdRef.current = next;
            return next;
          });
          setErrorsByWorkspaceId((current) => ({ ...current, [workspace.id]: null }));
          setWorkspaceConnectionOverrides((current) => {
            if (isRemoteOpenworkWorkspace) {
              return {
                ...current,
                [workspace.id]: {
                  status: "connected",
                  message: items.length > 0
                    ? t("workspace_list.connected_loaded_tasks", { count: items.length })
                    : t("workspace.connected_no_tasks"),
                  checkedAt: Date.now(),
                },
              };
            }
            if (current[workspace.id]?.status !== "error") return current;
            const next = { ...current };
            delete next[workspace.id];
            return next;
          });
          setRetryingWorkspaceIds((current) =>
            current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
          );
          // When a workspace returns zero sessions during the initial batch
          // load, OpenCode may still be warming up its index.  Schedule a
          // single delayed retry so the sidebar doesn't stay permanently
          // empty while the managed engine finishes starting.
          if (items.length === 0 && attempt === 0) {
            window.setTimeout(() => {
              if (backgroundSessionLoadInFlight.current.get(workspace.id)) return;
              backgroundSessionLoadInFlight.current.delete(workspace.id);
              void fetchOnce(workspace, 1);
            }, 3_000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : t("app.unknown_error");
          // The first cold call to OpenCode's /session endpoint often hits
          // the 12s server timeout while the daemon finishes warming up
          // its index. Retry silently with backoff until we get a response
          // or run out of attempts — the sidebar keeps its "loading" state
          // in the meantime instead of flashing "error" next to the
          // workspace name.
          if (attempt + 1 < MAX_ATTEMPTS && isTransientStartupError(message)) {
            if (backgroundSessionLoadInFlight.current.get(workspace.id) === requestStartedAt) {
              backgroundSessionLoadInFlight.current.delete(workspace.id);
            }
            await new Promise((r) => window.setTimeout(r, backoffMs(attempt)));
            await fetchOnce(workspace, attempt + 1);
            return;
          }
          // Final failure: keep local workspace startup quiet, but give
          // remote workers a precise endpoint/token/workspace diagnostic.
          if (workspace.workspaceType === "remote" && !publicBetaWeb) {
            const connectionState = await diagnoseRemoteWorkspaceTaskLoadFailure(workspace, message);
            setErrorsByWorkspaceId((current) => ({
              ...current,
              [workspace.id]: connectionState.message ?? "Remote worker connection failed.",
            }));
            setWorkspaceConnectionOverrides((current) => {
              return {
                ...current,
                [workspace.id]: connectionState,
              };
            });
          } else if (workspace.workspaceType === "remote") {
            const cloudMessage = "This Cloud project is temporarily unavailable. Reload, or return to Matterhorn Cloud if it persists.";
            setErrorsByWorkspaceId((current) => ({ ...current, [workspace.id]: cloudMessage }));
            setWorkspaceConnectionOverrides((current) => ({
              ...current,
              [workspace.id]: {
                status: "error",
                message: cloudMessage,
                checkedAt: Date.now(),
              },
            }));
          }
          setRetryingWorkspaceIds((current) =>
            current.includes(workspace.id) ? current.filter((id) => id !== workspace.id) : current,
          );
        } finally {
          if (backgroundSessionLoadInFlight.current.get(workspace.id) === requestStartedAt) {
            backgroundSessionLoadInFlight.current.delete(workspace.id);
          }
        }
      };

      await Promise.all(workspaces.map((workspace) => fetchOnce(workspace, 0)));
    },
    [endpointForWorkspace, mergeFetchedSessionsWithPending, publicBetaWeb],
  );

  const refreshRouteState = useCallback(async () => {
    // Dedupe: if a refresh is already running, skip this call. Fast workspace
    // switches used to fire 5-6 overlapping refreshRouteState() calls which
    // each fetched workspaces + sessions for every workspace. That workload
    // multiplied quickly on the event loop and caused the UI to freeze.
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLoading(true);
    setRouteError(null);
    let desktopList: WorkspaceList | null = null;
    let desktopWorkspaces = workspacesRef.current;
    let routeReadyAfterRefresh = true;
    try {
      if (isDesktopRuntime()) {
        try {
          desktopList = await workspaceBootstrap() as WorkspaceList;
          desktopWorkspaces = (desktopList.workspaces ?? []).map(mapDesktopWorkspace);
        } catch (error) {
          const message = describeRouteError(error);
          console.error("[session-route] workspaceBootstrap failed", error);
          recordInspectorEvent("route.workspace_bootstrap.error", {
            route: "session",
            message,
            preservedWorkspaceCount: workspacesRef.current.length,
          });
          desktopWorkspaces = workspacesRef.current;
        }
      }

      const { normalizedBaseUrl, resolvedToken, resolvedHostToken, hostInfo } = await resolveMatterhornConnection();
      setOpenworkServerHostInfoState(hostInfo);
      if (!normalizedBaseUrl || (!resolvedToken && !publicBetaWeb)) {
        // Keep `localServerRef` in lockstep with the disconnected state.
        // Otherwise a previously-cached baseUrl/token would still resolve a
        // (now invalid) endpoint for any callback that consults the ref.
        localServerRef.current = { baseUrl: "", token: "", hostToken: "" };
        setClient(null);
        setBaseUrl("");
        setToken("");
        setHostToken("");
        const orderedDesktopWorkspaces = orderRouteWorkspaces(desktopWorkspaces, workspaceOrderIdsRef.current);
        setWorkspaces(orderedDesktopWorkspaces);
        sessionsByWorkspaceIdRef.current = {};
        setSessionsByWorkspaceId({});
        setErrorsByWorkspaceId({});
        setLegacySelectedWorkspaceId(resolveWorkspaceListSelectedId(desktopList) || orderedDesktopWorkspaces[0]?.id || "");
        return;
      }

      // Update the local-server ref synchronously, BEFORE we kick off any
      // workspace-scoped requests below. `endpointForWorkspace` reads from
      // this ref synchronously; the `useEffect` that mirrors `[baseUrl,
      // token]` into the ref doesn't run until after the next React commit,
      // which is too late for the `activateWorkspace` and
      // `loadWorkspaceSessionsInBackground` calls that fire later in this
      // function. Stale ref => `resolveWorkspaceEndpoint` returns null for
      // local workspaces => sidebar gets stuck in "loading" forever.
      localServerRef.current = {
        baseUrl: normalizedBaseUrl,
        token: resolvedToken,
        hostToken: resolvedHostToken,
      };

      const matterhornClient = createMatterhornServerClient({
        baseUrl: normalizedBaseUrl,
        token: resolvedToken || undefined,
        hostToken: resolvedHostToken || undefined,
      });
      const list = await matterhornClient.listWorkspaces();
      const nextWorkspaces = orderRouteWorkspaces(
        mergeRouteWorkspaces(list.items, desktopWorkspaces),
        workspaceOrderIdsRef.current,
      );

      // Preserve any sessions we already have cached so switching routes
      // doesn't erase the sidebar while we refetch.
      const alreadyLoadedWorkspaceIds = new Set(Object.keys(sessionsByWorkspaceIdRef.current));
      const cachedEntries = nextWorkspaces.map((workspace) => ({
        workspaceId: workspace.id,
        sessions: sessionsByWorkspaceIdRef.current[workspace.id] ?? [],
      }));
      // Prefer, in order: the URL-selected workspace (if it owns the session),
      // the user's last-active workspace from localStorage, the desktop's
      // activeId, the server's activeId, then the first known workspace.
      const persistedActiveId = readActiveWorkspaceId();
      let nextWorkspaceId =
        (routeWorkspaceId && nextWorkspaces.some((w) => w.id === routeWorkspaceId)
          ? routeWorkspaceId
          : "") ||
        (persistedActiveId && nextWorkspaces.some((w) => w.id === persistedActiveId)
          ? persistedActiveId
          : "") ||
        resolveWorkspaceListSelectedId(desktopList) ||
        list.activeId?.trim() ||
        nextWorkspaces[0]?.id ||
        "";
      const routeSessionId = selectedSessionIdRef.current;
      if (routeSessionId) {
        const match = cachedEntries.find((entry) =>
          entry.sessions.some((session: any) => session?.id === routeSessionId),
        );
        if (match?.workspaceId) nextWorkspaceId = match.workspaceId;
      }

      setClient(matterhornClient);
      setBaseUrl(normalizedBaseUrl);
      setToken(resolvedToken);
      setHostToken(resolvedHostToken);
      setWorkspaces(nextWorkspaces);
      const nextSessionsByWorkspaceId = Object.fromEntries(cachedEntries.map((entry) => [entry.workspaceId, entry.sessions]));
      sessionsByWorkspaceIdRef.current = nextSessionsByWorkspaceId;
      setSessionsByWorkspaceId(nextSessionsByWorkspaceId);
      setErrorsByWorkspaceId((previous) => {
        const next: Record<string, string | null> = {};
        for (const workspace of nextWorkspaces) {
          next[workspace.id] = previous[workspace.id] ?? null;
        }
        return next;
      });
      setRetryingWorkspaceIds(
        cachedEntries.flatMap((entry) =>
          entry.sessions.length === 0 &&
          (entry.workspaceId === nextWorkspaceId || !alreadyLoadedWorkspaceIds.has(entry.workspaceId))
            ? [entry.workspaceId]
            : [],
        ),
      );
      setLegacySelectedWorkspaceId(nextWorkspaceId);
      writeActiveWorkspaceId(nextWorkspaceId || null);
      // Mark the chosen workspace as active on the server so that the
      // OpenCode engine bound to it re-reads opencode.jsonc and applies
      // permissions. Fire-and-forget; the route is idempotent and any
      // transport failure is non-fatal. See issue #870.
      if (nextWorkspaceId && list.activeId !== nextWorkspaceId && !launchActivatedWorkspaceIdsRef.current.has(nextWorkspaceId)) {
        launchActivatedWorkspaceIdsRef.current.add(nextWorkspaceId);
        const nextWorkspace = nextWorkspaces.find((workspace) => workspace.id === nextWorkspaceId) ?? null;
        const nextEndpoint = endpointForWorkspace(nextWorkspace);
        if (nextEndpoint) {
          void nextEndpoint.client.activateWorkspace(nextEndpoint.workspaceId).catch(() => undefined);
        }
      }
      recordInspectorEvent("route.refresh.complete", {
        workspaces: nextWorkspaces.length,
        selectedWorkspaceId: nextWorkspaceId,
        errors: {},
      });

      // Session list comes from OpenCode's index and can be slow on cold
      // boot. Kick it off in the background instead of blocking the route
      // so the UI is interactive immediately; the sidebar shows a
      // loading state per-workspace until the list arrives.
      const selectedWorkspace = nextWorkspaces.find((workspace) => workspace.id === nextWorkspaceId);
      const backgroundWorkspaces = nextWorkspaces.filter(
        (workspace) => workspace.id === nextWorkspaceId || !alreadyLoadedWorkspaceIds.has(workspace.id),
      );
      if (backgroundWorkspaces.length > 0) {
        const orderedWorkspaces = selectedWorkspace
          ? [selectedWorkspace, ...backgroundWorkspaces.filter((workspace) => workspace.id !== selectedWorkspace.id)]
          : backgroundWorkspaces;
        void loadWorkspaceSessionsInBackground(orderedWorkspaces);
      }
    } catch (error) {
      const message = describeRouteError(error);
      if (isTransientStartupError(message) && desktopWorkspaces.length > 0) {
        recordInspectorEvent("route.refresh.transient", {
          route: "session",
          message,
          preservedWorkspaceCount: desktopWorkspaces.length,
        });
        const orderedDesktopWorkspaces = orderRouteWorkspaces(desktopWorkspaces, workspaceOrderIdsRef.current);
        setWorkspaces(orderedDesktopWorkspaces);
        setLegacySelectedWorkspaceId((current) =>
          current || resolveWorkspaceListSelectedId(desktopList) || orderedDesktopWorkspaces[0]?.id || "",
        );
        if (startupRetryTimerRef.current === null) {
          startupRetryTimerRef.current = window.setTimeout(() => {
            startupRetryTimerRef.current = null;
            refreshInFlightRef.current = false;
            void refreshRouteState();
          }, 1_000);
        }
        return;
      }
      console.error("[session-route] refreshRouteState failed", error);
      recordInspectorEvent("route.refresh.error", {
        route: "session",
        message,
        preservedWorkspaceCount: desktopWorkspaces.length,
      });
      setRouteError(message);
      if (desktopWorkspaces.length > 0) {
        const orderedDesktopWorkspaces = orderRouteWorkspaces(desktopWorkspaces, workspaceOrderIdsRef.current);
        setWorkspaces(orderedDesktopWorkspaces);
        setLegacySelectedWorkspaceId((current) =>
          current || resolveWorkspaceListSelectedId(desktopList) || orderedDesktopWorkspaces[0]?.id || "",
        );
      }
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
      // Tell the boot overlay the first route data load has completed so
      // the overlay dismisses after BOTH the desktop boot and the workspace
      // list/sessions are ready.
      if (routeReadyAfterRefresh) {
        markBootRouteReady();
      }
    }
  }, [loadWorkspaceSessionsInBackground, markBootRouteReady, routeWorkspaceId]);

  const remoteAccessRestart = useRemoteAccessRestart({
    isEnabled: () => matterhornServerSettings.remoteAccessEnabled === true,
    onHostInfo: setOpenworkServerHostInfoState,
    onSettingsChanged: () => setOpenworkServerSettingsVersion((value) => value + 1),
  });

  const reloadWorkspaceEngineFromUi = useCallback(async () => {
    if (!client || !selectedWorkspaceId) {
      setRouteError(t("app.error_connect_first"));
      return false;
    }
    const endpoint = endpointForWorkspace(selectedWorkspace);
    if (!endpoint) {
      setRouteError(t("app.error_connect_first"));
      return false;
    }
    await endpoint.client.reloadEngine(endpoint.workspaceId);
    refreshProviderListAfterEngineReload(getReactQueryClient());
    setEngineReloadVersion((v) => v + 1);
    try {
      window.dispatchEvent(new CustomEvent("openwork-server-settings-changed"));
    } catch {
      // ignore browser event dispatch failures
    }
    await refreshRouteState();
    return true;
  }, [client, endpointForWorkspace, refreshRouteState, selectedWorkspace, selectedWorkspaceId]);

  useEffect(() => {
    return reloadCoordinator.registerWorkspaceReloadControls({
      canReloadWorkspaceEngine: () => Boolean(client && selectedWorkspaceId),
      reloadWorkspaceEngine: reloadWorkspaceEngineFromUi,
      activeSessions: () => activeReloadBlockingSessions,
    });
  }, [activeReloadBlockingSessions, client, reloadCoordinator, reloadWorkspaceEngineFromUi, selectedWorkspaceId]);

  useEffect(() => {
    if (!reloadCoordinator.canReloadWorkspaceEngine) return;
    try {
      if (window.localStorage.getItem(reloadAfterOrgOnboardingKey) !== "1") return;
    } catch {
      return;
    }
    if (!reloadCoordinator.reloadPending) {
      reloadCoordinator.markReloadRequired("config", {
        type: "config",
        name: "opencode.json",
        action: "updated",
      });
      return;
    }
    try {
      window.localStorage.removeItem(reloadAfterOrgOnboardingKey);
    } catch {}
    void reloadCoordinator.reloadWorkspaceEngine();
  }, [reloadCoordinator, reloadCoordinator.canReloadWorkspaceEngine, reloadCoordinator.reloadPending]);

  useEffect(() => {
    if (!client || !selectedWorkspaceId) return;
    const endpoint = endpointForWorkspace(selectedWorkspace);
    if (!endpoint) return;
    let cancelled = false;

    const pollReloadEvents = async () => {
      const currentCursor = reloadEventCursorByWorkspaceRef.current[selectedWorkspaceId];
      try {
        const response = await endpoint.client.listReloadEvents(
          endpoint.workspaceId,
          typeof currentCursor === "number" ? { since: currentCursor } : undefined,
        );
        if (cancelled) return;
        reloadEventCursorByWorkspaceRef.current[selectedWorkspaceId] =
          typeof response.cursor === "number"
            ? response.cursor
            : Math.max(currentCursor ?? 0, ...((response.items ?? []).map((item: any) => Number(item.seq) || 0)));
        // The first poll establishes the server cursor so historical reload
        // events don't show a stale toast on route entry. Subsequent polls mark
        // new filesystem/server-side mutations, including skills created by an
        // agent while the session page is open.
        if (currentCursor === undefined || currentCursor === null) return;
        for (const event of response.items ?? []) {
          reloadCoordinator.markReloadRequired(event.reason, event.trigger);
        }
      } catch {
        // Reload-event polling is best-effort; normal route health checks still
        // surface connection failures.
      }
    };

    void pollReloadEvents();
    const interval = window.setInterval(() => void pollReloadEvents(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client, endpointForWorkspace, reloadCoordinator, selectedWorkspace, selectedWorkspaceId]);

  const handleRuntimeSessionUpdated = useCallback((update: { sessionId: string; info: Record<string, unknown> }) => {
    if (!selectedWorkspaceId) return;
    setSessionsByWorkspaceId((current) => {
      const list = current[selectedWorkspaceId] ?? [];
      const index = list.findIndex((session: any) => session?.id === update.sessionId);
      if (index < 0) return current;
      const nextSession = { ...list[index], ...update.info, id: update.sessionId };
      if (JSON.stringify(nextSession) === JSON.stringify(list[index])) return current;
      const nextList = [...list];
      nextList[index] = nextSession;
      const next = { ...current, [selectedWorkspaceId]: nextList };
      sessionsByWorkspaceIdRef.current = next;
      return next;
    });
  }, [selectedWorkspaceId]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    workspaceOrderIdsRef.current = workspaceOrderIds;
  }, [workspaceOrderIds]);

  useEffect(() => {
    const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
    setWorkspaceConnectionOverrides((current) => {
      let changed = false;
      const next: Record<string, WorkspaceConnectionState> = {};
      for (const [workspaceId, state] of Object.entries(current)) {
        if (activeWorkspaceIds.has(workspaceId)) {
          next[workspaceId] = state;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [workspaces]);

  useEffect(() => {
    sessionsByWorkspaceIdRef.current = sessionsByWorkspaceId;
  }, [sessionsByWorkspaceId]);

  const handleRemoteWorkspaceConnectionSaved = useCallback(
    async (workspaceId: string) => {
      delete remoteWorkspaceCheckRunRef.current[workspaceId];
      setWorkspaceConnectionOverrides((current) => {
        const next = { ...current };
        delete next[workspaceId];
        return next;
      });
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRetryingWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      await refreshRouteState();
    },
    [refreshRouteState],
  );

  const remoteWorkspaceConnectionEditor = useRemoteWorkspaceConnectionEditor({
    workspaces,
    onSaved: handleRemoteWorkspaceConnectionSaved,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (cancelled) return;
        await refreshRouteState();
      } finally {
        if (cancelled) return;
      }
    })();

    const handleSettingsChange = () => {
      setOpenworkServerSettingsVersion((value) => value + 1);
      // Self-heal: if the previous refresh got stuck mid-flight (e.g. macOS
      // backgrounded the webview and never let a fetch resolve), clear the
      // guard so a re-entry after resume actually goes through.
      refreshInFlightRef.current = false;
      void refreshRouteState();
    };
    window.addEventListener("openwork-server-settings-changed", handleSettingsChange);

    // Also retry on visibility flip independently — even when nobody else
    // dispatches the settings event.
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      refreshInFlightRef.current = false;
      void refreshRouteState();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      if (startupRetryTimerRef.current !== null) {
        window.clearTimeout(startupRetryTimerRef.current);
        startupRetryTimerRef.current = null;
      }
      window.removeEventListener("openwork-server-settings-changed", handleSettingsChange);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [refreshRouteState]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let cancelled = false;
    void engineInfo()
      .then((info) => {
        if (!cancelled) setRouteEngineInfo(info as EngineInfo | null);
      })
      .catch(() => {
        if (!cancelled) setRouteEngineInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Inspector wiring: publish the route's current state so an external
  // operator (or an AI driver using browser tools) can call
  // `window.__openwork.snapshot()` or `window.__openwork.slice("route")` and
  // see workspaces / sessions / connection info without walking the DOM.
  useEffect(() => {
    const dispose = publishInspectorSlice("route", () => ({
      loading,
      retryingWorkspaceIds,
      baseUrl,
      tokenPresent: token.length > 0,
      connected: Boolean(client),
      routeError,
      selectedSessionId,
      selectedWorkspaceId,
      persistedActiveWorkspaceId: readActiveWorkspaceId(),
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        displayNameResolved: workspace.displayNameResolved,
        workspaceType: workspace.workspaceType,
        path: workspace.path,
        sessionCount: (sessionsByWorkspaceId[workspace.id] ?? []).length,
        loading: retryingWorkspaceIds.includes(workspace.id),
        error: errorsByWorkspaceId[workspace.id] ?? null,
      })),
      sessionsByWorkspaceId: Object.fromEntries(
        Object.entries(sessionsByWorkspaceId).map(([wsId, items]) => [
          wsId,
          (items ?? []).map((session: any) => ({
            id: session?.id ?? null,
            title: session?.title ?? null,
            directory: session?.directory ?? null,
          })),
        ]),
      ),
    }));
    return dispose;
  }, [
    baseUrl,
    client,
    errorsByWorkspaceId,
    loading,
    retryingWorkspaceIds,
    selectedSessionId,
    selectedWorkspaceId,
    routeError,
    sessionsByWorkspaceId,
    token,
    workspaces,
  ]);

  // Once workspaces + sessions are loaded and the URL has no sessionId, try to
  // restore the last session the user opened in the active workspace.
  useEffect(() => {
    if (loading) return;
    if (routeWorkspaceId && workspaces.length > 0 && !workspaces.some((workspace) => workspace.id === routeWorkspaceId)) {
      const fallbackWorkspace = workspaces.find((workspace) => workspace.id === legacySelectedWorkspaceId)
        ?? workspaces[0]
        ?? null;
      if (fallbackWorkspace) {
        if (staleWorkspaceRecoveryRef.current !== routeWorkspaceId) {
          staleWorkspaceRecoveryRef.current = routeWorkspaceId;
          showToast(unavailableWorkspaceToast(routeWorkspaceId, workspaceLabel(fallbackWorkspace)));
        }
        navigate(
          `${workspaceSessionRoute(fallbackWorkspace.id, selectedSessionId)}${location.search}`,
          { replace: true },
        );
      }
      return;
    }
    if (routeWorkspaceId) staleWorkspaceRecoveryRef.current = "";
    if (!routeWorkspaceId && selectedWorkspaceId) {
      navigate(`${workspaceSessionRoute(selectedWorkspaceId, selectedSessionId)}${location.search}`, { replace: true });
      return;
    }
    // `/workspace/:workspaceId/session` is project Home. Do not auto-open the
    // last chat here; explicit workspace/session controls handle that.
  }, [
    loading,
    legacySelectedWorkspaceId,
    location.search,
    navigate,
    routeWorkspaceId,
    selectedSessionId,
    selectedWorkspaceId,
    showToast,
    workspaces,
  ]);

  // Redirect to /welcome when no workspaces exist and the user hasn't
  // completed onboarding. This fires after the initial route refresh so
  // `loading` is false and we know for sure there are zero workspaces.
  useEffect(() => {
    if (loading) return;
    if (workspaces.length > 0) return;
    if (routeWorkspaceId) return;
    if (local.prefs.hasCompletedOnboarding) return;
    navigate("/welcome", { replace: true });
  }, [loading, local.prefs.hasCompletedOnboarding, navigate, routeWorkspaceId, workspaces.length]);

  // NOTE: Blueprint seeding was removed from the route.
  // It was firing `materializeBlueprintSessions` + a session re-fetch on every
  // workspace change, which cascaded setState updates and froze the UI after
  // a few rapid switches. Empty workspaces now simply show "No tasks yet." and
  // the user creates their first session explicitly via "New task". Seeding
  // can be reintroduced later as a one-shot triggered from a button or from
  // the onboarding flow, not from the route effect loop.

  const workspaceSessionGroups = useMemo(
    () => toSessionGroups(workspaces, sessionsByWorkspaceId, errorsByWorkspaceId, new Set(retryingWorkspaceIds)),
    [errorsByWorkspaceId, retryingWorkspaceIds, sessionsByWorkspaceId, workspaces],
  );
  const seedWorkspaceActivitySessions = useSessionActivityStore((state) => state.seedWorkspaceSessions);
  const sessionActivityByWorkspaceId = useSessionActivityStore((state) => state.statusesByWorkspaceId);

  useEffect(() => {
    for (const group of workspaceSessionGroups) {
      seedWorkspaceActivitySessions(group.workspace.id, group.sessions);
      const serverId = workspaceServerId(group.workspace);
      if (serverId && serverId !== group.workspace.id) {
        seedWorkspaceActivitySessions(serverId, group.sessions);
      }
    }
  }, [seedWorkspaceActivitySessions, workspaceSessionGroups]);

  const sidebarSessionStatusById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const group of workspaceSessionGroups) {
      const serverId = workspaceServerId(group.workspace);
      const workspaceStatuses = {
        ...(sessionActivityByWorkspaceId[group.workspace.id] ?? {}),
        ...(serverId ? sessionActivityByWorkspaceId[serverId] ?? {} : {}),
      };
      for (const session of group.sessions) {
        const status = workspaceStatuses[session.id];
        if (status) next[session.id] = status;
      }
    }
    return next;
  }, [sessionActivityByWorkspaceId, workspaceSessionGroups]);

  const sidebarActiveWorkspaceId = useMemo(() => {
    const sessionId = selectedSessionId?.trim() ?? "";
    if (sessionId) {
      const owner = workspaceSessionGroups.find((group) =>
        group.sessions.some((session: any) => session?.id === sessionId),
      );
      if (owner?.workspace.id) return owner.workspace.id;
    }
    return selectedWorkspaceId;
  }, [selectedSessionId, selectedWorkspaceId, workspaceSessionGroups]);

  const workspaceConnectionStateById = useMemo(() => {
    const next: Record<string, WorkspaceConnectionState> = { ...workspaceConnectionOverrides };
    for (const workspace of workspaces) {
      if (workspace.workspaceType !== "remote") continue;
      const error = errorsByWorkspaceId[workspace.id]?.trim();
      if (!error || next[workspace.id]?.status === "connecting") continue;
      next[workspace.id] ??= {
        status: "error",
        message: getWorkspaceTaskLoadErrorDisplay(workspace, error).message || error,
        checkedAt: null,
      };
    }
    return next;
  }, [errorsByWorkspaceId, workspaceConnectionOverrides, workspaces]);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (loading) return;
    if (client) {
      reconnectAttemptedWorkspaceIdRef.current = "";
      return;
    }
    if (!selectedWorkspace || selectedWorkspace.workspaceType !== "local") return;
    const workspaceId = selectedWorkspace.id?.trim() ?? "";
    if (!workspaceId || reconnectAttemptedWorkspaceIdRef.current === workspaceId) return;
    reconnectAttemptedWorkspaceIdRef.current = workspaceId;

    void ensureDesktopLocalMatterhornConnection({
      route: "session",
      workspace: selectedWorkspace,
      allWorkspaces: workspaces,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : describeRouteError(error);
      setRouteError(message);
    });
  }, [client, loading, selectedWorkspace, workspaces]);

  const selectedWorkspaceRoot = selectedWorkspace?.path?.trim() || "";
  const selectedWorkspaceName = selectedWorkspace ? workspaceLabel(selectedWorkspace) : "";
  const selectedWorkspaceOutputsPath = selectedWorkspaceRoot ? joinWorkspacePath(selectedWorkspaceRoot, "outputs") : "";
  const copyTextToClipboard = useCallback(async (text: string, label: string) => {
    if (!text.trim()) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      showToast({ title: `${label} copied`, tone: "success", durationMs: 1800 });
    } catch {
      showToast({ title: `Could not copy ${label.toLowerCase()}`, tone: "error", durationMs: 2400 });
    }
  }, [showToast]);

  const revealWorkspacePath = useCallback(async (path: string, label: string) => {
    if (!path.trim()) return;
    if (!isDesktopRuntime()) {
      showToast({ title: `${label} is available in the desktop app`, description: path, tone: "warning", durationMs: 3200 });
      return;
    }
    try {
      await revealDesktopItemInDir(path);
      showToast({ title: `${label} opened`, tone: "success", durationMs: 1800 });
    } catch {
      showToast({ title: `Could not open ${label.toLowerCase()}`, description: path, tone: "error", durationMs: 3200 });
    }
  }, [showToast]);

  // Single source of truth for the selected workspace's server URL/token/id.
  // For remote workspaces this is the worker that owns the workspace; for
  // local workspaces it's the user's local Matterhorn Desks server.
  const selectedWorkspaceEndpoint = useMemo(
    () => resolveWorkspaceEndpoint(selectedWorkspace, { baseUrl, token, hostToken }),
    [baseUrl, hostToken, selectedWorkspace, token],
  );
  const selectedWorkspaceServerToken = selectedWorkspaceEndpoint?.token ?? "";
  const opencodeBaseUrl = selectedWorkspaceEndpoint?.opencodeBaseUrl ?? "";
  const feedbackClient = selectedWorkspaceEndpoint?.client ?? client;
  const feedbackWorkspaceId = selectedWorkspaceEndpoint?.workspaceId ?? null;
  const selectedWorkspaceIsLoading = retryingWorkspaceIds.includes(selectedWorkspaceId);
  const selectedWorkspaceError = errorsByWorkspaceId[selectedWorkspaceId] ?? null;
  const selectedSessionKnown = Boolean(
    selectedSessionId &&
      (sessionsByWorkspaceId[selectedWorkspaceId] ?? []).some((session: any) => session?.id === selectedSessionId),
  );
  const selectedSessionPending = Boolean(
    selectedSessionId && pendingCreatedSessionIdsRef.current[selectedWorkspaceId]?.[selectedSessionId],
  );
  const recoverMissingSession = useCallback(() => {
    if (!selectedSessionId || !selectedWorkspaceId) return;
    const recoveryKey = `${selectedWorkspaceId}:${selectedSessionId}`;
    if (staleSessionRecoveryRef.current === recoveryKey) return;
    staleSessionRecoveryRef.current = recoveryKey;
    writeLastSessionFor(selectedWorkspaceId, null);
    const uiState = useUiStateStore.getState();
    uiState.setSidePanelState(selectedSessionId, null);
    uiState.setSidePanelState(GLOBAL_HOME_SIDE_PANEL_KEY, null);
    navigateToWorkspaceSession(selectedWorkspaceId, null, { replace: true });
    showToast({
      title: "Chat no longer available",
      description: "Returned to project Home. Start a new chat or open one from the sidebar.",
      tone: "warning",
      durationMs: 3600,
    });
  }, [navigateToWorkspaceSession, selectedSessionId, selectedWorkspaceId, showToast]);
  useEffect(() => {
    if (!selectedSessionId) {
      staleSessionRecoveryRef.current = "";
      return;
    }
    if (loading || selectedWorkspaceIsLoading || !selectedWorkspace || selectedSessionKnown || selectedSessionPending) return;
    recoverMissingSession();
  }, [
    loading,
    recoverMissingSession,
    selectedSessionId,
    selectedSessionKnown,
    selectedSessionPending,
    selectedWorkspace,
    selectedWorkspaceIsLoading,
  ]);
  const routeNotFoundMessage = (() => {
    if (loading) return null;
    if (routeError && !client && routeWorkspaceId) {
      return `Matterhorn Desks engine is unavailable for this project. Retry the connection or restart Matterhorn Desks if it stays offline. Details: ${routeError}`;
    }
    if (!client && routeWorkspaceId && workspaces.length === 0) {
      return "Matterhorn Desks engine is unavailable for this project. Retry the connection or create/connect a project from this device.";
    }
    if (routeWorkspaceId && !selectedWorkspace) {
      return "Workspace was not found. Select a new workspace from the sidebar.";
    }
    return null;
  })();

  useEffect(() => {
    if (loading || !routeWorkspaceId || selectedWorkspace) return;
    if (readActiveWorkspaceId() === routeWorkspaceId) {
      writeActiveWorkspaceId(null);
    }
  }, [loading, routeWorkspaceId, selectedWorkspace]);

  // Boot-level loading blocks the whole UI only until the selected workspace
  // is usable. Session navigation and background list refreshes must not hide
  // an already-connected chat composer behind a stale route-loading flag.
  const effectiveLoading = loading && (!client || !selectedWorkspace);

  const opencodeClient = useMemo(
    () =>
      opencodeBaseUrl &&
      (selectedWorkspaceServerToken || publicBetaWeb) &&
      !selectedWorkspaceError
        ? createClient(opencodeBaseUrl, selectedWorkspaceRoot || undefined, {
            token: selectedWorkspaceServerToken || undefined,
            mode: "matterhorn",
            executionMode,
          })
        : null,
    [
      executionMode,
      opencodeBaseUrl,
      publicBetaWeb,
      selectedWorkspaceError,
      selectedWorkspaceRoot,
      selectedWorkspaceServerToken,
    ],
  );
  const providerListQuery = useProviderListQuery({
    client: opencodeClient,
    baseUrl: opencodeBaseUrl,
    directory: selectedWorkspaceRoot || undefined,
    enabled: Boolean(selectedWorkspaceId),
  });
  const refreshWorkspaceModelSelection = useCallback((options?: { signal?: AbortSignal }) => {
    if (!client || !selectedWorkspaceId) {
      setWorkspaceModelSelection(null);
      return;
    }
    void client.workspaceModelSelection(selectedWorkspaceId)
      .then((selection) => {
        if (!options?.signal?.aborted) setWorkspaceModelSelection(selection);
      })
      .catch(() => {
        if (!options?.signal?.aborted) setWorkspaceModelSelection(null);
      });
  }, [client, selectedWorkspaceId]);
  useEffect(() => {
    const controller = new AbortController();
    refreshWorkspaceModelSelection({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [refreshWorkspaceModelSelection]);
  useEffect(() => {
    if (!selectedWorkspaceId) return undefined;
    const handleModelSelectionChanged = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceModelSelectionChangedDetail>).detail;
      if (detail?.workspaceId && detail.workspaceId !== selectedWorkspaceId) return;
      refreshWorkspaceModelSelection();
    };
    window.addEventListener(WORKSPACE_MODEL_SELECTION_CHANGED_EVENT, handleModelSelectionChanged);
    return () => {
      window.removeEventListener(WORKSPACE_MODEL_SELECTION_CHANGED_EVENT, handleModelSelectionChanged);
    };
  }, [refreshWorkspaceModelSelection, selectedWorkspaceId]);
  const selectedPromptModelResolution = useMemo(() => resolveSelectedPromptModel({
    localDefaultModel: local.prefs.defaultModel,
    workspaceModelSelection,
  }), [local.prefs.defaultModel, workspaceModelSelection]);
  const selectedPromptModel = selectedPromptModelResolution.model;
  const promptProviderReady = hasConnectedPromptProvider(providerListQuery.data);
  const selectedModelUnavailable = Boolean(
    !selectedPromptModel ||
      providerListQuery.isLoading ||
      providerListQuery.isError ||
      !promptProviderReady ||
      isDesktopProviderBlocked({
        providerId: selectedPromptModel.providerID,
        checkRestriction: checkDesktopRestriction,
      }) ||
      (
        providerListQuery.data &&
        checkDesktopRestriction({ restriction: "allowCustomProviders" }) &&
        !providerConnectedIds.some(
          (providerId) => providerId.trim() === selectedPromptModel.providerID.trim(),
        )
      ) ||
      (
        providerListQuery.data &&
        !isModelAvailableInConnectedProviders(providerListQuery.data, selectedPromptModel)
      ),
  );
  // A person can always open a blank chat in a healthy workspace. Model readiness
  // governs sending and immediate desk runs, not organising work or drafting context.
  const canCreateTask = Boolean(
    opencodeClient && selectedWorkspaceId && !loading && !selectedWorkspaceError,
  );

  const sessionProviderAuthStateRef = useRef({
    opencodeClient: opencodeClient as Client | null,
    providers,
    providerDefaults,
    providerConnectedIds,
    disabledProviderIds,
    selectedWorkspace,
    selectedWorkspaceEndpoint,
    selectedWorkspaceRoot,
  });
  sessionProviderAuthStateRef.current = {
    opencodeClient,
    providers,
    providerDefaults,
    providerConnectedIds,
    disabledProviderIds,
    selectedWorkspace,
    selectedWorkspaceEndpoint,
    selectedWorkspaceRoot,
  };

  const sessionProviderAuthStore = useMemo(
    () =>
      createProviderAuthStore({
        client: () => sessionProviderAuthStateRef.current.opencodeClient,
        providers: () => sessionProviderAuthStateRef.current.providers,
        providerDefaults: () => sessionProviderAuthStateRef.current.providerDefaults,
        providerConnectedIds: () => sessionProviderAuthStateRef.current.providerConnectedIds,
        disabledProviders: () => sessionProviderAuthStateRef.current.disabledProviderIds,
        checkDesktopAppRestriction: checkDesktopRestriction,
        selectedWorkspaceDisplay: () =>
          sessionProviderAuthStateRef.current.selectedWorkspace
            ? ({
                ...sessionProviderAuthStateRef.current.selectedWorkspace,
                name: workspaceLabel(sessionProviderAuthStateRef.current.selectedWorkspace),
              } as WorkspaceDisplay)
            : emptyWorkspaceDisplay,
        selectedWorkspaceRoot: () => sessionProviderAuthStateRef.current.selectedWorkspaceRoot,
        runtimeWorkspaceId: () => sessionProviderAuthStateRef.current.selectedWorkspaceEndpoint?.workspaceId ?? null,
        matterhornServer: {
          getSnapshot: () => ({
            matterhornServerStatus: sessionProviderAuthStateRef.current.selectedWorkspaceEndpoint ? "connected" : "disconnected",
            matterhornServerClient: sessionProviderAuthStateRef.current.selectedWorkspaceEndpoint?.client ?? null,
            matterhornServerCapabilities: sessionProviderAuthStateRef.current.selectedWorkspaceEndpoint
              ? {
                  config: { read: true, write: true },
                }
              : null,
          }),
        } as never,
        setProviders,
        setProviderDefaults,
        setProviderConnectedIds,
        setDisabledProviders: setDisabledProviderIds,
        markOpencodeConfigReloadRequired: () => {
          reloadCoordinator.markReloadRequired("config", {
            type: "config",
            name: "opencode.json",
            action: "updated",
          });
        },
      }),
    [checkDesktopRestriction, reloadCoordinator],
  );

  useEffect(() => {
    sessionProviderAuthStore.start();
    return () => {
      sessionProviderAuthStore.dispose();
    };
  }, [sessionProviderAuthStore]);

  useEffect(() => {
    if (!opencodeClient || !selectedWorkspaceId) return;

    void sessionProviderAuthStore
      .ensureProjectProviderDisabledState(
        "opencode",
        checkDesktopRestriction({ restriction: "allowZenModel" }),
      )
      .catch((error) => {
        console.warn("[desktop-app-restrictions] failed to sync Zen restriction", error);
      });
  }, [checkDesktopRestriction, disabledProviderIds, opencodeClient, selectedWorkspaceId, selectedWorkspaceRoot, sessionProviderAuthStore]);

  useEffect(() => {
    sessionProviderAuthStore.syncFromOptions();
  }, [
    opencodeClient,
    selectedWorkspace?.id,
    selectedWorkspace?.workspaceType,
    selectedWorkspaceEndpoint?.workspaceId,
    selectedWorkspaceRoot,
    sessionProviderAuthStore,
  ]);

  // Session is where forced sign-in lands. Keep org-managed cloud providers in
  // sync here so sign-in applies opencode.json changes before Settings opens.
  useCloudProviderAutoSync(sessionProviderAuthStore.runCloudProviderSync);
  const sessionProviderAuthSnapshot = useProviderAuthStoreSnapshot(sessionProviderAuthStore);
  const permissionQueryKey = useMemo(
    () =>
      selectedWorkspaceId && selectedSessionId
        ? reactPermissionKey(selectedWorkspaceId, selectedSessionId)
        : null,
    [selectedSessionId, selectedWorkspaceId],
  );
  const pendingPermissions = useQueryCacheState<PendingPermission[]>(
    permissionQueryKey,
    emptyPendingPermissions,
  );
  const questionQueryKey = useMemo(
    () =>
      selectedWorkspaceId && selectedSessionId
        ? reactQuestionKey(selectedWorkspaceId, selectedSessionId)
        : null,
    [selectedSessionId, selectedWorkspaceId],
  );
  const pendingQuestions = useQueryCacheState<PendingQuestion[]>(
    questionQueryKey,
    emptyPendingQuestions,
  );
  const todoQueryKey = useMemo(
    () =>
      selectedWorkspaceId && selectedSessionId
        ? reactTodoKey(selectedWorkspaceId, selectedSessionId)
        : null,
    [selectedSessionId, selectedWorkspaceId],
  );
  const todos = useQueryCacheState<TodoItem[]>(todoQueryKey, emptyTodos);
  useEffect(() => {
    if (!opencodeClient || !selectedWorkspaceId || !selectedSessionId) return;
    let cancelled = false;
    const directory = selectedWorkspaceRoot || undefined;
    void (async () => {
      const snapshotStartedAt = Date.now();
      try {
        const list = unwrap(await opencodeClient.permission.list({ directory }));
        if (!cancelled) {
          seedPermissionState(selectedWorkspaceId, selectedSessionId, list, { snapshotStartedAt });
        }
      } catch {
        // Keep event-synced permission state if the snapshot read fails.
        // Hiding a pending approval can block the running task.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opencodeClient, selectedSessionId, selectedWorkspaceId, selectedWorkspaceRoot]);

  useEffect(() => {
    if (!opencodeClient || !selectedWorkspaceId || !selectedSessionId) return;
    let cancelled = false;
    const directory = selectedWorkspaceRoot || undefined;
    void (async () => {
      const snapshotStartedAt = Date.now();
      try {
        const list = unwrap(await opencodeClient.question.list({ directory }));
        if (!cancelled) {
          seedQuestionState(selectedWorkspaceId, selectedSessionId, list, { snapshotStartedAt });
        }
      } catch {
        // Keep event-synced question state if the snapshot read fails.
        // Hiding a pending question can block the running task.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opencodeClient, selectedSessionId, selectedWorkspaceId, selectedWorkspaceRoot]);

  const activePermission = pendingPermissions[0] ?? null;
  const respondPermission = useCallback(
    async (requestID: string, reply: "once" | "always" | "reject") => {
      if (!opencodeClient || !selectedWorkspaceId || !selectedSessionId) return;
      if (permissionReplyBusyRef.current) return;
      permissionReplyBusyRef.current = true;
      setPermissionReplyBusy(true);
      try {
        unwrap(
          await opencodeClient.permission.reply({
            requestID,
            reply,
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        getReactQueryClient().setQueryData<PendingPermission[]>(
          reactPermissionKey(selectedWorkspaceId, selectedSessionId),
          (current = []) => current.filter((permission) => permission.id !== requestID),
        );
      } catch (error) {
        showToast({
          title: t("app.error_request_failed"),
          description: describeRouteError(error),
          tone: "error",
        });
      } finally {
        permissionReplyBusyRef.current = false;
        setPermissionReplyBusy(false);
      }
    },
    [opencodeClient, selectedSessionId, selectedWorkspaceId, selectedWorkspaceRoot, showToast],
  );
  const activeQuestion = pendingQuestions[0] ?? null;
  const respondQuestion = useCallback(
    async (requestID: string, answers: string[][]) => {
      if (!opencodeClient || !selectedWorkspaceId || !selectedSessionId) return;
      if (questionReplyBusyRef.current) return;
      questionReplyBusyRef.current = true;
      setQuestionReplyBusy(true);
      try {
        unwrap(
          await opencodeClient.question.reply({
            requestID,
            answers,
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        getReactQueryClient().setQueryData<PendingQuestion[]>(
          reactQuestionKey(selectedWorkspaceId, selectedSessionId),
          (current = []) => current.filter((question) => question.id !== requestID),
        );
      } catch (error) {
        showToast({
          title: t("app.error_request_failed"),
          description: describeRouteError(error),
          tone: "error",
        });
      } finally {
        questionReplyBusyRef.current = false;
        setQuestionReplyBusy(false);
      }
    },
    [opencodeClient, selectedSessionId, selectedWorkspaceId, selectedWorkspaceRoot, showToast],
  );
  const showPreparingStatus =
    effectiveLoading ||
    (!canCreateTask && !routeError && !selectedWorkspaceError);

  useEffect(() => {
    if (!opencodeClient) {
      setProviders([]);
      setProviderDefaults({});
      setProviderConnectedIds([]);
      return;
    }

    let cancelled = false;

    const applyProviderState = (value: ProviderListResponse) => {
      if (cancelled) return;
      // When not signed in, filter out cloud-managed providers (lpr_*)
      // so stale entries from a previous session don't appear.
      const hasCloudAuth = publicBetaWeb || !!readDenSettings().authToken?.trim();
      const isCloudProvider = (id: string) => /^lpr_/i.test(id);
      const all = hasCloudAuth
        ? ((value.all ?? []) as ProviderListItem[])
        : ((value.all ?? []) as ProviderListItem[]).filter(
            (p) => !isCloudProvider(p.id ?? ""),
          );
      const connected = hasCloudAuth
        ? (value.connected ?? [])
        : (value.connected ?? []).filter((id) => !isCloudProvider(id));
      setProviders(all);
      setProviderConnectedIds(connected);
      // New-provider detection is handled globally by the provider auth
      // store's applyProviderListState, which fires dispatchNewProviders.
    };

    void (async () => {
      let disabledProviders: string[] = [];
      try {
        const config = unwrap(
          await opencodeClient.config.get({
            directory: selectedWorkspaceRoot || undefined,
          }),
        ) as { disabled_providers?: string[] };
        disabledProviders = Array.isArray(config.disabled_providers)
          ? config.disabled_providers
          : [];
        if (!cancelled) setDisabledProviderIds(disabledProviders);
      } catch {
        // ignore config read failures and continue with provider discovery
      }

      try {
        applyProviderState(
          filterProviderList(
            await ensureProviderListQuery(getReactQueryClient(), {
              client: opencodeClient,
              baseUrl: opencodeBaseUrl,
              directory: selectedWorkspaceRoot || undefined,
            }),
            disabledProviders,
          ),
        );
      } catch {
        if (cancelled) return;
        setProviders([]);
        setProviderDefaults({});
        setProviderConnectedIds([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  // Keep the catalogue synchronized when the picker opens without making
  // provider readiness depend on the picker being visible.
  }, [denSessionVersion, modelPickerOpen, opencodeBaseUrl, opencodeClient, selectedWorkspaceRoot]);

  const modelLabel = selectedPromptModel
    ? resolveModelDisplayName(selectedPromptModel.modelID)
    : t("session.default_model");

  // Cache the provider catalog after the model picker requests it. The engine
  // catalog can be several megabytes, so it must not delay the project home.
  useEffect(() => {
    const data = providerListQuery.data;
    if (!data?.all) return;
    const next: Record<string, Record<string, any>> = {};
    for (const provider of data.all) {
      next[provider.id] = { ...(provider.models ?? {}) };
    }
    setProviderCatalog(next);
  }, [providerListQuery.data]);

  // Compute behavior (reasoning/thinking variant) options for the current
  // default model. This is what the composer renders as its variant pill.
  const {
    modelBehaviorTitle,
    modelVariantLabel,
    modelBehaviorOptions,
    modelVariantValue,
    modelBehaviorIsProviderDefault,
    modelBehaviorDefaultLabel,
  } = useMemo(() => {
    const ref = selectedPromptModel;
    const localVariant = local.prefs.modelVariant ?? null;
    const workspaceEffectiveModel = workspaceModelSelection?.effectiveModel ?? null;
    const selectedModelMatchesWorkspace = Boolean(
      ref &&
      workspaceEffectiveModel &&
      ref.providerID === workspaceEffectiveModel.providerId &&
      ref.modelID === workspaceEffectiveModel.modelId,
    );
    const workspaceVariant = selectedModelMatchesWorkspace
      ? workspaceEffectiveModel?.variant ?? null
      : null;
    const variant = localVariant ?? workspaceVariant;
    const defaultLabel = workspaceVariant && localVariant == null
      ? "Workspace default"
      : "Provider default";
    if (!ref) {
      return {
        modelBehaviorTitle: t("model_behavior.title_reasoning_effort"),
        modelVariantLabel: t("settings.default_label"),
        modelBehaviorOptions: emptyModelBehaviorOptions,
        modelVariantValue: null,
        modelBehaviorIsProviderDefault: true,
        modelBehaviorDefaultLabel: "Provider default",
      };
    }
    const model = providerCatalog[ref.providerID]?.[ref.modelID];
    if (!model) {
      return {
        modelBehaviorTitle: t("model_behavior.title_reasoning_effort"),
        modelVariantLabel: variant ?? t("settings.default_label"),
        modelBehaviorOptions: emptyModelBehaviorOptions,
        modelVariantValue: variant,
        modelBehaviorIsProviderDefault: localVariant == null,
        modelBehaviorDefaultLabel: defaultLabel,
      };
    }
    const summary = getModelBehaviorSummary(ref.providerID, model, variant);
    return {
      modelBehaviorTitle: summary.title,
      modelVariantLabel: summary.label,
      modelBehaviorOptions: summary.options,
      modelVariantValue: variant,
      modelBehaviorIsProviderDefault: localVariant == null,
      modelBehaviorDefaultLabel: defaultLabel,
    };
  }, [local.prefs.modelVariant, providerCatalog, selectedPromptModel, workspaceModelSelection]);

  // Load the picker list lazily the first time the modal opens. Uses the
  // cached catalog when available, otherwise re-fetches.
  useEffect(() => {
    if (!modelPickerOpen || !opencodeClient) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await ensureProviderListQuery(getReactQueryClient(), {
          client: opencodeClient,
          baseUrl: opencodeBaseUrl,
          directory: selectedWorkspaceRoot || undefined,
        });
        if (cancelled || !data?.all) return;
        // Flag models from recently-added providers so they appear in
        // the "Recently added" section at the top of the picker.
        // Two sources: (1) providers not yet in the localStorage seen-set,
        // (2) providers passed via the openModelPickerEvent from the toast.
        let seenIds: Set<string>;
        try {
          const raw = window.localStorage.getItem("openwork.seenProviderIds");
          seenIds = new Set(raw ? JSON.parse(raw) : []);
        } catch {
          seenIds = new Set();
        }
        const options: ModelOption[] = [];
        for (const provider of getConnectedPromptProviderItems(data)) {
          const modelIds = Object.keys(provider.models);
          const isNew = !seenIds.has(provider.id) || recentProviderIds.has(provider.id);
          for (const id of modelIds) {
            const model = provider.models[id];
            const behavior = getModelBehaviorSummary(provider.id, model, null, provider.name);
            options.push({
              providerID: provider.id,
              modelID: id,
              title: model.name || id,
              description: customerModelProviderLabel(provider),
              behaviorTitle: behavior.title,
              behaviorLabel: behavior.label,
              behaviorDescription: behavior.description,
              behaviorValue: behavior.value,
              behaviorOptions: behavior.options,
              behaviorCapability: getModelBehaviorCapability(model),
              behaviorCapabilityLabel: getModelBehaviorCapabilityLabel(model),
              isFree: false,
              isConnected: true,
              isRecommended: isNew,
              source: /^lpr_/i.test(provider.id) ? "cloud" as const : undefined,
            });
          }
        }
        setModelOptions(options);
      } catch {
        // Silent: the picker surfaces an empty list rather than blocking the UI.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelPickerOpen, opencodeBaseUrl, opencodeClient, recentProviderIds, selectedWorkspaceRoot]);

  // Apply org-level restrictions (dev #1505) on top of the raw model list
  // so the picker never surfaces blocked options:
  //   - `allowZenModel` hides the built-in OpenCode provider entries when false
  //   - `allowCustomProviders` hides providers that OpenCode does not report
  //     as connected through the provider list endpoint.
  const allowedModelOptions = useMemo(() => {
    const restrictToCloud = checkDesktopRestriction({
      restriction: "allowCustomProviders",
    });
    return modelOptions.filter((option) => {
      if (
        isDesktopProviderBlocked({
          providerId: option.providerID,
          checkRestriction: checkDesktopRestriction,
        })
      ) {
        return false;
      }
      if (restrictToCloud && !option.isConnected) {
        return false;
      }
      return true;
    });
  }, [checkDesktopRestriction, modelOptions]);

  const listSlashCommands = useCallback(async (): Promise<SlashCommandOption[]> => {
    // Matterhorn Desks gives people purpose-built desk actions, not the raw
    // repository command catalog used to maintain this app. Skills, extensions,
    // and MCPs have their own customer-facing surfaces in the composer.
    // Keep this reactive to an engine reload so an explicit customer-command
    // catalog has a safe insertion point here in the future.
    void engineReloadVersion;
    return [];
  }, [engineReloadVersion]);

  const handleOpenSettings = useCallback((
    route = "/settings/general",
    workspaceId = sidebarActiveWorkspaceId,
    navigationState?: { pendingDeskTask?: PendingDeskTaskNavigation },
  ) => {
    const sessionId = workspaceId === sidebarActiveWorkspaceId ? selectedSessionId : null;
    const tab = route.replace(/^\/settings\/?/, "").replace(/^\/+|\/+$/g, "") || "general";
    const target = workspaceId ? workspaceSettingsRoute(workspaceId, tab) : route;
    writeActiveWorkspaceId(workspaceId || null);
    navigate(target, {
      state: {
        workspaceId,
        sessionId,
        ...navigationState,
      },
    });
  }, [navigate, selectedSessionId, sidebarActiveWorkspaceId]);

  const buildSessionSystemContext = useCallback(async (
    text: string,
    sessionId: string,
    agentId?: string | null,
    requestedExecutionMode: MatterhornExecutionMode = executionMode,
  ) => {
    const deskAgent = getMatterhornDeskAgentById(agentId);
    const isGeneralMatterhornAgent = !agentId || agentId === "matterhorn";
    const contextPolicy = deskAgent?.contextPolicy;
    const envRuntimeKey = buildMatterhornEnvRuntimeKey({
      baseUrl: client?.baseUrl ?? null,
      pid: matterhornServerHostInfoState?.pid ?? null,
      port: matterhornServerHostInfoState?.port ?? null,
    });
    const envSystemContext = await buildOpenworkEnvSystemContext(client, {
      cacheKey: sessionId,
      runtimeKey: envRuntimeKey,
    });

    const includeWalletPublicContext = isGeneralMatterhornAgent || contextPolicy?.includeWalletPublicContext === true;
    const walletContext = wallet.snapshot.isConnected && includeWalletPublicContext
      ? buildMatterhornPublicWalletContext({
          address: wallet.snapshot.address,
          chainId: wallet.snapshot.chainId,
          ethBalance: wallet.snapshot.ethBalance,
          usdcBalance: wallet.snapshot.usdcBalance,
        })
      : "";

    const includeCryptoSafetyPolicy = isGeneralMatterhornAgent || contextPolicy?.includeCryptoSafetyPolicy === true;
    const includeWorkspaceOrientation = isGeneralMatterhornAgent || contextPolicy?.includeWorkspaceOrientation === true;
    const matterhornOrientationPrompt = includeWorkspaceOrientation && shouldInjectMatterhornOrientationPrompt(text)
      ? buildMatterhornOrientationSystemPrompt()
      : "";

    const cryptoPrompt =
      includeCryptoSafetyPolicy && shouldInjectCryptoPrompt(text)
        ? buildCryptoSystemPrompt(
            wallet.snapshot.isConnected && includeWalletPublicContext ? wallet.snapshot.address : null,
            wallet.snapshot.isConnected && includeWalletPublicContext ? wallet.snapshot.chainId : null,
            wallet.snapshot.isConnected && includeWalletPublicContext ? wallet.snapshot.ethBalance : null,
            wallet.snapshot.isConnected && includeWalletPublicContext ? wallet.snapshot.usdcBalance : null,
          )
        : "";

    const responsePerspectivePrompt = buildResponsePerspectiveSystemPrompt(responsePerspective);
    const executionModePrompt = buildMatterhornExecutionModeSystemPrompt(requestedExecutionMode);
    const directResponsePrompt = buildDirectResponseSystemPrompt();
    const deskAgentInstructions = deskAgent ? buildMatterhornDeskAgentSystemPrompt(deskAgent) : "";
    let workflowRunPrompt = "";
    if (client && selectedWorkspaceId && agentId) {
      try {
        const linkedRun = (await client.listWorkflowRuns({
          workspaceId: selectedWorkspaceId,
          sessionId,
          limit: 1,
        })).items[0];
        if (linkedRun) {
          workflowRunPrompt = [
            "## Active Matterhorn Workflow Run",
            `Workflow run: ${linkedRun.workflowRunId}`,
            `Canonical output directory: ${linkedRun.outputBasePath}`,
            "Save every artifact for this workflow under exactly that directory. Do not create a parallel descriptive or custom session folder.",
          ].join("\n");
        }
      } catch {
        // Prompting still works when the optional workflow lookup is unavailable.
      }
    }

    return compileMatterhornSessionSystemContext([
      { id: "execution_mode", content: executionModePrompt },
      { id: "desk_contract", content: deskAgentInstructions },
      { id: "direct_response", content: directResponsePrompt },
      {
        id: "environment_metadata",
        content: envSystemContext,
        enabled: isGeneralMatterhornAgent || contextPolicy?.includeEnvironmentVariableNames === true,
      },
      { id: "wallet_public_metadata", content: walletContext },
      { id: "crypto_safety", content: cryptoPrompt },
      { id: "workspace_orientation", content: matterhornOrientationPrompt },
      { id: "workflow_run", content: workflowRunPrompt },
      { id: "response_perspective", content: responsePerspectivePrompt },
    ]);
  }, [client, executionMode, matterhornServerHostInfoState?.pid, matterhornServerHostInfoState?.port, responsePerspective, selectedWorkspaceId, wallet.snapshot]);

  const selectedAgentRef = useRef<string | null>(selectedAgent);
  const pendingSelectedAgentRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  const handleSelectAgent = useCallback((agent: string | null) => {
    if (selectedAgentRef.current === agent || pendingSelectedAgentRef.current === agent) return;
    pendingSelectedAgentRef.current = agent;
    const commit = () => {
      pendingSelectedAgentRef.current = undefined;
      if (selectedAgentRef.current === agent) return;
      selectedAgentRef.current = agent;
      setSelectedAgent(agent);
    };
    if (typeof window === "undefined") {
      commit();
      return;
    }
    window.setTimeout(commit, 0);
  }, []);

  const surfaceProps = useMemo(() => {
    if (
      !client ||
      !selectedWorkspaceId ||
      !selectedSessionId ||
      !opencodeBaseUrl ||
      (!token && !publicBetaWeb) ||
      !opencodeClient
    ) {
      return null;
    }
    if (!selectedSessionKnown && !selectedSessionPending) {
      return null;
    }

    // Note: do NOT include `client`, `workspaceId`, `sessionId`,
    // `opencodeBaseUrl`, or `matterhornToken` here. SessionPage forwards those
    // explicitly to SessionSurface from the per-workspace endpoint resolved
    // by `resolveWorkspaceEndpoint`. If we leak them in here, the spread of
    // `surfaceProps` in SessionPage overrides those correct values with the
    // local server's, and remote workspaces silently end up calling the
    // local server with the local `rem_*` id.
    return {
      workspaceRoot: selectedWorkspaceRoot,
      developerMode: false,
      modelLabel,
      onModelClick: () => {
        setModelPickerQuery("");
        setModelPickerOpen(true);
      },
      onOpenAiProviders: () => {
        handleOpenSettings("/settings/ai");
      },
      modelPickerOpen: compactModelPickerOpen,
      modelUnavailable: selectedModelUnavailable,
      selectedModel: selectedPromptModel ?? { providerID: "", modelID: "" },
      onModelPickerOpenChange: setCompactModelPickerOpen,
      onModelChange: (model: ModelRef) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: model,
          modelVariant: previous.defaultModel?.providerID === model.providerID && previous.defaultModel.modelID === model.modelID
            ? previous.modelVariant
            : null,
        }));
        setCompactModelPickerOpen(false);
      },
      onOpenSettingsSection: (section: "commands" | "skills" | "mcps" | "extensions" | "plugins") => {
        handleOpenSettings(section === "skills" ? "/settings/skills" : section === "mcps" || section === "extensions" ? "/settings/extensions/mcp" : section === "plugins" ? "/settings/extensions/plugins" : "/settings/general");
      },
      onSendDraft: async (draft: ComposerDraft) => {
        const text = (draft.resolvedText ?? draft.text).trim();
        if (!text && draft.attachments.length === 0) return;
        if (selectedModelUnavailable) throw new Error("Selected model is unavailable. Choose another model before sending.");

        if (draft.mode === "shell") {
          if (executionMode !== "work") {
            throw new Error(`${executionMode === "plan" ? "Plan" : "Discuss"} mode does not run shell commands. Switch to Work mode first.`);
          }
          await shellInSession(opencodeClient, selectedSessionId, text);
          return;
        }

        if (draft.command) {
          if (executionMode !== "work") {
            throw new Error(`${executionMode === "plan" ? "Plan" : "Discuss"} mode does not run commands. Switch to Work mode first.`);
          }
          const result = await opencodeClient.session.command({
            sessionID: selectedSessionId,
            command: draft.command.name,
            arguments: draft.command.arguments,
            model: selectedPromptModel
              ? `${selectedPromptModel.providerID}/${selectedPromptModel.modelID}`
              : undefined,
            agent: selectedAgent ?? undefined,
            ...(modelVariantValue ? { variant: modelVariantValue } : {}),
          });
          if (result.error) {
            throw new Error(serializeSDKError(result.error));
          }
          return;
        }

        const parts = await draftToParts(draft, selectedWorkspaceRoot);
        const systemContext = await buildSessionSystemContext(text, selectedSessionId, selectedAgent, executionMode);
        const executionModeTools = buildMatterhornExecutionModeTools(executionMode, selectedAgent);

        const result = await opencodeClient.session.promptAsync({
          sessionID: selectedSessionId,
          parts,
          model: selectedPromptModel ?? undefined,
          agent: selectedAgent ?? undefined,
          ...(executionModeTools ? { tools: executionModeTools } : {}),
          ...(modelVariantValue ? { variant: modelVariantValue } : {}),
          ...(systemContext ? { system: systemContext } : {}),
        });
        if (result.error) {
          throw new Error(serializeSDKError(result.error));
        }
      },
      onDraftChange: (draft: ComposerDraft) => {
        saveSessionDraft(selectedWorkspaceId, selectedSessionId, {
          text: draft.text,
          mode: draft.mode,
        });
      },
      onSessionMissing: recoverMissingSession,
      attachmentsEnabled: true,
      attachmentsDisabledReason: null,
      modelBehaviorTitle,
      modelVariantLabel,
      modelVariant: modelVariantValue,
      modelBehaviorOptions,
      modelBehaviorIsProviderDefault,
      modelBehaviorDefaultLabel,
      onModelVariantChange: (value: string | null) => {
        recordModelReasoningLevelSelection({
          workspaceId: selectedWorkspaceId,
          sessionId: selectedSessionId,
          providerId: selectedPromptModel?.providerID,
          modelId: selectedPromptModel?.modelID,
          reasoningLevel: value,
          source: "current_app",
        });
        local.setPrefs((previous) => ({ ...previous, modelVariant: value }));
      },
      responsePerspective,
      onResponsePerspectiveChange: handleResponsePerspectiveChange,
      executionMode,
      executionModesEnabled: executionModeFeatureEnabled,
      onExecutionModeChange: handleExecutionModeChange,
      agentLabel: formatAgentDisplayName(selectedAgent),
      selectedAgent,
      listAgents: async () => {
        const list = unwrap(await opencodeClient.app.agents());
        return list.filter((agent) => !agent.hidden && agent.mode !== "subagent" && agent.name !== "plan" && agent.name !== "build");
      },
      onSelectAgent: handleSelectAgent,
      listCommands: executionMode === "work" ? listSlashCommands : async () => [],
      recentFiles: [],
      searchFiles: async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const result = unwrap(
          await opencodeClient.find.files({
            query: trimmed,
            dirs: "true",
            limit: 50,
            directory: selectedWorkspaceRoot || undefined,
          }),
        );
        return result;
      },
      isRemoteWorkspace: selectedWorkspace?.workspaceType === "remote",
      isSandboxWorkspace: selectedWorkspace ? isSandboxWorkspace(selectedWorkspace) : false,
      onRevertToMessage: async (messageId: string) => {
        if (executionMode !== "work") {
          showToast({
            title: "Switch to Work mode to revert",
            description: "Reverting changes the conversation history, so it is only available in Work mode.",
            tone: "warning",
            durationMs: 3200,
          });
          return;
        }
        try {
          try {
            await opencodeClient.session.abort({ sessionID: selectedSessionId });
          } catch {
            // The session may already be idle.
          }
          await revertSession(opencodeClient, selectedSessionId, messageId);
          if (selectedWorkspaceEndpoint) {
            const snapshot = await selectedWorkspaceEndpoint.client.getSessionSnapshot(
              selectedWorkspaceEndpoint.workspaceId,
              selectedSessionId,
              { limit: 140 },
            );
            getReactQueryClient().setQueryData(
              ["react-session-snapshot", selectedWorkspaceId, selectedSessionId],
              snapshot.item,
            );
          }
          showToast({
            title: "Conversation reverted",
            description: "Later messages were removed and the prompt is ready to edit.",
            tone: "success",
            durationMs: 2400,
          });
        } catch (error) {
          showToast({
            title: "Could not revert conversation",
            description: describeRouteError(error),
            tone: "error",
            durationMs: 3600,
          });
        }
      },
      onForkAtMessage: (messageId: string) => {
        if (executionMode !== "work") {
          console.warn(`[fork] blocked in ${executionMode} mode; switch to Work mode first`);
          return;
        }
        void (async () => {
          try {
            const forked = await forkSession(opencodeClient, selectedSessionId, messageId);
            writeLastSessionFor(selectedWorkspaceId, forked.id);
            rememberPendingCreatedSession(selectedWorkspaceId, forked.id);
            setSessionsByWorkspaceId((current) => ({
              ...current,
              [selectedWorkspaceId]: [forked as any, ...(current[selectedWorkspaceId] ?? [])],
            }));
            navigateToWorkspaceSession(selectedWorkspaceId, forked.id);
            void refreshRouteState();
          } catch (error) {
            console.warn("[fork] failed", error);
          }
        })();
      },
      onChangeModel: (model: { providerID: string; modelID: string }) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: model,
          modelVariant: previous.defaultModel?.providerID === model.providerID && previous.defaultModel.modelID === model.modelID
            ? previous.modelVariant
            : null,
        }));
      },
    };
  }, [
    buildSessionSystemContext,
    client,
    compactModelPickerOpen,
    executionMode,
    executionModeFeatureEnabled,
    handleExecutionModeChange,
    handleOpenSettings,
    handleResponsePerspectiveChange,
    handleSelectAgent,
    local,
    listSlashCommands,
    modelBehaviorIsProviderDefault,
    modelBehaviorDefaultLabel,
    modelBehaviorOptions,
    modelBehaviorTitle,
    modelLabel,
    modelVariantLabel,
    modelVariantValue,
    navigate,
    opencodeBaseUrl,
    opencodeClient,
    recoverMissingSession,
    responsePerspective,
    selectedAgent,
    selectedSessionId,
    selectedSessionKnown,
    selectedSessionPending,
    selectedModelUnavailable,
    selectedPromptModel,
    selectedWorkspace,
    selectedWorkspaceEndpoint,
    selectedWorkspaceId,
    selectedWorkspaceRoot,
    showToast,
    token,
  ]);

  const handleOpenCreateWorkspace = useCallback(() => {
    // Respect the org-level `allowMultipleWorkspaces` restriction (dev
    // #1505). If the checker returns true, the admin has disabled
    // adding further workspaces; surface a friendly notice instead of
    // opening the modal.
    if (
      workspaces.length > 0 &&
      checkDesktopRestriction({ restriction: "allowMultipleWorkspaces" })
    ) {
      restrictionNotice.show({
        title: "Additional workspaces are restricted",
        message:
          "Your organization administrator has restricted access to adding additional workspaces.",
      });
      return;
    }
    setCreateWorkspaceRemoteError(null);
    setCreateWorkspaceOpen(true);
  }, [checkDesktopRestriction, restrictionNotice, workspaces.length]);

  const handleOpenRenameWorkspace = useCallback((workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    setRenameWorkspaceId(workspaceId);
    setRenameWorkspaceTitle(
      workspace.displayName?.trim() ||
        workspace.name?.trim() ||
        workspace.path?.trim() ||
        "",
    );
  }, [workspaces]);

  const handleSaveRenameWorkspace = useCallback(async () => {
    if (!renameWorkspaceId) return;
    const trimmed = renameWorkspaceTitle.trim();
    if (!trimmed) return;
    setRenameWorkspaceBusy(true);
    try {
      // Rename on both ends so the sidebar reflects the change regardless of
      // which list wins the next refresh (server-provided routeWorkspaces or
      // desktop-provided workspaceBootstrap results). Either call failing on
      // its own should NOT block the other — the user's intent was "rename
      // this workspace" and a soft failure in one store is recoverable.
      if (isDesktopRuntime()) {
        await workspaceUpdateDisplayName({
          workspaceId: renameWorkspaceId,
          displayName: trimmed,
        }).catch(() => undefined);
      }
      if (client) {
        await client
          .updateWorkspaceDisplayName(renameWorkspaceId, trimmed)
          .catch(() => undefined);
      }
      setRenameWorkspaceId(null);
      setRenameWorkspaceTitle("");
      await refreshRouteState();
    } finally {
      setRenameWorkspaceBusy(false);
    }
  }, [client, refreshRouteState, renameWorkspaceId, renameWorkspaceTitle]);

  const handleRevealWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    const path = workspace?.path?.trim();
    if (!path || !isDesktopRuntime()) return;
    try {
      await revealDesktopItemInDir(path);
    } catch {
      // ignore
    }
  }, [workspaces]);

  const handleShareWorkspace = useCallback((workspaceId: string) => {
    shareWorkspaceState.openShareWorkspace(workspaceId);
  }, [shareWorkspaceState]);

  const handleSaveShareRemoteAccess = useCallback(
    async (enabled: boolean) => {
      if (!isDesktopRuntime()) return;
      await remoteAccessRestart.save(enabled);
    },
    [remoteAccessRestart],
  );

  const handleExportWorkspaceConfig = useCallback(
    async (workspaceId: string) => {
      if (!isDesktopRuntime()) return;
      const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
      if (!workspace) return;
      const outputPath = await pickDirectory({
        title: `Choose where to export ${workspaceLabel(workspace)}`,
      });
      const targetPath = Array.isArray(outputPath) ? outputPath[0] : outputPath;
      if (!targetPath) return;
      await workspaceExportConfig({ workspaceId, outputPath: targetPath });
      try {
        await revealDesktopItemInDir(targetPath);
      } catch {
        // ignore reveal failures
      }
    },
    [workspaces],
  );

  const handleForgetWorkspace = useCallback(
    async (workspaceId: string) => {
      if (typeof window !== "undefined") {
        const message =
          t("workspace_list.remove_confirm") ||
          "Remove this workspace from the sidebar?";
        if (!window.confirm(message)) return;
      }
      // Remove from both stores so the next refresh can't resurrect the row
      // from whichever list wins the merge.
      if (isDesktopRuntime()) {
        await workspaceForget(workspaceId).catch(() => undefined);
      }
      if (client) {
        await client.deleteWorkspace(workspaceId).catch(() => undefined);
      }
      if (selectedWorkspaceId === workspaceId) {
        setLegacySelectedWorkspaceId("");
        writeActiveWorkspaceId(null);
        navigate(legacySessionRoute());
      }
      forgetWorkspaceMemory(workspaceId);
      await refreshRouteState();
    },
    [client, navigate, refreshRouteState, selectedWorkspaceId],
  );

  const runRemoteWorkspaceConnectionCheck = useCallback(
    async (workspaceId: string, mode: "test" | "recover") => {
      if (publicBetaWeb) return false;
      const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
      if (!workspace || workspace.workspaceType !== "remote") return false;
      const connectionKey = getRemoteWorkspaceConnectionKey(workspace);
      remoteWorkspaceCheckRunCounterRef.current += 1;
      const runId = String(remoteWorkspaceCheckRunCounterRef.current);
      remoteWorkspaceCheckRunRef.current[workspaceId] = runId;

      setWorkspaceConnectionOverrides((current) => ({
        ...current,
        [workspaceId]: {
          status: "connecting",
          message: t("config.testing_connection"),
          checkedAt: null,
        },
      }));

      const result = await testRemoteWorkspaceConnection(workspace);
      const currentWorkspace = workspacesRef.current.find((item) => item.id === workspaceId);
      if (
        remoteWorkspaceCheckRunRef.current[workspaceId] !== runId ||
        !currentWorkspace ||
        getRemoteWorkspaceConnectionKey(currentWorkspace) !== connectionKey
      ) {
        if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
          delete remoteWorkspaceCheckRunRef.current[workspaceId];
        }
        return false;
      }
      setWorkspaceConnectionOverrides((current) => ({
        ...current,
        [workspaceId]: result.state,
      }));

      if (!result.ok) {
        setErrorsByWorkspaceId((current) => ({
          ...current,
          [workspaceId]: result.state.message ?? "Remote worker connection failed.",
        }));
        if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
          delete remoteWorkspaceCheckRunRef.current[workspaceId];
        }
        return false;
      }

      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRetryingWorkspaceIds((current) => current.filter((id) => id !== workspaceId));
      if (mode === "recover") {
        await refreshRouteState();
      }
      if (remoteWorkspaceCheckRunRef.current[workspaceId] === runId) {
        delete remoteWorkspaceCheckRunRef.current[workspaceId];
      }
      return true;
    },
    [publicBetaWeb, refreshRouteState],
  );

  const handleCreateTaskInWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (
      !workspace ||
      loading ||
      retryingWorkspaceIds.includes(workspaceId)
    ) {
      return;
    }
    const endpoint = resolveWorkspaceEndpoint(workspace, { baseUrl, token, hostToken });
    if (!endpoint || (!endpoint.token && !publicBetaWeb)) {
      return;
    }
    const workspaceClient = createClient(
      endpoint.opencodeBaseUrl,
      workspace.path?.trim() || undefined,
      { token: endpoint.token || undefined, mode: "matterhorn" },
    );
    try {
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: null }));
      setRouteError(null);
      const session = unwrap(
        await workspaceClient.session.create({ directory: workspace.path?.trim() || undefined }),
      );
      setLegacySelectedWorkspaceId(workspaceId);
      writeActiveWorkspaceId(workspaceId || null);
      writeLastSessionFor(workspaceId, session.id);
      rememberPendingCreatedSession(workspaceId, session.id);
      setSessionsByWorkspaceId((current) => {
        const next = {
          ...current,
          [workspaceId]: [session as any, ...(current[workspaceId] ?? [])],
        };
        sessionsByWorkspaceIdRef.current = next;
        return next;
      });
      navigateToWorkspaceSession(workspaceId, session.id);
      focusPromptSoon();
      void refreshRouteState();
    } catch (error) {
      const message = describeTaskCreateError(error);
      setRouteError(message);
      setErrorsByWorkspaceId((current) => ({ ...current, [workspaceId]: message }));
      showToast({
        title: "Matterhorn Desks engine unavailable",
        description: message,
        tone: "error",
        actionLabel: "Retry",
        onAction: () => void handleCreateTaskInWorkspace(workspaceId),
        durationMs: 0,
      });
      if (isTransientStartupError(message)) {
        setRetryingWorkspaceIds((current) => Array.from(new Set([...current, workspaceId])));
        if (startupRetryTimerRef.current === null) {
          startupRetryTimerRef.current = window.setTimeout(() => {
            startupRetryTimerRef.current = null;
            refreshInFlightRef.current = false;
            void refreshRouteState();
          }, 1_000);
        }
      }
    }
  }, [baseUrl, loading, navigateToWorkspaceSession, publicBetaWeb, refreshRouteState, rememberPendingCreatedSession, retryingWorkspaceIds, showToast, token, workspaces]);

  // Global shortcuts:
  //   Cmd/Ctrl+N  -> new task in selected workspace
  //   Cmd/Ctrl+K  -> toggle command palette
  const handleGlobalShortcut = useEffectEvent((event: KeyboardEvent) => {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
    const mod = isMac ? event.metaKey : event.ctrlKey;
    if (!mod) return;
    if (event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const inEditable =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const key = event.key?.toLowerCase();
    if (key === "n" && !inEditable) {
      event.preventDefault();
      if (canCreateTask && selectedWorkspaceId) {
        void handleCreateTaskInWorkspace(selectedWorkspaceId);
      }
      return;
    }
    if (key === "k") {
      event.preventDefault();
      setCommandPaletteOpen((value) => !value);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => handleGlobalShortcut(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const navigateToSessionForControl = useCallback((sessionId: string) => {
    const owner = Object.entries(sessionsByWorkspaceId).find(([, sessions]) =>
      (sessions ?? []).some((session: any) => session?.id === sessionId),
    )?.[0];
    navigateToWorkspaceSession(owner || selectedWorkspaceId, sessionId);
  }, [navigateToWorkspaceSession, selectedWorkspaceId, sessionsByWorkspaceId]);

  const navigateToSessionRootForControl = useCallback(() => {
    navigateToWorkspaceSession(selectedWorkspaceId, null, { replace: true });
  }, [navigateToWorkspaceSession, selectedWorkspaceId]);

  const openModelPickerForControl = useCallback(() => {
    setModelPickerOpen(true);
  }, []);

  useSessionControlActions({
    workspaces,
    sessionsByWorkspaceId,
    selectedWorkspaceId,
    selectedWorkspaceRoot,
    selectedSessionId,
    canCreateTask,
    matterhornClient: client,
    opencodeClient,
    navigateToSession: navigateToSessionForControl,
    navigateToSessionRoot: navigateToSessionRootForControl,
    createTaskInWorkspace: handleCreateTaskInWorkspace,
    openModelPicker: openModelPickerForControl,
    refreshRouteState,
  });

  const commandPaletteControlAction = useMemo<MatterhornControlAction>(() => ({
    id: "command_palette.open",
    label: "Open the command palette",
    description: "Open the in-app command palette so the next choice is visible.",
    sideEffect: "none",
    execute: () => setCommandPaletteOpen(true),
  }), []);
  useControlAction(commandPaletteControlAction);

  const paletteSessionOptions = useMemo<PaletteSessionOption[]>(() => {
    const out: PaletteSessionOption[] = [];
    for (const workspace of workspaces) {
      const workspaceTitle =
        workspace.displayName?.trim() ||
        workspace.name?.trim() ||
        workspace.path?.trim() ||
        t("session.workspace_fallback");
      const list = sessionsByWorkspaceId[workspace.id] ?? [];
      for (const session of list) {
        const sessionId = (session as { id?: string }).id?.trim() ?? "";
        if (!sessionId) continue;
        const title = getDisplaySessionTitle(
          (session as { title?: string }).title ?? "",
        );
        const updatedAt =
          (session as { time?: { updated?: number; created?: number } }).time
            ?.updated ??
          (session as { time?: { updated?: number; created?: number } }).time
            ?.created ??
          0;
        out.push({
          workspaceId: workspace.id,
          sessionId,
          title,
          workspaceTitle,
          updatedAt,
          searchText: `${title} ${workspaceTitle}`.toLowerCase(),
          isActive: workspace.id === selectedWorkspaceId,
        });
      }
    }
    out.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    return out;
  }, [sessionsByWorkspaceId, selectedWorkspaceId, workspaces]);

  const handleReorderWorkspaces = useCallback((workspaceIds: string[]) => {
    const activeWorkspaceIds = new Set(workspacesRef.current.map((workspace) => workspace.id));
    const nextOrderIds: string[] = [];
    const nextOrderIdSet = new Set<string>();

    for (const id of workspaceIds) {
      if (!activeWorkspaceIds.has(id) || nextOrderIdSet.has(id)) continue;
      nextOrderIds.push(id);
      nextOrderIdSet.add(id);
    }

    for (const workspace of workspacesRef.current) {
      if (nextOrderIdSet.has(workspace.id)) continue;
      nextOrderIds.push(workspace.id);
      nextOrderIdSet.add(workspace.id);
    }

    workspaceOrderIdsRef.current = nextOrderIds;
    setWorkspaceOrderIds(nextOrderIds);
    writeWorkspaceOrderIds(nextOrderIds);
    setWorkspaces((current) => orderRouteWorkspaces(current, nextOrderIds));
  }, []);

  const handleCreateWorkspace = useCallback(async (preset: WorkspacePreset, folder: string | null) => {
    if (!folder || !isDesktopRuntime()) return;
    setCreateWorkspaceBusy(true);
    setCreateWorkspaceError(null);
    try {
      const workspaceName = folderNameFromPath(folder);
      const list = await workspaceCreate({
        folderPath: folder,
        name: workspaceName,
        preset,
      }) as WorkspaceList;
      const createdId = resolveWorkspaceListSelectedId(list) || list.workspaces[list.workspaces.length - 1]?.id || "";
      let targetWorkspaceId = createdId;
      let targetWorkspace = list.workspaces.find((workspace: WorkspaceInfo) => workspace.id === createdId) ?? null;
      if (createdId) {
        await workspaceSetSelected(createdId).catch(() => undefined);
        await workspaceSetRuntimeActive(createdId).catch(() => undefined);
      }
      // Register the workspace with the running matterhorn-server so
      // listWorkspaces() reflects it immediately. Without this the UI only
      // picks up the new workspace after an app restart (because the server
      // is launched with a fixed --workspace list at boot and the bridge
      // write only updates desktop-side state).
      if (client) {
        const serverList = await client
          .createLocalWorkspace({ folderPath: folder, name: workspaceName, preset })
          .catch(() => null);
        targetWorkspaceId = serverList
          ? resolveWorkspaceListSelectedId(serverList) || serverList.workspaces[serverList.workspaces.length - 1]?.id || targetWorkspaceId
          : targetWorkspaceId;
        targetWorkspace = serverList?.workspaces.find((workspace) => workspace.id === targetWorkspaceId) ?? targetWorkspace;
      }
      setCreateWorkspaceOpen(false);
      // Mark onboarding complete so the /welcome redirect never fires again.
      local.setPrefs((prev) => ({ ...prev, hasCompletedOnboarding: true }));
      await refreshRouteState();
      if (targetWorkspaceId) {
        const workspacePath = targetWorkspace?.path?.trim() || folder;
        const session = baseUrl && (token || publicBetaWeb)
          ? unwrap(await createClient(
              `${(buildMatterhornWorkspaceBaseUrl(baseUrl, targetWorkspaceId) ?? baseUrl).replace(/\/+$/, "")}/opencode`,
              workspacePath || undefined,
              { token: token || undefined, mode: "matterhorn" },
            ).session.create({ directory: workspacePath || undefined }))
          : null;
        setLegacySelectedWorkspaceId(targetWorkspaceId);
        writeActiveWorkspaceId(targetWorkspaceId);
        if (session?.id) {
          writeLastSessionFor(targetWorkspaceId, session.id);
          rememberPendingCreatedSession(targetWorkspaceId, session.id);
          setSessionsByWorkspaceId((current) => {
            const next = {
              ...current,
              [targetWorkspaceId]: [session as any, ...(current[targetWorkspaceId] ?? [])],
            };
            sessionsByWorkspaceIdRef.current = next;
            return next;
          });
        }
        navigateToWorkspaceSession(targetWorkspaceId, session?.id ?? null, { replace: true });
        if (session?.id) focusPromptSoon();
      }
    } catch (error) {
      setCreateWorkspaceError(describeWorkspaceCreateError(error));
    } finally {
      setCreateWorkspaceBusy(false);
    }
  }, [baseUrl, client, local, navigateToWorkspaceSession, publicBetaWeb, refreshRouteState, rememberPendingCreatedSession, token]);

  const handleCreateRemoteWorkspace = useCallback(async (input: {
    matterhornHostUrl?: string | null;
    matterhornToken?: string | null;
    directory?: string | null;
    displayName?: string | null;
  }) => {
    if (publicBetaWeb) {
      showToast({
        title: "Use Matterhorn Cloud to access projects",
        description: "Public web never accepts a worker URL or access token. Open your Cloud project instead.",
        tone: "warning",
        durationMs: 4200,
      });
      return false;
    }
    const baseUrlValue = input.matterhornHostUrl?.trim() ?? "";
    if (!baseUrlValue) return false;
    setCreateWorkspaceRemoteBusy(true);
    setCreateWorkspaceRemoteError(null);
    try {
      const list = await workspaceCreateRemote({
        baseUrl: baseUrlValue,
        matterhornHostUrl: baseUrlValue,
        matterhornToken: input.matterhornToken?.trim() || null,
        displayName: input.displayName?.trim() || null,
        directory: input.directory?.trim() || null,
        remoteType: "matterhorn",
      }) as WorkspaceList;
      const createdId = resolveWorkspaceListSelectedId(list) || list.workspaces[list.workspaces.length - 1]?.id || "";
      if (createdId) {
        await workspaceSetSelected(createdId).catch(() => undefined);
        await workspaceSetRuntimeActive(createdId).catch(() => undefined);
      }
      setCreateWorkspaceOpen(false);
      // Mark onboarding complete so the /welcome redirect never fires again.
      local.setPrefs((prev) => ({ ...prev, hasCompletedOnboarding: true }));
      await refreshRouteState();
      return true;
    } catch (error) {
      setCreateWorkspaceRemoteError(error instanceof Error ? error.message : t("app.unknown_error"));
      return false;
    } finally {
      setCreateWorkspaceRemoteBusy(false);
    }
  }, [local, publicBetaWeb, refreshRouteState, showToast]);

  const renderEmbeddedSettingsSurface = useCallback((initialPath: "general" | "cloud-account" | "wallet" | "extensions") => (
    <LazyEmbeddedSettingsSurface
      key={initialPath}
      embedded
      hideWorkspaceSwitcher
      initialPath={initialPath}
      workspaceId={selectedWorkspaceId}
      onClose={() => {
        try {
          window.dispatchEvent(new CustomEvent("openwork-close-right-pane"));
        } catch {
          // ignore
        }
      }}
    />
  ), [selectedWorkspaceId]);

  return (
    <WorkspaceProvider
      client={opencodeClient}
      opencodeBaseUrl={opencodeBaseUrl}
      selectedWorkspaceRoot={selectedWorkspaceRoot}
    >
    {opencodeClient && selectedWorkspaceEndpoint && opencodeBaseUrl && (selectedWorkspaceServerToken || publicBetaWeb) ? (
      <ReactSessionRuntime
        // Use the server-side workspace id (the one without the `rem_`
        // prefix) so the React Query cache keys session-sync writes match
        // the keys SessionSurface reads from. Otherwise events arrive but
        // the UI never sees them and gets stuck on "thinking".
        workspaceId={selectedWorkspaceEndpoint.workspaceId}
        sessionId={selectedSessionId}
        activeSessionIds={activeSelectedWorkspaceSessionIds}
        opencodeBaseUrl={opencodeBaseUrl}
        matterhornToken={selectedWorkspaceServerToken || ""}
        onSessionUpdated={handleRuntimeSessionUpdated}
      />
    ) : null}
    <SessionPage
      selectedSessionId={selectedSessionId}
      workspaceHomeView={isWorkspaceHistoryRoute ? "history" : "home"}
      selectedWorkspaceId={selectedWorkspaceId}
      selectedWorkspaceDisplay={selectedWorkspace ? {
        id: selectedWorkspace.id,
        name: selectedWorkspace.name ?? undefined,
        displayName: selectedWorkspace.displayNameResolved,
        workspaceType: selectedWorkspace.workspaceType,
      } : { workspaceType: "local" }}
      selectedWorkspaceRoot={selectedWorkspaceRoot}
      selectedWorkspaceError={selectedWorkspaceError}
      runtimeWorkspaceId={selectedWorkspaceEndpoint?.workspaceId || null}
      opencodeBaseUrl={opencodeBaseUrl}
      workspaces={workspaces}
      clientConnected={canCreateTask}
      matterhornServerStatus={client ? "connected" : "disconnected"}
      matterhornServerClient={selectedWorkspaceEndpoint?.client ?? client}
      matterhornServerToken={selectedWorkspaceServerToken}
      developerMode={typeof window !== "undefined" && window.localStorage.getItem("openwork.developerMode") === "1"}
      headerStatus={canCreateTask ? t("status.connected") : t("session.loading_detail")}
      busyHint={effectiveLoading ? t("session.loading_detail") : null}
      startupPhase={effectiveLoading ? "nativeInit" : "ready"}
      providerConnectedIds={providerConnectedIds}
      providers={providers}
      modelUnavailable={selectedModelUnavailable}
      mcpConnectedCount={0}
      onSendFeedback={() => setFeedbackDialogOpen(true)}
      onOpenSettings={() => handleOpenSettings("/settings/ai")}
      providerAuthModal={sessionProviderAuthSnapshot.providerAuthModalOpen ? {
        open: true,
        loading: false,
        submitting: sessionProviderAuthSnapshot.providerAuthBusy,
        error: sessionProviderAuthSnapshot.providerAuthError,
        preferredProviderId: sessionProviderAuthSnapshot.providerAuthPreferredProviderId,
        workerType: sessionProviderAuthSnapshot.providerAuthWorkerType,
        providers: sessionProviderAuthSnapshot.providerAuthProviders.filter(
          (provider) => !isDesktopProviderBlocked({ providerId: provider.id, checkRestriction: checkDesktopRestriction }),
        ),
        connectedProviderIds: providerConnectedIds,
        authMethods: Object.fromEntries(
          Object.entries(sessionProviderAuthSnapshot.providerAuthMethods).filter(
            ([providerId]) => !isDesktopProviderBlocked({ providerId, checkRestriction: checkDesktopRestriction }),
          ),
        ),
        onSelect: sessionProviderAuthStore.startProviderAuth,
        onSubmitApiKey: sessionProviderAuthStore.submitProviderApiKey,
        onConnectCloudProvider: sessionProviderAuthStore.connectCloudProvider,
        onSubmitOAuth: sessionProviderAuthStore.completeProviderAuthOAuth,
        onRefreshProviders: sessionProviderAuthStore.refreshProviders,
        onClose: () => sessionProviderAuthStore.closeProviderAuthModal(),
      } : null}
      settingsSlot={renderEmbeddedSettingsSurface("extensions")}
      settingsSlotForPath={renderEmbeddedSettingsSurface}
      pendingDeskTask={pendingDeskTask}
      onPendingDeskTaskRestored={handlePendingDeskTaskRestored}
      sidebar={{
        workspaceSessionGroups,
        selectedWorkspaceId,
        selectedSessionId,
        developerMode: false,
        sessionStatusById: sidebarSessionStatusById,
        connectingWorkspaceId: null,
        workspaceConnectionStateById,
        newTaskDisabled: !canCreateTask,
        sidebarHydratedFromCache: Object.values(sessionsByWorkspaceId).some((list) => list.length > 0),
        startupPhase: effectiveLoading ? "nativeInit" : "ready",
        onSelectWorkspace: async (workspaceId) => {
          if (workspaceId === selectedWorkspaceId) return true;
          setLegacySelectedWorkspaceId(workspaceId);
          writeActiveWorkspaceId(workspaceId || null);
          const workspace = workspaces.find((item) => item.id === workspaceId);
          if (client && workspace && !sessionsByWorkspaceId[workspaceId]?.length) {
            setRetryingWorkspaceIds((current) => Array.from(new Set([...current, workspaceId])));
            void loadWorkspaceSessionsInBackground([workspace]);
          }
          // Fire Tauri updates but don't await them — they're bookkeeping and
          // awaiting 2 IPC roundtrips on every click used to stall rapid
          // workspace switches behind a queue.
          if (isDesktopRuntime()) {
            void workspaceSetSelected(workspaceId).catch(() => undefined);
            void workspaceSetRuntimeActive(workspaceId).catch(() => undefined);
          }
          // Tell the Matterhorn Desks server this workspace is now active so it can
          // emit a config reload event that the OpenCode engine picks up.
          // Without this, the permissions from opencode.jsonc are never
          // applied on the workspace the user is already on at launch. See
          // issue #870.
          if (workspaceId && client) {
            const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
            const endpoint = endpointForWorkspace(workspace);
            if (endpoint) {
              void endpoint.client.activateWorkspace(endpoint.workspaceId).catch(() => undefined);
            }
          }
          // If we remember what the user last opened here and that session
          // still exists in our local list, navigate. Otherwise stay put.
          const remembered = readLastSessionFor(workspaceId);
          if (remembered && remembered !== selectedSessionId) {
            const known = sessionsByWorkspaceId[workspaceId];
            if (known?.some((session: any) => session?.id === remembered)) {
              navigateToWorkspaceSession(workspaceId, remembered);
            } else {
              navigateToWorkspaceSession(workspaceId);
            }
          } else {
            navigateToWorkspaceSession(workspaceId);
          }
          return true;
        },
        onOpenWorkspaceHome: (workspaceId) => {
          setSelectedAgent(null);
          writeActiveWorkspaceId(workspaceId || null);
          navigateToWorkspaceSession(workspaceId, null);
        },
        onOpenWorkspaceHistory: (workspaceId) => {
          setSelectedAgent(null);
          writeActiveWorkspaceId(workspaceId || null);
          navigate(workspaceRunHistoryRoute(workspaceId));
        },
        onOpenSession: (workspaceId, sessionId) => {
          setSelectedAgent(null);
          setLegacySelectedWorkspaceId(workspaceId);
          writeActiveWorkspaceId(workspaceId || null);
          writeLastSessionFor(workspaceId, sessionId);
          navigateToWorkspaceSession(workspaceId, sessionId);
        },
        onPrefetchSession: () => {},
        onCreateTaskInWorkspace: (workspaceId) => {
          setSelectedAgent(null);
          void handleCreateTaskInWorkspace(workspaceId);
        },
        onCreateTaskWithPrompt: (workspaceId, prompt, options) => {
          return (async () => {
            const workspace = workspaces.find((item) => item.id === workspaceId);
            const title = options?.title?.trim();
            const agent = options?.agent?.trim();
            const taskLaunchEvent = {
              workspaceId,
              title: title || "desk task",
              agent: agent || null,
              sendImmediately: Boolean(options?.sendImmediately),
              promptLength: prompt.length,
            };
            recordInspectorEvent("desk.task_launch.requested", taskLaunchEvent);
            if (!workspace) {
              recordInspectorEvent("desk.task_launch.failed", {
                ...taskLaunchEvent,
                reason: "workspace_not_found",
              });
              showToast({
                title: "Could not start task",
                description: "The workspace could not be found. Return Home and try again.",
                tone: "error",
                durationMs: 3600,
              });
              return false;
            }
            const endpoint = resolveWorkspaceEndpoint(workspace, { baseUrl, token, hostToken });
            if (!endpoint || (!endpoint.token && !publicBetaWeb)) {
              recordInspectorEvent("desk.task_launch.failed", {
                ...taskLaunchEvent,
                reason: "engine_offline",
              });
              showToast({
                title: "Matterhorn Desks engine is offline",
                description: "The task could not start because this workspace is not connected to a local engine.",
                tone: "error",
                durationMs: 4200,
              });
              return false;
            }
            if (options?.sendImmediately && selectedModelUnavailable) {
              const deskId = options.deskId ?? getMatterhornDeskAgentById(agent)?.deskId;
              const pendingDeskTask = isPendingDeskTaskId(deskId)
                ? {
                    deskId,
                    title: title || getCustomerProtocolDeskVisual(deskId)?.agentName || "Desk task",
                  }
                : undefined;
              if (pendingDeskTask) {
                writePendingDeskTask(workspaceId, pendingDeskTask);
              }
              recordInspectorEvent("desk.task_launch.failed", {
                ...taskLaunchEvent,
                reason: "model_unavailable",
              });
              handleOpenSettings("/settings/ai", workspaceId, { pendingDeskTask });
              showToast({
                title: pendingDeskTask
                  ? `Finish setting up ${pendingDeskTask.title}`
                  : "Connect a model provider to start the task",
                description: pendingDeskTask
                  ? "Choose a provider and model, then return to this desk task. Nothing has been sent."
                  : "Add a provider in Models, then choose one of its available models.",
                tone: "warning",
                durationMs: 5200,
              });
              return false;
            }
            const workspacePath = workspace.path?.trim() || undefined;
            const sendImmediately = Boolean(options?.sendImmediately);
            const workspaceClient = createClient(
              endpoint.opencodeBaseUrl,
              workspacePath,
              { token: endpoint.token || undefined, mode: "matterhorn", executionMode: "work" },
            );
            try {
              const session = unwrap(
                await workspaceClient.session.create({ directory: workspacePath }),
              );
              const displaySession = title ? { ...(session as any), title } : session;
              if (title) {
                await workspaceClient.session.update({
                  sessionID: session.id,
                  title,
                  directory: workspacePath,
                }).catch(() => undefined);
              }
              recordInspectorEvent("desk.task_launch.session_created", {
                ...taskLaunchEvent,
                sessionId: session.id,
              });
              writeMatterhornExecutionMode(workspaceId, session.id, "work");
              await options?.onSessionCreated?.(session.id);
              if (!sendImmediately) {
                saveSessionDraft(workspaceId, session.id, { text: prompt, mode: "prompt" });
              }
              setSelectedAgent(agent || null);
              writeActiveWorkspaceId(workspaceId || null);
              writeLastSessionFor(workspaceId, session.id);
              rememberPendingCreatedSession(workspaceId, session.id);
              setSessionsByWorkspaceId((current) => ({
                ...current,
                [workspaceId]: [displaySession as any, ...(current[workspaceId] ?? [])],
              }));
              navigateToWorkspaceSession(workspaceId, session.id);
              if (sendImmediately) {
                useSessionActivityStore.getState().startOptimisticRun(workspaceId, session.id, {
                  title: title || "desk task",
                  agent: agent || undefined,
                });
                showToast({
                  title: `Starting ${title || "desk task"}`,
                  description: "Sending the task to the agent.",
                  tone: "info",
                  durationMs: 1600,
                });
              }
              if (!sendImmediately) {
                focusPromptSoon();
                recordInspectorEvent("desk.task_launch.draft_saved", {
                  ...taskLaunchEvent,
                  sessionId: session.id,
                });
                return true;
              }

              try {
                const systemContext = await buildSessionSystemContext(prompt, session.id, agent, "work");
                const operation = beginModelOperation({
                  workspaceId,
                  sessionId: session.id,
                  providerId: selectedPromptModel?.providerID,
                  modelId: selectedPromptModel?.modelID,
                  reasoningLevel: modelVariantValue,
                  source: "desk",
                });
                recordInspectorEvent("desk.task_launch.prompt_send_started", {
                  ...taskLaunchEvent,
                  sessionId: session.id,
                });
                const result = await workspaceClient.session.promptAsync({
                  sessionID: session.id,
                  parts: [{ type: "text", text: prompt }],
                  model: selectedPromptModel ?? undefined,
                  agent: agent || undefined,
                  ...(modelVariantValue ? { variant: modelVariantValue } : {}),
                  ...(systemContext ? { system: systemContext } : {}),
                });
                if (result.error) {
                  throw new Error(serializeSDKError(result.error));
                }
                recordModelOperationAccepted(operation);
                saveSessionDraft(workspaceId, session.id, { text: "", mode: "prompt" });
                recordInspectorEvent("desk.task_launch.prompt_sent", {
                  ...taskLaunchEvent,
                  sessionId: session.id,
                });
                showToast({
                  title: `${title || "Desk task"} started`,
                  description: "The agent is working in this session.",
                  tone: "success",
                  durationMs: 2400,
                });
                return true;
              } catch (error) {
                const operation = pendingModelOperation(session.id);
                if (operation) recordModelOperationProviderError(operation, error);
                const message = describeTaskCreateError(error);
                useSessionActivityStore.getState().setRunStatus(workspaceId, session.id, { type: "idle" });
                saveSessionDraft(workspaceId, session.id, { text: prompt, mode: "prompt" });
                focusPromptSoon();
                recordInspectorEvent("desk.task_launch.fallback_saved", {
                  ...taskLaunchEvent,
                  sessionId: session.id,
                  reason: message,
                });
                showToast({
                  title: "Task needs review before sending",
                  description: `${message} The prompt is saved in the composer.`,
                  tone: "warning",
                  durationMs: 5200,
                });
                return false;
              }
            } catch (error) {
              recordInspectorEvent("desk.task_launch.failed", {
                ...taskLaunchEvent,
                reason: describeTaskCreateError(error),
              });
              showToast({
                title: "Could not start task",
                description: describeTaskCreateError(error),
                tone: "error",
                durationMs: 5200,
              });
              return false;
            }
          })();
        },
        onOpenRenameWorkspace: handleOpenRenameWorkspace,
        onShareWorkspace: handleShareWorkspace,
        onRevealWorkspace: (id) => void handleRevealWorkspace(id),
        onRecoverWorkspace: publicBetaWeb
          ? undefined
          : (workspaceId) => runRemoteWorkspaceConnectionCheck(workspaceId, "recover"),
        onTestWorkspaceConnection: publicBetaWeb
          ? undefined
          : (workspaceId) => runRemoteWorkspaceConnectionCheck(workspaceId, "test"),
        onEditWorkspaceConnection: publicBetaWeb ? undefined : remoteWorkspaceConnectionEditor.open,
        onForgetWorkspace: (id) => void handleForgetWorkspace(id),
        onOpenCreateWorkspace: handleOpenCreateWorkspace,
        onReorderWorkspaces: handleReorderWorkspaces,
      }}
      surface={surfaceProps}
      history={{
        canUndo: false,
        canRedo: false,
        busyAction: null,
        onUndo: () => {},
        onRedo: () => {},
      }}
      todos={todos}
      sessionLoadingById={(sessionId) => effectiveLoading && Boolean(sessionId && sessionId === selectedSessionId)}
      shareWorkspaceModal={
        shareWorkspaceState.shareWorkspaceOpen
          ? {
              open: true,
              onClose: shareWorkspaceState.closeShareWorkspace,
              workspaceName: shareWorkspaceState.shareWorkspaceName,
              workspaceDetail: shareWorkspaceState.shareWorkspaceDetail,
              fields: shareWorkspaceState.shareFields,
              remoteAccess:
                isDesktopRuntime() && shareWorkspaceState.shareWorkspace?.workspaceType === "local"
                  ? {
                      enabled: matterhornServerSettings.remoteAccessEnabled === true,
                      busy: remoteAccessRestart.busy,
                      error: remoteAccessRestart.error,
                      status: remoteAccessRestart.status,
                      onSave: handleSaveShareRemoteAccess,
                    }
                  : undefined,
              note: shareWorkspaceState.shareNote,
              onExportConfig:
                shareWorkspaceState.exportDisabledReason === null
                  ? () => {
                      const id = shareWorkspaceState.shareWorkspaceId;
                      if (!id) return;
                      void handleExportWorkspaceConfig(id);
                    }
                  : undefined,
              exportDisabledReason: shareWorkspaceState.exportDisabledReason,
            }
          : null
      }
      activePermission={activePermission}
      permissionReplyBusy={permissionReplyBusy}
      respondPermission={respondPermission}
      activeQuestion={activeQuestion}
      questionReplyBusy={questionReplyBusy}
      respondQuestion={respondQuestion}
      safeStringify={safeStringify}
      onRenameSession={
        opencodeClient
          ? async (sessionId, nextTitle) => {
              const trimmed = nextTitle.trim();
              if (!trimmed) return;
              await opencodeClient.session.update({
                sessionID: sessionId,
                title: trimmed,
                directory: selectedWorkspaceRoot || undefined,
              });
              await refreshRouteState();
            }
          : undefined
      }
      onDeleteSession={
        client && selectedWorkspaceId
          ? async (sessionId) => {
              const endpoint = endpointForWorkspace(selectedWorkspace);
              if (!endpoint) return;
              await endpoint.client.deleteSession(endpoint.workspaceId, sessionId);
              if (selectedSessionId === sessionId) {
                navigateToWorkspaceSession(selectedWorkspaceId);
              }
              await refreshRouteState();
            }
          : undefined
      }
      statusBar={{ loading: showPreparingStatus }}
      notFoundMessage={routeNotFoundMessage}
      onRevealPath={revealWorkspacePath}
      onAccessibleTargetsChange={setPaletteAccessibleTargets}
    />
    <CreateWorkspaceModal
      open={createWorkspaceOpen}
      onClose={() => {
        setCreateWorkspaceOpen(false);
        setCreateWorkspaceError(null);
      }}
      onConfirm={handleCreateWorkspace}
      onConfirmRemote={publicBetaWeb ? undefined : handleCreateRemoteWorkspace}
      allowDirectWorkspaceConnections={!publicBetaWeb}
      localDisabled={!isDesktopRuntime()}
      localDisabledReason={
        isDesktopRuntime()
          ? undefined
          : "Create local projects in the desktop app. Matterhorn Cloud provides projects for public web."
      }
      onPickFolder={() => pickDirectory({ title: t("onboarding.authorize_folder") }) as Promise<string | null>}
      submitting={createWorkspaceBusy}
      localError={createWorkspaceError}
      remoteSubmitting={createWorkspaceRemoteBusy}
      remoteError={createWorkspaceRemoteError}
    />
    {!publicBetaWeb ? <CreateRemoteWorkspaceModal
      open={remoteWorkspaceConnectionEditor.workspace !== null}
      onClose={remoteWorkspaceConnectionEditor.close}
      onConfirm={(input) => void remoteWorkspaceConnectionEditor.save(input)}
      initialValues={remoteWorkspaceConnectionEditor.initialValues}
      submitting={remoteWorkspaceConnectionEditor.busy}
      error={remoteWorkspaceConnectionEditor.error}
      title={t("dashboard.edit_remote_workspace_title")}
      subtitle={t("dashboard.edit_remote_workspace_subtitle")}
      confirmLabel={t("dashboard.edit_remote_workspace_confirm")}
    /> : null}
    <RenameWorkspaceModal
      open={renameWorkspaceId !== null}
      title={renameWorkspaceTitle}
      busy={renameWorkspaceBusy}
      canSave={!renameWorkspaceBusy && renameWorkspaceTitle.trim().length > 0}
      onClose={() => {
        if (renameWorkspaceBusy) return;
        setRenameWorkspaceId(null);
        setRenameWorkspaceTitle("");
      }}
      onSave={() => void handleSaveRenameWorkspace()}
      onTitleChange={setRenameWorkspaceTitle}
    />
    <CommandPalette
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      onGoHome={() => {
        if (selectedWorkspaceId) {
          navigateToWorkspaceSession(selectedWorkspaceId);
        }
      }}
      onCreateNewProject={() => {
        setCreateWorkspaceError(null);
        setCreateWorkspaceRemoteError(null);
        setCreateWorkspaceOpen(true);
      }}
      onCreateNewSession={() => {
        if (selectedWorkspaceId) {
          void handleCreateTaskInWorkspace(selectedWorkspaceId);
          return;
        }
        setCreateWorkspaceError(null);
        setCreateWorkspaceRemoteError(null);
        setCreateWorkspaceOpen(true);
      }}
      onOpenSession={(workspaceId, sessionId) => navigateToWorkspaceSession(workspaceId, sessionId)}
      onOpenSettings={(route) => handleOpenSettings(route ?? "/settings/general")}
      onSendFeedback={() => setFeedbackDialogOpen(true)}
      onOpenNotes={() => {
        const runtimeWorkspaceId = selectedWorkspaceEndpoint?.workspaceId?.trim() || "";
        if (!runtimeWorkspaceId || !selectedWorkspace?.id) {
          setCreateWorkspaceError(null);
          setCreateWorkspaceRemoteError(null);
          setCreateWorkspaceOpen(true);
          return;
        }
        navigate(workspaceNotesRoute(selectedWorkspace.id));
      }}
      onQuickJot={() => {
        const runtimeWorkspaceId = selectedWorkspaceEndpoint?.workspaceId?.trim() || "";
        if (!runtimeWorkspaceId) {
          setCreateWorkspaceError(null);
          setCreateWorkspaceRemoteError(null);
          setCreateWorkspaceOpen(true);
          return;
        }
        openQuickJot();
      }}
      notesEnabled={Boolean(selectedWorkspaceEndpoint?.workspaceId?.trim())}
      workspaceReady={Boolean(selectedWorkspaceEndpoint?.workspaceId?.trim())}
      accessibleTargets={paletteAccessibleTargets}
      onOpenAccessibleTarget={(target) => {
        try {
          window.dispatchEvent(new CustomEvent("openwork-open-accessible-target", { detail: target }));
        } catch {
          // ignore event dispatch failures
        }
      }}
      onHideAccessibleTarget={(target) => {
        try {
          window.dispatchEvent(new CustomEvent("openwork-hide-accessible-target", { detail: target }));
        } catch {
          // ignore event dispatch failures
        }
      }}
      currentProjectName={selectedWorkspaceName}
      projectFolderPath={selectedWorkspaceRoot}
      outputsPath={selectedWorkspaceOutputsPath}
      onOpenProjectFolder={() => void revealWorkspacePath(selectedWorkspaceRoot, "Project folder")}
      onOpenOutputs={() => void revealWorkspacePath(selectedWorkspaceOutputsPath, "Outputs folder")}
      onCopyProjectPath={() => void copyTextToClipboard(selectedWorkspaceRoot, "Project path")}
      onCopyOutputsPath={() => void copyTextToClipboard(selectedWorkspaceOutputsPath, "Outputs path")}
      sessions={paletteSessionOptions}
    />
    <ProjectFeedbackDialog
      open={feedbackDialogOpen}
      onOpenChange={setFeedbackDialogOpen}
      matterhornServerClient={feedbackClient}
      runtimeWorkspaceId={feedbackWorkspaceId}
      entrypoint="status-bar"
      target={{
        sourceType: selectedSessionId ? "chat" : "other",
        sourceId: selectedSessionId ?? feedbackWorkspaceId ?? undefined,
        href: location.pathname,
      }}
      onSubmitted={() => showToast({
        title: "Feedback saved",
        description: "Stored locally for product quality and routing. No training by default.",
        tone: "success",
      })}
      onError={(message) => showToast({ title: "Feedback was not saved", description: message, tone: "error" })}
    />
    <ModelPickerModal
      open={modelPickerOpen}
      options={allowedModelOptions}

      query={modelPickerQuery}
      setQuery={setModelPickerQuery}
      target="default"
      current={selectedPromptModel ?? ({ providerID: "", modelID: "" } satisfies ModelRef)}
      onSelect={(next: ModelRef) => {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: next,
          modelVariant: previous.defaultModel?.providerID === next.providerID && previous.defaultModel.modelID === next.modelID
            ? previous.modelVariant
            : null,
        }));
        setModelPickerOpen(false);
      }}
      disabledProviders={disabledProviderIds}
      onBehaviorChange={() => {}}
      onToggleProvider={async (providerId, enable) => {
        if (!opencodeClient) return;
        try {
          const config = unwrap(await opencodeClient.config.get()) as { disabled_providers?: string[] };
          const current = Array.isArray(config.disabled_providers) ? config.disabled_providers : [];
          const next = enable
            ? current.filter((id: string) => id !== providerId)
            : [...current, providerId];
          await opencodeClient.config.update({ config: { ...config, disabled_providers: next } });
          setDisabledProviderIds(next);
        } catch {}
      }}
      onOpenSettings={() => {
        setModelPickerOpen(false);
        handleOpenSettings("/settings/ai");
      }}
      onClose={() => { setModelPickerOpen(false); setRecentProviderIds(new Set()); }}
    />
    </WorkspaceProvider>
  );
}
