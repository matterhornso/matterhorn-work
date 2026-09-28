export type Binding = { id: string; envName: string; tool: string; label: string; consumer: string; updatedAt: string; storageBackend: string; credentialRevision: string | null; restartRequired: boolean };
export type CredentialMetadata = { tool: string; label: string; status: string; updatedAt: string; revision: string };
export type Status = { state: string; code?: string; version?: number; backend?: string };
export class StmError extends Error { readonly code: string; constructor(code: string); }
export function safeSecretEnvName(value: unknown): value is string;
export function isReservedLegacyEnvKey(key: string): boolean;
export function assertNoStmEnvironmentConflicts(environment: Record<string, string | undefined>, registryPath: string): void;
export class StmCredentials {
  constructor(options?: { enabled?: boolean; localDesktop?: boolean; platform?: string; descriptorPath?: string; registryPath?: string; fetch?: (url: string, init: RequestInit) => Promise<Response> });
  status(): Promise<Status>;
  connect(input: { consent: boolean }): Promise<Status>;
  listBindings(): Promise<Binding[]>;
  inventory(): Promise<CredentialMetadata[]>;
  saveCredential(input: { tool: string; label: string; value: string; expectedRevision: string | null; consent: boolean }): Promise<{ key: CredentialMetadata; oldValueCleanupPending: boolean; restartRequired: boolean }>;
  link(input: { envName: string; tool: string; label: string; consumer: string; consent: boolean }, legacyNames?: string[]): Promise<Binding>;
  unlink(id: string): Promise<void>;
  resolveForConsumer(consumer: string, inherited?: Record<string, string | undefined>): Promise<Record<string, string>>;
  resolveSnapshotForConsumer(consumer: string, inherited?: Record<string, string | undefined>, bindingIds?: string[]): Promise<{ values: Record<string, string>; revisions: Record<string, string> }>;
  acknowledgeMcpStart(consumer: string, bindingIds: string[], revisions: Record<string, string>): Promise<void>;
  resolveKeyForConsumer(consumer: string, envName: string, inherited?: Record<string, string | undefined>): Promise<string | undefined>;
}
export function spawnStmConsumer(options: {
  credentials: StmCredentials; consumer: string; command: string; args?: string[]; cwd?: string;
  inherited?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" | "ignore";
  authorize: (request: { consumer: string; command: string; args: string[]; cwd?: string }) => boolean | Promise<boolean>;
}): Promise<import("node:child_process").ChildProcess>;

export type McpLaunchGrant = {
  id: string; workspace: string; name: string; command: string[]; launcher: string[];
  bindingIds: string[]; revoked: boolean; createdAt: string;
  active: null | { id: string; pid: number; revisions: Record<string, string> };
};
export class StmMcpLaunches {
  constructor(options: { credentials: StmCredentials; registryPath: string });
  list(): Promise<McpLaunchGrant[]>;
  approve(input: { workspace: string; name: string; command: string[]; launcher: string[];
    bindings: Array<{ envName: string; tool: string; label: string }>; consent: boolean;
  }, legacyNames?: string[]): Promise<McpLaunchGrant>;
  revoke(id: string): Promise<void>;
  start(id: string, options: { cwd: string; inherited?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" | "ignore";
    authorize: (grant: McpLaunchGrant) => boolean | Promise<boolean>;
  }): Promise<import("node:child_process").ChildProcess>;
}
