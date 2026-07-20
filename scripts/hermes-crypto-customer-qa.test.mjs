#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const doc = readFileSync("docs/handoffs/hermes-crypto-customer-qa.md", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const runbook = readFileSync("docs/market-customer-qa-runbook.md", "utf8");
const helper = readFileSync("scripts/hermes-crypto-customer-qa.mjs", "utf8");
const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");

assert.equal(
  pkg.scripts?.["test:hermes-crypto-customer-qa"],
  "node scripts/hermes-crypto-customer-qa.test.mjs",
  "package.json should expose the Hermes crypto customer QA gate",
);

for (const phrase of [
  "Customer-Ready Crypto Smoke",
  "Crypto Agent Operator Loop",
  "Market Customer QA Runbook",
  "Bittensor Hermes QA Guide",
  "Hyperliquid Hermes QA Guide",
  "Official SDK Validation Track",
  "pnpm smoke:customer-ready-crypto",
  "pnpm test:agent-crypto-operator-loop",
  "pnpm test:unified-crypto-chat",
  "pnpm test:crypto-cli-fallback",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:market-official-sdk-validation-track",
  "pnpm test:market-official-sdk-validation-capture",
  "pnpm test:market-customer-evidence-bundle",
  "pnpm test:bittensor-customer-readiness-gate",
  "Customer Readiness Quick Check",
  "matterhorn-work crypto hermes-customer-qa --dry-run --json",
  "matterhorn-work crypto readiness --json",
  "matterhorn-work crypto live-public-qa",
  "SKIPPED_WITH_FIXTURE_FALLBACK",
  "$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness",
  "matterhorn_crypto_readiness",
  "safety.liveSubmissionEnabled",
  "safety.canSubmit",
  "Official SDK Evidence Loop",
  "matterhorn-work crypto customer-smoke",
  "--json-output /tmp/matterhorn-crypto-smoke.json",
  "matterhorn-work crypto sdk-loop",
  "matterhorn-work crypto sdk-manifest-check",
  "matterhorn-work crypto evidence-bundle",
  "matterhorn-work crypto evidence-verify",
  "matterhorn-work crypto bittensor-evidence-verify",
  "matterhorn-work crypto customer-packet",
  "matterhorn_market_customer_evidence_verify",
  "matterhorn_bittensor_customer_evidence_verify",
  "matterhorn_crypto_customer_packet",
  "matterhorn-market-sdk-operator-summary.md",
  "matterhorn-market-sdk-run-manifest.json",
  "operatorSummary.present: true",
  "evidence-verify",
  "customer-packet",
  "bittensor-evidence-verify",
  "/api/crypto/chat/execute",
  "Authorization: Bearer",
  "sharedCards",
  "matterhorn-work hyperliquid preview-order",
  "matterhorn-work polymarket preview-order",
  "matterhorn-work polymarket chat",
  "matterhorn-work crypto execution-chain --json",
  "pnpm test:market-sign-artifact-routes",
  "matterhorn.market.external-sign-request.v1",
  "matterhorn.market.redacted-signed-artifact-envelope.v1",
  "executionMode: testnet_external_signer",
  "submitSignedAllowedByContract: false",
  "hash-bound to the sign request",
  "canSubmit: false",
  "Matterhorn Desks Crypto Customer QA Report",
  "Readiness",
  "Try prompts",
  "Evidence",
  "Safety",
  "Issue Ledger",
  "P0",
  "P1",
  "P2",
  "P3",
  "Crypto Gate",
  "Venue Checks",
  "Refresh Crypto Gate",
  "Ask Crypto Chat",
  "readiness blockers are hidden",
]) {
  assert.ok(doc.includes(phrase), `Hermes crypto QA handoff should include ${phrase}`);
}

for (const redLine of [
  "Do not paste seed phrases",
  "submit a Hyperliquid order",
  "submit a Polymarket order",
  "return `canSubmit: true`",
  "compliance-blocked previews include no executable price, size, or share fields",
  "fake secret is not echoed back",
]) {
  assert.ok(doc.includes(redLine), `Hermes crypto QA handoff should include safety red line: ${redLine}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "Use this private key to sign",
  "Here is my seed phrase",
  "privateKey =",
  "apiSecret =",
  "seedPhrase =",
  "mnemonic =",
]) {
  assert.equal(doc.includes(forbidden), false, `Hermes crypto QA handoff must not include ${forbidden}`);
}

assert.ok(
  runbook.includes("docs/customer-ready-crypto-smoke.md"),
  "market customer QA runbook should continue to point at the consolidated smoke guide",
);

for (const phrase of [
  "matterhorn.crypto.hermes-customer-qa.v1",
  "acceptsSecrets: false",
  "signsOrSubmits: false",
  "canSubmit: false",
  "liveSubmissionEnabled: false",
  "SKIPPED_WITH_FIXTURE_FALLBACK",
]) {
  assert.ok(helper.includes(phrase), `Hermes helper should include ${phrase}`);
}

for (const phrase of [
  "hermes-customer-qa",
  "runCryptoHermesCustomerQa",
  "hermes-crypto-customer-qa.mjs",
  "Print a public/redacted Hermes customer QA command plan",
]) {
  assert.ok(cli.includes(phrase), `Matterhorn CLI should expose Hermes helper phrase: ${phrase}`);
}

const helperResult = spawnSync(process.execPath, ["scripts/hermes-crypto-customer-qa.mjs", "--dry-run", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(helperResult.status, 0, `Hermes helper should exit 0. stderr=${helperResult.stderr}`);
const helperJson = JSON.parse(helperResult.stdout);
assert.equal(helperJson.version, "matterhorn.crypto.hermes-customer-qa.v1");
assert.equal(helperJson.ok, true);
assert.equal(helperJson.dryRun, true);
assert.equal(helperJson.safety.nonCustodial, true);
assert.equal(helperJson.safety.acceptsSecrets, false);
assert.equal(helperJson.safety.signsOrSubmits, false);
assert.equal(helperJson.safety.canSubmit, false);
assert.equal(helperJson.safety.liveSubmissionEnabled, false);

const commandText = helperJson.commands.map((item) => item.command).join("\n");
for (const phrase of [
  "pnpm smoke:customer-ready-crypto",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:unified-crypto-shared-card-contract",
  "matterhorn-work crypto readiness --json",
  "matterhorn-work crypto live-public-qa",
  "matterhorn-work crypto sdk-loop",
  "matterhorn-work crypto execution-chain --json",
  "pnpm test:market-sign-artifact-routes",
  "matterhorn-work crypto customer-packet",
]) {
  assert.ok(commandText.includes(phrase), `Hermes helper commands should include ${phrase}`);
}

const sectionTitles = helperJson.sections.map((section) => section.title);
for (const title of [
  "Setup",
  "Browser UI checklist",
  "Bittensor live public QA",
  "Hyperliquid and Polymarket read/preview QA",
  "Market sign-request and artifact validation QA",
  "Negative security prompts",
  "Screenshots and evidence expectations",
  "Issue ledger",
]) {
  assert.ok(sectionTitles.includes(title), `Hermes helper sections should include ${title}`);
}

const helperReject = spawnSync(process.execPath, ["scripts/hermes-crypto-customer-qa.mjs", "--dry-run", "--json", "--private-key", "redacted"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(helperReject.status, 0, "Hermes helper should reject credential-shaped flags");
assert.ok(helperReject.stdout.includes("Forbidden credential-shaped flag"), "Hermes helper should explain forbidden credential flags");

console.log("Hermes crypto customer QA handoff check passed.");
