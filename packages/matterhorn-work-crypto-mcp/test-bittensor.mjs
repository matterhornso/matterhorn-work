#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";

const subnet = {
  netuid: 14,
  name: "TAOHash",
  symbol: "SN14",
  category: "Compute and infrastructure",
  benefitSummary: "A documented subnet example useful for testing metagraph and validator views.",
  ownerColdkey: null,
  ownerHotkey: null,
  priceTao: 0.5,
  emission: 12.5,
  tempo: 360,
  updatedAt: "2026-06-09T00:00:00.000Z",
  source: "mock",
};

const detail = {
  ...subnet,
  metagraphSummary: { neurons: 128, totalStake: 1000, block: 123 },
  topValidators: [{ uid: 1, hotkey: VALID_SS58, coldkey: VALID_SS58, stake: 1000, trust: 0.9, dividends: 0.2 }],
  knownUseCases: ["Evaluate decentralized compute capacity"],
  risks: ["Quote only"],
  links: [],
};

const subnetCard = {
  kind: "subnet_comparison",
  title: "TAOHash (SN14)",
  subtitle: "Subnet 14 · Compute and infrastructure",
  summary: subnet.benefitSummary,
  items: [
    { label: "Price", value: "0.5 TAO" },
    { label: "Emission", value: "12.5" },
  ],
  warnings: [],
  data: { subnet },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets") {
    res.end(JSON.stringify({ success: true, subnets: [subnet], cards: [subnetCard] }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets/14") {
    res.end(JSON.stringify({ success: true, subnet: detail, cards: [subnetCard] }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/discover") {
    res.end(JSON.stringify({
      success: true,
      goal: "compute",
      matches: [{ subnet, score: 12, reasons: ["The goal needs compute, hosting, or infrastructure."] }],
      cards: [subnetCard],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/bittensor/wallet/")) {
    res.end(JSON.stringify({
      success: true,
      wallet: {
        ss58Address: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: "2026-06-09T00:00:00.000Z",
        message: "Mock provider unavailable",
      },
      cards: [{
        kind: "wallet_snapshot",
        title: "Bittensor wallet snapshot",
        items: [{ label: "Positions", value: "0" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/actions/quote") {
    res.end(JSON.stringify({
      success: true,
      quote: {
        action: "stake",
        netuid: 14,
        amountTao: 1,
        expectedAlpha: 2,
        feeTao: 0.0001,
        slippageBps: 25,
        warnings: ["Quote only. External signature required."],
        requiresExternalSignature: true,
      },
      cards: [{
        kind: "staking_quote",
        title: "Stake quote",
        items: [{ label: "Amount", value: "1 TAO" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/plan") {
    res.end(JSON.stringify({
      success: true,
      plan: {
        intent: "discover",
        confidence: 0.82,
        summary: "Mock Bittensor discover workflow",
        userGoal: "find compute subnets",
        netuids: [14],
        ss58Address: null,
        steps: ["Find matching subnets"],
        suggestedToolNames: ["bittensor_find_subnets_for_goal"],
        safetyNotes: ["External signer required for signed actions."],
        responseCards: ["subnet_comparison"],
        requiresClarification: false,
        clarificationQuestion: null,
      },
      cards: [{
        kind: "subnet_result",
        title: "Bittensor chat plan",
        items: [{ label: "Intent", value: "Discover" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    res.end(JSON.stringify({
      success: true,
      plan: {
        intent: "discover",
        confidence: 0.82,
        summary: "Mock Bittensor discover workflow",
        userGoal: "which subnet is useful for image generation?",
        netuids: [],
        ss58Address: null,
        steps: ["Find matching subnets"],
        suggestedToolNames: ["bittensor_chat"],
        safetyNotes: ["External signer required for signed actions."],
        responseCards: ["subnet_comparison"],
        requiresClarification: false,
        clarificationQuestion: null,
      },
      responseText: "I found 1 Bittensor subnet candidate for image generation.",
      cards: [subnetCard],
      data: { discovery: { goal: "image generation" } },
      warnings: ["External signer required for signed actions."],
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
      context: {
        id: "bt-chat-mockcontext",
        ss58Address: null,
        netuid: 14,
        amountTao: null,
        validatorHotkey: null,
        coldkey: null,
        recipient: null,
        destination: null,
        lastIntent: "discover",
        lastExecution: "answered",
        updatedAt: "2026-06-09T00:00:00.000Z",
        warnings: [],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    res.end(JSON.stringify({
      success: true,
      capabilities: [{
        netuid: 14,
        name: "TAOHash",
        category: "Compute and infrastructure",
        utilitySummary: subnet.benefitSummary,
        capabilityLevel: "adapter_required",
        userBenefits: ["Inspect compute-oriented subnet context."],
        examplePrompts: ["Explain subnet 14."],
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"],
        serviceAdapter: "compute",
        requiredAuth: "unknown",
        costModel: "unknown",
        requestSchema: {},
        resultSchema: {},
        dataFreshness: { source: "mock", block: null, freshness: null, updatedAt: "2026-06-09T00:00:00.000Z", liveReadReady: true },
        adapterStatus: { configured: false, adapter: "compute", message: "No compute adapter configured.", requiredAuth: "unknown", costModel: "unknown" },
        safetyNotes: ["External signer required."],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities/14") {
    res.end(JSON.stringify({
      success: true,
      capability: {
        netuid: 14,
        name: "TAOHash",
        category: "Compute and infrastructure",
        utilitySummary: subnet.benefitSummary,
        capabilityLevel: "adapter_required",
        userBenefits: ["Inspect compute-oriented subnet context."],
        examplePrompts: ["Explain subnet 14."],
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"],
        serviceAdapter: "compute",
        requiredAuth: "unknown",
        costModel: "unknown",
        requestSchema: {},
        resultSchema: {},
        dataFreshness: { source: "mock", block: null, freshness: null, updatedAt: "2026-06-09T00:00:00.000Z", liveReadReady: true },
        adapterStatus: { configured: false, adapter: "compute", message: "No compute adapter configured.", requiredAuth: "unknown", costModel: "unknown" },
        safetyNotes: ["External signer required."],
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/sidecar/status") {
    res.end(JSON.stringify({
      success: true,
      sidecar: {
        configured: false,
        network: "finney",
        canRead: false,
        canPrepare: false,
        canSubmit: false,
        message: "Mock sidecar disabled",
      },
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/sidecar/health") {
    res.end(JSON.stringify({
      success: true,
      health: {
        configured: false,
        network: "finney",
        canRead: false,
        canPrepare: false,
        canSubmit: false,
        reachable: false,
        status: "unconfigured",
        latencyMs: null,
        checkedAt: "2026-06-09T00:00:00.000Z",
        message: "Mock sidecar disabled",
      },
      cards: [{
        kind: "signer_status",
        title: "Subtensor sidecar health",
        items: [{ label: "Reachable", value: "No" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    res.end(JSON.stringify({
      success: true,
      report: {
        status: "warning",
        checkedAt: "2026-06-09T00:00:00.000Z",
        checks: [
          { id: "chat_intents", label: "Chat intent planner", status: "pass", summary: "Core Bittensor chat intents classify." },
          { id: "sidecar_status", label: "Subtensor sidecar status", status: "warning", summary: "Sidecar not configured." },
        ],
        blockers: [],
        warnings: ["Subtensor sidecar status: Sidecar not configured."],
        nextActions: ["Configure a Subtensor sidecar for live-chain checks."],
      },
      cards: [{
        kind: "readiness_report",
        title: "Bittensor readiness audit",
        items: [{ label: "Warnings", value: "1" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/prepare") {
    res.end(JSON.stringify({
      success: true,
      preview: {
        action: "stake",
        network: "finney",
        netuid: 14,
        amountTao: 1,
        coldkey: null,
        hotkey: null,
        destination: null,
        feeTao: 0.0001,
        slippageBps: 25,
        expectedAlpha: 2,
        unsignedPayload: { action: "stake", netuid: 14, amountTao: 1 },
        signer: { mode: "desktop_handoff", available: true, canSign: false, canSubmit: false, network: "finney", address: null, message: "Mock signer" },
        warnings: ["External signature required."],
        consequenceSummary: "If signed, this stakes 1 TAO.",
        requiresExternalSignature: true,
      },
      cards: [{
        kind: "signed_action_review",
        title: "Stake review",
        items: [{ label: "Amount", value: "1 TAO" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/handoff") {
    res.end(JSON.stringify({
      success: true,
      handoff: {
        id: "bt-handoff-mock",
        action: "stake",
        network: "finney",
        netuid: 14,
        payload: { action: "stake", netuid: 14, amountTao: 1 },
        payloadJson: "{\"action\":\"stake\",\"amountTao\":1,\"netuid\":14}",
        payloadSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        suggestedFilename: "bittensor-stake-subnet-14-0123456789.json",
        signerMode: "desktop_handoff",
        createdAt: "2026-06-09T00:00:00.000Z",
        expiresAt: "2026-06-09T00:10:00.000Z",
        instructions: ["Review the payload checksum."],
        warnings: ["External signature required."],
        consequenceSummary: "If signed, this stakes 1 TAO.",
      },
      cards: [{
        kind: "signing_handoff",
        title: "External signing handoff",
        items: [{ label: "Payload SHA-256", value: "0123456789abcdef0123" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/submit") {
    res.end(JSON.stringify({
      success: true,
      result: { status: "sidecar_unavailable", txHash: null, blockHash: null, message: "Mock sidecar unavailable", explorerUrl: null },
      cards: [{
        kind: "signed_action_review",
        title: "Bittensor action not submitted",
        items: [{ label: "Status", value: "Sidecar Unavailable" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    res.end(JSON.stringify({
      success: true,
      invocation: { netuid: 14, intent: "metagraph", adapter: "universal", supported: true, result: { metagraphSummary: detail.metagraphSummary }, message: "Mock invocation", warnings: [] },
      cards: [{
        kind: "subnet_result",
        title: "Subnet 14 result",
        items: [{ label: "Supported", value: "Yes" }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/validators/compare") {
    res.end(JSON.stringify({
      success: true,
      comparison: {
        netuid: 14,
        subnetName: "TAOHash",
        strategy: "balanced",
        candidates: [{
          netuid: 14,
          subnetName: "TAOHash",
          uid: 1,
          hotkey: VALID_SS58,
          coldkey: VALID_SS58,
          stake: 1000,
          trust: 0.9,
          dividends: 0.2,
          score: 100,
          reasons: ["Stake sample: 1,000.", "Trust sample: 0.9.", "Dividend sample: 0.2."],
          warnings: ["Informational only."],
          source: "mock",
        }],
        warnings: ["Informational only."],
        source: "mock",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
      cards: [{
        kind: "validator_selection",
        title: "Validator candidate 1",
        items: [{ label: "Hotkey", value: "5Grw..." }],
      }],
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    res.end(JSON.stringify({
      success: true,
      watch: { id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" },
      watches: [],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Netuid", value: "14" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    res.end(JSON.stringify({
      success: true,
      watches: [{ id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" }],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Netuid", value: "14" }],
      }],
    }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/check") {
    res.end(JSON.stringify({
      success: true,
      evaluations: [{
        watch: { id: "watch-1", kind: "subnet", label: "Watch subnet 14", netuid: 14, ss58Address: null, threshold: null, createdAt: "2026-06-09T00:00:00.000Z" },
        status: "ok",
        summary: "TAOHash metadata is available from mock.",
        observedValue: 128,
        threshold: null,
        source: "mock",
        checkedAt: "2026-06-09T00:00:00.000Z",
      }],
      cards: [{
        kind: "watchlist",
        title: "Watch subnet 14",
        items: [{ label: "Status", value: "Ok" }],
      }],
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: "not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn("node", [mcpPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MATTERHORN_SERVER_URL: `http://127.0.0.1:${port}` },
});

let buffer = "";
let stderr = "";
child.stdout.on("data", (data) => { buffer += data; });
child.stderr.on("data", (data) => { stderr += data; });

function ask(msg) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      child.off("exit", onExit);
    };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`MCP child exited with code ${code}\n${stderr.trim()}`));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for ${msg.method}\n${stderr.trim()}`));
    }, 5000);
    const interval = setInterval(() => {
      const lines = buffer.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === msg.id) {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(response);
            return;
          }
        } catch {}
      }
    }, 25);
    child.once("exit", onExit);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

try {
  await ask({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const tools = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = tools.result.tools.map((tool) => tool.name);
  for (const name of [
    "bittensor_list_subnets",
    "bittensor_explain_subnet",
    "bittensor_compare_subnets",
    "bittensor_get_wallet_positions",
    "bittensor_prepare_action",
    "bittensor_plan_from_chat",
    "bittensor_chat",
    "bittensor_find_subnets_for_goal",
    "bittensor_get_subnet_capabilities",
    "bittensor_get_sidecar_status",
    "bittensor_get_sidecar_health",
    "bittensor_readiness_audit",
    "bittensor_prepare_extrinsic",
    "bittensor_create_signing_handoff",
    "bittensor_submit_signed_extrinsic",
    "bittensor_invoke_subnet",
    "bittensor_compare_validators",
    "bittensor_create_watch",
    "bittensor_list_watches",
    "bittensor_check_watches",
  ]) {
    assert.ok(names.includes(name), `${name} should be registered`);
  }
  const bittensorSchemas = tools.result.tools.filter((tool) => tool.name.startsWith("bittensor_"));
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(bittensorSchemas)), false);

  const list = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "bittensor_list_subnets", arguments: { query: "hash" } } });
  assert.equal(JSON.parse(list.result.content[0].text).subnets.length, 1);
  assert.equal(JSON.parse(list.result.content[0].text).cards[0].kind, "subnet_comparison");

  const explain = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "bittensor_explain_subnet", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(explain.result.content[0].text).subnet.netuid, 14);

  const compare = await ask({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "bittensor_compare_subnets", arguments: { netuids: [14] } } });
  assert.equal(JSON.parse(compare.result.content[0].text).comparison.length, 1);

  const wallet = await ask({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "bittensor_get_wallet_positions", arguments: { ss58Address: VALID_SS58 } } });
  assert.equal(JSON.parse(wallet.result.content[0].text).wallet.providerStatus, "provider_unavailable");

  const quote = await ask({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "bittensor_prepare_action", arguments: { action: "stake", netuid: 14, amountTao: "1" } } });
  assert.equal(JSON.parse(quote.result.content[0].text).quote.requiresExternalSignature, true);
  assert.equal(JSON.parse(quote.result.content[0].text).cards[0].kind, "staking_quote");

  const plan = await ask({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "bittensor_plan_from_chat", arguments: { message: "Find compute subnets" } } });
  assert.equal(JSON.parse(plan.result.content[0].text).plan.intent, "discover");

  const chat = await ask({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "bittensor_chat", arguments: { message: "which subnet is useful for image generation?", limit: 5 } } });
  const chatPayload = JSON.parse(chat.result.content[0].text);
  assert.equal(chatPayload.execution, "answered");
  assert.equal(chatPayload.cards[0].kind, "subnet_comparison");
  assert.equal(chatPayload.context.id, "bt-chat-mockcontext");
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(chatPayload)), false);

  const find = await ask({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "bittensor_find_subnets_for_goal", arguments: { goal: "compute", limit: 3 } } });
  assert.equal(JSON.parse(find.result.content[0].text).subnets.length, 1);
  assert.equal(JSON.parse(find.result.content[0].text).matches[0].score, 12);

  const capabilities = await ask({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "bittensor_get_subnet_capabilities", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(capabilities.result.content[0].text).capability.netuid, 14);

  const sidecar = await ask({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "bittensor_get_sidecar_status", arguments: {} } });
  assert.equal(JSON.parse(sidecar.result.content[0].text).sidecar.configured, false);

  const sidecarHealth = await ask({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "bittensor_get_sidecar_health", arguments: {} } });
  assert.equal(JSON.parse(sidecarHealth.result.content[0].text).health.status, "unconfigured");
  assert.equal(JSON.parse(sidecarHealth.result.content[0].text).cards[0].kind, "signer_status");

  const readiness = await ask({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "bittensor_readiness_audit", arguments: {} } });
  assert.equal(JSON.parse(readiness.result.content[0].text).report.status, "warning");
  assert.equal(JSON.parse(readiness.result.content[0].text).cards[0].kind, "readiness_report");

  const preview = await ask({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "bittensor_prepare_extrinsic", arguments: { action: "stake", netuid: 14, amountTao: "1" } } });
  const previewPayload = JSON.parse(preview.result.content[0].text);
  assert.equal(previewPayload.preview.requiresExternalSignature, true);
  assert.equal(previewPayload.cards[0].kind, "signed_action_review");

  const handoff = await ask({ jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "bittensor_create_signing_handoff", arguments: { preview: previewPayload.preview } } });
  assert.equal(JSON.parse(handoff.result.content[0].text).handoff.payloadSha256.length, 64);
  assert.equal(JSON.parse(handoff.result.content[0].text).cards[0].kind, "signing_handoff");

  const submit = await ask({ jsonrpc: "2.0", id: 16, method: "tools/call", params: { name: "bittensor_submit_signed_extrinsic", arguments: { preview: { action: "stake" }, signature: "0x1234567890abcdef" } } });
  assert.equal(JSON.parse(submit.result.content[0].text).result.status, "sidecar_unavailable");

  const invoke = await ask({ jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "bittensor_invoke_subnet", arguments: { netuid: 14, intent: "metagraph" } } });
  assert.equal(JSON.parse(invoke.result.content[0].text).invocation.supported, true);
  assert.equal(JSON.parse(invoke.result.content[0].text).cards[0].kind, "subnet_result");

  const validators = await ask({ jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "bittensor_compare_validators", arguments: { netuid: 14, strategy: "balanced" } } });
  assert.equal(JSON.parse(validators.result.content[0].text).comparison.candidates.length, 1);
  assert.equal(JSON.parse(validators.result.content[0].text).cards[0].kind, "validator_selection");

  const watch = await ask({ jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "bittensor_create_watch", arguments: { kind: "subnet", netuid: 14, label: "Watch subnet 14" } } });
  assert.equal(JSON.parse(watch.result.content[0].text).watch.netuid, 14);

  const watchlist = await ask({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "bittensor_list_watches", arguments: {} } });
  assert.equal(JSON.parse(watchlist.result.content[0].text).watches.length, 1);

  const checkedWatches = await ask({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "bittensor_check_watches", arguments: {} } });
  assert.equal(JSON.parse(checkedWatches.result.content[0].text).evaluations[0].status, "ok");
  assert.equal(JSON.parse(checkedWatches.result.content[0].text).cards[0].kind, "watchlist");

  console.log("All Bittensor MCP smoke tests passed.");
} finally {
  child.kill();
  server.close();
}
