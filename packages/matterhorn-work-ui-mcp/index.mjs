#!/usr/bin/env node

/**
 * matterhorn-work-ui-mcp
 *
 * MCP server that exposes Matterhorn Work's UI control surface as MCP tools.
 * Speaks MCP stdio and proxies to the Matterhorn Work desktop bridge HTTP API.
 *
 * Requires Matterhorn Work desktop running with the local UI control bridge active.
 *
 * Usage:
 *   npx matterhorn-work-ui-mcp
 *
 * MCP config (OpenCode / Claude Desktop / Cursor / etc.):
 *   {
 *     "mcpServers": {
 *       "matterhorn-work-ui": {
 *         "command": "npx",
 *         "args": ["-y", "matterhorn-work-ui-mcp"]
 *       }
 *     }
 *   }
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Bridge discovery ──

const DISCOVERY_FILE = "matterhorn-work-ui-control.json";
const LEGACY_DISCOVERY_FILE = "openwork-ui-control.json";
const BRIDGE_CACHE_MS = 2_000;
const BRIDGE_TIMEOUT_MS = 5_000;
let cachedBridge = null;
let cachedBridgeAt = 0;

function userAppDataDir() {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  if (platform() === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function discoveryPaths() {
  return [
    process.env.MATTERHORN_WORK_UI_CONTROL_DISCOVERY?.trim(),
    process.env.OPENWORK_UI_CONTROL_DISCOVERY?.trim(),
    join(userAppDataDir(), "com.matterhorn.work", DISCOVERY_FILE),
    join(userAppDataDir(), "com.matterhorn.work.dev", DISCOVERY_FILE),
    join(userAppDataDir(), "com.differentai.openwork", DISCOVERY_FILE),
    join(userAppDataDir(), "com.differentai.openwork.dev", DISCOVERY_FILE),
    join(userAppDataDir(), "com.differentai.openwork", LEGACY_DISCOVERY_FILE),
    join(userAppDataDir(), "com.differentai.openwork.dev", LEGACY_DISCOVERY_FILE),
  ].filter(Boolean);
}

function clearBridgeCache() {
  cachedBridge = null;
  cachedBridgeAt = 0;
}

async function discoverBridge() {
  if (cachedBridge && Date.now() - cachedBridgeAt < BRIDGE_CACHE_MS) return cachedBridge;

  for (const candidate of discoveryPaths()) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.baseUrl === "string" && typeof parsed.token === "string") {
        cachedBridge = { baseUrl: parsed.baseUrl, token: parsed.token, path: candidate };
        cachedBridgeAt = Date.now();
        return cachedBridge;
      }
    } catch {
      // Try next
    }
  }
  return null;
}

async function bridgeRequest(path, options = {}) {
  const bridge = await discoverBridge();
  if (!bridge) {
    return {
      ok: false,
      error: "Matterhorn Work is not running. Launch the Matterhorn Work desktop app first.",
      hint: "The MCP server connects to a running Matterhorn Work instance via its local bridge.",
    };
  }
  const url = `${bridge.baseUrl}${path}`;
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      signal: AbortSignal.timeout(options.timeoutMs ?? BRIDGE_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${bridge.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      if (!response.ok) clearBridgeCache();
      return parsed;
    } catch {
      if (!response.ok) clearBridgeCache();
      return { ok: false, error: text || `HTTP ${response.status}` };
    }
  } catch (error) {
    clearBridgeCache();
    return { ok: false, error: `Bridge unreachable at ${url}: ${error.message}` };
  }
}

function formatArgs(action) {
  const lines = [];
  if (Array.isArray(action.args) && action.args.length > 0) {
    lines.push("    Args:");
    for (const arg of action.args) {
      const required = arg.required ? "required" : "optional";
      const type = arg.type || "unknown";
      lines.push(`      - ${arg.name} (${type}, ${required})${arg.description ? `: ${arg.description}` : ""}`);
    }
  } else if (action.requiresArgs) {
    lines.push("    Args: required; this action has not published detailed argument metadata yet.");
  }
  if (action.previewArgs !== undefined) {
    lines.push(`    Example: ${JSON.stringify(action.previewArgs)}`);
  }
  return lines.join("\n");
}

function formatActionLine(action) {
  const disabled = action.disabled ? " [disabled]" : "";
  const busy = action.busy ? " [busy]" : "";
  const args = formatArgs(action);
  return `${action.id}${disabled}${busy}\n    ${action.label || ""}${action.description ? ` — ${action.description}` : ""}${args ? `\n${args}` : ""}`;
}

function formatExecutionResult(actionId, result) {
  const payload = result?.result ?? result;
  if (payload === true || payload === undefined || payload === null) return `Executed ${actionId}.`;
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return `Result: ${payload}`;
  if (typeof payload === "object") {
    const lines = [`Executed ${actionId}.`];
    for (const [key, value] of Object.entries(payload).slice(0, 12)) {
      if (key === "ok" || key === "actionId") continue;
      const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`${key}: ${rendered}`);
    }
    return lines.join("\n");
  }
  return `Executed ${actionId}.`;
}

function actionListFromBridgeResult(result) {
  if (Array.isArray(result?.actions)) return result.actions;
  if (Array.isArray(result?.snapshot?.actions)) return result.snapshot.actions;
  if (Array.isArray(result?.item?.actions)) return result.item.actions;
  return [];
}

function isBrowserAction(action) {
  return typeof action?.id === "string" && action.id.startsWith("browser.");
}

function isConfirmationRequired(action) {
  return action?.requiresConfirmation === true || action?.sideEffect === "external";
}

async function listBridgeActions() {
  const result = await bridgeRequest("/actions");
  return { result, actions: actionListFromBridgeResult(result) };
}

function browserActionUnavailableText(actionId) {
  return [
    `No semantic ${actionId} action is available from Matterhorn Work right now.`,
    "Use browser_list_actions to inspect published browser.* actions, or use the generic ui_* tools.",
    "Do not fall back to raw coordinates for destructive, external, financial, or signing actions.",
  ].join("\n");
}

async function findBrowserAction(actionId) {
  const { result, actions } = await listBridgeActions();
  if (!result.ok && result.error) return { error: result.error, action: null };
  return { action: actions.find((action) => action?.id === actionId && isBrowserAction(action)) ?? null };
}

async function executeSemanticBrowserAction(action, args, confirmed) {
  if (!action || !isBrowserAction(action)) {
    return { ok: false, error: "Only semantic browser.* actions can be executed with browser control tools." };
  }
  if (action.disabled) {
    return { ok: false, error: `Action is disabled: ${action.label || action.id}` };
  }
  if (action.busy) {
    return { ok: false, error: `Action is busy: ${action.label || action.id}` };
  }
  if (isConfirmationRequired(action) && confirmed !== true) {
    return {
      ok: false,
      error: [
        `${action.id} requires explicit confirmation before execution.`,
        action.description ? `Consequence: ${action.description}` : "Consequence: this action may affect external state.",
      ].join("\n"),
    };
  }
  return bridgeRequest("/execute", {
    method: "POST",
    body: { actionId: action.id, args: args ?? {} },
  });
}

// ── MCP Server ──

const server = new McpServer({
  name: "matterhorn-work-ui",
  version: "0.1.0",
});

// ── ui.snapshot ──
server.tool(
  "ui_snapshot",
  "Get a snapshot of the current Matterhorn Work UI state: active route, narration, visible actions, and status. Use this before taking action to understand what the user sees.",
  {},
  async () => {
    const result = await bridgeRequest("/snapshot");
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error}${result.hint ? `\n${result.hint}` : ""}` }], isError: true };
    }
    const snapshot = result.snapshot ?? result;
    const lines = [];
    if (snapshot.route) lines.push(`Route: ${snapshot.route}`);
    if (snapshot.status) lines.push(`Status: ${snapshot.status}`);
    if (snapshot.narration) lines.push(`Narration: ${snapshot.narration}`);
    if (snapshot.busyActionId) lines.push(`Busy: ${snapshot.busyActionId}`);
    if (Array.isArray(snapshot.actions)) {
      lines.push(`\nActions (${snapshot.actions.length}):`);
      for (const action of snapshot.actions) {
        const args = Array.isArray(action.args) && action.args.length ? ` [${action.args.map((a) => a.name).join(", ")}]` : "";
        lines.push(`  ${action.id} — ${action.label || action.description || ""}${args}`);
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") || "Matterhorn Work is reachable, but it did not return visible UI state." }] };
  }
);

// ── ui.list_actions ──
server.tool(
  "ui_list_actions",
  "List all UI control actions currently available in Matterhorn Work: session navigation, composer control, transcript access, and more. Each action has an id you can pass to ui_execute_action.",
  {},
  async () => {
    const result = await bridgeRequest("/actions");
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    }
    if (!Array.isArray(result.actions) || result.actions.length === 0) {
      return { content: [{ type: "text", text: "No actions available. Is Matterhorn Work on the main screen?" }] };
    }
    const text = result.actions.map(formatActionLine).join("\n\n");
    return { content: [{ type: "text", text: `${result.actions.length} actions:\n\n${text}` }] };
  }
);

// ── ui.execute_action ──
server.tool(
  "ui_execute_action",
  "Execute a Matterhorn Work UI action by its id. Use ui_list_actions first to see available actions and their required arguments.",
  {
    actionId: z.string().describe("The action id from ui_list_actions, e.g. 'session.create_task' or 'composer.set_text'"),
    args: z.record(z.unknown()).optional().describe("JSON arguments for the action, if required"),
  },
  async ({ actionId, args }) => {
    const result = await bridgeRequest("/execute", {
      method: "POST",
      body: { actionId, args: args ?? {} },
    });
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error executing ${actionId}: ${result.error}` }], isError: true };
    }
    return { content: [{ type: "text", text: formatExecutionResult(actionId, result) }] };
  }
);

// ── browser.list_actions ──
server.tool(
  "browser_list_actions",
  "List semantic browser.* actions currently published by Matterhorn Work. Use this before browser_snapshot, browser_open, or browser_execute_action.",
  {},
  async () => {
    const { result, actions } = await listBridgeActions();
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    }
    const browserActions = actions.filter(isBrowserAction);
    if (browserActions.length === 0) {
      return {
        content: [{
          type: "text",
          text: [
            "No semantic browser.* actions are currently published by Matterhorn Work.",
            "Use ui_snapshot and ui_list_actions for app control. Use low-level browser fallback only for safe read-only inspection when no semantic action exists.",
          ].join("\n"),
        }],
      };
    }
    return {
      content: [{
        type: "text",
        text: `${browserActions.length} semantic browser actions:\n\n${browserActions.map(formatActionLine).join("\n\n")}`,
      }],
    };
  }
);

// ── browser.snapshot ──
server.tool(
  "browser_snapshot",
  "Run the published browser.snapshot action when Matterhorn Work exposes one. This refuses coordinate or DOM fallbacks.",
  {},
  async () => {
    const { error, action } = await findBrowserAction("browser.snapshot");
    if (error) return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    if (!action) return { content: [{ type: "text", text: browserActionUnavailableText("browser.snapshot") }], isError: true };
    const result = await executeSemanticBrowserAction(action, {}, false);
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error executing browser.snapshot: ${result.error}` }], isError: true };
    }
    return { content: [{ type: "text", text: formatExecutionResult("browser.snapshot", result) }] };
  }
);

// ── browser.open ──
server.tool(
  "browser_open",
  "Open or navigate a browser target using Matterhorn Work's semantic browser.open or browser.navigate action. Refuses raw coordinate fallback.",
  {
    url: z.string().describe("The URL to open or navigate to."),
    newTab: z.boolean().optional().describe("When supported by the published action, open in a new tab."),
    confirmed: z.boolean().optional().describe("Required only when the published browser action declares external side effects or confirmation."),
  },
  async ({ url, newTab, confirmed }) => {
    const { result, actions } = await listBridgeActions();
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    }
    const action = actions.find((candidate) => candidate?.id === "browser.open" && isBrowserAction(candidate))
      ?? actions.find((candidate) => candidate?.id === "browser.navigate" && isBrowserAction(candidate));
    if (!action) {
      return { content: [{ type: "text", text: browserActionUnavailableText("browser.open or browser.navigate") }], isError: true };
    }
    const execution = await executeSemanticBrowserAction(action, { url, newTab }, confirmed);
    if (!execution.ok && execution.error) {
      return { content: [{ type: "text", text: `Error executing ${action.id}: ${execution.error}` }], isError: true };
    }
    return { content: [{ type: "text", text: formatExecutionResult(action.id, execution) }] };
  }
);

// ── browser.execute_action ──
server.tool(
  "browser_execute_action",
  "Execute one published semantic browser.* action by id. Use browser_list_actions first; high-risk browser actions require confirmed=true.",
  {
    actionId: z.string().describe("The semantic browser action id from browser_list_actions, e.g. browser.snapshot or browser.open."),
    args: z.record(z.unknown()).optional().describe("JSON arguments for the action, if required."),
    confirmed: z.boolean().optional().describe("Set true only after explicit user confirmation for external or confirmation-required actions."),
  },
  async ({ actionId, args, confirmed }) => {
    if (!actionId.startsWith("browser.")) {
      return { content: [{ type: "text", text: "browser_execute_action only accepts semantic browser.* action ids." }], isError: true };
    }
    const { error, action } = await findBrowserAction(actionId);
    if (error) return { content: [{ type: "text", text: `Error: ${error}` }], isError: true };
    if (!action) return { content: [{ type: "text", text: browserActionUnavailableText(actionId) }], isError: true };
    const result = await executeSemanticBrowserAction(action, args ?? {}, confirmed);
    if (!result.ok && result.error) {
      return { content: [{ type: "text", text: `Error executing ${actionId}: ${result.error}` }], isError: true };
    }
    return { content: [{ type: "text", text: formatExecutionResult(actionId, result) }] };
  }
);

// ── ui.status ──
server.tool(
  "ui_status",
  "Check if Matterhorn Work is running and the bridge is reachable. Returns connection status and app info.",
  {},
  async () => {
    const bridge = await discoverBridge();
    if (!bridge) {
      return { content: [{ type: "text", text: "Matterhorn Work is not running.\nLaunch the Matterhorn Work desktop app to enable UI control." }], isError: true };
    }
    try {
      const response = await fetch(`${bridge.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await response.json();
      return { content: [{ type: "text", text: `Connected to ${data.app || "Matterhorn Work"}\nBridge: ${bridge.baseUrl}\nVersion: ${data.version ?? "?"}` }] };
    } catch (error) {
      clearBridgeCache();
      return { content: [{ type: "text", text: `Bridge file found but not reachable: ${error.message}\nMatterhorn Work may have quit. Relaunch it.` }], isError: true };
    }
  }
);

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
