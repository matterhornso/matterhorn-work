import { StmError, StmMcpLaunches, StmCredentials, safeSecretEnvName, type MigrationSource, type McpLaunchGrant } from "@matterhorn-work/stm-credentials";
import { addMcp, listMcp } from "./mcp.js";

const sameCommand = (value: unknown, expected: string[]): boolean => Array.isArray(value)
  && value.length === expected.length && value.every((part, index) => part === expected[index]);
const noEnvironment = (value: unknown): boolean => value === undefined
  || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

export const eligibleStmToolSecret = (name: string): boolean => safeSecretEnvName(name)
  && /(?:API_KEY|API_TOKEN|ACCESS_TOKEN|CLIENT_SECRET|AUTH_TOKEN)$/.test(name)
  && !/(?:PRIVATE|MNEMONIC|SEED|WALLET|SIGNER|COLDKEY|HOTKEY)/i.test(name);

export async function reviewStmMcpConfiguration(workspace: string, name: string) {
  const item = (await listMcp(workspace)).find(entry => entry.name === name && entry.source === "config.project");
  if (!item || item.disabledByTools || item.config.type !== "local" || item.config.enabled === false
    || !Array.isArray(item.config.command) || !item.config.command.every(part => typeof part === "string")
    || !noEnvironment(item.config.environment)) throw new StmError("local_mcp_setup_required");
  return { ...item.config, command: [...item.config.command] };
}

/** A grant is consent to start this exact local MCP, not permission for model
 * tool calls. OpenCode continues to own its normal per-tool permission checks.
 * Only project-local configs are wrapped; no mutation of global tool settings.
 */
export async function approveStmMcp(input: {
  launches: StmMcpLaunches; workspace: string; name: string;
  launcher: string[]; bindings: Array<{ envName: string; tool: string; label: string }>;
  consent: boolean; legacyNames: string[];
  expectedConfiguration?: string;
}) {
  const config = await reviewStmMcpConfiguration(input.workspace, input.name);
  if (input.expectedConfiguration !== undefined && JSON.stringify(config) !== input.expectedConfiguration) throw new StmError("mcp_configuration_changed");
  const grant = await input.launches.approve({ workspace: input.workspace, name: input.name,
    command: config.command, launcher: input.launcher, bindings: input.bindings, consent: input.consent,
  }, input.legacyNames);
  try {
    const current = (await listMcp(input.workspace)).find(entry => entry.name === input.name && entry.source === "config.project");
    if (!current || JSON.stringify(current.config) !== JSON.stringify(config) || current.disabledByTools) throw new StmError("mcp_configuration_changed");
    // Resolution is never performed while editing configuration. Only a
    // nonsecret grant ID and trusted launcher command are written here.
    await addMcp(input.workspace, input.name, { ...config, command: [...grant.launcher, grant.id] });
  } catch (error) {
    await input.launches.revoke(grant.id);
    throw error;
  }
  return grant;
}

export function parseStmMcpBindings(value: unknown): Array<{ envName: string; tool: string; label: string }> {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw new StmError("invalid_binding");
  return value.map(entry => {
    if (!entry || typeof entry !== "object" || !("envName" in entry) || !("tool" in entry) || !("label" in entry)
      || typeof entry.envName !== "string" || typeof entry.tool !== "string" || typeof entry.label !== "string"
      || Object.keys(entry).some(key => !["envName", "tool", "label"].includes(key))) throw new StmError("invalid_binding");
    return { envName: entry.envName, tool: entry.tool, label: entry.label };
  });
}

export async function authorizeConfiguredStmMcp(grant: McpLaunchGrant): Promise<boolean> {
  const item = (await listMcp(grant.workspace)).find(entry => entry.name === grant.name && entry.source === "config.project");
  return Boolean(item && !item.disabledByTools && item.config.type === "local" && item.config.enabled !== false
    && noEnvironment(item.config.environment) && sameCommand(item.config.command, [...grant.launcher, grant.id]));
}

/** Import only after the host has approved this exact project-local command.
 * An interrupted configuration write leaves references and a non-launchable
 * grant; retries reuse the same ID and still recheck the current configuration.
 */
export async function migrateStmMcp(input: {
  credentials: StmCredentials; launches: StmMcpLaunches; source: MigrationSource;
  id: string; workspace: string; name: string; launcher: string[];
  envNames: string[]; backend: string; expectedConfiguration: string;
}) {
  const config = await reviewStmMcpConfiguration(input.workspace, input.name);
  if (JSON.stringify(config) !== input.expectedConfiguration) throw new StmError("mcp_configuration_changed");
  const prior = (await input.launches.list()).find(g => g.id === input.id);
  if (prior && prior.workspace === input.workspace && prior.name === input.name && !prior.revoked && await authorizeConfiguredStmMcp(prior)) {
    const migration = (await input.credentials.listMigrations()).find(j => j.id === input.id);
    if (!migration || migration.backend !== input.backend || JSON.stringify(migration.entries.map(e => e.binding.envName)) !== JSON.stringify(input.envNames)) throw new StmError("migration_conflict");
    return prior;
  }
  await input.credentials.migrateSelected({ id: input.id, backend: input.backend,
    selections: input.envNames.map(envName => ({ envName, consumer: `mcp:${input.id}` })), consent: true,
    mcpTarget: { workspace: input.workspace, name: input.name } }, input.source);
  const current = await reviewStmMcpConfiguration(input.workspace, input.name);
  if (JSON.stringify(current) !== input.expectedConfiguration) throw new StmError("mcp_configuration_changed");
  const grant = await input.launches.approveMigrated({ id: input.id, workspace: input.workspace, name: input.name, command: config.command, launcher: input.launcher, consent: true });
  const beforeWrite = await reviewStmMcpConfiguration(input.workspace, input.name);
  if (JSON.stringify(beforeWrite) !== input.expectedConfiguration) throw new StmError("mcp_configuration_changed");
  await addMcp(input.workspace, input.name, { ...config, command: [...grant.launcher, grant.id] });
  return grant;
}
