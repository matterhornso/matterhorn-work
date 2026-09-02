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
const workspaceCoworkerStart = read("apps/app/src/react-app/domains/session/chat/workspace-coworker-start.tsx");
const sessionSurface = read("apps/app/src/react-app/domains/session/surface/session-surface.tsx");
const composer = read("apps/app/src/react-app/domains/session/surface/composer/composer.tsx");
const statusBar = read("apps/app/src/react-app/domains/session/chat/status-bar.tsx");
const modelSelect = read("apps/app/src/components/model-select.tsx");
const remoteWorkspaceFields = read("apps/app/src/react-app/domains/workspace/remote-workspace-fields.tsx");
const workflowTemplates = read("apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts");
const deskTaskStarters = read("apps/app/src/react-app/domains/session/workflows/desk-task-starters.ts");
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
const profileCapabilityStatus = read("apps/app/src/react-app/domains/profile/profile-capability-status.tsx");
const feedback = read("apps/app/src/app/lib/feedback.ts");
const den = read("apps/app/src/app/lib/den.ts");
const denSigninSurface = read("apps/app/src/react-app/domains/cloud/den-signin-surface.tsx");
const forcedSigninPage = read("apps/app/src/react-app/domains/cloud/forced-signin-page.tsx");
const publicTrustContent = read("apps/app/src/react-app/domains/public/public-trust-content.ts");
const reactEntry = read("apps/app/src/index.react.tsx");
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
const normalizedMcpView = normalizeWhitespace(settingsRoute);

const denHelpLink = read("apps/app/src/react-app/domains/workspace/matterhorn-den-help-link.tsx");
const remoteWorkspaceDiagnostics = read("apps/app/src/react-app/domains/workspace/remote-workspace-diagnostics.ts");
const advancedSettings = read("apps/app/src/react-app/domains/settings/pages/advanced-view-sections.tsx");
const marketplaceSettings = read("apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx");
const walletSettings = read("apps/app/src/react-app/domains/settings/pages/wallet-view.tsx");
const walletSettingsRoute = read("apps/app/src/react-app/domains/settings/pages/wallet-settings-route-view.tsx");
const serverProvider = read("apps/app/src/react-app/kernel/server-provider.tsx");
const globalSdkProvider = read("apps/app/src/react-app/kernel/global-sdk-provider.tsx");
const betaGoLiveChecklist = read("docs/handoffs/beta-go-live-first-10-user-checklist.md");

assert.ok(
  sessionRoute.includes("allowCookieAuth={publicBetaWeb}") &&
    sessionPage.includes("(reactSessionToken || props.allowCookieAuth)"),
  "hosted web chats should render through cookie authentication without a desktop bearer token",
);
assert.ok(
  publicTrustContent.includes(
    "return input.publicBetaWeb && !isPublicTrustPath(input.pathname)",
  ) &&
    reactEntry.includes("if (!publicSessionVerified)") &&
    reactEntry.includes("<PublicSigninBootstrap"),
  "hosted web workspace routes should verify their cookie session before loading the authenticated shell",
);
assert.equal(
  publicTrustContent.includes("input.publicBetaWeb &&\n    input.requireSignin"),
  false,
  "hosted web authentication must not become optional when a build flag is omitted",
);

for (const phrase of [
  "Use Bittensor, Hyperliquid, Polymarket, and real-world workflows through one safe chat workspace.",
  "Ask about a market, wallet, transaction, or risk...",
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
  'alt="Matterhorn Desks"',
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
  "sign-in image should explain Matterhorn Desks instead of generic computer automation",
);
assert.ok(
  denSigninSurface.includes(
    '<main className="relative min-h-screen overflow-y-auto bg-dls-background text-dls-text">',
  ),
  "full-screen sign-in should expose one semantic main landmark",
);
assert.equal(
  denSigninSurface.includes("/matterhorn-mark.svg"),
  false,
  "full-screen sign-in should not load decorative Matterhorn marks ahead of authentication controls",
);

for (const phrase of [
  "Choose a coworker, continue your work, or open a protocol desk.",
  "New project",
  "New chat",
  "Open Bittensor desk",
  "Open a desk",
  "Each desk starts a focused agent task.",
  "Risk details stay behind each info button.",
  "Outputs and receipts stay with this project.",
  "Wallet details",
  "Agents prepare drafts only. TAO transfers, stake, and unstake calls require exact review and connected Bittensor-wallet approval. Other runtime calls remain unavailable until separately audited.",
  "Agents prepare drafts only.",
  "blocked regions get no executable terms.",
  "Standalone workflow. No medical advice, diagnosis, prescription, live payments, email, hosting, or token gating.",
  "No auto-send",
  "matterhorn-capability-overview",
  "matterhorn-capability-card",
  "grid min-h-16 w-full min-w-0 grid-cols-[34px_minmax(0,1fr)_auto]",
  "Open desk",
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
  "Guided test scenarios",
  "Operator-only guided runs",
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
  "Start chat",
  "ProtocolLogo",
  "Bittensor task:",
  "Hyperliquid task:",
  "Polymarket task:",
  "run",
  "in a new chat",
  "agentId:",
  "agentName:",
  "deriveMatterhornDeskMode",
  "MatterhornDeskSessionStrip",
  "starterWorkflowCapabilityItems",
  "`${manifest.displayName} session`",
  "Longevity workflow session",
  "Public wallet details and transaction drafts. You approve TAO transfers, stake, and unstake calls in your connected wallet; unsupported advanced calls are not presented as executable.",
  "Matterhorn never signs or holds keys.",
  "blocked regions get no executable terms.",
  "Standalone workflow. No medical advice, diagnosis, prescription, live payments, email, hosting, or token gating.",
  "External-signer previews",
  "External trade handoff",
  "Trade handoff",
  "Non-medical workflow",
  "Show my TAO",
  "Compare validators",
  "Place an order",
  "Draft an order for exact review and connected-wallet approval.",
  "execution requires a separate review and wallet signature in the Hyperliquid desk",
  "Summarize this Polymarket market",
  "Check Polymarket compliance",
  "Build the full 7-stage Longevity workflow for my clients",
  "MCPs & Connectors",
  "Choose a desk to begin",
  "Longevity: standalone service workflows, program packets, progress check-ins, and client handoffs",
  "Intake, goals, training, nutrition education, schedule, handouts, and service packaging.",
  "The Agent draft cannot submit.",
  "Agents prepare drafts only.",
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
  "Start a blank chat or choose a task below.",
  "Allowed workspace intents",
  "Read and preview",
  "Preview only",
  "Workflow-ready",
  "Planned, not live",
  "starterStatusLabel",
  "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.",
  "Use the standalone Longevity workflow, not a Web3 or market desk.",
  "CUSTOMER_VISIBLE_TEMPLATE_IDS",
  "CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS",
]) {
  assert.ok(
    `${sessionPage}\n${workspaceCoworkerStart}\n${sessionSurface}\n${workflowTemplates}\n${deskTaskStarters}\n${protocolDeskUi}`.includes(phrase),
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
  sessionPage.includes("onCreateTaskWithPrompt?: (") &&
    sessionPage.includes("onSessionCreated?: (sessionId: string) => void") &&
    sessionPage.includes('agent: agentIdForDesk(panel)') &&
    sessionPage.includes('agent: demo.agentId ?? agentIdForDesk(demo.iconHint),') &&
    sessionRoute.includes("const title = options?.title?.trim()") &&
    sessionRoute.includes("const agent = options?.agent?.trim()") &&
    sessionRoute.includes("options?.onSessionCreated?.(session.id)") &&
    sessionRoute.includes("useSessionAgentState(") &&
    sessionRoute.includes("saveSessionAgent(workspaceId, session.id, agent || null)") &&
    sessionRoute.includes("workspaceClient.session.update({") &&
    sessionRoute.includes("[displaySession as any, ...(current[workspaceId] ?? [])]"),
  "launcher-created chats should start with human launcher titles and the matching desk agent",
);
assert.ok(
  sessionPage.includes('openWorkflowDesk("wellness", wellnessRailLauncher.prompt, {') &&
    sessionPage.includes("stageWorkflowRun(props.matterhornServerClient!, {") &&
    sessionPage.includes("if (!options?.launchAgent)") &&
    sessionPage.includes("startWorkflowRun(props.matterhornServerClient!, stagedRun.workflowRunId)") &&
    sessionPage.includes("window.dispatchEvent(new Event(\"matterhorn:task-log-updated\"));"),
  "Longevity launchers should prepare backend workflow records before stage execution",
);
assert.ok(
  sessionPage.includes("launchAgent?: boolean") &&
    sessionPage.includes("props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, visibleUserIntent") &&
    sessionPage.includes("launchAgent: true") &&
    sessionPage.includes("agent: agentIdForDesk(deskId)") &&
    sessionPage.includes("sendImmediately: true"),
  "Longevity stage actions should open a real agent chat where the result is visible",
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
    sessionPage.includes("compactPathSegment(homeProjectPath)") &&
    sessionPage.includes("{homeFolderLabel}") &&
    sessionPage.includes('label={homePathCopyLabel === "Project path" ? "Project path copied" : "Copy project path"}') &&
    sessionPage.includes('label="Open project folder"') &&
    sessionPage.includes('label={homePathCopyLabel === "Outputs path" ? "Outputs path copied" : "Copy outputs path"}') &&
    sessionPage.includes('label="Open outputs folder"') &&
    sessionPage.includes('label="Jot a note about outputs"') &&
    sessionPage.includes("WorkspaceHomeIconAction") &&
    sessionPage.includes("props.sidebar.onRevealWorkspace(props.selectedWorkspaceId)"),
  "project Home should show compact folder/outputs locations with accessible icon copy/open actions",
);

for (const phrase of [
  "Access Token",
  "Paste a collaborator or owner access token only if this Matterhorn worker requires one.",
]) {
  assert.ok(remoteWorkspaceFields.includes(phrase), `remote workspace setup should use safer Matterhorn access-token copy: ${phrase}`);
}

for (const phrase of [
  "Stop generating (cancels current run)",
  "All models",
  "Change model",
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
  "props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId)",
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

assert.equal(sessionSurface.includes("Stage agent task"), false, "session starter cards should launch directly without repeated internal staging copy");
assert.equal(settingsRoute.includes("border-l border-dls-border/30 pl-3"), false, "MCP setup should avoid hard left-rule dividers");

assert.ok(walletPanel.includes('lazy(() => import("./pages/BittensorPanel"))'), "Protocol rail should mount the venue panel");
assert.ok(
  walletPanel.includes("<BittensorPanel")
    && walletPanel.includes("initialVenue={initialVenue}")
    && walletPanel.includes("openReviewedAction={openReviewedAction}"),
  "Protocol panel should render the selected workspace and preserve reviewed-action launch intent",
);
assert.equal(walletPanel.includes("EVM wallet not connected"), false, "no-wallet protocol panel should not block content with a bottom overlay");
assert.ok(sessionPage.includes("GLOBAL_HOME_SIDE_PANEL_KEY"), "home should keep right-rail panels usable before a session exists");
assert.ok(sessionPage.includes("ProtocolDeskEmptyState"), "protocol launchers should open a focused desk start state before staging an agent task");
assert.ok(sessionPage.includes("MATTERHORN_DESK_TASK_STARTERS"), "focused desk start states should offer the expanded protocol-specific task starters");
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
assert.ok(protocolDeskUi.includes("Bittensor: TAO reads, subnets, validators, wallet-reviewed transfers, stake, unstake, watches, and receipts"), "Bittensor rail tooltip should explain protocol-specific work");
assert.ok(protocolDeskUi.includes("Hyperliquid: orderbooks, exposure, funding, watches, and wallet-reviewed place, cancel, modify, and close actions"), "Hyperliquid rail tooltip should explain protocol-specific work");
assert.ok(protocolDeskUi.includes("Polymarket: markets, liquidity, compliance, watches, and wallet-reviewed buy, sell, and cancel actions"), "Polymarket rail tooltip should explain protocol-specific work");
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
assert.ok(sessionPage.includes("getCustomerProtocolDeskVisualForLaunch(panel, false)"), "public-Beta right rail should read fail-closed desk labels from the shared visual manifest");
assert.ok(sessionPage.includes("visual?.displayName ?? panel"), "right rail should spell out protocol desk names from the manifest");
assert.ok(sessionPage.includes('getCustomerProtocolDeskVisual("wellness")?.displayName'), "Wellness rail label should come from the shared visual manifest");
assert.ok(sessionPage.includes("primeProtocolRailPrompt"), "protocol rail prompt helper should remain available for explicit demo handoffs");
assert.ok(sessionPage.includes("pendingProtocolRailPanelRef"), "protocol rail clicks should restore the selected desk after creating a prompted session");
assert.ok(sessionPage.includes("props.sidebar.onCreateTaskWithPrompt(props.selectedWorkspaceId, prompt"), "protocol rail prompts should create a real Matterhorn task");
assert.ok(sessionPage.includes("agent: agentIdForDesk(panel)"), "protocol rail prompts should route to the desk-specific agent");
assert.ok(sessionPage.includes("sendImmediately: true"), "protocol rail prompts should start the desk task immediately");
assert.equal(sessionPage.includes('new CustomEvent("matterhorn:crypto-chat-handoff"'), false, "protocol rail prompts should not silently stage hidden composer drafts");
assert.ok(sessionPage.includes("onClick={() => openVenueRailPane(item.panel)}"), "protocol rail buttons should open a focused desk without priming a mixed chat composer");
assert.ok(sessionPage.includes('card.id === "wellness_creator_workflow"'), "right rail should expose the Wellness workflow launcher");
assert.equal(sessionPage.includes('card.id === "decentralized_services_operator"'), false, "right rail should not expose future Services as a customer-facing launcher");
assert.equal(sessionPage.includes('label: "Services"'), false, "customer right rail should not render a Services button");
assert.ok(
  sessionPage.includes('openWorkflowDesk("wellness", item.launcher.prompt, {') &&
    sessionPage.includes("title: item.launcher.title,") &&
    sessionPage.includes('sourceId: "wellness-rail-launcher",'),
  "workflow rail launchers should create backend Longevity workflow runs with human task titles",
);
assert.ok(sessionPage.includes('title="Back to chat"'), "right rail should expose a clear way back to chat");
assert.ok(sessionSurface.includes("overflow-y-auto px-4 py-5"), "empty session launcher should scroll instead of clipping beneath the composer");
assert.ok(sessionPage.includes("absolute inset-0 flex items-start justify-center overflow-y-auto"), "home starter launcher should be viewport-constrained and scroll inside the main pane");
assert.equal(sessionPage.includes("relative flex min-h-0 flex-1 items-start justify-center overflow-y-auto"), false, "home starter launcher must not size to full content height inside an overflow-hidden parent");
assert.ok(sessionSurface.includes("MatterhornDeskFocusedEmptyState"), "empty desk sessions should render a focused desk prompt state");
assert.ok(sessionSurface.includes("MATTERHORN_DESK_TASK_STARTERS"), "focused desk prompt state should use the shared expanded task starters");
assert.ok(deskTaskStarters.includes("Show TAO balance"), "Bittensor focused empty state should suggest TAO balance reads");
assert.ok(
  sessionPage.includes("matterhorn-focused-desk-hero px-1 py-2") &&
    sessionPage.includes("<ProtocolLogo venue={panel} size={52} />"),
  "focused desk start should render a compact protocol-logo header instead of a plain block",
);
assert.equal(sessionPage.includes("matterhorn-focused-desk-boundary"), false, "focused desk header should not render decorative metadata labels");
assert.ok(
  sessionPage.includes('className="matterhorn-focused-desk-prompt-list space-y-5"') &&
    sessionPage.includes('aria-labelledby={`desk-task-group-${panel}-${group.id}`}') &&
    sessionPage.includes('showAllTasks ? "lg:grid-cols-2" : "lg:grid-cols-3"') &&
    sessionPage.includes("<WorkflowStageCard"),
  "focused desk prompts should render in labeled, compact responsive workflow groups",
);
assert.ok(
  sessionPage.includes("MATTERHORN_LAUNCH_FEATURES.reviewedDeskActions") &&
    sessionPage.includes("Public Beta is read-only.") &&
    deskTaskStarters.includes("starters.filter((starter) => !starter.reviewedAction)"),
  "public Beta desks should advertise the read-only boundary and remove reviewed wallet actions",
);
assert.ok(
  sessionSurface.includes("Start task") && sessionSurface.includes("Choose a starter below to run"),
  "focused desk prompt rows should launch clear desk tasks without exposing hidden prompts",
);
assert.equal(sessionPage.includes("rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.09)] px-4 py-3 text-sm leading-6 text-dls-text"), false, "focused desk safety boundary should not use the old boxed callout");
assert.ok(sessionSurface.includes("matterhorn-desk-session-hero overflow-hidden rounded-xl"), "desk-specific empty sessions should use the same compact logo-led hero treatment");
assert.ok(sessionSurface.includes("matterhorn-desk-session-prompts overflow-hidden rounded-xl"), "desk-specific empty sessions should use soft prompt lists instead of boxed cards");
assert.equal(sessionPage.includes("rounded-[28px]"), false, "focused desk surfaces should avoid oversized card radii");
assert.equal(sessionSurface.includes("rounded-[28px]"), false, "session empty surfaces should avoid oversized card radii");
assert.ok(sessionSurface.includes("activeDeskMode ? ("), "generic starter grid should be bypassed when a protocol desk session is active");
assert.ok(sessionSurface.includes("ArrowDown"), "Jump to latest should use a visible down-arrow icon");
assert.ok(sessionSurface.includes("bottom-4 left-1/2 z-40"), "Jump to latest should sit visibly above the composer edge");
assert.ok(sessionSurface.includes("gap-0.5 rounded-md bg-dls-surface-muted/70 p-0.5 shadow-[0_1px_4px_rgba(0,0,0,0.2)]"), "Jump controls should use a compact, quiet surface");
assert.ok(sessionSurface.includes("inline-flex h-7 items-center gap-1 rounded"), "Jump controls should stay compact above the composer");
assert.equal(sessionSurface.includes("border border-dls-text bg-dls-text"), false, "Jump controls should not compete with primary composer actions");
assert.ok(sessionSurface.includes('aria-label="Jump to the latest message"'), "Jump to latest should expose a clear accessible label");
assert.equal(sessionSurface.includes("rounded-full px-3 py-1.5 text-xs text-dls-text"), false, "Jump to latest should not regress to the hidden low-contrast pill");
assert.ok(composer.includes("inline-flex h-8 max-h-8 items-center gap-1.5 rounded-md bg-dls-hover/70 px-2.5 text-[12px]"), "Stop generating should remain a compact secondary chat control");
assert.equal(composer.includes("rounded-lg bg-gray-12 px-3.5 text-[13px]"), false, "Stop generating should not dominate the composer with a large high-contrast fill");
assert.ok(sessionSurface.includes("matterhorn-session-start-list grid grid-cols-1 gap-1.5 lg:grid-cols-2"), "starter workflow grid should use compact two-column command rows instead of a crowded card wall");
assert.ok(sessionPage.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))]"), "beta demo starter cards should use container-safe auto-fit columns");
assert.ok(
  sessionSurface.includes("group grid min-h-[84px] min-w-0 grid-cols-[32px_minmax(0,1fr)]") &&
    sessionSurface.includes("sm:min-h-[64px]"),
  "starter workflow rows should reserve readable mobile copy while staying compact on wider screens",
);
assert.ok(sessionSurface.includes("renderedMessages.length > 0 && hasTranscriptJumpTarget"), "empty workflow launchers should not show transcript jump controls over the content");
assert.equal(sessionSurface.includes("size-28"), false, "starter workflow cards should not render oversized ghost icons behind the content");
assert.equal(sessionSurface.includes("rounded-[28px]"), false, "starter workflow grid should not render a large framed outer box");
assert.equal(sessionSurface.includes("grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]"), false, "starter workflow grid should not use the old crowded auto-fit card wall");
assert.equal(sessionSurface.includes("rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.07)]"), false, "starter workflow rows should not use the old boxed card treatment");
assert.ok(
  sessionPage.includes("matterhorn-capability-card group relative min-w-0 border-b") &&
    sessionPage.includes("data-testid={`open-${item.id}-desk`}"),
  "home capability status should render compact clickable destination rows",
);
assert.ok(sessionPage.includes("onOpenCapability?.(item.id)"), "home capability status cards should open their matching desk or workflow");
assert.ok(sessionPage.includes("item.id === \"wellness\" ? \"Start workflow\" : \"Open desk\""), "home capability cards should label protocol desks separately from wellness workflows");
assert.equal(sessionPage.includes("matterhorn-desk-command-list"), false, "home should not render a second duplicate desk launcher list");
assert.equal(sessionPage.includes("rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.13)]"), false, "home capability status should not use icon tiles");
assert.equal(sessionPage.includes("rounded-md bg-[rgba(var(--matterhorn-desk-rgb),0.13)] px-1.5 py-0.5"), false, "home capability status should not use status pills");
assert.equal(sessionPage.includes("matterhorn-desk-launcher group flex min-h-[96px] w-full overflow-hidden rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.08)]"), false, "home desk launchers should not use the old boxed tile treatment");
assert.equal(sessionPage.includes("grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"), false, "home desk launchers should not fall back to the old box grid");

for (const phrase of [
  "Matterhorn Desks Beta Go-Live Checklist For First 10 Users",
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
  sessionPage.includes('className="matterhorn-side-panel flex h-full min-h-0 flex-col overflow-hidden bg-dls-background"'),
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
  "Supported actions are prepared first, then require exact review and approval in the connected wallet. Agents and watches never submit.",
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
  '<SessionWalletPanel',
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
assert.ok(extensionsView.includes('"grid min-w-0 flex-1 grid-cols-2 rounded-md bg-dls-surface-muted/[0.14] p-1"'), "embedded extensions tabs should use equal compact columns and a quiet shared surface");
assert.ok(extensionsView.includes("h-9 min-w-0 rounded-md border-0 bg-transparent"), "embedded extensions tabs should use compact, softly contrasted controls");
assert.equal(extensionsView.includes("post-go-live"), false, "Marketplace tabs should omit redundant launch-status copy");
assert.ok(extensionsView.includes('<span className="min-w-0 max-w-full truncate">Marketplace</span>'), "embedded Marketplace label should be constrained inside its compact tab");
assert.ok(settingsSurfaceRoute.includes("compact={props.embedded}"), "embedded settings should tell extensions and MCP views to use compact right-rail layout");
assert.ok(settingsSurfaceRoute.includes("<CloudAccountView\n            compact={props.embedded}"), "embedded Profile rail should render the compact account surface");
assert.ok(settingsSurfaceRoute.includes("<WalletSettingsRouteView\n            compact={props.embedded}"), "embedded Wallet rail should render the lazy wallet route boundary");
assert.ok(walletSettingsRoute.includes("<WalletSettingsView") && walletSettingsRoute.includes("compact={props.compact}"), "lazy wallet route boundary should render the compact wallet surface");
for (const phrase of [
  "matterhorn-profile-rail max-w-none gap-6",
  "Matterhorn Cloud",
  "getProfileReadiness",
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
  "Local profile",
  "Preferences and workspace access",
  "Local teammate access",
  "Workspace details",
  "Backend version",
  "Profile capability",
  "Local token sharing",
]) {
  assert.ok(profileCapabilityStatus.includes(phrase), `profile rail should keep local status clear and progressively disclosed: ${phrase}`);
}
for (const phrase of [
  "matterhorn-wallet-rail max-w-none gap-5",
  "Protocol support",
  "EVM wallet",
  "getWalletRuntimeCapability",
  "WalletRuntimeExplainer",
  "WalletBoundaryList",
  "capability.safetyCopy",
  "External signer",
  "Browser wallet extensions are available when installed and allowed.",
  "No EVM wallet connector detected",
  "Install or enable MetaMask, Rabby, or another injected wallet. Public reads and market previews still work.",
  "Read public SS58 data and prepare unsigned actions.",
  "Hyperliquid",
  "Polymarket",
  "safetyCopy.forbiddenSecretsLine",
  "Never paste",
]) {
  assert.ok(walletSettings.includes(phrase), `wallet rail should have compact, honest wallet state: ${phrase}`);
}
assert.equal(walletSettings.includes("Preview only"), false, "healthy wallet connection states should stay silent");
assert.equal(sessionPage.includes("ProfileRailPanel"), false, "Profile rail should use the real Account settings page, not a custom mini-panel");
assert.equal(sessionPage.includes('activeSidePanel === "wallet" || isVenueSidePanel(activeSidePanel)'), false, "Wallet rail should not be merged with protocol action panels");
assert.ok(
  sessionPage.includes('visibleSidePanel === "sui" ? (') &&
    sessionPage.includes("SuiWorkflowPanel") &&
    sessionPage.includes("isLegacyCryptoVenueSidePanel(visibleSidePanel) ? (") &&
    sessionPage.includes("WalletPanel"),
  "protocol desks should still render the Sui workflow panel and legacy crypto action/wallet panel",
);
assert.equal(statusBar.includes("openworklabs.com/docs"), false, "status bar docs should not point customers to OpenWork docs");
assert.equal(cryptoPrompt.includes("wallet_signTypedData"), false, "prompt should not push direct signing as default");
assert.equal(sessionRoute.includes("wallet.snapshot.isConnected && shouldInjectCryptoPrompt"), false, "crypto prompt injection must not require connected EVM wallet");
assert.ok(sessionRoute.includes("shouldInjectCryptoPrompt(text)"), "crypto prompt injection should still be keyword-gated");
for (const phrase of [
  "buildMatterhornOrientationSystemPrompt",
  "shouldInjectMatterhornOrientationPrompt(text)",
  "matterhornOrientationPrompt",
  'id: "workspace_orientation", content: matterhornOrientationPrompt',
  'id: "crypto_safety", content: cryptoPrompt',
  'id: "desk_contract", content: deskAgentInstructions',
]) {
  assert.ok(sessionRoute.includes(phrase), `broad starter prompts should receive Matterhorn orientation context: ${phrase}`);
}
for (const phrase of [
  "MATTERHORN_ORIENTATION_PATTERNS",
  "\\bwhat can i do\\b",
  "## Matterhorn Desks Orientation",
  "Give a concise Matterhorn Desks orientation rather than a generic coding-assistant introduction.",
  "If the workspace is empty, do not lead with internal runtime files such as opencode.json or .opencode/.",
  "Bittensor: explain subnets",
  "Hyperliquid: read markets/orderbooks/account exposure",
  "Polymarket: search/summarize markets",
  "Longevity workflows",
  "Chat and watches never auto-execute.",
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
  "Install Matterhorn MCPs for Codex, Claude Code, Claude Desktop, and",
  "Cursor.",
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
  "rounded-lg bg-dls-surface-muted/18 px-3 py-2",
  "Safety",
  "Full docs",
  "Open GitHub docs",
  "MATTERHORN_MCP_DOCS_GITHUB_BASE",
  "mcpDocs(",
  "const docsHref = props.card.docs.githubUrl",
  "const toolsHref = `${docsHref}#tools`",
  "href={docsHref}",
  "href={toolsHref}",
  "aria-label={`Open GitHub docs for ${tool}`}",
  "Use this MCP for",
  "How it works",
  "Safety boundary",
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
  "Public reads plus transfer, stake, and unstake drafts.",
  "Compliance-gated handoff only. No live submit.",
  "review and submit it with your own signer or client.",
  "Never paste seeds, keys, mnemonics, signatures, signed payloads, or wallet exports.",
  "Never paste API secrets, keys, signatures, signed payloads, or custody credentials.",
  "No hidden saves.",
  "No provider execution, payments, email sending, publishing, or token gates.",
  "No custody, signing, market submit, or secret collection.",
]) {
  assert.ok(
    settingsRoute.includes(phrase) || normalizedMcpView.includes(phrase),
    `MCP desk product cards should expose safe Matterhorn MCP setup copy: ${phrase}`,
  );
}
assert.equal(
  settingsRoute.includes("props.card.docs.examples.map"),
  false,
  "MCP product cards should keep long example prompts in GitHub docs instead of rendering them inline.",
);
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
  settingsRoute.includes("onCopyCommand={copyMatterhornMcpCommand}\n        compact"),
  "MCP product cards should use compact disclosure rows at every settings width.",
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
  normalizedMcpView.includes("McpCustomAppCard compact={props.compact}"),
  "MCP custom app card should inherit the compact right-rail rendering mode.",
);
assert.ok(
  normalizedMcpView.includes('props.compact ? "px-1 py-2"'),
  "MCP custom app action should use an open compact rail treatment.",
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
assert.ok(denHelpLink.includes("updates@matterhorn.so"), "remote worker help dialog should use Matterhorn support email");
assert.ok(remoteWorkspaceDiagnostics.includes("updates@matterhorn.so"), "remote workspace diagnostics should use Matterhorn support email");
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
  "Matterhorn Desks engine endpoint",
  "formatEngineEndpoint",
]) {
  assert.ok(`${english}\n${advancedSettings}`.includes(phrase), `advanced settings should use Matterhorn customer-safe wording: ${phrase}`);
}
assert.equal(english.includes("Enable Exa web search"), false, "English settings copy should not expose Exa as the default customer search brand");

for (const phrase of [
  "Agent Marketplace Preview",
  "Hiring, payment, and deployment are coming soon.",
  "Preview only. No wallet, payment, or live deployment.",
  "Preview template",
  "Save preview",
  "Generate preview",
  "No wallet connection, payment, or on-chain deployment was attempted.",
]) {
  assert.ok(marketplaceSettings.includes(phrase), `agent marketplace should be explicit preview-only UI: ${phrase}`);
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
  "EVM wallet",
  "Review & submit",
  "Prepare only",
  "Read public SS58 data and prepare TAO transfer, stake, or unstake calls.",
  "Unsupported advanced calls stay unavailable.",
  "WalletBoundaryList",
  "safetyCopy.forbiddenSecretsLine",
  "keys stay in your wallet",
]) {
  assert.ok(walletSettings.includes(phrase), `wallet settings should clearly explain current wallet boundaries: ${phrase}`);
}

console.log("Matterhorn customer onboarding UI static check passed.");
