#!/usr/bin/env node

const args = process.argv.slice(2);

const arg = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const flag = (name) => args.includes(name);

const config = {
  serverUrl: (arg("--server-url") || arg("--openwork-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
  token: arg("--token") || arg("--openwork-token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "",
  ss58Address: arg("--ss58-address") || arg("--coldkey") || process.env.MATTERHORN_WORK_BITTENSOR_SS58 || "",
  coldkey: arg("--coldkey") || process.env.MATTERHORN_WORK_BITTENSOR_COLDKEY || "",
  validatorHotkey: arg("--validator-hotkey") || process.env.MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY || "",
  netuid: Number(arg("--netuid", "14")),
  amountTao: String(arg("--amount-tao", "1")),
  limit: Number(arg("--limit", "5")),
  strategy: arg("--strategy", "balanced"),
  rateTolerance: Number(arg("--rate-tolerance", "0.01")),
  timeoutMs: Number(arg("--timeout-ms", "15000")),
  json: flag("--json"),
  strict: flag("--strict"),
  requireReady: flag("--require-ready"),
};

const stages = [];
const artifacts = {};
const requests = [];

const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export)/i;

function add(status, id, label, extra = {}) {
  stages.push({ id, label, status, observedAt: new Date().toISOString(), ...extra });
}

function headers(hasBody = false) {
  const value = {};
  if (hasBody) value["Content-Type"] = "application/json";
  if (config.token) value.Authorization = `Bearer ${config.token}`;
  return value;
}

async function request(path, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const method = options.method || "GET";
  const body = options.body || null;
  requests.push({ method, path, body });
  try {
    assertNoForbiddenKeys(body, `request ${method} ${path}`);
    const response = await fetch(`${config.serverUrl}${path}`, {
      method,
      headers: headers(Boolean(body)),
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" ? parsed.message || parsed.error : parsed;
      throw new Error(`${method} ${path} failed: HTTP ${response.status}${message ? ` ${message}` : ""}`);
    }
    assertNoForbiddenKeys(parsed, `response ${method} ${path}`);
    return { body: parsed ?? { ok: true }, text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden secret-shaped field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

function cardKinds(value) {
  return Array.isArray(value?.cards)
    ? value.cards.map((card) => card?.kind).filter(Boolean)
    : [];
}

function hasCardKind(value, kind) {
  return cardKinds(value).includes(kind);
}

function expectExecution(value, expected) {
  if (value?.success !== true) throw new Error("response success was not true");
  if (expected && value.execution !== expected) {
    throw new Error(`expected execution ${expected}, received ${value.execution || "missing"}`);
  }
}

function expectCard(value, kind) {
  if (kind && !hasCardKind(value, kind)) {
    throw new Error(`expected card kind ${kind}, received ${cardKinds(value).join(", ") || "none"}`);
  }
}

function expectClarification(value, phrase) {
  if (value?.requiresClarification !== true && value?.execution !== "clarification_required") {
    throw new Error("expected clarification_required response");
  }
  const question = String(value?.clarificationQuestion || value?.responseText || "");
  if (phrase && !question.toLowerCase().includes(phrase.toLowerCase())) {
    throw new Error(`expected clarification to mention ${phrase}, received: ${question}`);
  }
}

async function runStep(id, label, fn) {
  try {
    const extra = await fn();
    add(extra?.status || "pass", id, label, extra || {});
  } catch (error) {
    add("fail", id, label, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function chat(message, body = {}) {
  return request("/api/bittensor/chat/execute", {
    method: "POST",
    body: {
      message,
      ...body,
    },
  });
}

async function runReadiness() {
  if (!config.token) {
    add("fail", "auth.client", "Client token configured", { hint: "Pass --token or set MATTERHORN_WORK_TOKEN." });
    return;
  }

  await runStep("bittensor.readiness", "Read Bittensor readiness", async () => {
    const readiness = await request("/api/bittensor/readiness");
    const report = readiness.body?.report || {};
    const status = report.status || (report.ready === true || readiness.body?.ready === true ? "ready" : null);
    const notReady = report.ready === false || status === "blocked" || status === "not_ready";
    artifacts.readinessStatus = status || null;
    return {
      status: notReady && config.requireReady ? "fail" : notReady ? "warn" : "pass",
      latencyMs: readiness.latencyMs,
      readinessStatus: status,
      hint: notReady ? "Bittensor readiness route responded, but report is not ready. Inspect sidecar/provider setup before production use." : undefined,
    };
  });
}

async function runCapabilityRegistry() {
  await runStep("bittensor.capabilities.list", "List subnet capability manifests", async () => {
    const result = await request("/api/bittensor/capabilities");
    const capabilities = Array.isArray(result.body?.capabilities) ? result.body.capabilities : [];
    if (result.body?.success !== true) {
      throw new Error("capability list response success was not true");
    }
    if (!capabilities.length) {
      throw new Error("capability list was empty");
    }
    artifacts.capabilityCount = capabilities.length;
    return {
      latencyMs: result.latencyMs,
      capabilityCount: capabilities.length,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.capabilities.subnet", "Read selected subnet capability manifest", async () => {
    const result = await request(`/api/bittensor/capabilities/${encodeURIComponent(String(config.netuid))}`);
    const capability = result.body?.capability || {};
    if (result.body?.success !== true) {
      throw new Error("subnet capability response success was not true");
    }
    if (Number(capability.netuid) !== config.netuid) {
      throw new Error(`expected capability netuid ${config.netuid}, received ${capability.netuid ?? "missing"}`);
    }
    if (!capability.capabilityLevel) {
      throw new Error("subnet capability did not include a capability level");
    }
    artifacts.selectedCapabilityLevel = capability.capabilityLevel;
    return {
      latencyMs: result.latencyMs,
      capabilityLevel: capability.capabilityLevel,
      serviceAdapter: capability.serviceAdapter || null,
    };
  });
}

async function runChatCore() {
  await runStep("bittensor.learn", "Answer beginner Bittensor explanation", async () => {
    const result = await chat("I'm new to Bittensor. Explain TAO, subnets, coldkeys, hotkeys, staking, and validators in simple language.");
    expectExecution(result.body, "answered");
    return {
      latencyMs: result.latencyMs,
      intent: result.body?.plan?.intent || null,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.wallet.clarification", "Clarify wallet reads without SS58", async () => {
    const result = await chat("show my TAO");
    expectClarification(result.body, "SS58");
    return {
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      clarificationQuestion: result.body?.clarificationQuestion || null,
    };
  });

  let walletContextId = "";
  if (config.ss58Address) {
    await runStep("bittensor.wallet.snapshot", "Read watch-only TAO wallet snapshot", async () => {
      const result = await chat("show my TAO", { ss58Address: config.ss58Address });
      expectExecution(result.body, "answered");
      expectCard(result.body, "wallet_snapshot");
      walletContextId = result.body?.context?.id || "";
      artifacts.bittensorContextId = walletContextId || null;
      return {
        latencyMs: result.latencyMs,
        execution: result.body?.execution,
        contextId: walletContextId || null,
        cards: cardKinds(result.body),
      };
    });

    await runStep("bittensor.wallet.stake_positions", "Read stake positions from public wallet context", async () => {
      const result = await chat("where am I staked?", walletContextId ? { contextId: walletContextId } : { ss58Address: config.ss58Address });
      expectExecution(result.body, "answered");
      expectCard(result.body, "wallet_snapshot");
      return {
        latencyMs: result.latencyMs,
        execution: result.body?.execution,
        cards: cardKinds(result.body),
      };
    });

    await runStep("bittensor.wallet.intelligence", "Analyze watch-only wallet risk and exposure", async () => {
      const result = await chat("analyze my TAO portfolio risk", walletContextId ? { contextId: walletContextId, ss58Address: config.ss58Address } : { ss58Address: config.ss58Address });
      expectExecution(result.body, "answered");
      expectCard(result.body, "intelligence_report");
      return {
        latencyMs: result.latencyMs,
        execution: result.body?.execution,
        cards: cardKinds(result.body),
      };
    });
  } else {
    add("skip", "bittensor.wallet.snapshot", "Read watch-only TAO wallet snapshot", { hint: "Pass --ss58-address with a public coldkey address to test wallet reads." });
    add("skip", "bittensor.wallet.stake_positions", "Read stake positions from public wallet context", { hint: "Pass --ss58-address with a public coldkey address to test stake-position reads." });
    add("skip", "bittensor.wallet.intelligence", "Analyze watch-only wallet risk and exposure", { hint: "Pass --ss58-address with a public coldkey address to test wallet intelligence." });
  }

  await runStep("bittensor.discover.image", "Discover image-generation subnets", async () => {
    const result = await chat("which Bittensor subnet is useful for image generation?", { limit: config.limit });
    expectExecution(result.body, "answered");
    expectCard(result.body, "subnet_comparison");
    return {
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.subnet.intelligence", "Analyze subnet risk and live-data quality", async () => {
    const result = await chat(`analyze subnet ${config.netuid} risk`, { netuid: config.netuid });
    expectExecution(result.body, "answered");
    expectCard(result.body, "intelligence_report");
    return {
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.validators.compare", "Compare validators on a subnet", async () => {
    const result = await chat(`compare validators on subnet ${config.netuid}`, {
      netuid: config.netuid,
      limit: 6,
      strategy: config.strategy,
    });
    expectExecution(result.body, "answered");
    expectCard(result.body, "validator_selection");
    artifacts.validatorContextId = result.body?.context?.id || null;
    return {
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      contextId: result.body?.context?.id || null,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.stake.clarification", "Clarify staking preview without validator hotkey", async () => {
    const result = await chat(`prepare staking ${config.amountTao} TAO on subnet ${config.netuid}`, {
      netuid: config.netuid,
      amountTao: config.amountTao,
    });
    expectClarification(result.body, "validator hotkey");
    return {
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      cards: cardKinds(result.body),
      clarificationQuestion: result.body?.clarificationQuestion || null,
    };
  });

  if (config.validatorHotkey && (config.coldkey || config.ss58Address)) {
    let extrinsicPreview = null;
    await runStep("bittensor.stake.unsigned_preview", "Prepare unsigned external-signer staking preview", async () => {
      const result = await chat(`prepare staking ${config.amountTao} TAO on subnet ${config.netuid}`, {
        ss58Address: config.ss58Address || config.coldkey,
        coldkey: config.coldkey || config.ss58Address,
        netuid: config.netuid,
        amountTao: config.amountTao,
        validatorHotkey: config.validatorHotkey,
        rateTolerance: config.rateTolerance,
      });
      expectExecution(result.body, "unsigned_preview");
      expectCard(result.body, "signed_action_review");
      const preview = result.body?.data?.preview || {};
      if (preview.requiresExternalSignature !== true) {
        throw new Error("staking preview did not require an external signature");
      }
      return {
        latencyMs: result.latencyMs,
        execution: result.body?.execution,
        requiresExternalSignature: preview.requiresExternalSignature,
        cards: cardKinds(result.body),
      };
    });

    await runStep("bittensor.extrinsic.prepare", "Prepare lower-level unsigned extrinsic preview", async () => {
      const result = await request("/api/bittensor/extrinsics/prepare", {
        method: "POST",
        body: {
          action: "stake",
          netuid: config.netuid,
          amountTao: config.amountTao,
          coldkey: config.coldkey || config.ss58Address,
          hotkey: config.validatorHotkey,
          rateTolerance: config.rateTolerance,
        },
      });
      const preview = result.body?.preview || {};
      if (result.body?.success !== true) {
        throw new Error("extrinsic prepare response success was not true");
      }
      if (preview.requiresExternalSignature !== true) {
        throw new Error("extrinsic preview did not require an external signature");
      }
      extrinsicPreview = preview;
      artifacts.extrinsicPreviewAction = preview.action || null;
      return {
        latencyMs: result.latencyMs,
        action: preview.action || null,
        requiresExternalSignature: preview.requiresExternalSignature,
        cards: cardKinds(result.body),
      };
    });

    await runStep("bittensor.extrinsic.handoff", "Create checksumed external-signing handoff", async () => {
      if (!extrinsicPreview) {
        throw new Error("extrinsic preview was not available");
      }
      const result = await request("/api/bittensor/extrinsics/handoff", {
        method: "POST",
        body: { preview: extrinsicPreview },
      });
      const handoff = result.body?.handoff || {};
      const payloadSha256 = String(handoff.payloadSha256 || "");
      if (result.body?.success !== true) {
        throw new Error("extrinsic handoff response success was not true");
      }
      if (payloadSha256.length !== 64) {
        throw new Error("extrinsic handoff did not return a 64-character payload SHA-256");
      }
      artifacts.signingHandoffPayloadSha256 = payloadSha256;
      return {
        latencyMs: result.latencyMs,
        payloadSha256,
        cards: cardKinds(result.body),
      };
    });
  } else {
    add("skip", "bittensor.stake.unsigned_preview", "Prepare unsigned external-signer staking preview", {
      hint: "Pass --ss58-address or --coldkey plus --validator-hotkey to test the complete unsigned staking preview path.",
    });
    add("skip", "bittensor.extrinsic.prepare", "Prepare lower-level unsigned extrinsic preview", {
      hint: "Pass --ss58-address or --coldkey plus --validator-hotkey to test lower-level extrinsic preview generation.",
    });
    add("skip", "bittensor.extrinsic.handoff", "Create checksumed external-signing handoff", {
      hint: "Pass --ss58-address or --coldkey plus --validator-hotkey to test external-signing handoff creation.",
    });
  }

  await runStep("bittensor.subnet.unsupported_adapter", "Handle unsupported subnet service calls honestly", async () => {
    const result = await chat(`Use subnet ${config.netuid} for this task: summarize a short prompt through its service adapter.`, {
      netuid: config.netuid,
    });
    if (!["unsupported", "answered"].includes(result.body?.execution)) {
      throw new Error(`expected unsupported or answered service-call execution, received ${result.body?.execution || "missing"}`);
    }
    expectCard(result.body, result.body?.execution === "unsupported" ? "unsupported_adapter" : "subnet_result");
    const invocation = result.body?.data?.invocation || {};
    return {
      status: result.body?.execution === "unsupported" || invocation.supported === false ? "pass" : "warn",
      latencyMs: result.latencyMs,
      execution: result.body?.execution,
      adapterSupported: invocation.supported ?? null,
      hint: invocation.supported === true ? "A subnet adapter is configured, so the unsupported-adapter fallback was not exercised in this environment." : undefined,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.subnet.invocation_preview", "Preview subnet adapter request before invocation", async () => {
    const result = await request(`/api/bittensor/subnets/${encodeURIComponent(String(config.netuid))}/preview`, {
      method: "POST",
      body: {
        intent: "service_call",
        task: `Live QA preview for subnet ${config.netuid}`,
      },
    });
    const preview = result.body?.preview || {};
    const requestSha256 = String(preview.requestSha256 || "");
    if (result.body?.success !== true) {
      throw new Error("subnet invocation preview response success was not true");
    }
    if (requestSha256.length !== 64) {
      throw new Error("subnet invocation preview did not return a 64-character request SHA-256");
    }
    if (preview.requiresConfirmation !== true) {
      throw new Error("subnet invocation preview did not require confirmation");
    }
    artifacts.subnetPreviewRequestSha256 = requestSha256;
    return {
      latencyMs: result.latencyMs,
      requestSha256,
      requiresConfirmation: preview.requiresConfirmation,
      adapterSupported: preview.supported ?? null,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.monitoring.watch_create", "Create Bittensor monitoring watch", async () => {
    const result = await request("/api/bittensor/monitoring/watchlist", {
      method: "POST",
      body: {
        kind: "slippage",
        label: `Live QA slippage watch for subnet ${config.netuid}`,
        netuid: config.netuid,
        threshold: config.rateTolerance,
        reason: "Verify Bittensor watch creation and alert routing.",
      },
    });
    const watch = result.body?.watch || {};
    if (result.body?.success !== true) {
      throw new Error("watch create response success was not true");
    }
    if (!watch.id) {
      throw new Error("watch create response did not include a watch id");
    }
    artifacts.watchId = watch.id;
    return {
      latencyMs: result.latencyMs,
      watchId: watch.id,
      kind: watch.kind || null,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.monitoring.watch_list", "List Bittensor monitoring watches", async () => {
    const result = await request("/api/bittensor/monitoring/watchlist");
    const watches = Array.isArray(result.body?.watches) ? result.body.watches : [];
    if (result.body?.success !== true) {
      throw new Error("watch list response success was not true");
    }
    if (!watches.length) {
      throw new Error("watch list response did not include any watches");
    }
    artifacts.watchCount = watches.length;
    return {
      latencyMs: result.latencyMs,
      watchCount: watches.length,
      cards: cardKinds(result.body),
    };
  });

  await runStep("bittensor.monitoring.watch_check", "Evaluate Bittensor monitoring watches", async () => {
    const result = await request("/api/bittensor/monitoring/check");
    const evaluations = Array.isArray(result.body?.evaluations) ? result.body.evaluations : [];
    if (result.body?.success !== true) {
      throw new Error("watch check response success was not true");
    }
    if (!evaluations.length) {
      throw new Error("watch check response did not include evaluations");
    }
    const alertCount = evaluations.filter((evaluation) => evaluation?.status === "alert").length;
    const firstAlert = evaluations.find((evaluation) => evaluation?.alertKey || evaluation?.notificationIntent) || {};
    artifacts.watchEvaluationCount = evaluations.length;
    artifacts.watchAlertCount = alertCount;
    return {
      latencyMs: result.latencyMs,
      evaluationCount: evaluations.length,
      alertCount,
      alertKey: firstAlert.alertKey || null,
      notificationIntent: firstAlert.notificationIntent || null,
      cards: cardKinds(result.body),
    };
  });
}

function summarize() {
  return stages.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { pass: 0, warn: 0, fail: 0, skip: 0 });
}

function report() {
  const summary = summarize();
  return {
    ok: summary.fail === 0,
    ready: summary.fail === 0,
    serverUrl: config.serverUrl,
    checkedAt: new Date().toISOString(),
    summary,
    stages,
    artifacts,
    requestCount: requests.length,
    nextSteps: stages.map((item) => item.hint || item.error).filter(Boolean),
  };
}

function printReport(value) {
  console.log(`Matterhorn Work Bittensor live QA: ${value.ready ? "ready" : "not ready"}`);
  console.log(`Checks: ${value.summary.pass} pass, ${value.summary.warn} warn, ${value.summary.fail} fail, ${value.summary.skip} skip`);
  for (const item of value.stages) {
    const latency = typeof item.latencyMs === "number" ? ` ${item.latencyMs}ms` : "";
    console.log(`- ${item.status.toUpperCase()} ${item.label}${latency}`);
    if (item.error) console.log(`  ${item.error}`);
    if (item.hint) console.log(`  ${item.hint}`);
  }
}

await runReadiness();
if (config.token) {
  await runCapabilityRegistry();
  await runChatCore();
}

const value = report();
assertNoForbiddenKeys(value, "Bittensor live QA report");

if (config.json) {
  console.log(JSON.stringify(value, null, 2));
} else {
  printReport(value);
}

if (config.strict && !value.ready) {
  process.exitCode = 1;
}
