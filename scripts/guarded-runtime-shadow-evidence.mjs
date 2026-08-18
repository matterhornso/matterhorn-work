#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const SNAPSHOT_VERSION = "matterhorn.guarded-runtime-shadow-snapshot.v1";
const REVIEW_VERSION = "matterhorn.guarded-runtime-shadow-review.v1";
const REPORT_VERSION = "matterhorn.guarded-runtime-shadow-evidence.v1";
const DEFAULT_MIN_HOURS = 48;
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_FINAL_SNAPSHOT_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_RESTART_TOLERANCE_SECONDS = 300;
const ALLOWED_STAGES = new Set(["issue", "consume"]);
const ALLOWED_DECISIONS = new Set(["would_allow", "would_deny", "allowed", "denied", "bypassed"]);
const ALLOWED_ACCESS = new Set(["read", "prepare", "system"]);
const ALLOWED_OUTCOMES = new Set(["success", "error", "timeout"]);
const REVIEWABLE_DECISIONS = new Set(["would_deny", "bypassed"]);
const ACCEPTED_DISPOSITIONS = new Set(["expected_test", "accepted_policy"]);

function parseArgs(argv) {
  const command = argv[0];
  const config = {
    command,
    serverUrl: "",
    expectedCommit: "",
    output: "",
    baseline: "",
    final: "",
    review: "",
    minHours: DEFAULT_MIN_HOURS,
    now: new Date(),
    strict: false,
    json: false,
    help: command === "--help" || command === "-h" || !command,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--server-url") config.serverUrl = next();
    else if (arg === "--expected-commit") config.expectedCommit = next().toLowerCase();
    else if (arg === "--output") config.output = next();
    else if (arg === "--baseline") config.baseline = next();
    else if (arg === "--final") config.final = next();
    else if (arg === "--review") config.review = next();
    else if (arg === "--min-hours") config.minHours = Number(next());
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (config.help) return config;
  if (!Number.isFinite(config.now.getTime())) throw new Error("--now must be an ISO date-time.");
  if (config.command === "capture") {
    if (!config.serverUrl) throw new Error("capture requires --server-url.");
    if (!/^[a-f0-9]{40}$/.test(config.expectedCommit)) throw new Error("capture requires a full 40-character --expected-commit.");
    if (!config.output) throw new Error("capture requires --output.");
  } else if (config.command === "evaluate") {
    if (!config.baseline) throw new Error("evaluate requires --baseline.");
    if (!config.final) throw new Error("evaluate requires --final.");
    if (!config.output) throw new Error("evaluate requires --output.");
    if (!Number.isFinite(config.minHours) || config.minHours <= 0) throw new Error("--min-hours must be a positive number.");
  } else {
    throw new Error("Command must be capture or evaluate.");
  }
  return config;
}

function help() {
  return [
    "Matterhorn guarded-runtime shadow evidence",
    "",
    "Captures content-free guarded-runtime counters and evaluates an uninterrupted",
    "shadow window. The host token is read only from MATTERHORN_WORK_HOST_TOKEN",
    "and is never written to evidence or accepted as a command-line argument.",
    "",
    "Capture:",
    "  node scripts/guarded-runtime-shadow-evidence.mjs capture \\",
    "    --server-url https://control-plane.example \\",
    "    --expected-commit <40-char-sha> --output shadow-start.json",
    "",
    "Evaluate after 48 hours:",
    "  node scripts/guarded-runtime-shadow-evidence.mjs evaluate \\",
    "    --baseline shadow-start.json --final shadow-end.json \\",
    "    --review shadow-review.json --output shadow-evidence.json --strict --json",
  ].join("\n");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function withIntegrity(value) {
  return { ...value, integrity: { algorithm: "sha256", digest: sha256(stableJson(value)) } };
}

function validIntegrity(value) {
  if (value?.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(value.integrity.digest ?? "")) return false;
  const { integrity: _integrity, ...unsigned } = value;
  return sha256(stableJson(unsigned)) === value.integrity.digest;
}

function rejectSecrets(value, path = "evidence") {
  if (typeof value === "string") {
    if (/(?:Bearer\s+\S{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|0x[a-f0-9]{128,})/i.test(value)) {
      throw new Error(`Credential or signing material is not allowed in ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectSecrets(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:token|authorization|password|passphrase|(?:api|host|access|refresh|session)[-_]?token|api[-_]?key|api[-_]?secret|client[-_]?secret|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|wallet[-_]?export)$/i.test(key)) {
      throw new Error(`Credential or signing material is not allowed: ${path}.${key}`);
    }
    rejectSecrets(entry, `${path}.${key}`);
  }
}

function safeServerUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error("--server-url must not contain credentials, query parameters, or a fragment.");
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("--server-url must use HTTPS (HTTP is allowed only for localhost tests).");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function unescapePrometheus(value) {
  return value.replaceAll("\\n", "\n").replaceAll('\\"', '"').replaceAll("\\\\", "\\");
}

function parseLabels(source) {
  const labels = {};
  let cursor = 0;
  const matcher = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/gy;
  while (cursor < source.length) {
    matcher.lastIndex = cursor;
    const match = matcher.exec(source);
    if (!match) throw new Error("Metrics contain an invalid label set.");
    labels[match[1]] = unescapePrometheus(match[2]);
    cursor = matcher.lastIndex;
    if (cursor === source.length) break;
    if (source[cursor] !== ",") throw new Error("Metrics contain an invalid label separator.");
    cursor += 1;
  }
  return labels;
}

function parseMetrics(source) {
  let ready = null;
  let uptimeSeconds = null;
  const observations = [];
  const toolCalls = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("matterhorn_backend_ready ")) {
      ready = Number(line.slice("matterhorn_backend_ready ".length));
      continue;
    }
    if (line.startsWith("matterhorn_process_uptime_seconds ")) {
      uptimeSeconds = Number(line.slice("matterhorn_process_uptime_seconds ".length));
      continue;
    }
    const guarded = line.match(/^matterhorn_guarded_capability_decisions_total\{([^}]*)\}\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (guarded) {
      const labels = parseLabels(guarded[1]);
      const count = Number(guarded[2]);
      if (labels.mode !== "shadow" || !ALLOWED_STAGES.has(labels.stage) || !ALLOWED_DECISIONS.has(labels.decision)) {
        throw new Error("Guarded-runtime metrics contain an unexpected bounded label.");
      }
      if (!/^[a-zA-Z0-9_.-]{1,96}$/.test(labels.reason ?? "") || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("Guarded-runtime metrics contain an invalid reason or counter.");
      }
      observations.push({ mode: labels.mode, stage: labels.stage, decision: labels.decision, reason: labels.reason, count });
      continue;
    }
    const tool = line.match(/^matterhorn_agent_tool_calls_total\{([^}]*)\}\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (tool) {
      const labels = parseLabels(tool[1]);
      const count = Number(tool[2]);
      if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(labels.tool ?? "") || !ALLOWED_ACCESS.has(labels.access) || !ALLOWED_OUTCOMES.has(labels.outcome)) {
        throw new Error("Agent-tool metrics contain an unexpected bounded label.");
      }
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Agent-tool metrics contain an invalid counter.");
      toolCalls.push({ tool: labels.tool, access: labels.access, outcome: labels.outcome, count });
    }
  }
  if (ready !== 1) throw new Error("Metrics report that the backend is not ready.");
  if (!Number.isFinite(uptimeSeconds) || uptimeSeconds < 0) throw new Error("Metrics do not contain valid process uptime.");
  return { uptimeSeconds, observations, toolCalls };
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}.`);
  return { response, body };
}

async function capture(config) {
  const hostToken = process.env.MATTERHORN_WORK_HOST_TOKEN?.trim() ?? "";
  if (hostToken.length < 32) throw new Error("MATTERHORN_WORK_HOST_TOKEN must be at least 32 characters for capture.");
  const server = safeServerUrl(config.serverUrl);
  const basePath = server.pathname === "/" ? "" : server.pathname.replace(/\/+$/, "");
  const readyUrl = new URL(`${basePath}/health/ready`, server.origin);
  const metricsUrl = new URL(`${basePath}/metrics`, server.origin);
  const healthResult = await fetchText(readyUrl);
  const deployedCommit = healthResult.response.headers.get("x-matterhorn-build-commit")?.toLowerCase() ?? "";
  if (deployedCommit !== config.expectedCommit) throw new Error(`Health reports commit ${deployedCommit || "missing"}; expected ${config.expectedCommit}.`);
  const health = JSON.parse(healthResult.body);
  rejectSecrets(health, "health");
  if (health.ok !== true || health.status !== "ready" || health.checks?.guardedRuntimeReady !== true || health.checks?.guardedRuntimeMode !== "shadow") {
    throw new Error("Guarded runtime is not ready in shadow mode.");
  }
  const metricsResult = await fetchText(metricsUrl, { "x-matterhorn-host-token": hostToken });
  const metrics = parseMetrics(metricsResult.body);
  const snapshot = withIntegrity({
    version: SNAPSHOT_VERSION,
    capturedAt: config.now.toISOString(),
    serverOrigin: server.origin,
    commit: deployedCommit,
    mode: "shadow",
    ready: true,
    processUptimeSeconds: metrics.uptimeSeconds,
    observations: metrics.observations.sort((left, right) => `${left.stage}:${left.decision}:${left.reason}`.localeCompare(`${right.stage}:${right.decision}:${right.reason}`)),
    toolCalls: metrics.toolCalls.sort((left, right) => `${left.tool}:${left.access}:${left.outcome}`.localeCompare(`${right.tool}:${right.access}:${right.outcome}`)),
  });
  rejectSecrets(snapshot);
  const source = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(config.output, source);
  if (config.json) process.stdout.write(source);
  else process.stdout.write(`Guarded shadow snapshot: ${config.output}\n`);
}

function readEvidence(path, expectedVersion, label) {
  const source = readFileSync(path, "utf8");
  const value = JSON.parse(source);
  rejectSecrets(value, label);
  if (value.version !== expectedVersion) throw new Error(`${label} version must be ${expectedVersion}.`);
  return { source, value, sha256: sha256(source) };
}

function metricKey(entry) {
  if ("stage" in entry) return `${entry.stage}\u0000${entry.decision}\u0000${entry.reason}`;
  return `${entry.tool}\u0000${entry.access}\u0000${entry.outcome}`;
}

function metricDeltas(baseline, final) {
  const before = new Map(baseline.map((entry) => [metricKey(entry), entry]));
  const after = new Map(final.map((entry) => [metricKey(entry), entry]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].sort().map((key) => {
    const start = before.get(key);
    const end = after.get(key);
    const shape = end ?? start;
    return { ...shape, start: start?.count ?? 0, end: end?.count ?? 0, delta: (end?.count ?? 0) - (start?.count ?? 0) };
  });
}

function check(id, label, pass, evidence) {
  return { id, label, status: pass ? "pass" : "fail", evidence: evidence ?? null };
}

function evaluate(config) {
  const baseline = readEvidence(config.baseline, SNAPSHOT_VERSION, "baseline");
  const final = readEvidence(config.final, SNAPSHOT_VERSION, "final");
  const startAt = new Date(baseline.value.capturedAt);
  const endAt = new Date(final.value.capturedAt);
  const windowMs = endAt.getTime() - startAt.getTime();
  const windowHours = windowMs / 3_600_000;
  const uptimeDelta = final.value.processUptimeSeconds - baseline.value.processUptimeSeconds;
  const observationDeltas = metricDeltas(baseline.value.observations ?? [], final.value.observations ?? []);
  const toolDeltas = metricDeltas(baseline.value.toolCalls ?? [], final.value.toolCalls ?? []);
  const anomalies = observationDeltas.filter((entry) => entry.delta > 0 && REVIEWABLE_DECISIONS.has(entry.decision));
  const unexpectedShadowDecisions = observationDeltas.filter((entry) => entry.delta > 0 && ["allowed", "denied"].includes(entry.decision));
  const resets = [...observationDeltas, ...toolDeltas].filter((entry) => entry.delta < 0);
  const successfulReads = toolDeltas.filter((entry) => entry.access === "read" && entry.outcome === "success").reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);
  const successfulPrepares = toolDeltas.filter((entry) => entry.access === "prepare" && entry.outcome === "success").reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);
  const issued = observationDeltas.filter((entry) => entry.stage === "issue" && entry.decision === "would_allow").reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);
  const consumed = observationDeltas.filter((entry) => entry.stage === "consume" && entry.decision === "would_allow").reduce((sum, entry) => sum + Math.max(0, entry.delta), 0);

  let review = null;
  let reviewValid = anomalies.length === 0;
  if (config.review) {
    review = readEvidence(config.review, REVIEW_VERSION, "review");
    const reviewedAt = new Date(review.value.reviewedAt);
    const reviewItems = new Map((review.value.items ?? []).map((entry) => [`${entry.stage}\u0000${entry.decision}\u0000${entry.reason}\u0000${entry.delta}`, entry]));
    reviewValid = review.value.commit === final.value.commit
      && review.value.baselineSha256 === baseline.sha256
      && review.value.finalSha256 === final.sha256
      && typeof review.value.reviewer === "string" && review.value.reviewer.trim().length >= 2
      && Number.isFinite(reviewedAt.getTime()) && reviewedAt.getTime() >= endAt.getTime() - MAX_CLOCK_SKEW_MS
      && reviewedAt.getTime() <= config.now.getTime() + MAX_CLOCK_SKEW_MS
      && anomalies.every((entry) => {
        const item = reviewItems.get(`${entry.stage}\u0000${entry.decision}\u0000${entry.reason}\u0000${entry.delta}`);
        return item && ACCEPTED_DISPOSITIONS.has(item.disposition) && typeof item.note === "string" && item.note.trim().length >= 8 && typeof item.evidence === "string" && item.evidence.trim().length > 0;
      });
  }

  const checks = [
    check("baseline_integrity", "Baseline snapshot integrity is valid", validIntegrity(baseline.value), baseline.sha256),
    check("final_integrity", "Final snapshot integrity is valid", validIntegrity(final.value), final.sha256),
    check("same_commit", "Both snapshots bind to one immutable commit", /^[a-f0-9]{40}$/.test(final.value.commit ?? "") && baseline.value.commit === final.value.commit, final.value.commit),
    check("same_origin", "Both snapshots came from the same control-plane origin", baseline.value.serverOrigin === final.value.serverOrigin, final.value.serverOrigin),
    check("shadow_ready", "Both snapshots prove guarded shadow readiness", baseline.value.ready === true && final.value.ready === true && baseline.value.mode === "shadow" && final.value.mode === "shadow", final.value.mode),
    check(
      "snapshot_time",
      "Snapshot timestamps are ordered and the final capture is no more than 12 hours old",
      Number.isFinite(startAt.getTime()) && Number.isFinite(endAt.getTime())
        && windowMs >= 0
        && endAt.getTime() <= config.now.getTime() + MAX_CLOCK_SKEW_MS
        && config.now.getTime() - endAt.getTime() <= MAX_FINAL_SNAPSHOT_AGE_MS,
      final.value.capturedAt,
    ),
    check("window_duration", `Shadow observation is at least ${config.minHours} hours`, Number.isFinite(windowMs) && windowHours >= config.minHours, Number.isFinite(windowHours) ? windowHours.toFixed(3) : "invalid"),
    check("uninterrupted_process", "The single backend process remained up for the observation window", uptimeDelta >= Math.max(0, windowMs / 1000 - MAX_RESTART_TOLERANCE_SECONDS), uptimeDelta),
    check("counter_monotonicity", "Guarded and tool counters did not reset", resets.length === 0, resets.length),
    check("shadow_decision_shape", "Shadow emitted only would-allow, would-deny, or bypass observations", unexpectedShadowDecisions.length === 0, unexpectedShadowDecisions.length),
    check("issue_exercised", "At least one capability issue decision was exercised", issued > 0, issued),
    check("consume_exercised", "At least one capability consume decision was exercised", consumed > 0, consumed),
    check("read_exercised", "At least one successful crypto read tool call completed", successfulReads > 0, successfulReads),
    check("prepare_exercised", "At least one successful crypto prepare tool call completed", successfulPrepares > 0, successfulPrepares),
    check("anomaly_review", "Every shadow denial and bypass has an exact evidence-bound review", reviewValid, anomalies.length),
  ];
  const blockers = checks.filter((entry) => entry.status === "fail").map(({ id, label }) => ({ id, action: label }));
  const unsigned = {
    version: REPORT_VERSION,
    decision: blockers.length ? "NO-GO" : "GO",
    ready: blockers.length === 0,
    commit: final.value.commit ?? null,
    serverOrigin: final.value.serverOrigin ?? null,
    evaluatedAt: config.now.toISOString(),
    window: {
      startedAt: baseline.value.capturedAt ?? null,
      endedAt: final.value.capturedAt ?? null,
      hours: Number.isFinite(windowHours) ? Number(windowHours.toFixed(3)) : null,
      processUptimeDeltaSeconds: Number.isFinite(uptimeDelta) ? uptimeDelta : null,
    },
    evidence: {
      baselinePath: config.baseline,
      baselineSha256: baseline.sha256,
      finalPath: config.final,
      finalSha256: final.sha256,
      reviewPath: config.review || null,
      reviewSha256: review?.sha256 ?? null,
    },
    summary: { successfulReads, successfulPrepares, issued, consumed, anomalyCount: anomalies.length },
    observationDeltas,
    toolDeltas,
    checks,
    blockers,
  };
  const report = withIntegrity(unsigned);
  rejectSecrets(report);
  const source = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(config.output, source);
  if (config.json) process.stdout.write(source);
  else process.stdout.write(`Guarded shadow evidence: ${report.decision}\nReport: ${config.output}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  if (config.command === "capture") await capture(config);
  else evaluate(config);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
