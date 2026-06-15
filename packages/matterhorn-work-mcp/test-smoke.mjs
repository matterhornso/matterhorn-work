#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_client_test";
const HOST_TOKEN = "mwh_host_test";
const requests = [];

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = await readJson(req);
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    hostToken: req.headers["x-matterhorn-host-token"],
    body,
  });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "matterhorn-work-server" });
  }
  if (req.headers.authorization !== `Bearer ${CLIENT_TOKEN}` && !url.pathname.startsWith("/approvals")) {
    return json(res, 401, { error: "unauthorized" });
  }
  if (url.pathname.startsWith("/approvals") && req.headers["x-matterhorn-host-token"] !== HOST_TOKEN) {
    return json(res, 403, { error: "forbidden" });
  }

  if (req.method === "GET" && url.pathname === "/status") {
    return json(res, 200, { ok: true, workspaces: 1 });
  }
  if (req.method === "GET" && url.pathname === "/capabilities") {
    return json(res, 200, { ok: true, tools: ["files", "approvals", "bittensor"] });
  }
  if (req.method === "GET" && url.pathname === "/workspaces") {
    return json(res, 200, { items: [{ id: "ws_1", name: "Demo", path: "/workspace" }], activeId: "ws_1" });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(body.title, "Agent session");
    return json(res, 200, { item: { id: "ses_created", title: "Agent session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(url.searchParams.get("limit"), "3");
    assert.equal(url.searchParams.get("search"), "demo");
    return json(res, 200, { items: [{ id: "ses_1", title: "Demo session" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { item: { id: "ses_1", title: "Demo session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { items: [{ id: "msg_1", role: "user", content: "hello" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/status") {
    return json(res, 200, {
      item: {
        session: { id: "ses_1", title: "Demo session" },
        status: { type: "busy" },
        busy: true,
        observedAt: 123,
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/events") {
    assert.equal(req.headers.accept, "text/event-stream");
    assert.ok(["1", "2"].includes(url.searchParams.get("maxEvents")), "unexpected maxEvents for session event route");
    assert.equal(url.searchParams.get("snapshot"), "true");
    if (url.searchParams.get("maxEvents") === "2") {
      assert.equal(url.searchParams.get("details"), "true");
      assert.equal(url.searchParams.get("since"), "7");
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `id: 8\nevent: session.snapshot\ndata: ${JSON.stringify({
        type: "session.snapshot",
        cursor: "8",
        workspaceId: "ws_1",
        sessionId: "ses_1",
        observedAt: 123,
        source: "matterhorn-work-server",
        payload: { session: { id: "ses_1" }, status: { type: "busy" } },
      })}\n\n`,
    );
    res.end(
      `id: 9\nevent: session.status\ndata: ${JSON.stringify({
        type: "session.status",
        cursor: "9",
        workspaceId: "ws_1",
        sessionId: "ses_1",
        observedAt: 124,
        source: "matterhorn-work-server",
        payload: { status: { type: "busy" }, busy: true },
      })}\n\n`,
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(body.message, "Summarize this workspace");
    assert.equal(body.model.providerID, "openai");
    assert.equal(body.model.modelID, "gpt-4.1");
    assert.equal(body.agent, "build");
    assert.equal(body.noReply, true);
    return json(res, 200, { ok: true, accepted: true, sessionId: "ses_1" });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/snapshot") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { item: { session: { id: "ses_1" }, messages: [{ id: "msg_1" }], todos: [], statuses: [] } });
  }
  if (req.method === "DELETE" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/files/sessions") {
    assert.equal(body.write, false);
    return json(res, 200, { session: { id: "fs_1", workspaceId: "ws_1", canWrite: false } });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/snapshot") {
    return json(res, 200, { items: [{ path: "README.md", kind: "file", bytes: 12 }], total: 1 });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/events") {
    if (url.searchParams.has("since")) {
      assert.equal(url.searchParams.get("since"), "4");
    }
    return json(res, 200, {
      cursor: 5,
      events: [{ cursor: 5, type: "changed", path: "README.md" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_1/read-batch") {
    assert.deepEqual(body.paths, ["README.md"]);
    return json(res, 200, {
      items: [{
        ok: true,
        path: "README.md",
        bytes: 12,
        contentBase64: Buffer.from("hello world\n", "utf8").toString("base64"),
      }],
    });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_write/write-batch") {
    assert.equal(body.writes[0].contentBase64, Buffer.from("updated", "utf8").toString("base64"));
    return json(res, 200, { items: [{ ok: true, path: "README.md" }], cursor: 2 });
  }
  if (req.method === "DELETE" && url.pathname === "/files/sessions/fs_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/approvals") {
    return json(res, 200, { items: [{ id: "ap_1", action: "workspace.files.session.ops" }] });
  }
  if (req.method === "POST" && url.pathname === "/approvals/ap_1") {
    assert.equal(body.reply, "allow");
    return json(res, 200, { ok: true, allowed: true });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    if (body.message === "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.") {
      assert.equal(body.netuid, 14);
      assert.equal(body.validatorHotkey, "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX");
      assert.equal("ss58Address" in body, false);
      return json(res, 200, {
        success: true,
        execution: "answered",
        responseText: "Validator alert analysis ready.",
        cards: [],
        warnings: [],
      });
    }
    assert.equal(body.message, "show my TAO");
    return json(res, 200, { success: true, execution: "clarification_required", clarificationQuestion: "What SS58 address should I use?" });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, { success: true, ready: true });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    return json(res, 200, {
      success: true,
      capabilities: [{
        netuid: 14,
        name: "Mock Subnet",
        capabilityLevel: "adapter_required",
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "monitor", "subnet_use"],
        serviceAdapter: "inference",
        adapterStatus: { configured: false, message: "Adapter not configured." },
      }],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities/14") {
    return json(res, 200, {
      success: true,
      capability: {
        netuid: 14,
        name: "Mock Subnet",
        capabilityLevel: "adapter_required",
        serviceAdapter: "inference",
        adapterStatus: { configured: false, message: "Adapter not configured." },
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/prepare") {
    assert.equal(body.action, "stake");
    assert.equal(body.netuid, 14);
    return json(res, 200, {
      success: true,
      preview: { action: "stake", netuid: 14, requiresExternalSignature: true },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/handoff") {
    assert.equal(body.preview.action, "stake");
    return json(res, 200, {
      success: true,
      handoff: { payloadSha256: "e".repeat(64), expiresAt: "2026-06-12T20:00:00.000Z" },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/submit") {
    assert.equal(body.preview.action, "stake");
    assert.equal(body.signature, "0x1234567890abcdef");
    return json(res, 200, {
      success: true,
      result: { status: "sidecar_unavailable", txHash: null },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/preview") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet task");
    return json(res, 200, {
      success: true,
      preview: {
        netuid: 14,
        intent: "service_call",
        requestSha256: "d".repeat(64),
        requiresConfirmation: true,
      },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet task");
    assert.equal(body.previewRequestSha256, "d".repeat(64));
    return json(res, 200, {
      success: true,
      invocation: { netuid: 14, intent: "service_call", supported: false },
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    return json(res, 200, { success: true, watches: [], cards: [] });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    assert.equal(body.kind, "slippage");
    assert.equal(body.netuid, 14);
    assert.equal(body.threshold, 0.4);
    return json(res, 200, {
      success: true,
      watch: { id: "bt-watch-mcp", kind: "slippage", netuid: 14, threshold: 0.4 },
      watches: [],
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/check") {
    return json(res, 200, {
      success: true,
      evaluations: [
        { watch: { id: "bt-watch-mcp", kind: "slippage", netuid: 14 }, status: "ok" },
        {
          watch: { id: "bt-watch-alert", kind: "validator", netuid: 14, validatorHotkey: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX", label: "Validator drift" },
          status: "alert",
          alertKey: "validator:14:bt-watch-alert",
          notificationIntent: "review_validator",
          copilotActions: [{ label: "Analyze validator", prompt: "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14." }],
        },
      ],
      cards: [],
    });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function createMcp(baseUrl) {
  const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
  const child = spawn("node", [mcpPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_SERVER_URL: baseUrl,
      MATTERHORN_WORK_TOKEN: CLIENT_TOKEN,
      MATTERHORN_WORK_HOST_TOKEN: HOST_TOKEN,
    },
  });

  let nextId = 1;
  let buffer = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
  });

  function ask(method, params) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 45_000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  return { child, ask };
}

function parseToolResult(response) {
  assert.ok(!response.error, response.error?.message);
  return JSON.parse(response.result.content[0].text);
}

const port = await listen(server);
const mcp = createMcp(`http://127.0.0.1:${port}`);

try {
  const init = await mcp.ask("initialize");
  assert.equal(init.result.serverInfo.name, "matterhorn-work-mcp");

  const listed = await mcp.ask("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  for (const expected of [
    "matterhorn_doctor",
    "matterhorn_status",
    "matterhorn_upstream_openwork_check",
    "matterhorn_list_workspaces",
    "matterhorn_create_session",
    "matterhorn_list_sessions",
    "matterhorn_get_session",
    "matterhorn_get_session_messages",
    "matterhorn_get_session_status",
    "matterhorn_watch_session_events",
    "matterhorn_submit_session_prompt",
    "matterhorn_get_session_snapshot",
    "matterhorn_delete_session",
    "matterhorn_create_file_session",
    "matterhorn_read_files",
    "matterhorn_write_files",
    "matterhorn_watch_file_events",
    "matterhorn_list_approvals",
    "matterhorn_bittensor_chat",
    "matterhorn_bittensor_list_capabilities",
    "matterhorn_bittensor_get_subnet_capability",
    "matterhorn_bittensor_adapter_canary_gate",
    "matterhorn_bittensor_prepare_extrinsic",
    "matterhorn_bittensor_create_signing_handoff",
    "matterhorn_bittensor_check_receipt",
    "matterhorn_bittensor_check_signing_handoff",
    "matterhorn_bittensor_submit_signed_extrinsic",
    "matterhorn_bittensor_preview_subnet_invocation",
    "matterhorn_bittensor_invoke_subnet",
    "matterhorn_bittensor_create_watch",
    "matterhorn_bittensor_list_watches",
    "matterhorn_bittensor_check_watches",
    "matterhorn_bittensor_watch_digest",
    "matterhorn_bittensor_act_on_watch_alert",
  ]) {
    assert.ok(toolNames.includes(expected), `missing ${expected}`);
  }

  const schemaText = JSON.stringify(listed.result.tools);
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(schemaText), false);
  const descriptionFor = (name) => listed.result.tools.find((tool) => tool.name === name)?.description || "";
  assert.match(descriptionFor("matterhorn_bittensor_chat"), /Default first Matterhorn Work tool/i);
  assert.match(descriptionFor("matterhorn_bittensor_list_capabilities"), /before previewing or invoking/i);
  assert.match(descriptionFor("matterhorn_bittensor_get_subnet_capability"), /before previewing or invoking/i);
  assert.match(descriptionFor("matterhorn_bittensor_preview_subnet_invocation"), /First inspect the subnet capability manifest/i);
  assert.match(descriptionFor("matterhorn_bittensor_invoke_subnet"), /capability inspection, preview, explicit confirmation/i);

  const status = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_status", arguments: {} }));
  assert.equal(status.health.ok, true);
  assert.equal(status.status.ok, true);

  const upstream = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_upstream_openwork_check",
    arguments: { date: "2026-06-12" },
  }));
  assert.equal(upstream.ok, true);
  assert.equal(upstream.safety.mode, "read_only_intake");
  assert.equal(upstream.plan.syncBranch, "codex/sync-openwork-2026-06-12");
  assert.equal(upstream.plan.remoteStatus.status, "skipped");
  assert.ok(upstream.plan.conflictZones.some((zone) => zone.name === "Bittensor safety"));
  assert.ok(upstream.plan.conflictZones.some((zone) => zone.name === "Agent control surface"));
  assert.ok(upstream.plan.verificationCommands.includes("pnpm test:upstream-openwork-sync"));
  assert.ok(upstream.plan.nextCommands.some((command) => command.includes("git fetch openwork-upstream main")));

  const doctor = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_doctor",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", fileSessionId: "fs_1" },
  }));
  assert.equal(doctor.ready, true);
  assert.equal(doctor.summary.fail, 0);
  assert.ok(doctor.checks.some((check) => check.id === "bittensor.readiness" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "bittensor.capabilities" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "session.events" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "files.events" && check.status === "pass"));

  const workspaces = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_list_workspaces", arguments: {} }));
  assert.equal(workspaces.items[0].id, "ws_1");

  const createdSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_session",
    arguments: { workspaceId: "ws_1", title: "Agent session" },
  }));
  assert.equal(createdSession.item.id, "ses_created");

  const sessions = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_sessions",
    arguments: { workspaceId: "ws_1", limit: 3, search: "demo" },
  }));
  assert.equal(sessions.items[0].id, "ses_1");

  const sessionItem = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(sessionItem.item.id, "ses_1");

  const sessionMessages = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_messages",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionMessages.items[0].id, "msg_1");

  const sessionStatus = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_status",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(sessionStatus.item.status.type, "busy");
  assert.equal(sessionStatus.item.busy, true);

  const sessionEvents = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_watch_session_events",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", snapshot: true, details: true, maxEvents: 2, since: "7" },
  }));
  assert.equal(sessionEvents.count, 2);
  assert.equal(sessionEvents.lastCursor, "9");
  assert.equal(sessionEvents.events[0].event, "session.snapshot");
  assert.equal(sessionEvents.events[1].data.payload.busy, true);

  const submittedPrompt = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_submit_session_prompt",
    arguments: {
      workspaceId: "ws_1",
      sessionId: "ses_1",
      message: "Summarize this workspace",
      model: { providerID: "openai", modelID: "gpt-4.1" },
      agent: "build",
      noReply: true,
    },
  }));
  assert.equal(submittedPrompt.accepted, true);

  const sessionSnapshot = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_snapshot",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionSnapshot.item.session.id, "ses_1");

  const session = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_file_session",
    arguments: { workspaceId: "ws_1", readOnly: true },
  }));
  assert.equal(session.session.id, "fs_1");

  const catalog = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_file_catalog",
    arguments: { sessionId: "fs_1", limit: 10 },
  }));
  assert.equal(catalog.items[0].path, "README.md");

  const fileEvents = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_watch_file_events",
    arguments: { sessionId: "fs_1", since: 4 },
  }));
  assert.equal(fileEvents.cursor, 5);
  assert.equal(fileEvents.events[0].path, "README.md");

  const read = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_read_files",
    arguments: { sessionId: "fs_1", paths: ["README.md"] },
  }));
  assert.equal(read.items[0].content, "hello world\n");
  assert.equal(read.items[0].contentBase64, undefined);

  const write = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_write_files",
    arguments: { sessionId: "fs_write", writes: [{ path: "README.md", content: "updated" }] },
  }));
  assert.equal(write.items[0].ok, true);

  const approvals = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_approvals",
    arguments: {},
  }));
  assert.equal(approvals.items[0].id, "ap_1");

  const approvalReply = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_reply_approval",
    arguments: { approvalId: "ap_1", reply: "allow" },
  }));
  assert.equal(approvalReply.allowed, true);

  const bittensor = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_chat",
    arguments: { message: "show my TAO" },
  }));
  assert.equal(bittensor.execution, "clarification_required");

  const readiness = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_readiness",
    arguments: {},
  }));
  assert.equal(readiness.ready, true);

  const customerEvidenceBundle = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: {
        ready: true,
        summary: { pass: 7, fail: 0, skip: 0 },
        stages: [
          { id: "readiness", label: "Bittensor readiness", status: "pass" },
          { id: "wallet.snapshot", label: "Wallet snapshot", status: "pass" },
        ],
      },
      agentControlLiveQa: { ready: true, summary: { pass: 4, fail: 0 } },
      ci: {
        workflow_runs: [
          { name: "Matterhorn Work Tests", conclusion: "success" },
          { name: "i18n Audit", conclusion: "success" },
          { name: "Alpha Channel macOS arm64", conclusion: "success" },
        ],
      },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
      walletTimeline: { enabled: true, snapshotCount: 2 },
      adapterCanary: {
        readyForCanary: true,
        netuid: 14,
        serviceAdapter: "data_search",
        summary: { pass: 6, warn: 1, fail: 0 },
        findings: [{ area: "Endpoint", status: "pass" }],
      },
      readonlyAdapterCanary: {
        ready: true,
        netuid: 14,
        serviceAdapter: "data_search",
        invoked: true,
        previewRequestSha256: "f".repeat(64),
        summary: { pass: 5, warn: 0, fail: 0 },
        findings: [{ area: "Invoke", status: "pass" }],
      },
      receiptCheck: {
        accepted: true,
        txHash: "0x" + "d".repeat(64),
        blockHash: "0x" + "e".repeat(64),
        status: "finalized",
        payloadSha256: "f".repeat(64),
        action: "stake",
        netuid: 14,
        summary: { pass: 5, warn: 0, fail: 0 },
        findings: [{ area: "Payload hash", status: "pass" }],
      },
      watchAutopilotScheduler: {
        ok: true,
        source: "matterhorn_bittensor_watch_autopilot_scheduler",
        iterations: 6,
        totalEvaluations: 18,
        totalAlerts: 2,
        failedChecks: 0,
        latest: { checkedAt: "2026-06-15T00:05:00.000Z" },
        safety: { custody: "none", signsOrBroadcasts: false, submitsTransactions: false, invokesSubnetServices: false },
      },
      requireAdapterCanary: true,
      requireReadonlyAdapterCanary: true,
      requireReceiptCheck: true,
      requireWatchAutopilotScheduler: true,
    },
  }));
  assert.equal(customerEvidenceBundle.ready, true);
  assert.equal(customerEvidenceBundle.summary.adapterCanary.ready, true);
  assert.equal(customerEvidenceBundle.summary.readonlyAdapterCanary.ready, true);
  assert.equal(customerEvidenceBundle.summary.readonlyAdapterCanary.invoked, true);
  assert.equal(customerEvidenceBundle.summary.receiptCheck.ready, true);
  assert.equal(customerEvidenceBundle.summary.receiptCheck.status, "finalized");
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.ready, true);
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.iterations, 6);
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.totalAlerts, 2);
  assert.equal(customerEvidenceBundle.safety.signsOrBroadcasts, false);
  assert.match(customerEvidenceBundle.markdown, /READY_FOR_TEST_CUSTOMERS/);
  assert.match(customerEvidenceBundle.markdown, /Wallet snapshot/);
  assert.match(customerEvidenceBundle.markdown, /Read-only canary ready/);
  assert.match(customerEvidenceBundle.markdown, /Receipt check accepted/);
  assert.match(customerEvidenceBundle.markdown, /Scheduled watch autopilot/);
  assert.match(customerEvidenceBundle.markdown, /6 scheduled checks, 2 alerts, 18 evaluations/);

  const badCustomerEvidenceBundle = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: { ready: true, seedPhrase: "never" },
      ci: { workflow_runs: [{ name: "Matterhorn Work Tests", conclusion: "success" }] },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
    },
  });
  assert.match(badCustomerEvidenceBundle.error?.message || "", /credential-shaped field/i);

  const badCustomerEvidenceReceipt = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: { ready: true, summary: { pass: 1, fail: 0 } },
      ci: { workflow_runs: [{ name: "Matterhorn Work Tests", conclusion: "success" }] },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
      receiptCheck: { accepted: true, signature: "0x1234" },
    },
  });
  assert.match(badCustomerEvidenceReceipt.error?.message || "", /credential-shaped field/i);

  const capabilities = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_list_capabilities",
    arguments: {},
  }));
  assert.equal(capabilities.capabilities[0].netuid, 14);

  const capability = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_get_subnet_capability",
    arguments: { netuid: 14 },
  }));
  assert.equal(capability.capability.serviceAdapter, "inference");

  const adapterCanaryGate = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_adapter_canary_gate",
    arguments: {
      netuid: 14,
      capability: {
        netuid: 14,
        serviceAdapter: "data_search",
        endpoint: "https://adapter.example.com/search",
        configured: true,
        requiredAuth: "none",
        costModel: "free_read",
      },
      allowedHosts: ["adapter.example.com"],
      requireConfigured: true,
      strict: true,
    },
  }));
  assert.equal(adapterCanaryGate.readyForCanary, true);
  assert.equal(adapterCanaryGate.safety.callsAdapterService, false);

  const badAdapterCanaryGate = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_adapter_canary_gate",
    arguments: {
      netuid: 14,
      capability: {
        netuid: 14,
        serviceAdapter: "data_search",
        endpoint: "https://adapter.example.com/search",
        configured: true,
        seedPhrase: "never",
      },
      allowedHosts: ["adapter.example.com"],
    },
  });
  assert.match(badAdapterCanaryGate.error?.message || "", /forbidden credential or signing field/i);

  const extrinsicPreview = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_prepare_extrinsic",
    arguments: { action: "stake", netuid: 14, amountTao: "1" },
  }));
  assert.equal(extrinsicPreview.preview.requiresExternalSignature, true);

  const signingHandoff = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_create_signing_handoff",
    arguments: { preview: extrinsicPreview.preview },
  }));
  assert.equal(signingHandoff.handoff.payloadSha256.length, 64);

  const signingHandoffCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_signing_handoff",
    arguments: {
      handoff: {
        handoff: {
          ...signingHandoff.handoff,
          requiresExternalSignature: true,
          preview: { action: "stake", netuid: 14, amountTao: "1" },
        },
      },
      expectedSha: signingHandoff.handoff.payloadSha256,
      now: "2026-06-12T19:00:00.000Z",
      strict: true,
    },
  }));
  assert.equal(signingHandoffCheck.readyToSign, true);
  assert.equal(signingHandoffCheck.safety.signsOrBroadcasts, false);
  assert.match(signingHandoffCheck.markdown, /READY_FOR_EXTERNAL_SIGNER/);

  const badSigningHandoffCheck = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_signing_handoff",
    arguments: {
      handoff: {
        payloadSha256: signingHandoff.handoff.payloadSha256,
        expiresAt: "2026-06-12T20:00:00.000Z",
        signature: "0x1234",
      },
    },
  });
  assert.match(badSigningHandoffCheck.error?.message || "", /forbidden signing or credential field/i);

  const receiptCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_receipt",
    arguments: {
      receipt: {
        txHash: "0x" + "d".repeat(64),
        blockHash: "0x" + "e".repeat(64),
        status: "finalized",
        payloadSha256: signingHandoff.handoff.payloadSha256,
        action: "stake",
        netuid: 14,
      },
      expectedPayloadSha: signingHandoff.handoff.payloadSha256,
      expectedAction: "stake",
      expectedNetuid: 14,
      strict: true,
    },
  }));
  assert.equal(receiptCheck.accepted, true);
  assert.equal(receiptCheck.safety.acceptsRawSignatures, false);
  assert.match(receiptCheck.followUpPrompt, /Compare my public wallet state/i);

  const badReceiptCheck = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_receipt",
    arguments: {
      receipt: {
        txHash: "0x" + "d".repeat(64),
        status: "finalized",
        payloadSha256: signingHandoff.handoff.payloadSha256,
        signature: "0x1234",
      },
    },
  });
  assert.match(badReceiptCheck.error?.message || "", /forbidden signing or credential field/i);

  const signedSubmit = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_submit_signed_extrinsic",
    arguments: { preview: extrinsicPreview.preview, signature: "0x1234567890abcdef" },
  }));
  assert.equal(signedSubmit.result.status, "sidecar_unavailable");

  const subnetPreview = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_preview_subnet_invocation",
    arguments: { netuid: 14, intent: "service_call", task: "mock subnet task" },
  }));
  assert.equal(subnetPreview.preview.requestSha256.length, 64);
  assert.equal(subnetPreview.preview.requiresConfirmation, true);

  const subnetInvoke = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_invoke_subnet",
    arguments: { netuid: 14, intent: "service_call", task: "mock subnet task", previewRequestSha256: subnetPreview.preview.requestSha256 },
  }));
  assert.equal(subnetInvoke.invocation.supported, false);

  const watchCreate = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_create_watch",
    arguments: { kind: "slippage", netuid: 14, threshold: 0.4 },
  }));
  assert.equal(watchCreate.watch.id, "bt-watch-mcp");

  const watchList = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_list_watches",
    arguments: {},
  }));
  assert.equal(watchList.watches.length, 0);

  const watchCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_watches",
    arguments: {},
  }));
  assert.equal(watchCheck.evaluations[0].status, "ok");

  const watchDigest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_watch_digest",
    arguments: { maxAlerts: 2 },
  }));
  assert.equal(watchDigest.total, 2);
  assert.equal(watchDigest.alertCount, 1);
  assert.equal(watchDigest.statusCounts.alert, 1);
  assert.equal(watchDigest.alerts[0].alertKey, "validator:14:bt-watch-alert");
  assert.equal(watchDigest.alerts[0].notificationIntent, "review_validator");
  assert.equal(watchDigest.alerts[0].prompt, "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.");

  const watchAct = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_act_on_watch_alert",
    arguments: { alertKey: "validator:14:bt-watch-alert" },
  }));
  assert.equal(watchAct.selectedAlert.alertKey, "validator:14:bt-watch-alert");
  assert.equal(watchAct.selectedAlert.validatorHotkey, "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX");
  assert.equal(watchAct.action.prompt, "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.");
  assert.equal(watchAct.chat.execution, "answered");
  assert.equal(watchAct.chat.responseText, "Validator alert analysis ready.");

  await mcp.ask("tools/call", {
    name: "matterhorn_close_file_session",
    arguments: { sessionId: "fs_1" },
  });

  const deletedSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_delete_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(deletedSession.ok, true);

  assert.ok(requests.some((request) => request.hostToken === HOST_TOKEN && request.path === "/approvals"));
  assert.ok(requests.some((request) => request.authorization === `Bearer ${CLIENT_TOKEN}` && request.path === "/workspaces"));

  console.log("Matterhorn Work MCP smoke test passed.");
} finally {
  mcp.child.kill();
  server.close();
}
