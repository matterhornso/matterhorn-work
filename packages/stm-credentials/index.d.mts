export type Binding = { id: string; envName: string; tool: string; label: string; consumer: string; updatedAt: string };
export type Status = { state: string; code?: string; version?: number; backend?: string };
export class StmError extends Error { readonly code: string; constructor(code: string); }
export function safeSecretEnvName(value: unknown): value is string;
export function isReservedLegacyEnvKey(key: string): boolean;
export class StmCredentials {
  constructor(options?: { enabled?: boolean; localDesktop?: boolean; platform?: string; descriptorPath?: string; registryPath?: string; fetch?: typeof globalThis.fetch });
  status(): Promise<Status>;
  connect(input: { consent: boolean }): Promise<Status>;
  listBindings(): Promise<Binding[]>;
  inventory(): Promise<Array<{ tool: string; label: string; status: string; updatedAt: string }>>;
  link(input: { envName: string; tool: string; label: string; consumer: string; consent: boolean }, legacyNames?: string[]): Promise<Binding>;
  unlink(id: string): Promise<void>;
  resolveForConsumer(consumer: string, inherited?: Record<string, string | undefined>): Promise<Record<string, string>>;
  resolveKeyForConsumer(consumer: string, envName: string, inherited?: Record<string, string | undefined>): Promise<string | undefined>;
}
export function spawnStmConsumer(options: {
  credentials: StmCredentials; consumer: string; command: string; args?: string[]; cwd?: string;
  inherited?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" | "ignore";
  authorize: (request: { consumer: string; command: string; args: string[]; cwd?: string }) => boolean | Promise<boolean>;
}): Promise<import("node:child_process").ChildProcess>;
