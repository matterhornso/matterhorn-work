#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");
const surface = read("apps/app/src/react-app/domains/session/surface/session-surface.tsx");
const sharedCardRenderer = read("apps/app/src/react-app/domains/session/surface/message-list.tsx");
const rootPackage = JSON.parse(read("package.json"));

assert.equal(
  rootPackage.scripts?.["test:customer-readiness-ui"],
  "node scripts/customer-readiness-ui.test.mjs",
  "package.json should expose the customer readiness UI gate",
);

for (const phrase of [
  "Demo",
  "Readiness",
  "Try prompts",
  "Evidence",
  "Safety",
  "/api/crypto/readiness",
  "/api/crypto/market-execution-readiness",
  "/api/crypto/market-execution-chain",
  "Unified smoke",
  "Blocker:",
  "Next:",
  "Crypto Chat",
  "crypto-readiness-panel",
  "market-execution-readiness-panel",
  "Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.",
  "Unified crypto readiness is green for Bittensor, Hyperliquid, and Polymarket read/preview demo flows.",
  "matterhorn-work crypto readiness --json",
  "matterhorn-work crypto execution-readiness --json",
  "matterhorn-work crypto execution-chain --json",
  "$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness",
  "$MATTERHORN_WORK_SERVER_URL/api/crypto/market-execution-readiness",
  "$MATTERHORN_WORK_SERVER_URL/api/crypto/market-execution-chain",
  "Authorization: Bearer $MATTERHORN_WORK_TOKEN",
  "pnpm smoke:customer-ready-crypto",
  "matterhorn-work crypto live-public-qa --output-dir /tmp/matterhorn-live-public-qa --fixture --strict --json",
  "Live public QA",
  "matterhorn-work crypto customer-packet",
  "matterhorn-work crypto evidence-verify",
  "Bittensor discovery",
  "TAO wallet",
  "Hyperliquid read",
  "Polymarket compliance",
  "Signer preview",
  "Can Matterhorn submit Hyperliquid and Polymarket orders yet?",
  "Preview Only",
  "Can submit: No",
  "Live submission: Off",
  "Execution readiness",
  "Ready for live submission",
  "Hyperliquid submit",
  "Polymarket submit",
  "Execution CLI",
  "Execution API",
  "This is a readiness contract, not execution permission.",
  "live submit routes until a separate security review",
  "Execution chain",
  "Testnet-only path: preview",
  "external sign request",
  "redacted artifact validation",
  "public receipt import",
  "hash-bound",
  "Preview / handoff",
  "External sign request",
  "Validate artifact",
  "Receipt import",
  "Chain CLI",
  "Chain API",
  "matterhorn-work hyperliquid sign-request BTC",
  "matterhorn-work polymarket sign-request <testnet-market-id>",
  "testnet_external_signer",
  "matterhorn-work hyperliquid validate-artifact",
  "matterhorn-work polymarket validate-artifact",
  "matterhorn-work hyperliquid receipt",
  "matterhorn-work polymarket receipt",
  "Safe execution chain",
  "Confirm that Matterhorn rejects raw signatures, signed payloads, API secrets, private keys, hash mismatches, and any live submission request.",
  "reject raw signatures, signed payloads, secrets, and hash mismatches.",
  "Matterhorn prepares safe previews; your wallet/client decides whether anything is signed externally.",
  "External signer required",
  "Read/preview-only",
  "No market submit",
  "Use unified crypto chat.",
  "no seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live Hyperliquid/Polymarket submission",
]) {
  assert.ok(panel.includes(phrase), `Bittensor panel should include customer demo checklist text: ${phrase}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
]) {
  assert.equal(panel.includes(forbidden), false, `customer UI must not include forbidden execution/secret surface ${forbidden}`);
}

assert.ok(panel.includes("matterhorn:crypto-chat-handoff"), "demo prompts should use the generic crypto chat handoff event");
assert.ok(surface.includes("matterhorn:crypto-chat-handoff"), "session surface should listen for the generic crypto handoff event");
assert.ok(surface.includes("Crypto prompt ready"), "session notice should distinguish generic crypto prompts from Bittensor-only prompts");
assert.ok(surface.includes("crypto.chat_handoff.applied"), "generic crypto handoffs should have their own inspector event");
assert.ok(sharedCardRenderer.includes("matterhorn.crypto.shared-card.v1"), "transcript should render versioned shared crypto cards");

console.log("Customer readiness UI static check passed.");
