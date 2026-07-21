#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPORT_VERSION = "matterhorn.public-beta-candidate-certifier.v1";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_LOG_CHARS = 2_000_000;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const PROTECTED_PATH_RULES = Object.freeze([
  (path) => path === ".opencode/package-lock.json",
  (path) => path === ".matterhorn-work" || path.startsWith(".matterhorn-work/"),
  (path) => path === "notes" || path.startsWith("notes/"),
  (path) => path === "outputs" || path.startsWith("outputs/"),
  (path) => path === "qa-reports" || path.startsWith("qa-reports/"),
  (path) => path.startsWith("apps/desktop/dist-electron 2/"),
  (path) => path.startsWith("apps/desktop/server 2/"),
  (path) => path.startsWith("apps/desktop/server 3/"),
]);
const PROTECTED_GIT_EXCLUDES = Object.freeze([
  ":(exclude).opencode/package-lock.json",
  ":(exclude).matterhorn-work/**",
  ":(exclude)notes/**",
  ":(exclude)outputs/**",
  ":(exclude)qa-reports/**",
  ":(exclude)apps/desktop/dist-electron 2/**",
  ":(exclude)apps/desktop/server 2/**",
  ":(exclude)apps/desktop/server 3/**",
]);

const EXTERNAL_GATES = Object.freeze([
  {
    id: "deployment",
    owner: "Release owner",
    requirement:
      "Production HTTPS, authenticated same-origin API and engine routing, exact-origin CORS, security headers, and deployed commit identity.",
  },
  {
    id: "desktop_distribution",
    owner: "Desktop release owner",
    requirement:
      "Signed, notarized, and stapled macOS artifacts with clean-install, update, Gatekeeper, and rollback evidence.",
  },
  {
    id: "wallets_and_connectors",
    owner: "Integration owner",
    requirement:
      "Real MetaMask, Coinbase, Phantom/Sui, Hyperliquid testnet, and every visible OAuth connector acceptance.",
  },
  {
    id: "authorization",
    owner: "Security owner",
    requirement:
      "Deployed two-user, returning-user, and cross-workspace authorization acceptance.",
  },
  {
    id: "operations",
    owner: "Operations owner",
    requirement:
      "Alert delivery, backup and restore, rollback, support, legal, incident ownership, and staffed launch-room evidence.",
  },
  {
    id: "credential_rotation",
    owner: "Security owner",
    requirement:
      "Rotate every credential exposed outside the approved production secret store before launch.",
  },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function commandText(command) {
  return command.map((part) => JSON.stringify(String(part))).join(" ");
}

function safeStageName(id) {
  return id.replace(/[^a-z0-9.-]+/gi, "-");
}

function trimLog(value) {
  if (value.length <= MAX_LOG_CHARS) return value;
  return `[log truncated to final ${MAX_LOG_CHARS} characters]\n${value.slice(-MAX_LOG_CHARS)}`;
}

export function redactLog(input) {
  return String(input ?? "")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "sk-<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/gi, "Bearer <redacted>")
    .replace(
      /(\b(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|MNEMONIC|SEED[_-]?PHRASE)\b\s*[:=]\s*)[^\s"',;]+/gi,
      "$1<redacted>",
    )
    .replace(
      /("(?:apiKey|token|secret|password|privateKey|mnemonic|seedPhrase)"\s*:\s*")[^"]+(")/gi,
      "$1<redacted>$2",
    );
}

export function parseArgs(argv) {
  const args = {
    outputDir: "",
    appUrl: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    resume: true,
    skipBrowser: false,
    dryRun: false,
    strict: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--resume") args.resume = true;
    else if (arg === "--no-resume") args.resume = false;
    else if (arg === "--skip-browser") args.skipBrowser = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--output-dir") {
      args.outputDir = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--app-url") {
      args.appUrl = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--app-url=")) {
      args.appUrl = arg.slice("--app-url=".length);
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 100) {
    throw new Error("--timeout-ms must be at least 100.");
  }
  if (args.appUrl) {
    const url = new URL(args.appUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("--app-url must use http or https.");
    }
    if (url.username || url.password) {
      throw new Error("--app-url must not include credentials.");
    }
    for (const key of url.searchParams.keys()) {
      if (/(?:token|secret|password|key|signature)/i.test(key)) {
        throw new Error("--app-url must not include secret-like query parameters.");
      }
    }
  }

  return args;
}

export function helpText() {
  return [
    "Matterhorn Desks public-beta candidate certifier",
    "",
    "Usage:",
    "  pnpm certify:public-beta -- --output-dir qa-reports/public-beta/current --app-url http://127.0.0.1:5207/workspace/ws/session --json",
    "  pnpm certify:public-beta -- --output-dir qa-reports/public-beta/current --skip-browser --strict --json",
    "  pnpm certify:public-beta -- --dry-run --json",
    "",
    "The certifier runs local engineering gates and records redacted evidence.",
    "It never signs, deploys, submits transactions, or converts missing owner evidence into GO.",
    "",
  ].join("\n");
}

function git(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const details = [
      result.error?.message,
      result.signal ? `signal ${result.signal}` : "",
      result.status === null ? "" : `exit ${result.status}`,
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `git ${args.join(" ")} failed${details ? `: ${details}` : ""}`,
    );
  }
  return result.stdout;
}

function parsePorcelainStatus(raw) {
  const tokens = raw.split("\0");
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const path = token.slice(3);
    const renamed = status.includes("R") || status.includes("C");
    const originalPath = renamed ? tokens[index + 1] || null : null;
    if (renamed) index += 1;
    entries.push({ status, path, originalPath });
  }
  return entries;
}

function isProtectedPath(path) {
  return PROTECTED_PATH_RULES.some((matches) => matches(path));
}

export function getSourceIdentity(repoRoot) {
  const head = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  const branch = git(repoRoot, ["branch", "--show-current"]).trim() || "detached";
  const statusRaw = git(repoRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const entries = parsePorcelainStatus(statusRaw);
  const candidateEntries = entries.filter(
    (entry) =>
      !isProtectedPath(entry.path) &&
      (!entry.originalPath || !isProtectedPath(entry.originalPath)),
  );
  const preserveOnlyEntries = entries.length - candidateEntries.length;
  const stagedEntries = candidateEntries.filter(
    (entry) => entry.status[0] !== " " && entry.status[0] !== "?",
  );
  const trackedDiff = git(repoRoot, [
    "diff",
    "--binary",
    "HEAD",
    "--",
    ".",
    ...PROTECTED_GIT_EXCLUDES,
  ]);
  const untrackedContent = candidateEntries
    .filter((entry) => entry.status === "??" && existsSync(resolve(repoRoot, entry.path)))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => {
      const content = readFileSync(resolve(repoRoot, entry.path));
      return `${entry.path}\0${sha256(content)}`;
    })
    .join("\0");
  const sourceFingerprint = sha256(
    `${head}\0${trackedDiff}\0${untrackedContent}`,
  );

  return {
    head,
    branch,
    dirty: candidateEntries.length > 0,
    dirtyPathCount: candidateEntries.length,
    preserveOnlyPathCount: preserveOnlyEntries,
    stagedPathCount: stagedEntries.length,
    workingTreeFingerprint: sourceFingerprint,
  };
}

function stage(id, label, command, options = {}) {
  return {
    id,
    label,
    command,
    timeoutMs: options.timeoutMs,
  };
}

export function buildStages(config) {
  const outputDir = resolve(config.outputDir);
  const stages = [
    stage("scope_inventory", "Protected-path and dirty-tree inventory", [
      "node",
      "scripts/release-scope-inventory.mjs",
      "--strict",
      "--json-output",
      join(outputDir, "release-scope-inventory.json"),
    ]),
    stage("candidate_manifest", "Hashed release-candidate manifest", [
      "node",
      "scripts/release-candidate-manifest.mjs",
      "--output-dir",
      join(outputDir, "release-candidate-manifest"),
      "--strict",
    ]),
    stage("secret_scan", "Source secret-pattern scan", [
      "node",
      "scripts/release-secret-scan.mjs",
      "--strict",
      "--json-output",
      join(outputDir, "release-secret-scan.json"),
    ]),
    stage("dependency_audit", "Locked dependency vulnerability audit", [
      "pnpm",
      "audit:dependencies",
    ]),
    stage("app_tests", "Complete app test suite", [
      "pnpm",
      "exec",
      "bun",
      "test",
      "apps/app",
      "--timeout",
      "30000",
      "--reporter",
      "dots",
    ]),
    stage("server_tests", "Complete server test suite", [
      "pnpm",
      "exec",
      "bun",
      "test",
      "apps/server/src",
      "--timeout",
      "30000",
      "--max-concurrency",
      "1",
      "--reporter",
      "dots",
    ]),
    stage("app_typecheck", "App TypeScript typecheck", [
      "pnpm",
      "--filter",
      "@matterhorn-work/app",
      "typecheck",
    ]),
    stage("server_typecheck", "Server TypeScript typecheck", [
      "pnpm",
      "--filter",
      "matterhorn-work-server",
      "typecheck",
    ]),
    stage("electron_typecheck", "Electron bridge TypeScript typecheck", [
      "pnpm",
      "--filter",
      "@matterhorn-work/app",
      "exec",
      "tsc",
      "-p",
      "../desktop/tsconfig.electron.json",
      "--noEmit",
    ]),
    stage("production_build", "Production web, server, and desktop build", [
      "pnpm",
      "build",
    ]),
    stage("platform_safety", "Complete Matterhorn platform safety gate", [
      "pnpm",
      "test:matterhorn-platform-safety",
    ]),
  ];

  if (!config.skipBrowser && config.appUrl) {
    stages.push(
      stage("browser_acceptance", "Live customer-flow browser acceptance", [
        "node",
        "scripts/matterhorn-product-browser-smoke.mjs",
        "--url",
        config.appUrl,
        "--output-dir",
        join(outputDir, "browser-acceptance"),
        "--strict",
        "--json",
      ]),
    );
  }

  return stages.map((item) => ({
    ...item,
    timeoutMs: item.timeoutMs || config.timeoutMs,
  }));
}

function stageFingerprint(stageItem, source) {
  return sha256(
    stableJson({
      command: stageItem.command,
      source: source.workingTreeFingerprint,
      head: source.head,
    }),
  );
}

export function reusableStage(previous, stageItem, source, outputDir) {
  if (!previous || previous.status !== "pass") return false;
  if (previous.fingerprint !== stageFingerprint(stageItem, source)) return false;
  if (!previous.logFile) return false;
  return existsSync(join(outputDir, previous.logFile));
}

export async function executeStage(
  stageItem,
  {
    repoRoot,
    outputDir,
    source,
    env = process.env,
    spawnImpl = spawn,
  },
) {
  const startedAt = new Date();
  const logFile = join("logs", `${safeStageName(stageItem.id)}.log`);
  const absoluteLogFile = join(outputDir, logFile);
  mkdirSync(join(outputDir, "logs"), { recursive: true });
  let output = "";
  let timedOut = false;

  const result = await new Promise((resolveResult) => {
    const child = spawnImpl(stageItem.command[0], stageItem.command.slice(1), {
      cwd: repoRoot,
      env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (chunk) => {
      output = trimLog(output + String(chunk));
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, stageItem.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      append(error.stack || error.message);
      resolveResult({ code: null, signal: null });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ code, signal });
    });
  });

  const finishedAt = new Date();
  const redacted = redactLog(output);
  writeFileSync(
    absoluteLogFile,
    [
      `stage: ${stageItem.id}`,
      `command: ${commandText(stageItem.command)}`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${finishedAt.toISOString()}`,
      `timed_out: ${timedOut}`,
      "",
      redacted,
    ].join("\n"),
  );

  return {
    id: stageItem.id,
    label: stageItem.label,
    status: !timedOut && result.code === 0 ? "pass" : timedOut ? "timeout" : "fail",
    exitCode: result.code,
    signal: result.signal,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    fingerprint: stageFingerprint(stageItem, source),
    command: stageItem.command,
    logFile,
    logSha256: sha256(readFileSync(absoluteLogFile)),
    reused: false,
  };
}

export function evaluateDecision({
  source,
  finalSource = source,
  stages,
  dryRun = false,
}) {
  const sourceStable =
    source.head === finalSource.head &&
    source.workingTreeFingerprint === finalSource.workingTreeFingerprint;
  if (dryRun) {
    return {
      decision: "DRY-RUN",
      technicalGatesPass: false,
      sourceStable,
      localReady: false,
      immutable: !source.dirty,
      readyForOwnerGates: false,
      publicReady: false,
    };
  }

  const technicalGatesPass =
    stages.length > 0 && stages.every((item) => item.status === "pass");
  const localReady = technicalGatesPass && sourceStable;
  const immutable =
    sourceStable &&
    !source.dirty &&
    !finalSource.dirty &&
    /^[a-f0-9]{40}$/i.test(source.head);
  let decision = "NO-GO-LOCAL-GATE-FAILED";
  if (technicalGatesPass && !sourceStable) {
    decision = "NO-GO-SOURCE-CHANGED-DURING-RUN";
  } else if (localReady && !immutable) decision = "LOCAL-GREEN-NOT-IMMUTABLE";
  else if (localReady && immutable) decision = "LOCAL-GREEN-OWNER-GATES-PENDING";

  return {
    decision,
    technicalGatesPass,
    sourceStable,
    localReady,
    immutable,
    readyForOwnerGates: localReady && immutable,
    publicReady: false,
  };
}

function markdownReport(report) {
  const lines = [
    "# Matterhorn Desks Public Beta Candidate Certification",
    "",
    `Decision: **${report.decision}**`,
    "",
    `- Captured: ${report.capturedAt}`,
    `- Branch: \`${report.source.branch}\``,
    `- Commit: \`${report.source.head}\``,
    `- Dirty paths: ${report.source.dirtyPathCount}`,
    `- Preserve-only paths: ${report.source.preserveOnlyPathCount}`,
    `- Staged paths: ${report.source.stagedPathCount}`,
    `- Source stable during run: ${report.sourceStable ? "YES" : "NO"}`,
    `- Local engineering gates: ${report.localReady ? "PASS" : "NOT PASS"}`,
    `- Immutable candidate: ${report.immutable ? "YES" : "NO"}`,
    `- Public-beta channel gate: ${report.channelReadiness.decision}`,
    `- Public-beta gates: ${report.channelReadiness.counts.passed ?? 0} passed, ${report.channelReadiness.counts.blocked ?? 0} blocked, ${report.channelReadiness.counts.expired ?? 0} expired`,
    `- Public launch ready: NO`,
    "",
    "## Local Gates",
    "",
    "| Gate | Result | Duration | Evidence |",
    "|---|---|---:|---|",
  ];

  for (const item of report.stages) {
    lines.push(
      `| ${item.label} | ${item.status.toUpperCase()}${item.reused ? " (reused)" : ""} | ${item.durationMs} ms | \`${item.logFile}\` |`,
    );
  }

  lines.push("", "## External Owner Gates", "");
  for (const gate of report.externalGates) {
    lines.push(`- **${gate.owner}:** ${gate.requirement}`);
  }
  if (report.channelReadiness.blockers.length > 0) {
    lines.push("", "## Exact Channel Blockers", "");
    for (const blocker of report.channelReadiness.blockers) {
      const detail =
        blocker.reason ??
        blocker.action ??
        blocker.note ??
        blocker.status ??
        "Evidence required.";
      lines.push(`- \`${blocker.id}\`: ${detail}`);
    }
  }
  lines.push(
    "",
    "This report certifies local engineering evidence only. It never substitutes",
    "fixtures, localhost, unsigned artifacts, or missing human acceptance for",
    "production evidence.",
    "",
  );
  return lines.join("\n");
}

function loadState(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function reportWithIntegrity(report) {
  const digest = sha256(stableJson(report));
  return {
    ...report,
    integrity: {
      algorithm: "sha256",
      digest,
    },
  };
}

function gate(status, evidence, note) {
  return {
    status,
    ...(evidence ? { evidence } : {}),
    ...(note ? { note } : {}),
  };
}

export function buildLaunchEvidence(report) {
  const resultFor = (id) => report.stages.find((item) => item.id === id);
  const passed = (id) =>
    report.localReady && resultFor(id)?.status === "pass";
  const evidenceFor = (id) =>
    `candidate-certification.json#stage=${encodeURIComponent(id)}`;
  const typechecksPass = [
    "app_typecheck",
    "server_typecheck",
    "electron_typecheck",
  ].every(passed);
  const browserPass = passed("browser_acceptance");
  const pending = (note) => gate("pending", "", note);
  const proven = (stageId, note) =>
    gate("pass", evidenceFor(stageId), note);

  return {
    version: "matterhorn.launch-channel-evidence.v1",
    capturedAt: report.capturedAt,
    commit: report.source.head,
    common: {
      gates: {
        "scope.freeze": pending(
          "Release owner must confirm the final public-beta scope.",
        ),
        "release.exact_commit": report.immutable
          ? gate(
              "pass",
              "candidate-certification.json#source",
              "The certified source is an immutable commit.",
            )
          : pending(
              "Candidate source is dirty and must be consolidated before release.",
            ),
        "code.app_suite": passed("app_tests")
          ? proven("app_tests", "Complete app suite passed.")
          : pending("Complete app suite is not certified."),
        "code.server_suite": passed("server_tests")
          ? proven("server_tests", "Complete server suite passed.")
          : pending("Complete server suite is not certified."),
        "code.typechecks": typechecksPass
          ? proven("electron_typecheck", "App, server, and Electron typechecks passed.")
          : pending("All three typechecks are not certified."),
        "code.production_build": passed("production_build")
          ? proven("production_build", "Production build passed.")
          : pending("Production build is not certified."),
        "code.platform_safety": passed("platform_safety")
          ? proven("platform_safety", "Complete platform safety gate passed.")
          : pending("Platform safety is not certified."),
        "security.dependency_audit": passed("dependency_audit")
          ? proven("dependency_audit", "Locked dependency audit passed.")
          : pending("Dependency audit is not certified."),
        "security.desktop_trust_boundary": passed("platform_safety")
          ? proven(
              "platform_safety",
              "Platform safety includes the Electron and daemon perimeter.",
            )
          : pending("Desktop trust-boundary evidence is not certified."),
        "ux.local_responsive_acceptance": browserPass
          ? proven("browser_acceptance", "Live customer-flow browser acceptance passed.")
          : pending("Live browser acceptance was skipped or failed."),
        "product.deferred_features_hidden": browserPass
          ? proven(
              "browser_acceptance",
              "Browser acceptance confirmed deferred launch-policy routes stay hidden.",
            )
          : pending("Deferred-feature visibility is not certified."),
      },
    },
    channels: {
      "public-beta": {
        gates: {},
      },
    },
  };
}

function launchReadinessArtifacts(repoRoot, outputDir, evidence) {
  const evidencePath = join(outputDir, "launch-evidence.local.json");
  const jsonPath = join(outputDir, "launch-readiness.json");
  const markdownPath = join(outputDir, "launch-readiness.md");
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [
      "scripts/launch-channel-readiness.mjs",
      "--channel",
      "public-beta",
      "--evidence",
      evidencePath,
      "--json-output",
      jsonPath,
      "--markdown-output",
      markdownPath,
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Public-beta launch readiness evaluation failed: ${redactLog(result.stderr)}`,
    );
  }
  return {
    evidencePath,
    jsonPath,
    markdownPath,
    report: JSON.parse(result.stdout),
  };
}

export async function runCertifier(config, options = {}) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const source = getSourceIdentity(repoRoot);
  const date = new Date().toISOString().slice(0, 10);
  const outputDir = resolve(
    repoRoot,
    config.outputDir ||
      join("qa-reports", "public-beta", `candidate-${source.head.slice(0, 8)}-${date}`),
  );
  const statePath = join(outputDir, "candidate-certification-state.json");
  const reportPath = join(outputDir, "candidate-certification.json");
  const markdownPath = join(outputDir, "candidate-certification.md");

  mkdirSync(join(outputDir, "logs"), { recursive: true });
  const stages = buildStages({ ...config, outputDir });
  const previous = config.resume ? loadState(statePath) : null;
  const stageResults = [];

  if (config.dryRun) {
    for (const item of stages) {
      stageResults.push({
        id: item.id,
        label: item.label,
        status: "planned",
        durationMs: 0,
        fingerprint: stageFingerprint(item, source),
        command: item.command,
        logFile: null,
        logSha256: null,
        reused: false,
      });
    }
  } else {
    for (const item of stages) {
      const prior = previous?.stages?.find((entry) => entry.id === item.id);
      if (config.resume && reusableStage(prior, item, source, outputDir)) {
        options.onStageStart?.(item, true);
        stageResults.push({ ...prior, reused: true });
        options.onStageFinish?.({ ...prior, reused: true });
        continue;
      }
      options.onStageStart?.(item, false);
      const result = await executeStage(item, {
        repoRoot,
        outputDir,
        source,
        env: options.env,
        spawnImpl: options.spawnImpl,
      });
      stageResults.push(result);
      options.onStageFinish?.(result);
      writeFileSync(
        statePath,
        `${JSON.stringify(
          {
            version: REPORT_VERSION,
            source,
            stages: stageResults,
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  const finalSource = getSourceIdentity(repoRoot);
  const decision = evaluateDecision({
    source,
    finalSource,
    stages: stageResults,
    dryRun: config.dryRun,
  });
  const draftReport = {
    version: REPORT_VERSION,
    capturedAt: new Date().toISOString(),
    outputDirectory: outputDir,
    source,
    finalSource,
    ...decision,
    stages: stageResults,
    externalGates: EXTERNAL_GATES,
  };
  const launchEvidence = buildLaunchEvidence(draftReport);
  const launch = launchReadinessArtifacts(
    repoRoot,
    outputDir,
    launchEvidence,
  );
  const report = reportWithIntegrity({
    ...draftReport,
    channelReadiness: {
      decision: launch.report.decision,
      ready: launch.report.ready,
      counts: launch.report.counts,
      blockers: launch.report.blockers,
    },
    artifacts: {
      candidateManifest: "release-candidate-manifest/release-candidate-manifest.json",
      launchEvidence: basename(launch.evidencePath),
      launchReadinessJson: basename(launch.jsonPath),
      launchReadinessMarkdown: basename(launch.markdownPath),
    },
  });

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownReport(report));

  return {
    report,
    reportPath,
    markdownPath,
    statePath,
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(helpText());
    return;
  }

  const progress = (message) => {
    if (config.json) console.error(message);
    else console.log(message);
  };
  const result = await runCertifier(config, {
    onStageStart: (item, reused) =>
      progress(`${reused ? "Reuse" : "Run"}: ${item.label}`),
    onStageFinish: (item) =>
      progress(`  ${item.status.toUpperCase()} in ${item.durationMs} ms`),
  });
  if (config.json) console.log(JSON.stringify(result.report, null, 2));
  else {
    console.log(`Public beta candidate: ${result.report.decision}`);
    console.log(`  Local gates: ${result.report.localReady ? "PASS" : "NOT PASS"}`);
    console.log(`  Immutable:   ${result.report.immutable ? "YES" : "NO"}`);
    console.log(`  Report:      ${result.reportPath}`);
  }

  if (config.strict && result.report.decision !== "LOCAL-GREEN-OWNER-GATES-PENDING") {
    process.exitCode = 1;
  }
}

const isCli =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isCli) {
  main().catch((error) => {
    console.error(redactLog(error?.stack || error?.message || String(error)));
    process.exitCode = 1;
  });
}
