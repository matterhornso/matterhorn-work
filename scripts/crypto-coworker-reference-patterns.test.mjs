#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const grokBot = readFileSync("docs/crypto-coworkers/grokbot-reference-audit.md", "utf8");
const monid = readFileSync("docs/crypto-coworkers/monid-reference-audit.md", "utf8");
const plan = readFileSync("docs/crypto-coworkers/phases-1-5-plan.md", "utf8");
const readme = readFileSync("docs/crypto-coworkers/README.md", "utf8");
const prompt = readFileSync("apps/server/src/crypto-coworker-master-prompt.ts", "utf8");
const architecture = readFileSync(
  "docs/architecture/matterhorn-guarded-agent-architecture-v3.md",
  "utf8",
);
const supersededArchitecture = readFileSync(
  "docs/architecture/matterhorn-desk-agent-architecture-v2.md",
  "utf8",
);

for (const source of [
  "https://docs.x.ai/grok-bot/overview",
  "https://docs.x.ai/grok-bot/get-started",
  "https://docs.x.ai/grok-bot/files-and-results",
  "https://docs.x.ai/grok-bot/skills-routines-and-automations",
  "https://docs.x.ai/grok-bot/approvals-security-and-privacy",
]) {
  assert.ok(grokBot.includes(source), `Grok Bot audit must cite ${source}`);
}

for (const required of [
  "One named teammate",
  "Start in chat",
  "Reviewable results",
  "Practice before routine",
  "explicit, revisioned resource grant",
  "connected-wallet-only final step",
  "verified private-provider option",
  "can never sign, submit, relay, broadcast, or hold wallet keys",
]) {
  assert.ok(grokBot.includes(required), `Grok Bot audit must preserve ${required}`);
}

for (const required of [
  "One-line onboarding",
  "Discover → inspect → use",
  "Transparent metering",
  "Never expose a generic agent-facing `run` route",
]) {
  assert.ok(monid.includes(required), `Monid audit must preserve ${required}`);
}

assert.ok(plan.includes("[Grok Bot reference audit](./grokbot-reference-audit.md)"));
assert.ok(plan.includes("[Monid reference audit](./monid-reference-audit.md)"));
assert.ok(readme.includes("[`grokbot-reference-audit.md`](./grokbot-reference-audit.md)"));
assert.ok(readme.includes("[`monid-reference-audit.md`](./monid-reference-audit.md)"));
assert.ok(prompt.includes("matterhorn.coworker-master-prompt.v5"));
assert.ok(
  prompt.includes("Findings, Meaning, Review needed, Next step"),
);
assert.ok(prompt.includes("current direct request supplies transaction intent"));
assert.ok(prompt.includes("not instructions, consent, or financial intent"));
assert.ok(prompt.includes("Use the fewest app calls"));
assert.ok(prompt.includes("financial success without exact receipt evidence"));
assert.ok(prompt.includes("Say prepared vs submitted precisely"));
assert.equal(/general cloud computer|cross-coworker session sharing/.test(prompt), false);

for (const required of [
  "Matterhorn treats every model as an untrusted planner",
  "The UI is not the security boundary",
  "walletSubmissionOnly: true",
  "agentMaySubmit: false",
  "connected-wallet-only signing and submission",
  "matterhorn.reviewed-action-handoff.v2",
  "matterhorn.agent-run-receipt.v1",
  "OpenWork `v0.18.42`, OpenCode `v1.18.27`",
  "Agent Files are the user-controlled data sandbox",
  "Walrus stores only generic AES-GCM ciphertext envelopes",
  "live Phase 1–5 gate stays `NO-GO`",
]) {
  assert.ok(architecture.includes(required), `Guarded architecture must preserve ${required}`);
}

for (const staleClaim of [
  "Hyperliquid is the only launch capability with an in-product submission path",
  "Bittensor: **Prepare only**",
  "Polymarket: **Prepare only**",
]) {
  assert.equal(
    architecture.includes(staleClaim),
    false,
    `Guarded architecture must not restore stale claim: ${staleClaim}`,
  );
}
assert.ok(
  supersededArchitecture.includes("Matterhorn Guarded Agent Architecture v3"),
  "The superseded v2 guide must direct readers to the current guarded architecture",
);

console.log("Crypto coworker reference-pattern contract passed.");
