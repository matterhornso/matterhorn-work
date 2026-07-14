#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FORBIDDEN_ROUTE_RE = /\/api\/(?:hyperliquid|polymarket)\/orders\/(?:submit|sign)|\/orders\/submit|\/orders\/sign|\/exchange\/submit/i;
const FORBIDDEN_SECRET_ASSIGNMENT_RE = /\b(?:privateKey|private_key|seedPhrase|seed phrase|mnemonic|apiSecret|api secret|rawSignature|raw signature|signedPayload|signed payload|walletExport|wallet export)\b[ \t]*[:=][ \t]*\S+/i;
const RELEASE_PROFILES = new Set(["controlled-beta", "production"]);
const CONTROLLED_BETA_BLOCKER_IDS = new Set([
  "billing.stripe_test",
  "generated_media.platform_setup",
  "generated_media.entitlement",
]);
const CONTROLLED_BETA_FAILED_STAGE_IDS = new Set([
  "billing.production_readiness",
  "generated_media.production_readiness",
  "generated_media.flow",
]);

function parseArgs(argv) {
  const args = {
    outputDir: "/tmp/matterhorn-monday-beta-rc",
    artifactDir: "",
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL || "",
    token: process.env.MATTERHORN_WORK_TOKEN || "",
    workspaceId: process.env.MATTERHORN_WORKSPACE_ID || "",
    appUrl: process.env.MATTERHORN_APP_URL || "",
    bittensorBetaGate: "",
    customerReadySmoke: "",
    bittensorEvidenceVerify: "",
    bittensorLivePublicQa: "",
    bittensorBrowserQa: "",
    releaseProfile: "production",
    dryRun: false,
    skipElectronBuild: false,
    strict: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--skip-electron-build") args.skipElectronBuild = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--release-profile") {
      args.releaseProfile = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--release-profile=")) {
      args.releaseProfile = arg.slice("--release-profile=".length);
    }
    else if (arg === "--output-dir") {
      args.outputDir = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--artifact-dir") {
      args.artifactDir = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--artifact-dir=")) {
      args.artifactDir = arg.slice("--artifact-dir=".length);
    } else if (arg === "--server-url") {
      args.serverUrl = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--server-url=")) {
      args.serverUrl = arg.slice("--server-url=".length);
    } else if (arg === "--token") {
      args.token = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--token=")) {
      args.token = arg.slice("--token=".length);
    } else if (arg === "--workspace-id") {
      args.workspaceId = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--workspace-id=")) {
      args.workspaceId = arg.slice("--workspace-id=".length);
    } else if (arg === "--app-url") {
      args.appUrl = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--app-url=")) {
      args.appUrl = arg.slice("--app-url=".length);
    } else if (arg === "--bittensor-beta-gate") {
      args.bittensorBetaGate = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--bittensor-beta-gate=")) {
      args.bittensorBetaGate = arg.slice("--bittensor-beta-gate=".length);
    } else if (arg === "--customer-ready-smoke") {
      args.customerReadySmoke = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--customer-ready-smoke=")) {
      args.customerReadySmoke = arg.slice("--customer-ready-smoke=".length);
    } else if (arg === "--bittensor-evidence-verify") {
      args.bittensorEvidenceVerify = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--bittensor-evidence-verify=")) {
      args.bittensorEvidenceVerify = arg.slice("--bittensor-evidence-verify=".length);
    } else if (arg === "--bittensor-live-public-qa") {
      args.bittensorLivePublicQa = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--bittensor-live-public-qa=")) {
      args.bittensorLivePublicQa = arg.slice("--bittensor-live-public-qa=".length);
    } else if (arg === "--bittensor-browser-qa") {
      args.bittensorBrowserQa = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--bittensor-browser-qa=")) {
      args.bittensorBrowserQa = arg.slice("--bittensor-browser-qa=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!RELEASE_PROFILES.has(args.releaseProfile)) {
    throw new Error(`--release-profile must be one of: ${[...RELEASE_PROFILES].join(", ")}.`);
  }

  return args;
}

function help() {
  return [
    "Matterhorn Work launch release-candidate pack",
    "",
    "Usage:",
    "  pnpm --silent beta:monday-rc -- --release-profile controlled-beta --output-dir ~/Desktop/matterhorn-wednesday-beta-rc --strict --json",
    "  pnpm --silent beta:monday-rc -- --output-dir ~/Desktop/matterhorn-monday-beta-rc --strict --json",
    "  pnpm --silent beta:monday-rc -- --output-dir /tmp/matterhorn-monday-beta-rc --skip-electron-build --artifact-dir <existing-artifact-dir> --strict --json",
    "  pnpm --silent beta:monday-rc -- --output-dir /tmp/matterhorn-monday-beta-rc --dry-run --json",
    "  pnpm --silent beta:monday-rc -- --output-dir /tmp/matterhorn-launch-rc --server-url <backend-url> --token <client-token> --workspace-id <workspace-id> --app-url <deployed-app-url> --bittensor-beta-gate <json> --customer-ready-smoke <json> --bittensor-evidence-verify <json> --bittensor-browser-qa <md> --strict --json",
    "",
    "The pack is evidence-oriented. It never signs, submits, custodies, broadcasts, accepts keys, or touches real funds.",
    "",
  ].join("\n");
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : null;
}

function redactedCommand(command, config) {
  return command.map((part) => {
    if (config.token && part === config.token) return "<redacted-client-token>";
    return part;
  });
}

function redact(text, config) {
  let value = String(text || "");
  if (config.token) value = value.split(config.token).join("<redacted-client-token>");
  value = value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
  value = value.replace(/(MATTERHORN_WORK_TOKEN=)[^\s]+/g, "$1<redacted>");
  return value.slice(-6000);
}

function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

function assertSafeCommand(stage) {
  const commandText = stage.command.join(" ");
  if (FORBIDDEN_ROUTE_RE.test(commandText)) {
    throw new Error(`${stage.id} references a forbidden submit/sign route.`);
  }
  if (FORBIDDEN_SECRET_ASSIGNMENT_RE.test(commandText)) {
    throw new Error(`${stage.id} includes secret-shaped material.`);
  }
}

function stage(id, label, command, options = {}) {
  return { id, label, command, ...options };
}

function parseJsonOutput(stdout) {
  const value = String(stdout || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function evaluateControlledBetaExclusions(structuredOutput) {
  if (!structuredOutput || structuredOutput.ready === true) {
    return { accepted: structuredOutput?.ready === true, exclusions: [] };
  }
  const blockers = Array.isArray(structuredOutput.launchBlockers) ? structuredOutput.launchBlockers : [];
  const failedStages = Array.isArray(structuredOutput.stages)
    ? structuredOutput.stages.filter((item) => item?.status === "fail")
    : [];
  const blockerIds = blockers.map((item) => String(item?.id || "")).filter(Boolean);
  const failedStageIds = failedStages.map((item) => String(item?.id || "")).filter(Boolean);
  const safety = structuredOutput.safety || {};
  const accepted = blockerIds.length > 0 &&
    failedStageIds.length > 0 &&
    blockerIds.every((id) => CONTROLLED_BETA_BLOCKER_IDS.has(id)) &&
    failedStageIds.every((id) => CONTROLLED_BETA_FAILED_STAGE_IDS.has(id)) &&
    safety.nonCustodial === true &&
    safety.liveSubmissionEnabled === false &&
    safety.asksForSecrets === false;
  return { accepted, exclusions: accepted ? blockerIds : [] };
}

function evaluateSemanticReadiness(stageItem, structuredOutput) {
  if (!stageItem.requireReadyOutput) return { accepted: true, exclusions: [] };
  if (structuredOutput?.ready === true) return { accepted: true, exclusions: [] };
  if (stageItem.readinessPolicy === "controlled_beta_exclusions") {
    return evaluateControlledBetaExclusions(structuredOutput);
  }
  return { accepted: false, exclusions: [] };
}

function buildStages(config) {
  const outputDir = resolve(config.outputDir);
  const artifactDir = resolve(config.artifactDir || join(outputDir, "mac-tester-artifact"));
  const desktopDoctorMarkdown = join(outputDir, "matterhorn-desktop-beta-doctor.md");
  const realBittensorInputs = [
    config.bittensorBetaGate,
    config.customerReadySmoke,
    config.bittensorEvidenceVerify,
    config.bittensorBrowserQa,
  ];
  const realBittensorInputCount = realBittensorInputs.filter(Boolean).length;
  if (realBittensorInputCount > 0 && realBittensorInputCount < realBittensorInputs.length) {
    throw new Error("Real Bittensor RC mode requires --bittensor-beta-gate, --customer-ready-smoke, --bittensor-evidence-verify, and --bittensor-browser-qa together.");
  }
  const bittensorPacketCommand = [
    "node",
    "scripts/bittensor-beta-customer-packet.mjs",
    "--output-dir",
    join(outputDir, "bittensor-beta"),
  ];
  if (realBittensorInputCount === realBittensorInputs.length) {
    bittensorPacketCommand.push(
      "--beta-gate", config.bittensorBetaGate,
      "--customer-ready-smoke", config.customerReadySmoke,
      "--bittensor-evidence-verify", config.bittensorEvidenceVerify,
      "--browser-qa", config.bittensorBrowserQa,
      "--strict",
    );
    if (config.bittensorLivePublicQa) {
      bittensorPacketCommand.push("--live-public-qa", config.bittensorLivePublicQa);
    }
  } else {
    bittensorPacketCommand.push("--fixture");
  }
  bittensorPacketCommand.push("--json");

  const stages = [
    stage("platform.safety", "Full Matterhorn platform safety gate", ["pnpm", "test:matterhorn-platform-safety"]),
    stage("ui.onboarding", "Customer onboarding UI static gate", ["pnpm", "test:matterhorn-customer-onboarding-ui"]),
    stage("ui.protocol_panel", "Protocol panel UX static gate", ["pnpm", "test:crypto-panel-ux"]),
    stage("ui.customer_readiness", "Customer readiness UI static gate", ["pnpm", "test:customer-readiness-ui"]),
    stage("app.typecheck", "Matterhorn app typecheck", ["pnpm", "--filter", "@matterhorn-work/app", "typecheck"]),
    stage("crypto.customer_smoke", "Customer-ready crypto smoke", ["pnpm", "smoke:customer-ready-crypto"]),
    stage("market.execution_safety", "Market execution safety gate", ["pnpm", "test:market-execution-safety-gate"]),
    stage("wellness.workflow", "Wellness workflow gate", ["pnpm", "test:wellness-creator-workflow"]),
    stage("customer.demo_evidence", "Monday customer demo evidence pack", ["node", "scripts/customer-demo-evidence-pack.mjs", "--output-dir", join(outputDir, "customer-demo-evidence")]),
    stage(
      "bittensor.beta_packet",
      realBittensorInputCount === realBittensorInputs.length ? "Bittensor beta customer packet" : "Bittensor beta packet fixture",
      bittensorPacketCommand,
      { requireReadyOutput: true },
    ),
  ];

  const missingProductionInputs = [
    !config.serverUrl ? "--server-url" : null,
    !config.token ? "--token" : null,
    !config.workspaceId ? "--workspace-id" : null,
  ].filter(Boolean);
  const productReadinessCommand = [
    "node",
    "scripts/product-readiness-smoke.mjs",
    "--server-url",
    config.serverUrl || "<backend-url>",
    "--token",
    config.token || "<client-token>",
    "--workspace-id",
    config.workspaceId || "<workspace-id>",
    "--require-production",
    "--include-generated-media-flow",
    "--strict",
    "--json",
  ];
  stages.push(stage(
    "production.product_readiness",
    "Production backend and integration readiness",
    productReadinessCommand,
    {
      requireReadyOutput: true,
      readinessPolicy: config.releaseProfile === "controlled-beta"
        ? "controlled_beta_exclusions"
        : "ready",
      missingConfiguration: missingProductionInputs.length
        ? `Missing required production inputs: ${missingProductionInputs.join(", ")}.`
        : null,
    },
  ));

  const productBrowserCommand = [
    "node",
    "scripts/matterhorn-product-browser-smoke.mjs",
    "--url",
    config.appUrl || "<deployed-app-url>",
    "--output-dir",
    join(outputDir, "product-browser-smoke"),
    "--strict",
    "--json",
  ];
  if (config.releaseProfile === "controlled-beta") productBrowserCommand.push("--require-desk-results");
  stages.push(stage(
    "browser.product_smoke",
    "Deployed customer-flow browser smoke",
    productBrowserCommand,
    {
      requireReadyOutput: true,
      missingConfiguration: config.appUrl ? null : "Missing required deployed app input: --app-url.",
    },
  ));

  if (config.skipElectronBuild) {
    stages.push(stage(
      "desktop.artifact",
      "Mac tester artifact build",
      ["pnpm", "electron:tester-artifact", "--", "--output-dir", artifactDir, "--json"],
      {
        skippedByConfig: true,
        artifactDir,
        reuseExistingArtifact: Boolean(config.artifactDir),
        skipReason: config.artifactDir
          ? "Reusing existing artifact directory; desktop doctor verifies hash binding."
          : "Skipped by --skip-electron-build.",
      },
    ));
  } else {
    stages.push(stage("desktop.artifact", "Mac tester artifact build", ["pnpm", "electron:tester-artifact", "--", "--output-dir", artifactDir, "--json"]));
  }

  const doctorCommand = ["pnpm", "desktop:beta-doctor", "--", "--artifact-dir", artifactDir, "--markdown-output", desktopDoctorMarkdown, "--strict", "--json"];
  if (config.serverUrl) {
    doctorCommand.push("--server-url", config.serverUrl);
    if (config.token) doctorCommand.push("--token", config.token);
  }
  stages.push(stage("desktop.doctor", "Desktop beta first-run doctor", doctorCommand, {
    requiresArtifactDir: true,
    artifactDir,
  }));
  const cleanProfileCommand = ["pnpm", "smoke:desktop-packaged-clean-profile", "--", "--artifact-dir", artifactDir, "--strict", "--json"];
  if (config.serverUrl) {
    cleanProfileCommand.push("--server-url", config.serverUrl);
    if (config.token) cleanProfileCommand.push("--token", config.token);
  }
  stages.push(stage(
    "desktop.clean_profile",
    "Packaged desktop clean-profile smoke",
    cleanProfileCommand,
  ));

  return { artifactDir, desktopDoctorMarkdown, stages };
}

function runStage(stageItem, config) {
  assertSafeCommand(stageItem);
  if (config.dryRun) {
    return {
      id: stageItem.id,
      label: stageItem.label,
      status: "planned",
      command: redactedCommand(stageItem.command, config),
      summary: "Dry run: command planned but not executed.",
    };
  }
  if (stageItem.missingConfiguration) {
    return {
      id: stageItem.id,
      label: stageItem.label,
      status: "fail",
      command: redactedCommand(stageItem.command, config),
      summary: stageItem.missingConfiguration,
    };
  }
  if (stageItem.skippedByConfig) {
    if (stageItem.reuseExistingArtifact) {
      return {
        id: stageItem.id,
        label: stageItem.label,
        status: existsSync(stageItem.artifactDir) ? "pass" : "fail",
        command: redactedCommand(stageItem.command, config),
        summary: existsSync(stageItem.artifactDir)
          ? stageItem.skipReason
          : `Requested existing artifact directory is missing: ${stageItem.artifactDir}`,
      };
    }
    return {
      id: stageItem.id,
      label: stageItem.label,
      status: "skip",
      command: redactedCommand(stageItem.command, config),
      summary: stageItem.skipReason,
    };
  }
  if (stageItem.requiresArtifactDir && !existsSync(stageItem.artifactDir)) {
    return {
      id: stageItem.id,
      label: stageItem.label,
      status: "fail",
      command: redactedCommand(stageItem.command, config),
      summary: `Artifact directory is missing: ${stageItem.artifactDir}`,
    };
  }

  const startedAt = Date.now();
  const [bin, ...args] = stageItem.command;
  const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const structuredOutput = stageItem.requireReadyOutput ? parseJsonOutput(result.stdout) : null;
  const stdout = redact(result.stdout, config);
  const stderr = redact(result.stderr, config);
  const semanticReadiness = evaluateSemanticReadiness(stageItem, structuredOutput);
  const semanticFailure = stageItem.requireReadyOutput && !semanticReadiness.accepted;
  const acceptedControlledBetaExclusions = semanticReadiness.exclusions.length > 0;
  const processAccepted = result.status === 0 || acceptedControlledBetaExclusions;
  const status = processAccepted && !semanticFailure ? "pass" : "fail";
  const combined = `${stdout}\n${stderr}`;
  if (FORBIDDEN_SECRET_ASSIGNMENT_RE.test(combined)) {
    return {
      id: stageItem.id,
      label: stageItem.label,
      status: "fail",
      command: redactedCommand(stageItem.command, config),
      durationMs: Date.now() - startedAt,
      summary: "Command output contained secret-shaped assignment text.",
      stdout,
      stderr,
    };
  }

  return {
    id: stageItem.id,
    label: stageItem.label,
    status,
    command: redactedCommand(stageItem.command, config),
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
    summary: status === "pass"
      ? acceptedControlledBetaExclusions
        ? `Passed for controlled-beta profile with production disabled: ${semanticReadiness.exclusions.join(", ")}.`
        : "Passed."
      : semanticFailure
        ? `Reported NOT_READY: ${Array.isArray(structuredOutput?.errors) ? structuredOutput.errors.join(" ") : "required evidence is incomplete."}`
        : `Exited with status ${result.status}.`,
    semanticReady: stageItem.requireReadyOutput ? structuredOutput?.ready === true : undefined,
    profileReady: stageItem.requireReadyOutput ? semanticReadiness.accepted : undefined,
    acceptedExclusions: acceptedControlledBetaExclusions ? semanticReadiness.exclusions : undefined,
    blockers: stageItem.requireReadyOutput && Array.isArray(structuredOutput?.errors)
      ? structuredOutput.errors.map(String)
      : undefined,
    stdout,
    stderr,
  };
}

function markdown(report) {
  const rows = report.stages
    .map((item) => `| ${item.id} | ${item.status} | ${item.summary.replace(/\|/g, "\\|")} |`)
    .join("\n");
  return [
    "# Matterhorn Work Launch Release Candidate Pack",
    "",
    `- Git SHA: \`${report.git.sha}\``,
    `- Branch: \`${report.git.branch}\``,
    `- Release profile: \`${report.releaseProfile}\``,
    `- Ready: \`${report.ready}\``,
    `- Production evidence complete: \`${report.productionEvidence.complete}\``,
    `- Generated: \`${report.generatedAt}\``,
    `- Output directory: \`${report.outputDir}\``,
    "",
    "## Beta Scope",
    "",
    "- Bittensor: beta-ready read, preview, watch, receipt, and external-signer handoff.",
    "- Hyperliquid: preview/external-signer/public-receipt only. Can submit: No. Live submission: Off.",
    "- Polymarket: preview/external-signer/public-receipt only. Can submit: No. Live submission: Off.",
    "- Wellness: educational workflow artifacts only; no diagnosis, prescription, live payments, email, hosting, storage, or gated access.",
    "- Services: planned hooks only; no live provider execution.",
    "",
    "## Checks",
    "",
    "| Check | Status | Summary |",
    "|---|---:|---|",
    rows,
    "",
    "## Next Actions",
    "",
    ...(report.nextActions.length ? report.nextActions.map((item) => `- ${item}`) : ["- Send the tester artifact and this evidence pack to Hermes for black-box QA."]),
    "",
  ].join("\n");
}

function writeOutputs(report) {
  mkdirSync(report.outputDir, { recursive: true });
  const jsonPath = join(report.outputDir, "matterhorn-monday-beta-rc.json");
  const mdPath = join(report.outputDir, "matterhorn-monday-beta-rc.md");
  const shaPath = join(report.outputDir, "matterhorn-monday-beta-rc.sha256");
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const md = markdown(report);
  writeFileSync(jsonPath, json);
  writeFileSync(mdPath, md);
  writeFileSync(shaPath, `${sha256Text(json)}  matterhorn-monday-beta-rc.json\n${sha256Text(md)}  matterhorn-monday-beta-rc.md\n`);
  return { jsonPath, mdPath, shaPath };
}

const config = parseArgs(process.argv.slice(2));
if (config.help) {
  process.stdout.write(help());
  process.exit(0);
}

const outputDir = resolve(config.outputDir);
const { artifactDir, desktopDoctorMarkdown, stages } = buildStages({ ...config, outputDir });
mkdirSync(outputDir, { recursive: true });

const results = stages.map((stageItem) => runStage(stageItem, { ...config, outputDir }));
const failCount = results.filter((item) => item.status === "fail").length;
const skippedOrPlanned = results.filter((item) => item.status === "skip" || item.status === "planned").length;
const automationPassed = failCount === 0;
const ready = !config.dryRun && automationPassed && skippedOrPlanned === 0;
const nextActions = [];
if (config.dryRun) nextActions.push("Rerun without --dry-run to execute the RC pack.");
if (config.skipElectronBuild && !config.artifactDir) {
  nextActions.push("Rerun without --skip-electron-build before sharing a fresh Mac tester artifact.");
}
if (failCount > 0) nextActions.push("Fix failing stages, rerun this pack, and attach the regenerated evidence.");
if (results.some((item) => item.id === "bittensor.beta_packet" && item.semanticReady === false)) {
  nextActions.push("Replace the Bittensor fixture packet with real customer-smoke, evidence-verification, and browser-QA inputs before release.");
}
if (!config.serverUrl) nextActions.push("For a running-app check, rerun the desktop doctor with MATTERHORN_WORK_SERVER_URL and MATTERHORN_WORK_TOKEN.");
if (!config.serverUrl || !config.token || !config.workspaceId) {
  nextActions.push("Provide --server-url, --token, and --workspace-id so the production-required backend probe can run.");
}
if (!config.appUrl) nextActions.push("Provide --app-url so the deployed customer-flow browser smoke can run.");
const acceptedProductionExclusions = results.find((item) => item.id === "production.product_readiness")?.acceptedExclusions ?? [];
if (acceptedProductionExclusions.length > 0) {
  nextActions.push(`Keep excluded production services disabled until separately green: ${acceptedProductionExclusions.join(", ")}.`);
}

const report = {
  version: "matterhorn.launch-rc-pack.v3",
  generatedAt: new Date().toISOString(),
  outputDir,
  artifactDir,
  desktopDoctorMarkdown,
  dryRun: config.dryRun,
  releaseProfile: config.releaseProfile,
  ready,
  automationPassed,
  productionEvidence: {
    backendProbeConfigured: Boolean(config.serverUrl && config.token && config.workspaceId),
    browserProbeConfigured: Boolean(config.appUrl),
    complete: results.some((item) => item.id === "production.product_readiness" && item.semanticReady === true)
      && results.some((item) => item.id === "browser.product_smoke" && item.status === "pass")
      && results.some((item) => item.id === "platform.safety" && item.status === "pass"),
  },
  summary: {
    pass: results.filter((item) => item.status === "pass").length,
    fail: failCount,
    skip: results.filter((item) => item.status === "skip").length,
    planned: results.filter((item) => item.status === "planned").length,
    acceptedExclusions: results.reduce((count, item) => count + (item.acceptedExclusions?.length ?? 0), 0),
  },
  git: {
    sha: git(["rev-parse", "HEAD"]) ?? "unknown",
    shortSha: git(["rev-parse", "--short=8", "HEAD"]) ?? "unknown",
    branch: git(["branch", "--show-current"]) ?? "unknown",
  },
  safety: {
    nonCustodial: true,
    acceptsPrivateKeys: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    marketLiveSubmissionEnabled: false,
    marketCanSubmit: false,
    wellnessMedicalAdvice: false,
    liveProviderExecution: false,
  },
  betaScope: {
    bittensor: "beta_ready_external_signer",
    hyperliquid: "preview_only_external_signer",
    polymarket: "preview_only_external_signer",
    wellness: "workflow_ready_educational",
    decentralizedServices: "planned_not_live",
  },
  stages: results,
  nextActions,
};

const outputFiles = writeOutputs(report);
const response = { ...report, outputFiles };

if (config.json) {
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
} else {
  console.log(`Matterhorn Monday beta RC pack: ${ready ? "READY" : "NOT READY"}`);
  for (const item of results) console.log(`[${item.status}] ${item.id}: ${item.summary}`);
  console.log(`JSON: ${outputFiles.jsonPath}`);
  console.log(`Markdown: ${outputFiles.mdPath}`);
}

if (config.strict && !ready) process.exit(1);
