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
    description: "Default first Matterhorn Work tool for ordinary Bittensor requests. Runs the safe chat workflow against the configured server.",
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
    name: "matterhorn_bittensor_customer_evidence_bundle",
    description: "Create a customer-safe Bittensor readiness evidence bundle from already-collected public QA, CI, readiness, and wallet-timeline evidence.",
    inputSchema: {
      type: "object",
      properties: {
        bittensorLiveQa: { type: "object", description: "JSON output from the Bittensor live QA flow." },
        agentControlLiveQa: { type: "object", description: "Optional JSON output from the agent-control live QA flow." },
        ci: { type: "object", description: "GitHub checks, workflow runs, jobs, or statuses." },
        readinessGate: {
          oneOf: [{ type: "string" }, { type: "object" }],
          description: "Readiness gate Markdown or a structured readiness result.",
        },
        walletTimeline: { type: "object", description: "Optional public wallet timeline status or export summary." },
        adapterCanary: { type: "object", description: "Optional JSON output from the Bittensor adapter canary gate." },
        readonlyAdapterCanary: { type: "object", description: "Optional JSON output from the Bittensor read-only adapter canary harness." },
        receiptCheck: { type: "object", description: "Optional JSON output from the Bittensor receipt check." },
        requireAdapterCanary: { type: "boolean", description: "Require adapter canary evidence to be ready for real-adapter customer demos." },
        requireReadonlyAdapterCanary: { type: "boolean", description: "Require read-only adapter canary evidence to be ready." },
        requireReceiptCheck: { type: "boolean", description: "Require post-signer receipt evidence to be accepted." },
        title: { type: "string" },
      },
      required: ["bittensorLiveQa", "ci", "readinessGate"],
    },
  },
  {
    name: "matterhorn_bittensor_list_capabilities",
    description: "List Bittensor subnet capability manifests from the configured Matterhorn Work server. Use before previewing or invoking any direct subnet service.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_bittensor_get_subnet_capability",
    description: "Read one Bittensor subnet capability manifest by netuid. Use before previewing or invoking any direct subnet service.",
    inputSchema: {
      type: "object",
      properties: {
        netuid: { type: "number" },
      },
      required: ["netuid"],
    },
  },
  {
    name: "matterhorn_bittensor_adapter_canary_gate",
    description: "Inspect Bittensor subnet adapter capability evidence before a real adapter canary. Does not call the adapter service, sign, submit, or broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        netuid: { type: "number" },
        capability: { type: "object", description: "Optional capability manifest. If omitted, the configured Matterhorn server is queried by netuid." },
        allowedHosts: { type: "array", items: { type: "string" }, description: "Optional endpoint host allowlist." },
        allowMock: { type: "boolean", description: "Allow mock:// endpoints for local adapter tests." },
        requireConfigured: { type: "boolean", description: "Fail when the adapter is not configured." },
        strict: { type: "boolean", description: "When true, unsafe canary evidence raises an MCP error." },
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
    name: "matterhorn_bittensor_check_receipt",
    description: "Validate a post-signing Bittensor receipt and produce a safe public wallet diff follow-up prompt. Rejects raw signatures and signed payloads.",
    inputSchema: {
      type: "object",
      properties: {
        receipt: { type: "object", description: "Externally signed/submitted Bittensor receipt object." },
        expectedPayloadSha: { type: "string", description: "Optional payload SHA-256 from the original handoff." },
        expectedAction: { type: "string", description: "Optional expected action such as stake." },
        expectedNetuid: { type: "number", description: "Optional expected subnet netuid." },
        strict: { type: "boolean", description: "When true, receipts with P1 mismatches raise an MCP error." },
      },
      required: ["receipt"],
    },
  },
  {
    name: "matterhorn_bittensor_check_signing_handoff",
    description: "Validate a Bittensor external-signer handoff before a user signs it. Checks payload hash, expiry, action context, external-signer marker, and rejects credential or already-signed payload fields. Does not sign, submit, or broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        handoff: { type: "object", description: "External signer handoff object returned by Matterhorn Work." },
        expectedSha: { type: "string", description: "Optional expected payload SHA-256 from the unsigned preview." },
        expectedPayloadSha256: { type: "string", description: "Alias for expectedSha." },
        now: { type: "string", description: "Optional ISO timestamp override for deterministic checks." },
        strict: { type: "boolean", description: "When true, unsafe handoffs raise an MCP error instead of returning a not-ready summary." },
      },
      required: ["handoff"],
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
    description: "Preview a Bittensor subnet adapter call before invocation. First inspect the subnet capability manifest for adapter support, auth, cost, schemas, benefits, and safety notes; this preview returns request hash, warnings, and confirmation text.",
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
    description: "Invoke a supported Bittensor subnet adapter only after capability inspection, preview, explicit confirmation, and request SHA-256 verification.",
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
  {
    name: "matterhorn_bittensor_watch_digest",
    description: "Check Bittensor watches and return a compact agent-facing alert digest with next prompts/actions.",
    inputSchema: {
      type: "object",
      properties: {
        maxAlerts: { type: "number", description: "Optional positive alert cap. Defaults to 10 and is capped at 50." },
        includeOk: { type: "boolean", description: "When true, include ok evaluations after alert entries." },
      },
    },
  },
  {
    name: "matterhorn_bittensor_act_on_watch_alert",
    description: "Select one Bittensor watch alert and run its suggested public-data copilot prompt through Bittensor chat.",
    inputSchema: {
      type: "object",
      properties: {
        alertKey: { type: "string", description: "Optional alert key from matterhorn_bittensor_watch_digest." },
        alertIndex: { type: "number", description: "Optional zero-based alert index when alertKey is not provided. Defaults to 0." },
        actionIndex: { type: "number", description: "Optional zero-based copilot action index. Defaults to 0." },
      },
    },
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

function parsePositiveInteger(value, fallback, max, label = "maxEvents") {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return max ? Math.min(parsed, max) : parsed;
}

function parseNonNegativeInteger(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
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

function summarizeWatchEvaluation(evaluation) {
  const watch = evaluation?.watch || {};
  const copilotActions = Array.isArray(evaluation?.copilotActions) ? evaluation.copilotActions : [];
  const firstAction = copilotActions[0] || {};
  return {
    status: evaluation?.status || "unknown",
    alertKey: evaluation?.alertKey || null,
    notificationIntent: evaluation?.notificationIntent || null,
    watchId: watch.id || evaluation?.watchId || null,
    kind: watch.kind || evaluation?.kind || null,
    label: watch.label || evaluation?.label || null,
    netuid: watch.netuid ?? evaluation?.netuid ?? null,
    ss58Address: watch.ss58Address || evaluation?.ss58Address || null,
    validatorHotkey: watch.validatorHotkey || evaluation?.validatorHotkey || null,
    reason: evaluation?.reason || watch.reason || null,
    prompt: firstAction.prompt || evaluation?.prompt || null,
    actionLabel: firstAction.label || null,
  };
}

async function matterhornBittensorWatchDigest(args = {}) {
  const result = await callServer("/api/bittensor/monitoring/check");
  const evaluations = Array.isArray(result?.evaluations) ? result.evaluations : [];
  const maxAlerts = parsePositiveInteger(args.maxAlerts, 10, 50, "maxAlerts");
  const statusCounts = evaluations.reduce((counts, evaluation) => {
    const status = evaluation?.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const alertLike = evaluations.filter((evaluation) => {
    const status = evaluation?.status;
    return status && status !== "ok";
  });
  const okLike = args.includeOk === true
    ? evaluations.filter((evaluation) => (evaluation?.status || "unknown") === "ok")
    : [];
  const queue = [...alertLike, ...okLike].slice(0, maxAlerts).map(summarizeWatchEvaluation);
  return {
    ok: result?.success !== false,
    checkedAt: new Date().toISOString(),
    total: evaluations.length,
    alertCount: alertLike.length,
    statusCounts,
    alerts: queue,
    cards: result?.cards || [],
    source: "matterhorn_bittensor_check_watches",
  };
}

function selectWatchAlertAction(result, args = {}) {
  const evaluations = Array.isArray(result?.evaluations) ? result.evaluations : [];
  const alertLike = evaluations.filter((evaluation) => {
    const status = evaluation?.status;
    return status && status !== "ok";
  });
  const alertKey = typeof args.alertKey === "string" ? args.alertKey.trim() : "";
  const alertIndex = parseNonNegativeInteger(args.alertIndex, 0, "alertIndex");
  const actionIndex = parseNonNegativeInteger(args.actionIndex, 0, "actionIndex");
  const evaluation = alertKey
    ? alertLike.find((item) => item?.alertKey === alertKey)
    : alertLike[alertIndex];
  if (!evaluation) {
    throw new Error(alertKey ? `No Bittensor alert found for alertKey ${alertKey}.` : `No Bittensor alert found at alertIndex ${alertIndex}.`);
  }
  const actions = Array.isArray(evaluation?.copilotActions) ? evaluation.copilotActions : [];
  const action = actions[actionIndex];
  const prompt = typeof action?.prompt === "string" ? action.prompt.trim() : "";
  if (!prompt) {
    throw new Error(`Bittensor alert ${evaluation.alertKey || alertIndex} does not include a copilot action prompt at actionIndex ${actionIndex}.`);
  }
  const watch = evaluation.watch && typeof evaluation.watch === "object" ? evaluation.watch : {};
  return { evaluation, watch, action, prompt };
}

async function matterhornBittensorActOnWatchAlert(args = {}) {
  const result = await callServer("/api/bittensor/monitoring/check");
  const selected = selectWatchAlertAction(result, args);
  const chat = await callServer("/api/bittensor/chat/execute", {
    method: "POST",
    body: {
      message: selected.prompt,
      ...(typeof selected.watch.netuid === "number" ? { netuid: selected.watch.netuid } : {}),
      ...(typeof selected.watch.ss58Address === "string" ? { ss58Address: selected.watch.ss58Address } : {}),
      ...(typeof selected.watch.validatorHotkey === "string" ? { validatorHotkey: selected.watch.validatorHotkey } : {}),
    },
  });
  return {
    ok: chat?.success !== false,
    selectedAlert: summarizeWatchEvaluation(selected.evaluation),
    action: {
      label: selected.action?.label || null,
      prompt: selected.prompt,
    },
    chat,
    source: "matterhorn_bittensor_act_on_watch_alert",
  };
}

const CUSTOMER_EVIDENCE_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const CUSTOMER_EVIDENCE_FORBIDDEN_EXACT_KEY_RE = /^(signature)$/i;

function customerEvidenceArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertCustomerEvidenceHasNoCredentials(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertCustomerEvidenceHasNoCredentials(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (CUSTOMER_EVIDENCE_FORBIDDEN_EXACT_KEY_RE.test(key) || CUSTOMER_EVIDENCE_FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(label + " contains forbidden credential-shaped field: " + [...path, key].join("."));
    }
    assertCustomerEvidenceHasNoCredentials(child, label, [...path, key]);
  }
}

function customerEvidenceSummaryValue(report, key) {
  const value = report?.summary?.[key];
  return Number.isFinite(value) ? value : 0;
}

function customerEvidenceIsReady(report) {
  return report?.ready === true || report?.ok === true || report?.status === "ready";
}

function customerEvidenceStageLabel(stage) {
  return String(stage?.label || stage?.id || stage?.name || "").trim();
}

function customerEvidencePassedStages(report) {
  return customerEvidenceArray(report?.stages)
    .filter((stage) => /pass|ok|success/i.test(String(stage?.status || stage?.result || "")))
    .map(customerEvidenceStageLabel)
    .filter(Boolean)
    .slice(0, 12);
}

function customerEvidenceFailedStages(report) {
  return customerEvidenceArray(report?.stages)
    .filter((stage) => /fail|error/i.test(String(stage?.status || stage?.result || "")))
    .map(customerEvidenceStageLabel)
    .filter(Boolean);
}

function customerEvidenceCiItems(ci) {
  return [
    ...customerEvidenceArray(ci?.checks),
    ...customerEvidenceArray(ci?.statuses),
    ...customerEvidenceArray(ci?.workflow_runs),
    ...customerEvidenceArray(ci?.runs),
    ...customerEvidenceArray(ci?.jobs),
  ];
}

function customerEvidenceCiName(item) {
  return String(item?.name || item?.workflowName || item?.context || item?.check || item?.title || "").trim();
}

function customerEvidenceCiConclusion(item) {
  return String(item?.conclusion || item?.status || item?.state || "").toLowerCase();
}

function customerEvidenceSummarizeCi(ci) {
  const items = customerEvidenceCiItems(ci);
  return {
    total: items.length,
    passed: items.filter((item) => /success|completed|pass|passed/.test(customerEvidenceCiConclusion(item))).map(customerEvidenceCiName).filter(Boolean),
    failed: items.filter((item) => /failure|failed|error|cancelled|timed_out/.test(customerEvidenceCiConclusion(item))).map(customerEvidenceCiName).filter(Boolean),
    pending: items.filter((item) => /pending|queued|in_progress|running/.test(customerEvidenceCiConclusion(item))).map(customerEvidenceCiName).filter(Boolean),
  };
}

function customerEvidenceReadinessReady(value) {
  if (!value) return false;
  if (typeof value === "string") return /READY_FOR_TEST_CUSTOMERS|passes this evidence-backed Bittensor customer-readiness gate/i.test(value);
  return customerEvidenceIsReady(value) || value.result === "READY_FOR_TEST_CUSTOMERS";
}


function customerEvidenceAdapterCanarySummary(canary) {
  if (!canary || typeof canary !== "object") return null;
  const findings = customerEvidenceArray(canary.findings);
  const failCount = Number(canary.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(canary.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const ready = canary.readyForCanary === true || canary.ready === true || canary.status === "ready";
  return {
    ready,
    netuid: canary.netuid ?? null,
    serviceAdapter: canary.serviceAdapter || canary.adapter || "",
    detail: ready ? "Adapter canary gate says ready" : failCount + " failed, " + warnCount + " warnings",
    findings: findings.slice(0, 8).map((finding) => String(finding.area || "Finding") + ": " + String(finding.status || "unknown")),
  };
}

function customerEvidenceReadonlyAdapterCanarySummary(canary) {
  if (!canary || typeof canary !== "object") return null;
  const findings = customerEvidenceArray(canary.findings);
  const failCount = Number(canary.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(canary.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const ready = canary.ready === true || canary.status === "ready";
  return {
    ready,
    invoked: canary.invoked === true,
    netuid: canary.netuid ?? null,
    serviceAdapter: canary.serviceAdapter || canary.adapter || "",
    previewRequestSha256: canary.previewRequestSha256 || "",
    detail: ready ? "Read-only canary ready; invoked " + (canary.invoked === true ? "yes" : "no") : failCount + " failed, " + warnCount + " warnings",
    findings: findings.slice(0, 8).map((finding) => String(finding.area || "Finding") + ": " + String(finding.status || "unknown")),
  };
}

function customerEvidenceReceiptCheckSummary(receiptCheck) {
  if (!receiptCheck || typeof receiptCheck !== "object") return null;
  const findings = customerEvidenceArray(receiptCheck.findings);
  const failCount = Number(receiptCheck.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(receiptCheck.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const accepted = receiptCheck.accepted === true || receiptCheck.result === "RECEIPT_CAPTURED";
  const ready = accepted && failCount === 0;
  return {
    ready,
    accepted,
    txHash: String(receiptCheck.txHash || "").trim(),
    status: String(receiptCheck.status || "unknown").trim() || "unknown",
    action: String(receiptCheck.action || "unknown").trim() || "unknown",
    netuid: receiptCheck.netuid ?? null,
    detail: ready ? "Receipt check accepted; status " + String(receiptCheck.status || "unknown") : failCount + " failed, " + warnCount + " warnings",
    findings: findings.slice(0, 8).map((finding) => String(finding.area || "Finding") + ": " + String(finding.status || "unknown")),
    followUpPrompt: receiptCheck.followUpPrompt || "",
  };
}

function customerEvidenceWalletTimelineSummary(timeline) {
  if (!timeline || typeof timeline !== "object") return null;
  return {
    enabled: timeline.enabled !== false,
    snapshots: Number(timeline.snapshotCount ?? timeline.snapshots?.length ?? timeline.count ?? 0),
    latestSnapshotAt: timeline.latestSnapshotAt || timeline.latest?.capturedAt || timeline.latest?.timestamp || "",
  };
}

function customerEvidenceBullet(items) {
  return items.length ? items.map((item) => "- " + item).join("\n") : "None.";
}

function renderCustomerEvidenceMarkdown(summary, title) {
  const rows = [
    ["Bittensor live QA", summary.bittensor.ready ? "pass" : "fail", summary.bittensor.detail],
    ["Agent control live QA", summary.agentControl.ready ? "pass" : "warn", summary.agentControl.detail],
    ["Customer readiness gate", summary.readinessGate.ready ? "pass" : "warn", summary.readinessGate.detail],
    ["CI evidence", summary.ci.failed.length === 0 && summary.ci.pending.length === 0 && summary.ci.total > 0 ? "pass" : "warn", summary.ci.passed.length + " passed, " + summary.ci.failed.length + " failed, " + summary.ci.pending.length + " pending"],
    ["Wallet timeline", summary.walletTimeline ? "pass" : "warn", summary.walletTimeline ? summary.walletTimeline.snapshots + " public snapshots" : "No wallet timeline evidence provided"],
    ["Adapter canary", summary.adapterCanary ? (summary.adapterCanary.ready ? "pass" : "warn") : "warn", summary.adapterCanary ? summary.adapterCanary.detail : summary.requireAdapterCanary ? "Adapter canary evidence required but missing" : "No adapter canary evidence provided"],
    ["Read-only adapter canary", summary.readonlyAdapterCanary ? (summary.readonlyAdapterCanary.ready ? "pass" : "warn") : "warn", summary.readonlyAdapterCanary ? summary.readonlyAdapterCanary.detail : summary.requireReadonlyAdapterCanary ? "Read-only adapter canary evidence required but missing" : "No read-only adapter canary evidence provided"],
    ["Receipt check", summary.receiptCheck ? (summary.receiptCheck.ready ? "pass" : "warn") : "warn", summary.receiptCheck ? summary.receiptCheck.detail : summary.requireReceiptCheck ? "Receipt check evidence required but missing" : "No post-signer receipt check evidence provided"],
  ];
  return [
    "# " + title,
    "",
    "## Decision",
    "",
    "- Result: " + (summary.ready ? "READY_FOR_TEST_CUSTOMERS" : "NEEDS_MORE_EVIDENCE"),
    "- Generated at: " + summary.generatedAt,
    "- Safety posture: non-custodial, public wallet reads only, unsigned previews and external signer handoff only.",
    "- Redaction posture: this MCP bundle rejects credential-shaped fields and does not need local evidence paths.",
    "",
    "## Gate Summary",
    "",
    "| Area | Status | Detail |",
    "| --- | --- | --- |",
    ...rows.map(([area, status, detail]) => "| " + area + " | " + status + " | " + String(detail || "").replace(/\|/g, "\\|") + " |"),
    "",
    "## Covered Bittensor Paths",
    "",
    customerEvidenceBullet(summary.bittensor.passedStages),
    "",
    "## Open Bittensor Failures",
    "",
    customerEvidenceBullet(summary.bittensor.failedStages),
    "",
  ].join("\n");
}

function matterhornBittensorCustomerEvidenceBundle(args = {}) {
  assertCustomerEvidenceHasNoCredentials(args, "Bittensor customer evidence bundle");
  const bittensor = args.bittensorLiveQa || null;
  const agentControl = args.agentControlLiveQa || null;
  const ci = args.ci || null;
  const readinessGate = args.readinessGate || "";
  const ciSummary = customerEvidenceSummarizeCi(ci);
  const bittensorReady = customerEvidenceIsReady(bittensor) && customerEvidenceSummaryValue(bittensor, "fail") === 0;
  const agentReady = !agentControl || (customerEvidenceIsReady(agentControl) && customerEvidenceSummaryValue(agentControl, "fail") === 0);
  const gateReady = customerEvidenceReadinessReady(readinessGate);
  const adapterCanary = customerEvidenceAdapterCanarySummary(args.adapterCanary);
  const readonlyAdapterCanary = customerEvidenceReadonlyAdapterCanarySummary(args.readonlyAdapterCanary);
  const receiptCheck = customerEvidenceReceiptCheckSummary(args.receiptCheck);
  const adapterReady = args.requireAdapterCanary === true ? adapterCanary?.ready === true : true;
  const readonlyAdapterReady = args.requireReadonlyAdapterCanary === true ? readonlyAdapterCanary?.ready === true : true;
  const receiptReady = args.requireReceiptCheck === true ? receiptCheck?.ready === true : true;
  const summary = {
    generatedAt: new Date().toISOString(),
    ready: Boolean(bittensorReady && agentReady && gateReady && adapterReady && readonlyAdapterReady && receiptReady && ciSummary.failed.length === 0 && ciSummary.pending.length === 0 && ciSummary.total > 0),
    requireAdapterCanary: args.requireAdapterCanary === true,
    requireReadonlyAdapterCanary: args.requireReadonlyAdapterCanary === true,
    requireReceiptCheck: args.requireReceiptCheck === true,
    bittensor: {
      ready: bittensorReady,
      detail: bittensor ? customerEvidenceSummaryValue(bittensor, "pass") + " passed, " + customerEvidenceSummaryValue(bittensor, "fail") + " failed, " + customerEvidenceSummaryValue(bittensor, "skip") + " skipped" : "Missing Bittensor evidence",
      passedStages: customerEvidencePassedStages(bittensor),
      failedStages: customerEvidenceFailedStages(bittensor),
    },
    agentControl: {
      ready: agentReady,
      detail: agentControl ? customerEvidenceSummaryValue(agentControl, "pass") + " passed, " + customerEvidenceSummaryValue(agentControl, "fail") + " failed" : "No agent-control evidence provided",
    },
    ci: ciSummary,
    readinessGate: {
      ready: gateReady,
      detail: gateReady ? "Readiness gate says ready" : "Readiness gate does not say ready",
    },
    walletTimeline: customerEvidenceWalletTimelineSummary(args.walletTimeline),
    adapterCanary,
    readonlyAdapterCanary,
    receiptCheck,
  };
  return {
    ok: true,
    ready: summary.ready,
    summary,
    markdown: renderCustomerEvidenceMarkdown(summary, args.title || "Matterhorn Work Bittensor Customer Evidence Bundle"),
    safety: {
      custody: "none",
      acceptsCredentialMaterial: false,
      signsOrBroadcasts: false,
      source: "matterhorn_bittensor_customer_evidence_bundle",
    },
  };
}

const BITTENSOR_HANDOFF_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|signedPayload|signed_payload)/i;
const BITTENSOR_HANDOFF_FORBIDDEN_EXACT_KEY_RE = /^(signature|signedExtrinsic|signed_extrinsic|signedPayload|signed_payload)$/i;

function bittensorHandoffObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertBittensorHandoffHasNoSigningMaterial(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertBittensorHandoffHasNoSigningMaterial(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BITTENSOR_HANDOFF_FORBIDDEN_EXACT_KEY_RE.test(key) || BITTENSOR_HANDOFF_FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(label + " contains forbidden signing or credential field: " + [...path, key].join("."));
    }
    assertBittensorHandoffHasNoSigningMaterial(child, label, [...path, key]);
  }
}

function bittensorHandoffEnvelope(input) {
  const root = bittensorHandoffObject(input);
  return bittensorHandoffObject(root.handoff).payloadSha256 ? bittensorHandoffObject(root.handoff) : root;
}

function normalizeBittensorHandoffSha(value) {
  return String(value || "").trim().toLowerCase();
}

function isBittensorHandoffSha256(value) {
  return /^[a-f0-9]{64}$/.test(normalizeBittensorHandoffSha(value));
}

function addBittensorHandoffFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function checkBittensorHandoffExpiry(value, now) {
  if (!value) return { status: "warn", detail: "No expiry timestamp is present." };
  const expiresAtMs = Date.parse(value);
  if (!Number.isFinite(expiresAtMs)) return { status: "fail", detail: "Expiry is not a valid timestamp: " + value };
  if (expiresAtMs <= now.getTime()) return { status: "fail", detail: "Handoff expired at " + value + "." };
  return { status: "pass", detail: "Handoff expires at " + value + "." };
}

function countBittensorHandoffFindings(findings, status) {
  return findings.filter((finding) => finding.status === status).length;
}

function escapeBittensorHandoffCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function renderBittensorSigningHandoffMarkdown(summary) {
  const rows = summary.findings
    .map((finding) => "| " + escapeBittensorHandoffCell(finding.status) + " | " + escapeBittensorHandoffCell(finding.area) + " | " + escapeBittensorHandoffCell(finding.detail) + " | " + escapeBittensorHandoffCell(finding.severity || "-") + " |")
    .join("\n");
  return [
    "# Matterhorn Work Bittensor Signing Handoff Check",
    "",
    "## Decision",
    "",
    "- Result: " + (summary.readyToSign ? "READY_FOR_EXTERNAL_SIGNER" : "DO_NOT_SIGN"),
    "- Safety posture: this MCP tool validates an unsigned handoff only. Matterhorn still does not import keys, sign payloads, submit, or broadcast by default.",
    "",
    "## Handoff Summary",
    "",
    "- Payload SHA-256: " + (summary.payloadSha256 || "missing"),
    "- Action: " + (summary.action || "unknown"),
    "- Netuid: " + (summary.netuid ?? "unknown"),
    "- Amount TAO: " + (summary.amountTao ?? "unknown"),
    "- Expires at: " + (summary.expiresAt || "missing"),
    "",
    "## Checks",
    "",
    "| Status | Area | Detail | Severity |",
    "| --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function matterhornBittensorCheckSigningHandoff(args = {}) {
  const input = args.handoff;
  if (!input || typeof input !== "object") throw new Error("handoff object is required.");
  assertBittensorHandoffHasNoSigningMaterial(input, "Bittensor signing handoff");
  const handoff = bittensorHandoffEnvelope(input);
  const preview = bittensorHandoffObject(input.preview || handoff.preview || handoff.unsignedPreview);
  const payloadSha256 = normalizeBittensorHandoffSha(handoff.payloadSha256 || handoff.requestSha256 || input.payloadSha256);
  const expectedSha = normalizeBittensorHandoffSha(args.expectedSha || args.expectedPayloadSha256);
  const now = args.now ? new Date(args.now) : new Date();
  const findings = [];

  if (isBittensorHandoffSha256(payloadSha256)) addBittensorHandoffFinding(findings, "pass", "Payload hash", "Payload SHA-256 is present and well formed.");
  else addBittensorHandoffFinding(findings, "fail", "Payload hash", "Missing or invalid 64-character payload SHA-256.", "P1");

  if (expectedSha) {
    if (!isBittensorHandoffSha256(expectedSha)) addBittensorHandoffFinding(findings, "fail", "Expected hash", "Expected payload SHA-256 is not valid.", "P1");
    else if (expectedSha !== payloadSha256) addBittensorHandoffFinding(findings, "fail", "Expected hash", "Expected payload SHA-256 does not match the handoff payload SHA-256.", "P1");
    else addBittensorHandoffFinding(findings, "pass", "Expected hash", "Expected payload SHA-256 matches the handoff.");
  }

  const expiry = checkBittensorHandoffExpiry(handoff.expiresAt || input.expiresAt, now);
  addBittensorHandoffFinding(findings, expiry.status, "Expiry", expiry.detail, expiry.status === "fail" ? "P1" : expiry.status === "warn" ? "P2" : "");

  if (preview.action || handoff.action || input.action) addBittensorHandoffFinding(findings, "pass", "Action context", "Action context is present.");
  else addBittensorHandoffFinding(findings, "warn", "Action context", "No action context was found in the handoff.", "P2");

  if (preview.requiresExternalSignature === true || handoff.requiresExternalSignature === true || input.requiresExternalSignature === true) {
    addBittensorHandoffFinding(findings, "pass", "External signer", "Handoff explicitly requires an external signer.");
  } else {
    addBittensorHandoffFinding(findings, "warn", "External signer", "Handoff does not explicitly mark external signer requirement.", "P2");
  }

  const readyToSign = countBittensorHandoffFindings(findings, "fail") === 0;
  const summary = {
    ok: true,
    readyToSign,
    payloadSha256,
    action: preview.action || handoff.action || input.action || "",
    netuid: preview.netuid ?? handoff.netuid ?? input.netuid ?? null,
    amountTao: preview.amountTao ?? handoff.amountTao ?? input.amountTao ?? null,
    expiresAt: handoff.expiresAt || input.expiresAt || "",
    findings,
    summary: {
      pass: countBittensorHandoffFindings(findings, "pass"),
      warn: countBittensorHandoffFindings(findings, "warn"),
      fail: countBittensorHandoffFindings(findings, "fail"),
    },
    safety: {
      custody: "none",
      acceptsCredentialMaterial: false,
      signsOrBroadcasts: false,
      source: "matterhorn_bittensor_check_signing_handoff",
    },
  };
  const result = { ...summary, markdown: renderBittensorSigningHandoffMarkdown(summary) };
  if (args.strict === true && !readyToSign) throw new Error("Bittensor signing handoff is not safe to sign.");
  return result;
}


const ADAPTER_CANARY_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signature|signedPayload|signed_payload)/i;

function assertAdapterCanaryNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertAdapterCanaryNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (ADAPTER_CANARY_FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(label + " contains forbidden credential or signing field: " + [...path, key].join("."));
    }
    assertAdapterCanaryNoForbiddenKeys(child, label, [...path, key]);
  }
}

function adapterCanaryAddFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function adapterCanaryEndpointOf(capability) {
  return capability.endpoint || capability.serviceEndpoint || capability.adapter?.endpoint || capability.adapterStatus?.endpoint || "";
}

function adapterCanaryConfiguredOf(capability) {
  if (typeof capability.adapterStatus?.configured === "boolean") return capability.adapterStatus.configured;
  if (typeof capability.configured === "boolean") return capability.configured;
  return Boolean(adapterCanaryEndpointOf(capability) && capability.serviceAdapter && capability.serviceAdapter !== "none");
}

function adapterCanaryCheckEndpoint(endpoint, findings, args) {
  const allowedHosts = Array.isArray(args.allowedHosts) ? args.allowedHosts.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!endpoint) {
    adapterCanaryAddFinding(findings, "warn", "Endpoint", "No adapter endpoint is exposed in the capability manifest.", "P2");
    return;
  }
  if (String(endpoint).startsWith("mock://")) {
    if (args.allowMock === true) adapterCanaryAddFinding(findings, "pass", "Endpoint", "mock:// endpoint allowed for local adapter tests.");
    else adapterCanaryAddFinding(findings, "fail", "Endpoint", "mock:// endpoint is not allowed for a real canary without allowMock.", "P1");
    return;
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    adapterCanaryAddFinding(findings, "fail", "Endpoint", "Endpoint is not a valid URL: " + endpoint, "P1");
    return;
  }
  if (parsed.protocol !== "https:") adapterCanaryAddFinding(findings, "fail", "Endpoint", "Real adapter endpoint must use https:, received " + parsed.protocol, "P1");
  else if (allowedHosts.length && !allowedHosts.includes(parsed.hostname)) adapterCanaryAddFinding(findings, "fail", "Endpoint allowlist", parsed.hostname + " is not in allowedHosts.", "P1");
  else adapterCanaryAddFinding(findings, "pass", "Endpoint", "Endpoint host " + parsed.hostname + " is allowed.");
}

function adapterCanarySummarizeCapability(capability, args = {}) {
  assertAdapterCanaryNoForbiddenKeys(capability, "Bittensor adapter canary capability");
  const findings = [];
  const endpoint = adapterCanaryEndpointOf(capability);
  const configured = adapterCanaryConfiguredOf(capability);
  const serviceAdapter = capability.serviceAdapter || capability.adapter?.type || "";
  const netuid = Number(args.netuid);

  if (Number(capability.netuid) === netuid) adapterCanaryAddFinding(findings, "pass", "Netuid", "Capability netuid " + capability.netuid + " matches.");
  else adapterCanaryAddFinding(findings, "fail", "Netuid", "Expected netuid " + netuid + ", received " + (capability.netuid ?? "missing") + ".", "P1");
  if (serviceAdapter && serviceAdapter !== "none") adapterCanaryAddFinding(findings, "pass", "Adapter", "Service adapter is " + serviceAdapter + ".");
  else adapterCanaryAddFinding(findings, "fail", "Adapter", "No service adapter is declared.", "P1");
  if (configured) adapterCanaryAddFinding(findings, "pass", "Configuration", "Adapter is marked configured or exposes an endpoint.");
  else if (args.requireConfigured === true) adapterCanaryAddFinding(findings, "fail", "Configuration", "Adapter is not configured.", "P1");
  else adapterCanaryAddFinding(findings, "warn", "Configuration", "Adapter is not configured yet.", "P2");

  adapterCanaryCheckEndpoint(endpoint, findings, args);
  if (capability.requiredAuth && capability.requiredAuth !== "none") adapterCanaryAddFinding(findings, "warn", "Authentication", "Adapter requires " + capability.requiredAuth + "; verify server-side credential handling before canary.", "P2");
  else adapterCanaryAddFinding(findings, "pass", "Authentication", "No adapter authentication is required or exposed to the client.");
  if (/free|read/i.test(String(capability.costModel || ""))) adapterCanaryAddFinding(findings, "pass", "Cost model", "Cost model is " + capability.costModel + ".");
  else adapterCanaryAddFinding(findings, "warn", "Cost model", "Review cost model before customer canary: " + (capability.costModel || "missing") + ".", "P2");

  const readyForCanary = findings.every((finding) => finding.status !== "fail");
  return {
    ok: true,
    readyForCanary,
    netuid,
    serviceAdapter,
    configured,
    findings,
    summary: {
      pass: findings.filter((finding) => finding.status === "pass").length,
      warn: findings.filter((finding) => finding.status === "warn").length,
      fail: findings.filter((finding) => finding.status === "fail").length,
    },
    safety: {
      callsAdapterService: false,
      signsOrBroadcasts: false,
      acceptsCredentialMaterial: false,
      source: "matterhorn_bittensor_adapter_canary_gate",
    },
  };
}

async function matterhornBittensorAdapterCanaryGate(args = {}) {
  const rawCapability = args.capability || await callServer(`/api/bittensor/capabilities/${encodeURIComponent(String(args.netuid))}`);
  const capability = rawCapability.capability || rawCapability;
  const result = adapterCanarySummarizeCapability(capability, args);
  if (args.strict === true && !result.readyForCanary) throw new Error("Bittensor adapter canary gate is not ready.");
  return result;
}


const BITTENSOR_RECEIPT_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const BITTENSOR_RECEIPT_FORBIDDEN_EXACT_KEY_RE = /^(signature)$/i;

function receiptObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertBittensorReceiptNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertBittensorReceiptNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BITTENSOR_RECEIPT_FORBIDDEN_EXACT_KEY_RE.test(key) || BITTENSOR_RECEIPT_FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(label + " contains forbidden signing or credential field: " + [...path, key].join("."));
    }
    assertBittensorReceiptNoForbiddenKeys(child, label, [...path, key]);
  }
}

function receiptNormalizeSha(value) {
  return String(value || "").trim().toLowerCase();
}

function receiptIsSha256(value) {
  return /^[a-f0-9]{64}$/.test(receiptNormalizeSha(value));
}

function receiptIsHash(value) {
  return /^0x[a-f0-9]{64}$/i.test(String(value || "").trim());
}

function receiptAddFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function receiptEnvelope(input) {
  const root = receiptObject(input);
  return receiptObject(root.receipt).txHash || receiptObject(root.result).txHash ? receiptObject(root.receipt || root.result) : root;
}

function receiptStatusOf(receipt) {
  return String(receipt.status || receipt.result || receipt.state || "").toLowerCase();
}

function receiptSucceeded(status) {
  return /finalized|success|submitted|in_block|included|broadcast/.test(status);
}

function matterhornBittensorCheckReceipt(args = {}) {
  if (!args.receipt || typeof args.receipt !== "object") throw new Error("receipt object is required.");
  assertBittensorReceiptNoForbiddenKeys(args.receipt, "Bittensor receipt");
  const receipt = receiptEnvelope(args.receipt);
  const payloadSha256 = receiptNormalizeSha(receipt.payloadSha256 || receipt.requestSha256 || args.receipt.payloadSha256);
  const expectedPayloadSha = receiptNormalizeSha(args.expectedPayloadSha || args.expectedSha);
  const txHash = String(receipt.txHash || receipt.hash || "").trim();
  const blockHash = String(receipt.blockHash || receipt.block || "").trim();
  const status = receiptStatusOf(receipt);
  const action = String(receipt.action || receiptObject(receipt.preview).action || args.receipt.action || "").trim();
  const netuid = receipt.netuid ?? receiptObject(receipt.preview).netuid ?? args.receipt.netuid ?? null;
  const findings = [];

  if (txHash && receiptIsHash(txHash)) receiptAddFinding(findings, "pass", "Transaction hash", "Transaction hash is present and well formed.");
  else receiptAddFinding(findings, "warn", "Transaction hash", "Transaction hash is missing or not a 0x-prefixed 32-byte hash.", "P2");
  if (blockHash) receiptAddFinding(findings, receiptIsHash(blockHash) ? "pass" : "warn", "Block hash", receiptIsHash(blockHash) ? "Block hash is present and well formed." : "Block hash is present but malformed.", receiptIsHash(blockHash) ? "" : "P2");
  else receiptAddFinding(findings, "warn", "Block hash", "No block hash is present yet; receipt may not be finalized.", "P2");
  if (receiptSucceeded(status)) receiptAddFinding(findings, "pass", "Status", "Receipt status is " + status + ".");
  else receiptAddFinding(findings, "warn", "Status", "Receipt status needs review: " + (status || "missing") + ".", "P2");

  if (expectedPayloadSha) {
    if (!receiptIsSha256(expectedPayloadSha)) receiptAddFinding(findings, "fail", "Expected payload hash", "Expected payload SHA-256 is invalid.", "P1");
    else if (expectedPayloadSha !== payloadSha256) receiptAddFinding(findings, "fail", "Payload hash", "Receipt payload SHA-256 does not match the original handoff.", "P1");
    else receiptAddFinding(findings, "pass", "Payload hash", "Receipt payload SHA-256 matches the original handoff.");
  } else if (payloadSha256) {
    receiptAddFinding(findings, receiptIsSha256(payloadSha256) ? "pass" : "warn", "Payload hash", receiptIsSha256(payloadSha256) ? "Payload SHA-256 is present." : "Payload SHA-256 is malformed.", receiptIsSha256(payloadSha256) ? "" : "P2");
  } else {
    receiptAddFinding(findings, "warn", "Payload hash", "No payload SHA-256 is present to connect receipt to handoff.", "P2");
  }
  if (args.expectedAction) {
    if (action === args.expectedAction) receiptAddFinding(findings, "pass", "Action", "Action matches " + args.expectedAction + ".");
    else receiptAddFinding(findings, "fail", "Action", "Expected action " + args.expectedAction + ", received " + (action || "missing") + ".", "P1");
  }
  if (args.expectedNetuid !== undefined) {
    if (String(netuid) === String(args.expectedNetuid)) receiptAddFinding(findings, "pass", "Netuid", "Netuid matches " + args.expectedNetuid + ".");
    else receiptAddFinding(findings, "fail", "Netuid", "Expected netuid " + args.expectedNetuid + ", received " + (netuid ?? "missing") + ".", "P1");
  }

  const accepted = findings.every((finding) => finding.status !== "fail");
  const followUpPrompt = netuid !== null
    ? "Use Bittensor chat mode. Compare my public wallet state after this " + (action || "Bittensor") + " receipt on subnet " + netuid + ". Explain what changed, source freshness, and any safe next steps without asking for seed phrases or private keys."
    : "Use Bittensor chat mode. Review this Bittensor receipt and compare my public wallet state after finality. Explain what changed and any safe next steps without asking for seed phrases or private keys.";
  const result = {
    ok: true,
    accepted,
    txHash,
    blockHash,
    payloadSha256,
    status,
    action,
    netuid,
    findings,
    followUpPrompt,
    summary: {
      pass: findings.filter((finding) => finding.status === "pass").length,
      warn: findings.filter((finding) => finding.status === "warn").length,
      fail: findings.filter((finding) => finding.status === "fail").length,
    },
    safety: {
      custody: "none",
      acceptsCredentialMaterial: false,
      acceptsRawSignatures: false,
      storesSignedPayloads: false,
      source: "matterhorn_bittensor_check_receipt",
    },
  };
  if (args.strict === true && !accepted) throw new Error("Bittensor receipt needs review.");
  return result;
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
    case "matterhorn_bittensor_customer_evidence_bundle":
      return matterhornBittensorCustomerEvidenceBundle(args);
    case "matterhorn_bittensor_list_capabilities":
      return callServer("/api/bittensor/capabilities");
    case "matterhorn_bittensor_get_subnet_capability":
      return callServer(`/api/bittensor/capabilities/${encodeURIComponent(String(args.netuid))}`);
    case "matterhorn_bittensor_adapter_canary_gate":
      return matterhornBittensorAdapterCanaryGate(args);
    case "matterhorn_bittensor_prepare_extrinsic":
      return callServer("/api/bittensor/extrinsics/prepare", { method: "POST", body: args });
    case "matterhorn_bittensor_create_signing_handoff":
      return callServer("/api/bittensor/extrinsics/handoff", { method: "POST", body: args });
    case "matterhorn_bittensor_check_receipt":
      return matterhornBittensorCheckReceipt(args);
    case "matterhorn_bittensor_check_signing_handoff":
      return matterhornBittensorCheckSigningHandoff(args);
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
    case "matterhorn_bittensor_watch_digest":
      return matterhornBittensorWatchDigest(args);
    case "matterhorn_bittensor_act_on_watch_alert":
      return matterhornBittensorActOnWatchAlert(args);
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
