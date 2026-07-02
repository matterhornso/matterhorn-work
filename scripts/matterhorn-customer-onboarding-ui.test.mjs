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
const appCss = read("apps/app/src/app/index.css");
const sessionPage = read("apps/app/src/react-app/domains/session/chat/session-page.tsx");
const sessionSurface = read("apps/app/src/react-app/domains/session/surface/session-surface.tsx");
const composer = read("apps/app/src/react-app/domains/session/surface/composer/composer.tsx");
const statusBar = read("apps/app/src/react-app/domains/session/chat/status-bar.tsx");
const modelSelect = read("apps/app/src/components/model-select.tsx");
const remoteWorkspaceFields = read("apps/app/src/react-app/domains/workspace/remote-workspace-fields.tsx");
const workflowTemplates = read("apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts");
const protocolDeskUi = read("apps/app/src/react-app/domains/session/workflows/protocol-desk-ui.ts");
const appSidebar = read("apps/app/src/react-app/domains/session/sidebar/app-sidebar.tsx");
const sidebarUtils = read("apps/app/src/react-app/domains/session/sidebar/utils.ts");
const appRoot = read("apps/app/src/react-app/shell/app-root.tsx");
const uiStateStore = read("apps/app/src/react-app/shell/ui-state-store.ts");
const loadingOverlay = read("apps/app/src/react-app/shell/loading-overlay.tsx");
const workflowTypes = read("packages/types/src/matterhorn-workflows.ts");
const cryptoPrompt = read("apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts");
const sessionRoute = read("apps/app/src/react-app/shell/session-route.tsx");
const commandPalette = read("apps/app/src/react-app/shell/command-palette.tsx");
const walletPanel = read("apps/app/src/react-app/domains/wallet/WalletPanel.tsx");
const extensions = read("apps/app/src/app/extensions.ts");
const constants = read("apps/app/src/app/constants.ts");
const settingsRoute = read("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx");
const extensionsView = read("apps/app/src/react-app/domains/settings/pages/extensions-view.tsx");
const settingsShell = read("apps/app/src/react-app/domains/settings/shell/settings-shell.tsx");
const extensionCard = read("apps/app/src/react-app/design-system/extension-card.tsx");
const extensionDetailModal = read("apps/app/src/react-app/design-system/extension-detail-modal.tsx");
const settingsSurfaceRoute = read("apps/app/src/react-app/shell/settings-route.tsx");
const settingsOverview = read("apps/app/src/react-app/domains/settings/pages/overview-view.tsx");
const cloudAccountSettings = read("apps/app/src/react-app/domains/settings/pages/cloud-account-view.tsx");
const feedback = read("apps/app/src/app/lib/feedback.ts");
const den = read("apps/app/src/app/lib/den.ts");
const denSigninSurface = read("apps/app/src/react-app/domains/cloud/den-signin-surface.tsx");
const forcedSigninPage = read("apps/app/src/react-app/domains/cloud/forced-signin-page.tsx");

const denHelpLink = read("apps/app/src/react-app/domains/workspace/matterhorn-den-help-link.tsx");
const remoteWorkspaceDiagnostics = read("apps/app/src/react-app/domains/workspace/remote-workspace-diagnostics.ts");
const advancedSettings = read("apps/app/src/react-app/domains/settings/pages/advanced-view-sections.tsx");
const marketplaceSettings = read("apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx");
const walletSettings = read("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx");
const serverProvider = read("apps/app/src/react-app/kernel/server-provider.tsx");
const globalSdkProvider = read("apps/app/src/react-app/kernel/global-sdk-provider.tsx");
const betaGoLiveChecklist = read("docs/handoffs/beta-go-live-first-10-user-checklist.md");

for (const phrase of [
  "Use Bittensor, Hyperliquid, Polymarket, and real-world workflows through one safe chat workspace.",
  "Ask Matterhorn about Bittensor, markets, longevity, files, or workflows...",
  "Matterhorn saves chats, artifacts, receipts, QA evidence, and workflow files.",
  "Matterhorn never holds your keys.",
  '"composer.assistant_identity": "Matterhorn"',
  '"composer.run_task": "Ask"',
  '"composer.stop": "Stop generating"',
  "A workspace for AI-assisted work that needs judgment, context, and",
  "Matterhorn turns chat into an operating layer for projects, protocols,",
  "The aim is not just faster answers. It is safer progress:",
  "How it helps people",
  "Understand complex domains without becoming an expert first.",
  "Keep risky work review-first, with safety boundaries visible before action.",
  "Turn useful conversations into saved project context, files, and receipts.",
  "/matterhorn-logo-square.svg",
  'alt="Matterhorn Work"',
  "var(--matterhorn-blue)",
]) {
  assert.ok(`${welcome}\n${english}`.includes(phrase), `welcome experience should include Matterhorn-native copy: ${phrase}`);
}
assert.equal(
  `${welcome}\n${english}\n${statusBar}`.includes("Engine connected"),
  false,
  "customer UI should not show a generic hard-coded engine-connected label",
);
assert.ok(
  loadingOverlay.includes("pointer-events-none opacity-0") &&
    loadingOverlay.includes("pointer-events-auto opacity-100"),
  "boot overlay should not block clicks while fading out",
);
for (const phrase of [
  "Matterhorn Cloud is not live in this local build yet.",
  "Continue locally, or enter a Matterhorn Cloud control-plane URL",
  "Continue locally without Cloud",
]) {
  assert.ok(
    `${denSigninSurface}\n${forcedSigninPage}`.includes(phrase),
    `local Cloud auth should explain the unavailable Cloud state: ${phrase}`,
  );
}
for (const phrase of [
  "Use beta Cloud and sign in",
  "Create account on beta Cloud",
  "Use beta Cloud URL",
  "onUseBetaCloud",
  "onUseBetaCloudAndOpenAuth",
  "BETA_CLOUD_BASE_URL",
  "https://app.openworklabs.com",
]) {
  assert.equal(
    `${denSigninSurface}\n${forcedSigninPage}`.includes(phrase),
    false,
    `local Cloud auth should not point users to stale beta/OpenWork Cloud paths: ${phrase}`,
  );
}
assert.ok(
  appRoot.includes("isExplicitCloudSignin") &&
    appRoot.includes("get(\"intent\") === \"cloud-auth\"") &&
    appRoot.includes("if (explicitCloudSignin) return"),
  "explicit Cloud account routes should not be redirected into first-run workspace routing",
);
assert.equal(
  denSigninSurface.includes("Cloud URL required"),
  false,
  "local beta auth should not lead with a disabled dead-domain button",
);
assert.equal(
  denSigninSurface.includes("Your computer,"),
  false,
  "sign-in image should explain Matterhorn Work instead of generic computer automation",
);

for (const phrase of [
  "Start a Matterhorn project.",
  "New Project",
  "New chat",
  "Open Bittensor desk",
  "Open a desk",
  "Dedicated desk agents",
  "Review before action",
  "Outputs stay with the project",
  "Wallet details",
  "Public SS58 reads and unsigned previews only.",
  "Can submit: No. Live submission: Off. External trade handoff only.",
  "Blocked regions get no executable bet fields.",
  "Standalone workflow. No medical advice, diagnosis, prescription, live payments, email, hosting, or token gating.",
  "focused desk",
  "No auto-send",
  "matterhorn-capability-overview",
  "matterhorn-capability-card",
  "grid gap-2 sm:grid-cols-2",
  "Open desk",
  "Stage agent task",
  "Business workflows",
  "Longevity is a standalone service workflow desk for trainers, yoga instructors, and dieticians.",
  "It is not Web3, not markets, and not medical care.",
  "Planned services only",
  "Longevity workflow desk",
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
  "openVenueRailPane(demo.panel, { primePrompt: true, prompt: demo.prompt, source: \"monday-beta-demo\", title: demo.title })",
  "Open Bittensor desk",
  "Open Hyperliquid desk",
  "Open Polymarket desk",
  "Start longevity workflow",
  "Start blank chat",
  "ProtocolLogo",
  "Bittensor task:",
  "Hyperliquid task:",
  "Polymarket task:",
  "Dedicated agent",
  "hand the task to",
  "agentId:",
  "agentName:",
  "deriveMatterhornDeskMode",
  "MatterhornDeskSessionStrip",
  "starterWorkflowCapabilityItems",
  "`${manifest.displayName} session`",
  "Longevity workflow session",
  "Public SS58/coldkey/hotkey context only. External signer required for actions.",
  "Matterhorn never stores API secrets or signs orders.",
  "Blocked regions get no executable bet fields.",
  "Standalone workflow. No medical advice, diagnosis, prescription, live payments, email, hosting, or token gating.",
  "External-signer previews",
  "External trade handoff",
  "Trade handoff",
  "Non-medical workflow",
  "Stage agent task",
  "Show my TAO",
  "Compare validators",
  "Prepare Hyperliquid BTC-PERP handoff",
  "Summarize this Polymarket market",
  "Check Polymarket compliance",
  "Build the full 7-stage Longevity workflow for my clients",
  "MCPs & Connectors",
  "Start with a Matterhorn workflow",
  "Longevity: standalone service workflows, program packets, progress check-ins, and client handoffs",
  "Intake, goals, training, nutrition education, schedule, handouts, and service packaging.",
  "Can submit: No",
  "Live submission: Off",
  "Matterhorn never signs",
  "Do not ask for seed phrases",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE",
  "PROTOCOL_DESK_MANIFEST_REGISTRY",
  "PROTOCOL_BRAND_ASSET_REGISTRY",
  "CUSTOMER_LAUNCHER_DESK_VISUALS",
  "CustomerProtocolDeskVisual",
  "enrichCustomerWorkflowTemplate",
  "buildCustomerBetaDemoStarterCards",
  "Choose a task, then review it with the agent",
  "Allowed workspace intents",
  "Beta-ready",
  "Preview only",
  "Workflow-ready",
  "Planned, not live",
  "starterStatusLabel",
  "Can submit: No. Live submission: Off. External trade handoff only.",
  "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.",
  "Use the standalone Longevity workflow, not a Web3 or market desk.",
  "CUSTOMER_VISIBLE_TEMPLATE_IDS",
  "CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS",
]) {
  assert.ok(
    `${sessionPage}\n${sessionSurface}\n${workflowTemplates}\n${protocolDeskUi}`.includes(phrase),
    `starter UI should expose Matterhorn task: ${phrase}`,
  );
}

assert.ok(!sessionSurface.includes("Connect MCPs"), "Home starter should not show a Connect MCPs CTA");
assert.equal(
  /<WalletIcon className="size-4" \/>[\s\S]{0,320}Open Bittensor desk/.test(sessionPage),
  false,
  "Home hero should not duplicate the Bittensor desk shortcut; Bittensor belongs in the desk launcher",
);

for (const phrase of [
  '"dashboard.create_workspace_title": "Create Project"',
  '"dashboard.create_workspace_confirm": "Create Project"',
  '"workspace_list.add_workspace": "New project"',
  '"workspace_list.rename_session": "Rename chat"',
  '"workspace_list.show_more": "Show {count} more chats"',
  '"session.untitled_chat_number": "Untitled chat {index}"',
  '"session.rename_title": "Rename chat"',
  '"session.rename_label": "Chat name"',
]) {
  assert.ok(english.includes(phrase), `project/session copy should be customer-friendly: ${phrase}`);
}

assert.ok(sidebarUtils.includes("MAX_SESSIONS_PREVIEW = 3"), "sidebar should preview fewer sessions before showing more");
assert.ok(appSidebar.includes("session.untitled_chat_number"), "untitled sidebar sessions should get numbered fallback titles");
assert.ok(
  sessionPage.includes("PencilLine") &&
    sessionPage.includes("openRenameModal(props.selectedSessionId!)") &&
    sessionPage.includes('aria-label={t("session.rename_title")}'),
  "active chat title should expose a header rename action, not hide naming in the sidebar only",
);
assert.ok(
  sessionPage.includes("onCreateTaskWithPrompt?: (workspaceId: string, prompt: string, options?: { title?: string; agent?: string }) => void") &&
    sessionPage.includes('agent: agentIdForDesk(panel)') &&
    sessionPage.includes('agent: wellnessRailLauncher.agentId ?? agentIdForDesk("wellness"),') &&
    sessionRoute.includes("const title = options?.title?.trim()") &&
    sessionRoute.includes("const agent = options?.agent?.trim()") &&
    sessionRoute.includes("setSelectedAgent(agent || null)") &&
    sessionRoute.includes("workspaceClient.session.update({") &&
    sessionRoute.includes("[displaySession as any, ...(current[workspaceId] ?? [])]"),
  "launcher-created chats should start with human launcher titles and the matching desk agent",
);
assert.ok(
  commandPalette.includes('title: "Go home"') &&
    commandPalette.includes('title: "New project"') &&
    commandPalette.includes('title: "New chat"') &&
    commandPalette.includes('title: "Open project folder"') &&
    commandPalette.includes('title: "Open outputs"') &&
    commandPalette.includes('title: "Copy project path"') &&
    commandPalette.includes('title: "Copy outputs path"') &&
    sessionRoute.includes("const selectedWorkspaceOutputsPath = selectedWorkspaceRoot ? joinWorkspacePath(selectedWorkspaceRoot, \"outputs\") : \"\"") &&
    sessionRoute.includes("onGoHome={() => {") &&
    sessionRoute.includes("onCreateNewProject={() => {") &&
    sessionRoute.includes("onOpenProjectFolder={() => void revealWorkspacePath(selectedWorkspaceRoot, \"Project folder\")") &&
    sessionRoute.includes("onOpenOutputs={() => void revealWorkspacePath(selectedWorkspaceOutputsPath, \"Outputs folder\")"),
  "command palette should expose home, project, chat, folder, and outputs actions from any project surface",
);
assert.ok(
  sessionPage.includes("const homeOutputsPath = homeProjectPath ? joinWorkspaceChildPath(homeProjectPath, \"outputs\") : \"outputs/\"") &&
    sessionPage.includes("{homeProjectName}") &&
    sessionPage.includes("Copy path") &&
    sessionPage.includes("Open folder") &&
    sessionPage.includes("Copy outputs") &&
    sessionPage.includes("props.sidebar.onRevealWorkspace(props.selectedWorkspaceId)"),
  "project Home should show the active project folder and outputs location with copy/open actions",
);

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
  "protocolDeskIdForComposerExtension",
  "ProtocolBrandLogo",
  "bittensor",
  "hyperliquid",
  "polymarket",
]) {
  assert.ok(
    `${composer}\n${modelSelect}\n${sessionSurface}`.includes(phrase),
    `chat chrome should show Matterhorn identity while keeping model controls technical: ${phrase}`,
  );
}

assert.ok(
  composer.includes("protocolDeskIdForComposerExtension(entry)") &&
    composer.includes("if (entry.protocolDeskId) return entry.protocolDeskId as CustomerProtocolDeskId;") &&
    composer.includes("return <ProtocolBrandLogo id={protocolDeskId} size={size} />;"),
  "composer extension picker should prefer catalog protocol identities before falling back to generic icons",
);
assert.ok(
  constants.includes("protocolDeskId?: MatterhornProtocolDeskId") &&
    constants.includes("protocolDeskIdForExtensionId(manifest.id)") &&
    constants.includes('case "bittensor":') &&
    constants.includes('case "hyperliquid":') &&
    constants.includes('case "polymarket":'),
  "built-in Matterhorn extension catalog entries should expose protocol desk ids for logo rendering",
);
assert.ok(
  extensionCard.includes("iconNode?: ReactNode") &&
    extensionCard.includes(") : iconNode ? (") &&
    extensionDetailModal.includes("iconNode?: ReactNode") &&
    extensionDetailModal.includes("{iconNode ? ("),
  "shared extension card and detail modal should accept app-owned protocol logo nodes before URL/icon fallback",
);
assert.ok(
  settingsRoute.includes("function protocolDeskLogoNode(entry: McpDirectoryInfo") &&
    settingsRoute.includes("iconNode={protocolDeskLogoNode(entry)}") &&
    settingsRoute.includes("iconNode={protocolDeskLogoNode(detailEntry, 28)}"),
  "MCP settings marketplace cards and detail modal should render protocol desk logos for Matterhorn built-ins",
);
assert.ok(
  composer.includes("extensionIcon(entry, 14)") &&
    !composer.includes("<Plug size={14} className=\"mt-0.5 shrink-0 text-gray-9\" />"),
  "active MCP rows should pass the full entry instead of hardcoding generic plug icons",
);

for (const phrase of [
  "MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS",
  "CustomerBetaDemoStarterCard",
  "Bittensor TAO staking preview",
  "Hyperliquid trade handoff",
  "Polymarket market research and preview",
  "Longevity client program packet",
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
  "Prepare a Hyperliquid BTC-PERP trade handoff",
]) {
  assert.equal(`${welcome}\n${english}\n${sessionPage}\n${sessionSurface}\n${workflowTemplates}`.includes(forbidden), false, `old generic onboarding copy should be removed: ${forbidden}`);
}

assert.ok(walletPanel.includes('lazy(() => import("./pages/BittensorPanel"))'), "Protocol rail should mount the venue panel");
assert.ok(walletPanel.includes("<BittensorPanel initialVenue={initialVenue} />"), "Protocol panel should render the selected workspace");
assert.equal(walletPanel.includes("EVM wallet not connected"), false, "no-wallet protocol panel should not block content with a bottom overlay");
assert.ok(sessionPage.includes("GLOBAL_HOME_SIDE_PANEL_KEY"), "home should keep right-rail panels usable before a session exists");
assert.ok(sessionPage.includes("ProtocolDeskEmptyState"), "protocol launchers should open a focused desk start state before staging an agent task");
assert.ok(sessionPage.includes("PROTOCOL_DESK_SUGGESTED_PROMPTS"), "focused desk start states should offer protocol-specific suggested prompts");
assert.ok(sessionPage.includes("openVenueRailPane(id);"), "protocol launchers should open a dedicated desk without auto-priming a mixed generic task");
assert.equal(sessionPage.includes("bittensorLauncher"), false, "home hero should not keep a duplicate Bittensor-only shortcut above the desk launcher");
assert.ok(sessionPage.includes("{item.statusLabel}"), "protocol launchers should show manifest-backed status labels");
assert.ok(sessionPage.includes("{item.proof}"), "protocol launchers should show manifest-backed safety summaries");
assert.ok(sessionPage.includes("{task.statusLabel}"), "starter task cards should show manifest-backed status labels");
assert.ok(sessionPage.includes("{task.safetySummary}"), "starter task cards should show manifest-backed safety summaries");
assert.ok(workflowTemplates.includes('opensPanel: "bittensor"'), "right rail should expose a dedicated Bittensor workspace");
assert.ok(workflowTemplates.includes('opensPanel: "hyperliquid"'), "right rail should expose a dedicated Hyperliquid workspace");
assert.ok(workflowTemplates.includes('opensPanel: "polymarket"'), "right rail should expose a dedicated Polymarket workspace");
assert.ok(workflowTemplates.includes('primaryPanelRouteId: manifest.primaryPanelRouteId'), "app launcher metadata should preserve manifest route ids");
assert.ok(workflowTemplates.includes('launchBehavior: manifest.launchBehavior'), "app launcher metadata should preserve manifest launch behavior");
assert.ok(workflowTemplates.includes('canSubmit: false'), "app launcher metadata should keep market submit disabled");
assert.ok(workflowTemplates.includes('liveExecutionEnabled: false'), "app launcher metadata should keep live execution disabled");
assert.ok(protocolDeskUi.includes("Bittensor: TAO wallet reads, subnets, validators, watches, receipts, and unsigned staking previews"), "Bittensor rail tooltip should explain protocol-specific work");
assert.ok(protocolDeskUi.includes("Hyperliquid: orderbooks, exposure, funding, watches, and external trade handoffs"), "Hyperliquid rail tooltip should explain protocol-specific work");
assert.ok(protocolDeskUi.includes("Polymarket: markets, outcomes, liquidity, compliance, watches, and trade handoffs"), "Polymarket rail tooltip should explain protocol-specific work");
assert.ok(sessionPage.includes('w-[var(--nav-rail-width-compact)]'), "right rail should use a compact responsive width before wide desktop");
assert.ok(sessionPage.includes('2xl:w-[var(--nav-rail-width)]'), "right rail should expand to readable customer desk labels on wide desktop");
assert.ok(appCss.includes("--nav-rail-width-compact: 88px;"), "compact right rail should be wide enough for readable desk labels");
assert.ok(appCss.includes("--nav-rail-width: 120px;"), "wide right rail should leave room for readable customer desk labels");
assert.ok(sessionPage.includes('RAIL_LABEL_CLASS = "max-w-full truncate text-[11px] font-medium leading-4 text-current"'), "right rail labels should use readable 11px medium text");
assert.ok(sessionPage.includes("RAIL_SECTION_LABEL_CLASS"), "right rail section label should not duplicate faint tracked text styles");
assert.equal(sessionPage.includes("text-[9px] leading-none"), false, "right rail labels should not regress to tiny blurred 9px text");
for (const token of [
  "deskToneStyle",
  "--matterhorn-desk-color",
  "--matterhorn-desk-rgb",
  "style={deskToneStyle(item.id)}",
  "style={deskToneStyle(demo.iconHint)}",
  "style={deskToneStyle(item.panel)}",
  'style={deskToneStyle("wellness")}',
]) {
  assert.ok(sessionPage.includes(token), `customer desks should use semantic desk tone styling: ${token}`);
}
assert.ok(sessionPage.includes("Desks"), "right rail should group protocol and workflow entry points as Desks");
assert.ok(sessionPage.includes("getCustomerProtocolDeskVisual(panel)"), "right rail should read desk labels from the shared visual manifest");
assert.ok(sessionPage.includes("visual?.displayName ?? panel"), "right rail should spell out protocol desk names from the manifest");
assert.ok(sessionPage.includes('getCustomerProtocolDeskVisual("wellness")?.displayName'), "Wellness rail label should come from the shared visual manifest");
assert.ok(sessionPage.includes("primeProtocolRailPrompt"), "protocol rail prompt helper should remain available for explicit demo handoffs");
assert.ok(sessionPage.includes("pendingProtocolRailPanelRef"), "protocol rail clicks should restore the selected desk after creating a prompted session");
assert.ok(sessionPage.includes("props.selectedSessionId && props.surface"), "protocol rail prompt events should only target a rendered composer surface");
assert.ok(sessionPage.includes('options?.source ?? "protocol-rail"'), "protocol rail prompt handoffs should default to the protocol-rail source");
assert.ok(sessionPage.includes('new CustomEvent("matterhorn:crypto-chat-handoff"'), "protocol rail prompts should insert into the active composer without auto-sending");
assert.ok(sessionPage.includes("onClick={() => openVenueRailPane(item.panel)}"), "protocol rail buttons should open a focused desk without priming a mixed chat composer");
assert.ok(sessionPage.includes('card.id === "wellness_creator_workflow"'), "right rail should expose the Wellness workflow launcher");
assert.equal(sessionPage.includes('card.id === "decentralized_services_operator"'), false, "right rail should not expose future Services as a customer-facing launcher");
assert.equal(sessionPage.includes('label: "Services"'), false, "customer right rail should not render a Services button");
assert.ok(
  sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, item.launcher.prompt, {") &&
    sessionPage.includes("title: item.launcher.title,") &&
    sessionPage.includes('agent: item.launcher.agentId ?? agentIdForDesk("wellness"),'),
  "workflow rail launchers should create editable prompt drafts with human chat titles and the Longevity Agent",
);
assert.ok(sessionPage.includes('title="Back to chat"'), "right rail should expose a clear way back to chat");
assert.ok(sessionSurface.includes("overflow-y-auto px-4 py-5"), "empty session launcher should scroll instead of clipping beneath the composer");
assert.ok(sessionPage.includes("absolute inset-0 flex items-start justify-center overflow-y-auto"), "home starter launcher should be viewport-constrained and scroll inside the main pane");
assert.equal(sessionPage.includes("relative flex min-h-0 flex-1 items-start justify-center overflow-y-auto"), false, "home starter launcher must not size to full content height inside an overflow-hidden parent");
assert.ok(sessionSurface.includes("MatterhornDeskFocusedEmptyState"), "empty desk sessions should render a focused desk prompt state");
assert.ok(sessionSurface.includes("MATTERHORN_DESK_EMPTY_PROMPTS"), "focused desk prompt state should use desk-specific suggestions");
assert.ok(sessionSurface.includes("Show TAO balance"), "Bittensor focused empty state should suggest TAO balance reads");
assert.ok(sessionPage.includes("matterhorn-focused-desk-hero overflow-hidden rounded-xl"), "focused desk start should render a compact protocol-logo hero instead of a plain block");
assert.ok(sessionPage.includes("matterhorn-focused-desk-boundary flex max-w-full flex-wrap"), "focused desk safety copy should use compact metadata labels without overflowing");
assert.ok(sessionPage.includes("matterhorn-focused-desk-prompt-list overflow-hidden rounded-xl"), "focused desk prompts should render as a compact command list");
assert.ok(
  sessionSurface.includes("Open with agent") && sessionSurface.includes("Nothing sends until you press Ask"),
  "focused desk prompt rows should clarify that agent tasks are staged, not auto-sent",
);
assert.equal(sessionPage.includes("rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.09)] px-4 py-3 text-sm leading-6 text-dls-text"), false, "focused desk safety boundary should not use the old boxed callout");
assert.ok(sessionSurface.includes("matterhorn-desk-session-hero overflow-hidden rounded-xl"), "desk-specific empty sessions should use the same compact logo-led hero treatment");
assert.ok(sessionSurface.includes("matterhorn-desk-session-prompts overflow-hidden rounded-xl"), "desk-specific empty sessions should use soft prompt lists instead of boxed cards");
assert.equal(sessionPage.includes("rounded-[28px]"), false, "focused desk surfaces should avoid oversized card radii");
assert.equal(sessionSurface.includes("rounded-[28px]"), false, "session empty surfaces should avoid oversized card radii");
assert.ok(sessionSurface.includes("activeDeskMode ? ("), "generic starter grid should be bypassed when a protocol desk session is active");
assert.ok(sessionSurface.includes("ArrowDown"), "Jump to latest should use a visible down-arrow icon");
assert.ok(sessionSurface.includes("bottom-4 left-1/2 z-40"), "Jump to latest should sit visibly above the composer edge");
assert.ok(sessionSurface.includes("border border-dls-border bg-dls-surface px-1.5 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.28)]"), "Jump controls should use a visible bordered surface");
assert.ok(sessionSurface.includes("border border-dls-text bg-dls-text"), "Jump to latest should be the high-contrast primary action");
assert.ok(sessionSurface.includes('aria-label="Jump to the latest message"'), "Jump to latest should expose a clear accessible label");
assert.equal(sessionSurface.includes("rounded-full px-3 py-1.5 text-xs text-dls-text"), false, "Jump to latest should not regress to the hidden low-contrast pill");
assert.ok(sessionSurface.includes("matterhorn-session-start-list grid grid-cols-1 gap-1.5 lg:grid-cols-2"), "starter workflow grid should use compact two-column command rows instead of a crowded card wall");
assert.ok(sessionPage.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]"), "beta demo starter cards should use container-safe auto-fit columns");
assert.ok(sessionSurface.includes("group grid min-h-[64px] min-w-0 grid-cols-[32px_minmax(0,1fr)]"), "starter workflow rows should use tighter logo-led command rows");
assert.ok(sessionSurface.includes("renderedMessages.length > 0 && hasTranscriptJumpTarget"), "empty workflow launchers should not show transcript jump controls over the content");
assert.equal(sessionSurface.includes("size-28"), false, "starter workflow cards should not render oversized ghost icons behind the content");
assert.equal(sessionSurface.includes("rounded-[28px]"), false, "starter workflow grid should not render a large framed outer box");
assert.equal(sessionSurface.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]"), false, "starter workflow grid should not use the old crowded auto-fit card wall");
assert.equal(sessionSurface.includes("rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.07)]"), false, "starter workflow rows should not use the old boxed card treatment");
assert.ok(sessionPage.includes("matterhorn-capability-card group grid min-w-0 gap-3"), "home capability status should render clickable destination cards");
assert.ok(sessionPage.includes("onOpenCapability?.(item.id)"), "home capability status cards should open their matching desk or workflow");
assert.ok(sessionPage.includes("item.id === \"wellness\" ? \"Start workflow\" : \"Open desk\""), "home capability cards should label protocol desks separately from wellness workflows");
assert.equal(sessionPage.includes("matterhorn-desk-command-list"), false, "home should not render a second duplicate desk launcher list");
assert.equal(sessionPage.includes("rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.13)]"), false, "home capability status should not use icon tiles");
assert.equal(sessionPage.includes("rounded-md bg-[rgba(var(--matterhorn-desk-rgb),0.13)] px-1.5 py-0.5"), false, "home capability status should not use status pills");
assert.equal(sessionPage.includes("matterhorn-desk-launcher group flex min-h-[96px] w-full overflow-hidden rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.08)]"), false, "home desk launchers should not use the old boxed tile treatment");
assert.equal(sessionPage.includes("grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"), false, "home desk launchers should not fall back to the old box grid");

for (const phrase of [
  "Matterhorn Work Beta Go-Live Checklist For First 10 Users",
  "Bittensor Desk",
  "Hyperliquid Desk",
  "Polymarket Desk",
  "Longevity Desk",
  "MCPs, Memory, Profile, Wallet, And Settings",
  "Security Negative Tests",
  "Stop Criteria",
  "Developer-only names such as lighthouse, harness, OpenWork, OpenCode, Computer Use, and Services must not appear",
  "Settings cards must show honest readiness states",
]) {
  assert.ok(betaGoLiveChecklist.includes(phrase), `beta go-live checklist should cover: ${phrase}`);
}
assert.equal(sessionSurface.includes("bg-[linear-gradient(135deg,rgba(var(--matterhorn-desk-rgb)"), false, "starter workflow cards should avoid decorative gradient card backgrounds");
assert.equal(sessionPage.includes("shadow-[0_18px_46px_-38px_rgba(0,0,0,0.82)]"), false, "home desk launchers should avoid dramatic card shadows");
assert.ok(sessionPage.includes("props.developerMode ? ("), "customer home should keep beta/demo QA launchers behind developer mode");
assert.ok(composer.includes("{extensionIcon(entry, 14)}"), "MCP tool menu rows should pass the full entry so protocol logo detection can use ids and icon assets");
assert.ok(
  sessionPage.includes('visibleSidePanel === "extensions" && (props.settingsSlotForPath || props.settingsSlot)'),
  "MCP/settings rail should render through the compact path-aware settings slot",
);
assert.ok(
  settingsSurfaceRoute.includes("compact={props.embedded}"),
  "embedded settings should tell the MCP view to use compact right-rail layout",
);
assert.ok(
  sessionPage.includes('className="flex h-full min-h-0 flex-col overflow-hidden bg-background"'),
  "MCP/settings rail should avoid nested scrolling and let the compact settings surface own overflow",
);
assert.equal(
  sessionPage.includes('activeSidePanel === "extensions" && props.settingsSlot ? (\n                    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">'),
  false,
  "MCP/settings rail should not wrap the compact settings surface in a second scroll container",
);
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
  "walletStatusLabel",
  "Wallet not connected",
  "Open Matterhorn Wallet",
  "Bittensor uses public SS58 reads and external signing; market desks prepare external handoffs only.",
]) {
  assert.ok(statusBar.includes(phrase), `status bar should expose customer navigation: ${phrase}`);
}
assert.ok(sessionPage.includes("onOpenWallet={() => setCurrentSidePanel(\"wallet\")}"), "status bar wallet button should open the real wallet panel");
for (const phrase of [
  '"profile"',
  '"wallet"',
]) {
  assert.ok(uiStateStore.includes(phrase), `right rail side-panel state should persist ${phrase}`);
}
for (const phrase of [
  "settingsSlotForPath?:",
  'activeSidePanel === "profile"',
  "profileRailActive",
  'onClick={() => setCurrentSidePanel("profile")}',
  'aria-pressed={profileRailActive}',
  "Profile and account",
  'renderCompactSettingsRail("cloud-account")',
  'activeSidePanel === "wallet"',
  'renderCompactSettingsRail("wallet")',
  'renderCompactSettingsRail("extensions")',
  '<WalletPanel',
]) {
  assert.ok(sessionPage.includes(phrase), `right rail should expose real profile/wallet panels: ${phrase}`);
}
assert.ok(sessionRoute.includes("const renderEmbeddedSettingsSurface"), "session route should expose reusable embedded settings panels to the right rail");
assert.ok(sessionRoute.includes('settingsSlot={renderEmbeddedSettingsSurface("extensions")}'), "MCP rail should keep using embedded extensions settings");
assert.ok(sessionRoute.includes("settingsSlotForPath={renderEmbeddedSettingsSurface}"), "Profile and Wallet rail buttons should open compact settings pages");
assert.ok(sessionRoute.includes("hideWorkspaceSwitcher"), "embedded Profile/Wallet/MCP settings panels should hide duplicate workspace switching");
assert.ok(settingsSurfaceRoute.includes("hideWorkspaceSwitcher?: boolean"), "settings surface should accept an embedded workspace-switcher suppression flag");
assert.ok(settingsSurfaceRoute.includes("hideWorkspaceSwitcher={props.hideWorkspaceSwitcher}"), "settings surface should pass workspace-switcher suppression into the shell");
assert.ok(read("apps/app/src/react-app/domains/settings/shell/settings-page.tsx").includes("!props.hideWorkspaceSwitcher"), "settings sidebar should keep workspace switching only when not explicitly hidden");
assert.ok(settingsShell.includes("const ActiveIcon = getSettingsTabIcon(props.activeTab);"), "compact settings rail should show the active page title directly instead of a duplicate workspace selector");
assert.ok(settingsShell.includes('title={props.compact ? "Switch settings section" : undefined}'), "compact settings rail should keep section switching as a small utility control");
assert.ok(settingsShell.includes('aria-label={props.compact ? "Switch settings section" : undefined}'), "compact settings section switcher should remain accessible when icon-only");
assert.ok(settingsShell.includes('props.compact ? "sr-only" : "truncate"'), "compact settings switcher should not duplicate the visible active page label");
assert.equal(settingsShell.includes('className="min-w-0 max-w-46 justify-start gap-2"'), false, "compact settings rail should not use the old large dropdown trigger as the primary header");
assert.ok(extensionsView.includes("compact?: boolean"), "extensions settings should support embedded compact right-rail rendering");
assert.ok(extensionsView.includes('props.compact ? "space-y-4 max-w-none" : "space-y-6 max-w-3xl"'), "embedded extensions settings should remove full-page max-width spacing");
assert.ok(extensionsView.includes('props.compact ? "grid w-full min-w-0 grid-cols-2 gap-1" : "inline-flex w-fit"'), "embedded extensions tabs should use equal compact columns instead of crowding content");
assert.ok(extensionsView.includes("h-auto min-w-0 whitespace-normal"), "embedded extensions tabs should stay tappable without forcing long labels outside the rail");
assert.ok(extensionsView.includes("h-auto min-w-0 flex-col items-center gap-0.5 whitespace-normal"), "embedded Marketplace tab should stack its status label in compact rail layout");
assert.ok(extensionsView.includes('<span className="min-w-0 max-w-full truncate">Marketplace</span>'), "embedded Marketplace label should be constrained inside its compact tab");
assert.ok(settingsSurfaceRoute.includes("compact={props.embedded}"), "embedded settings should tell extensions and MCP views to use compact right-rail layout");
assert.ok(settingsSurfaceRoute.includes("<CloudAccountView\n            compact={props.embedded}"), "embedded Profile rail should render the compact account surface");
assert.ok(settingsSurfaceRoute.includes("<WalletSettingsView\n            compact={props.embedded}"), "embedded Wallet rail should render the compact wallet surface");
for (const phrase of [
  "matterhorn-profile-rail max-w-none gap-4",
  "Profile readiness",
  "Local workspace",
  "Matterhorn Cloud",
  "Matterhorn-owned",
  "getProfileReadiness",
  "profileReadiness.stateCopy.body",
  "ProfileReadinessSupportSection",
  "readiness.supportLinks",
  "Send feedback",
  "Report issue",
  "Account settings",
  "<DenSignedOutPanel\n            compact",
  "session.summaryTone",
]) {
  assert.ok(cloudAccountSettings.includes(phrase), `profile rail should have a compact first-class account state: ${phrase}`);
}
for (const phrase of [
  "matterhorn-wallet-rail max-w-none gap-4",
  "Protocol support",
  "EVM wallet",
  "getWalletRuntimeCapability",
  "WalletRuntimeExplainer",
  "WalletBoundaryList",
  "capability.safetyCopy",
  "External signer",
  "Preview only",
  "No EVM wallet connector detected",
  "Install or enable MetaMask, Rabby, or another injected wallet. Public reads and market previews still work.",
  "public SS58/coldkey data",
  "Hyperliquid",
  "Polymarket",
  "safetyCopy.forbiddenSecretsLine",
  "Never paste",
]) {
  assert.ok(walletSettings.includes(phrase), `wallet rail should have compact, honest wallet state: ${phrase}`);
}
assert.equal(sessionPage.includes("ProfileRailPanel"), false, "Profile rail should use the real Account settings page, not a custom mini-panel");
assert.equal(sessionPage.includes('activeSidePanel === "wallet" || isVenueSidePanel(activeSidePanel)'), false, "Wallet rail should not be merged with protocol action panels");
assert.ok(sessionPage.includes("isVenueSidePanel(visibleSidePanel) ? ("), "protocol desks should still render the action/wallet panel");
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
  "Longevity workflows",
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
  "external handoffs",
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
  "Install Matterhorn MCPs for Codex, Claude Code, Claude Desktop, and Cursor.",
  "Use them for protocol reads, previews, memory, workflow, evidence, and agent control.",
  "Cards show command, clients, tools, and safety limits.",
  "@container/matterhorn-mcps",
  "matterhorn-mcp-stream",
  "Client",
  'aria-label="MCP install client"',
  'role="tablist"',
  'role="tab"',
  "aria-selected={selected}",
  'role="tabpanel"',
  "Selected client",
  "Setup and verify",
  "Copy command",
  "matterhorn-mcp-client-tab-",
  "matterhorn-mcp-client-panel-",
  "Protocol MCP",
  "grid-cols-[34px_minmax(0,1fr)]",
  "grid-cols-[44px_minmax(0,1fr)]",
  "border-l border-dls-border/30 pl-3",
  "Safety",
  "Full docs",
  "Open GitHub docs",
  "MATTERHORN_MCP_DOCS_GITHUB_BASE",
  "mcpDocs(",
  "Use this MCP for",
  "How it works",
  "Safety boundary",
  "Example prompts",
  "plus {hiddenToolCount} more.",
  "Bittensor MCP",
  'protocolDeskId: "bittensor"',
  "Hyperliquid MCP",
  'protocolDeskId: "hyperliquid"',
  "Polymarket MCP",
  'protocolDeskId: "polymarket"',
  "ProtocolBrandLogo",
  "Memory MCP",
  "Workflow MCP",
  "UI Control MCP",
  "matterhorn-work mcp config --target codex --profile full",
  "matterhorn-work mcp config --target claude --profile full",
  "matterhorn-work mcp config --target claude-desktop --profile full",
  "matterhorn-work mcp config --target cursor --profile full",
  "Public reads and unsigned previews only.",
  "External handoff only. No live submit.",
  "Use your own signer/client.",
  "Never paste seeds, keys, mnemonics, signatures, signed payloads, or wallet exports.",
  "Never paste API secrets, keys, signatures, signed payloads, or custody credentials.",
  "No hidden saves.",
  "No provider execution, payments, email sending, publishing, or token gates.",
  "No custody, signing, market submit, or secret collection.",
]) {
  assert.ok(settingsRoute.includes(phrase), `MCP desk product cards should expose safe Matterhorn MCP setup copy: ${phrase}`);
}
assert.equal(
  settingsRoute.includes("aria-pressed={selected}"),
  false,
  "MCP client selector should use accessible tabs instead of pressed pill toggles.",
);
assert.equal(
  settingsRoute.includes("lg:grid-cols-2"),
  false,
  "MCP product cards should use container width, not viewport width, so the right rail remains single-column.",
);
assert.equal(
  settingsRoute.includes("@5xl/matterhorn-mcps:grid-cols-2"),
  false,
  "MCP product cards should use a divider stream instead of the old two-column boxed grid.",
);
assert.equal(
  settingsRoute.includes("min-w-0 overflow-hidden rounded-lg bg-dls-surface/80 p-3 ring-1 ring-dls-border/35"),
  false,
  "Compact MCP cards should not reintroduce the old right-rail boxed-card treatment.",
);
assert.equal(
  settingsRoute.includes("max-h-14 max-w-full overflow-auto"),
  false,
  "MCP install commands should not be trapped inside tiny nested scroll boxes.",
);
assert.ok(
  settingsRoute.includes('props.compact ? "space-y-5" : "space-y-6 max-w-3xl"'),
  "MCP view should remove full-page max-width spacing when it is embedded in the right rail.",
);
assert.ok(
  settingsRoute.includes('props.compact ? "space-y-4" : "space-y-5"'),
  "MCP product cards should use tight stream spacing instead of bulky card gaps.",
);
assert.ok(
  settingsRoute.includes("mcp-marketplace-stream"),
  "MCP marketplace connectors should render as a soft stream below the Matterhorn MCP cards.",
);
assert.ok(
  settingsRoute.includes('presentation="stream"'),
  "MCP marketplace entries should use the non-boxy stream presentation.",
);
assert.equal(
  settingsRoute.includes("grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3"),
  false,
  "MCP marketplace connectors should not render as the old repeated card grid.",
);
assert.equal(
  settingsRoute.includes("col-span-full rounded-xl border border-dashed"),
  false,
  "MCP marketplace empty state should avoid the old dashed boxed-card treatment.",
);
assert.ok(
  extensionCard.includes('presentation?: "card" | "stream"') &&
    extensionCard.includes('presentation = "card"') &&
    extensionCard.includes("sm:grid-cols-[minmax(0,1fr)_auto]"),
  "ExtensionCard should keep the legacy card default while exposing a responsive stream presentation.",
);
assert.ok(
  settingsRoute.includes("compact={props.compact}"),
  "MCP product cards should inherit the compact right-rail rendering mode.",
);
assert.equal(
  settingsRoute.includes("shadow-[0_18px_42px_-34px_rgba(0,0,0,0.7)]"),
  false,
  "MCP product cards should not use dramatic card shadows in the right rail.",
);
assert.equal(
  settingsRoute.includes("rounded-2xl bg-dls-surface/72"),
  false,
  "MCP product cards should avoid oversized boxy card radii.",
);
assert.equal(
  settingsRoute.includes("border-blue-6/30"),
  false,
  "MCP custom app card should not use the old blue outlined callout treatment.",
);
assert.equal(
  settingsRoute.includes("bg-[linear-gradient(180deg,rgba(59,130,246"),
  false,
  "MCP custom app card should not use decorative blue gradient backgrounds.",
);
assert.ok(
  settingsRoute.includes('McpCustomAppCard compact={props.compact}'),
  "MCP custom app card should inherit the compact right-rail rendering mode.",
);
assert.ok(
  settingsRoute.includes('props.compact\n        ? "rounded-[20px] bg-dls-surface-muted/22 p-3"'),
  "MCP custom app card should use a compact, soft rail treatment.",
);
assert.ok(
  settingsRoute.includes("break-words font-mono"),
  "MCP install command rows should wrap long commands instead of overflowing.",
);
assert.ok(
  settingsRoute.includes("<span className=\"font-medium text-dls-text\">Tools:</span>"),
  "MCP tools should render as compact readable summaries instead of overlapping chip piles.",
);
assert.equal(
  settingsRoute.includes("max-w-full truncate rounded-md"),
  false,
  "MCP tool chips should not truncate or collide in compact rail cards.",
);

for (const phrase of [
  "statusHint",
  "Built-in beta",
  "Built-in preview",
  "Needs API key",
  "Requires setup",
  "Catalog only",
  "View setup",
  "hasRunnableConnectorTarget",
  "actionLabelForEntry",
]) {
  assert.ok(`${settingsRoute}\n${read("apps/app/src/react-app/design-system/extension-card.tsx")}`.includes(phrase), `MCP connector cards should expose honest availability labels: ${phrase}`);
}

for (const phrase of [
  'id: "bittensor"',
  'icon: { src: "/assets/desks/bittensor/logo-dark.svg" }',
  'id: "hyperliquid"',
  'icon: { src: "/assets/desks/hyperliquid/logo-dark.svg" }',
  'id: "polymarket"',
  'icon: { src: "/assets/desks/polymarket/logo-dark.svg" }',
]) {
  assert.ok(extensions.includes(phrase), `Built-in protocol extension should use protocol logo assets: ${phrase}`);
}

for (const phrase of [
  "VITE_MATTERHORN_WORK_FEEDBACK_URL",
  "VITE_MATTERHORN_WORK_APP_VERSION",
  "https://matterhorn.work/feedback",
]) {
  assert.ok(feedback.includes(phrase), `feedback URLs should be Matterhorn-first: ${phrase}`);
}
assert.equal(feedback.includes("https://openworklabs.com/feedback"), false, "feedback default must not send customers to OpenWork Labs");
assert.ok(denHelpLink.includes("support@matterhorn.work"), "remote worker help dialog should use Matterhorn support email");
assert.ok(remoteWorkspaceDiagnostics.includes("support@matterhorn.work"), "remote workspace diagnostics should use Matterhorn support email");
assert.equal(denHelpLink.includes("team@openworklabs.com"), false, "remote worker help dialog must not send customers to OpenWork Labs");
assert.equal(remoteWorkspaceDiagnostics.includes("team@openworklabs.com"), false, "remote diagnostics must not send customers to OpenWork Labs");

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
assert.ok(constants.includes("https://app.matterhorn.work/mcp"), "Matterhorn Cloud MCP quick-connect fallback should be Matterhorn-owned");
assert.equal(constants.includes("https://app.openworklabs.com/mcp"), false, "Matterhorn Cloud MCP fallback must not open OpenWork Labs");

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
  "Bittensor actions stay external-signer only.",
  "WalletBoundaryList",
  "safetyCopy.forbiddenSecretsLine",
  "Public Bittensor reads and market previews still work.",
]) {
  assert.ok(walletSettings.includes(phrase), `wallet settings should clearly explain current wallet boundaries: ${phrase}`);
}

console.log("Matterhorn customer onboarding UI static check passed.");
