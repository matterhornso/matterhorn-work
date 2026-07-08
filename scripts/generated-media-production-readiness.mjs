#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_SERVER_URL = "http://127.0.0.1:4125";
const DEFAULT_TOKEN = "matterhorn-media-smoke-client-token";
const REPORT_VERSION = "matterhorn.generated-media-production-readiness.v1";

const forbiddenLeakKeys = [
  "X-Matterhorn-Host-Token",
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "rawSignature",
  "signedPayload",
  "walletExport",
];

const PRODUCTION_ENV_CHECKLIST = [
  {
    envVar: "MATTERHORN_IMAGE_PROVIDER",
    example: "openai",
    required: true,
    secret: false,
    description: "Selects the production image provider.",
  },
  {
    envVar: "OPENAI_API_KEY",
    example: "<openai-api-key>",
    required: true,
    secret: true,
    description: "Enables OpenAI image generation. Store the real value only in Matterhorn environment settings.",
  },
  {
    envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
    example: "https://publisher.example",
    required: true,
    secret: false,
    description: "Walrus publisher endpoint used after explicit public upload confirmation.",
  },
  {
    envVar: "MATTERHORN_WALRUS_RELAY_URL",
    example: "https://aggregator.example",
    required: true,
    secret: false,
    description: "Public Walrus relay or aggregator base URL for generated media.",
  },
  {
    envVar: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
    example: "3",
    required: true,
    secret: false,
    description: "Positive storage duration for Walrus uploads.",
  },
  {
    envVar: "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
    example: "<publisher-bearer-token>",
    required: false,
    secret: true,
    description: "Optional publisher auth token, never emitted in diagnostics or reports.",
  },
  {
    envVar: "MATTERHORN_SUI_NETWORK",
    example: "sui-testnet",
    required: true,
    secret: false,
    description: "Sui network for mint and listing previews. Use sui-testnet or sui-mainnet.",
  },
  {
    envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
    example: "0x...",
    required: true,
    secret: false,
    description: "Move package that exposes the Matterhorn NFT mint function.",
  },
  {
    envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
    example: "matterhorn_media",
    required: true,
    secret: false,
    description: "Move module name for NFT mint transaction plans.",
  },
  {
    envVar: "MATTERHORN_SUI_NFT_TYPE",
    example: "0x...::matterhorn_media::MatterhornNFT",
    required: false,
    secret: false,
    description: "Optional full NFT type override used by listing plans.",
  },
  {
    envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
    example: "0x...",
    required: true,
    secret: false,
    description: "Sui Kiosk package id used to build listing transaction plans.",
  },
  {
    envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
    example: "0x...",
    required: true,
    secret: false,
    description: "TransferPolicy package id used for marketplace-compatible listing plans.",
  },
  {
    envVar: "MATTERHORN_SUI_KIOSK_ID",
    example: "0x...",
    required: false,
    secret: false,
    description: "Optional default kiosk object id for automated smoke runs; users can still provide it in the UI.",
  },
  {
    envVar: "MATTERHORN_SUI_KIOSK_OWNER_CAP_ID",
    example: "0x...",
    required: false,
    secret: false,
    description: "Optional kiosk owner cap id for automated smoke runs.",
  },
  {
    envVar: "MATTERHORN_SUI_TRANSFER_POLICY_ID",
    example: "0x...",
    required: false,
    secret: false,
    description: "Optional transfer policy object id for automated smoke runs.",
  },
];

function parseArgs(argv) {
  const config = {
    serverUrl: process.env.MATTERHORN_GENERATED_MEDIA_READINESS_SERVER_URL ||
      process.env.MATTERHORN_PRODUCT_SMOKE_SERVER_URL ||
      process.env.MATTERHORN_WORK_SERVER_URL ||
      process.env.MATTERHORN_MEDIA_SMOKE_SERVER_URL ||
      DEFAULT_SERVER_URL,
    token: process.env.MATTERHORN_GENERATED_MEDIA_READINESS_TOKEN ||
      process.env.MATTERHORN_PRODUCT_SMOKE_TOKEN ||
      process.env.MATTERHORN_WORK_TOKEN ||
      process.env.MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN ||
      DEFAULT_TOKEN,
    workspaceId: process.env.MATTERHORN_GENERATED_MEDIA_READINESS_WORKSPACE_ID ||
      process.env.MATTERHORN_PRODUCT_SMOKE_WORKSPACE_ID ||
      process.env.MATTERHORN_MEDIA_SMOKE_WORKSPACE_ID ||
      "",
    requireProduction: false,
    json: false,
    jsonOutput: "",
    markdownOutput: "",
    timeoutMs: 30_000,
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
      case "--require-production":
        config.requireProduction = true;
        break;
      case "--timeout-ms":
        config.timeoutMs = Number(next());
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
  return config;
}

function help() {
  return [
    "Matterhorn generated-media production readiness",
    "",
    "Checks whether generated images, Walrus storage, and Sui NFT publishing are ready for a production-candidate run.",
    "This command performs no public writes. It only reads the generated-media diagnostics contract.",
    "",
    "Usage:",
    "  pnpm smoke:generated-media-production-readiness",
    "  node scripts/generated-media-production-readiness.mjs --server-url <url> --token <token> --require-production",
    "  node scripts/generated-media-production-readiness.mjs --workspace-id <id> --json-output readiness.json",
    "  node scripts/generated-media-production-readiness.mjs --workspace-id <id> --markdown-output readiness.md",
    "",
    "Exit behavior:",
    "  Default: exits nonzero only when diagnostics cannot be read or the safety contract is unsafe.",
    "  --require-production: also exits nonzero unless mode is production_candidate and end-to-end readiness is true.",
  ].join("\n");
}

async function fetchJson(config, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.serverUrl}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`GET ${path} -> ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`GET ${path} timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWorkspaceId(config) {
  if (config.workspaceId) return config.workspaceId;
  const payload = await fetchJson(config, "/workspaces");
  const workspaceId = String(payload.activeId ?? payload.items?.[0]?.id ?? payload.workspaces?.[0]?.id ?? "").trim();
  if (!workspaceId) throw new Error("Matterhorn server did not report an active workspace.");
  return workspaceId;
}

function summarizeRequirement(requirement) {
  return {
    key: String(requirement?.key ?? ""),
    label: String(requirement?.label ?? "Setup required"),
    status: String(requirement?.status ?? "missing"),
    envVar: typeof requirement?.envVar === "string" ? requirement.envVar : undefined,
    description: typeof requirement?.description === "string" ? requirement.description : undefined,
  };
}

function summarizeStage(stage) {
  return {
    id: String(stage?.id ?? ""),
    label: String(stage?.label ?? "Generated media stage"),
    status: String(stage?.status ?? "blocked"),
    writeScope: String(stage?.writeScope ?? "none"),
    requiresWallet: Boolean(stage?.requiresWallet),
    requiresPublicWrite: Boolean(stage?.requiresPublicWrite),
    summary: typeof stage?.summary === "string" ? stage.summary : "",
    setupRequirements: Array.isArray(stage?.setupRequirements)
      ? stage.setupRequirements.map(summarizeRequirement)
      : [],
  };
}

function summarizeCheck(check) {
  return {
    id: String(check?.id ?? ""),
    label: String(check?.label ?? "Diagnostic check"),
    status: String(check?.status ?? "unknown"),
    summary: typeof check?.summary === "string" ? check.summary : "",
  };
}

function buildEnvChecklist(blockers) {
  const blockersByEnv = new Map();
  for (const blocker of blockers) {
    if (blocker.envVar && !blockersByEnv.has(blocker.envVar)) {
      blockersByEnv.set(blocker.envVar, blocker);
    }
  }
  return PRODUCTION_ENV_CHECKLIST.map((entry) => {
    const blocker = blockersByEnv.get(entry.envVar);
    return {
      envVar: entry.envVar,
      example: entry.secret ? "<secret>" : entry.example,
      required: entry.required,
      secret: entry.secret,
      status: blocker?.status ?? "not_reported",
      description: blocker?.description ?? entry.description,
    };
  });
}

function assertNoLeaks(payload, config, label) {
  const serialized = JSON.stringify(payload);
  if (config.token && serialized.includes(config.token)) {
    throw new Error(`${label} leaked the client token`);
  }
  for (const key of forbiddenLeakKeys) {
    if (serialized.includes(key)) {
      throw new Error(`${label} exposed forbidden secret marker ${key}`);
    }
  }
  if (/(sk-[A-Za-z0-9_-]{20,}|owt_[A-Za-z0-9._-]{16,})/.test(serialized)) {
    throw new Error(`${label} exposed an API-key or Matterhorn-token shaped value`);
  }
}

function validateDiagnosticsSafety(diagnostics) {
  const safety = diagnostics?.safety ?? {};
  const plan = diagnostics?.productionSmokePlan ?? {};
  const failures = [];
  if (safety.custody !== false) failures.push("diagnostics must remain non-custodial");
  if (safety.canSubmit !== false) failures.push("diagnostics must not be able to submit transactions");
  if (safety.publicWritesDuringDiagnostics !== false) failures.push("diagnostics must not perform public writes");
  if (safety.storesSecrets !== false) failures.push("diagnostics must not store secrets");
  if (plan.publicWritesOnlyAfterUserAction !== true) failures.push("public writes must require explicit user action");
  return failures;
}

async function runGeneratedMediaProductionReadiness(config) {
  const report = {
    version: REPORT_VERSION,
    ok: false,
    ready: false,
    requireProduction: config.requireProduction,
    metadata: {
      generatedAt: new Date().toISOString(),
      serverUrl: config.serverUrl,
      workspaceId: "",
    },
    status: "unknown",
    mode: "unknown",
    summary: "",
    canRunEndToEnd: false,
    publicWritesOnlyAfterUserAction: false,
    safety: {
      custody: false,
      canSubmit: false,
      walletSigning: "client_wallet",
      publicWritesDuringDiagnostics: false,
      storesSecrets: false,
    },
    checks: [],
    stages: [],
    blockers: [],
    envChecklist: buildEnvChecklist([]),
    safetyFailures: [],
  };

  try {
    const workspaceId = await resolveWorkspaceId(config);
    report.metadata.workspaceId = workspaceId;
    const diagnostics = await fetchJson(config, `/workspace/${encodeURIComponent(workspaceId)}/generated-media/diagnostics`);
    assertNoLeaks(diagnostics, config, "generated-media diagnostics");

    const plan = diagnostics.productionSmokePlan ?? {};
    report.status = String(diagnostics.status ?? "unknown");
    report.summary = String(diagnostics.summary ?? plan.summary ?? "");
    report.mode = String(plan.mode ?? "unknown");
    report.canRunEndToEnd = Boolean(plan.canRunEndToEnd);
    report.publicWritesOnlyAfterUserAction = plan.publicWritesOnlyAfterUserAction === true;
    report.safety = {
      custody: diagnostics.safety?.custody === true,
      canSubmit: diagnostics.safety?.canSubmit === true,
      walletSigning: String(diagnostics.safety?.walletSigning ?? "client_wallet"),
      publicWritesDuringDiagnostics: diagnostics.safety?.publicWritesDuringDiagnostics === true,
      storesSecrets: diagnostics.safety?.storesSecrets === true,
    };
    report.checks = Array.isArray(diagnostics.checks) ? diagnostics.checks.map(summarizeCheck) : [];
    report.stages = Array.isArray(plan.stages) ? plan.stages.map(summarizeStage) : [];
    report.blockers = Array.isArray(plan.blockers) ? plan.blockers.map(summarizeRequirement) : [];
    report.envChecklist = buildEnvChecklist(report.blockers);
    report.safetyFailures = validateDiagnosticsSafety(diagnostics);
    report.ok = report.safetyFailures.length === 0;
    report.ready = report.ok &&
      report.status === "pass" &&
      report.mode === "production_candidate" &&
      report.canRunEndToEnd === true;
  } catch (error) {
    report.ok = false;
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
    report.details = error?.payload;
  }

  return report;
}

function modeLabel(report) {
  if (!report.ok && report.error) return "FAILED";
  if (report.mode === "production_candidate") return "PRODUCTION CANDIDATE";
  if (report.mode === "local_test") return "LOCAL TEST";
  if (report.mode === "needs_setup") return "NEEDS SETUP";
  return String(report.mode || "UNKNOWN").toUpperCase();
}

function markdownEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ")
    .trim();
}

function markdownListLine(value, fallback = "None") {
  const text = String(value ?? "").trim();
  return text ? markdownEscape(text) : fallback;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Matterhorn Generated Media Readiness",
    "",
    `Generated: ${markdownEscape(report.metadata.generatedAt)}`,
    `Workspace: ${markdownEscape(report.metadata.workspaceId || "unknown")}`,
    `Server: ${markdownEscape(report.metadata.serverUrl || "unknown")}`,
    `Mode: ${markdownEscape(modeLabel(report))}`,
    `Status: ${markdownEscape(report.status || "unknown")}`,
    `End-to-end production flow: ${report.ready ? "ready" : "not ready"}`,
    "No public writes were performed.",
    "",
  ];

  if (report.summary) {
    lines.push("## Summary", "", markdownEscape(report.summary), "");
  }

  lines.push("## Safety", "");
  lines.push(`- Non-custodial: ${report.safety.custody === false ? "yes" : "no"}`);
  lines.push(`- Can submit transactions: ${report.safety.canSubmit === true ? "yes" : "no"}`);
  lines.push(`- Wallet signing: ${markdownEscape(report.safety.walletSigning || "client_wallet")}`);
  lines.push(`- Public writes during diagnostics: ${report.safety.publicWritesDuringDiagnostics === true ? "yes" : "no"}`);
  lines.push(`- Stores secrets: ${report.safety.storesSecrets === true ? "yes" : "no"}`);
  lines.push(`- Public writes only after user action: ${report.publicWritesOnlyAfterUserAction ? "yes" : "no"}`);
  lines.push("");

  lines.push("## Checks", "");
  lines.push("| Check | Status | Summary |");
  lines.push("| --- | --- | --- |");
  if (report.checks.length === 0) {
    lines.push("| None | unknown | No checks returned. |");
  } else {
    for (const check of report.checks) {
      lines.push(`| ${markdownEscape(check.label || check.id)} | ${markdownEscape(check.status)} | ${markdownEscape(check.summary)} |`);
    }
  }
  lines.push("");

  lines.push("## Production Stages", "");
  lines.push("| Stage | Status | Write scope | Wallet | Public write | Summary |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  if (report.stages.length === 0) {
    lines.push("| None | unknown | none | no | no | No stages returned. |");
  } else {
    for (const stage of report.stages) {
      lines.push(`| ${markdownEscape(stage.label || stage.id)} | ${markdownEscape(stage.status)} | ${markdownEscape(stage.writeScope)} | ${stage.requiresWallet ? "yes" : "no"} | ${stage.requiresPublicWrite ? "yes" : "no"} | ${markdownEscape(stage.summary)} |`);
    }
  }
  lines.push("");

  lines.push("## Blockers", "");
  if (report.blockers.length === 0) {
    lines.push("- None");
  } else {
    for (const blocker of report.blockers) {
      const env = blocker.envVar ? ` (${blocker.envVar})` : "";
      lines.push(`- ${markdownListLine(blocker.label)}${env}: ${markdownListLine(blocker.description || blocker.status)}`);
    }
  }
  lines.push("");

  lines.push("## Production Env Checklist", "");
  lines.push("| Variable | Required | Secret | Status | Example | Description |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of report.envChecklist) {
    lines.push(`| ${markdownEscape(item.envVar)} | ${item.required ? "yes" : "no"} | ${item.secret ? "yes" : "no"} | ${markdownEscape(item.status)} | ${markdownEscape(item.example)} | ${markdownEscape(item.description)} |`);
  }
  lines.push("");

  if (report.safetyFailures.length > 0) {
    lines.push("## Safety Failures", "");
    for (const failure of report.safetyFailures) lines.push(`- ${markdownListLine(failure)}`);
    lines.push("");
  }

  if (report.error) {
    lines.push("## Error", "", markdownEscape(report.error), "");
  }

  return `${lines.join("\n")}\n`;
}

function emitReport(report, config) {
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.markdownOutput) writeFileSync(config.markdownOutput, buildMarkdownReport(report));
  if (config.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`Matterhorn generated-media production readiness: ${modeLabel(report)}\n`);
  if (report.metadata.workspaceId) process.stdout.write(`Workspace: ${report.metadata.workspaceId}\n`);
  process.stdout.write("No public writes were performed.\n");
  process.stdout.write(`End-to-end production flow: ${report.ready ? "ready" : "not ready"}\n`);
  if (report.summary) process.stdout.write(`${report.summary}\n`);
  if (report.safetyFailures.length > 0) {
    process.stdout.write("\nSafety failures:\n");
    for (const failure of report.safetyFailures) process.stdout.write(`- ${failure}\n`);
  }
  if (report.blockers.length > 0) {
    process.stdout.write("\nBlockers:\n");
    for (const blocker of report.blockers) {
      const env = blocker.envVar ? ` (${blocker.envVar})` : "";
      process.stdout.write(`- ${blocker.label}${env}: ${blocker.description || blocker.status}\n`);
    }
  }
  if (report.envChecklist.length > 0) {
    process.stdout.write("\nProduction env checklist:\n");
    for (const item of report.envChecklist) {
      const flags = [
        item.required ? "required" : "optional",
        item.secret ? "secret" : "public",
        item.status !== "not_reported" ? item.status : "not reported as blocker",
      ].join(", ");
      process.stdout.write(`- ${item.envVar}=${item.example} [${flags}]: ${item.description}\n`);
    }
  }
  if (report.stages.length > 0) {
    process.stdout.write("\nStages:\n");
    for (const stage of report.stages) {
      const publicWrite = stage.requiresPublicWrite ? ", public write after user action" : "";
      process.stdout.write(`- ${stage.status.toUpperCase()} ${stage.label} [${stage.writeScope}${publicWrite}]\n`);
    }
  }
  if (report.error) process.stdout.write(`\nError: ${report.error}\n`);
  if (config.jsonOutput) process.stdout.write(`JSON report: ${config.jsonOutput}\n`);
  if (config.markdownOutput) process.stdout.write(`Markdown report: ${config.markdownOutput}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(help());
    return;
  }
  const report = await runGeneratedMediaProductionReadiness(config);
  emitReport(report, config);
  if (!report.ok || (config.requireProduction && !report.ready)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
