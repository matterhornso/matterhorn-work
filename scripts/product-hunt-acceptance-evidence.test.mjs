#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "matterhorn-product-hunt-acceptance-"));
const path = join(dir, "acceptance.json");
const now = "2026-07-20T12:00:00.000Z";
const passSteps = { connect: true, reject: true, approve: true, receipt: true, reload: true, disconnect: true };
const input = {
  version: "matterhorn.product-hunt-acceptance-evidence.v1",
  capturedAt: "2026-07-20T11:00:00.000Z",
  commit: "a".repeat(40),
  environment: "deployed",
  appUrl: "https://app.matterhorn.example/workspace/ws/session",
  wallets: {
    metamask: { status: "pass", ...passSteps, browser: "Chrome 140", walletVersion: "1.2.3", reportPath: "metamask.md" },
    coinbase: { status: "pass", ...passSteps, browser: "Chrome 140", walletVersion: "4.5.6", reportPath: "coinbase.md" },
    phantomSui: { status: "pass", network: "sui-testnet", connect: true, reject: true, approveHandoff: true, receipt: true, reload: true, disconnect: true, walletVersion: "9.8.7", reportPath: "phantom.md" },
    hyperliquid: { status: "pass", network: "testnet", wallet: "MetaMask", connect: true, reject: true, approve: true, receipt: true, replayBlocked: true, expiryBlocked: true, limitBlocked: true, killSwitchBlocked: true, reportPath: "hyperliquid.md" },
  },
  users: {
    newUser: { status: "pass", tester: "Tester A", openProject: true, chat: true, desk: true, note: true, output: true, reportPath: "new-user.md" },
    existingUser: { status: "pass", tester: "Tester B", openProject: true, chat: true, desk: true, note: true, output: true, reportPath: "existing-user.md" },
  },
  oauth: { visible: [{ id: "notion", status: "pass", connect: true, reload: true, toolCall: true, disconnect: true, revokedAccountBlocked: true, reportPath: "notion.md" }] },
};

function run(value, expectedOauth = "notion") {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/product-hunt-acceptance-evidence.mjs", "--evidence", path, "--expected-oauth", expectedOauth, "--now", now, "--strict", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const pass = await run(input);
  assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  const report = JSON.parse(pass.stdout);
  assert.equal(report.decision, "GO");
  assert.deepEqual(report.acceptedOauthConnectors, ["notion"]);
  assert.equal(report.buildEnvironment, "VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS=notion");

  const blocked = await run({ ...input, wallets: { ...input.wallets, hyperliquid: { ...input.wallets.hyperliquid, replayBlocked: false } } });
  assert.equal(blocked.code, 1);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((item) => item.id === "hyperliquid_testnet_journey"));

  const missingOauth = await run(input, "notion,linear");
  assert.equal(missingOauth.code, 1);
  assert.deepEqual(JSON.parse(missingOauth.stdout).acceptedOauthConnectors, []);

  const secret = await run({ ...input, wallets: { ...input.wallets, metamask: { ...input.wallets.metamask, rawSignature: "0xnever" } } });
  assert.equal(secret.code, 1);
  assert.match(secret.stderr, /signing material is not allowed/i);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("Product Hunt external acceptance contract passed.");
