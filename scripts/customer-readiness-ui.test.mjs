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
  "Unified smoke",
  "Blocker:",
  "Next:",
  "Crypto Chat",
  "crypto-readiness-panel",
  "Do not ask for private keys, API secrets, raw signatures, signed payloads, or wallet exports.",
  "Unified crypto readiness is green for Bittensor, Hyperliquid, and Polymarket read/preview demo flows.",
  "matterhorn-work crypto readiness --json",
  "$MATTERHORN_WORK_SERVER_URL/api/crypto/readiness",
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
