#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_SERVER_URL = "http://127.0.0.1:4125";
const DEFAULT_TOKEN = "matterhorn-media-smoke-client-token";

function envFlag(name) {
  const value = process.env[name];
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

const forbiddenLeakKeys = [
  "OPENAI_API_KEY",
  "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
  "Authorization",
  "X-Matterhorn-Host-Token",
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "rawSignature",
  "signedPayload",
  "walletExport",
];

function parseArgs(argv) {
  const config = {
    serverUrl: process.env.MATTERHORN_PRODUCT_SMOKE_SERVER_URL ||
      process.env.MATTERHORN_WORK_SERVER_URL ||
      process.env.MATTERHORN_MEDIA_SMOKE_SERVER_URL ||
      DEFAULT_SERVER_URL,
    token: process.env.MATTERHORN_PRODUCT_SMOKE_TOKEN ||
      process.env.MATTERHORN_WORK_TOKEN ||
      process.env.MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN ||
      DEFAULT_TOKEN,
    workspaceId: process.env.MATTERHORN_PRODUCT_SMOKE_WORKSPACE_ID ||
      process.env.MATTERHORN_MEDIA_SMOKE_WORKSPACE_ID ||
      "",
    includeGeneratedMediaFlow: false,
    enforceLaunchScope: false,
    launchBilling: envFlag("VITE_MATTERHORN_BILLING_ENABLED"),
    launchGeneratedMedia: envFlag("VITE_MATTERHORN_GENERATED_MEDIA_ENABLED"),
    requireProduction: false,
    strict: false,
    dryRun: false,
    json: false,
    jsonOutput: "",
    markdownOutput: "",
    timeoutMs: 120_000,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--server-url":
        config.serverUrl = next();
        break;
      case "--token":
        config.token = next();
        break;
      case "--workspace-id":
        config.workspaceId = next();
        break;
      case "--include-generated-media-flow":
        config.includeGeneratedMediaFlow = true;
        break;
      case "--skip-generated-media-flow":
        config.includeGeneratedMediaFlow = false;
        break;
      case "--require-production":
        config.requireProduction = true;
        break;
      case "--enforce-launch-scope":
        config.enforceLaunchScope = true;
        break;
      case "--launch-billing":
        config.launchBilling = true;
        break;
      case "--launch-generated-media":
        config.launchGeneratedMedia = true;
        break;
      case "--timeout-ms":
        config.timeoutMs = Number(next());
        break;
      case "--strict":
        config.strict = true;
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--json":
        config.json = true;
        break;
      case "--json-output":
        config.jsonOutput = next();
        break;
      case "--markdown-output":
        config.markdownOutput = next();
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  config.serverUrl = config.serverUrl.replace(/\/+$/, "");
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }
  if (config.enforceLaunchScope && config.includeGeneratedMediaFlow && !config.launchGeneratedMedia) {
    throw new Error("--include-generated-media-flow requires --launch-generated-media when launch scope is enforced.");
  }
  return config;
}

function help() {
  return [
    "Matterhorn product-readiness smoke",
    "",
    "Checks the backend/product spine against a running Matterhorn server:",
    "- backend capabilities",
    "- workspace readiness",
    "- control plane",
    "- support report",
    "- data map and data controls",
    "- team access summary",
    "- project data ledger and redacted export",
    "- generated media history",
    "- billing provider and checkout/webhook readiness",
    "",
    "Usage:",
    "  pnpm dev:generated-media-smoke",
    "  pnpm smoke:product-readiness",
    "  node scripts/product-readiness-smoke.mjs --server-url <url> --token <token> --strict",
    "  node scripts/product-readiness-smoke.mjs --server-url <url> --token <token> --require-production --json",
    "  node scripts/product-readiness-smoke.mjs --dry-run --json",
    "  node scripts/product-readiness-smoke.mjs --dry-run --markdown-output product-readiness.md",
    "",
    "Add --include-generated-media-flow to also run the full image -> Walrus -> Sui NFT receipt flow.",
    "Add --require-production to reject mock billing and local/mock generated-media readiness.",
    "Add --enforce-launch-scope for release checks; optional services are skipped unless enabled with --launch-billing or --launch-generated-media.",
  ].join("\n");
}

function buildPlannedStages(config) {
  const stages = [
    ["workspace.resolve", "Resolve active workspace"],
    ["production.cors_readiness", "Check production CORS readiness"],
    ["backend.capabilities", "Read backend capabilities"],
    ["workspace.readiness", "Read workspace readiness"],
    ["backend.control_plane", "Read workspace control plane"],
    ["backend.support_report", "Read redacted support report"],
    ["backend.data_map", "Read workspace data map"],
    ["backend.data_controls", "Read data controls"],
    ["team.access_summary", "Read local team access summary"],
    ["ledger.project", "Read project data ledger"],
    ["ledger.export", "Read redacted data ledger export"],
    ["billing.production_readiness", "Read billing production readiness", "billing"],
    ["generated_media.production_readiness", "Read generated media production readiness", "generated-media"],
    ["generated_media.history", "Read generated media history", "generated-media"],
  ].map(([id, label, optionalFeature]) => ({ id, label, optionalFeature }));
  if (config.includeGeneratedMediaFlow) {
    stages.push({ id: "generated_media.flow", label: "Run image to Sui NFT receipt flow smoke", optionalFeature: "generated-media" });
  }
  return stages;
}

function launchFeatureEnabled(config, feature) {
  if (feature === "billing") return config.launchBilling;
  if (feature === "generated-media") return config.launchGeneratedMedia;
  return true;
}

function launchScopeSkipReason(feature) {
  return `${feature} is not included in this stable launch scope`;
}

async function fetchJson(config, path, init = {}) {
  const response = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${init.method || "GET"} ${path} -> ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function unwrap(payload) {
  return payload?.payload ?? payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoLeaks(payload, config, stageId) {
  const serialized = JSON.stringify(payload);
  if (config.token && serialized.includes(config.token)) {
    throw new Error(`${stageId} leaked the client token`);
  }
  for (const key of forbiddenLeakKeys) {
    if (serialized.includes(key)) {
      throw new Error(`${stageId} exposed forbidden secret marker ${key}`);
    }
  }
  if (/(sk-[A-Za-z0-9_-]{20,}|owt_[A-Za-z0-9._-]{16,})/.test(serialized)) {
    throw new Error(`${stageId} exposed an API-key or Matterhorn-token shaped value`);
  }
}

function statusOf(value) {
  return typeof value?.status === "string" ? value.status : "unknown";
}

function summarizeCapabilityStatus(capabilities) {
  return {
    models: statusOf(capabilities.models),
    memory: statusOf(capabilities.memory),
    notes: statusOf(capabilities.notes),
    outputs: statusOf(capabilities.outputs),
    imageGeneration: statusOf(capabilities.imageGeneration),
    walrusStorage: statusOf(capabilities.walrusStorage),
    nftMinting: statusOf(capabilities.nftMinting),
    nftMarketplaceListing: statusOf(capabilities.nftMarketplaceListing),
  };
}

async function resolveWorkspaceId(config) {
  if (config.workspaceId) return config.workspaceId;
  const payload = await fetchJson(config, "/workspaces");
  const workspaceId = String(payload.activeId ?? payload.items?.[0]?.id ?? payload.workspaces?.[0]?.id ?? "").trim();
  if (!workspaceId) throw new Error("Matterhorn server did not report an active workspace.");
  return workspaceId;
}

function runGeneratedMediaFlow(config) {
  return new Promise((resolve) => {
    const args = [
      "scripts/generated-media-flow-smoke.mjs",
      "--server-url",
      config.serverUrl,
      "--token",
      config.token,
      "--strict",
      "--json",
    ];
    if (config.workspaceId) args.push("--workspace-id", config.workspaceId);
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let payload = null;
      try {
        payload = JSON.parse(stdout);
      } catch {
        // Keep payload null; stderr/stdout are reported below.
      }
      resolve({
        code,
        signal,
        payload,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
    });
  });
}

function runGeneratedMediaProductionReadiness(config) {
  return new Promise((resolve) => {
    const args = [
      "scripts/generated-media-production-readiness.mjs",
      "--server-url",
      config.serverUrl,
      "--token",
      config.token,
      "--json",
    ];
    if (config.workspaceId) args.push("--workspace-id", config.workspaceId);
    if (config.requireProduction) args.push("--require-production");
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let payload = null;
      try {
        payload = JSON.parse(stdout);
      } catch {
        // Keep payload null; stderr/stdout are reported below.
      }
      resolve({
        code,
        signal,
        payload,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
    });
  });
}

function runProductionCorsReadiness(config) {
  return new Promise((resolve) => {
    const args = [
      "scripts/production-cors-readiness.mjs",
      "--require-production",
      "--json",
    ];
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      let payload = null;
      try {
        payload = JSON.parse(stdout);
      } catch {
        // Keep payload null; stderr/stdout are reported below.
      }
      resolve({
        code,
        signal,
        payload,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
    });
  });
}

function billingProductionReadinessFailure(status) {
  const checks = Array.isArray(status?.setup?.checks) ? status.setup.checks : [];
  const error = new Error("production readiness requires verified Stripe test checkout and webhooks");
  error.payload = {
    mode: status?.mode ?? "unknown",
    provider: status?.provider ?? "unknown",
    readyForTestCheckout: status?.setup?.readyForTestCheckout === true,
    readyForWebhooks: status?.setup?.readyForWebhooks === true,
    livePaymentsEnabled: status?.setup?.livePaymentsEnabled === true,
    checks: checks.map((check) => ({
      id: check.id,
      status: check.status,
    })),
  };
  return error;
}

function generatedMediaReadinessFailure(result) {
  const blockers = Array.isArray(result.payload?.blockers) ? result.payload.blockers : [];
  const error = new Error(
    `generated media production readiness is blocked by ${blockers.length || "unreported"} setup requirement${blockers.length === 1 ? "" : "s"}`,
  );
  error.payload = {
    mode: result.payload?.mode ?? "unknown",
    status: result.payload?.status ?? "unknown",
    ready: result.payload?.ready === true,
    blockerCount: blockers.length,
    blockers: blockers.map((blocker) => ({
      key: blocker.key,
      label: blocker.label,
      status: blocker.status,
    })),
  };
  return error;
}

function deriveLaunchBlockers(stages) {
  return stages
    .filter((stage) => stage.status === "fail")
    .map((stage) => {
      if (stage.id === "billing.production_readiness") {
        return {
          id: "billing.stripe_test",
          stageId: stage.id,
          owner: "Matterhorn operator",
          label: "Stripe test billing",
          action: "Configure Stripe test checkout and signed webhooks, then verify both paths while live charging stays disabled.",
          checks: Array.isArray(stage.details?.checks) ? stage.details.checks : [],
        };
      }
      if (stage.id === "generated_media.production_readiness") {
        const requirements = Array.isArray(stage.details?.blockers)
          ? stage.details.blockers.map((blocker) => ({ label: blocker.label, status: blocker.status }))
          : [];
        return {
          id: "generated_media.platform_setup",
          stageId: stage.id,
          owner: "Matterhorn operator",
          label: "Generated-media production services",
          action: requirements.length > 0
            ? `Configure and verify: ${requirements.map((item) => item.label).join(", ")}.`
            : "Configure and verify the production image, storage, and Sui publishing services.",
          requirements,
        };
      }
      if (stage.id === "generated_media.flow" && stage.details?.code === "billing_entitlement_limit_reached") {
        return {
          id: "generated_media.entitlement",
          stageId: stage.id,
          owner: "Workspace billing owner",
          label: "Generated-image allowance",
          action: stage.details?.resetsAt
            ? `Use a legitimate Plus or Max test entitlement, or wait for the allowance to reset at ${stage.details.resetsAt}.`
            : "Use a legitimate Plus or Max test entitlement, or wait for the workspace allowance to reset.",
          used: stage.details?.used ?? null,
          limit: stage.details?.limit ?? null,
          resetsAt: stage.details?.resetsAt ?? null,
        };
      }
      return {
        id: stage.id,
        stageId: stage.id,
        owner: "Matterhorn operator",
        label: stage.label,
        action: stage.error || "Review and resolve this failed launch check.",
      };
    });
}

function generatedMediaFlowFailure(result) {
  const stages = Array.isArray(result.payload?.stages) ? result.payload.stages : [];
  const failedStage = stages.find((stage) => stage.status === "fail");
  const details = failedStage?.details?.details && typeof failedStage.details.details === "object"
    ? failedStage.details.details
    : {};
  const error = new Error(
    `generated media flow stopped at ${failedStage?.id ?? "unknown stage"}: ${failedStage?.details?.message ?? failedStage?.error ?? "flow did not report ready"}`,
  );
  error.payload = {
    failedStage: failedStage?.id ?? null,
    code: failedStage?.details?.code ?? null,
    entitlementKey: details.entitlementKey ?? null,
    currentPlanId: details.currentPlanId ?? null,
    used: details.used ?? null,
    limit: details.limit ?? null,
    resetsAt: details.resetsAt ?? null,
  };
  return error;
}

function markdownEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ")
    .replace(/(sk-[A-Za-z0-9_-]{20,}|owt_[A-Za-z0-9._-]{16,})/g, "<redacted>")
    .trim();
}

function redactMarkdownText(value) {
  let text = String(value ?? "");
  for (const key of forbiddenLeakKeys) {
    text = text.split(key).join("<redacted>");
  }
  return markdownEscape(text);
}

function summarizeArtifactForMarkdown(value) {
  if (value == null) return "";
  const serialized = JSON.stringify(value);
  return redactMarkdownText(serialized.length > 500 ? `${serialized.slice(0, 500)}...` : serialized);
}

async function runProductReadinessSmoke(config) {
  const report = {
    ready: false,
    dryRun: config.dryRun,
    metadata: {
      generatedAt: new Date().toISOString(),
      serverUrl: config.serverUrl,
      workspaceId: "",
      requireProduction: config.requireProduction,
      launchScope: {
        enforced: config.enforceLaunchScope,
        billing: config.launchBilling,
        generatedMedia: config.launchGeneratedMedia,
      },
    },
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
      trainingUse: "none_by_default",
    },
    summary: {
      pass: 0,
      fail: 0,
      skip: 0,
    },
    launchBlockers: [],
    artifacts: {},
    stages: [],
  };

  if (config.dryRun) {
    report.ready = true;
    report.stages = buildPlannedStages(config).map((stage) => {
      const skipped = Boolean(
        config.enforceLaunchScope && stage.optionalFeature && !launchFeatureEnabled(config, stage.optionalFeature),
      );
      return {
        id: stage.id,
        label: stage.label,
        status: skipped ? "skip" : "planned",
        ...(skipped ? { reason: launchScopeSkipReason(stage.optionalFeature) } : {}),
        command: stage.id === "generated_media.flow"
        ? ["node", "scripts/generated-media-flow-smoke.mjs", "--strict"]
        : stage.id === "billing.production_readiness"
          ? ["GET", "<server>", "/workspace/<id>/billing/status"]
        : stage.id === "generated_media.production_readiness"
          ? [
              "node",
              "scripts/generated-media-production-readiness.mjs",
              ...(config.requireProduction ? ["--require-production"] : []),
              "--json",
            ]
        : stage.id === "production.cors_readiness"
          ? ["node", "scripts/production-cors-readiness.mjs", "--require-production"]
        : ["GET", "<server>", stage.id],
      };
    });
    return report;
  }

  async function stage(id, label, run) {
    const startedAt = Date.now();
    try {
      const result = await run();
      assertNoLeaks(result, config, id);
      report.stages.push({ id, label, status: "pass", durationMs: Date.now() - startedAt });
      report.summary.pass += 1;
      return result;
    } catch (error) {
      report.stages.push({
        id,
        label,
        status: "fail",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        details: error?.payload,
      });
      report.summary.fail += 1;
      return null;
    }
  }

  function skipStage(id, label, feature) {
    report.stages.push({
      id,
      label,
      status: "skip",
      durationMs: 0,
      reason: launchScopeSkipReason(feature),
    });
    report.summary.skip += 1;
  }

  try {
    const workspaceId = await stage("workspace.resolve", "Resolve active workspace", () => resolveWorkspaceId(config));
    if (!workspaceId) {
      report.launchBlockers = deriveLaunchBlockers(report.stages);
      return report;
    }
    report.metadata.workspaceId = workspaceId;

    await stage("production.cors_readiness", "Check production CORS readiness", async () => {
      const result = await runProductionCorsReadiness(config);
      assert(result.code === 0, result.stderr || result.stdout || "production CORS readiness failed");
      assert(result.payload?.version === "matterhorn.production-cors-readiness.v1", "production CORS readiness version mismatch");
      assert(result.payload?.ready === true, "production CORS readiness did not report ready");
      report.artifacts.productionCors = {
        defaultCors: result.payload.policy?.defaultCors,
        productionWildcardAllowed: result.payload.policy?.productionWildcardAllowed,
        checks: result.payload.checks?.map((check) => ({ id: check.id, status: check.status })) ?? [],
      };
      return result.payload;
    });

    const capabilities = await stage("backend.capabilities", "Read backend capabilities", async () => {
      const payload = unwrap(await fetchJson(config, "/api/backend/capabilities"));
      assert(payload.version === "matterhorn.backend.capabilities.v1", "capabilities version mismatch");
      assert(payload.models?.routing?.answerPath, "capabilities missing model answer path");
      assert(payload.wallets?.families?.sui, "capabilities missing Sui wallet family");
      assert(payload.wallets?.families?.bittensor, "capabilities missing Bittensor wallet family");
      assert(payload.imageGeneration, "capabilities missing image generation");
      assert(payload.nftMinting, "capabilities missing NFT minting");
      assert(payload.nftMarketplaceListing, "capabilities missing NFT marketplace listing");
      report.artifacts.capabilities = summarizeCapabilityStatus(payload);
      return payload;
    });

    await stage("workspace.readiness", "Read workspace readiness", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/readiness`));
      assert(payload.version === "matterhorn.backend.readiness.v1", "readiness version mismatch");
      assert(payload.features?.save_notes?.ready === true, "notes should be save-ready");
      assert(payload.features?.review_memory?.ready === true, "memory review should be ready");
      assert(payload.features?.export_evidence?.ready === true, "evidence export should be ready");
      report.artifacts.readiness = {
        status: payload.summary?.status,
        blockingChecks: payload.summary?.blockingChecks ?? [],
        recommendedActions: (payload.summary?.recommendedActions ?? []).map((action) => action.actionId),
      };
      return payload;
    });

    await stage("backend.control_plane", "Read workspace control plane", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/control-plane`));
      assert(payload.version === "matterhorn.backend.control-plane.v1", "control-plane version mismatch");
      assert(payload.privacy?.trainingUse === "none_by_default", "control-plane training policy mismatch");
      assert(payload.privacy?.secretsReturned === false, "control-plane should report no returned secrets");
      assert(payload.capabilities?.imageGeneration, "control-plane missing generated media capabilities");
      assert(payload.dataMap?.stores?.imageOutputs, "control-plane missing image output store");
      assert(payload.dataControls?.stores?.imageOutputs, "control-plane missing image output controls");
      report.artifacts.controlPlane = {
        status: payload.summary?.status,
        readyFeatures: payload.summary?.readyFeatures,
        totalFeatures: payload.summary?.totalFeatures,
        exportableStores: payload.summary?.exportableStores,
      };
      return payload;
    });

    await stage("backend.support_report", "Read redacted support report", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/support-report`));
      assert(payload.version === "matterhorn.backend.support-report.v1", "support report version mismatch");
      assert(payload.controlPlane?.summary?.totalFeatures > 0, "support report missing control-plane summary");
      assert(payload.controlPlane?.capabilities === undefined, "support report should omit full capabilities payload");
      assert(payload.dataLedger?.export?.href === `/workspace/${workspaceId}/data-ledger/export`, "support report ledger export route mismatch");
      assert(payload.privacy?.trainingUse === "none_by_default", "support report training policy mismatch");
      report.artifacts.supportReport = {
        filename: payload.filename,
        warnings: payload.warnings?.length ?? 0,
        localTeamSharing: payload.teamAccess?.sharingMode?.current,
      };
      return payload;
    });

    await stage("backend.data_map", "Read workspace data map", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/data-map`));
      assert(payload.version === "matterhorn.backend.data-map.v1", "data map version mismatch");
      for (const store of ["notes", "memory", "outputs", "imageOutputs", "feedback", "dataPolicy"]) {
        assert(payload.stores?.[store], `data map missing ${store}`);
      }
      assert(payload.policy?.trainingUse === "none_by_default", "data map training policy mismatch");
      report.artifacts.dataMap = {
        stores: Object.keys(payload.stores ?? {}).sort(),
        imageOutputsStatus: payload.stores.imageOutputs?.status,
      };
      return payload;
    });

    await stage("backend.data_controls", "Read data controls", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/data-controls`));
      assert(payload.version === "matterhorn.backend.data-controls.v1", "data controls version mismatch");
      assert(payload.stores?.imageOutputs?.export, "data controls missing image output export control");
      assert(payload.policy?.trainingUse === "none_by_default", "data controls training policy mismatch");
      report.artifacts.dataControls = {
        totalStores: payload.summary?.totalStores,
        exportableStores: payload.summary?.exportableStores,
        userControlledStores: payload.summary?.userControlledStores,
      };
      return payload;
    });

    await stage("team.access_summary", "Read local team access summary", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/backend/team-access/summary`));
      assert(payload.version === "matterhorn.backend.team-access.v1", "team access version mismatch");
      assert(payload.sharingMode?.current === "local_tokens", "team access should expose local token sharing");
      assert(payload.scopeCapabilities?.viewer?.canWriteWorkspace === false, "viewer scope should be read-only");
      assert(payload.scopeCapabilities?.collaborator?.canWriteWorkspace === true, "collaborator scope should write");
      assert(payload.policy?.secretsReturned === false, "team access should not return secrets");
      report.artifacts.teamAccess = {
        mode: payload.sharingMode.current,
        cloudTeamsStatus: payload.sharingMode.cloudTeamsStatus,
        tokenCount: payload.localAccess?.tokenCount,
      };
      return payload;
    });

    await stage("ledger.project", "Read project data ledger", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/data-ledger?limit=20`));
      assert(payload.version === "matterhorn.project-data-ledger.v1", "project data ledger version mismatch");
      assert(payload.policy?.trainingUse === "none_by_default", "ledger training policy mismatch");
      report.artifacts.ledger = {
        itemCount: payload.items?.length ?? 0,
        summary: payload.summary ?? {},
      };
      return payload;
    });

    await stage("ledger.export", "Read redacted data ledger export", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/data-ledger/export?limit=20`));
      assert(payload.version === "matterhorn.project-data-ledger-export.v1", "project data ledger export version mismatch");
      assert(payload.manifest?.backendContext?.included === true, "ledger export should include backend context summary");
      assert(payload.manifest?.trainingUse === "none_by_default", "ledger export training policy mismatch");
      assert(payload.backend?.controlPlane?.summary?.totalFeatures > 0, "ledger export missing sanitized control-plane summary");
      report.artifacts.ledgerExport = {
        filename: payload.filename,
        itemCount: payload.manifest?.itemCount,
        includes: payload.manifest?.includes ?? [],
      };
      return payload;
    });

    if (config.enforceLaunchScope && !config.launchBilling) {
      skipStage("billing.production_readiness", "Read billing production readiness", "billing");
    } else {
      await stage("billing.production_readiness", "Read billing production readiness", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/billing/status`));
      assert(payload.version === "matterhorn.billing.v1", "billing status version mismatch");
      const status = payload.status;
      assert(status?.setup, "billing status missing setup readiness");
      assert(status.setup.livePaymentsEnabled === false, "product readiness must not enable live charges");
      if (config.requireProduction) {
        const readyForProductionProbe = status.mode === "phase1_stripe_test" &&
          status.provider === "stripe" &&
          status.setup.readyForTestCheckout === true &&
          status.setup.readyForWebhooks === true;
        if (!readyForProductionProbe) throw billingProductionReadinessFailure(status);
      }
      report.artifacts.billingProductionReadiness = {
        mode: status.mode,
        provider: status.provider,
        readyForTestCheckout: status.setup.readyForTestCheckout,
        readyForWebhooks: status.setup.readyForWebhooks,
        livePaymentsEnabled: status.setup.livePaymentsEnabled,
        checks: Array.isArray(status.setup.checks)
          ? status.setup.checks.map((check) => ({ id: check.id, status: check.status }))
          : [],
      };
      return report.artifacts.billingProductionReadiness;
      });
    }

    if (config.enforceLaunchScope && !config.launchGeneratedMedia) {
      skipStage("generated_media.production_readiness", "Read generated media production readiness", "generated-media");
    } else {
      await stage("generated_media.production_readiness", "Read generated media production readiness", async () => {
      const result = await runGeneratedMediaProductionReadiness({ ...config, workspaceId });
      if (result.code !== 0) throw generatedMediaReadinessFailure(result);
      assert(result.payload?.version === "matterhorn.generated-media-production-readiness.v1", "generated media production readiness version mismatch");
      assert(result.payload?.ok === true, "generated media production readiness safety checks failed");
      assert(result.payload?.safety?.publicWritesDuringDiagnostics === false, "generated media production readiness performed public writes");
      assert(result.payload?.publicWritesOnlyAfterUserAction === true, "generated media production readiness lost public-write confirmation boundary");
      const safeSummary = {
        mode: result.payload.mode,
        status: result.payload.status,
        ready: result.payload.ready,
        canRunEndToEnd: result.payload.canRunEndToEnd,
        publicWritesOnlyAfterUserAction: result.payload.publicWritesOnlyAfterUserAction,
        blockerCount: Array.isArray(result.payload.blockers) ? result.payload.blockers.length : 0,
        stages: Array.isArray(result.payload.stages)
          ? result.payload.stages.map((stage) => ({ id: stage.id, status: stage.status, writeScope: stage.writeScope }))
          : [],
      };
      report.artifacts.generatedMediaProductionReadiness = safeSummary;
      return safeSummary;
      });
    }

    if (config.enforceLaunchScope && !config.launchGeneratedMedia) {
      skipStage("generated_media.history", "Read generated media history", "generated-media");
    } else {
      await stage("generated_media.history", "Read generated media history", async () => {
      const payload = unwrap(await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/generated-media/history?limit=20`));
      assert(payload.success === true, "generated media history should return success");
      assert(Array.isArray(payload.items), "generated media history should return items");
      assert(typeof payload.counts?.images === "number", "generated media history should return image counts");
      report.artifacts.generatedMediaHistory = {
        itemCount: payload.items?.length ?? 0,
        counts: payload.counts,
      };
      return payload;
      });
    }

    if (config.includeGeneratedMediaFlow) {
      await stage("generated_media.flow", "Run image to Sui NFT receipt flow smoke", async () => {
        const result = await runGeneratedMediaFlow({ ...config, workspaceId });
        if (result.code !== 0) throw generatedMediaFlowFailure(result);
        assert(result.payload?.ready === true, "generated media flow did not report ready");
        assert(result.payload?.safety?.nonCustodial === true, "generated media flow lost non-custodial safety");
        assert(result.payload?.safety?.liveSubmissionEnabled === false, "generated media flow must not enable live submission");
        report.artifacts.generatedMediaFlow = {
          stages: result.payload.stages?.map((stage) => stage.id) ?? [],
          imageId: result.payload.artifacts?.image?.id,
          draftId: result.payload.artifacts?.draft?.id,
        };
        return result.payload;
      });
    } else {
      report.stages.push({
        id: "generated_media.flow",
        label: "Run image to Sui NFT receipt flow smoke",
        status: "skip",
        reason: config.enforceLaunchScope && !config.launchGeneratedMedia
          ? launchScopeSkipReason("generated-media")
          : "Pass --include-generated-media-flow to exercise image, Walrus, and Sui NFT receipt routes.",
      });
      report.summary.skip += 1;
    }

    report.ready = report.summary.fail === 0;
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
  }

  report.launchBlockers = deriveLaunchBlockers(report.stages);

  return report;
}

function emitReport(report, config) {
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.markdownOutput) writeFileSync(config.markdownOutput, buildMarkdownReport(report));
  if (config.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`Matterhorn product-readiness smoke: ${report.ready ? "PASS" : "FAIL"}\n`);
  for (const stage of report.stages) {
    const reason = stage.reason ? ` (${stage.reason})` : "";
    const error = stage.error ? ` (${stage.error})` : "";
    process.stdout.write(`- ${String(stage.status).toUpperCase()} ${stage.id}: ${stage.label}${reason}${error}\n`);
  }
  for (const blocker of report.launchBlockers ?? []) {
    process.stdout.write(`- BLOCKED ${blocker.label} [${blocker.owner}]: ${blocker.action}\n`);
  }
  if (config.jsonOutput) process.stdout.write(`JSON report: ${config.jsonOutput}\n`);
  if (config.markdownOutput) process.stdout.write(`Markdown report: ${config.markdownOutput}\n`);
}

function buildMarkdownReport(report) {
  const lines = [
    "# Matterhorn Product Readiness",
    "",
    `Generated: ${markdownEscape(report.metadata.generatedAt)}`,
    `Workspace: ${markdownEscape(report.metadata.workspaceId || "unknown")}`,
    `Server: ${markdownEscape(report.metadata.serverUrl || "unknown")}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `Overall: ${report.ready ? "pass" : "fail"}`,
    "",
    "## Safety",
    "",
    `- Non-custodial: ${report.safety.nonCustodial ? "yes" : "no"}`,
    `- Live submission enabled: ${report.safety.liveSubmissionEnabled ? "yes" : "no"}`,
    `- Asks for secrets: ${report.safety.asksForSecrets ? "yes" : "no"}`,
    `- Training use: ${markdownEscape(report.safety.trainingUse || "unknown")}`,
    "",
    "## Summary",
    "",
    `- Passed: ${Number(report.summary.pass ?? 0)}`,
    `- Failed: ${Number(report.summary.fail ?? 0)}`,
    `- Skipped: ${Number(report.summary.skip ?? 0)}`,
    "",
    "## Launch blockers",
    "",
  ];

  if ((report.launchBlockers ?? []).length === 0) {
    lines.push("None.", "");
  } else {
    for (const blocker of report.launchBlockers) {
      lines.push(
        `- **${markdownEscape(blocker.label)}** (${markdownEscape(blocker.owner)}): ${redactMarkdownText(blocker.action)}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Stages",
    "",
    "| Stage | Status | Label | Detail |",
    "| --- | --- | --- | --- |",
  );

  for (const stage of report.stages) {
    const detail = stage.reason || stage.error || (Array.isArray(stage.command) ? stage.command.join(" ") : "");
    lines.push(`| ${markdownEscape(stage.id)} | ${markdownEscape(stage.status)} | ${markdownEscape(stage.label)} | ${redactMarkdownText(detail)} |`);
  }

  lines.push("", "## Artifacts", "");
  const artifactEntries = Object.entries(report.artifacts ?? {});
  if (artifactEntries.length === 0) {
    lines.push("- None");
  } else {
    lines.push("| Artifact | Summary |");
    lines.push("| --- | --- |");
    for (const [key, value] of artifactEntries) {
      lines.push(`| ${markdownEscape(key)} | ${summarizeArtifactForMarkdown(value)} |`);
    }
  }

  if (report.error) {
    lines.push("", "## Error", "", redactMarkdownText(report.error));
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(help());
    return;
  }
  const report = await runProductReadinessSmoke(config);
  emitReport(report, config);
  if ((config.strict || config.requireProduction) && !report.ready) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
