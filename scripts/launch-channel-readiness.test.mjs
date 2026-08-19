#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(pkg.scripts["launch:readiness"], "node scripts/launch-channel-readiness.mjs");
assert.equal(pkg.scripts["test:launch-channel-readiness"], "node scripts/launch-channel-readiness.test.mjs");

const now = "2026-07-16T12:00:00.000Z";
const dir = mkdtempSync(join(tmpdir(), "matterhorn-launch-channel-"));

function listGates(channel, releaseSurface = "web-and-desktop") {
  const result = spawnSync(process.execPath, [
    "scripts/launch-channel-readiness.mjs",
    "--channel", channel,
    "--release-surface", releaseSurface,
    "--list-gates",
    "--json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).gates;
}

function passingEvidence() {
  const common = {};
  const channels = { beta: {}, "public-beta": {}, "product-hunt": {} };
  for (const channel of ["beta", "public-beta", "product-hunt"]) {
    for (const gate of listGates(channel)) {
      const target =
        gate.id.startsWith("beta.")
          ? channels.beta
          : channel === "public-beta" && !common[gate.id]
            ? channels["public-beta"]
            : common[gate.id]
              ? channels[channel]
              : common;
      target[gate.id] ??= { status: "pass", evidence: `qa/${gate.id}.json` };
    }
  }
  return {
    version: "matterhorn.launch-channel-evidence.v1",
    capturedAt: now,
    commit: "a".repeat(40),
    common: { gates: common },
    channels: {
      beta: { gates: channels.beta },
      "public-beta": { gates: channels["public-beta"] },
      "product-hunt": { gates: channels["product-hunt"] },
    },
  };
}

function run(channel, evidence, extra = []) {
  const evidencePath = join(dir, `${channel}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return spawnSync(process.execPath, [
    "scripts/launch-channel-readiness.mjs",
    "--channel", channel,
    "--evidence", evidencePath,
    "--now", now,
    "--strict",
    "--json",
    ...extra,
  ], { encoding: "utf8" });
}

const evidence = passingEvidence();
const beta = run("beta", evidence);
assert.equal(beta.status, 0, beta.stderr);
const betaReport = JSON.parse(beta.stdout);
assert.equal(betaReport.ready, true);
assert.equal(betaReport.decision, "GO");

const publicBeta = run("public-beta", evidence);
assert.equal(publicBeta.status, 0, publicBeta.stderr);
const publicBetaReport = JSON.parse(publicBeta.stdout);
assert.equal(publicBetaReport.ready, true);
assert.ok(publicBetaReport.counts.required > betaReport.counts.required);
assert.ok(publicBetaReport.checks.some((check) => check.id === "web.authenticated_same_origin"));
assert.ok(publicBetaReport.checks.some((check) => check.id === "distribution.public_download"));
assert.ok(publicBetaReport.checks.some((check) => check.id === "security.credential_rotation"));

const publicWebGates = listGates("public-beta", "web");
assert.ok(publicWebGates.some((gate) => gate.id === "web.authenticated_same_origin"));
assert.ok(!publicWebGates.some((gate) => gate.id === "desktop.signed_notarized"));
assert.ok(!publicWebGates.some((gate) => gate.id === "desktop.clean_install"));
assert.ok(!publicWebGates.some((gate) => gate.id === "distribution.public_download"));
const publicWeb = run("public-beta", evidence, ["--release-surface", "web"]);
assert.equal(publicWeb.status, 0, publicWeb.stderr);
const publicWebReport = JSON.parse(publicWeb.stdout);
assert.equal(publicWebReport.releaseSurface, "web");
assert.equal(publicWebReport.counts.required, publicBetaReport.counts.required - 3);

const invalidProductHuntSurface = spawnSync(process.execPath, [
  "scripts/launch-channel-readiness.mjs",
  "--channel", "product-hunt",
  "--release-surface", "web",
  "--list-gates",
], { encoding: "utf8" });
assert.notEqual(invalidProductHuntSurface.status, 0);
assert.match(invalidProductHuntSurface.stderr, /supported only for the public-beta channel/);

const productHunt = run("product-hunt", evidence);
assert.equal(productHunt.status, 0, productHunt.stderr);
const productHuntReport = JSON.parse(productHunt.stdout);
assert.equal(productHuntReport.ready, true);
assert.ok(productHuntReport.counts.required > betaReport.counts.required);
assert.ok(productHuntReport.checks.some((check) => check.id === "wallet.hyperliquid_testnet"));
assert.ok(productHuntReport.checks.some((check) => check.id === "desktop.signed_notarized"));
assert.ok(productHuntReport.checks.some((check) => check.id === "distribution.public_download"));
assert.ok(productHuntReport.checks.some((check) => check.id === "support.public_beta_channel"));

const pending = structuredClone(evidence);
pending.channels.beta.gates["beta.support_owner"] = { status: "pending", evidence: "" };
const pendingResult = run("beta", pending);
assert.notEqual(pendingResult.status, 0);
assert.ok(JSON.parse(pendingResult.stdout).blockers.some((blocker) => blocker.id === "beta.support_owner"));

const publicPending = structuredClone(evidence);
publicPending.channels["public-beta"].gates["web.authenticated_same_origin"] = { status: "pending", evidence: "" };
const publicPendingResult = run("public-beta", publicPending);
assert.notEqual(publicPendingResult.status, 0);
assert.ok(JSON.parse(publicPendingResult.stdout).blockers.some((blocker) => blocker.id === "web.authenticated_same_origin"));

const missingEvidence = structuredClone(evidence);
missingEvidence.common.gates["code.app_suite"] = { status: "pass", evidence: "" };
const missingResult = run("beta", missingEvidence);
assert.notEqual(missingResult.status, 0);
assert.ok(JSON.parse(missingResult.stdout).blockers.some((blocker) => blocker.id === "code.app_suite" && blocker.status === "missing_evidence"));

const stale = structuredClone(evidence);
stale.capturedAt = "2026-07-14T00:00:00.000Z";
const staleResult = run("beta", stale);
assert.notEqual(staleResult.status, 0);
assert.ok(JSON.parse(staleResult.stdout).blockers.some((blocker) => blocker.id === "evidence.freshness"));

const unsafe = structuredClone(evidence);
unsafe.privateKey = "must-not-be-read";
const unsafeResult = run("beta", unsafe);
assert.notEqual(unsafeResult.status, 0);
assert.match(unsafeResult.stderr, /Credential-shaped evidence key is not allowed/);

const markdownPath = join(dir, "product-hunt.md");
const markdownResult = run("product-hunt", evidence, ["--markdown-output", markdownPath]);
assert.equal(markdownResult.status, 0, markdownResult.stderr);
const markdown = readFileSync(markdownPath, "utf8");
assert.match(markdown, /Matterhorn Product Hunt Readiness/);
assert.match(markdown, /\*\*Decision:\*\* GO/);

rmSync(dir, { recursive: true, force: true });
console.log("Launch-channel readiness gate test passed.");
