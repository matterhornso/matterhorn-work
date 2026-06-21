#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FORBIDDEN_ROUTE_RE = /\/api\/(?:hyperliquid|polymarket)\/orders\/(?:submit|sign)|\/orders\/submit|\/orders\/sign|\/exchange\/submit/i;
const FORBIDDEN_SECRET_ASSIGNMENT_RE = /\b(?:privateKey|private_key|seedPhrase|seed phrase|mnemonic|apiSecret|api secret|rawSignature|raw signature|signedPayload|signed payload|walletExport|wallet export)\b[ \t]*[:=][ \t]*\S+/i;

function parseArgs(argv) {
  const args = {
    outputDir: "/tmp/matterhorn-monday-beta-rc",
    artifactDir: "",
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL || "",
    token: process.env.MATTERHORN_WORK_TOKEN || "",
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function help() {
  return [
    "Matterhorn Work Monday beta release-candidate pack",
    "",
    "Usage:",
    "  pnpm --silent beta:monday-rc -- --output-dir ~/Desktop/matterhorn-monday-beta-rc --strict --json",
    "  pnpm --silent beta:monday-rc -- --output-dir /tmp/matterhorn-monday-beta-rc --skip-electron-build --artifact-dir <existing-artifact-dir> --strict --json",
    "  pnpm --silent beta:monday-rc -- --output-dir /tmp/matterhorn-monday-beta-rc --dry-run --json",
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

function buildStages(config) {
  const outputDir = resolve(config.outputDir);
  const artifactDir = resolve(config.artifactDir || join(outputDir, "mac-tester-artifact"));
  const desktopDoctorMarkdown = join(outputDir, "matterhorn-desktop-beta-doctor.md");
  const stages = [
    stage("ui.onboarding", "Customer onboarding UI static gate", ["pnpm", "test:matterhorn-customer-onboarding-ui"]),
    stage("ui.protocol_panel", "Protocol panel UX static gate", ["pnpm", "test:crypto-panel-ux"]),
    stage("ui.customer_readiness", "Customer readiness UI static gate", ["pnpm", "test:customer-readiness-ui"]),
    stage("app.typecheck", "Matterhorn app typecheck", ["pnpm", "--filter", "@matterhorn-work/app", "typecheck"]),
    stage("crypto.customer_smoke", "Customer-ready crypto smoke", ["pnpm", "smoke:customer-ready-crypto"]),
    stage("market.execution_safety", "Market execution safety gate", ["pnpm", "test:market-execution-safety-gate"]),
    stage("wellness.workflow", "Wellness workflow gate", ["pnpm", "test:wellness-creator-workflow"]),
    stage("customer.demo_evidence", "Monday customer demo evidence pack", ["node", "scripts/customer-demo-evidence-pack.mjs", "--output-dir", join(outputDir, "customer-demo-evidence")]),
    stage("bittensor.beta_packet", "Bittensor beta packet fixture", ["node", "scripts/bittensor-beta-customer-packet.mjs", "--output-dir", join(outputDir, "bittensor-beta"), "--fixture", "--json"]),
  ];

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
  const status = result.status === 0 ? "pass" : "fail";
  const stdout = redact(result.stdout, config);
  const stderr = redact(result.stderr, config);
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
    summary: status === "pass" ? "Passed." : `Exited with status ${result.status}.`,
    stdout,
    stderr,
  };
}

function markdown(report) {
  const rows = report.stages
    .map((item) => `| ${item.id} | ${item.status} | ${item.summary.replace(/\|/g, "\\|")} |`)
    .join("\n");
  return [
    "# Matterhorn Work Monday Beta Release Candidate Pack",
    "",
    `- Git SHA: \`${report.git.sha}\``,
    `- Branch: \`${report.git.branch}\``,
    `- Ready: \`${report.ready}\``,
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
const ready = failCount === 0 && (!config.strict || skippedOrPlanned === 0 || config.dryRun);
const nextActions = [];
if (config.dryRun) nextActions.push("Rerun without --dry-run to execute the RC pack.");
if (config.skipElectronBuild) nextActions.push("Rerun without --skip-electron-build before sharing a fresh Mac tester artifact.");
if (failCount > 0) nextActions.push("Fix failing stages, rerun this pack, and attach the regenerated evidence.");
if (!config.serverUrl) nextActions.push("For a running-app check, rerun the desktop doctor with MATTERHORN_WORK_SERVER_URL and MATTERHORN_WORK_TOKEN.");

const report = {
  version: "matterhorn.monday-beta-rc-pack.v1",
  generatedAt: new Date().toISOString(),
  outputDir,
  artifactDir,
  desktopDoctorMarkdown,
  dryRun: config.dryRun,
  ready,
  summary: {
    pass: results.filter((item) => item.status === "pass").length,
    fail: failCount,
    skip: results.filter((item) => item.status === "skip").length,
    planned: results.filter((item) => item.status === "planned").length,
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
