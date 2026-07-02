import type { Message, Part, Session, Todo } from "@opencode-ai/sdk/v2/client";
import type {
  MatterhornMemoryExportManifest,
  MatterhornMemoryRecord,
  MatterhornMemorySuggestion,
  MatterhornMemorySuggestionAction,
  MatterhornMemorySuggestionLifecycle,
  MatterhornMemorySuggestionStatus,
} from "@matterhorn-work/types";
import type {
  MatterhornWorkflowRun,
  MatterhornWorkflowRunStageInput,
} from "@matterhorn-work/types/workflow-runs";
import { desktopFetch } from "./desktop";
import { isDesktopRuntime } from "../utils";
import type { ExecResult, OpencodeConfigFile, WorkspaceInfo, WorkspaceList } from "./desktop";

export type MatterhornServerCapabilities = {
  skills: { read: boolean; write: boolean; source: "openwork" | "opencode" };
  hub?: {
    skills?: {
      read: boolean;
      install: boolean;
      repo?: { owner: string; name: string; ref: string };
    };
  };
  plugins: { read: boolean; write: boolean };
  mcp: { read: boolean; write: boolean };
  commands: { read: boolean; write: boolean };
  config: { read: boolean; write: boolean };
  sandbox?: { enabled: boolean; backend: "none" | "docker" | "container" };
  proxy?: { opencode: boolean };
  toolProviders?: {
    browser?: {
      enabled: boolean;
      placement: "in-sandbox" | "host-machine" | "client-machine" | "external";
      mode: "none" | "headless" | "interactive";
    };
    files?: {
      injection: boolean;
      outbox: boolean;
      inboxPath: string;
      outboxPath: string;
      outputsPath: string;
      maxBytes: number;
    };
  };
};

export type MatterhornServerStatus = "connected" | "disconnected" | "limited";

export type MatterhornServerDiagnostics = {
  ok: boolean;
  version: string;
  uptimeMs: number;
  readOnly: boolean;
  approval: { mode: "manual" | "auto"; timeoutMs: number };
  corsOrigins: string[];
  workspaceCount: number;
  activeWorkspaceId?: string | null;
  selectedWorkspaceId?: string | null;
  workspace: MatterhornWorkspaceInfo | null;
  authorizedRoots: string[];
  server: { host: string; port: number; configPath?: string | null };
  tokenSource: { client: string; host: string };
};

export type MatterhornRuntimeServiceName = "openwork-server" | "opencode";

export type MatterhornRuntimeServiceSnapshot = {
  name: MatterhornRuntimeServiceName;
  enabled: boolean;
  running: boolean;
  targetVersion: string | null;
  actualVersion: string | null;
  upgradeAvailable: boolean;
};

export type MatterhornRuntimeSnapshot = {
  ok: boolean;
  orchestrator?: {
    version: string;
    startedAt: number;
  };
  worker?: {
    workspace: string;
    sandboxMode: string;
  };
  upgrade?: {
    status: "idle" | "running" | "failed";
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
    operationId: string | null;
    services: MatterhornRuntimeServiceName[];
  };
  services: MatterhornRuntimeServiceSnapshot[];
};

export type MatterhornServerSettings = {
  urlOverride?: string;
  portOverride?: number;
  token?: string;
  hostToken?: string;
  remoteAccessEnabled?: boolean;
};

export type MatterhornWorkspaceInfo = WorkspaceInfo & {
  opencode?: {
    baseUrl?: string;
    directory?: string;
    username?: string;
    password?: string;
  };
};

export type MatterhornWorkspaceList = {
  items: MatterhornWorkspaceInfo[];
  workspaces?: WorkspaceInfo[];
  activeId?: string | null;
};

export type MatterhornMemorySearchOptions = {
  query?: string;
  kind?: MatterhornMemoryRecord["kind"];
  scope?: MatterhornMemoryRecord["scope"];
  tags?: string[];
  limit?: number;
};

export type MatterhornMemoryListResponse = {
  success: boolean;
  records: MatterhornMemoryRecord[];
  count: number;
};

export type MatterhornMemoryCaptureResponse = {
  success: boolean;
  record: MatterhornMemoryRecord;
  markdownPath?: string;
};

export type MatterhornMemorySuggestionPlanInput = {
  desk?: string;
  prompt?: string;
  message?: string;
  source?: string;
  sourceId?: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  ss58Address?: string | null;
  netuid?: number | null;
  validatorHotkey?: string | null;
  templateId?: string | null;
};

export type MatterhornMemorySuggestionPlanResponse = {
  success: boolean;
  suggestions: MatterhornMemorySuggestion[];
  count: number;
  writesMemory: false;
  safety: {
    captureMode: "user_confirmed_only";
    canAutoCapture: false;
    requiresExplicitConsent: true;
    rejectedSecretInput: boolean;
  };
  warnings: string[];
};

export type MatterhornMemorySuggestionResolveResponse = {
  success: boolean;
  suggestion: MatterhornMemorySuggestion;
  saved: boolean;
  dismissed: boolean;
  reason: string;
  record?: MatterhornMemoryRecord;
  markdownPath?: string;
  policyWarnings: string[];
};

export type MatterhornMemorySuggestionInboxStatus = MatterhornMemorySuggestionStatus;

export type MatterhornMemorySuggestionInboxEntry = MatterhornMemorySuggestionLifecycle & {
  version: "matterhorn.memory.suggestion-inbox.v1";
  id: string;
  suggestion: MatterhornMemorySuggestion;
  updatedAt: string;
  resolvedAt?: string;
  lastAction?: MatterhornMemorySuggestionAction;
  resolutionReason?: string;
  recordId?: string;
  markdownPath?: string;
  policyWarnings: string[];
};

export type MatterhornMemorySuggestionInboxResponse = MatterhornMemorySuggestionPlanResponse & {
  inbox: {
    entries: MatterhornMemorySuggestionInboxEntry[];
    count: number;
  };
};

export type MatterhornMemorySuggestionListResponse = {
  success: boolean;
  entries: MatterhornMemorySuggestionInboxEntry[];
  count: number;
};

export type MatterhornMemorySuggestionGetResponse = {
  success: boolean;
  entry: MatterhornMemorySuggestionInboxEntry;
};

export type MatterhornMemoryStoredSuggestionResolveResponse = MatterhornMemorySuggestionResolveResponse & {
  entry: MatterhornMemorySuggestionInboxEntry;
};

export type MatterhornMemoryForgetResponse = {
  success: boolean;
  forgotten: boolean;
  id: string;
};

// ---------------------------------------------------------------------------
// Task / Workflow run events
// ---------------------------------------------------------------------------

export type MatterhornTaskEventType =
  | "workflow_staged"
  | "workflow_started"
  | "stage_started"
  | "tool_called"
  | "artifact_saved"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * A single task/workflow run event.
 * detail and outcomeSummary are pre-scrubbed by the server — never contain
 * raw wallet keys, API tokens, signatures, or other secret material.
 */
export type MatterhornTaskEvent = {
  id: string;
  workspaceId: string;
  taskId: string;
  type: MatterhornTaskEventType;
  timestamp: number;
  summary: string;
  detail?: string;
  artifactPath?: string;
  toolName?: string;
  stageName?: string;
};

/** Collapsed view of a single task run, suitable for the task history list */
export type MatterhornTaskRun = {
  taskId: string;
  workspaceId: string;
  desk: string;
  sessionSlug: string;
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  outcomeSummary: string;
  artifactPaths: string[];
};

export type MatterhornMemoryExportResponse = {
  success: boolean;
  export: MatterhornMemoryExportManifest & {
    outputDir?: string;
    manifestPath?: string;
  };
};

export type MatterhornSessionMessage = {
  info: Message;
  parts: Part[];
};

export type MatterhornSessionSnapshot = {
  session: Session;
  messages: MatterhornSessionMessage[];
  todos: Todo[];
  status:
    | { type: "idle" }
    | { type: "busy" }
    | { type: "retry"; attempt: number; message: string; next: number };
};

export type MatterhornPluginItem = {
  spec: string;
  source: "config" | "dir.project" | "dir.global";
  scope: "project" | "global";
  path?: string;
};

export type MatterhornSkillItem = {
  name: string;
  path: string;
  description: string;
  scope: "project" | "global";
  trigger?: string;
};

export type MatterhornSkillContent = {
  item: MatterhornSkillItem;
  content: string;
};

export type MatterhornHubSkillItem = {
  name: string;
  description: string;
  trigger?: string;
  source: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
  };
};

export type MatterhornHubRepo = {
  owner?: string;
  repo?: string;
  ref?: string;
};

export type MatterhornWorkspaceFileContent = {
  path: string;
  content: string;
  bytes: number;
  updatedAt: number;
};

export type MatterhornWorkspaceFileWriteResult = {
  ok: boolean;
  path: string;
  bytes: number;
  updatedAt: number;
  revision?: string;
};

function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export type MatterhornCommandItem = {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string | null;
  subtask?: boolean;
  scope: "workspace" | "global";
};

export type MatterhornMcpItem = {
  name: string;
  config: Record<string, unknown>;
  source: "config.project" | "config.global" | "config.remote";
  disabledByTools?: boolean;
};

export type MatterhornWorkspaceExport = {
  workspaceId: string;
  exportedAt: number;
  opencode?: Record<string, unknown>;
  matterhorn?: Record<string, unknown>;
  skills?: Array<{ name: string; description?: string; trigger?: string; content: string }>;
  commands?: Array<{ name: string; description?: string; template?: string }>;
  files?: Array<{ path: string; content: string }>;
};

export type MatterhornWorkspaceImportChange = {
  kind: "opencode" | "matterhorn" | "skill" | "command" | "file";
  action: "create" | "update" | "replace" | "delete" | "unchanged";
  label: string;
  path: string;
};

export type MatterhornWorkspaceImportPreview = {
  fingerprint: string;
  summary: {
    total: number;
    create: number;
    update: number;
    replace: number;
    delete: number;
    unchanged: number;
  };
  changes: MatterhornWorkspaceImportChange[];
};

export type MatterhornWorkspaceExportSensitiveMode = "auto" | "include" | "exclude";

export type MatterhornWorkspaceExportWarning = {
  id: string;
  label: string;
  detail: string;
};

export type MatterhornBlueprintSessionsMaterializeResult = {
  ok: boolean;
  created: Array<{ templateId: string; sessionId: string; title: string }>;
  existing: Array<{ templateId: string; sessionId: string }>;
  openSessionId: string | null;
};

export type MatterhornArtifactItem = {
  id: string;
  name?: string;
  path?: string;
  size?: number;
  createdAt?: number;
  updatedAt?: number;
  mime?: string;
};

export type MatterhornArtifactList = {
  items: MatterhornArtifactItem[];
};

export type GoogleWorkspaceAccount = {
  email: string | null;
  name: string | null;
  picture: string | null;
  sub: string | null;
};

export type GoogleWorkspaceAuthStatus = {
  configured: boolean;
  missing: string[];
  vault: "encrypted" | "plaintext-dev" | "unavailable";
  connected: boolean;
  account: GoogleWorkspaceAccount | null;
  scopes: string[];
  connectedAt: string | null;
  error: string | null;
  testStatus: string | null;
  smokeTest: {
    driveFileId: string | null;
    driveFileName: string | null;
    gmailDraftId: string | null;
  } | null;
};

export type GoogleWorkspaceConnectStart = {
  flowId: string;
  authUrl: string;
  expiresAt: number;
};

export type GoogleWorkspaceConnectStatus = {
  flowId: string;
  status: "pending" | "connected" | "failed" | "expired";
  expiresAt: number;
  error: string | null;
  googleWorkspace: GoogleWorkspaceAuthStatus | null;
};

export type MatterhornResolvedArtifactTarget = {
  id: string;
  kind: "file" | "url";
  value: string;
  name: string;
  preview: "browser" | "markdown" | "sheet" | "image" | "pdf" | "html" | "text" | "external";
  confidence: number;
  reason: string;
  exists?: boolean;
  size?: number;
  updatedAt?: number;
  contentType?: string;
};

export type MatterhornWorkspaceFileStat = {
  ok: boolean;
  path: string;
  exists: boolean;
  kind?: "file" | "dir" | "other";
  size?: number;
  updatedAt?: number;
};

export type MatterhornInboxItem = {
  id: string;
  name?: string;
  path?: string;
  size?: number;
  updatedAt?: number;
};

export type MatterhornInboxList = {
  items: MatterhornInboxItem[];
};

export type MatterhornInboxUploadResult = {
  ok: boolean;
  path: string;
  bytes: number;
};

export type MatterhornActor = {
  type: "remote" | "host";
  clientId?: string;
  tokenHash?: string;
};

export type MatterhornAuditEntry = {
  id: string;
  workspaceId: string;
  actor: MatterhornActor;
  action: string;
  target: string;
  summary: string;
  timestamp: number;
};

export type MatterhornReloadTrigger = {
  type: "skill" | "plugin" | "config" | "mcp" | "agent" | "command";
  name?: string;
  action?: "added" | "removed" | "updated";
  path?: string;
};

export type MatterhornReloadEvent = {
  id: string;
  seq: number;
  workspaceId: string;
  reason: "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";
  trigger?: MatterhornReloadTrigger;
  timestamp: number;
};

// Fallback for explicit server-mode URL derivation. Desktop local workers replace this
// with the persisted runtime-discovered port once the host reports it.
export const DEFAULT_OPENWORK_SERVER_PORT = 8787;

const STORAGE_URL_OVERRIDE = "matterhorn-work.server.urlOverride";
const STORAGE_PORT_OVERRIDE = "matterhorn-work.server.port";
const STORAGE_TOKEN = "matterhorn-work.server.token";
const STORAGE_HOST_AUTH_KEY = "matterhorn-work.server.hostToken";
const STORAGE_REMOTE_ACCESS = "matterhorn-work.server.remoteAccessEnabled";
const LEGACY_STORAGE_URL_OVERRIDE = "openwork.server.urlOverride";
const LEGACY_STORAGE_PORT_OVERRIDE = "openwork.server.port";
const LEGACY_STORAGE_TOKEN = "openwork.server.token";
const LEGACY_STORAGE_HOST_AUTH_KEY = "openwork.server.hostToken";
const LEGACY_STORAGE_REMOTE_ACCESS = "openwork.server.remoteAccessEnabled";

function getMigratingLocalStorageValue(key: string, legacyKey: string): string | null {
  const current = window.localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = window.localStorage.getItem(legacyKey);
  if (legacy !== null) {
    window.localStorage.setItem(key, legacy);
  }
  return legacy;
}

function removeLocalStorageAlias(key: string, legacyKey: string) {
  window.localStorage.removeItem(key);
  window.localStorage.removeItem(legacyKey);
}

function readViteEnv(primary: string, legacy: string): string {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const primaryValue = typeof env?.[primary] === "string" ? env[primary].trim() : "";
  if (primaryValue) return primaryValue;
  return typeof env?.[legacy] === "string" ? env[legacy].trim() : "";
}

export function normalizeMatterhornServerUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function isLoopbackOpenworkServerUrl(input: string) {
  const normalized = normalizeMatterhornServerUrl(input) ?? "";
  if (!normalized) return false;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function parseOpenworkWorkspaceIdFromUrl(input: string) {
  const normalized = normalizeMatterhornServerUrl(input) ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    const legacyIndex = segments.indexOf("w");
    if (legacyIndex >= 0 && segments[legacyIndex + 1]) {
      return decodeURIComponent(segments[legacyIndex + 1]);
    }
    const workspaceIndex = segments.indexOf("workspace");
    if (workspaceIndex >= 0 && segments[workspaceIndex + 1]) {
      return decodeURIComponent(segments[workspaceIndex + 1]);
    }
    return null;
  } catch {
    const match = normalized.match(/\/(?:w|workspace)\/([^/?#]+)/);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

export function buildMatterhornWorkspaceBaseUrl(hostUrl: string, workspaceId?: string | null) {
  const normalized = normalizeMatterhornServerUrl(hostUrl) ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split("/").filter(Boolean);
    const workspaceIndex = segments.indexOf("workspace");
    const legacyIndex = segments.indexOf("w");
    const mountIndex = workspaceIndex >= 0 ? workspaceIndex : legacyIndex;
    if (mountIndex >= 0 && segments[mountIndex + 1]) {
      const prefix = segments.slice(0, mountIndex).join("/");
      url.pathname = `${prefix ? `/${prefix}` : ""}/workspace/${encodeURIComponent(
        decodeURIComponent(segments[mountIndex + 1]),
      )}`;
      return url.toString().replace(/\/+$/, "");
    }

    const id = (workspaceId ?? "").trim();
    if (!id) return url.toString().replace(/\/+$/, "");

    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/workspace/${encodeURIComponent(id)}`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    const id = (workspaceId ?? "").trim();
    if (!id) return normalized;
    return `${normalized.replace(/\/+$/, "")}/workspace/${encodeURIComponent(id)}`;
  }
}

const OPENWORK_INVITE_PARAM_URL = "ow_url";
const OPENWORK_INVITE_PARAM_TOKEN = "ow_token";
const OPENWORK_INVITE_PARAM_STARTUP = "ow_startup";
const OPENWORK_INVITE_PARAM_AUTO_CONNECT = "ow_auto_connect";

export type MatterhornOpenCodeRouterHealthSnapshot = {
  ok: boolean;
  opencode: Record<string, unknown>;
  channels: Record<string, unknown>;
  config: Record<string, unknown>;
  activity?: {
    inboundToday?: number;
    outboundToday?: number;
    lastMessageAt?: number | null;
    [key: string]: unknown;
  };
  agent?: {
    loaded?: boolean;
    selected?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type MatterhornOpenCodeRouterIdentityItem = {
  id: string;
  channel?: string;
  enabled?: boolean;
  peerId?: string;
  [key: string]: unknown;
};

export type MatterhornOpenCodeRouterSendResult = {
  ok: boolean;
  sent: number;
  attempted: number;
  failures?: Array<{ identityId: string; peerId: string; error: string }>;
  reason?: string;
  [key: string]: unknown;
};

export type MatterhornConnectInvite = {
  url: string;
  token?: string;
  startup?: "server";
  autoConnect?: boolean;
};

export function readMatterhornConnectInviteFromSearch(input: string | URLSearchParams) {
  const search =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;

  const rawUrl = search.get(OPENWORK_INVITE_PARAM_URL)?.trim() ?? "";
  const url = normalizeMatterhornServerUrl(rawUrl);
  if (!url) return null;

  const token = search.get(OPENWORK_INVITE_PARAM_TOKEN)?.trim() ?? "";
  const startupRaw = search.get(OPENWORK_INVITE_PARAM_STARTUP)?.trim() ?? "";
  const startup = startupRaw === "server" ? "server" : undefined;
  const autoConnect = search.get(OPENWORK_INVITE_PARAM_AUTO_CONNECT)?.trim() === "1";

  return {
    url,
    token: token || undefined,
    startup,
    autoConnect: autoConnect || undefined,
  } satisfies MatterhornConnectInvite;
}

export function stripMatterhornConnectInviteFromUrl(input: string) {
  try {
    const url = new URL(input);
    url.searchParams.delete(OPENWORK_INVITE_PARAM_URL);
    url.searchParams.delete(OPENWORK_INVITE_PARAM_TOKEN);
    url.searchParams.delete(OPENWORK_INVITE_PARAM_STARTUP);
    url.searchParams.delete(OPENWORK_INVITE_PARAM_AUTO_CONNECT);
    return url.toString();
  } catch {
    return input;
  }
}

export function readMatterhornServerSettings(): MatterhornServerSettings {
  if (typeof window === "undefined") return {};
  try {
    const urlOverride = normalizeMatterhornServerUrl(
      getMigratingLocalStorageValue(STORAGE_URL_OVERRIDE, LEGACY_STORAGE_URL_OVERRIDE) ?? "",
    );
    const portRaw = getMigratingLocalStorageValue(STORAGE_PORT_OVERRIDE, LEGACY_STORAGE_PORT_OVERRIDE) ?? "";
    const portOverride = portRaw ? Number(portRaw) : undefined;
    const token = getMigratingLocalStorageValue(STORAGE_TOKEN, LEGACY_STORAGE_TOKEN) ?? undefined;
    const hostToken = getMigratingLocalStorageValue(STORAGE_HOST_AUTH_KEY, LEGACY_STORAGE_HOST_AUTH_KEY) ?? undefined;
    const remoteAccessRaw = getMigratingLocalStorageValue(STORAGE_REMOTE_ACCESS, LEGACY_STORAGE_REMOTE_ACCESS) ?? "";
    return {
      urlOverride: urlOverride ?? undefined,
      portOverride: Number.isNaN(portOverride) ? undefined : portOverride,
      token: token?.trim() || undefined,
      hostToken: hostToken?.trim() || undefined,
      remoteAccessEnabled: remoteAccessRaw === "1",
    };
  } catch {
    return {};
  }
}

export function writeMatterhornServerSettings(next: MatterhornServerSettings): MatterhornServerSettings {
  if (typeof window === "undefined") return next;
  try {
    const urlOverride = normalizeMatterhornServerUrl(next.urlOverride ?? "");
    const portOverride = typeof next.portOverride === "number" ? next.portOverride : undefined;
    const token = next.token?.trim() || undefined;
    const hostToken = next.hostToken?.trim() || undefined;
    const remoteAccessEnabled = next.remoteAccessEnabled === true;

    if (urlOverride) {
      window.localStorage.setItem(STORAGE_URL_OVERRIDE, urlOverride);
    } else {
      removeLocalStorageAlias(STORAGE_URL_OVERRIDE, LEGACY_STORAGE_URL_OVERRIDE);
    }

    if (typeof portOverride === "number" && !Number.isNaN(portOverride)) {
      window.localStorage.setItem(STORAGE_PORT_OVERRIDE, String(portOverride));
    } else {
      removeLocalStorageAlias(STORAGE_PORT_OVERRIDE, LEGACY_STORAGE_PORT_OVERRIDE);
    }

    if (token) {
      window.localStorage.setItem(STORAGE_TOKEN, token);
    } else {
      removeLocalStorageAlias(STORAGE_TOKEN, LEGACY_STORAGE_TOKEN);
    }

    if (hostToken) {
      window.localStorage.setItem(STORAGE_HOST_AUTH_KEY, hostToken);
    } else {
      removeLocalStorageAlias(STORAGE_HOST_AUTH_KEY, LEGACY_STORAGE_HOST_AUTH_KEY);
    }

    if (remoteAccessEnabled) {
      window.localStorage.setItem(STORAGE_REMOTE_ACCESS, "1");
    } else {
      removeLocalStorageAlias(STORAGE_REMOTE_ACCESS, LEGACY_STORAGE_REMOTE_ACCESS);
    }

    return readMatterhornServerSettings();
  } catch {
    return next;
  }
}

export function hydrateMatterhornServerSettingsFromEnv() {
  if (typeof window === "undefined") return;

  const envUrl = readViteEnv("VITE_MATTERHORN_WORK_URL", "VITE_OPENWORK_URL");
  const envPort = readViteEnv("VITE_MATTERHORN_WORK_PORT", "VITE_OPENWORK_PORT");
  const envToken = readViteEnv("VITE_MATTERHORN_WORK_TOKEN", "VITE_OPENWORK_TOKEN");
  const envHostToken = readViteEnv("VITE_MATTERHORN_WORK_HOST_TOKEN", "VITE_OPENWORK_HOST_TOKEN");
  const forceEnvSettings = readViteEnv("VITE_MATTERHORN_WORK_FORCE_SETTINGS", "VITE_OPENWORK_FORCE_SETTINGS") === "1";

  if (!envUrl && !envPort && !envToken && !envHostToken) return;

  try {
    const current = readMatterhornServerSettings();
    const next: MatterhornServerSettings = { ...current };
    let changed = false;

    if ((forceEnvSettings || !current.urlOverride) && envUrl) {
      next.urlOverride = normalizeMatterhornServerUrl(envUrl) ?? undefined;
      changed = true;
    }

    if ((forceEnvSettings || !current.portOverride) && envPort) {
      const parsed = Number(envPort);
      if (Number.isFinite(parsed) && parsed > 0) {
        next.portOverride = parsed;
        changed = true;
      }
    }

    if ((forceEnvSettings || !current.token) && envToken) {
      next.token = envToken;
      changed = true;
    }

    if ((forceEnvSettings || !current.hostToken) && envHostToken) {
      next.hostToken = envHostToken;
      changed = true;
    }

    if (changed) {
      writeMatterhornServerSettings(next);
    }
  } catch {
    // ignore
  }
}

export function clearMatterhornServerSettings() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_URL_OVERRIDE);
    window.localStorage.removeItem(STORAGE_PORT_OVERRIDE);
    window.localStorage.removeItem(STORAGE_TOKEN);
    window.localStorage.removeItem(STORAGE_HOST_AUTH_KEY);
    window.localStorage.removeItem(STORAGE_REMOTE_ACCESS);
    window.localStorage.removeItem(LEGACY_STORAGE_URL_OVERRIDE);
    window.localStorage.removeItem(LEGACY_STORAGE_PORT_OVERRIDE);
    window.localStorage.removeItem(LEGACY_STORAGE_TOKEN);
    window.localStorage.removeItem(LEGACY_STORAGE_HOST_AUTH_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_REMOTE_ACCESS);
  } catch {
    // ignore
  }
}

export class MatterhornServerError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildHeaders(
  token?: string,
  hostToken?: string,
  extra?: Record<string, string>,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hostToken) {
    headers["X-Matterhorn-Host-Token"] = hostToken;
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  return headers;
}

function buildAuthHeaders(token?: string, hostToken?: string, extra?: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (hostToken) {
    headers["X-Matterhorn-Host-Token"] = hostToken;
  }
  if (extra) {
    Object.assign(headers, extra);
  }
  return headers;
}

// Use Tauri's fetch when running in the desktop app to avoid CORS issues.
// Stream URLs (SSE) bypass the plugin because its `fetch_read_body` IPC call
// blocks until the body closes — that freezes the webview for infinite bodies.
const OPENWORK_STREAM_URL_RE = /\/events(\b|\?)|\/event-stream\b|\/stream\b/;

function isStreamUrl(url: string): boolean {
  return OPENWORK_STREAM_URL_RE.test(url);
}

const resolveFetch = (url?: string) => {
  if (!isDesktopRuntime()) return globalThis.fetch;
  if (url && isStreamUrl(url)) {
    return typeof window !== "undefined" ? window.fetch.bind(window) : globalThis.fetch;
  }
  return desktopFetch;
};

const DEFAULT_OPENWORK_SERVER_TIMEOUT_MS = 10_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetchImpl(url, init);
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller?.signal;
  const initWithSignal = signal && !init.signal ? { ...init, signal } : init;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        controller?.abort();
      } catch {
        // ignore
      }
      reject(new Error("Request timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchImpl(url, initWithSignal), timeoutPromise]);
  } catch (error) {
    const name = (error && typeof error === "object" && "name" in error ? (error as any).name : "") as string;
    if (name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const fetchImpl = resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "GET",
      headers: buildHeaders(options.token, options.hostToken),
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    options.timeoutMs ?? DEFAULT_OPENWORK_SERVER_TIMEOUT_MS,
  );

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const code = typeof json?.code === "string" ? json.code : "request_failed";
    const message = typeof json?.message === "string" ? json.message : response.statusText;
    throw new MatterhornServerError(response.status, code, message, json?.details);
  }

  return json as T;
}

async function requestMultipartRaw(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; body?: FormData; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; text: string }>{
  const url = `${baseUrl}${path}`;
  const fetchImpl = resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "POST",
      headers: buildAuthHeaders(options.token, options.hostToken),
      body: options.body,
    },
    options.timeoutMs ?? DEFAULT_OPENWORK_SERVER_TIMEOUT_MS,
  );
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

async function requestBinary(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; hostToken?: string; timeoutMs?: number } = {},
): Promise<{ data: ArrayBuffer; contentType: string | null; filename: string | null }>{
  const url = `${baseUrl}${path}`;
  const fetchImpl = resolveFetch(url);
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: options.method ?? "GET",
      headers: buildAuthHeaders(options.token, options.hostToken),
    },
    options.timeoutMs ?? DEFAULT_OPENWORK_SERVER_TIMEOUT_MS,
  );

  if (!response.ok) {
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const code = typeof json?.code === "string" ? json.code : "request_failed";
    const message = typeof json?.message === "string" ? json.message : response.statusText;
    throw new MatterhornServerError(response.status, code, message, json?.details);
  }

  const contentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filenameRaw = filenameMatch?.[1] ?? filenameMatch?.[2] ?? null;
  const filename = filenameRaw ? decodeURIComponent(filenameRaw) : null;
  const data = await response.arrayBuffer();
  return { data, contentType, filename };
}

export function createMatterhornServerClient(options: { baseUrl: string; token?: string; hostToken?: string }) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const token = options.token;
  const hostToken = options.hostToken;

  const timeouts = {
    health: 3_000,
    capabilities: 6_000,
    listWorkspaces: 8_000,
    activateWorkspace: 10_000,
    deleteWorkspace: 10_000,
    deleteSession: 12_000,
    sessionRead: 12_000,
    status: 6_000,
    config: 10_000,
    workspaceExport: 30_000,
    workspaceImport: 30_000,
    binary: 60_000,
  };

  return {
    baseUrl,
    token,
    health: () =>
      requestJson<{ ok: boolean; version: string; uptimeMs: number }>(baseUrl, "/health", { token, hostToken, timeoutMs: timeouts.health }),
    runtimeVersions: () =>
      requestJson<MatterhornRuntimeSnapshot>(baseUrl, "/runtime/versions", { token, hostToken, timeoutMs: timeouts.status }),
    status: () => requestJson<MatterhornServerDiagnostics>(baseUrl, "/status", { token, hostToken, timeoutMs: timeouts.status }),
    capabilities: () => requestJson<MatterhornServerCapabilities>(baseUrl, "/capabilities", { token, hostToken, timeoutMs: timeouts.capabilities }),
    googleWorkspaceStatus: () => requestJson<GoogleWorkspaceAuthStatus>(baseUrl, "/experimental/google-workspace/status", { token, hostToken, timeoutMs: timeouts.status }),
    googleWorkspaceConnectStart: () => requestJson<GoogleWorkspaceConnectStart>(baseUrl, "/experimental/google-workspace/connect/start", { token, hostToken, method: "POST", timeoutMs: timeouts.status }),
    googleWorkspaceConnectStatus: (flowId: string) => requestJson<GoogleWorkspaceConnectStatus>(baseUrl, `/experimental/google-workspace/connect/status/${encodeURIComponent(flowId)}`, { token, hostToken, timeoutMs: timeouts.status }),
    googleWorkspaceDisconnect: () => requestJson<GoogleWorkspaceAuthStatus>(baseUrl, "/experimental/google-workspace/disconnect", { token, hostToken, method: "POST", timeoutMs: timeouts.status }),
    googleWorkspaceTestConnection: () => requestJson<GoogleWorkspaceAuthStatus>(baseUrl, "/experimental/google-workspace/test", { token, hostToken, method: "POST", timeoutMs: 60_000 }),
    googleWorkspaceRunScopeSmokeTest: () => requestJson<GoogleWorkspaceAuthStatus>(baseUrl, "/experimental/google-workspace/smoke-test", { token, hostToken, method: "POST", timeoutMs: 120_000 }),
    listWorkspaces: () => requestJson<MatterhornWorkspaceList>(baseUrl, "/workspaces", { token, hostToken, timeoutMs: timeouts.listWorkspaces }),
    createLocalWorkspace: (payload: { folderPath: string; name: string; preset: string }) =>
      requestJson<WorkspaceList>(baseUrl, "/workspaces/local", {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.activateWorkspace,
      }),
    updateWorkspaceDisplayName: (workspaceId: string, displayName: string | null) =>
      requestJson<WorkspaceList>(baseUrl, `/workspaces/${encodeURIComponent(workspaceId)}/display-name`, {
        token,
        hostToken,
        method: "PATCH",
        body: { displayName },
        timeoutMs: timeouts.activateWorkspace,
      }),
    activateWorkspace: (workspaceId: string) =>
      requestJson<{ activeId: string; workspace: MatterhornWorkspaceInfo }>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}/activate`,
        { token, hostToken, method: "POST", timeoutMs: timeouts.activateWorkspace },
      ),
    deleteWorkspace: (workspaceId: string) =>
      requestJson<{ ok: boolean; deleted: boolean; persisted: boolean; activeId: string | null; items: MatterhornWorkspaceInfo[]; workspaces?: WorkspaceInfo[] }>(
        baseUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}`,
        { token, hostToken, method: "DELETE", timeoutMs: timeouts.deleteWorkspace },
      ),
    deleteSession: (workspaceId: string, sessionId: string) =>
      requestJson<{ ok: boolean }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
        { token, hostToken, method: "DELETE", timeoutMs: timeouts.deleteSession },
      ),
    listSessions: (
      workspaceId: string,
      options?: { roots?: boolean; start?: number; search?: string; limit?: number },
    ) => {
      const query = new URLSearchParams();
      if (typeof options?.roots === "boolean") query.set("roots", String(options.roots));
      if (typeof options?.start === "number") query.set("start", String(options.start));
      if (options?.search?.trim()) query.set("search", options.search.trim());
      if (typeof options?.limit === "number") query.set("limit", String(options.limit));
      const suffix = query.size ? `?${query.toString()}` : "";
      return requestJson<{ items: Session[] }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/sessions${suffix}`,
        { token, hostToken, timeoutMs: timeouts.sessionRead },
      );
    },
    getSession: (workspaceId: string, sessionId: string) =>
      requestJson<{ item: Session }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}`,
        { token, hostToken, timeoutMs: timeouts.sessionRead },
      ),
    getSessionMessages: (workspaceId: string, sessionId: string, options?: { limit?: number }) => {
      const query = new URLSearchParams();
      if (typeof options?.limit === "number") query.set("limit", String(options.limit));
      const suffix = query.size ? `?${query.toString()}` : "";
      return requestJson<{ items: MatterhornSessionMessage[] }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/messages${suffix}`,
        { token, hostToken, timeoutMs: timeouts.sessionRead },
      );
    },
    getSessionSnapshot: (workspaceId: string, sessionId: string, options?: { limit?: number }) => {
      const query = new URLSearchParams();
      if (typeof options?.limit === "number") query.set("limit", String(options.limit));
      const suffix = query.size ? `?${query.toString()}` : "";
      return requestJson<{ item: MatterhornSessionSnapshot }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/snapshot${suffix}`,
        { token, hostToken, timeoutMs: timeouts.sessionRead },
      );
    },
    exportWorkspace: (
      workspaceId: string,
      options?: { sensitiveMode?: MatterhornWorkspaceExportSensitiveMode },
    ) => {
      const query = new URLSearchParams();
      if (options?.sensitiveMode) {
        query.set("sensitive", options.sensitiveMode);
      }
      const suffix = query.size ? `?${query.toString()}` : "";
      return requestJson<MatterhornWorkspaceExport>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/export${suffix}`, {
        token,
        hostToken,
        timeoutMs: timeouts.workspaceExport,
      });
    },
    importWorkspace: (workspaceId: string, payload: Record<string, unknown>) =>
      requestJson<{ ok: boolean; preview?: MatterhornWorkspaceImportPreview }>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/import`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.workspaceImport,
      }),
    previewWorkspaceImport: (workspaceId: string, payload: Record<string, unknown>) =>
      requestJson<MatterhornWorkspaceImportPreview>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/import/preview`,
        {
          token,
          hostToken,
          method: "POST",
          body: payload,
          timeoutMs: timeouts.workspaceImport,
        },
      ),
    materializeBlueprintSessions: (workspaceId: string) =>
      requestJson<MatterhornBlueprintSessionsMaterializeResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/blueprint/sessions/materialize`,
        {
          token,
          hostToken,
          method: "POST",
          timeoutMs: timeouts.workspaceImport,
        },
      ),
    getConfig: (workspaceId: string) =>
      requestJson<{ opencode: Record<string, unknown>; matterhorn: Record<string, unknown>; updatedAt?: number | null }>(
        baseUrl,
        `/workspace/${workspaceId}/config`,
        { token, hostToken, timeoutMs: timeouts.config },
      ),
    patchConfig: (workspaceId: string, payload: { opencode?: Record<string, unknown>; matterhorn?: Record<string, unknown> }) =>
      requestJson<{ updatedAt?: number | null }>(baseUrl, `/workspace/${workspaceId}/config`, {
        token,
        hostToken,
        method: "PATCH",
        body: payload,
      }),
    readOpencodeConfigFile: (workspaceId: string, scope: "project" | "global" = "project") => {
      const query = `?scope=${scope}`;
      return requestJson<OpencodeConfigFile>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/opencode-config${query}`, {
        token,
        hostToken,
      });
    },
    writeOpencodeConfigFile: (workspaceId: string, scope: "project" | "global", content: string) =>
      requestJson<ExecResult>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/opencode-config`, {
        token,
        hostToken,
        method: "POST",
        body: { scope, content },
      }),
    listReloadEvents: (workspaceId: string, options?: { since?: number }) => {
      const query = typeof options?.since === "number" ? `?since=${options.since}` : "";
      return requestJson<{ items: MatterhornReloadEvent[]; cursor?: number }>(
        baseUrl,
        `/workspace/${workspaceId}/events${query}`,
        { token, hostToken },
      );
    },
    reloadEngine: (workspaceId: string) =>
      requestJson<{ ok: boolean; reloadedAt?: number }>(baseUrl, `/workspace/${workspaceId}/engine/reload`, {
        token,
        hostToken,
        method: "POST",
      }),
    listPlugins: (workspaceId: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<{ items: MatterhornPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins${query}`,
        { token, hostToken },
      );
    },
    addPlugin: (workspaceId: string, spec: string) =>
      requestJson<{ items: MatterhornPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins`,
        { token, hostToken, method: "POST", body: { spec } },
      ),
    removePlugin: (workspaceId: string, name: string) =>
      requestJson<{ items: MatterhornPluginItem[]; loadOrder: string[] }>(
        baseUrl,
        `/workspace/${workspaceId}/plugins/${encodeURIComponent(name)}`,
        { token, hostToken, method: "DELETE" },
      ),
    listSkills: (workspaceId: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<{ items: MatterhornSkillItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/skills${query}`,
        { token, hostToken },
      );
    },
    listHubSkills: (options?: { repo?: MatterhornHubRepo }) => {
      const params = new URLSearchParams();
      const owner = options?.repo?.owner?.trim();
      const repo = options?.repo?.repo?.trim();
      const ref = options?.repo?.ref?.trim();
      if (owner) params.set("owner", owner);
      if (repo) params.set("repo", repo);
      if (ref) params.set("ref", ref);
      const query = params.size ? `?${params.toString()}` : "";
      return requestJson<{ items: MatterhornHubSkillItem[] }>(baseUrl, `/hub/skills${query}`, {
        token,
        hostToken,
      });
    },
    installHubSkill: (
      workspaceId: string,
      name: string,
      options?: { overwrite?: boolean; repo?: { owner?: string; repo?: string; ref?: string } },
    ) =>
      requestJson<{ ok: boolean; name: string; path: string; action: "added" | "updated"; written: number; skipped: number }>(
        baseUrl,
        `/workspace/${workspaceId}/skills/hub/${encodeURIComponent(name)}`,
        {
          token,
          hostToken,
          method: "POST",
          body: {
            ...(options?.overwrite ? { overwrite: true } : {}),
            ...(options?.repo ? { repo: options.repo } : {}),
          },
        },
      ),
    getSkill: (workspaceId: string, name: string, options?: { includeGlobal?: boolean }) => {
      const query = options?.includeGlobal ? "?includeGlobal=true" : "";
      return requestJson<MatterhornSkillContent>(
        baseUrl,
        `/workspace/${workspaceId}/skills/${encodeURIComponent(name)}${query}`,
        { token, hostToken },
      );
    },
    upsertSkill: (workspaceId: string, payload: { name: string; content: string; description?: string }) =>
      requestJson<MatterhornSkillItem>(baseUrl, `/workspace/${workspaceId}/skills`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    deleteSkill: (workspaceId: string, name: string) =>
      requestJson<{ path: string }>(
        baseUrl,
        `/workspace/${workspaceId}/skills/${encodeURIComponent(name)}`,
        {
          token,
          hostToken,
          method: "DELETE",
        },
      ),
    listMcp: (workspaceId: string) =>
      requestJson<{ items: MatterhornMcpItem[] }>(baseUrl, `/workspace/${workspaceId}/mcp`, { token, hostToken }),
    addMcp: (workspaceId: string, payload: { name: string; config: Record<string, unknown> }) =>
      requestJson<{ items: MatterhornMcpItem[] }>(baseUrl, `/workspace/${workspaceId}/mcp`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    removeMcp: (workspaceId: string, name: string) =>
      requestJson<{ items: MatterhornMcpItem[] }>(baseUrl, `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}`, {
        token,
        hostToken,
        method: "DELETE",
      }),
    setMcpEnabled: (workspaceId: string, name: string, enabled: boolean) =>
      requestJson<{ items: MatterhornMcpItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}/enabled`,
        {
          token,
          hostToken,
          method: "POST",
          body: { enabled },
        },
      ),

    logoutMcpAuth: (workspaceId: string, name: string) =>
      requestJson<{ ok: true }>(baseUrl, `/workspace/${workspaceId}/mcp/${encodeURIComponent(name)}/auth`, {
        token,
        hostToken,
        method: "DELETE",
      }),

    listCommands: (workspaceId: string, scope: "workspace" | "global" = "workspace") =>
      requestJson<{ items: MatterhornCommandItem[] }>(
        baseUrl,
        `/workspace/${workspaceId}/commands?scope=${scope}`,
        { token, hostToken },
      ),
    listAudit: (workspaceId: string, limit = 50) =>
      requestJson<{ items: MatterhornAuditEntry[] }>(
        baseUrl,
        `/workspace/${workspaceId}/audit?limit=${limit}`,
        { token, hostToken },
      ),
    listTaskEvents: (workspaceId: string, limit = 50) =>
      requestJson<{ items: MatterhornTaskEvent[] }>(
        baseUrl,
        `/workspace/${workspaceId}/task-events?limit=${limit}`,
        { token, hostToken },
      ),
    listTaskRuns: (workspaceId: string, limit = 20) =>
      requestJson<{ runs: MatterhornTaskRun[] }>(
        baseUrl,
        `/workspace/${workspaceId}/task-runs?limit=${limit}`,
        { token, hostToken },
      ),
    stageWorkflowRun: (payload: MatterhornWorkflowRunStageInput) =>
      requestJson<{ success: boolean; run: MatterhornWorkflowRun }>(baseUrl, "/api/workflows/runs/stage", {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    startWorkflowRun: (workflowRunId: string) =>
      requestJson<{ success: boolean; run: MatterhornWorkflowRun }>(
        baseUrl,
        `/api/workflows/runs/${encodeURIComponent(workflowRunId)}/start`,
        {
          token,
          hostToken,
          method: "POST",
        },
      ),
    upsertCommand: (
      workspaceId: string,
      payload: { name: string; description?: string; template: string; agent?: string; model?: string | null; subtask?: boolean },
    ) =>
      requestJson<{ items: MatterhornCommandItem[] }>(baseUrl, `/workspace/${workspaceId}/commands`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
      }),
    deleteCommand: (workspaceId: string, name: string) =>
      requestJson<{ ok: boolean }>(baseUrl, `/workspace/${workspaceId}/commands/${encodeURIComponent(name)}`, {
        token,
        hostToken,
        method: "DELETE",
      }),
    uploadInbox: async (workspaceId: string, file: File, options?: { path?: string }) => {
      const id = workspaceId.trim();
      if (!id) throw new Error("workspaceId is required");
      if (!file) throw new Error("file is required");
      const form = new FormData();
      form.append("file", file);
      if (options?.path?.trim()) {
        form.append("path", options.path.trim());
      }

      const result = await requestMultipartRaw(baseUrl, `/workspace/${encodeURIComponent(id)}/inbox`, {
        token,
        hostToken,
        method: "POST",
        body: form,
        timeoutMs: timeouts.binary,
      });

      if (!result.ok) {
        let message = result.text.trim();
        try {
          const json = message ? JSON.parse(message) : null;
          if (json && typeof json.message === "string") {
            message = json.message;
          }
        } catch {
          // ignore
        }
        throw new MatterhornServerError(
          result.status,
          "request_failed",
          message || "Shared folder upload failed",
        );
      }

      const body = result.text.trim();
      if (body) {
        try {
          const parsed = JSON.parse(body) as Partial<MatterhornInboxUploadResult>;
          if (typeof parsed.path === "string" && parsed.path.trim()) {
            return {
              ok: parsed.ok ?? true,
              path: parsed.path.trim(),
              bytes: typeof parsed.bytes === "number" ? parsed.bytes : file.size,
            } satisfies MatterhornInboxUploadResult;
          }
        } catch {
          // ignore invalid JSON and fall back
        }
      }

      return {
        ok: true,
        path: options?.path?.trim() || file.name,
        bytes: file.size,
      } satisfies MatterhornInboxUploadResult;
    },

    listInbox: (workspaceId: string) =>
      requestJson<MatterhornInboxList>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/inbox`, {
        token,
        hostToken,
      }),

    downloadInboxItem: (workspaceId: string, inboxId: string) =>
      requestBinary(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(inboxId)}`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),

    readWorkspaceFile: (workspaceId: string, path: string) =>
      requestJson<MatterhornWorkspaceFileContent>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/content?path=${encodeURIComponent(path)}`,
        { token, hostToken },
      ),

    statWorkspaceFile: (workspaceId: string, path: string) =>
      requestJson<MatterhornWorkspaceFileStat>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/stat?path=${encodeURIComponent(path)}`,
        { token, hostToken },
      ),

    writeWorkspaceFile: (
      workspaceId: string,
      payload: { path: string; content: string; baseUpdatedAt?: number | null; force?: boolean },
    ) =>
      requestJson<MatterhornWorkspaceFileWriteResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/content`,
        {
          token,
          hostToken,
          method: "POST",
          body: payload,
        },
      ),

    writeWorkspaceBinaryFile: (
      workspaceId: string,
      payload: { path: string; data: ArrayBuffer; baseUpdatedAt?: number | null; force?: boolean },
    ) =>
      requestJson<MatterhornWorkspaceFileWriteResult>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/raw`,
        {
          token,
          hostToken,
          method: "POST",
          body: {
            path: payload.path,
            dataBase64: arrayBufferToBase64(payload.data),
            baseUpdatedAt: payload.baseUpdatedAt,
            force: payload.force,
          },
        },
      ),

    downloadWorkspaceFile: (workspaceId: string, path: string) =>
      requestBinary(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/files/raw?path=${encodeURIComponent(path)}`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),

    listArtifacts: (workspaceId: string) =>
      requestJson<MatterhornArtifactList>(baseUrl, `/workspace/${encodeURIComponent(workspaceId)}/artifacts`, {
        token,
        hostToken,
      }),

    resolveArtifacts: (
      workspaceId: string,
      targets: Array<{
        kind: "file" | "url";
        value: string;
        name?: string;
        preview?: string;
        confidence?: number;
        reason?: string;
      }>,
    ) =>
      requestJson<{ items: MatterhornResolvedArtifactTarget[] }>(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/artifacts/resolve`,
        { token, hostToken, method: "POST", body: { targets } },
      ),

    downloadArtifact: (workspaceId: string, artifactId: string) =>
      requestBinary(
        baseUrl,
        `/workspace/${encodeURIComponent(workspaceId)}/artifacts/${encodeURIComponent(artifactId)}`,
        { token, hostToken, timeoutMs: timeouts.binary },
      ),

    // User-level env vars (host-auth only — desktop shell is the sole caller).
    // See apps/server/src/env-file.ts and apps/app/pr/environment-variables.md.
    listUserEnvKeys: () =>
      requestJson<{ keys: string[] }>(
        baseUrl,
        "/env/keys",
        { token, hostToken, timeoutMs: timeouts.config },
      ),

    listUserEnv: () =>
      requestJson<{ items: Array<{ key: string; value: string; updatedAt: number }> }>(
        baseUrl,
        "/env",
        { token, hostToken, timeoutMs: timeouts.config },
      ),

    upsertUserEnv: (entries: Array<{ key: string; value: string }>) =>
      requestJson<{ ok: true; count: number }>(baseUrl, "/env", {
        token,
        hostToken,
        method: "PUT",
        body: { entries },
        timeoutMs: timeouts.config,
      }),

    deleteUserEnv: (key: string) =>
      requestJson<{ ok: true }>(baseUrl, `/env/${encodeURIComponent(key)}`, {
        token,
        hostToken,
        method: "DELETE",
        timeoutMs: timeouts.config,
      }),

    searchMemory: (options?: MatterhornMemorySearchOptions) => {
      const params = new URLSearchParams();
      if (options?.query?.trim()) params.set("q", options.query.trim());
      if (options?.kind) params.set("kind", options.kind);
      if (options?.scope) params.set("scope", options.scope);
      if (options?.tags?.length) params.set("tags", options.tags.filter(Boolean).join(","));
      if (typeof options?.limit === "number") params.set("limit", String(options.limit));
      const suffix = params.size ? `?${params.toString()}` : "";
      return requestJson<MatterhornMemoryListResponse>(baseUrl, `/api/memory/search${suffix}`, {
        token,
        hostToken,
        timeoutMs: timeouts.status,
      });
    },

    listMemory: (options?: Omit<MatterhornMemorySearchOptions, "query">) => {
      const params = new URLSearchParams();
      if (options?.kind) params.set("kind", options.kind);
      if (options?.scope) params.set("scope", options.scope);
      if (options?.tags?.length) params.set("tags", options.tags.filter(Boolean).join(","));
      if (typeof options?.limit === "number") params.set("limit", String(options.limit));
      const suffix = params.size ? `?${params.toString()}` : "";
      return requestJson<MatterhornMemoryListResponse>(baseUrl, `/api/memory/entities${suffix}`, {
        token,
        hostToken,
        timeoutMs: timeouts.status,
      });
    },

    captureMemory: (record: MatterhornMemoryRecord) =>
      requestJson<MatterhornMemoryCaptureResponse>(baseUrl, "/api/memory/capture", {
        token,
        hostToken,
        method: "POST",
        body: { record },
        timeoutMs: timeouts.config,
      }),

    planMemorySuggestions: (input: MatterhornMemorySuggestionPlanInput) =>
      requestJson<MatterhornMemorySuggestionPlanResponse>(baseUrl, "/api/memory/suggestions/plan", {
        token,
        hostToken,
        method: "POST",
        body: { input },
        timeoutMs: timeouts.config,
      }),

    createMemorySuggestions: (input: MatterhornMemorySuggestionPlanInput) =>
      requestJson<MatterhornMemorySuggestionInboxResponse>(baseUrl, "/api/memory/suggestions", {
        token,
        hostToken,
        method: "POST",
        body: { input },
        timeoutMs: timeouts.config,
      }),

    listMemorySuggestions: (options?: {
      status?: MatterhornMemorySuggestionInboxStatus;
      desk?: string;
      includeResolved?: boolean;
      limit?: number;
    }) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.desk?.trim()) params.set("desk", options.desk.trim());
      if (options?.includeResolved) params.set("includeResolved", "true");
      if (typeof options?.limit === "number") params.set("limit", String(options.limit));
      const suffix = params.size ? `?${params.toString()}` : "";
      return requestJson<MatterhornMemorySuggestionListResponse>(baseUrl, `/api/memory/suggestions${suffix}`, {
        token,
        hostToken,
        timeoutMs: timeouts.status,
      });
    },

    getMemorySuggestion: (id: string) =>
      requestJson<MatterhornMemorySuggestionGetResponse>(baseUrl, `/api/memory/suggestions/${encodeURIComponent(id)}`, {
        token,
        hostToken,
        timeoutMs: timeouts.status,
      }),

    resolveStoredMemorySuggestion: (id: string, payload: {
      action?: MatterhornMemorySuggestionAction;
      patch?: Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>;
      reason?: string;
    }) =>
      requestJson<MatterhornMemoryStoredSuggestionResolveResponse>(baseUrl, `/api/memory/suggestions/${encodeURIComponent(id)}/resolve`, {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.config,
      }),

    resolveMemorySuggestion: (payload: {
      suggestion: MatterhornMemorySuggestion;
      action?: MatterhornMemorySuggestion["userAction"];
      patch?: Partial<Omit<MatterhornMemoryRecord, "id" | "createdAt">>;
      reason?: string;
    }) =>
      requestJson<MatterhornMemorySuggestionResolveResponse>(baseUrl, "/api/memory/suggestions/resolve", {
        token,
        hostToken,
        method: "POST",
        body: payload,
        timeoutMs: timeouts.config,
      }),

    forgetMemory: (id: string, reason?: string) =>
      requestJson<MatterhornMemoryForgetResponse>(baseUrl, "/api/memory/forget", {
        token,
        hostToken,
        method: "POST",
        body: { id, reason: reason ?? "User forgot this memory from the Matterhorn Memory panel." },
        timeoutMs: timeouts.config,
      }),

    exportMemory: (outputDir?: string) =>
      requestJson<MatterhornMemoryExportResponse>(baseUrl, "/api/memory/export", {
        token,
        hostToken,
        method: "POST",
        body: outputDir ? { outputDir } : {},
        timeoutMs: timeouts.workspaceExport,
      }),

    createVoiceRealtimeSession: (payload?: { model?: string }) =>
      requestJson<{
        ok: true;
        clientSecret: string;
        expiresAt: number | null;
        model: string;
        transcriptionModel: string;
        tools: string[];
      }>(baseUrl, "/voice/realtime/session", {
        token,
        hostToken,
        method: "POST",
        body: payload ?? {},
        timeoutMs: timeouts.config,
      }),
  };
}

export type MatterhornServerClient = ReturnType<typeof createMatterhornServerClient>;
