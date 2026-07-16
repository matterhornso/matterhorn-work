#!/usr/bin/env node
// Static gate for the beta-tester protocol workspace panel UX.
// Verifies the venue desks, "Ask Agent ->" tasks, safety strip/card, and "Evidence / QA"
// card exist; that prompt buttons insert (not auto-send) via the handoff event;
// and that only the explicit Hyperliquid wallet ticket can submit.
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
  "Bittensor desk",
  "Hyperliquid desk",
  "Polymarket desk",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "VENUE_PROTOCOL_MANIFESTS",
  "Safety & signing",
  "safety details",
  "PopoverContent",
  "Allowed intents",
  "Start with your TAO, then choose what to do next.",
  "Research and execute Hyperliquid perpetual orders with wallet review.",
  "Analyze prediction markets and preview safely.",
  "Actions",
  "Matterhorn prepares Bittensor action previews for review.",
  "Standard Bittensor actions",
  "Standard Hyperliquid actions",
  "Standard Polymarket actions",
  "Show TAO balance",
  "Where am I staked?",
  "Browse all subnets",
  "Compare validators",
  "Prepare stake preview",
  "Prepare unstake preview",
  "Prepare transfer preview",
  "Create watch or alert",
  "Import receipt",
  "Explain coldkey/hotkey",
  "Prepare an unsigned preview",
  "Unsigned action flow",
  "Public fields only",
  "ProtocolBrandLogo",
  "formatBittensorProviderError",
  "editable Bittensor Agent task",
  'outcome: "Wallet snapshot"',
  'outcome: "Stake position summary"',
  'outcome: "Unsigned stake preview"',
  'outcome: "Receipt status"',
  "This button creates an unsigned preview only.",
  "Matterhorn server did not answer",
  "instead of JSON. Reconnect the Matterhorn Work server",
  "Dynamic subnet list from the Matterhorn Bittensor API",
  "The subnet browser is live-data backed, not hardcoded.",
]) {
  assert.ok(panel.includes(phrase), `Panel should expose a dedicated venue desk: ${phrase}`);
}
assert.equal(panel.includes("Crypto workspace"), false, "Panel should not render a generic Crypto workspace title");

// 3. The beta-tester sections exist.
for (const section of ["Ask Agent ->", "Guided test scenarios", "Release test checklist", "Safety status", "Evidence / QA"]) {
  assert.ok(panel.includes(`title="${section}"`), `Panel should render a "${section}" section`);
}
assert.ok(
  panel.includes('...(BITTENSOR_BETA_MODE ? [{ key: "demo" as const, label: "Demo" }] : [])'),
  "Stable builds should not expose the beta demo tab unless the explicit beta flag is enabled",
);
assert.ok(
  panel.includes('BITTENSOR_BETA_MODE && venue === "bittensor" && tab === "demo"'),
  "Stable builds should keep beta operator content behind the explicit beta flag",
);
for (const phrase of ["Read and preview", '"Preview only"', "Matterhorn uses public reads and external signer/client handoffs"]) {
  assert.ok(panel.includes(phrase), `Stable protocol UI should use release-accurate copy: ${phrase}`);
}

// 4. The six Ask Agent task button labels exist.
for (const label of [
  "show my TAO",
  "find Bittensor subnets for image generation",
  "compare validators on subnet 14",
  "prepare staking 1 TAO",
  "show Hyperliquid BTC orderbook",
  "summarize a Polymarket market",
]) {
  assert.ok(panel.includes(label), `Panel should include Ask Agent task: ${label}`);
}

// 5. Buttons insert into the composer (do not auto-send): they use the handoff
//    helper, and the copy makes the no-auto-send behavior explicit.
assert.ok(panel.includes("askAgentBetaTryPrompt"), "Ask Agent buttons should call the beta task handler");
assert.ok(panel.includes('source: "crypto-beta-try"'), "Beta prompts should route through the crypto handoff source");
assert.ok(panel.includes("matterhorn:crypto-chat-handoff") || panel.includes('mode: item.mode'), "Beta prompts should use the insert handoff event");
assert.ok(panel.includes("Nothing sends automatically"), "Panel should tell testers prompts are not auto-sent");
assert.ok(panel.includes("Right-rail command groups stay single-column"), "Protocol rail command groups should avoid cramped multi-column controls");
assert.ok(panel.includes("askAgentForStandardBittensorAction"), "Standard Bittensor action cards should stage editable Bittensor Agent tasks");
assert.ok(panel.includes('source: "bittensor-standard-action"'), "Standard Bittensor actions should use a dedicated handoff source");
assert.ok(panel.includes("they do not auto-send, sign, broadcast, stake, unstake, transfer, or ask for wallet secrets."), "Standard Bittensor action copy should state no auto-send and no signing");
assert.ok(panel.includes('source: `${venue}-standard-action`'), "Standard market actions should use a dedicated handoff source");
assert.ok(panel.includes("Agent prompts never auto-execute; Hyperliquid orders still require a separate review and wallet signature in the trade ticket."), "Standard market action copy should separate agent prompts from wallet-approved execution");
assert.ok(panel.includes("One-click tasks stay short and the full instruction stays editable before you send."), "Market action cards should show short summaries instead of full task walls");
assert.ok(panel.includes("Read-only market context"), "Market desks should show a read-only context primer");
assert.ok(panel.includes("Preview boundary: show the user what can be read"), "Market desks should explain the preview-only boundary");
assert.ok(panel.includes("Review an order before wallet signing and submission."), "Hyperliquid cards should use concise wallet-execution summaries");
assert.ok(panel.includes("Prepare a preview-only YES/NO plan with no executable submit path."), "Polymarket cards should use concise preview summaries");

// 5b. Monday beta customer scenarios are sourced from the shared registry and
//     support task staging plus evidence command copy.
for (const phrase of [
  "MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS",
  "MONDAY_BETA_DEMO_SCENARIOS",
  "Use these five operator scripts to verify customer journeys.",
  "askAgentForMondayBetaScenario",
  'source: "monday-beta-panel"',
  "copyMondayBetaScenarioCommand",
  "node scripts/customer-demo-evidence-pack.mjs --scenario",
  "Stage demo task",
  "Copy evidence command",
  "assignedBetaCustomers",
  "expectedArtifacts",
]) {
  assert.ok(panel.includes(phrase), `Panel should expose Monday beta scenario workflow: ${phrase}`);
}

// 5c. Monday beta launch checklist gives operators a single proof path before
//     each customer call.
for (const phrase of [
  "MONDAY_BETA_LAUNCH_CHECKLIST",
  "Run this launch-room checklist before customer use.",
  "Every command is local, public/redacted, and evidence-oriented; none signs, submits, custodies, or broadcasts.",
  "App opens with first-class desks",
  "Crypto safety smoke is green",
  "Production app typecheck passes",
  "Mac tester build and doctor pass",
  "Longevity workflow remains safe",
  "Bittensor, Hyperliquid, Polymarket, and Longevity are visible as separate customer paths",
  "desktop automation is not a default beta task.",
  "pnpm test:matterhorn-customer-onboarding-ui && pnpm test:crypto-panel-ux && pnpm test:customer-readiness-ui",
  "pnpm smoke:customer-ready-crypto && pnpm test:market-execution-safety-gate",
  "pnpm --filter @matterhorn-work/app typecheck",
  "pnpm electron:tester-artifact",
  "pnpm desktop:beta-doctor",
  "pnpm test:wellness-creator-workflow && node scripts/wellness-creator-workflow.mjs --check",
  "Copy launch check",
  "Release boundary",
  "Bittensor supports public reads and unsigned previews.",
  "Longevity is a standalone workflow surface, not Web3 and not medical care.",
  "Longevity workflow: Standalone",
  "Not Web3, not medical advice, and no live payments or email.",
]) {
  assert.ok(panel.includes(phrase), `Panel should expose Monday beta launch checklist copy: ${phrase}`);
}

// 6. Safety status: the three venue lines + the wallet-approved boundary.
for (const phrase of [
  "Public reads and unsigned previews.",
  "External signer required for actions",
  "Manual execution is available in the trade ticket after exact-order review and connected-wallet approval.",
  "Agent prompts and watches never auto-submit.",
  "Preview only, compliance checks required.",
  "Matterhorn never custodies keys or signs silently.",
  "Polymarket does not submit orders.",
  "Public reads work without connecting an EVM wallet.",
  "Local Matterhorn API unavailable for /api/crypto/readiness",
  "This blocks live customer evidence collection until the local server/auth token is healthy",
  "Local API check",
  "Check pending",
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

// 8. Market desk copy must distinguish Hyperliquid execution from Polymarket preview-only behavior.
for (const phrase of [
  "Preview Only",
  "Safety strip",
  "Wallet-authorized execution",
  "Execution boundary",
  "external-signer request",
  "Can submit",
  "Live submission",
  "External signer/client required",
  "Copy signer examples",
  "Signer request",
]) {
  assert.ok(panel.includes(phrase), `Panel should include market preview-only copy: ${phrase}`);
}

assert.ok(panel.includes('/api/hyperliquid/orders/execution-intent'), "Hyperliquid ticket must request a server-issued intent");
assert.ok(panel.includes('/api/hyperliquid/orders/submit'), "Hyperliquid ticket must expose the wallet-approved submit route");

// 9. No copy or route enables Polymarket submission or unattended execution.
for (const forbidden of [
  "/api/polymarket/orders/submit",
  'title="Try in chat"',
  'title="Try prompts"',
  "Copy sign-request examples",
  ">Sign request<",
  "External sign request",
  "Services: Workflow/future hooks",
  "Services are planned hooks, not live provider execution.",
  "Services: Coming soon",
]) {
  assert.equal(panel.includes(forbidden), false, `Panel must not claim live submission: ${forbidden}`);
}

// 9b. Customer-reported layout fixes: no bottom wallet overlay, wider mobile-safe
// metrics, and protocol panels scroll vertically.
for (const phrase of [
  "flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain",
  "overflow-y-auto overscroll-y-contain max-h-full",
  "[scrollbar-gutter:stable]",
  "bg-dls-canvas",
  "style={venueToneStyle(venue)}",
  "--protocol-desk-accent",
  "These are the core Bittensor workflows Matterhorn should make easy.",
  "mb-4 flex flex-wrap items-start justify-between gap-3",
  "grid-cols-1 gap-1 rounded-lg bg-dls-surface-muted/35 p-1",
  "Safety & signing",
  "safety details",
  "break-words font-mono",
  "text-[15px]",
  "text-base font-semibold",
]) {
  assert.ok(panel.includes(phrase), `Panel should include resilient protocol layout treatment: ${phrase}`);
}
assert.equal(
  panel.includes("radial-gradient"),
  false,
  "Protocol panel should avoid decorative gradient shells.",
);
assert.equal(
  panel.includes(">Boundary<") || panel.includes("Protocol manifest"),
  false,
  "Protocol panel safety details should stay behind the info control.",
);

const sessionPage = readFileSync("apps/app/src/react-app/domains/session/chat/session-page.tsx", "utf8");
for (const phrase of [
  'data-testid="protocol-side-panel-scroll-root"',
  "flex h-full min-h-0 max-h-full flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain",
  "matterhorn-side-panel hidden h-full min-h-0 overflow-hidden bg-dls-background lg:flex lg:flex-col",
]) {
  assert.ok(sessionPage.includes(phrase), `Session page should keep protocol rail scroll bounded: ${phrase}`);
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
