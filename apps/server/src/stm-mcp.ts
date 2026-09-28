import { StmError, StmMcpLaunches, type McpLaunchGrant } from "@matterhorn-work/stm-credentials";
import { addMcp, listMcp } from "./mcp.js";

const sameCommand = (value: unknown, expected: string[]): boolean => Array.isArray(value)
  && value.length === expected.length && value.every((part, index) => part === expected[index]);
const noEnvironment = (value: unknown): boolean => value === undefined
  || (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

/** A grant is consent to start this exact local MCP, not permission for model
 * tool calls. OpenCode continues to own its normal per-tool permission checks.
 * Only project-local configs are wrapped; no mutation of global tool settings.
 */
export async function approveStmMcp(input: {
  launches: StmMcpLaunches; workspace: string; name: string;
  launcher: string[]; bindings: Array<{ envName: string; tool: string; label: string }>;
  consent: boolean; legacyNames: string[];
}) {
  const item = (await listMcp(input.workspace)).find(entry => entry.name === input.name && entry.source === "config.project");
  if (!item || item.disabledByTools || item.config.type !== "local" || item.config.enabled === false
    || !Array.isArray(item.config.command) || !item.config.command.every(part => typeof part === "string")
    || !noEnvironment(item.config.environment)) throw new StmError("local_mcp_setup_required");
  const grant = await input.launches.approve({ workspace: input.workspace, name: input.name,
    command: item.config.command, launcher: input.launcher, bindings: input.bindings, consent: input.consent,
  }, input.legacyNames);
  try {
    const current = (await listMcp(input.workspace)).find(entry => entry.name === input.name && entry.source === "config.project");
    if (!current || JSON.stringify(current.config) !== JSON.stringify(item.config) || current.disabledByTools) throw new StmError("mcp_configuration_changed");
    // Resolution is never performed while editing configuration. Only a
    // nonsecret grant ID and trusted launcher command are written here.
    await addMcp(input.workspace, input.name, { ...item.config, command: [...grant.launcher, grant.id] });
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
