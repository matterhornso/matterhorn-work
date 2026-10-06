import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeChatEvidence, assertCancelledBeforeDispatch } from "./inspect-chat.mjs";

test("projects tool evidence without retaining prompt, output, input, retry text, or credential-shaped metadata", () => {
  const secret = "PRIVATE_SENTINEL_DO_NOT_PERSIST";
  const report = sanitizeChatEvidence({ workspaceId: "ws_web_fixture", sessionId: "ses_fixture",
    snapshot: { item: { status: { type: "retry", message: secret }, messages: [{
      info: { role: "assistant", modelID: "fixture-model", time: { completed: 42 }, tokens: { input: 12, output: 3, extra: secret } },
      parts: [{ type: "text", text: secret }, { type: "tool", tool: "matterhorn-work_matterhorn_hyperliquid_get_funding", state: {
        status: "completed", input: { password: secret }, metadata: { secret }, output: JSON.stringify({ summary: secret,
          funding: { source: { source: "hyperliquid.info", fetchedAt: "2026-10-06T00:00:00.000Z", freshness: "live" } } }),
      } }, { type: "tool", tool: "matterhorn_sui_get_balance", state: { status: "error", error: secret,
        metadata: { source: `https://clob.polymarket.com/book?token=${secret}`, network: "testnet" } } }],
    }] } }, receipts: { items: [] }, usage: { status: {} } });
  assert(!JSON.stringify(report).includes(secret));
  assert.deepEqual(report.tools[0], { name: "matterhorn-work_matterhorn_hyperliquid_get_funding", status: "completed", source: "hyperliquid.info", freshness: "live", observedAt: "2026-10-06T00:00:00.000Z" });
  assert.deepEqual(report.tools[1], { name: "matterhorn_sui_get_balance", status: "error", network: "testnet" });
  assert.deepEqual(report.toolCounts, { total: 2, completed: 1, errors: 1 });
});

test("a successful model receipt does not become tool acceptance when no tools ran", () => {
  const report = sanitizeChatEvidence({ sessionId: "ses_fixture", workspaceId: "ws_web_fixture", snapshot: { item: { status: { type: "idle" }, messages: [] } },
    receipts: { items: [{ runId: "run_fixture", status: "success", provider: { modelId: "fixture" }, usage: { inputTokens: 1, outputTokens: 2, arbitrary: "private" }, tools: [] }] }, usage: {} });
  assert.equal(report.receipts[0].status, "success");
  assert.equal(report.toolCounts.total, 0);
  assert(!JSON.stringify(report).includes("private"));
  assert(!Object.hasOwn(report, "passed"));
});

test("recognizes the exact public cross-venue search without admitting arbitrary tools", () => {
  const report = sanitizeChatEvidence({ snapshot: { item: { messages: [{ parts: [
    { type: "tool", tool: "matterhorn-work_matterhorn_prediction_markets_search", state: { status: "completed" } },
    { type: "tool", tool: "matterhorn_prediction_markets_secret_export", state: { status: "completed" } },
  ] }] } } });
  assert.equal(report.tools[0].name, "matterhorn-work_matterhorn_prediction_markets_search");
  assert.equal(report.tools[1].name, "unrecognized_tool");
});

test("retains object-read freshness and an allowlisted finish reason without object content", () => {
  const report = sanitizeChatEvidence({ workspaceId: "ws_web_fixture", sessionId: "ses_fixture", snapshot: { item: { messages: [{
    info: { role: "assistant", finish: "length" }, parts: [{ type: "tool", tool: "matterhorn_sui_get_object", state: {
      status: "completed", output: JSON.stringify({ object: { objectId: "DO_NOT_PERSIST", source: {
        source: "sui.grpc", network: "testnet", fetchedAt: "2026-10-06T00:00:00.000Z",
      } } }),
    } }],
  }] } } });
  assert.equal(report.messages[0].finish, "length");
  assert.deepEqual(report.tools[0], { name: "matterhorn_sui_get_object", status: "completed", source: "sui.grpc", network: "testnet", observedAt: "2026-10-06T00:00:00.000Z" });
  assert(!JSON.stringify(report).includes("DO_NOT_PERSIST"));
});

test("pre-dispatch cancellation requires empty runtime evidence and no token hold", () => {
  const report = { snapshotStatus: "idle", messages: [], receipts: [], toolCounts: { total: 0 },
    usage: { pendingRequests: 0, daily: { reservedTokens: 0 }, monthly: { reservedTokens: 0 } } };
  assert.equal(assertCancelledBeforeDispatch(report).status, "passed");
  assert.throws(() => assertCancelledBeforeDispatch({ ...report, messages: [{ role: "user" }] }));
  assert.throws(() => assertCancelledBeforeDispatch({ ...report, usage: { ...report.usage, pendingRequests: 1 } }));
  assert.throws(() => assertCancelledBeforeDispatch({ ...report, usage: { ...report.usage, daily: { reservedTokens: 1 } } }));
});
