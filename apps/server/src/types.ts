export type WorkspaceType = "local" | "remote";

export type RemoteType = "opencode" | "matterhorn" | "openwork";

export type ApprovalMode = "manual" | "auto";

export type TokenScope = "owner" | "collaborator" | "viewer";

export type SandboxBackend = "none" | "docker" | "container";

export type ProviderPlacement = "in-sandbox" | "host-machine" | "client-machine" | "external";

export type LogFormat = "pretty" | "json";

export interface WorkspaceConfig {
  id?: string;
  path: string;
  name?: string;
  preset?: string;
  workspaceType?: WorkspaceType;
  remoteType?: RemoteType;
  baseUrl?: string;
  directory?: string;
  displayName?: string;
  openworkHostUrl?: string;
  openworkToken?: string;
  openworkWorkspaceId?: string;
  openworkWorkspaceName?: string;
  sandboxBackend?: string;
  sandboxRunId?: string;
  sandboxContainerName?: string;
  opencodeUsername?: string;
  opencodePassword?: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  preset: string;
  workspaceType: WorkspaceType;
  remoteType?: RemoteType;
  baseUrl?: string;
  directory?: string;
  displayName?: string;
  openworkHostUrl?: string;
  openworkToken?: string;
  openworkWorkspaceId?: string;
  openworkWorkspaceName?: string;
  sandboxBackend?: string;
  sandboxRunId?: string;
  sandboxContainerName?: string;
  opencodeUsername?: string;
  opencodePassword?: string;
  opencode?: {
    baseUrl?: string;
    directory?: string;
    username?: string;
    password?: string;
  };
}

export interface OpencodeConfigFile {
  path: string;
  exists: boolean;
  content: string | null;
}

export interface ApprovalConfig {
  mode: ApprovalMode;
  timeoutMs: number;
}

export interface RequestRateLimitConfig {
  enabled?: boolean;
  windowMs?: number;
  maxRequests?: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  token: string;
  hostToken: string;
  configPath?: string;
  opencodeBaseUrl?: string;
  opencodeDirectory?: string;
  opencodeUsername?: string;
  opencodePassword?: string;
  approval: ApprovalConfig;
  corsOrigins: string[];
  workspaces: WorkspaceInfo[];
  authorizedRoots: string[];
  readOnly: boolean;
  startedAt: number;
  tokenSource: "cli" | "env" | "file" | "generated";
  hostTokenSource: "cli" | "env" | "file" | "generated";
  logFormat: LogFormat;
  logRequests: boolean;
  requestRateLimit?: RequestRateLimitConfig;
  reloadWatchers?: boolean;
  managedOpencodeMcp?: boolean;
}

export interface Capabilities {
  schemaVersion: number;
  serverVersion: string;
  opencodeVersion: string;
  skills: { read: boolean; write: boolean; source: "openwork" | "opencode" };
  hub: {
    skills: {
      read: boolean;
      install: boolean;
      repo: { owner: string; name: string; ref: string };
    };
  };
  plugins: { read: boolean; write: boolean };
  mcp: { read: boolean; write: boolean };
  commands: { read: boolean; write: boolean };
  config: { read: boolean; write: boolean };

  approvals: { mode: ApprovalMode; timeoutMs: number };
  sandbox: { enabled: boolean; backend: SandboxBackend };
  ui: { toy: boolean };
  tokens: { scoped: boolean; scopes: TokenScope[] };
  proxy: {
    opencode: boolean;
  };
  toolProviders: {
    browser: {
      enabled: boolean;
      placement: ProviderPlacement;
      mode: "none" | "headless" | "interactive";
    };
    files: {
      injection: boolean;
      outbox: boolean;
      inboxPath: string;
      outboxPath: string;
      outputsPath: string;
      maxBytes: number;
    };
  };
}

export type ReloadReason = "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";

export type ReloadTrigger = {
  type: "skill" | "plugin" | "config" | "mcp" | "agent" | "command";
  name?: string;
  action?: "added" | "removed" | "updated";
  path?: string;
};

export interface ReloadEvent {
  id: string;
  seq: number;
  workspaceId: string;
  reason: ReloadReason;
  trigger?: ReloadTrigger;
  timestamp: number;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface PluginItem {
  spec: string;
  source: "config" | "dir.project" | "dir.global";
  scope: "project" | "global";
  path?: string;
}

export interface McpItem {
  name: string;
  config: Record<string, unknown>;
  source: "config.project" | "config.global" | "config.remote";
  disabledByTools?: boolean;
}

export interface SkillItem {
  name: string;
  path: string;
  description: string;
  scope: "project" | "global";
  trigger?: string;
}

export interface HubSkillItem {
  name: string;
  description: string;
  trigger?: string;
  source: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
  };
}

export interface CommandItem {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string | null;
  subtask?: boolean;
  scope: "workspace" | "global";
}

export interface Actor {
  type: "remote" | "host";
  clientId?: string;
  tokenHash?: string;
  scope?: TokenScope;
}

export interface ApprovalRequest {
  id: string;
  workspaceId: string;
  action: string;
  summary: string;
  paths: string[];
  createdAt: number;
  actor: Actor;
}

export interface AuditEntry {
  id: string;
  workspaceId: string;
  actor: Actor;
  action: string;
  target: string;
  summary: string;
  timestamp: number;
  metadata?: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Task / Workflow run events
// ---------------------------------------------------------------------------

export type MatterhornTaskEventType =
  | "workflow_staged"   // workflow staged, not yet running
  | "workflow_started"  // execution has begun
  | "stage_started"    // a named stage within the workflow began
  | "tool_called"      // a tool was invoked during a stage
  | "artifact_saved"   // an artifact file was written to disk
  | "artifact_deleted" // an artifact file was deleted by the user
  | "image_generated"  // an AI-generated image was created and saved
  | "nft_minted"       // an NFT mint receipt was recorded
  | "nft_listed"       // an NFT marketplace listing receipt was recorded
  | "waiting_for_user" // workflow paused, awaiting user input/approval
  | "completed"        // workflow finished successfully
  | "failed"           // workflow terminated with an error
  | "cancelled";       // workflow was cancelled by the user or system

export interface MatterhornTaskEvent {
  id: string;
  workspaceId: string;
  taskId: string;
  type: MatterhornTaskEventType;
  timestamp: number;
  /** Human-readable summary, safe to display — never contains secrets */
  summary: string;
  /** Optional per-event detail — never contains wallet keys, API tokens, signatures, or raw payloads */
  detail?: string;
  /** Workspace-relative path to an artifact written during this event */
  artifactPath?: string;
  /** Name of the tool that was called (only for tool_called events) */
  toolName?: string;
  /** Stage name (only for stage_started / waiting_for_user events) */
  stageName?: string;
  /** Public, display-safe event metadata. Never store signatures, keys, or raw payloads here. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MatterhornTaskRun {
  taskId: string;
  workspaceId: string;
  desk: string;
  sessionSlug: string;
  status: "staged" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  /** Summary of the final outcome. Failed runs include a safe error reason — never raw stack traces or secret payloads */
  outcomeSummary: string;
  /** Artifact paths produced by this run. May be empty if the run produced no files */
  artifactPaths: string[];
}
