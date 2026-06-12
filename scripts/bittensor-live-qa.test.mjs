#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_bittensor_live_qa";
const VALID_SS58 = "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX";
const requests = [];

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function card(kind, title = kind, data = {}) {
  return { kind, title, items: [], warnings: [], data };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = req.method === "POST" ? await readJson(req) : {};
  requests.push({
    method: req.method,
    path: url.pathname,
    authorization: req.headers.authorization,
    body,
  });

  assert.equal(req.headers.authorization, `Bearer ${CLIENT_TOKEN}`);

  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, {
      success: true,
      report: { status: "ready", ready: true, checks: [] },
      cards: [card("subnet_result", "Readiness")],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    if (body.message.startsWith("I'm new to Bittensor")) {
      return json(res, 200, {
        success: true,
        execution: "answered",
        plan: { intent: "learn" },
        responseText: "Bittensor explanation.",
        cards: [card("subnet_result", "Bittensor explainer")],
        warnings: [],
      });
    }

    if (body.message === "show my TAO" && !body.ss58Address) {
      return json(res, 200, {
        success: true,
        execution: "clarification_required",
        requiresClarification: true,
        clarificationQuestion: "Which SS58 coldkey public address should I check?",
        cards: [card("subnet_result", "Need SS58")],
      });
    }

    if (body.message === "show my TAO" && body.ss58Address === VALID_SS58) {
      return json(res, 200, {
        success: true,
        execution: "answered",
        plan: { intent: "wallet" },
        responseText: "Wallet snapshot ready.",
        cards: [card("wallet_snapshot", "Wallet snapshot")],
        context: { id: "bt-chat-1", ss58Address: VALID_SS58, lastIntent: "wallet", lastExecution: "answered" },
        data: { wallet: { taoBalance: 3, stakePositions: [] } },
      });
    }

    if (body.message === "where am I staked?" && body.contextId === "bt-chat-1") {
      return json(res, 200, {
        success: true,
        execution: "answered",
        plan: { intent: "wallet" },
        responseText: "Stake positions ready.",
        cards: [card("wallet_snapshot", "Wallet snapshot"), card("wallet_snapshot", "Stake positions", { positions: [{ netuid: 14 }] })],
        context: { id: "bt-chat-1", ss58Address: VALID_SS58, lastIntent: "wallet", lastExecution: "answered" },
      });
    }

    if (body.message === "which Bittensor subnet is useful for image generation?") {
      assert.equal(body.limit, 5);
      return json(res, 200, {
        success: true,
        execution: "answered",
        plan: { intent: "discover" },
        responseText: "Found image subnets.",
        cards: [card("subnet_comparison", "Image subnet")],
      });
    }

    if (body.message === "compare validators on subnet 14") {
      assert.equal(body.netuid, 14);
      assert.equal(body.strategy, "balanced");
      return json(res, 200, {
        success: true,
        execution: "answered",
        plan: { intent: "stake_plan" },
        responseText: "Compared validators.",
        cards: [card("validator_selection", "Validators")],
        context: { id: "bt-chat-2", netuid: 14, lastIntent: "stake_plan", lastExecution: "answered" },
      });
    }

    if (body.message === "prepare staking 1 TAO on subnet 14" && !body.validatorHotkey) {
      return json(res, 200, {
        success: true,
        execution: "clarification_required",
        requiresClarification: true,
        clarificationQuestion: "Which validator hotkey should I use?",
        cards: [card("validator_selection", "Validators")],
      });
    }

    if (body.message === "prepare staking 1 TAO on subnet 14" && body.validatorHotkey === VALID_SS58) {
      assert.equal(body.coldkey, VALID_SS58);
      assert.equal(body.rateTolerance, 0.01);
      return json(res, 200, {
        success: true,
        execution: "unsigned_preview",
        plan: { intent: "stake_plan" },
        responseText: "Unsigned preview ready. External signature required.",
        cards: [card("signed_action_review", "Stake preview")],
        data: { preview: { action: "stake", requiresExternalSignature: true } },
      });
    }

    if (body.message.startsWith("Use subnet 14 for this task")) {
      return json(res, 200, {
        success: true,
        execution: "unsupported",
        plan: { intent: "subnet_use" },
        responseText: "No service adapter configured.",
        cards: [card("subnet_result", "Unsupported adapter")],
        data: { invocation: { netuid: 14, supported: false, adapter: null } },
      });
    }
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function runHarness(baseUrl) {
  const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bittensor-live-qa.mjs");
  const child = spawn("node", [
    scriptPath,
    "--server-url",
    baseUrl,
    "--token",
    CLIENT_TOKEN,
    "--ss58-address",
    VALID_SS58,
    "--validator-hotkey",
    VALID_SS58,
    "--netuid",
    "14",
    "--amount-tao",
    "1",
    "--json",
    "--strict",
    "--require-ready",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Bittensor live QA exited ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

const port = await listen(server);

try {
  const report = await runHarness(`http://127.0.0.1:${port}`);
  assert.equal(report.ready, true);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.skip, 0);
  for (const expected of [
    "bittensor.readiness",
    "bittensor.learn",
    "bittensor.wallet.clarification",
    "bittensor.wallet.snapshot",
    "bittensor.wallet.stake_positions",
    "bittensor.discover.image",
    "bittensor.validators.compare",
    "bittensor.stake.clarification",
    "bittensor.stake.unsigned_preview",
    "bittensor.subnet.unsupported_adapter",
  ]) {
    assert.ok(report.stages.some((stage) => stage.id === expected && stage.status === "pass"), `missing passing stage: ${expected}`);
  }
  assert.equal(report.artifacts.bittensorContextId, "bt-chat-1");
  assert.equal(report.artifacts.validatorContextId, "bt-chat-2");
  assert.equal(report.requestCount, 10);

  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.path}`),
    [
      "GET /api/bittensor/readiness",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
      "POST /api/bittensor/chat/execute",
    ],
  );
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export|keyfile|suri/i.test(JSON.stringify(requests)), false);

  console.log("Matterhorn Bittensor live QA harness test passed.");
} finally {
  server.close();
}
