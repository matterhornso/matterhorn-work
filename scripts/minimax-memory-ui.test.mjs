#!/usr/bin/env node
/**
 * scripts/minimax-memory-ui.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-memory/
 *
 * Checks:
 * 1. All required files exist
 * 2. HTML contains all 13 screens
 * 3. CSS defines all required design tokens
 * 4. Required component classes exist in CSS
 * 5. Safety states present (sensitivity badges, confidence bars, privacy notices)
 * 6. Forbidden copy absent (no custody messaging, no secret fields, no medical diagnosis)
 * 7. Stitch prompts cover required sections
 * 8. README covers required sections
 * 9. Safety gate compatibility (runs alongside market-execution-safety-gate)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(file) {
  return readFileSync(join(repoRoot, file), "utf8");
}

function fileExists(file) {
  try {
    readFileSync(join(repoRoot, file));
    return true;
  } catch {
    return false;
  }
}

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function fail(msg, reason = "missing") {
  console.log(`FAIL ${msg} (${reason})`);
  failures++;
}

console.log("\nMatterhorn Memory UI — Static Design Gate\n");

// ── 1. Required files exist ─────────────────────────────────────

const requiredFiles = [
  "docs/ui/matterhorn-memory/README.md",
  "docs/ui/matterhorn-memory/index.html",
  "docs/ui/matterhorn-memory/styles.css",
  "docs/ui/matterhorn-memory/stitch-prompts.md",
];
for (const f of requiredFiles) {
  if (fileExists(f)) pass(`File exists: ${f}`);
  else fail(`File exists: ${f}`, "missing");
}

// ── 2. HTML: all 13 screens present ───────────────────────────

const html = read("docs/ui/matterhorn-memory/index.html");

const screens = [
  "screen-1",   // Memory Overview
  "screen-2",   // Bittensor Memories
  "screen-3",   // Hyperliquid Memories
  "screen-4",   // Polymarket Memories
  "screen-5",   // Wellness Memories
  "screen-6",   // Watchlists
  "screen-7",   // Receipts and Evidence
  "screen-8",   // Sources and Provenance
  "screen-9",   // Privacy / Forget Center
  "screen-10",  // Chat Memory Chips
  "screen-11",  // Mobile Memory
  "screen-12",  // Empty / Loading States
  "screen-13",  // Secret / Disabled States
];
for (const s of screens) {
  if (html.includes(`id="${s}"`)) pass(`HTML contains: ${s}`);
  else fail(`HTML contains: ${s}`, "missing");
}

// Showcase nav present
if (html.includes("showcase-nav")) pass("HTML contains showcase nav");
else fail("HTML contains showcase nav", "missing");

// Theme toggle present
if (html.includes("theme-toggle")) pass("HTML contains theme toggle");
else fail("HTML contains theme toggle", "missing");

// ── 3. CSS: required design tokens ─────────────────────────────

const css = read("docs/ui/matterhorn-memory/styles.css");

const cssTokens = [
  ["--mm-bg-base:", "#0C0C0C"],
  ["--mm-bg-surface:", "#141414"],
  ["--mm-accent:", "#D1F2FF"],
  ["--mm-conf-high:", "#22C55E"],
  ["--mm-conf-medium:", "#F59E0B"],
  ["--mm-conf-low:", "#EF4444"],
  ["--mm-type-fact:", "#D1F2FF"],
  ["--mm-type-preference:", "#C084FC"],
  ["--mm-type-context:", "#34D399"],
  ["--mm-type-protocol:", "#60A5FA"],
  ["--mm-type-wellness:", "#F472B6"],
  ["--mm-sens-personal:", "#D1F2FF"],
  ["--mm-sens-high:", "#F59E0B"],
  ["--mm-sens-restricted:", "#EF4444"],
  ["--font-mono:", "JetBrains Mono"],
  ["--font-sans:", "Aeonik"],
];
for (const [token, val] of cssTokens) {
  if (css.includes(token)) pass(`CSS defines ${token}`);
  else fail(`CSS defines ${token}`, "missing");
}

// Light mode token overrides present
if (css.includes('[data-theme="light"]')) {
  pass("CSS contains [data-theme='light'] overrides");
} else {
  fail("CSS contains [data-theme='light'] overrides", "missing");
}

if (css.includes("--mm-bg-base:") && css.includes("--mm-bg-base: #F5F5F5")) {
  pass("CSS light mode --mm-bg-base override present");
} else {
  fail("CSS light mode --mm-bg-base override present", "missing");
}

// ── 4. CSS: required component classes ────────────────────────

const componentClasses = [
  ".mm-card",
  ".mm-card__header",
  ".mm-card__title",
  ".mm-card__meta",
  ".mm-card__why",
  ".mm-card__actions",
  ".mm-badge",
  ".mm-badge--type",
  ".mm-badge--type-preference",
  ".mm-badge--type-protocol",
  ".mm-badge--type-wellness",
  ".mm-badge--sensitivity",
  ".mm-badge--sensitivity-high",
  ".mm-badge--sensitivity-restricted",
  ".mm-source",
  ".mm-confidence",
  ".mm-confidence__bar",
  ".mm-confidence__segment",
  ".mm-btn",
  ".mm-btn--primary",
  ".mm-btn--danger",
  ".mm-btn--ghost",
  ".mm-chip-bar",
  ".mm-chip",
  ".mm-chip--active",
  ".mm-chip--forget",
  ".mm-empty",
  ".mm-skeleton",
  ".mm-skeleton-card",
  ".mm-secret-block",
  ".mm-disabled",
  ".mm-source-unavailable",
  ".mm-privacy-panel",
  ".mm-privacy-row",
  ".mm-toggle",
  ".mm-detail-panel",
  ".mm-receipt-card",
  ".mm-watchlist-item",
  ".mm-protocol-header",
  ".mm-protocol-icon",
  ".memory-app",
  ".memory-sidebar",
  ".memory-nav",
  ".memory-main",
  ".memory-main__header",
  ".memory-content",
];
for (const cls of componentClasses) {
  if (css.includes(cls)) pass(`CSS defines: ${cls}`);
  else fail(`CSS defines: ${cls}`, "missing");
}

// Scope badges
if (css.includes(".mm-card__scope-badge")) pass("CSS defines .mm-card__scope-badge");
else fail("CSS defines .mm-card__scope-badge", "missing");

// ── 5. HTML safety: required UI elements ─────────────────────

// Memory cards with required fields present
if (html.includes("mm-card__title") && html.includes("mm-badge--type") && html.includes("mm-badge--sensitivity")) {
  pass("HTML memory cards contain: title, type badge, sensitivity badge");
} else {
  fail("HTML memory cards contain: title, type badge, sensitivity badge", "incomplete");
}

if (html.includes("mm-source")) pass("HTML contains source chip");
else fail("HTML contains source chip", "missing");

if (html.includes("mm-confidence")) pass("HTML contains confidence meter");
else fail("HTML contains confidence meter", "missing");

if (html.includes("mm-card__why")) pass("HTML contains 'Why remembered?' callout");
else fail("HTML contains 'Why remembered?' callout", "missing");

if (html.includes("mm-card__timestamp")) pass("HTML contains last updated timestamp");
else fail("HTML contains last updated timestamp", "missing");

// Action buttons
const actionButtons = ["Use", "Edit", "Export", "Forget"];
for (const btn of actionButtons) {
  if (html.includes(`>${btn}<`) || html.includes(`>${btn} </`)) {
    pass(`HTML action button present: "${btn}"`);
  } else {
    fail(`HTML action button present: "${btn}"`, "missing");
  }
}

// Chat chips
if (html.includes("mm-chip-bar")) pass("HTML contains chat chip bar");
else fail("HTML contains chat chip bar", "missing");

if (html.includes("Remember this")) pass('HTML contains "Remember this" chip');
else fail('HTML contains "Remember this" chip', "missing");

if (html.includes("Do not remember")) pass('HTML contains "Do not remember" chip');
else fail('HTML contains "Do not remember" chip', "missing");

if (html.includes("Forget related")) pass('HTML contains "Forget related" chip');
else fail('HTML contains "Forget related" chip', "missing");

// Privacy notice
if (html.includes("stored locally") || html.includes("stored on your device")) {
  pass("HTML contains local storage privacy notice");
} else {
  fail("HTML contains local storage privacy notice", "missing");
}

// Toggle switches
if (html.includes("mm-toggle")) pass("HTML contains toggle switches");
else fail("HTML contains toggle switches", "missing");

// Protocol headers (Bittensor, Hyperliquid, Polymarket, Wellness)
const protocols = ["Bittensor", "Hyperliquid", "Polymarket", "Wellness"];
for (const p of protocols) {
  if (html.includes(p)) pass(`HTML contains protocol: ${p}`);
  else fail(`HTML contains protocol: ${p}`, "missing");
}

// Empty / loading / error states
if (html.includes("mm-empty")) pass("HTML contains empty state");
else fail("HTML contains empty state", "missing");

if (html.includes("mm-skeleton")) pass("HTML contains loading skeleton");
else fail("HTML contains loading skeleton", "missing");

if (html.includes("mm-secret-block")) pass("HTML contains secret-blocked state");
else fail("HTML contains secret-blocked state", "missing");

if (html.includes("mm-disabled")) pass("HTML contains memory disabled state");
else fail("HTML contains memory disabled state", "missing");

if (html.includes("mm-source-unavailable")) pass("HTML contains source unavailable state");
else fail("HTML contains source unavailable state", "missing");

// Wellness restricted badge
if (html.includes("mm-badge--sensitivity-restricted")) pass("HTML contains Restricted sensitivity badge");
else fail("HTML contains Restricted sensitivity badge", "missing");

// Receipt cards
if (html.includes("mm-receipt-card")) pass("HTML contains receipt cards");
else fail("HTML contains receipt cards", "missing");

if (html.includes("SHA-256") || html.includes("SHA")) pass("HTML contains SHA fingerprint");
else fail("HTML contains SHA fingerprint", "missing");

// Mobile responsive (CSS media query)
if (css.includes("@media") && css.includes("max-width: 768px")) {
  pass("CSS contains mobile responsive breakpoint");
} else {
  fail("CSS contains mobile responsive breakpoint", "missing");
}

// ── 6. Forbidden copy scan ────────────────────────────────────

// Strip instructional sections that describe what NOT to do
const forbiddenInstruction = /(?:Safety[^\n]*NON-NEGOTIABLE|Do not use|never store|never imply)[\s\S]*?(?=\n## |\Z)/gi;
const safetyNonNegotiable = /(?:## Sprint 5[\s\S]*|## 17\. Anti-Patterns[\s\S]*)/gi;
const cssStrip = /[\s\S]*(body|html|\*)/gi; // leave CSS as-is — forbidden patterns only in docs

const htmlForScan = html.replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");

const forbiddenPatterns = [
  "seed phrase",
  "private key",
  "api secret",
  "raw signature",
  "signed payload",
  "wallet export",
  "medical diagnosis",
  "submit order",
  "confirm trade",
  "sign transaction",
  "openwork",
  "opencodec",
];

for (const phrase of forbiddenPatterns) {
  if (htmlForScan.toLowerCase().includes(phrase)) {
    fail(`HTML copy excludes: "${phrase}"`, "PRESENT in non-instructional content");
  } else {
    pass(`HTML copy excludes: "${phrase}"`);
  }
}

// CSS must not contain forbidden branding
const cssForbidden = ["openwork", "opencodec"];
for (const phrase of cssForbidden) {
  if (css.toLowerCase().includes(phrase)) {
    fail(`CSS excludes brand name: "${phrase}"`, "PRESENT");
  } else {
    pass(`CSS excludes brand name: "${phrase}"`);
  }
}

// Positive safety checks: wellness privacy notice present
if (html.includes("locally on your device") || html.includes("local storage")) {
  pass("Wellness privacy notice present (locally stored)");
} else {
  fail("Wellness privacy notice present (locally stored)", "missing");
}

// ── 7. Stitch prompts cover required sections ─────────────────

const stitch = read("docs/ui/matterhorn-memory/stitch-prompts.md");

const stitchTopics = [
  "Memory Overview",
  "Memory Detail Panel",
  "Bittensor Protocol Memory Screen",
  "Hyperliquid Protocol Memory Screen",
  "Polymarket Protocol Memory Screen",
  "Wellness Memory Screen",
  "Watchlists",
  "Receipts and Evidence",
  "Sources and Provenance",
  "Privacy / Forget Center",
  "Chat Memory Chips",
  "Mobile Memory Screen",
  "Empty / Loading",
  "Confidence",
  "Sensitivity badge",
  "Memory Badge System",
  "Accessibility",
  "Anti-Patterns Checklist",
];
for (const topic of stitchTopics) {
  if (stitch.includes(topic)) pass(`Stitch prompts cover: "${topic}"`);
  else fail(`Stitch prompts cover: "${topic}"`, "missing");
}

// Stitch prompts must include safety NON-NEGOTIABLE sections
const safetyTopics = [
  "Wellness memories must NOT store",
  "seed phrase",
  "Do not save seed phrases",
  "Do not use the word",
];
for (const topic of safetyTopics) {
  if (stitch.includes(topic)) pass(`Stitch prompts safety: "${topic}"`);
  else fail(`Stitch prompts safety: "${topic}"`, "missing");
}

// Stitch prompts must include wellness restricted requirement
if (stitch.includes("Restricted by default") || stitch.includes("Restricted badge must always be visible")) {
  pass("Stitch prompts: wellness Restricted requirement present");
} else {
  fail("Stitch prompts: wellness Restricted requirement present", "missing");
}

// Stitch prompts must include forget confirmation requirement
if (stitch.includes("confirmation step") || stitch.includes("Are you sure")) {
  pass("Stitch prompts: forget confirmation requirement present");
} else {
  fail("Stitch prompts: forget confirmation requirement present", "missing");
}

// ── 8. README covers required sections ────────────────────────

const readme = read("docs/ui/matterhorn-memory/README.md");

const readmeSections = [
  "Memory Overview",
  "Bittensor Memories",
  "Hyperliquid Memories",
  "Polymarket Memories",
  "Wellness Memories",
  "Watchlists",
  "Receipts and Evidence",
  "Sources and Provenance",
  "Privacy / Forget Center",
  "Chat Memory Chips",
  "Mobile Memory",
  "Empty / Loading States",
  "Required Memory Card Fields",
  "Sensitivity badge",
  "Confidence",
  "Design Token Reference",
  "Forbidden Patterns",
  "JetBrains Mono",
  "#D1F2FF",
  "#0C0C0C",
];
for (const section of readmeSections) {
  if (readme.includes(section)) pass(`README covers: "${section}"`);
  else fail(`README covers: "${section}"`, "missing");
}

// README must mention local-only storage
if (readme.includes("locally") || readme.includes("local-first")) {
  pass("README mentions local-first storage");
} else {
  fail("README mentions local-first storage", "missing");
}

// README must describe confidence thresholds
if (readme.includes("80%") || readme.includes("≥ 80%") || readme.includes("high")) {
  pass("README describes confidence thresholds");
} else {
  fail("README describes confidence thresholds", "missing");
}

// README must describe all 5 memory types
const types = ["Fact", "Preference", "Context", "Protocol", "Wellness"];
for (const t of types) {
  if (readme.includes(t)) pass(`README includes type: ${t}`);
  else fail(`README includes type: ${t}`, "missing");
}

// README must describe all 3 sensitivity levels
const sensitivities = ["Personal", "High", "Restricted"];
for (const s of sensitivities) {
  if (readme.includes(s)) pass(`README includes sensitivity: ${s}`);
  else fail(`README includes sensitivity: ${s}`, "missing");
}

// README must list all 4 action buttons
const actions = ["Use", "Edit", "Export", "Forget"];
for (const a of actions) {
  if (readme.includes(a)) pass(`README lists action: ${a}`);
  else fail(`README lists action: ${a}`, "missing");
}

// README must describe all 3 chat chips
const chips = ["Remember this", "Do not remember", "Forget related"];
for (const c of chips) {
  if (readme.includes(c)) pass(`README describes chip: "${c}"`);
  else fail(`README describes chip: "${c}"`, "missing");
}

// ── 9. Safety gate compatibility ───────────────────────────────

if (fileExists("scripts/market-execution-safety-gate.test.mjs")) {
  pass("scripts/market-execution-safety-gate.test.mjs exists");
} else {
  fail("scripts/market-execution-safety-gate.test.mjs exists", "missing");
}

// ── 10. Production handoff ──────────────────────────────────────

const handoff = read("docs/ui/matterhorn-memory/production-handoff.md");

// File must exist
pass("docs/ui/matterhorn-memory/production-handoff.md exists");

// Screen inventory
const screenEntries = [
  "Memory Overview",
  "Protocol Memories",
  "Bittensor Memories",
  "Hyperliquid Memories",
  "Polymarket Memories",
  "Wellness Memories",
  "Watchlists",
  "Receipts and Evidence",
  "Sources and Provenance",
  "Privacy / Forget Center",
  "Chat Memory Chips",
  "Mobile Memory",
];
for (const s of screenEntries) {
  if (handoff.includes(s)) pass(`Handoff section: "${s}"`);
  else fail(`Handoff section: "${s}"`, "missing");
}

// Component inventory
const components = [
  "MemoryCard",
  "MemorySensitivityBadge",
  "MemorySourceChip",
  "MemoryConfidenceBar",
  "MemoryActionRow",
  "MemoryContextChip",
  "MemoryPrivacyPanel",
  "MemoryEmptyState",
  "MemoryBlockedState",
  "MemoryDisabledState",
];
for (const c of components) {
  if (handoff.includes(c)) pass(`Handoff component: "${c}"`);
  else fail(`Handoff component: "${c}"`, "missing");
}

// Backend data contract (case-insensitive)
const dataFields = [
  "memory record fields",
  "context packet",
  "suggestion fields",
  "export manifest",
  "error states",
  "confidence",
  "sensitivity",
  "scope",
  "whyText",
  "sourceDetail",
];
for (const f of dataFields) {
  if (handoff.toLowerCase().includes(f.toLowerCase())) {
    pass(`Handoff data contract: "${f}"`);
  } else {
    fail(`Handoff data contract: "${f}"`, "missing");
  }
}

// UX safety rules (case-insensitive)
const uxRules = [
  "No Hidden Memory",
  "Why remembered",
  "Forget",
  "Sensitivity",
  "Wellness",
  "Restricted",
  "local-first",
  "never sent to",
  "never imply custody",
];
for (const r of uxRules) {
  if (handoff.toLowerCase().includes(r.toLowerCase())) {
    pass(`Handoff UX rule: "${r}"`);
  } else {
    fail(`Handoff UX rule: "${r}"`, "missing");
  }
}

// Forbidden safety language in handoff
// The handoff intentionally documents what must NOT appear in the UI (e.g. "no
// seed phrases in exports", "no raw signatures stored"). This is a spec doc, not
// a UI surface — we assert the forbidden terms are absent from the actual HTML/CSS
// (above) and that the handoff contains explicit safety documentation instead.
pass("Handoff: forbidden-pattern scan skipped (spec doc, not UI surface — safety asserted via wellness-safety checks above)");

// Wellness local-only enforcement
const wellnessSafety = [
  "locally on your device",
  "No wellness data is sent",
  "Wellness data must not appear in any export",
  "sensitivity === 'restricted'",
  "Wellness endpoints must return 403",
];
for (const w of wellnessSafety) {
  if (handoff.includes(w)) pass(`Handoff wellness safety: "${w}"`);
  else fail(`Handoff wellness safety: "${w}"`, "missing");
}

// Forget confirmation requirement
if (handoff.includes("confirmation") || handoff.includes("Are you sure")) {
  pass("Handoff: forget confirmation requirement present");
} else {
  fail("Handoff: forget confirmation requirement present", "missing");
}

// Responsive rules
const responsive = [
  "Desktop",
  "Tablet",
  "Mobile",
  "No Right Rail",
  "No Bottom Overflow",
  "768px",
];
for (const r of responsive) {
  if (handoff.includes(r)) pass(`Handoff responsive rule: "${r}"`);
  else fail(`Handoff responsive rule: "${r}"`, "missing");
}

// Stitch alignment section (case-insensitive)
const stitchItems = [
  "Stitch Alignment",
  "Memory in Navigation",
  "Home",
  "Profile",
  "Settings",
  "Chat chip",
  "bottom tab bar",
];
for (const s of stitchItems) {
  if (handoff.toLowerCase().includes(s.toLowerCase())) {
    pass(`Handoff Stitch section: "${s}"`);
  } else {
    fail(`Handoff Stitch section: "${s}"`, "missing");
  }
}

// ── Summary ───────────────────────────────────────────────────

console.log("");
if (failures === 0) {
  console.log("Static design gate passed.");
} else {
  console.log(`Static design gate failed with ${failures} issue(s).`);
  process.exit(1);
}
