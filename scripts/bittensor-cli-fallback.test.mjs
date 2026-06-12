#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_bittensor_cli";
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = req.method === "POST" ? await readJson(req) : {};
  requests.push({
    method: req.method,
    path: url.pathname,
    authorization: req.headers.authorization,
    body,
  });

  if (req.headers.authorization !== `Bearer ${CLIENT_TOKEN}`) {
    return json(res, 401, { error: "unauthorized" });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    assert.equal(body.message, "show my TAO");
    assert.equal(body.ss58Address, "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX");
    assert.equal(body.netuid, 14);
    assert.equal(body.amountTao, "1");
    assert.equal(body.validatorHotkey, "5ValidatorHotkey");
    assert.equal(body.strategy, "balanced");
    assert.equal(body.rateTolerance, 0.01);
    return json(res, 200, {
      success: true,
      execution: "answered",
      responseText: "Wallet snapshot ready.",
      cards: [],
      warnings: [],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, {
      success: true,
      report: { ready: true, checks: [] },
      cards: [],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    return json(res, 200, {
      success: true,
      capabilities: [{
        netuid: 14,
        name: "Mock Subnet",
        capabilityLevel: "adapter_required",
        serviceAdapter: "inference",
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
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/prepare") {
    assert.equal(body.action, "stake");
    assert.equal(body.netuid, 14);
    assert.equal(body.amountTao, "1");
    assert.equal(body.hotkey, "5ValidatorHotkey");
    assert.equal(body.coldkey, "5ColdkeyPublic");
    assert.equal(body.rateTolerance, 0.01);
    return json(res, 200, {
      success: true,
      preview: {
        action: "stake",
        netuid: 14,
        requiresExternalSignature: true,
        unsignedPayload: { call: "stake", netuid: 14 },
      },
      cards: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/handoff") {
    assert.equal(body.preview.action, "stake");
    assert.equal(body.preview.netuid, 14);
    return json(res, 200, {
      success: true,
      handoff: {
        payloadSha256: "e".repeat(64),
        suggestedFilename: "bittensor-stake-subnet-14.json",
      },
      receipt: { status: "awaiting_signature" },
      cards: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/submit") {
    assert.equal(body.preview.action, "stake");
    assert.equal(body.signature, "0x1234567890abcdef");
    assert.equal(body.signerAddress, "5SignerPublic");
    return json(res, 200, {
      success: true,
      result: { status: "sidecar_unavailable", txHash: null },
      receipt: { status: "submitted_to_sidecar" },
      cards: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/preview") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet service task");
    return json(res, 200, {
      success: true,
      preview: {
        netuid: 14,
        intent: "service_call",
        requestSha256: "b".repeat(64),
        confirmationPrompt: `Confirm request ${"b".repeat(64)}`,
        requiresConfirmation: true,
      },
      cards: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet service task");
    assert.equal(body.previewRequestSha256, "b".repeat(64));
    return json(res, 200, {
      success: true,
      invocation: {
        netuid: 14,
        intent: "service_call",
        supported: false,
        message: "Mock adapter unavailable.",
      },
      cards: [],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    return json(res, 200, {
      success: true,
      watches: [],
      cards: [],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    assert.equal(body.kind, "slippage");
    assert.equal(body.netuid, 14);
    assert.equal(body.threshold, 0.35);
    assert.equal(body.label, "Subnet 14 slippage");
    assert.equal(body.reason, "Alert before staking preview");
    return json(res, 200, {
      success: true,
      watch: {
        id: "bt-watch-cli",
        kind: "slippage",
        netuid: 14,
        threshold: 0.35,
        label: "Subnet 14 slippage",
      },
      watches: [],
      cards: [],
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/check") {
    return json(res, 200, {
      success: true,
      evaluations: [
        {
          watch: { id: "bt-watch-cli", kind: "slippage", netuid: 14 },
          status: "ok",
          summary: "Mock slippage watch ok.",
        },
        {
          watch: {
            id: "bt-watch-alert",
            kind: "validator",
            netuid: 14,
            validatorHotkey: "5ValidatorHotkey",
            label: "Subnet 14 validator",
          },
          status: "alert",
          summary: "Mock validator watch needs review.",
          alertKey: "validator:14:bt-watch-alert",
          notificationIntent: "review_validator",
          copilotActions: [
            {
              label: "Review validator",
              prompt: "Analyze validator 5ValidatorHotkey on subnet 14.",
            },
          ],
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

function runCli(baseUrl, args) {
  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "orchestrator", "src", "cli.ts");
  const child = spawn("bun", [
    cliPath,
    ...args,
    "--openwork-url",
    baseUrl,
    "--token",
    CLIENT_TOKEN,
    "--json",
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
        reject(new Error(`CLI exited ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const chat = await runCli(baseUrl, [
    "bittensor",
    "chat",
    "--message",
    "show my TAO",
    "--ss58-address",
    "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
    "--netuid",
    "14",
    "--amount-tao",
    "1",
    "--validator-hotkey",
    "5ValidatorHotkey",
    "--strategy",
    "balanced",
    "--rate-tolerance",
    "0.01",
  ]);
  assert.equal(chat.success, true);
  assert.equal(chat.execution, "answered");

  const readiness = await runCli(baseUrl, ["bittensor", "readiness"]);
  assert.equal(readiness.success, true);
  assert.equal(readiness.report.ready, true);

  const capabilities = await runCli(baseUrl, ["bittensor", "capabilities"]);
  assert.equal(capabilities.success, true);
  assert.equal(capabilities.capabilities[0].netuid, 14);

  const capability = await runCli(baseUrl, ["bittensor", "capability", "--netuid", "14"]);
  assert.equal(capability.success, true);
  assert.equal(capability.capability.serviceAdapter, "inference");

  const extrinsicPrepare = await runCli(baseUrl, [
    "bittensor",
    "extrinsic",
    "prepare",
    "--action",
    "stake",
    "--netuid",
    "14",
    "--amount-tao",
    "1",
    "--validator-hotkey",
    "5ValidatorHotkey",
    "--coldkey",
    "5ColdkeyPublic",
    "--rate-tolerance",
    "0.01",
  ]);
  assert.equal(extrinsicPrepare.success, true);
  assert.equal(extrinsicPrepare.preview.requiresExternalSignature, true);

  const previewJson = JSON.stringify(extrinsicPrepare.preview);
  const extrinsicHandoff = await runCli(baseUrl, [
    "bittensor",
    "extrinsic",
    "handoff",
    "--preview-json",
    previewJson,
  ]);
  assert.equal(extrinsicHandoff.success, true);
  assert.equal(extrinsicHandoff.handoff.payloadSha256.length, 64);

  const extrinsicSubmit = await runCli(baseUrl, [
    "bittensor",
    "extrinsic",
    "submit",
    "--preview-json",
    previewJson,
    "--signature",
    "0x1234567890abcdef",
    "--signer-address",
    "5SignerPublic",
  ]);
  assert.equal(extrinsicSubmit.success, true);
  assert.equal(extrinsicSubmit.result.status, "sidecar_unavailable");

  const subnetPreview = await runCli(baseUrl, [
    "bittensor",
    "subnet-preview",
    "--netuid",
    "14",
    "--intent",
    "service_call",
    "--task",
    "mock subnet service task",
  ]);
  assert.equal(subnetPreview.success, true);
  assert.equal(subnetPreview.preview.requestSha256.length, 64);

  const subnetInvoke = await runCli(baseUrl, [
    "bittensor",
    "subnet-invoke",
    "--netuid",
    "14",
    "--intent",
    "service_call",
    "--task",
    "mock subnet service task",
    "--preview-request-sha256",
    subnetPreview.preview.requestSha256,
  ]);
  assert.equal(subnetInvoke.success, true);
  assert.equal(subnetInvoke.invocation.supported, false);

  const watchList = await runCli(baseUrl, ["bittensor", "watch", "list"]);
  assert.equal(watchList.success, true);
  assert.equal(watchList.watches.length, 0);

  const watchCreate = await runCli(baseUrl, [
    "bittensor",
    "watch",
    "create",
    "--kind",
    "slippage",
    "--netuid",
    "14",
    "--threshold",
    "0.35",
    "--label",
    "Subnet 14 slippage",
    "--reason",
    "Alert before staking preview",
  ]);
  assert.equal(watchCreate.success, true);
  assert.equal(watchCreate.watch.id, "bt-watch-cli");

  const watchCheck = await runCli(baseUrl, ["bittensor", "watch", "check"]);
  assert.equal(watchCheck.success, true);
  assert.equal(watchCheck.evaluations[0].status, "ok");

  const watchDigest = await runCli(baseUrl, [
    "bittensor",
    "watch",
    "digest",
    "--max-alerts",
    "1",
  ]);
  assert.equal(watchDigest.success, true);
  assert.equal(watchDigest.total, 2);
  assert.equal(watchDigest.alertCount, 1);
  assert.equal(watchDigest.statusCounts.alert, 1);
  assert.equal(watchDigest.alerts.length, 1);
  assert.equal(watchDigest.alerts[0].alertKey, "validator:14:bt-watch-alert");
  assert.equal(watchDigest.alerts[0].notificationIntent, "review_validator");
  assert.equal(watchDigest.alerts[0].prompt, "Analyze validator 5ValidatorHotkey on subnet 14.");

  assert.deepEqual(
    requests.map((request) => `${request.method} ${request.path}`),
    [
      "POST /api/bittensor/chat/execute",
      "GET /api/bittensor/readiness",
      "GET /api/bittensor/capabilities",
      "GET /api/bittensor/capabilities/14",
      "POST /api/bittensor/extrinsics/prepare",
      "POST /api/bittensor/extrinsics/handoff",
      "POST /api/bittensor/extrinsics/submit",
      "POST /api/bittensor/subnets/14/preview",
      "POST /api/bittensor/subnets/14/invoke",
      "GET /api/bittensor/monitoring/watchlist",
      "POST /api/bittensor/monitoring/watchlist",
      "GET /api/bittensor/monitoring/check",
      "GET /api/bittensor/monitoring/check",
    ],
  );

  const payloadText = JSON.stringify(requests);
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(payloadText), false);

  console.log("Matterhorn Bittensor CLI fallback smoke test passed.");
} finally {
  server.close();
}
