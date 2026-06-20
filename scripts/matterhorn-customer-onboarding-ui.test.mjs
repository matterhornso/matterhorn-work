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
const constants = read("apps/app/src/app/constants.ts");
const settingsRoute = read("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx");
const serverProvider = read("apps/app/src/react-app/kernel/server-provider.tsx");
const globalSdkProvider = read("apps/app/src/react-app/kernel/global-sdk-provider.tsx");

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
  "Test customer launch hub",
  "Start with a desk, then chat.",
  "Protocol desks",
  "Separate interfaces for TAO, perps, and prediction markets",
  "No hidden auto-send",
  "Business workflows",
  "Use the same chat engine for real-world customer work",
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
  "Wellness: client programs, service offers, lifecycle packets, and safe creator workflows",
  "Services: planned hosting, storage, email, payments, and identity workflows",
  "Can submit: No",
  "Live submission: Off",
  "Matterhorn never signs",
  "Do not ask for seed phrases",
  "planned-not-live future contracts",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE",
  "enrichCustomerWorkflowTemplate",
  "Allowed workspace intents",
  "Beta-ready",
  "Preview only",
  "Workflow-ready",
  "Planned, not live",
  "Can submit: No. Live submission: Off. External signer/client only.",
  "Educational workflow. No medical advice or live payments/email/hosting.",
  "Future-contract planning only. No provider execution or credentials.",
]) {
  assert.ok(`${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(phrase), `starter UI should expose Matterhorn task: ${phrase}`);
}

for (const phrase of [
  "protocolWorkflowLaunchers",
  "businessWorkflowLaunchers",
  "blankWorkflowLauncher",
  'card.panel === "bittensor"',
  'card.panel === "hyperliquid"',
  'card.panel === "polymarket"',
]) {
  assert.ok(sessionPage.includes(phrase), `session launch hub should group customer entry points: ${phrase}`);
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
assert.ok(sessionPage.includes("{launcher.statusLabel}"), "protocol launchers should show manifest-backed status labels");
assert.ok(sessionPage.includes("{launcher.safetySummary}"), "protocol launchers should show manifest-backed safety summaries");
assert.ok(sessionPage.includes("{task.statusLabel}"), "starter task cards should show manifest-backed status labels");
assert.ok(sessionPage.includes("{task.safetySummary}"), "starter task cards should show manifest-backed safety summaries");
assert.ok(workflowTemplates.includes('opensPanel: "bittensor"'), "right rail should expose a dedicated Bittensor workspace");
assert.ok(workflowTemplates.includes('opensPanel: "hyperliquid"'), "right rail should expose a dedicated Hyperliquid workspace");
assert.ok(workflowTemplates.includes('opensPanel: "polymarket"'), "right rail should expose a dedicated Polymarket workspace");
assert.ok(workflowTemplates.includes('primaryPanelRouteId: manifest.primaryPanelRouteId'), "app launcher metadata should preserve manifest route ids");
assert.ok(workflowTemplates.includes('launchBehavior: manifest.launchBehavior'), "app launcher metadata should preserve manifest launch behavior");
assert.ok(workflowTemplates.includes('canSubmit: false'), "app launcher metadata should keep market submit disabled");
assert.ok(workflowTemplates.includes('liveExecutionEnabled: false'), "app launcher metadata should keep live execution disabled");
assert.ok(sessionPage.includes("Bittensor: TAO, subnets, validators, and staking previews"), "Bittensor rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes("Hyperliquid: account, orderbook, watches, and external-signer previews"), "Hyperliquid rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes("Polymarket: markets, outcomes, compliance, and external-signer previews"), "Polymarket rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes('card.id === "wellness_creator_workflow"'), "right rail should expose the Wellness workflow launcher");
assert.ok(sessionPage.includes('card.id === "decentralized_services_operator"'), "right rail should expose future Services workflow launcher");
assert.ok(sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, item.launcher.prompt)"), "workflow rail launchers should create editable prompt drafts");

for (const phrase of [
  "matterhorn-work.server.token",
  "openwork.server.token",
  "VITE_MATTERHORN_WORK_TOKEN",
  "VITE_OPENWORK_TOKEN",
  "Authorization: `Bearer ${token}`",
]) {
  assert.ok(
    `${serverProvider}\n${globalSdkProvider}`.includes(phrase),
    `server SDK providers should use Matterhorn token aliases for authenticated health/API calls: ${phrase}`,
  );
}

assert.ok(cryptoPrompt.includes("matterhorn_crypto_chat"), "crypto prompt should route to unified crypto chat first");
assert.ok(cryptoPrompt.includes("Public-read and preview flows do\n * not require an EVM wallet connection."), "crypto prompt should document no-wallet public reads");
assert.equal(cryptoPrompt.includes("hl_submitOrder"), false, "prompt should not advertise old Hyperliquid submit tool");
assert.equal(cryptoPrompt.includes("wallet_signTypedData"), false, "prompt should not push direct signing as default");
assert.equal(sessionRoute.includes("wallet.snapshot.isConnected && shouldInjectCryptoPrompt"), false, "crypto prompt injection must not require connected EVM wallet");
assert.ok(sessionRoute.includes("shouldInjectCryptoPrompt(text)"), "crypto prompt injection should still be keyword-gated");
for (const phrase of [
  "buildMatterhornOrientationSystemPrompt",
  "shouldInjectMatterhornOrientationPrompt(text)",
  "matterhornOrientationPrompt",
  "[envSystemContext, walletContext, matterhornOrientationPrompt, cryptoPrompt]",
]) {
  assert.ok(sessionRoute.includes(phrase), `broad starter prompts should receive Matterhorn orientation context: ${phrase}`);
}
for (const phrase of [
  "MATTERHORN_ORIENTATION_PATTERNS",
  "\\bwhat can i do\\b",
  "## Matterhorn Work Orientation",
  "Answer as Matterhorn Work, not as a generic code assistant.",
  "If the workspace is empty, do not lead with internal runtime files such as opencode.json or .opencode/.",
  "Bittensor: explain subnets",
  "Hyperliquid: read markets/orderbooks/account exposure",
  "Polymarket: search/summarize markets",
  "Wellness workflows",
  "Can submit: No. Live submission: Off.",
]) {
  assert.ok(cryptoPrompt.includes(phrase), `orientation prompt should keep starter answers Matterhorn-native: ${phrase}`);
}

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
assert.ok(
  constants.includes("CUSTOMER_HIDDEN_EXTENSION_IDS") &&
    constants.includes('"computer-use"') &&
    constants.includes("isCustomerFacingMatterhornExtension"),
  "Computer Use should be excluded from customer-facing extension catalogs",
);
assert.ok(
  constants.includes("OPENWORK_EXTENSION_CATALOG = MCP_QUICK_CONNECT.filter") &&
    constants.includes("isCustomerFacingMatterhornExtension(entry)"),
  "Composer extension catalog should only expose customer-facing extensions",
);
assert.ok(
  settingsRoute.includes("customerQuickConnectList") &&
    settingsRoute.includes("isCustomerFacingMatterhornExtension(entry)"),
  "Settings extension grid should filter customer-hidden entries before rendering",
);

console.log("Matterhorn customer onboarding UI static check passed.");
