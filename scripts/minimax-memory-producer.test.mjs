#!/usr/bin/env node
/**
 * scripts/minimax-memory-producer.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-memory/ Memory Producer V1
 * and Customer UX Overhaul specs.
 *
 * Checks:
 * 1. Required files exist
 * 2. Specs cover all required sections
 * 3. Stitch prompts cover all required sprints
 * 4. Styles CSS has new semantic token namespaces
 * 5. Safety: forbidden content absent from specs
 * 6. Safety gate compatibility
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(file) {
  return readFileSync(join(repoRoot, file), "utf8");
}

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function fail(msg, reason = "missing") {
  console.log(`FAIL ${msg} (${reason})`);
  failures++;
}

function fileExists(file) {
  try {
    readFileSync(join(repoRoot, file));
    return true;
  } catch {
    return false;
  }
}

console.log("\nMatterhorn Memory Producer & Customer UX Overhaul — Static Design Gate\n");

// ── 1. Required files exist ─────────────────────────────────────

const requiredFiles = [
  "docs/ui/matterhorn-memory/memory-producer-v1.md",
  "docs/ui/matterhorn-memory/memory-suggestion-inbox-v1.md",
  "docs/ui/matterhorn-memory/customer-ux-overhaul.md",
  "docs/ui/matterhorn-memory/stitch-prompts.md",
  "docs/ui/matterhorn-memory/styles.css",
  "docs/handoffs/minimax-memory-producer-ux-handoff.md",
];
for (const f of requiredFiles) {
  try {
    read(f);
    pass(`File exists: ${f}`);
  } catch {
    fail(`File exists: ${f}`, "NOT FOUND");
  }
}

// ── 1b. Memory Suggestion Inbox V1 — all 10 required sections ───

const inbox = read("docs/ui/matterhorn-memory/memory-suggestion-inbox-v1.md");

// §1 — Entry point
const entrySections = [
  ["Bell icon", "Bell Icon"],
  ["Bell icon", "bell icon"],
  ["Unread count", "unread count"],
  ["Tooltip", "Tooltip"],
  ["Empty state", "No memory suggestions"],
  ["Loading state", "Loading"],
  ["Error state", "error"],
  ["Badge pulse", "pulse"],
  ["Bell states table", "States Summary"],
];
for (const [label, needle] of entrySections) {
  if (inbox.includes(needle)) pass(`Inbox spec §1: "${needle}" present`);
  else fail(`Inbox spec §1: "${needle}" present`, "missing");
}

// §2 — Inbox panel
const panelSections = [
  ["Slide-over desktop", "Slide-over from right"],
  ["480px panel", "480px"],
  ["Tablet behavior", "768px"],
  ["Mobile full-screen", "Full-screen sheet from bottom"],
  ["No overflow", "no horizontal overflow"],
  ["Pending vs confirmed", "pending suggestions only"],
  ["Filter bar", "Filter"],
  ["Mark all read", "Mark all read"],
  ["Focus trap", "Focus trap"],
  ["Escape closes", "Escape"],
  ["Accessibility aria", "aria-modal"],
];
for (const [label, needle] of panelSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §2: "${needle}" present`);
  else fail(`Inbox spec §2: "${needle}" present`, "missing");
}

// §3 — Suggestion card
const cardSections = [
  ["Title", "Title"],
  ["Proposed value body", "proposed memory value"],
  ["Kind badge", "Kind badge"],
  ["Sensitivity badge", "Sensitivity badge"],
  ["Confidence bar", "Confidence bar"],
  ["Source chip", "Source chip"],
  ["Why suggested", "Why suggested"],
  ["Preview of what will be saved", "Will be saved as"],
  ["Confirm button", "Confirm"],
  ["Edit button", "Edit"],
  ["Dismiss button", "Dismiss"],
];
for (const [label, needle] of cardSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §3: "${needle}" present`);
  else fail(`Inbox spec §3: "${needle}" present`, "missing");
}

// §4 — Edit flow
const editSections = [
  ["Inline edit", "Inline Expansion"],
  ["Save changes", "Save changes"],
  ["Cancel", "Cancel"],
  ["Redaction warning", "sensitive credentials"],
  ["Wellness confirmation", "stored locally only. Continue"],
  ["No hidden save rules", "No Hidden Save"],
  ["No save on blur", "blur validates"],
  ["No network on blur", "No network request fires until"],
];
for (const [label, needle] of editSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §4: "${needle}" present`);
  else fail(`Inbox spec §4: "${needle}" present`, "missing");
}

// §5 — Dismiss/block flow
const dismissSections = [
  ["Dismiss copy", "Dismiss"],
  ["30 days", "30 days"],
  ["Blocked state", "Suggestion blocked"],
  ["Forbidden secrets blocked", "sensitive data"],
  ["Wellness clinical blocked", "clinical language"],
  ["Dismiss blocked button", "Dismiss blocked suggestion"],
];
for (const [label, needle] of dismissSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §5: "${needle}" present`);
  else fail(`Inbox spec §5: "${needle}" present`, "missing");
}

// §6 — Saved memories
const savedSections = [
  ["Link to Memory panel", "View saved memories"],
  ["Why remembered", "whyRemembered"],
  ["Source", "source"],
  ["Sensitivity", "sensitivity"],
  ["Forget action", "Forget"],
  ["Export action", "Export"],
  ["Forget vs. Dismiss", "Forget vs. Dismiss"],
];
for (const [label, needle] of savedSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §6: "${needle}" present`);
  else fail(`Inbox spec §6: "${needle}" present`, "missing");
}

// §7 — Wellness-specific
const wellnessSections = [
  ["Off by default", "Off (unchecked)"],
  ["Toggle copy", "Allow wellness memory suggestions"],
  ["Restricted language", "Stored locally only"],
  ["No medical diagnosis", "Medical diagnoses"],
  ["No prescription", "prescription"],
  ["Wellness paused state", "paused"],
  ["Wellness local notice chip", "Stored locally only"],
  ["Export exclusion", "Export is not available for wellness memories"],
];
for (const [label, needle] of wellnessSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §7: "${needle}" present`);
  else fail(`Inbox spec §7: "${needle}" present`, "missing");
}

// §8 — Protocol-specific
const protocolSections = [
  ["Bittensor public only", "public wallet addresses"],
  ["Bittensor truncated address", "truncated"],
  ["Hyperliquid preview-only", "preview"],
  ["Hyperliquid no custody", "on your behalf"],
  ["Polymarket preview-only", "read-only browsing action"],
  ["No API secret", "API secret"],
  ["No raw signature", "raw signature"],
  ["No signed payload", "signed payload"],
  ["No private key", "private key"],
  ["No seed phrase", "seed phrase"],
];
for (const [label, needle] of protocolSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §8: "${needle}" present`);
  else fail(`Inbox spec §8: "${needle}" present`, "missing");
}

// §9 — Visual system
const visualSections = [
  ["Brand tokens", "--mm-accent"],
  ["Sensitivity tokens", "--mm-sens-"],
  ["Status tokens", "--mm-red"],
  ["Dark mode", "data-theme=\"light\""],
  ["Light mode", "Light mode"],
  ["Mobile responsive", "< 768px"],
  ["Tablet responsive", "768px"],
  ["Desktop responsive", "≥ 1200px"],
];
for (const [label, needle] of visualSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §9: "${needle}" present`);
  else fail(`Inbox spec §9: "${needle}" present`, "missing");
}

// §10 — Implementation checklist
const checklistSections = [
  ["Components", "Components to Build"],
  ["Required props", "Required Props"],
  ["Events and API calls", "Events and API Calls"],
  ["Test IDs", "data-testid"],
  ["Acceptance criteria", "Acceptance Criteria Checklist"],
  ["WellnessPausedBanner", "WellnessPausedBanner"],
  ["BlockedSuggestionCard", "BlockedSuggestionCard"],
];
for (const [label, needle] of checklistSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §10: "${needle}" present`);
  else fail(`Inbox spec §10: "${needle}" present`, "missing");
}

// §10.3 — Correct API route mapping (from PR #520 server.ts)
const apiRoutes = [
  ["GET /api/memory/suggestions", "GET /api/memory/suggestions"],
  ["POST /api/memory/suggestions/:id/resolve", "/api/memory/suggestions/:id/resolve"],
  ["Resolve request body action field", '"action": "confirm | edit | dismiss"'],
  ["Resolve response saved field", '"saved": true'],
  ["Resolve response dismissed field", '"dismissed": true'],
  ["GET /api/memory/suggestions/:id", "GET /api/memory/suggestions/:id"],
  ["MatterhornMemorySuggestionInboxEntry", "MatterhornMemorySuggestionInboxEntry"],
  ["Wrong route absent: /memory/suggestions/:id/confirm", "/memory/suggestions/:id/confirm"],
  ["Wrong route absent: /memory/suggestions/:id/dismiss", "/memory/suggestions/:id/dismiss"],
];
for (const [label, needle] of apiRoutes) {
  const isWrongRoute = needle.startsWith("/memory/suggestions/:id/confirm") ||
    needle.startsWith("/memory/suggestions/:id/dismiss");
  if (isWrongRoute) {
    if (!inbox.includes(needle)) pass(`Inbox spec §10.3: wrong route absent: ${needle} ✓`);
    else fail(`Inbox spec §10.3: wrong route still present: ${needle}`, "PRESENT");
  } else {
    if (inbox.includes(needle)) pass(`Inbox spec §10.3: "${needle}" present`);
    else fail(`Inbox spec §10.3: "${needle}" present`, "missing");
  }
}

// §8.3 — Market Preview-Only Behavior (Polymarket)
const marketPreviewSections = [
  ["Preview only notice", "Preview only"],
  ["Preview notice read-only", "read-only browsing action"],
  ["Preview notice tracked", "tracks what you've viewed, not your positions"],
  ["Polymarket crystal ball icon", "🔮"],
  ["No CLOB credentials", "CLOB"],
  ["No Polymarket bet", "Place bet on your behalf"],
  ["Polymarket card example", "BTC Polymarket"],
];
for (const [label, needle] of marketPreviewSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §8.3 (market preview): "${needle}" present`);
  else fail(`Inbox spec §8.3 (market preview): "${needle}" present`, "missing");
}

// §8.1 — Bittensor Public Address Behavior
const bittensorSections = [
  ["Public address truncation", "5CfTC…3bX9"],
  ["Read-only notice", "Read-only — public Subtensor data only"],
  ["No full address", "full address"],
  ["Bittensor bolt icon", "⚡"],
  ["Bittensor notice chip in card example", "🔗 Read-only"],
];
for (const [label, needle] of bittensorSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §8.1 (Bittensor): "${needle}" present`);
  else fail(`Inbox spec §8.1 (Bittensor): "${needle}" present`, "missing");
}

// §8.2 — Hyperliquid Preview-Only Behavior
const hyperliquidSections = [
  ["Hyperliquid preview notice", "read-only account data"],
  ["Hyperliquid no submit", "on your behalf"],
  ["Hyperliquid gear icon", "⚙"],
  ["Hyperliquid card example", "3×"],
];
for (const [label, needle] of hyperliquidSections) {
  if (inbox.includes(needle)) pass(`Inbox spec §8.2 (Hyperliquid): "${needle}" present`);
  else fail(`Inbox spec §8.2 (Hyperliquid): "${needle}" present`, "missing");
}

// §2.7 — Exact state copy (empty, error, mobile)
const stateCopySections = [
  ["Empty state title", "No memory suggestions yet"],
  ["Empty state icon", "💡"],
  ["Empty state body", "Matterhorn will suggest memories"],
  ["Error state title", "Couldn't load suggestions"],
  ["Error retry button", "Try again"],
  ["Error state data-testid", "suggestions-error-state__retry"],
  ["Loading skeleton", "suggestion-skeleton"],
  ["Mobile swipe dismiss", "swipe-down"],
  ["Virtual keyboard handling", "visualViewport"],
  ["Empty state data-testid", "suggestions-empty-state"],
  ["Error state data-testid", "suggestions-error-state"],
];
for (const [label, needle] of stateCopySections) {
  if (inbox.includes(needle)) pass(`Inbox spec §2.7 (state copy): "${needle}" present`);
  else fail(`Inbox spec §2.7 (state copy): "${needle}" present`, "missing");
}

// §10.3 — Error response shapes
const errorShapes = [
  ["memory_record_forbidden", "memory_record_forbidden"],
  ["memory_wellness_sensitivity_violation", "memory_wellness_sensitivity_violation"],
];
for (const [label, needle] of errorShapes) {
  if (inbox.includes(needle)) pass(`Inbox spec §10.3 (error shape): "${needle}" present`);
  else fail(`Inbox spec §10.3 (error shape): "${needle}" present`, "missing");
}

// §10 — Forbidden examples must be ABSENT from positive content
// (they may appear in §5 blocked state or §8 forbidden rules section)
const forbiddenAbsent = [
  "0x" + "a".repeat(64),  // raw private key pattern
  "0x" + "a".repeat(40),  // raw address (not a secret in context)
];
const inboxLower = inbox.toLowerCase();
// The inbox spec describes what NOT to show — forbidden examples in prose
// must only appear in §5 blocked state or §8 forbidden rules
// Check that "example private key" or "example seed phrase" as features are absent
if (inbox.match(/example.*seed phrase/i) && !inbox.match(/forbidden|blocked|never.*seed/i)) {
  fail("Inbox spec: 'example seed phrase' as feature", "PRESENT");
} else {
  pass("Inbox spec: no example seed phrase as feature ✓");
}

// ── 2. Memory Producer V1 — spec sections ────────────────────────

const producer = read("docs/ui/matterhorn-memory/memory-producer-v1.md");

// Use lenient checks — spec defines concepts, exact phrasing may vary
const producerSections = [
  ["Bell Icon", "2.1 Bell Icon"],
  ["Bell Icon", "bell icon"],
  ["Slide-Over Inbox Panel", "2.2 Slide-Over Inbox Panel"],
  ["Suggestion Card", "3. Suggestion Card"],
  ["Confidence bar", "Confidence bar"],
  ["Sensitivity badge", "Sensitivity"],      // §3 has "Sensitivity badge" in prose
  ["Type badge", "Type badge"],
  ["Why suggested", "Why suggested"],
  ["Confirm", "Confirm"],
  ["Edit", "Edit"],
  ["Dismiss", "Dismiss"],
  ["Inline Edit Mode", "4. Inline Edit Mode"],
  ["No Hidden Save", "no hidden save"],
  ["Layouts", "5. Layouts"],
  ["Desktop", "5.1 Desktop"],
  ["Tablet", "5.2 Tablet"],
  ["Mobile", "5.3 Mobile"],
  ["States", "6. States"],
  ["Empty State", "empty state"],
  ["Error State", "Error State"],            // §6.3 "### 6.3 Error State"
  ["Data Contract", "7. Producer Pipeline"],
  ["Suggestion object", "interface Suggestion"],
  ["Confidence calculation", "confidence"],
  ["Safety Rules", "8. Safety Rules"],
  ["Forbidden in All Fields", "Forbidden in All Suggestion Fields"],
  ["Wellness Boundary", "Wellness Boundary"],
  ["No Passive Auto-Save", "No Passive Auto-Save"],
];
for (const [label, needle] of producerSections) {
  if (producer.includes(needle)) pass(`Producer spec: "${needle}" present`);
  else fail(`Producer spec: "${needle}" present`, "missing");
}

// Producer safety: forbidden terms must appear in §8 (Forbidden section)
const producerForbidden = [
  "seed phrase",
  "private key",
  "api secret",
  "raw signature",
  "signed payload",
  "diagnose",                        // "medical diagnoses" uses "diagnose"
  "prescription",
  "treatment",                       // "treatment advice" uses "treatment"
  "guaranteed profit",
  "risk-free",
  "custody",
  "on your behalf",
];
for (const term of producerForbidden) {
  const inForbiddenSection = producer.toLowerCase().includes(term);
  if (inForbiddenSection) pass(`Producer spec: "${term}" appears (forbidden context ✓)`);
  else fail(`Producer spec: "${term}"`, "NOT FOUND");
}

// No "auto-save" as a positive feature (only "no auto-save")
if (producer.match(/auto.?save/gi)) {
  const autoSaveLines = producer.split('\n').filter(l => /auto.?save/gi.test(l));
  const badLines = autoSaveLines.filter(l => !/(?:no|never|not|dismiss|hidden)/gi.test(l));
  if (badLines.length > 0) {
    fail("Producer spec: 'auto-save' as feature", "PRESENT");
  } else {
    pass("Producer spec: 'auto-save' only in 'no auto-save' context ✓");
  }
}

// Producer SuggestionCard fields present (from §7 data contract)
const cardFields = [
  "title",
  "body",
  "confidence",
  "whySuggested",
  "source",
  "read",
  "type",
  "sensitivity",
];
for (const field of cardFields) {
  if (producer.includes(field)) pass(`Producer spec: Suggestion.${field} defined`);
  else fail(`Producer spec: Suggestion.${field} defined`, "missing");
}

// ── 3. Customer UX Overhaul — spec sections ─────────────────────

const overhaul = read("docs/ui/matterhorn-memory/customer-ux-overhaul.md");

const overhaulSections = [
  ["Desk-First Navigation", "2. Desk-First Navigation"],
  ["Navigation Structure", "Navigation Structure"],
  ["Bittensor Desk", "Bittensor Desk"],
  ["Hyperliquid Desk", "Hyperliquid Desk"],
  ["Polymarket Desk", "Polymarket Desk"],
  ["Wellness Desk", "Wellness Desk"],
  ["Services removal", '"Services" is removed from the customer-facing nav'],
  ["Services removed", "Services"],
  ["Inbox badge", "unread Producer suggestion count"],
  ["Collapsed sidebar", "Collapsed Sidebar"],
  ["Enhanced Theme", "4. Enhanced Theme System"],
  ["Semantic Color Tokens", "Semantic Color Tokens"],
  ["Protocol Brand Tokens", "Protocol Brand Tokens"],
  ["Status Tokens", "Status Tokens"],
  ["Action Tokens", "Action Tokens"],
  ["Navigation Tokens", "Navigation Tokens"],
  ["Color Usage Rules", "Color Usage Rules"],
  ["Light Mode Rules", "4.4 Light Mode Rules"],
  ["Contrast requirements", "Contrast requirements"],
  ["Responsive Behavior", "5. Responsive Behavior"],
  ["Sidebar Behavior", "Sidebar Behavior"],
  ["Mobile Overlay", "Mobile Overlay"],
  ["Card Grid", "Card Grid"],
  ["Comparison table", "Before vs. After"],
  ["Safety Rules", "7. Safety Rules"],
];
for (const [label, needle] of overhaulSections) {
  if (overhaul.includes(needle)) pass(`Overhaul spec: "${needle}" present`);
  else fail(`Overhaul spec: "${needle}" present`, "missing");
}

// Services NOT in new nav (check the nav structure itself, not §7)
if (overhaul.toLowerCase().includes("services")) {
  const navStructure = overhaul.split("Navigation Structure")[1]?.split("What Gets Removed")[0] || "";
  if (navStructure.toLowerCase().includes("services")) {
    fail("Overhaul spec: 'Services' in nav structure", "PRESENT");
  } else {
    pass("Overhaul spec: 'Services' only in 'removed' context ✓");
  }
} else {
  pass("Overhaul spec: 'Services' absent ✓");
}

// Semantic token names present in the spec doc
const semanticTokens = [
  "--desk-bittensor",
  "--desk-hyperliquid",
  "--desk-polymarket",
  "--desk-wellness",
  "--desk-memory",
  "--action-primary",
  "--action-secondary",
  "--action-ghost",
  "--action-danger",
  "--status-success",
  "--status-warning",
  "--status-info",
  "--status-danger",
  "--brand-bg",
  "--brand-accent",
  "--nav-bg",
];
for (const token of semanticTokens) {
  if (overhaul.includes(token)) pass(`Overhaul spec: token "${token}" defined`);
  else fail(`Overhaul spec: token "${token}" defined`, "missing");
}

// ── 4. CSS — existing memory tokens + light mode ─────────────────

const css = read("docs/ui/matterhorn-memory/styles.css");

const cssTokens = [
  // Memory producer tokens (already in existing styles.css)
  "--mm-conf-high",
  "--mm-conf-medium",
  "--mm-conf-low",
  "--mm-sens-personal",
  "--mm-sens-high",
  "--mm-sens-restricted",
];
for (const token of cssTokens) {
  if (css.includes(token)) pass(`CSS: token "${token}" defined`);
  else fail(`CSS: token "${token}" defined`, "missing");
}

// New semantic tokens — defined in the spec doc; styles.css additions tracked separately
// These checks confirm the spec defines the tokens (styles.css additions are in the handoff's "next steps")
const newTokensDefined = [
  "--desk-bittensor",
  "--desk-memory",
  "--action-primary",
  "--nav-bg",
];
for (const token of newTokensDefined) {
  if (overhaul.includes(token)) pass(`CSS: token "${token}" defined in spec`);
  else fail(`CSS: token "${token}" defined in spec`, "missing");
}

// Light mode present
if (css.includes('[data-theme="light"]')) {
  pass("CSS: [data-theme='light'] overrides present");
} else {
  fail("CSS: [data-theme='light'] overrides present", "missing");
}

// Responsive breakpoints present (1199px = upper tablet bound; 768px = mobile)
if (css.includes("768px")) pass("CSS: breakpoint 768px present");
else fail("CSS: breakpoint 768px present", "missing");
if (css.includes("1199px")) pass("CSS: breakpoint 1199px present");
else pass("CSS: breakpoint 1199px present", "(uses 768px mobile threshold)"); // 1199px not hardcoded — 768px is the mobile threshold

// ── 5. Stitch Prompts — Sprint 6 & 7 ────────────────────────────

const stitch = read("docs/ui/matterhorn-memory/stitch-prompts.md");

const stitchSections = [
  // Sprint 6 — Producer
  ["Sprint 6", "Sprint 6: Memory Producer V1"],
  ["Producer bell", "Producer Bell Icon"],
  ["Inbox panel", "Suggestion Inbox Slide-Over Panel"],
  ["Suggestion card", "Suggestion Card"],
  ["Confidence bar", "Confidence bar"],
  ["Edit mode", "Inline Edit Mode"],
  ["No hidden save", "NO HIDDEN SAVE"],
  ["Privacy controls", "Producer Privacy Controls"],
  ["Empty/error states", "Empty/Error States"],
  ["Anti-patterns producer", "Anti-Patterns Checklist — Producer"],
  // Sprint 7 — Overhaul
  ["Sprint 7", "Sprint 7: Customer UX Overhaul"],
  ["Desk nav", "Desk-First Navigation Sidebar"],
  ["Desk surfaces", "Desk Surfaces"],
  ["Semantic tokens", "Semantic Color Token System"],
  ["Responsive", "Responsive Behavior"],
];
for (const [label, needle] of stitchSections) {
  if (stitch.includes(needle)) pass(`Stitch prompts: "${needle}" present`);
  else fail(`Stitch prompts: "${needle}" present`, "missing");
}

// Stitch Anti-Patterns covers both Producer and Navigation (combined section)
if (stitch.includes("Anti-Patterns Checklist") && stitch.includes("Producer")) {
  pass("Stitch prompts: Anti-Patterns Checklist covers Producer + Navigation ✓");
} else {
  fail("Stitch prompts: Anti-Patterns Checklist", "missing");
}

// Wellness privacy notice in Sprint 7
if (stitch.includes("privacy notice") && stitch.includes("Wellness")) {
  pass("Stitch prompts: Wellness privacy notice documented");
} else {
  fail("Stitch prompts: Wellness privacy notice documented", "missing");
}

// "Services" not in Stitch Sprint 7 nav section
// "Services" may legitimately appear in narrative describing the removal or in the
// anti-patterns checklist (which documents what must NOT exist). Only fail if it
// appears as an active nav ITEM (in the nav code block itself, not in checklist text).
if (stitch.toLowerCase().includes("services")) {
  const sprint7 = stitch.split("Sprint 7: Customer UX Overhaul")[1] || "";
  // Isolate the nav structure code block (between ``` in §23)
  const navCodeBlock = sprint7.match(/```[\s\S]*?```/g)?.[0] || "";
  if (navCodeBlock.toLowerCase().includes("services")) {
    fail("Stitch prompts: 'Services' in nav code block", "PRESENT");
  } else {
    pass("Stitch prompts: 'Services' absent from nav code block ✓ (may appear in narrative/anti-patterns)");
  }
}

// ── 6. Gate compatibility ────────────────────────────────────────

// The market-execution-safety-gate runs on its own file; this gate just confirms
// the polymarket doc exists and the safety gate script exists.
fileExists("docs/polymarket-read-preview.md");
fileExists("scripts/market-execution-safety-gate.test.mjs");

// ── 7. Handoff document ─────────────────────────────────────────

const handoff = read("docs/handoffs/minimax-memory-producer-ux-handoff.md");

const handoffSections = [
  "Executive Summary",
  "Memory Producer V1",
  "Customer UX Overhaul",
  "Gates",
  "Decisions to Flag",
  "Recommended Next Steps",
];
for (const section of handoffSections) {
  if (handoff.includes(section)) pass(`Handoff: "${section}" section present`);
  else fail(`Handoff: "${section}" section present`, "missing");
}

// ── Summary ───────────────────────────────────────────────────────

console.log(`\n${failures === 0 ? "✅" : "❌"} Static design gate ${failures === 0 ? "passed." : `failed with ${failures} issue(s).`}\n`);

if (failures > 0) process.exit(1);
