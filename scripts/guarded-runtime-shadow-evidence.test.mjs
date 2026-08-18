#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const commit = "a".repeat(40);
const hostToken = "host-token-for-shadow-evidence-tests";
const dir = mkdtempSync(join(tmpdir(), "matterhorn-guarded-shadow-"));
const baselinePath = join(dir, "baseline.json");
const finalPath = join(dir, "final.json");
const reportPath = join(dir, "report.json");
const reviewPath = join(dir, "review.json");
let uptime = 1_000;
let issueAllow = 10;
let consumeAllow = 8;
let readSuccess = 4;
let prepareSuccess = 2;
let wouldDeny = 0;

function metrics() {
  return [
    "# TYPE matterhorn_backend_ready gauge",
    "matterhorn_backend_ready 1",
    "# TYPE matterhorn_process_uptime_seconds gauge",
    `matterhorn_process_uptime_seconds ${uptime}`,
    "# TYPE matterhorn_guarded_capability_decisions_total counter",
    `matterhorn_guarded_capability_decisions_total{mode="shadow",stage="issue",decision="would_allow",reason="policy_allowed"} ${issueAllow}`,
    `matterhorn_guarded_capability_decisions_total{mode="shadow",stage="consume",decision="would_allow",reason="policy_allowed"} ${consumeAllow}`,
    ...(wouldDeny > 0 ? [`matterhorn_guarded_capability_decisions_total{mode="shadow",stage="issue",decision="would_deny",reason="wrong_desk"} ${wouldDeny}`] : []),
    "# TYPE matterhorn_agent_tool_calls_total counter",
    `matterhorn_agent_tool_calls_total{tool="matterhorn-work_sui_balance",access="read",outcome="success"} ${readSuccess}`,
    `matterhorn_agent_tool_calls_total{tool="matterhorn-work_sui_prepare_transfer",access="prepare",outcome="success"} ${prepareSuccess}`,
    "",
  ].join("\n");
}

const server = createServer((request, response) => {
  if (request.url === "/health/ready") {
    response.writeHead(200, {
      "content-type": "application/json",
      "x-matterhorn-build-commit": commit,
    });
    response.end(JSON.stringify({
      ok: true,
      status: "ready",
      checks: { guardedRuntimeReady: true, guardedRuntimeMode: "shadow" },
    }));
    return;
  }
  if (request.url === "/metrics") {
    if (request.headers["x-matterhorn-host-token"] !== hostToken) {
      response.writeHead(401).end("unauthorized");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(metrics());
    return;
  }
  response.writeHead(404).end("not found");
});

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/guarded-runtime-shadow-evidence.mjs", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const serverUrl = `http://127.0.0.1:${address.port}`;

  const baseline = await run([
    "capture", "--server-url", serverUrl, "--expected-commit", commit,
    "--output", baselinePath, "--now", "2026-08-19T00:00:00.000Z", "--json",
  ], { MATTERHORN_WORK_HOST_TOKEN: hostToken });
  assert.equal(baseline.code, 0, baseline.stderr || baseline.stdout);
  assert.equal(baseline.stdout.includes(hostToken), false);
  const baselineJson = JSON.parse(baseline.stdout);
  assert.equal(baselineJson.version, "matterhorn.guarded-runtime-shadow-snapshot.v1");
  assert.equal(baselineJson.mode, "shadow");
  assert.equal(baselineJson.commit, commit);
  assert.equal(baselineJson.observations.length, 2);

  uptime += (48 * 60 * 60) + 600;
  issueAllow += 5;
  consumeAllow += 4;
  readSuccess += 3;
  prepareSuccess += 1;
  const final = await run([
    "capture", "--server-url", serverUrl, "--expected-commit", commit,
    "--output", finalPath, "--now", "2026-08-21T00:05:00.000Z", "--json",
  ], { MATTERHORN_WORK_HOST_TOKEN: hostToken });
  assert.equal(final.code, 0, final.stderr || final.stdout);

  const clean = await run([
    "evaluate", "--baseline", baselinePath, "--final", finalPath,
    "--output", reportPath, "--now", "2026-08-21T00:06:00.000Z", "--strict", "--json",
  ]);
  assert.equal(clean.code, 0, clean.stderr || clean.stdout);
  const cleanReport = JSON.parse(clean.stdout);
  assert.equal(cleanReport.decision, "GO");
  assert.equal(cleanReport.ready, true);
  assert.equal(cleanReport.summary.successfulReads, 3);
  assert.equal(cleanReport.summary.successfulPrepares, 1);
  assert.equal(cleanReport.summary.anomalyCount, 0);

  const short = await run([
    "evaluate", "--baseline", baselinePath, "--final", finalPath,
    "--output", reportPath, "--min-hours", "72", "--now", "2026-08-21T00:06:00.000Z", "--strict", "--json",
  ]);
  assert.equal(short.code, 1);
  assert.ok(JSON.parse(short.stdout).blockers.some((entry) => entry.id === "window_duration"));

  wouldDeny = 2;
  issueAllow += 1;
  consumeAllow += 1;
  readSuccess += 1;
  prepareSuccess += 1;
  uptime += 60;
  const anomalousPath = join(dir, "final-anomalous.json");
  const anomalous = await run([
    "capture", "--server-url", serverUrl, "--expected-commit", commit,
    "--output", anomalousPath, "--now", "2026-08-21T00:06:00.000Z",
  ], { MATTERHORN_WORK_HOST_TOKEN: hostToken });
  assert.equal(anomalous.code, 0, anomalous.stderr || anomalous.stdout);

  const unreviewed = await run([
    "evaluate", "--baseline", baselinePath, "--final", anomalousPath,
    "--output", reportPath, "--now", "2026-08-21T00:07:00.000Z", "--strict", "--json",
  ]);
  assert.equal(unreviewed.code, 1);
  assert.ok(JSON.parse(unreviewed.stdout).blockers.some((entry) => entry.id === "anomaly_review"));

  const template = await run([
    "review-template", "--baseline", baselinePath, "--final", anomalousPath,
    "--reviewer", "Release owner", "--output", reviewPath,
    "--now", "2026-08-21T00:06:30.000Z", "--json",
  ]);
  assert.equal(template.code, 0, template.stderr || template.stdout);
  const generatedReview = JSON.parse(template.stdout);
  assert.equal(generatedReview.version, "matterhorn.guarded-runtime-shadow-review.v1");
  assert.equal(generatedReview.commit, commit);
  assert.equal(generatedReview.baselineSha256, hashFile(baselinePath));
  assert.equal(generatedReview.finalSha256, hashFile(anomalousPath));
  assert.equal(generatedReview.items.length, 1);
  assert.deepEqual(
    generatedReview.items[0],
    {
      stage: "issue",
      decision: "would_deny",
      reason: "wrong_desk",
      delta: 2,
      disposition: "REVIEW_REQUIRED",
      note: "",
      evidence: "",
    },
  );
  const untouchedTemplate = await run([
    "evaluate", "--baseline", baselinePath, "--final", anomalousPath,
    "--review", reviewPath, "--output", reportPath,
    "--now", "2026-08-21T00:07:00.000Z", "--strict", "--json",
  ]);
  assert.equal(untouchedTemplate.code, 1);
  assert.ok(JSON.parse(untouchedTemplate.stdout).blockers.some((entry) => entry.id === "anomaly_review"));

  writeFileSync(join(dir, "wrong-desk-negative.json"), "{\"status\":\"expected-denial\"}\n");
  generatedReview.items[0].disposition = "expected_test";
  generatedReview.items[0].note = "Expected wrong-desk negative acceptance exercise.";
  generatedReview.items[0].evidence = "wrong-desk-negative.json";
  writeFileSync(reviewPath, `${JSON.stringify(generatedReview, null, 2)}\n`);
  const reviewed = await run([
    "evaluate", "--baseline", baselinePath, "--final", anomalousPath,
    "--review", reviewPath, "--output", reportPath,
    "--now", "2026-08-21T00:07:00.000Z", "--strict", "--json",
  ]);
  assert.equal(reviewed.code, 0, reviewed.stderr || reviewed.stdout);
  assert.equal(JSON.parse(reviewed.stdout).decision, "GO");

  const missingEvidenceReview = JSON.parse(readFileSync(reviewPath, "utf8"));
  missingEvidenceReview.items[0].evidence = "missing-negative-evidence.json";
  writeFileSync(reviewPath, `${JSON.stringify(missingEvidenceReview, null, 2)}\n`);
  const missingEvidence = await run([
    "evaluate", "--baseline", baselinePath, "--final", anomalousPath,
    "--review", reviewPath, "--output", reportPath,
    "--now", "2026-08-21T00:07:00.000Z", "--strict", "--json",
  ]);
  assert.equal(missingEvidence.code, 1);
  assert.ok(JSON.parse(missingEvidence.stdout).blockers.some((entry) => entry.id === "anomaly_review"));

  writeFileSync(reviewPath, `${JSON.stringify({
    version: "matterhorn.guarded-runtime-shadow-review.v1",
    commit,
    baselineSha256: hashFile(baselinePath),
    finalSha256: hashFile(anomalousPath),
    reviewer: "Release owner",
    reviewedAt: "2026-08-21T00:06:30.000Z",
    apiToken: "must-never-enter-evidence",
    items: [],
  }, null, 2)}\n`);
  const secret = await run([
    "evaluate", "--baseline", baselinePath, "--final", anomalousPath,
    "--review", reviewPath, "--output", reportPath, "--strict",
  ]);
  assert.equal(secret.code, 1);
  assert.match(secret.stderr, /Credential or signing material is not allowed/);

  const missingHostToken = await run([
    "capture", "--server-url", serverUrl, "--expected-commit", commit,
    "--output", join(dir, "missing-token.json"),
  ], { MATTERHORN_WORK_HOST_TOKEN: "" });
  assert.equal(missingHostToken.code, 1);
  assert.match(missingHostToken.stderr, /MATTERHORN_WORK_HOST_TOKEN/);
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}

console.log("Guarded runtime shadow evidence contract passed.");
