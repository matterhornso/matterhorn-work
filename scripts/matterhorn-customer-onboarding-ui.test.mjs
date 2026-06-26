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
const composer = read("apps/app/src/react-app/domains/session/surface/composer/composer.tsx");
const statusBar = read("apps/app/src/react-app/domains/session/chat/status-bar.tsx");
const modelSelect = read("apps/app/src/components/model-select.tsx");
const remoteWorkspaceFields = read("apps/app/src/react-app/domains/workspace/remote-workspace-fields.tsx");
const workflowTemplates = read("apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts");
const appSidebar = read("apps/app/src/react-app/domains/session/sidebar/app-sidebar.tsx");
const sidebarUtils = read("apps/app/src/react-app/domains/session/sidebar/utils.ts");
const workflowTypes = read("packages/types/src/matterhorn-workflows.ts");
const cryptoPrompt = read("apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts");
const sessionRoute = read("apps/app/src/react-app/shell/session-route.tsx");
const walletPanel = read("apps/app/src/react-app/domains/wallet/WalletPanel.tsx");
const extensions = read("apps/app/src/app/extensions.ts");
const constants = read("apps/app/src/app/constants.ts");
const settingsRoute = read("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx");
const settingsOverview = read("apps/app/src/react-app/domains/settings/pages/overview-view.tsx");
const feedback = read("apps/app/src/app/lib/feedback.ts");
const den = read("apps/app/src/app/lib/den.ts");
const advancedSettings = read("apps/app/src/react-app/domains/settings/pages/advanced-view-sections.tsx");
const marketplaceSettings = read("apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx");
const walletSettings = read("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx");
const serverProvider = read("apps/app/src/react-app/kernel/server-provider.tsx");
const globalSdkProvider = read("apps/app/src/react-app/kernel/global-sdk-provider.tsx");

for (const phrase of [
  "Use Bittensor, Hyperliquid, Polymarket, and real-world workflows through one safe chat workspace.",
  "Ask Matterhorn about Bittensor, markets, wellness, files, or workflows...",
  "Matterhorn saves chats, artifacts, receipts, QA evidence, and workflow files.",
  "Matterhorn never holds your keys.",
  '"composer.assistant_identity": "Matterhorn"',
  '"composer.run_task": "Ask"',
  '"composer.stop": "Stop generating"',
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
  "Start a Matterhorn project.",
  "New Project",
  "New chat",
  "Open Bittensor desk",
  "Matterhorn Wallet",
  "One wallet surface for EVM tools.",
  "Bittensor uses public SS58 reads and external signing.",
  "Wallet details",
  "Matterhorn Desks",
  "Separate interfaces for Bittensor, Hyperliquid, Polymarket, and Wellness.",
  "focused desk",
  "No hidden auto-send",
  "Business workflows",
  "Wellness is a standalone service workflow desk for trainers, yoga instructors, and dieticians.",
  "It is not Web3, not markets, and not medical care.",
  "Planned services only",
  "Wellness workflow desk",
  "Service offer packet",
  "Onboarding questionnaire",
  "Weekly program plan",
  "Progress check-in",
  "Renewal/follow-up note",
  "Client handoff packet",
  "Monday beta demos",
  "Guided runs for the first 10 test customers",
  "Public/redacted only",
  "Customers:",
  "Expected:",
  "mondayBetaDemoCards",
  "source: \"monday-beta-demo\"",
  "demo.evidenceCommand",
  "demo.artifactSummary",
  "openVenueRailPane(demo.panel, { primePrompt: true, prompt: demo.prompt, source: \"monday-beta-demo\" })",
  "Open Bittensor desk",
  "Open Hyperliquid desk",
  "Open Polymarket desk",
  "Start wellness workflow",
  "Start blank chat",
  "ProtocolLogo",
  "Use the Bittensor desk in this session",
  "Use the Hyperliquid desk in this session",
  "Use the Polymarket desk in this session",
  "Keep all context Bittensor-specific",
  "Keep all context Hyperliquid-specific",
  "Keep all context Polymarket-specific",
  "Show my TAO",
  "Compare validators",
  "Preview Hyperliquid BTC-PERP context",
  "Summarize this Polymarket market",
  "Check Polymarket compliance",
  "Create a wellness program for my clients",
  "MCPs & Connectors",
  "Start with a Matterhorn workflow",
  "Wellness: standalone client programs, service offers, lifecycle packets, and safe creator workflows. Not Web3 or markets.",
  "Plan trainer, yoga, or dietician service delivery without Web3, markets, medical advice, or live payment/email/hosting claims.",
  "Can submit: No",
  "Live submission: Off",
  "Matterhorn never signs",
  "Do not ask for seed phrases",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE",
  "enrichCustomerWorkflowTemplate",
  "buildCustomerBetaDemoStarterCards",
  "Allowed workspace intents",
  "Beta-ready",
  "Preview only",
  "Workflow-ready",
  "Planned, not live",
  "starterStatusLabel",
  "Can submit: No. Live submission: Off. External signer/client only.",
  "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.",
  "Use the standalone Wellness workflow, not a Web3 or market desk.",
  "CUSTOMER_VISIBLE_TEMPLATE_IDS",
  "CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS",
]) {
  assert.ok(`${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(phrase), `starter UI should expose Matterhorn task: ${phrase}`);
}

for (const phrase of [
  '"dashboard.create_workspace_title": "Create Project"',
  '"dashboard.create_workspace_confirm": "Create Project"',
  '"workspace_list.add_workspace": "New project"',
  '"workspace_list.show_more": "Show {count} more chats"',
  '"session.untitled_chat_number": "Untitled chat {index}"',
]) {
  assert.ok(english.includes(phrase), `project/session copy should be customer-friendly: ${phrase}`);
}

assert.ok(sidebarUtils.includes("MAX_SESSIONS_PREVIEW = 3"), "sidebar should preview fewer sessions before showing more");
assert.ok(appSidebar.includes("session.untitled_chat_number"), "untitled sidebar sessions should get numbered fallback titles");

for (const phrase of [
  "Access Token",
  "Paste a collaborator or owner access token only if this Matterhorn worker requires one.",
]) {
  assert.ok(remoteWorkspaceFields.includes(phrase), `remote workspace setup should use safer Matterhorn access-token copy: ${phrase}`);
}

for (const phrase of [
  'displayLabel={t("composer.assistant_identity")}',
  "Stop generating (cancels current run)",
  "displayLabel?: string",
  "const triggerLabel = displayLabel ?? selectedModelLabel",
  "Change model (${selectedModelLabel})",
  'aria-label={tooltipLabel}',
  'aria-label={`${t("composer.assistant_identity")} ${label}`}',
  'font-medium text-dls-text">{t("composer.assistant_identity")}',
]) {
  assert.ok(
    `${composer}\n${modelSelect}\n${sessionSurface}`.includes(phrase),
    `chat chrome should show Matterhorn identity while keeping model controls technical: ${phrase}`,
  );
}

for (const phrase of [
  "MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS",
  "CustomerBetaDemoStarterCard",
  "Bittensor TAO staking preview",
  "Hyperliquid order preview",
  "Polymarket market research and preview",
  "Wellness client program packet",
  "node scripts/customer-demo-evidence-pack.mjs --scenario",
  "Demo-ready",
  "buildCustomerWorkflowPromptFromText",
]) {
  assert.ok(`${sessionPage}\n${workflowTemplates}\n${workflowTypes}`.includes(phrase), `Monday beta demo UI should use typed scenario registry: ${phrase}`);
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
  "Describe your task...",
  "Crypto workspace",
  "Send crypto",
  "Trade on Hyperliquid",
  "Bet on Polymarket",
  "Preview a Hyperliquid BTC-PERP trade",
]) {
  assert.equal(`${welcome}\n${english}\n${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(forbidden), false, `old generic onboarding copy should be removed: ${forbidden}`);
}

assert.ok(walletPanel.includes('lazy(() => import("./pages/BittensorPanel"))'), "Protocol rail should mount the venue panel");
assert.ok(walletPanel.includes("<BittensorPanel initialVenue={initialVenue} />"), "Protocol panel should render the selected workspace");
assert.equal(walletPanel.includes("EVM wallet not connected"), false, "no-wallet protocol panel should not block content with a bottom overlay");
assert.ok(sessionPage.includes("openVenueRailPane(launcher.panel, { primePrompt: true })"), "protocol launchers should open a dedicated desk and prime an editable prompt draft");
assert.ok(sessionPage.includes("openVenueRailPane(bittensorLauncher.panel, { primePrompt: true })"), "Bittensor top launcher should open the Bittensor desk and prime an editable prompt draft");
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
assert.ok(sessionPage.includes('w-[var(--nav-rail-width-compact)]'), "right rail should use a compact responsive width before wide desktop");
assert.ok(sessionPage.includes('2xl:w-[var(--nav-rail-width)]'), "right rail should expand to readable customer desk labels on wide desktop");
for (const token of [
  "deskToneStyle",
  "--matterhorn-desk-color",
  "--matterhorn-desk-rgb",
  "style={deskToneStyle(launcher.iconHint)}",
  "style={deskToneStyle(demo.iconHint)}",
  "style={deskToneStyle(item.panel)}",
  'style={deskToneStyle("wellness")}',
]) {
  assert.ok(sessionPage.includes(token), `customer desks should use semantic desk tone styling: ${token}`);
}
assert.ok(sessionPage.includes("Desks"), "right rail should group protocol and workflow entry points as Desks");
assert.ok(sessionPage.includes('label: "Hyperliquid"'), "right rail should spell out Hyperliquid instead of using a cryptic short label");
assert.ok(sessionPage.includes('label: "Polymarket"'), "right rail should spell out Polymarket instead of using a cryptic short label");
assert.ok(sessionPage.includes("primeProtocolRailPrompt"), "protocol rail clicks should prime an editable chat prompt");
assert.ok(sessionPage.includes("pendingProtocolRailPanelRef"), "protocol rail clicks should restore the selected desk after creating a prompted session");
assert.ok(sessionPage.includes("props.selectedSessionId && props.surface"), "protocol rail prompt events should only target a rendered composer surface");
assert.ok(sessionPage.includes('options?.source ?? "protocol-rail"'), "protocol rail prompt handoffs should default to the protocol-rail source");
assert.ok(sessionPage.includes('new CustomEvent("matterhorn:crypto-chat-handoff"'), "protocol rail prompts should insert into the active composer without auto-sending");
assert.ok(sessionPage.includes("openVenueRailPane(item.panel, { primePrompt: true })"), "protocol rail buttons should open the desk and prime the chat composer");
assert.ok(sessionPage.includes('card.id === "wellness_creator_workflow"'), "right rail should expose the Wellness workflow launcher");
assert.equal(sessionPage.includes('card.id === "decentralized_services_operator"'), false, "right rail should not expose future Services as a customer-facing launcher");
assert.equal(sessionPage.includes('label: "Services"'), false, "customer right rail should not render a Services button");
assert.ok(sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, item.launcher.prompt)"), "workflow rail launchers should create editable prompt drafts");
assert.ok(sessionPage.includes('title="Back to chat"'), "right rail should expose a clear way back to chat");
assert.ok(sessionSurface.includes("xl:grid-cols-3"), "starter workflow grid should avoid cramped four-column cards");
assert.ok(sessionPage.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]"), "protocol desk starter cards should use container-safe auto-fit columns");
assert.ok(sessionPage.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]"), "beta demo starter cards should use container-safe auto-fit columns");
assert.ok(sessionPage.includes('protocolSidePanelOpen ? Math.max(browserPanelDefaultWidth, 400)'), "protocol side panel should not default to an oversized rail");
assert.ok(sessionPage.includes('protocolSidePanelOpen ? "340px"'), "protocol side panel should keep a narrower minimum width");
assert.ok(sessionPage.includes('? "500px" : "70%"'), "protocol side panel should cap width so it does not consume most of the workspace");
assert.ok(statusBar.includes('className="hidden sm:inline"'), "status bar text labels should collapse on narrow workspaces");
assert.ok(statusBar.includes('className="hidden md:inline"'), "profile/settings label should collapse before it overflows the bottom bar");

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

for (const phrase of [
  "https://github.com/matterhornso/matterhorn-work/tree/dev/docs",
  "PROFILE_SETTINGS_LABEL",
  "Profile & Settings",
  "Open profile and settings from the status bar",
  "visible profile and settings button",
]) {
  assert.ok(statusBar.includes(phrase), `status bar should expose customer navigation: ${phrase}`);
}
assert.equal(statusBar.includes("openworklabs.com/docs"), false, "status bar docs should not point customers to OpenWork docs");
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
  'name: "Matterhorn Protocols"',
  'id: "bittensor"',
  'name: "Bittensor"',
  'id: "hyperliquid"',
  'name: "Hyperliquid"',
  'id: "polymarket"',
  'name: "Polymarket"',
  "read/preview-only",
  "external-signer",
  "Open Bittensor desk",
  "Open Hyperliquid desk",
  "Open Polymarket desk",
  "Matterhorn protocol chat",
  'ref: "matterhorn.bittensor.rail"',
  'ref: "matterhorn.hyperliquid.rail"',
  'ref: "matterhorn.polymarket.rail"',
]) {
  assert.ok(extensions.includes(phrase), `extensions catalog should expose Web3 connector: ${phrase}`);
}

const computerUseIndex = extensions.indexOf('id: "computer-use"');
assert.ok(computerUseIndex >= 0, "Desktop automation manifest should still exist for legacy/internal compatibility");
const computerUseTail = extensions.slice(computerUseIndex, computerUseIndex + 3200);
assert.ok(computerUseTail.includes("defaultHidden: true"), "Desktop automation should be hidden from the default customer catalog");
assert.ok(
  computerUseTail.includes('name: "Desktop Automation Helper"') &&
    !computerUseTail.includes('name: "Computer Use"') &&
    !computerUseTail.includes("OpenWork Computer Use"),
  "Hidden automation manifest should use Matterhorn desktop automation copy",
);
assert.ok(
  constants.includes("CUSTOMER_HIDDEN_EXTENSION_IDS") &&
    constants.includes('"computer-use"') &&
    constants.includes("isCustomerFacingMatterhornExtension"),
  "Desktop automation should be excluded from customer-facing extension catalogs",
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
for (const phrase of [
  "MCPs & Connectors",
  "MCPs & Tools",
  "Connected protocol tools, app connectors, and custom MCP servers.",
  "Manage MCPs",
  "Add a custom MCP",
  "Connect MCP servers, protocol tools, and agent capabilities",
  "Available MCPs & connectors",
  "Search MCPs, connectors, and skills",
  "No MCPs or connectors found",
  "add a custom MCP",
]) {
  assert.ok(`${english}\n${settingsRoute}\n${settingsOverview}`.includes(phrase), `MCP connector surface should use customer-facing MCP language: ${phrase}`);
}

for (const phrase of [
  "Matterhorn MCPs",
  "Use Matterhorn desks from Codex, Claude Code, Claude Desktop, and Cursor.",
  "Bittensor MCP",
  "Hyperliquid MCP",
  "Polymarket MCP",
  "Memory MCP",
  "Workflow MCP",
  "UI Control MCP",
  "Copy install command",
  "matterhorn-work mcp config --target codex --profile full",
  "matterhorn-work mcp config --target claude --profile full",
  "matterhorn-work mcp config --target claude-desktop --profile full",
  "matterhorn-work mcp config --target cursor --profile full",
  "Can submit: No. Live submission: Off.",
  "External signer/client required.",
  "No seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.",
  "No API secrets, private keys, raw signatures, signed payloads, or exchange custody.",
  "No hidden memory saves.",
  "No provider execution, no live payments, no email sending, no hosting publish, and no token-gated access enforcement.",
  "No wallet custody, no signing, no market submission, and no secret collection through UI-control actions.",
]) {
  assert.ok(settingsRoute.includes(phrase), `MCP desk product cards should expose safe Matterhorn MCP setup copy: ${phrase}`);
}

for (const phrase of [
  "VITE_MATTERHORN_WORK_FEEDBACK_URL",
  "VITE_MATTERHORN_WORK_APP_VERSION",
  "https://matterhorn.work/feedback",
]) {
  assert.ok(feedback.includes(phrase), `feedback URLs should be Matterhorn-first: ${phrase}`);
}
assert.equal(feedback.includes("https://openworklabs.com/feedback"), false, "feedback default must not send customers to OpenWork Labs");

for (const phrase of [
  "VITE_MATTERHORN_CLOUD_URL",
  "VITE_MATTERHORN_DEN_BASE_URL",
  "VITE_MATTERHORN_CLOUD_API_URL",
  "VITE_MATTERHORN_DEN_API_BASE_URL",
  "VITE_MATTERHORN_REQUIRE_SIGNIN",
  "https://app.matterhorn.work",
]) {
  assert.ok(den.includes(phrase), `cloud auth should expose Matterhorn-native config: ${phrase}`);
}
assert.equal(den.includes("https://app.openworklabs.com"), false, "cloud auth default must not open OpenWork Labs");

for (const phrase of [
  "Parallel Web Systems web search",
  "Matterhorn Work engine endpoint",
  "formatEngineEndpoint",
]) {
  assert.ok(`${english}\n${advancedSettings}`.includes(phrase), `advanced settings should use Matterhorn customer-safe wording: ${phrase}`);
}
assert.equal(english.includes("Enable Exa web search"), false, "English settings copy should not expose Exa as the default customer search brand");

for (const phrase of [
  "Agent Marketplace Preview",
  "Hiring, payment, and deployment are not live in this beta.",
  "Preview-only in this beta. No wallet, payment, or live deployment.",
  "Preview template",
  "Save preview",
  "Generate preview",
  "No wallet connection, payment, or on-chain deployment was attempted.",
]) {
  assert.ok(marketplaceSettings.includes(phrase), `agent marketplace should be explicit preview-only beta UI: ${phrase}`);
}
for (const forbidden of [
  "Connect wallet to hire",
  "Hire Agent",
  "Hire This Agent",
  "Deriving agent wallet",
  "is now live",
]) {
  assert.equal(marketplaceSettings.includes(forbidden), false, `agent marketplace must not imply live hiring/deployment: ${forbidden}`);
}

for (const phrase of [
  "Matterhorn Wallet",
  "EVM wallet",
  "Bittensor coldkeys/hotkeys",
  "seed phrases or private keys",
  "Public Bittensor reads, Hyperliquid previews, and Polymarket previews still work without connecting an EVM wallet.",
]) {
  assert.ok(walletSettings.includes(phrase), `wallet settings should clearly explain current wallet boundaries: ${phrase}`);
}

console.log("Matterhorn customer onboarding UI static check passed.");
