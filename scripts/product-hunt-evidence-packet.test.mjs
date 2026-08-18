#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "matterhorn-product-hunt-packet-"));
const outputDir = join(temp, "packet");
const commit = "e".repeat(40);
const reports = {
  readiness: { version: "matterhorn.launch-channel-readiness.v1", channel: "product-hunt", ready: true, decision: "GO", commit },
  deployment: { version: "matterhorn.product-hunt-deployment-probe.v1", ready: true, metadata: { expectedCommit: commit } },
  operations: { version: "matterhorn.product-hunt-operations-readiness.v2", ready: true, decision: "GO", commit },
  guardedShadow: { version: "matterhorn.guarded-runtime-shadow-evidence.v1", ready: true, decision: "GO", commit },
  acceptance: { version: "matterhorn.product-hunt-acceptance-readiness.v1", ready: true, decision: "GO", commit },
  desktop: { version: "matterhorn.desktop-public-release-verification.v1", ready: true, status: "pass", sourceCommit: commit },
};

function writeReports(values) {
  const paths = {};
  for (const [label, value] of Object.entries(values)) {
    const path = join(temp, `${label}.json`);
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    paths[label] = path;
  }
  return paths;
}

function run(paths) {
  const args = ["scripts/product-hunt-evidence-packet.mjs", "--commit", commit, "--output-dir", outputDir, "--strict", "--json"];
  for (const label of Object.keys(reports)) args.push(label === "guardedShadow" ? "--guarded-shadow" : `--${label}`, paths[label]);
  return new Promise((resolve) => {
    const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const pass = await run(writeReports(reports));
  assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  const report = JSON.parse(pass.stdout);
  assert.equal(report.version, "matterhorn.product-hunt-evidence-packet.v1");
  assert.equal(report.decision, "GO");
  assert.equal(report.commit, commit);
  assert.equal(report.reports.length, 6);
  const checksums = readFileSync(join(outputDir, "SHA256SUMS"), "utf8");
  assert.match(checksums, /product-hunt-evidence-manifest\.json/);
  for (const item of report.reports) {
    assert.equal(existsSync(join(outputDir, item.file)), true);
    assert.match(checksums, new RegExp(`  ${item.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }

  const mismatch = structuredClone(reports);
  mismatch.desktop.sourceCommit = "f".repeat(40);
  const blocked = await run(writeReports(mismatch));
  assert.equal(blocked.code, 1);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((item) => item.id === "desktop_commit"));

  const unsafe = structuredClone(reports);
  unsafe.acceptance.apiToken = "never";
  const rejected = await run(writeReports(unsafe));
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /Credential-shaped report key/);
  console.log("Product Hunt evidence packet contract passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
