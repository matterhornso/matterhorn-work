#!/usr/bin/env node
// Static gate for the beta-tester protocol workspace panel UX.
// Verifies the venue desks, "Ask in Chat ->" prompts, safety strip/card, and "Evidence / QA"
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
  "Bittensor desk",
  "Hyperliquid desk",
  "Polymarket desk",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "VENUE_PROTOCOL_MANIFESTS",
  "Protocol manifest",
  "Allowed intents",
  "primaryPanelRouteId",
  "Start with your TAO, then choose what to do next.",
  "Preview Hyperliquid trades through chat, with execution off.",
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
  "Insert editable prompt",
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
for (const section of ["Ask in Chat ->", "Monday beta scenarios", "Monday beta launch checklist", "Safety status", "Evidence / QA"]) {
  assert.ok(panel.includes(`title="${section}"`), `Panel should render a "${section}" section`);
}

// 4. The six ask-in-chat prompt button labels exist.
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
assert.ok(panel.includes("askAgentForStandardBittensorAction"), "Standard Bittensor action cards should insert editable chat prompts");
assert.ok(panel.includes('source: "bittensor-standard-action"'), "Standard Bittensor actions should use a dedicated handoff source");
assert.ok(panel.includes("they do not auto-send, sign, broadcast, stake, unstake, transfer, or ask for wallet secrets."), "Standard Bittensor action copy should state no auto-send and no signing");
assert.ok(panel.includes('source: `${venue}-standard-action`'), "Standard market actions should use a dedicated handoff source");
assert.ok(panel.includes("They do not auto-send, sign, submit, place orders, bet, or ask for private keys"), "Standard market action copy should state no auto-send, no submission, and no secrets");
assert.ok(panel.includes("One-click prompts stay short; the full instruction is inserted into chat."), "Market action cards should show short summaries instead of full prompt walls");
assert.ok(panel.includes("Read-only market context"), "Market desks should show a read-only context primer");
assert.ok(panel.includes("Preview boundary: show the user what can be read"), "Market desks should explain the preview-only boundary");
assert.ok(panel.includes("Prepare a no-submit testnet preview with hash expectations."), "Hyperliquid cards should use concise preview summaries");
assert.ok(panel.includes("Prepare a preview-only YES/NO plan with no executable submit path."), "Polymarket cards should use concise preview summaries");

// 5b. Monday beta customer scenarios are sourced from the shared registry and
//     support prompt insertion plus evidence command copy.
for (const phrase of [
  "MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS",
  "MONDAY_BETA_DEMO_SCENARIOS",
  "Use these five guided scripts for the first 10 customer demos",
  "askAgentForMondayBetaScenario",
  'source: "monday-beta-panel"',
  "copyMondayBetaScenarioCommand",
  "node scripts/customer-demo-evidence-pack.mjs --scenario",
  "Insert demo prompt",
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
  "Run this launch-room checklist before each Monday beta customer call.",
  "Every command is local, public/redacted, and evidence-oriented; none signs, submits, custodies, or broadcasts.",
  "App opens with first-class desks",
  "Crypto safety smoke is green",
  "Production app typecheck passes",
  "Mac tester build and doctor pass",
  "Wellness workflow remains safe",
  "Bittensor, Hyperliquid, Polymarket, and Wellness are visible as separate customer paths",
  "desktop automation is not a default beta task.",
  "pnpm test:matterhorn-customer-onboarding-ui && pnpm test:crypto-panel-ux && pnpm test:customer-readiness-ui",
  "pnpm smoke:customer-ready-crypto && pnpm test:market-execution-safety-gate",
  "pnpm --filter @matterhorn-work/app typecheck",
  "pnpm electron:tester-artifact",
  "pnpm desktop:beta-doctor",
  "pnpm test:wellness-creator-workflow && node scripts/wellness-creator-workflow.mjs --check",
  "Copy launch check",
  "Monday beta promise",
  "Bittensor is the most mature beta path.",
  "Wellness is a standalone workflow surface, not Web3 and not medical care.",
  "Wellness workflow: Standalone",
  "Not Web3, not medical advice, and no live payments or email.",
]) {
  assert.ok(panel.includes(phrase), `Panel should expose Monday beta launch checklist copy: ${phrase}`);
}

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

// 8. Market desk copy must show the preview-only treatment.
for (const phrase of [
  "Preview Only",
  "Safety strip",
  "Read/preview + external signer",
  "external-signer request",
  "Can submit",
  "Live submission",
  "External signer/client required",
  "Copy external-signer examples",
  "Signer request",
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
  "bg-[radial-gradient(circle_at_18%_0%,rgba(var(--protocol-desk-rgb),0.18),transparent_42%),linear-gradient(180deg,var(--dls-sidebar),var(--dls-surface))]",
  "min-h-0 p-4 pb-8 sm:p-5",
  "style={venueToneStyle(venue)}",
  "--protocol-desk-accent",
  "These are the core Bittensor workflows Matterhorn should make easy.",
  "mb-4 flex flex-wrap items-start justify-between gap-3",
  "grid-cols-1 gap-1 rounded-xl bg-dls-surface-muted/35 p-1",
  "grid-cols-[repeat(auto-fit,minmax(132px,1fr))]",
  "break-words font-mono",
  "text-[15px]",
  "text-base font-semibold",
]) {
  assert.ok(panel.includes(phrase), `Panel should include resilient protocol layout treatment: ${phrase}`);
}

const sessionPage = readFileSync("apps/app/src/react-app/domains/session/chat/session-page.tsx", "utf8");
for (const phrase of [
  'data-testid="protocol-side-panel-scroll-root"',
  "flex h-full min-h-0 max-h-full flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain",
  "hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col",
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
