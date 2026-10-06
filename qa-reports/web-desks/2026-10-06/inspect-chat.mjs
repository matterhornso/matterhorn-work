// Read-only, account-scoped evidence. No prompts, responses or credentials emitted.
// Schemas: session-read-model.ts; SDK v2 ToolPart; guarded-agent-runtime.ts receipts.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const reportDirectory = dirname(fileURLToPath(import.meta.url));
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = value => Array.isArray(value) ? value : [];
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const choice = (value, choices) => choices.includes(value) ? value : undefined;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_.:/-]{1,128}$/.test(value) ? value : undefined;
const numericFields = (value, keys) => Object.fromEntries(keys.map(key => [key, number(object(value)[key])]).filter(([, value]) => value !== undefined));
const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined;
const toolName = value => typeof value === "string" && /^(?:matterhorn-work_)?matterhorn_(?:(?:hyperliquid|polymarket|sui|bittensor|crypto)_[a-z_]{1,60}|prediction_markets_search)$/.test(value) ? value : "unrecognized_tool";

function source(value) {
  if (["hyperliquid.info", "sui.grpc", "matterhorn_local_preview", "bittensor.sidecar", "bittensor-subtensor", "subtensor"].includes(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    if (!["gamma-api.polymarket.com", "clob.polymarket.com", "api.hyperliquid.xyz", "api.hyperliquid-testnet.xyz"].includes(url.hostname)) return undefined;
    if (!/^\/(?:public-search|markets(?:\/\d+)?|events|book|info)?$/.test(url.pathname)) return undefined;
    return url.origin + url.pathname;
  } catch { return undefined; }
}

function evidenceMetadata(value, depth = 0) {
  if (depth > 7 || !value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = object(value);
  const found = {
    source: source(data.source) ?? source(data.upstreamSource),
    freshness: choice(data.freshness, ["live", "recent", "stale", "fallback", "unknown"]),
    observedAt: timestamp(data.upstreamObservedAt) ?? timestamp(data.observedAt) ?? timestamp(data.fetchedAt),
    network: choice(data.network, ["mainnet", "testnet", "devnet", "localnet"]),
  };
  // Only known structural containers, never arbitrary strings, inputs, titles, or errors.
  for (const key of ["structuredContent", "observation", "source", "result", "object", "balance", "account", "funding", "orderbook", "market", "evidence", "metadata"]) {
    const nested = evidenceMetadata(data[key], depth + 1);
    for (const field of Object.keys(found)) found[field] ??= nested[field];
  }
  return Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined));
}

function snapshotTool(part) {
  const state = object(part.state);
  let output = {};
  if (typeof state.output === "string" && state.output.length <= 262144) {
    try { output = object(JSON.parse(state.output)); } catch { /* No text extraction or raw output fallback. */ }
  }
  return { name: toolName(part.tool), status: choice(state.status, ["pending", "running", "completed", "error"]),
    ...evidenceMetadata(part.metadata), ...evidenceMetadata(state.metadata), ...evidenceMetadata(output) };
}

export function sanitizeChatEvidence({ workspaceId, sessionId, snapshot, receipts, usage }) {
  const tools = array(snapshot?.item?.messages).flatMap(message => array(message.parts).filter(part => part.type === "tool").map(snapshotTool));
  return { version: 1, capturedAt: new Date().toISOString(), workspaceId, sessionId,
    scope: "Normal-account GET-only snapshot of an isolated local runtime. Model completion is not proof that requested tool work succeeded.",
    snapshotStatus: choice(snapshot?.item?.status?.type, ["idle", "busy", "retry"]),
    messages: array(snapshot?.item?.messages).map(message => ({
      role: choice(message.info?.role, ["user", "assistant"]), modelId: identifier(message.info?.modelID),
      completed: Boolean(number(message.info?.time?.completed)),
      finish: choice(message.info?.finish, ["stop", "length", "tool-calls", "content-filter", "error", "other", "unknown"]),
      tokens: { ...numericFields(message.info?.tokens, ["total", "input", "output", "reasoning"]), cache: numericFields(message.info?.tokens?.cache, ["read", "write"]) },
      errorName: choice(message.info?.error?.name, ["ProviderAuthError", "UnknownError", "MessageOutputLengthError", "MessageAbortedError", "StructuredOutputError", "ContextOverflowError", "ContentFilterError", "APIError"]),
    })), tools,
    toolCounts: { total: tools.length, completed: tools.filter(tool => tool.status === "completed").length, errors: tools.filter(tool => tool.status === "error").length },
    receipts: array(receipts?.items).map(item => ({ runId: identifier(item.runId),
      status: choice(item.status, ["pending", "success", "partial", "cancelled", "error"]),
      model: identifier(item.provider?.modelId),
      usage: numericFields(item.usage, ["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens", "cacheWriteTokens", "estimatedCostUsd"]),
      privacyMode: choice(item.privacy?.mode, ["public", "public_research", "private_workspace", "transaction"]),
      tools: array(item.tools).map(tool => ({ name: toolName(tool.name), status: choice(tool.outcome, ["success", "error", "timeout", "denied"]), ...evidenceMetadata(tool) })),
    })),
    usage: { pendingRequests: number(usage?.status?.pendingRequests),
      daily: numericFields(usage?.status?.daily, ["usedTokens", "reservedTokens", "chargedTokens", "limit", "remainingTokens"]),
      monthly: numericFields(usage?.status?.monthly, ["usedTokens", "reservedTokens", "chargedTokens", "limit", "remainingTokens"]) },
    safety: { requestMethod: "GET", newModelRequests: 0, adminCredentialsUsed: false, rawContentPersisted: false },
  };
}

export function assertCancelledBeforeDispatch(report) {
  const checks = {
    sessionIdle: report.snapshotStatus === "idle",
    noRuntimeMessages: report.messages.length === 0,
    noRunReceipts: report.receipts.length === 0,
    noToolCalls: report.toolCounts.total === 0,
    noAccountPendingRequests: report.usage.pendingRequests === 0,
    noDailyTokenHold: report.usage.daily.reservedTokens === 0,
    noMonthlyTokenHold: report.usage.monthly.reservedTokens === 0,
  };
  assert(Object.values(checks).every(Boolean), "Cancellation evidence did not meet the pre-dispatch checks");
  return { capturedAt: report.capturedAt, sessionId: report.sessionId, status: "passed", checks,
    scope: "No provider dispatch is observed in the normal-account runtime snapshot or run receipts, and account-level pending requests and reserved tokens are zero. This is not a direct provider-log audit." };
}

async function main() {
  const [root, workspaceId, sessionId, outputPath] = process.argv.slice(2);
  assert(/^matterhorn-pr1032-functional-[A-Za-z0-9]+$/.test(basename(root ?? "")));
  assert(/^ws_web_[a-f0-9]+$/.test(workspaceId ?? ""));
  assert(/^ses_[A-Za-z0-9]+$/.test(sessionId ?? ""));
  if (outputPath) assert(dirname(resolve(outputPath)) === reportDirectory && /^[a-z0-9-]+\.json$/.test(basename(outputPath)));
  const runtime = JSON.parse(readFileSync(join(root, "runtime.json"), "utf8"));
  const account = JSON.parse(readFileSync(join(root, "private-ui-account.json"), "utf8"));
  const origin = new URL(runtime.url);
  assert.equal(origin.protocol, "http:");
  assert(["desks-qa.localhost", "approval-qa.localhost", "final-qa.localhost"].includes(origin.hostname));
  assert(!origin.username && !origin.password && origin.port);
  assert(typeof account.cookie === "string" && account.cookie && !/[\r\n]/.test(account.cookie));
  const transport = new URL(origin);
  transport.hostname = "127.0.0.1";
  async function get(path) {
    const response = await fetch(new URL(path, transport), {
      headers: { host: origin.host, origin: origin.origin, cookie: account.cookie },
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    assert.equal(response.status, 200, "Unexpected status on account evidence route");
    return response.json();
  }
  const base = `/workspace/${workspaceId}`;
  const snapshot = await get(`${base}/sessions/${sessionId}/snapshot`);
  const receipts = await get(`${base}/agent-run-receipts?sessionId=${encodeURIComponent(sessionId)}`);
  const usage = await get(`${base}/model-usage/status`);
  const report = sanitizeChatEvidence({ workspaceId, sessionId, snapshot, receipts, usage });
  if (outputPath) writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Account evidence capture failed; raw response and credentials omitted."); process.exitCode = 1; });
}
