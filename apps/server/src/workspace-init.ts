import { basename, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildMatterhornDeskAgentSystemPrompt,
  buildMatterhornDeskRuntimeTools,
  MATTERHORN_DESK_AGENT_MANIFESTS,
  type MatterhornDeskAgentManifest,
} from "@matterhorn-work/types/desk-agents";

import { ensureDir, exists } from "./utils.js";
import { ApiError } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";
import { openworkConfigPath, opencodeConfigPath } from "./workspace-files.js";
import { readJsoncFile, updateJsoncPath, updateJsoncTopLevel, writeJsoncFile } from "./jsonc.js";
import type { ReloadReason } from "./types.js";

const BROWSER_PLUGIN = "opencode-chrome-devtools";
const LEGACY_BROWSER_MCP_KEYS = ["openwork-browser", "chrome", "chrome-devtools", "control-chrome"];

const MATTERHORN_ARTIFACT_GUIDANCE = `<!-- MATTERHORN_ARTIFACTS_START -->
## Matterhorn Desks Artifacts

**Default save location:** \`outputs/<desk>/<session-slug>/\`
- Put user-visible deliverables there (for example \`outputs/longevity/client-program/program.md\`), use standard formats (\`.md\`, \`.csv\`, \`.xlsx\`, or \`index.html\`), and report the exact workspace-relative path.
- Use \`.csv\` for simple tables and \`.xlsx\` only when Excel is requested. For a web preview, start it when useful and report its local HTTP URL.
- Never invent \`Workspace/<id>/...\` paths; use paths returned by tools or clean project-relative paths.
<!-- MATTERHORN_ARTIFACTS_END -->`;

const MATTERHORN_AGENT = `---
description: Matterhorn Desks default agent
mode: primary
temperature: 0.2
---

You are Matterhorn Desks.

When the user refers to "you", they mean the Matterhorn Desks app and the current workspace.

Your job:
- Complete safe project work and automate repeatable workflows with reproducible outputs.
- Route Bittensor, Hyperliquid, Polymarket, Sui, Longevity, Memory, and MCP requests to their dedicated Matterhorn desk agent.
- Do not lead with internal runtime files. Describe them as Matterhorn engine configuration unless the user asks to debug them.

<!-- MATTERHORN_BROWSER_START -->
## Browser

Use the visible built-in browser only for browsing tasks. Connect at \`http://127.0.0.1:{{BROWSER_CDP_PORT}}\`, call \`browser_list\` first, and never navigate the Matterhorn Desks app target itself. Do not inspect personal browser cookies, profiles, or extensions.
<!-- MATTERHORN_BROWSER_END -->

## Memory

Behavior memory may live in skills, agents, and project docs. Tokens, credentials, local configuration, and logs are private: never copy them into project files.

## Working style

- Ask one targeted question only when required setup is missing. Test changes proportionately, factor repeated work into a skill, and prefer practical outcomes over narration.

${MATTERHORN_ARTIFACT_GUIDANCE}
`;

type WorkspaceOpenworkConfig = {
  version: number;
  workspace?: {
    name?: string | null;
    createdAt?: number | null;
    preset?: string | null;
  } | null;
  authorizedRoots: string[];
  reload?: {
    auto?: boolean;
    resume?: boolean;
  } | null;
};

type EnsureWorkspaceFilesResult = {
  changed: boolean;
  reloadReasons: ReloadReason[];
};

function normalizePreset(preset: string | null | undefined): string {
  const trimmed = preset?.trim() ?? "";
  if (!trimmed) return "starter";
  return trimmed;
}

function isSchemaOnlyOpencodeConfig(config: Record<string, unknown>): boolean {
  return Object.keys(config).every((key) => key === "$schema");
}

async function ensureWorkspaceOpenworkConfig(workspaceRoot: string, preset: string): Promise<boolean> {
  const path = openworkConfigPath(workspaceRoot);
  if (await exists(path)) return false;
  const now = Date.now();
  const config: WorkspaceOpenworkConfig = {
    version: 1,
    workspace: {
      name: basename(workspaceRoot) || "Workspace",
      createdAt: now,
      preset,
    },
    authorizedRoots: [workspaceRoot],
    reload: null,
  };
  await ensureDir(join(workspaceRoot, ".opencode"));
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  return true;
}

async function ensureOpencodeConfig(workspaceRoot: string): Promise<boolean> {
  const path = opencodeConfigPath(workspaceRoot);
  if (await exists(path)) {
    await readJsoncFile<Record<string, unknown>>(path, {});
    return false;
  }

  await writeJsoncFile(path, {
    $schema: "https://opencode.ai/config.json",
    default_agent: "matterhorn",
    plugin: [BROWSER_PLUGIN],
  });
  return true;
}

function resolveAgentTemplate(): string {
  const cdpPort = process.env.OPENWORK_ELECTRON_REMOTE_DEBUG_PORT?.trim() || "9222";
  return MATTERHORN_AGENT.replace("{{BROWSER_CDP_PORT}}", cdpPort);
}

function renderDeskAgentRuntimePermissions(
  agent: MatterhornDeskAgentManifest,
): string {
  const entries = Object.entries(agent.toolPolicy.permissions);
  if (entries.length === 0) return "";
  return `permission:\n${entries.map(([permission, action]) => `  ${permission}: ${action}`).join("\n")}\n`;
}

function renderDeskAgentRuntimeTools(
  agent: MatterhornDeskAgentManifest,
): string {
  const runtimeTools = buildMatterhornDeskRuntimeTools(agent);
  if (!runtimeTools) return "";
  return `tools:\n${Object.entries(runtimeTools).map(([tool, enabled]) => `  "${tool}": ${enabled}`).join("\n")}\n`;
}

function renderDeskAgentTemplate(agent: MatterhornDeskAgentManifest): string {
  return `---
description: ${agent.description}
mode: primary
temperature: ${agent.modelPolicy.temperature}
${renderDeskAgentRuntimePermissions(agent)}${renderDeskAgentRuntimeTools(agent)}---

<!-- MATTERHORN_MANAGED_DESK_AGENT_START
matterhorn_desk_agent: v3
matterhorn_desk_id: ${agent.deskId}
agent_id: ${agent.agentId}
workflow_id: ${agent.workflowId}
workflow_manifest_ref: ${agent.workflowManifestRef ?? "none"}
output_desk_id: ${agent.outputDeskId}
MATTERHORN_MANAGED_DESK_AGENT_END -->

# ${agent.displayName}

${buildMatterhornDeskAgentSystemPrompt(agent)}

${MATTERHORN_ARTIFACT_GUIDANCE}
`;
}

function managedAgentPromptBody(source: string): string {
  return parseFrontmatter(source).body.replace(/\r\n/g, "\n").trim();
}

/**
 * Return the exact public prompt body Matterhorn owns for a managed agent.
 *
 * OpenCode resolves agent markdown after Matterhorn's request preflight. The
 * server uses this canonical body to distinguish shipped policy from
 * workspace-authored instructions, which must be treated as private context.
 */
export function resolveMatterhornManagedAgentPrompt(agentId: string): string | null {
  const normalizedAgentId = agentId.trim();
  if (normalizedAgentId === "matterhorn") {
    return managedAgentPromptBody(resolveAgentTemplate());
  }
  const manifest = Object.values(MATTERHORN_DESK_AGENT_MANIFESTS)
    .find((candidate) => candidate.agentId === normalizedAgentId);
  if (!manifest || manifest.toolPolicy.runtimeKind !== "managed_desk") return null;
  return managedAgentPromptBody(renderDeskAgentTemplate(manifest));
}

async function ensureMatterhornAgent(workspaceRoot: string): Promise<boolean> {
  const agentsDir = join(workspaceRoot, ".opencode", "agents");
  const agentPath = join(agentsDir, "matterhorn.md");
  const agentContent = resolveAgentTemplate();
  await ensureDir(agentsDir);
  if (!(await exists(agentPath))) {
    await writeFile(agentPath, agentContent.endsWith("\n") ? agentContent : `${agentContent}\n`, "utf8");
    return true;
  }
  let current = await readFile(agentPath, "utf8");
  let changed = false;

  // Patch artifacts section
  const artifactMarkers = [
    ["<!-- MATTERHORN_ARTIFACTS_START -->", "<!-- MATTERHORN_ARTIFACTS_END -->"],
    ["<!-- OPENWORK_ARTIFACTS_START -->", "<!-- OPENWORK_ARTIFACTS_END -->"],
  ] as const;
  const artifactBlock = artifactMarkers
    .map(([start, end]) => ({ start, end, startIndex: current.indexOf(start), endIndex: current.indexOf(end) }))
    .find((block) => block.startIndex >= 0 && block.endIndex > block.startIndex);
  const artStartIdx = artifactBlock?.startIndex ?? -1;
  const artEndIdx = artifactBlock?.endIndex ?? -1;
  if (artStartIdx >= 0 && artEndIdx > artStartIdx) {
    const patched = `${current.slice(0, artStartIdx)}${MATTERHORN_ARTIFACT_GUIDANCE}${current.slice(artEndIdx + artifactBlock!.end.length)}`;
    if (patched !== current) { current = patched; changed = true; }
  } else {
    current = `${current.trimEnd()}\n\n${MATTERHORN_ARTIFACT_GUIDANCE}\n`;
    changed = true;
  }

  // Patch browser section (replace with resolved CDP port)
  const browserStart = "<!-- MATTERHORN_BROWSER_START -->";
  const browserEnd = "<!-- MATTERHORN_BROWSER_END -->";
  const legacyBrowserStart = "<!-- OPENWORK_BROWSER_START -->";
  const legacyBrowserEnd = "<!-- OPENWORK_BROWSER_END -->";
  const hasMatterhornBrowserBlock = current.includes(browserStart) && current.includes(browserEnd);
  const activeBrowserStart = hasMatterhornBrowserBlock ? browserStart : legacyBrowserStart;
  const activeBrowserEnd = hasMatterhornBrowserBlock ? browserEnd : legacyBrowserEnd;
  const bsIdx = current.indexOf(activeBrowserStart);
  const beIdx = current.indexOf(activeBrowserEnd);
  const resolvedBrowser = agentContent.slice(
    agentContent.indexOf(browserStart),
    agentContent.indexOf(browserEnd) + browserEnd.length,
  );
  if (bsIdx >= 0 && beIdx > bsIdx) {
    const oldBrowser = current.slice(bsIdx, beIdx + activeBrowserEnd.length);
    if (oldBrowser !== resolvedBrowser) {
      current = current.slice(0, bsIdx) + resolvedBrowser + current.slice(beIdx + activeBrowserEnd.length);
      changed = true;
    }
  }

  if (changed) {
    await writeFile(agentPath, current, "utf8");
    return true;
  }
  return false;
}

async function ensureMatterhornDeskAgents(workspaceRoot: string): Promise<boolean> {
  const agentsDir = join(workspaceRoot, ".opencode", "agents");
  await ensureDir(agentsDir);
  let changed = false;
  for (const agent of Object.values(MATTERHORN_DESK_AGENT_MANIFESTS)) {
    if (agent.toolPolicy.runtimeKind !== "managed_desk") continue;
    const agentPath = join(agentsDir, `${agent.agentId}.md`);
    const content = renderDeskAgentTemplate(agent);
    const normalizedContent = content.endsWith("\n") ? content : `${content}\n`;
    if (await exists(agentPath)) {
      const current = await readFile(agentPath, "utf8");
      if (!/matterhorn_desk_agent: v[123]/.test(current) || current === normalizedContent) continue;
    }
    await writeFile(agentPath, normalizedContent, "utf8");
    changed = true;
  }
  return changed;
}

async function ensureBrowserPlugin(workspaceRoot: string): Promise<boolean> {
  const configPath = opencodeConfigPath(workspaceRoot);
  const { data: config } = await readJsoncFile<Record<string, unknown>>(configPath, {});

  const hasPlugin = Array.isArray(config.plugin) && (config.plugin as string[]).includes(BROWSER_PLUGIN);
  const mcp = typeof config.mcp === "object" && config.mcp !== null ? config.mcp as Record<string, unknown> : null;
  const hasLegacyMcps = mcp ? LEGACY_BROWSER_MCP_KEYS.some((key) => key in mcp) : false;
  const shouldClaimDesktopCreatedConfig = await exists(openworkConfigPath(workspaceRoot)) && isSchemaOnlyOpencodeConfig(config);
  const isOpenWorkOwned = config.default_agent === "openwork" || config.default_agent === "matterhorn" || shouldClaimDesktopCreatedConfig;

  if (hasPlugin && !hasLegacyMcps) return false;

  const updates: Record<string, unknown> = {};

  // Add the plugin if missing (only for OpenWork-owned workspaces or legacy migrations)
  if (!hasPlugin && (isOpenWorkOwned || hasLegacyMcps)) {
    const existing = Array.isArray(config.plugin) ? config.plugin as string[] : [];
    updates.plugin = [...existing, BROWSER_PLUGIN];
  }

  if (shouldClaimDesktopCreatedConfig) {
    updates.default_agent = "matterhorn";
  }

  if (!Object.keys(updates).length && !hasLegacyMcps) return false;

  if (Object.keys(updates).length) {
    await updateJsoncTopLevel(configPath, updates);
  }

  // Remove stale MCP entries individually to avoid clobbering other keys
  if (hasLegacyMcps && mcp) {
    for (const key of LEGACY_BROWSER_MCP_KEYS) {
      if (key in mcp) {
        await updateJsoncPath(configPath, ["mcp", key], undefined);
      }
    }
  }

  return true;
}

export async function ensureWorkspaceFiles(workspaceRoot: string, presetInput: string): Promise<EnsureWorkspaceFilesResult> {
  const preset = normalizePreset(presetInput);
  if (!workspaceRoot.trim()) {
    throw new ApiError(400, "invalid_workspace_path", "workspace path is required");
  }
  await ensureDir(workspaceRoot);
  await ensureDir(join(workspaceRoot, "outputs"));
  const reloadReasons = new Set<ReloadReason>();
  if (await ensureOpencodeConfig(workspaceRoot)) reloadReasons.add("config");
  if (await ensureBrowserPlugin(workspaceRoot)) reloadReasons.add("config");
  if (await ensureMatterhornAgent(workspaceRoot)) reloadReasons.add("agents");
  if (await ensureMatterhornDeskAgents(workspaceRoot)) reloadReasons.add("agents");
  const openworkConfigChanged = await ensureWorkspaceOpenworkConfig(workspaceRoot, preset);
  return {
    changed: openworkConfigChanged || reloadReasons.size > 0,
    reloadReasons: Array.from(reloadReasons),
  };
}

export async function readRawOpencodeConfig(path: string): Promise<{ exists: boolean; content: string | null }> {
  const hasFile = await exists(path);
  if (!hasFile) {
    return { exists: false, content: null };
  }
  const content = await readFile(path, "utf8");
  return { exists: true, content };
}
