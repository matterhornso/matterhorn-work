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
const workflowTemplates = read("apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts");
const cryptoPrompt = read("apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts");
const sessionRoute = read("apps/app/src/react-app/shell/session-route.tsx");
const walletPanel = read("apps/app/src/react-app/domains/wallet/WalletPanel.tsx");
const extensions = read("apps/app/src/app/extensions.ts");

for (const phrase of [
  "Use Bittensor, Hyperliquid, Polymarket, and real-world workflows through one safe chat workspace.",
  "Separate workspaces",
  "one Matterhorn chat.",
  "Bittensor workspace",
  "Hyperliquid desk",
  "Polymarket desk",
  "Wellness builder",
  "Stay non-custodial",
  "/matterhorn-logo-square.svg",
  'alt="Matterhorn Work"',
  "var(--matterhorn-blue)",
]) {
  assert.ok(`${welcome}\n${english}`.includes(phrase), `welcome experience should include Matterhorn-native copy: ${phrase}`);
}

for (const phrase of [
  "New blank chat",
  "Open Bittensor workspace",
  "Choose a workspace, then ask in plain English.",
  "Open Bittensor panel",
  "Open Hyperliquid panel",
  "Open Polymarket panel",
  "Start wellness workflow",
  "Plan future services",
  "Start blank chat",
  "Use Bittensor",
  "Show my TAO",
  "Compare validators",
  "Preview a Hyperliquid BTC-PERP trade",
  "Summarize this Polymarket market",
  "Create a wellness program for my clients",
  "Plan a decentralized storage upload",
  "Connect Web3 tools",
  "Start with a Matterhorn workflow",
  "Can submit: No",
  "Live submission: Off",
  "Matterhorn never signs",
  "Do not ask for seed phrases",
  "planned-not-live future contracts",
]) {
  assert.ok(`${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(phrase), `starter UI should expose Matterhorn task: ${phrase}`);
}

for (const forbidden of [
  "Edit a CSV",
  "Automate a browser task",
  "Search Craigslist",
  "Search craigslist",
  "Create a sample spreadsheet",
  "Control your browser",
  "Your computer, but it works for you.",
  "Crypto workspace",
  "Send crypto",
]) {
  assert.equal(`${welcome}\n${english}\n${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(forbidden), false, `old generic onboarding copy should be removed: ${forbidden}`);
}

assert.ok(walletPanel.includes('lazy(() => import("./pages/BittensorPanel"))'), "Protocol rail should mount the venue panel");
assert.ok(walletPanel.includes("<BittensorPanel initialVenue={initialVenue} />"), "Protocol panel should render the selected workspace");
assert.ok(walletPanel.includes("Protocol desks still support Bittensor public reads, subnet discovery, Hyperliquid previews, Polymarket previews"), "no-wallet protocol panel should explain public read flows");
assert.ok(sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, launcher.prompt)"), "protocol launchers should create an editable prompt draft");
assert.ok(sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, bittensorLauncher.prompt)"), "Bittensor top launcher should create an editable prompt draft");
assert.ok(workflowTemplates.includes('opensPanel: "bittensor"'), "right rail should expose a dedicated Bittensor workspace");
assert.ok(workflowTemplates.includes('opensPanel: "hyperliquid"'), "right rail should expose a dedicated Hyperliquid workspace");
assert.ok(workflowTemplates.includes('opensPanel: "polymarket"'), "right rail should expose a dedicated Polymarket workspace");
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
