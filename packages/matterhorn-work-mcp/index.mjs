#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

/**
 * matterhorn-work-mcp
 *
 * Unified MCP server for Matterhorn Work server control. This stdio server is
 * meant for Claude Code, Codex, Cursor, and other agent environments that need
 * to inspect or operate a running Matterhorn Work server without scraping the UI.
 */

const SERVER =
  process.env.MATTERHORN_WORK_SERVER_URL ||
  process.env.MATTERHORN_SERVER_URL ||
  process.env.OPENWORK_SERVER_URL ||
  "http://localhost:8787";

const CLIENT_TOKEN =
  process.env.MATTERHORN_WORK_TOKEN ||
  process.env.OPENWORK_TOKEN ||
  process.env.MATTERHORN_TOKEN ||
  "";

const HOST_TOKEN =
  process.env.MATTERHORN_WORK_HOST_TOKEN ||
  process.env.OPENWORK_HOST_TOKEN ||
  process.env.MATTERHORN_HOST_TOKEN ||
  "";

const REQUEST_TIMEOUT_MS = Number(process.env.MATTERHORN_WORK_MCP_TIMEOUT_MS || 15_000);
const MAX_TEXT_BYTES = Number(process.env.MATTERHORN_WORK_MCP_MAX_TEXT_BYTES || 512_000);

const UPSTREAM_OPENWORK_DEFAULTS = {
  upstreamUrl: process.env.OPENWORK_UPSTREAM_REMOTE || "https://github.com/different-ai/openwork.git",
  upstreamBranch: process.env.OPENWORK_UPSTREAM_BRANCH || "main",
  baseBranch: process.env.MATTERHORN_WORK_BASE_BRANCH || "dev",
};

const UPSTREAM_OPENWORK_CONFLICT_ZONES = [
  {
    name: "Branding and i18n",
    paths: ["apps/app/src/i18n", "README.md", "docs"],
    preserve: "Visible product copy should say Matterhorn Work.",
  },
  {
    name: "Env vars and headers",
    paths: ["apps/server", "apps/orchestrator", "docs"],
    preserve: "Matterhorn-native aliases should take precedence while OpenWork fallbacks keep working.",
  },
  {
    name: "CLI and packaging",
    paths: ["apps/orchestrator", "packages", "scripts/release"],
    preserve: "Public commands should stay matterhorn-work and matterhorn-work-server with openwork shims.",
  },
  {
    name: "OpenCode abstraction",
    paths: ["apps/app/src", "apps/orchestrator", "docs/opencode-runtime-abstraction.md"],
    preserve: "User-facing copy should say Matterhorn Work engine while technical docs can name OpenCode.",
  },
  {
    name: "Agent control surface",
    paths: ["docs/agent-control-*.md", "packages/matterhorn-work-mcp", "apps/orchestrator/src/cli.ts"],
    preserve: "HTTP, MCP, CLI, browser-control, and event-stream contracts should remain stable.",
  },
  {
    name: "Bittensor safety",
    paths: ["apps/server/src/tools/bittensor*", "packages/types/src/bittensor.ts", "docs/bittensor-*.md"],
    preserve: "Bittensor remains chat-first, non-custodial, source-aware, and no-secret by contract.",
  },
  {
    name: "Release automation",
    paths: [".github/workflows", "scripts/release", "apps/desktop"],
    preserve: "CI runner fallbacks, alpha packaging, and Matterhorn naming should remain intact.",
  },
];

const UPSTREAM_OPENWORK_VERIFICATION_COMMANDS = [
  "pnpm test:upstream-openwork-sync",
  "pnpm test:cli-packaging-rename",
  "pnpm test:opencode-abstraction-copy",
  "pnpm test:agent-control-coverage-matrix",
  "pnpm test:agent-control-doctor",
  "pnpm test:bittensor-operator-playbook",
  "pnpm test:bittensor-live-qa",
];

const tools = [
  {
    name: "matterhorn_doctor",
    description: "Run one unified Matterhorn Work agent-readiness report across server, sessions, files, approvals, browser bridge, and Bittensor.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace id used to probe session routes." },
        sessionId: { type: "string", description: "Optional chat session id used with workspaceId for status/snapshot/event probes." },
        fileSessionId: { type: "string", description: "Optional file session id used for catalog/event probes." },
        requireBrowser: { type: "boolean", description: "When true, treat a missing desktop browser bridge as a failed required check." },
      },
    },
  },
  {
    name: "matterhorn_status",
    description: "Read Matterhorn Work server health, status, and capability summary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_upstream_openwork_check",
    description: "Build a read-only intake plan for reviewing upstream OpenWork updates before bringing them into Matterhorn Work. Does not merge or modify files.",
    inputSchema: {
      type: "object",
      properties: {
        upstreamUrl: { type: "string", description: "Optional upstream OpenWork repository URL." },
        upstreamBranch: { type: "string", description: "Optional upstream branch name." },
        baseBranch: { type: "string", description: "Optional Matterhorn base branch." },
        date: { type: "string", description: "Optional date used for the recommended sync branch slug." },
        remote: { type: "boolean", description: "When true, run git ls-remote against the upstream branch." },
      },
    },
  },
  {
    name: "matterhorn_list_workspaces",
    description: "List Matterhorn Work server workspaces visible to the configured client token.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_create_session",
    description: "Create a Matterhorn Work chat session in a workspace. Requires a collaborator/owner token and server write access.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        title: { type: "string", description: "Optional initial session title." },
      },
      required: ["workspaceId"],
    },
  },
  {
    name: "matterhorn_list_sessions",
    description: "List Matterhorn Work chat sessions in a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        roots: { type: "boolean", description: "When true, include root sessions where the server supports it." },
        start: { type: "number", description: "Optional non-negative pagination offset." },
        search: { type: "string", description: "Optional search filter." },
        limit: { type: "number", description: "Optional positive item limit." },
      },
      required: ["workspaceId"],
    },
  },
  {
    name: "matterhorn_get_session",
    description: "Read one Matterhorn Work chat session by workspace and session id.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_get_session_messages",
    description: "Read messages for a Matterhorn Work chat session.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        limit: { type: "number", description: "Optional positive message limit." },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_submit_session_prompt",
    description: "Submit a prompt to a Matterhorn Work chat session through the stable server route and normal approval policy.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        message: { type: "string", description: "Plain user prompt text." },
        parts: { type: "array", description: "Optional structured message parts." },
        messageID: { type: "string", description: "Optional caller-supplied message id." },
        model: { type: "object", description: "Optional provider/model selection object." },
        providerID: { type: "string", description: "Optional provider id for compatibility with existing clients." },
        modelID: { type: "string", description: "Optional model id for compatibility with existing clients." },
        agent: { type: "string", description: "Optional Matterhorn Work agent mode." },
        variant: { type: "string", description: "Optional prompt variant." },
        noReply: { type: "boolean", description: "When true, enqueue the user message without asking the engine for a reply." },
        tools: { type: "object", description: "Optional tool-mode overrides accepted by the Matterhorn Work server." },
        system: { type: "string", description: "Optional system instruction accepted by the Matterhorn Work server." },
        reasoningEffort: { type: "string", description: "Optional reasoning-effort hint." },
        reasoning_effort: { type: "string", description: "Optional reasoning-effort hint for snake_case clients." },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_get_session_status",
    description: "Poll the current execution status for a Matterhorn Work chat session without fetching the full snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_watch_session_events",
    description: "Read a bounded batch of Matterhorn Work session progress events from the session event stream.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        maxEvents: { type: "number", description: "Positive event cap. Defaults to 10 and is capped at 50." },
        snapshot: { type: "boolean", description: "When true, request an initial session.snapshot event." },
        details: { type: "boolean", description: "When true with snapshot, include snapshot-derived message, tool, and todo detail events." },
        since: { type: "string", description: "Optional reconnect cursor." },
        limit: { type: "number", description: "Optional message limit for the initial snapshot." },
        heartbeatMs: { type: "number", description: "Optional heartbeat interval for the bounded stream." },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_get_session_snapshot",
    description: "Read a combined Matterhorn Work chat session snapshot with session, messages, todos, and statuses.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
        limit: { type: "number", description: "Optional positive message limit." },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_delete_session",
    description: "Delete a Matterhorn Work chat session. Requires a collaborator/owner token and server write access.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["workspaceId", "sessionId"],
    },
  },
  {
    name: "matterhorn_create_file_session",
    description: "Create a short-lived file session for a workspace. Use readOnly=true unless writes are explicitly needed.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        readOnly: { type: "boolean", description: "When true, request a read-only file session." },
        ttlSeconds: { type: "number" },
      },
      required: ["workspaceId"],
    },
  },
  {
    name: "matterhorn_file_catalog",
    description: "List files in an existing Matterhorn Work file session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        prefix: { type: "string" },
        after: { type: "string" },
        limit: { type: "number" },
        includeDirs: { type: "boolean" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "matterhorn_watch_file_events",
    description: "Read file catalog change events for an existing Matterhorn Work file session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        since: { type: "number", description: "Optional file catalog event cursor." },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "matterhorn_read_files",
    description: "Read one or more workspace files through an existing file session. Text files are decoded for agent use.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["sessionId", "paths"],
    },
  },
  {
    name: "matterhorn_write_files",
    description: "Write files through a writable file session. Requires a collaborator/owner token and normal Matterhorn approvals.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        writes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              contentBase64: { type: "string" },
              ifMatchRevision: { type: "string" },
              force: { type: "boolean" },
            },
            required: ["path"],
          },
        },
      },
      required: ["sessionId", "writes"],
    },
  },
  {
    name: "matterhorn_close_file_session",
    description: "Close a Matterhorn Work file session.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
  },
  {
    name: "matterhorn_list_approvals",
    description: "List pending Matterhorn Work host approval requests. Requires MATTERHORN_WORK_HOST_TOKEN.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_reply_approval",
    description: "Approve or deny a pending Matterhorn Work approval request. Requires MATTERHORN_WORK_HOST_TOKEN.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string" },
        reply: { type: "string", enum: ["allow", "deny"] },
      },
      required: ["approvalId", "reply"],
    },
  },
  {
    name: "matterhorn_bittensor_chat",
    description: "Run the safe Matterhorn Work Bittensor chat workflow against the configured server.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        contextId: { type: "string" },
        context: { type: "object" },
        ss58Address: { type: "string" },
        netuid: { type: "number" },
        amountTao: { type: "string" },
        validatorHotkey: { type: "string" },
        coldkey: { type: "string" },
        recipient: { type: "string" },
        destination: { type: "string" },
        limit: { type: "number" },
        strategy: { type: "string", enum: ["balanced", "yield", "safety"] },
        rateTolerance: { type: "number" },
      },
      required: ["message"],
    },
  },
  {
    name: "matterhorn_bittensor_readiness",
    description: "Run the Matterhorn Work Bittensor readiness audit on the configured server.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_bittensor_list_capabilities",
    description: "List Bittensor subnet capability manifests from the configured Matterhorn Work server.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_bittensor_get_subnet_capability",
    description: "Read one Bittensor subnet capability manifest by netuid.",
    inputSchema: {
      type: "object",
      properties: {
        netuid: { type: "number" },
      },
      required: ["netuid"],
    },
  },
  {
    name: "matterhorn_bittensor_prepare_extrinsic",
    description: "Prepare an unsigned Bittensor extrinsic preview for external signing. No secret material is handled.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["stake", "unstake", "move_stake", "transfer", "set_child_hotkey", "register", "serve"] },
        netuid: { type: "number" },
        amountTao: { type: "string" },
        coldkey: { type: "string" },
        hotkey: { type: "string" },
        destination: { type: "string" },
        originNetuid: { type: "number" },
        destinationNetuid: { type: "number" },
        rateTolerance: { type: "number" },
      },
      required: ["action"],
    },
  },
  {
    name: "matterhorn_bittensor_create_signing_handoff",
    description: "Create a checksumed desktop handoff bundle from an unsigned Bittensor preview for external signing.",
    inputSchema: {
      type: "object",
      properties: { preview: { type: "object" } },
      required: ["preview"],
    },
  },
  {
    name: "matterhorn_bittensor_submit_signed_extrinsic",
    description: "Submit an externally signed Bittensor extrinsic through a configured sidecar, if available.",
    inputSchema: {
      type: "object",
      properties: {
        preview: { type: "object" },
        signature: { type: "string" },
        signerAddress: { type: "string" },
      },
      required: ["preview", "signature"],
    },
  },
  {
    name: "matterhorn_bittensor_preview_subnet_invocation",
    description: "Preview a Bittensor subnet adapter call before invocation, including request hash, auth/cost context, warnings, and confirmation text.",
    inputSchema: {
      type: "object",
      properties: {
        netuid: { type: "number" },
        intent: { type: "string", enum: ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"] },
        task: { type: "string" },
        ss58Address: { type: "string" },
      },
      required: ["netuid"],
    },
  },
  {
    name: "matterhorn_bittensor_invoke_subnet",
    description: "Invoke a supported Bittensor subnet adapter after explicit preview confirmation. Requires the preview request SHA-256.",
    inputSchema: {
      type: "object",
      properties: {
        netuid: { type: "number" },
        intent: { type: "string", enum: ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"] },
        task: { type: "string" },
        ss58Address: { type: "string" },
        previewRequestSha256: { type: "string" },
      },
      required: ["netuid", "previewRequestSha256"],
    },
  },
  {
    name: "matterhorn_bittensor_create_watch",
    description: "Create a public-data Bittensor watch for subnet, wallet, validator, emissions, or slippage monitoring.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["subnet", "wallet", "validator", "emissions", "slippage"] },
        label: { type: "string" },
        netuid: { type: "number" },
        ss58Address: { type: "string" },
        validatorHotkey: { type: "string" },
        threshold: { type: "number" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "matterhorn_bittensor_list_watches",
    description: "List public-data Bittensor watches created through chat, CLI, API, or MCP.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_bittensor_check_watches",
    description: "Check Bittensor watches and return current alert evaluations/cards.",
    inputSchema: { type: "object", properties: {} },
  },
];

function jsonRpc(id, result) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
}

function jsonRpcError(id, code, message) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`;
}

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function requireToken(kind) {
  if (kind === "host" && !HOST_TOKEN) {
    throw new Error("MATTERHORN_WORK_HOST_TOKEN is required for host approval tools.");
  }
  if (kind === "client" && !CLIENT_TOKEN) {
    throw new Error("MATTERHORN_WORK_TOKEN is required for server client tools.");
  }
}

function headersFor(kind, hasBody = false) {
  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (kind === "host") {
    requireToken("host");
    headers["X-Matterhorn-Host-Token"] = HOST_TOKEN;
  } else if (kind === "client") {
    requireToken("client");
    headers.Authorization = `Bearer ${CLIENT_TOKEN}`;
  }
  return headers;
}

function buildUrl(path, query = null) {
  const base = SERVER.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function callServer(path, { method = "GET", auth = "client", body = null, query = null, accept = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = buildUrl(path, query);
  try {
    const headers = headersFor(auth, Boolean(body));
    if (accept) headers.Accept = accept;
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { text };
      }
    }
    if (!response.ok) {
      const message = parsed?.message || parsed?.error || text || `HTTP ${response.status}`;
      throw new Error(`${method} ${url.pathname} failed: ${message}`);
    }
    return parsed ?? { ok: true };
  } finally {
    clearTimeout(timer);
  }
}

function doctorRank(status) {
  if (status === "fail") return 3;
  if (status === "warn") return 2;
  if (status === "skip") return 1;
  return 0;
}

function doctorSummary(checks) {
  return checks.reduce((summary, check) => {
    summary[check.status] += 1;
    return summary;
  }, { pass: 0, warn: 0, fail: 0, skip: 0 });
}

function doctorSkip(id, label, required, hint) {
  return { id, label, status: required ? "fail" : "skip", required, hint };
}

async function doctorServerCheck({ id, label, path, required, auth = "client", accept = null, ok, hint }) {
  const started = Date.now();
  try {
    const details = await callServer(path, { auth, accept });
    const passed = typeof ok === "function" ? ok(details) : true;
    return {
      id,
      label,
      status: passed ? "pass" : required ? "fail" : "warn",
      required,
      latencyMs: Date.now() - started,
      details,
      ...(passed ? {} : { error: "Response did not satisfy doctor contract" }),
      ...(hint ? { hint } : {}),
    };
  } catch (error) {
    return {
      id,
      label,
      status: required ? "fail" : "warn",
      required,
      latencyMs: Date.now() - started,
      error: error?.message || String(error),
      ...(hint ? { hint } : {}),
    };
  }
}

function userAppDataDir() {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  if (platform() === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

async function discoverUiBridge() {
  const appData = userAppDataDir();
  const candidates = [
    process.env.MATTERHORN_WORK_UI_CONTROL_DISCOVERY?.trim(),
    process.env.OPENWORK_UI_CONTROL_DISCOVERY?.trim(),
    join(appData, "com.matterhorn.work", "matterhorn-work-ui-control.json"),
    join(appData, "com.matterhorn.work.dev", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork.dev", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork", "openwork-ui-control.json"),
    join(appData, "com.differentai.openwork.dev", "openwork-ui-control.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf8"));
      if (typeof parsed.baseUrl === "string" && typeof parsed.token === "string") {
        return { baseUrl: parsed.baseUrl.replace(/\/+$/, ""), path: candidate };
      }
    } catch {
      // Try the next discovery file.
    }
  }
  return null;
}

async function doctorUiBridgeCheck(requireBrowser) {
  const bridge = await discoverUiBridge();
  if (!bridge) {
    return doctorSkip(
      "browser.bridge",
      "Desktop UI/browser bridge",
      requireBrowser === true,
      "Launch the desktop app or set MATTERHORN_WORK_UI_CONTROL_DISCOVERY. Browser bridge is optional for server-only agents.",
    );
  }
  const started = Date.now();
  try {
    const response = await fetch(`${bridge.baseUrl}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await response.text();
    let details = null;
    try {
      details = text ? JSON.parse(text) : null;
    } catch {
      details = { text };
    }
    return {
      id: "browser.bridge",
      label: "Desktop UI/browser bridge",
      status: response.ok ? "pass" : requireBrowser ? "fail" : "warn",
      required: requireBrowser === true,
      latencyMs: Date.now() - started,
      details,
      hint: `Discovery file: ${bridge.path}`,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      id: "browser.bridge",
      label: "Desktop UI/browser bridge",
      status: requireBrowser ? "fail" : "warn",
      required: requireBrowser === true,
      latencyMs: Date.now() - started,
      error: error?.message || String(error),
      hint: `Discovery file: ${bridge.path}`,
    };
  }
}

async function matterhornDoctor(args = {}) {
  const checks = [];
  checks.push(await doctorServerCheck({
    id: "server.health",
    label: "Matterhorn Work server health",
    path: "/health",
    required: true,
    auth: "none",
    ok: (payload) => payload?.ok === true || payload?.service === "matterhorn-work-server",
    hint: "Start Matterhorn Work with `matterhorn-work start` or set MATTERHORN_WORK_SERVER_URL.",
  }));

  if (!CLIENT_TOKEN) {
    checks.push(doctorSkip("auth.client", "Client token configured", true, "Set MATTERHORN_WORK_TOKEN for server client routes."));
  } else {
    checks.push({ id: "auth.client", label: "Client token configured", status: "pass", required: true });
    checks.push(await doctorServerCheck({ id: "server.status", label: "Server status route", path: "/status", required: true }));
    checks.push(await doctorServerCheck({ id: "server.capabilities", label: "Server capabilities route", path: "/capabilities", required: true }));
    checks.push(await doctorServerCheck({
      id: "workspaces.list",
      label: "Workspace listing route",
      path: "/workspaces",
      required: true,
      ok: (payload) => Array.isArray(payload?.items) || Array.isArray(payload?.workspaces),
    }));
    checks.push(await doctorServerCheck({
      id: "bittensor.readiness",
      label: "Bittensor readiness route",
      path: "/api/bittensor/readiness",
      required: true,
      ok: (payload) => payload?.success === true || payload?.ready === true || payload?.report,
      hint: "Bittensor remains non-custodial; this route should only expose read/preview readiness.",
    }));
    checks.push(await doctorServerCheck({
      id: "bittensor.capabilities",
      label: "Bittensor capability registry route",
      path: "/api/bittensor/capabilities",
      required: true,
      ok: (payload) => payload?.success === true && Array.isArray(payload?.capabilities),
      hint: "Capability manifests should be public/read-only and drive subnet explanation, preview, and adapter support.",
    }));
  }

  if (CLIENT_TOKEN && args.workspaceId && args.sessionId) {
    const base = `/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}`;
    checks.push(await doctorServerCheck({ id: "session.status", label: "Chat session status route", path: `${base}/status`, required: false }));
    checks.push(await doctorServerCheck({ id: "session.snapshot", label: "Chat session snapshot route", path: `${base}/snapshot?limit=5`, required: false }));
    checks.push(await doctorServerCheck({
      id: "session.events",
      label: "Chat session event stream route",
      path: `${base}/events?maxEvents=1&snapshot=true`,
      required: false,
      accept: "text/event-stream",
    }));
  } else {
    checks.push(doctorSkip(
      "session.routes",
      "Chat session route probes",
      false,
      "Pass workspaceId and sessionId to probe status/snapshot/events for a real session.",
    ));
  }

  if (CLIENT_TOKEN && args.fileSessionId) {
    checks.push(await doctorServerCheck({
      id: "files.catalog",
      label: "File catalog route",
      path: `/files/sessions/${encodeURIComponent(args.fileSessionId)}/catalog/snapshot?limit=5`,
      required: false,
    }));
    checks.push(await doctorServerCheck({
      id: "files.events",
      label: "File event route",
      path: `/files/sessions/${encodeURIComponent(args.fileSessionId)}/catalog/events`,
      required: false,
    }));
  } else {
    checks.push(doctorSkip("files.routes", "File-session route probes", false, "Pass fileSessionId to probe catalog and file-event routes."));
  }

  if (HOST_TOKEN) {
    checks.push(await doctorServerCheck({ id: "approvals.list", label: "Host approval listing route", path: "/approvals", required: false, auth: "host" }));
  } else {
    checks.push(doctorSkip("approvals.host-token", "Host approval token configured", false, "Set MATTERHORN_WORK_HOST_TOKEN to probe approvals."));
  }

  checks.push(await doctorUiBridgeCheck(args.requireBrowser === true));

  const requiredFailures = checks.filter((check) => check.required && check.status === "fail");
  return {
    ok: requiredFailures.length === 0,
    ready: requiredFailures.length === 0,
    checkedAt: new Date().toISOString(),
    serverUrl: SERVER,
    summary: doctorSummary(checks),
    checks: checks.sort((a, b) => doctorRank(b.status) - doctorRank(a.status)),
    warnings: checks
      .filter((check) => check.status === "warn")
      .map((check) => `${check.label}: ${check.error || check.hint || "warning"}`),
    nextSteps: Array.from(new Set(checks
      .filter((check) => check.status === "fail" || check.status === "skip")
      .map((check) => check.hint)
      .filter(Boolean))),
  };
}

function parsePositiveInteger(value, fallback, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("maxEvents must be a positive integer.");
  }
  return max ? Math.min(parsed, max) : parsed;
}

function parseSseEvents(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const event = {};
      for (const line of block.split("\n")) {
        if (line.startsWith("id: ")) event.id = line.slice("id: ".length);
        if (line.startsWith("event: ")) event.event = line.slice("event: ".length);
        if (line.startsWith("data: ")) {
          const raw = line.slice("data: ".length);
          try {
            event.data = JSON.parse(raw);
          } catch {
            event.data = raw;
          }
        }
      }
      return event;
    });
}

async function callSessionEventStream(args) {
  const maxEvents = parsePositiveInteger(args.maxEvents, 10, 50);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const path = `/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/events`;
  const url = buildUrl(path, {
    maxEvents,
    snapshot: args.snapshot,
    details: args.details,
    since: args.since,
    limit: args.limit,
    heartbeatMs: args.heartbeatMs,
  });
  try {
    const headers = headersFor("client");
    headers.Accept = "text/event-stream";
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${url.pathname} failed: ${text || `HTTP ${response.status}`}`);
    }
    const events = parseSseEvents(text);
    const lastCursor = events.length ? events[events.length - 1]?.id ?? events[events.length - 1]?.data?.cursor ?? null : null;
    return {
      ok: true,
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      maxEvents,
      events,
      count: events.length,
      lastCursor,
      nextSince: lastCursor,
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeFileItem(item) {
  if (!item?.ok || typeof item.contentBase64 !== "string") return item;
  const bytes = Buffer.from(item.contentBase64, "base64");
  const looksText = !bytes.includes(0);
  const decoded = {
    ...item,
    contentBase64: undefined,
    contentEncoding: "utf8",
    truncated: bytes.length > MAX_TEXT_BYTES,
  };
  if (!looksText) {
    return { ...item, contentEncoding: "base64", binary: true };
  }
  decoded.content = bytes.subarray(0, MAX_TEXT_BYTES).toString("utf8");
  return decoded;
}

function encodeWrite(write) {
  if (!write || typeof write !== "object") return write;
  if (typeof write.contentBase64 === "string") return write;
  if (typeof write.content === "string") {
    const { content, ...rest } = write;
    return { ...rest, contentBase64: Buffer.from(content, "utf8").toString("base64") };
  }
  return write;
}

async function matterhornStatus() {
  const [health, status, capabilities] = await Promise.allSettled([
    callServer("/health", { auth: "none" }),
    callServer("/status"),
    callServer("/capabilities"),
  ]);
  const unwrap = (result) => result.status === "fulfilled" ? result.value : { ok: false, error: result.reason?.message || "unavailable" };
  return {
    serverUrl: SERVER,
    health: unwrap(health),
    status: unwrap(status),
    capabilities: unwrap(capabilities),
  };
}

function upstreamBranchDateSlug(date) {
  const slug = String(date)
    .trim()
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || new Date().toISOString().slice(0, 10);
}

function inspectUpstreamRemote(upstreamUrl, upstreamBranch) {
  try {
    const output = execFileSync("git", ["ls-remote", "--heads", upstreamUrl, upstreamBranch], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
    return {
      checked: true,
      status: output ? "reachable" : "missing_branch",
      message: output
        ? `Found upstream branch ${upstreamBranch}.`
        : `Could not find upstream branch ${upstreamBranch}.`,
      head: output.split(/\s+/)[0] || null,
    };
  } catch (error) {
    return {
      checked: true,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      head: null,
    };
  }
}

function matterhornUpstreamOpenWorkCheck(args = {}) {
  const upstreamUrl = args.upstreamUrl || UPSTREAM_OPENWORK_DEFAULTS.upstreamUrl;
  const upstreamBranch = args.upstreamBranch || UPSTREAM_OPENWORK_DEFAULTS.upstreamBranch;
  const baseBranch = args.baseBranch || UPSTREAM_OPENWORK_DEFAULTS.baseBranch;
  const date = args.date || new Date().toISOString().slice(0, 10);
  const syncBranch = `codex/sync-openwork-${upstreamBranchDateSlug(date)}`;
  const remoteStatus = args.remote === true
    ? inspectUpstreamRemote(upstreamUrl, upstreamBranch)
    : {
        checked: false,
        status: "skipped",
        message: "Remote inspection skipped. Pass remote=true when network access is available.",
      };

  const plan = {
    upstreamUrl,
    upstreamBranch,
    baseBranch,
    syncBranch,
    remoteStatus,
    conflictZones: UPSTREAM_OPENWORK_CONFLICT_ZONES,
    verificationCommands: UPSTREAM_OPENWORK_VERIFICATION_COMMANDS,
    nextCommands: [
      `git fetch origin ${baseBranch}`,
      `git switch -c ${syncBranch} origin/${baseBranch}`,
      `git remote add openwork-upstream ${upstreamUrl}`,
      `git fetch openwork-upstream ${upstreamBranch}`,
      `git log --oneline ${baseBranch}..openwork-upstream/${upstreamBranch}`,
      `git diff --name-status ${baseBranch}...openwork-upstream/${upstreamBranch}`,
    ],
  };

  return {
    ok: true,
    plan,
    safety: {
      mode: "read_only_intake",
      modifiesFiles: false,
      mergesUpstream: false,
      requiresHumanReview: true,
    },
    guidance: [
      "Review conflict zones before applying upstream OpenWork changes.",
      "Preserve Matterhorn Work branding, compatibility aliases, CLI names, agent-control contracts, and Bittensor safety gates.",
      "Run the verification commands before opening or merging an upstream sync PR.",
    ],
  };
}

async function handleTool(name, args = {}) {
  switch (name) {
    case "matterhorn_doctor":
      return matterhornDoctor(args);
    case "matterhorn_status":
      return matterhornStatus();
    case "matterhorn_upstream_openwork_check":
      return matterhornUpstreamOpenWorkCheck(args);
    case "matterhorn_list_workspaces":
      return callServer("/workspaces");
    case "matterhorn_create_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions`, {
        method: "POST",
        body: { title: args.title },
      });
    case "matterhorn_list_sessions":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions`, {
        query: {
          roots: args.roots,
          start: args.start,
          search: args.search,
          limit: args.limit,
        },
      });
    case "matterhorn_get_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}`);
    case "matterhorn_get_session_messages":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/messages`, {
        query: { limit: args.limit },
      });
    case "matterhorn_get_session_status":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/status`);
    case "matterhorn_watch_session_events":
      return callSessionEventStream(args);
    case "matterhorn_submit_session_prompt": {
      const body = {
        ...(typeof args.message === "string" ? { message: args.message } : {}),
        ...(Array.isArray(args.parts) ? { parts: args.parts } : {}),
        ...(typeof args.messageID === "string" ? { messageID: args.messageID } : {}),
        ...(args.model && typeof args.model === "object" ? { model: args.model } : {}),
        ...(typeof args.providerID === "string" ? { providerID: args.providerID } : {}),
        ...(typeof args.modelID === "string" ? { modelID: args.modelID } : {}),
        ...(typeof args.agent === "string" ? { agent: args.agent } : {}),
        ...(typeof args.variant === "string" ? { variant: args.variant } : {}),
        ...(typeof args.noReply === "boolean" ? { noReply: args.noReply } : {}),
        ...(args.tools && typeof args.tools === "object" ? { tools: args.tools } : {}),
        ...(typeof args.system === "string" ? { system: args.system } : {}),
        ...(typeof args.reasoningEffort === "string" ? { reasoningEffort: args.reasoningEffort } : {}),
        ...(typeof args.reasoning_effort === "string" ? { reasoning_effort: args.reasoning_effort } : {}),
      };
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/messages`, {
        method: "POST",
        body,
      });
    }
    case "matterhorn_get_session_snapshot":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/snapshot`, {
        query: { limit: args.limit },
      });
    case "matterhorn_delete_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}`, { method: "DELETE" });
    case "matterhorn_create_file_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/files/sessions`, {
        method: "POST",
        body: { write: args.readOnly === true ? false : true, ttlSeconds: args.ttlSeconds },
      });
    case "matterhorn_file_catalog":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/catalog/snapshot`, {
        query: {
          prefix: args.prefix,
          after: args.after,
          limit: args.limit,
          includeDirs: args.includeDirs,
        },
      });
    case "matterhorn_watch_file_events":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/catalog/events`, {
        query: { since: args.since },
      });
    case "matterhorn_read_files": {
      const result = await callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/read-batch`, {
        method: "POST",
        body: { paths: args.paths },
      });
      return { ...result, items: Array.isArray(result.items) ? result.items.map(decodeFileItem) : result.items };
    }
    case "matterhorn_write_files":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/write-batch`, {
        method: "POST",
        body: { writes: (args.writes || []).map(encodeWrite) },
      });
    case "matterhorn_close_file_session":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}`, { method: "DELETE" });
    case "matterhorn_list_approvals":
      return callServer("/approvals", { auth: "host" });
    case "matterhorn_reply_approval":
      return callServer(`/approvals/${encodeURIComponent(args.approvalId)}`, {
        method: "POST",
        auth: "host",
        body: { reply: args.reply === "allow" ? "allow" : "deny" },
      });
    case "matterhorn_bittensor_chat":
      return callServer("/api/bittensor/chat/execute", { method: "POST", body: args });
    case "matterhorn_bittensor_readiness":
      return callServer("/api/bittensor/readiness");
    case "matterhorn_bittensor_list_capabilities":
      return callServer("/api/bittensor/capabilities");
    case "matterhorn_bittensor_get_subnet_capability":
      return callServer(`/api/bittensor/capabilities/${encodeURIComponent(String(args.netuid))}`);
    case "matterhorn_bittensor_prepare_extrinsic":
      return callServer("/api/bittensor/extrinsics/prepare", { method: "POST", body: args });
    case "matterhorn_bittensor_create_signing_handoff":
      return callServer("/api/bittensor/extrinsics/handoff", { method: "POST", body: args });
    case "matterhorn_bittensor_submit_signed_extrinsic":
      return callServer("/api/bittensor/extrinsics/submit", { method: "POST", body: args });
    case "matterhorn_bittensor_preview_subnet_invocation":
      return callServer(`/api/bittensor/subnets/${encodeURIComponent(String(args.netuid))}/preview`, { method: "POST", body: args });
    case "matterhorn_bittensor_invoke_subnet":
      return callServer(`/api/bittensor/subnets/${encodeURIComponent(String(args.netuid))}/invoke`, { method: "POST", body: args });
    case "matterhorn_bittensor_create_watch":
      return callServer("/api/bittensor/monitoring/watchlist", { method: "POST", body: args });
    case "matterhorn_bittensor_list_watches":
      return callServer("/api/bittensor/monitoring/watchlist");
    case "matterhorn_bittensor_check_watches":
      return callServer("/api/bittensor/monitoring/check");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      void handleMessage(JSON.parse(trimmed));
    } catch {
      process.stderr.write(`MCP parse error: ${trimmed.slice(0, 200)}\n`);
    }
  }
});

async function handleMessage(msg) {
  const { method, id } = msg;
  switch (method) {
    case "initialize":
      return process.stdout.write(jsonRpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "matterhorn-work-mcp", version: "0.1.0" },
      }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      try {
        const result = await handleTool(name, args ?? {});
        return process.stdout.write(jsonRpc(id, textResult(result)));
      } catch (error) {
        return process.stdout.write(jsonRpcError(id, -32000, error?.message || `${name} failed`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work MCP Server v0.1.0 ready\n");
