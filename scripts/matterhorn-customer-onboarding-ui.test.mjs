#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts?.["test:matterhorn-customer-onboarding-ui"],
  "node scripts/matterhorn-customer-onboarding-ui.test.mjs",
  "package.json should expose the Matterhorn customer onboarding UI gate",
);

const welcome = read("apps/app/src/react-app/domains/onboarding/welcome-page.tsx");
const english = read("apps/app/src/i18n/locales/en.ts");
const sessionPage = read("apps/app/src/react-app/domains/session/chat/session-page.tsx");
const sessionSurface = read("apps/app/src/react-app/domains/session/surface/session-surface.tsx");
const cryptoPrompt = read("apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts");
const sessionRoute = read("apps/app/src/react-app/shell/session-route.tsx");
const walletPanel = read("apps/app/src/react-app/domains/wallet/WalletPanel.tsx");
const extensions = read("apps/app/src/app/extensions.ts");

for (const phrase of [
  "Do anything with Web3 and real-world workflows through chat.",
  "One chat for Web3",
  "Use Bittensor",
  "Preview markets",
  "Build workflows",
  "Stay non-custodial",
  "/matterhorn-logo-square.svg",
  'alt="Matterhorn Work"',
  "var(--matterhorn-blue)",
]) {
  assert.ok(`${welcome}\n${english}`.includes(phrase), `welcome experience should include Matterhorn-native copy: ${phrase}`);
}

for (const phrase of [
  "Create blank session",
  "Open Bittensor workspace",
  "Use Bittensor",
  "Show my TAO",
  "Compare validators",
  "Preview Hyperliquid",
  "Analyze Polymarket",
  "Create wellness workflow",
  "Build any workflow",
  "Connect Web3 tools",
  "Start with a Matterhorn workflow",
  "Hyperliquid preview",
  "Polymarket read",
  "Wellness workflow",
  "Customer evidence",
]) {
  assert.ok(`${sessionPage}\n${sessionSurface}`.includes(phrase), `starter UI should expose Matterhorn task: ${phrase}`);
}

for (const forbidden of [
  "Edit a CSV",
  "Automate a browser task",
  "Search Craigslist",
  "Search craigslist",
  "Create a sample spreadsheet",
  "Control your browser",
  "Your computer, but it works for you.",
]) {
  assert.equal(`${welcome}\n${english}\n${sessionPage}\n${sessionSurface}`.includes(forbidden), false, `old generic onboarding copy should be removed: ${forbidden}`);
}

assert.ok(walletPanel.includes('lazy(() => import("./pages/BittensorPanel"))'), "Crypto rail should mount the Bittensor/Crypto panel");
assert.ok(walletPanel.includes("<BittensorPanel initialVenue={initialVenue} />"), "Wallet/Crypto panel should render the selected protocol workspace");
assert.ok(walletPanel.includes("Bittensor public reads, subnet discovery, Hyperliquid/Polymarket read previews"), "no-wallet crypto panel should explain public read flows");
assert.ok(sessionPage.includes('panel: "bittensor"'), "right rail should expose a dedicated Bittensor workspace");
assert.ok(sessionPage.includes('panel: "hyperliquid"'), "right rail should expose a dedicated Hyperliquid workspace");
assert.ok(sessionPage.includes('panel: "polymarket"'), "right rail should expose a dedicated Polymarket workspace");
assert.ok(sessionPage.includes("Bittensor: TAO, subnets, validators, and staking previews"), "Bittensor rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes("Hyperliquid: account, orderbook, watches, and external-signer previews"), "Hyperliquid rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes("Polymarket: markets, outcomes, compliance, and external-signer previews"), "Polymarket rail tooltip should explain protocol-specific work");

assert.ok(cryptoPrompt.includes("matterhorn_crypto_chat"), "crypto prompt should route to unified crypto chat first");
assert.ok(cryptoPrompt.includes("Public-read and preview flows do\n * not require an EVM wallet connection."), "crypto prompt should document no-wallet public reads");
assert.equal(cryptoPrompt.includes("hl_submitOrder"), false, "prompt should not advertise old Hyperliquid submit tool");
assert.equal(cryptoPrompt.includes("wallet_signTypedData"), false, "prompt should not push direct signing as default");
assert.equal(sessionRoute.includes("wallet.snapshot.isConnected && shouldInjectCryptoPrompt"), false, "crypto prompt injection must not require connected EVM wallet");
assert.ok(sessionRoute.includes("shouldInjectCryptoPrompt(text)"), "crypto prompt injection should still be keyword-gated");

for (const phrase of [
  'id: "matterhorn-crypto"',
  'name: "Matterhorn Crypto"',
  'id: "bittensor"',
  'name: "Bittensor"',
  'id: "hyperliquid"',
  'name: "Hyperliquid"',
  'id: "polymarket"',
  'name: "Polymarket"',
  "read/preview-only",
  "external-signer",
  "Open Bittensor workspace",
  "Open Hyperliquid workspace",
  "Open Polymarket workspace",
  'ref: "matterhorn.bittensor.rail"',
  'ref: "matterhorn.hyperliquid.rail"',
  'ref: "matterhorn.polymarket.rail"',
]) {
  assert.ok(extensions.includes(phrase), `extensions catalog should expose Web3 connector: ${phrase}`);
}

const computerUseIndex = extensions.indexOf('id: "computer-use"');
assert.ok(computerUseIndex >= 0, "Computer Use manifest should still exist for legacy/internal compatibility");
const computerUseTail = extensions.slice(computerUseIndex, computerUseIndex + 3200);
assert.ok(computerUseTail.includes("defaultHidden: true"), "Computer Use should be hidden from the default customer catalog");

console.log("Matterhorn customer onboarding UI static check passed.");
