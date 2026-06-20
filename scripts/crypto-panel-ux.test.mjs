#!/usr/bin/env node
// Static gate for the beta-tester protocol workspace panel UX.
// Verifies the venue desks, "Try in chat" prompts, "Safety status" card, and "Evidence / QA"
// card exist; that prompt buttons insert (not auto-send) via the handoff event;
// and that no copy claims live market submission or asks for secrets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PANEL = "apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx";
const panel = readFileSync(PANEL, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Wired into package.json.
assert.equal(
  pkg.scripts?.["test:crypto-panel-ux"],
  "node scripts/crypto-panel-ux.test.mjs",
  "package.json should expose the protocol panel UX gate",
);

// 2. Separate venue desks exist; the customer surface should not collapse into
//    a single "Crypto workspace" entry point.
for (const phrase of [
  "Bittensor workspace",
  "Hyperliquid workspace",
  "Polymarket workspace",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "VENUE_PROTOCOL_MANIFESTS",
  "Protocol manifest",
  "Allowed intents",
  "primaryPanelRouteId",
  "Use Bittensor without learning the CLI first.",
  "Preview Hyperliquid trades through chat, with execution off.",
  "Analyze prediction markets and preview safely.",
]) {
  assert.ok(panel.includes(phrase), `Panel should expose a dedicated venue desk: ${phrase}`);
}
assert.equal(panel.includes("Crypto workspace"), false, "Panel should not render a generic Crypto workspace title");

// 3. The three beta-tester sections exist.
for (const section of ["Try in chat", "Safety status", "Evidence / QA"]) {
  assert.ok(panel.includes(`title="${section}"`), `Panel should render a "${section}" section`);
}

// 4. The six "Try in chat" prompt button labels exist.
for (const label of [
  "show my TAO",
  "find Bittensor subnets for image generation",
  "compare validators on subnet 14",
  "prepare staking 1 TAO",
  "show Hyperliquid BTC orderbook",
  "summarize a Polymarket market",
]) {
  assert.ok(panel.includes(label), `Panel should include Try-in-chat prompt: ${label}`);
}

// 5. Buttons insert into the composer (do not auto-send): they use the handoff
//    helper, and the copy makes the no-auto-send behavior explicit.
assert.ok(panel.includes("askAgentBetaTryPrompt"), "Try-in-chat buttons should call the beta prompt handler");
assert.ok(panel.includes('source: "crypto-beta-try"'), "Beta prompts should route through the crypto handoff source");
assert.ok(panel.includes("matterhorn:crypto-chat-handoff") || panel.includes('mode: item.mode'), "Beta prompts should use the insert handoff event");
assert.ok(panel.includes("Nothing sends automatically"), "Panel should tell testers prompts are not auto-sent");
assert.ok(panel.includes("Right-rail command groups stay single-column"), "Protocol rail command groups should avoid cramped multi-column controls");

// 6. Safety status: the three venue lines + the custody/no-live-trade statement.
for (const phrase of [
  "Most complete beta flow",
  "External signer required for actions",
  "Preview only, live submission off.",
  "Preview only, compliance checks required.",
  "Matterhorn does not custody keys, sign silently, or submit live market trades.",
  "Public reads work without connecting an EVM wallet.",
  "Local Matterhorn API unavailable for /api/crypto/readiness",
  "This blocks live customer evidence collection until the local server/auth token is healthy",
  "Local API check",
  "You can still copy the evidence commands below for a terminal check.",
]) {
  assert.ok(panel.includes(phrase), `Panel safety copy should include: ${phrase}`);
}

// 7. Evidence / QA card names the three artifacts and their commands.
for (const phrase of [
  "Customer readiness smoke",
  "pnpm smoke:customer-ready-crypto",
  "Bittensor beta packet",
  "pnpm beta:bittensor:packet",
  "Market SDK validation evidence",
  "matterhorn-work crypto sdk-validate-public --mode fixture",
]) {
  assert.ok(panel.includes(phrase), `Panel evidence card should include: ${phrase}`);
}

// 8. Market desk copy must show the preview-only treatment.
for (const phrase of [
  "Preview Only",
  "Can submit",
  "Live submission",
  "External signer/client required",
]) {
  assert.ok(panel.includes(phrase), `Panel should include market preview-only copy: ${phrase}`);
}

// 9. No copy claims live market submission.
for (const forbidden of [
  "Live submission: On",
  "Can submit: Yes",
  "live submission is on",
  "submit live order",
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
]) {
  assert.equal(panel.includes(forbidden), false, `Panel must not claim live submission: ${forbidden}`);
}

// 10. No copy asks for secrets.
for (const forbidden of [
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "enter your private key",
  "paste your seed phrase",
  "provide your api secret",
]) {
  assert.equal(panel.includes(forbidden), false, `Panel must not ask for secrets: ${forbidden}`);
}

console.log("Protocol panel UX static check passed.");
