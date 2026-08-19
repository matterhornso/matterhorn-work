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
  version: "matterhorn.product-hunt-acceptance-evidence.v2",
  capturedAt: "2026-07-20T11:00:00.000Z",
  commit: "a".repeat(40),
  environment: "deployed",
  appUrl: "https://app.matterhorn.example/workspace/ws/session",
  authentication: {
    signup: {
      status: "pass", tester: "Tester Signup", createAccount: true, turnstile: true,
      legalAcceptance: true, verificationEmail: true, verifyEmail: true, signIn: true,
      signOut: true, passwordReset: true, reportPath: "signup.md",
    },
    twoAccountIsolation: {
      status: "pass", tester: "Isolation tester", workspaces: true, preflights: true,
      grants: true, receipts: true, memories: true, actions: true, reportPath: "isolation.md",
    },
  },
  agentRuntime: {
    privacy: {
      status: "pass", sensitiveBlocked: true, usageReservationZeroOnBlock: true,
      providerContactZeroOnBlock: true, privateConsentRequired: true, consentExactBinding: true,
      consentMutationBlocked: true, providerDisclosed: true, reportPath: "privacy.md",
    },
    capability: {
      status: "pass", wrongDeskBlocked: true, wrongToolBlocked: true, readCannotPrepare: true,
      replayBlocked: true, argumentMutationBlocked: true, crossWorkspaceBlocked: true,
      crossSessionBlocked: true, noSubmitCapability: true, reportPath: "capability.md",
    },
    genericCrypto: {
      status: "pass", publicResearch: true, privateContextFlow: true, modelCompletion: true,
      runReceipt: true, privacyReceipt: true, usageReceipt: true, toolReceipt: true,
      reload: true, reportPath: "generic-crypto.md",
    },
    desks: {
      bittensor: {
        status: "pass", network: "testnet", publicResearch: true, privateContextFlow: true,
        modelCompletion: true, runReceipt: true, prepare: true, reject: true, expiryBlocked: true,
        tamperBlocked: true, walletReview: true, receiptReconciled: true, reload: true,
        balance: true, validatorComparison: true, transferPreview: true, stakePreview: true,
        reportPath: "bittensor.md",
      },
      hyperliquid: {
        status: "pass", network: "testnet", publicResearch: true, privateContextFlow: true,
        modelCompletion: true, runReceipt: true, prepare: true, reject: true, expiryBlocked: true,
        tamperBlocked: true, walletReview: true, receiptReconciled: true, reload: true,
        markets: true, positions: true, orderbook: true, orderPreview: true,
        modifyCancelPreview: true, closePreview: true, reportPath: "hyperliquid-guarded.md",
      },
      polymarket: {
        status: "pass", network: "preview", publicResearch: true, privateContextFlow: true,
        modelCompletion: true, runReceipt: true, prepare: true, reject: true, expiryBlocked: true,
        tamperBlocked: true, walletReview: true, receiptReconciled: true, reload: true,
        discovery: true, complianceBlock: true, eligiblePreview: true, walletTicket: true,
        reportPath: "polymarket.md",
      },
      sui: {
        status: "pass", network: "sui-testnet", publicResearch: true, privateContextFlow: true,
        modelCompletion: true, runReceipt: true, prepare: true, reject: true, expiryBlocked: true,
        tamperBlocked: true, walletReview: true, receiptReconciled: true, reload: true,
        balance: true, nativeTransferPreview: true, coinTransferPreview: true,
        objectTransferPreview: true, reportPath: "sui.md",
      },
    },
  },
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

for (const name of [
  "signup.md", "isolation.md", "privacy.md", "capability.md", "generic-crypto.md",
  "bittensor.md", "hyperliquid-guarded.md", "polymarket.md", "sui.md",
  "metamask.md", "coinbase.md", "phantom.md", "hyperliquid.md",
  "new-user.md", "existing-user.md", "notion.md",
]) writeFileSync(join(dir, name), `Acceptance evidence: ${name}\n`);

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
  assert.equal(report.version, "matterhorn.product-hunt-acceptance-readiness.v2");
  assert.deepEqual(report.acceptedOauthConnectors, ["notion"]);
  assert.equal(report.buildEnvironment, "VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS=notion");

  const blocked = await run({ ...input, wallets: { ...input.wallets, hyperliquid: { ...input.wallets.hyperliquid, replayBlocked: false } } });
  assert.equal(blocked.code, 1);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((item) => item.id === "hyperliquid_testnet_journey"));

  const signupBlocked = await run({
    ...input,
    authentication: {
      ...input.authentication,
      signup: { ...input.authentication.signup, passwordReset: false },
    },
  });
  assert.equal(signupBlocked.code, 1);
  assert.ok(JSON.parse(signupBlocked.stdout).blockers.some((item) => item.id === "signup_journey"));

  const privacyBlocked = await run({
    ...input,
    agentRuntime: {
      ...input.agentRuntime,
      privacy: { ...input.agentRuntime.privacy, providerContactZeroOnBlock: false },
    },
  });
  assert.equal(privacyBlocked.code, 1);
  assert.ok(JSON.parse(privacyBlocked.stdout).blockers.some((item) => item.id === "privacy_firewall"));

  const tamperBlocked = await run({
    ...input,
    agentRuntime: {
      ...input.agentRuntime,
      desks: {
        ...input.agentRuntime.desks,
        sui: { ...input.agentRuntime.desks.sui, tamperBlocked: false },
      },
    },
  });
  assert.equal(tamperBlocked.code, 1);
  assert.ok(JSON.parse(tamperBlocked.stdout).blockers.some((item) => item.id === "sui_guarded_journey"));

  const missingEvidence = await run({
    ...input,
    agentRuntime: {
      ...input.agentRuntime,
      genericCrypto: { ...input.agentRuntime.genericCrypto, reportPath: "missing-generic.md" },
    },
  });
  assert.equal(missingEvidence.code, 1);
  assert.ok(JSON.parse(missingEvidence.stdout).blockers.some((item) => item.id === "generic_crypto_journey"));

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
