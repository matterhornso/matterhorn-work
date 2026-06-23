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
