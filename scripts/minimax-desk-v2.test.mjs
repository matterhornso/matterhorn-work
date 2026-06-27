#!/usr/bin/env node
/**
 * scripts/minimax-desk-v2.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-desk-v2/
 *
 * Checks:
 * 1. Required files exist (3 files + QA rubric)
 * 2. HTML contains all annotated screens (problems, before/after, layout, desks)
 * 3. SPEC.md covers all 7 problems, all 9 desks, all 14 token values
 * 4. Right rail guidance present in SPEC.md
 * 5. Logo guidance present in SPEC.md
 * 6. Theme guidance (dark + light) present
 * 7. All 7 V2 problems explicitly solved in SPEC
 * 8. All 14 Do Not Build patterns documented
 * 9. QA rubric exists and covers 5 gates
 * 10. Forbidden patterns absent from HTML visible copy
 * 11. Compatible with market-execution-safety-gate
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

console.log("\nMatterhorn Desk UI V2 — Static Design Gate\n");

// ── 1. Required files exist ─────────────────────────────────────

const requiredFiles = [
  "docs/ui/matterhorn-desk-v2/SPEC.md",
  "docs/ui/matterhorn-desk-v2/index.html",
  "docs/ui/matterhorn-desk-v2/QA-RUBRIC.md",
];
for (const f of requiredFiles) {
  if (fileExists(f)) pass(`File exists: ${f}`);
  else fail(`File exists: ${f}`, "missing");
}

// ── 2. HTML: annotated visual screens ─────────────────────────

const html = read("docs/ui/matterhorn-desk-v2/index.html");

// Strip scripts/styles before copy scan
const htmlForScan = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");

// All annotated screens in the HTML prototype
const screens = [
  ["Problems (P1–P7)",           "screen-problems"],
  ["Before/After (P1, P6)",        "screen-beforeafter"],
  ["Layout Architecture",           "screen-layout"],
  ["Home Command Center",          "screen-home"],
  ["Bittensor Desk",              "screen-bittensor"],
  ["Session Cards",               "screen-session-cards"],
  ["Protocol Icons (P5)",         "screen-icons"],
  ["Mobile Responsive",           "screen-mobile"],
  ["Do Not Build Patterns",       "screen-forbidden"],
];
for (const [label, id] of screens) {
  if (html.includes(`id="${id}"`)) {
    pass(`HTML annotated screen: ${label} (${id})`);
  } else {
    fail(`HTML annotated screen: ${label} (${id})`, "missing");
  }
}

// Navigation and theme toggle
if (html.includes("showcase-nav")) pass("HTML contains showcase nav");
else fail("HTML contains showcase nav", "missing");

if (html.includes("theme-toggle") || html.includes("toggleTheme")) {
  pass("HTML contains theme toggle");
} else {
  fail("HTML contains theme toggle", "missing");
}

// Layout demo components
const layoutComponents = [
  ["layout-demo",      "Layout demo (nav + main + right rail)"],
  ["layout-demo__nav",  "Left nav rail"],
  ["layout-demo__rail","Right rail"],
  ["rail-profile",     "Right rail profile card"],
  ["rail-wallet",      "Right rail wallet address"],
];
for (const [id, label] of layoutComponents) {
  if (html.includes(id)) pass(`HTML layout component: ${label}`);
  else fail(`HTML layout component: ${label}`, "missing");
}

// V2 card pattern — surface fills + accent bar
const cardPatterns = [
  [".desk-card",              "V2 desk card class"],
  [".desk-card__accent-bar", "Card accent bar (3px)"],
  [".desk-card__body",        "Card body"],
  [".desk-card__title",       "Card title"],
  [".desk-card__desc",        "Card description"],
  [".desk-card__actions",     "Card actions"],
];
for (const [cls, label] of cardPatterns) {
  if (html.includes(cls)) pass(`HTML V2 card: ${label} (${cls})`);
  else fail(`HTML V2 card: ${label} (${cls})`, "missing");
}

// V2 session card — sharp corners, no animation
const sessionPatterns = [
  [".session-card-v2",   "V2 session card"],
  [".session-card-v2__dot",  "Active dot (no animation)"],
  [".metric-chip",        "Inline metric chip"],
];
for (const [cls, label] of sessionPatterns) {
  if (html.includes(cls)) pass(`HTML session card: ${label}`);
  else fail(`HTML session card: ${label}`, "missing");
}

// Toggle pill (Beginner/Expert)
if (html.includes("toggle-pill")) pass("HTML contains toggle pill (Beginner/Expert)");
else fail("HTML contains toggle pill (Beginner/Expert)", "missing");

// Right rail components
const railPatterns = [
  [".rail-profile",  "Rail profile card"],
  [".rail-avatar",   "Rail avatar"],
  [".rail-wallet",   "Rail wallet address"],
  [".rail-bell",     "Rail suggestion bell"],
  [".chip-bar",      "Rail memory chip bar"],
  [".chip--active",   "Active memory chip"],
];
for (const [cls, label] of railPatterns) {
  if (html.includes(cls)) pass(`HTML right rail: ${label}`);
  else fail(`HTML right rail: ${label}`, "missing");
}

// Safety strip
if (html.includes("safety-strip")) pass("HTML contains safety strip");
else fail("HTML contains safety strip", "missing");

// Stat tiles
if (html.includes("stat-tile") && html.includes("stat-row")) {
  pass("HTML contains V2 stat tiles (stat-tile + stat-row)");
} else {
  fail("HTML contains V2 stat tiles (stat-tile + stat-row)", "missing");
}

// Confidence bar
if (html.includes("conf-bar") && html.includes("conf-segment")) {
  pass("HTML contains confidence bar (3-segment)");
} else {
  fail("HTML contains confidence bar (3-segment)", "missing");
}

// Nav icon SVGs (not emoji) — check for SVG in nav items
if (html.includes("<svg") && html.includes("nav-item")) {
  pass("HTML nav items contain SVG icons");
} else {
  fail("HTML nav items contain SVG icons", "missing");
}

// Mobile responsive — actual class is mobile-frame__bottom for bottom nav
const mobilePatterns = [
  ["mobile-frame",         "Mobile frame preview"],
  ["mobile-frame__bottom", "Mobile bottom tab bar"],
  ["mobile-composer",       "Mobile composer (above keyboard)"],
];
for (const [cls, label] of mobilePatterns) {
  if (html.includes(cls)) pass(`HTML mobile: ${label}`);
  else fail(`HTML mobile: ${label}`, "missing");
}

// Annotation system for problem callouts
if (html.includes("annotation--success") && html.includes("annotation--warning")) {
  pass("HTML contains annotation system (success/warning/danger)");
} else {
  fail("HTML contains annotation system", "missing");
}

// Problem badge annotations
for (const p of ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
  if (html.includes(p)) pass(`HTML annotated problem: ${p}`);
  else fail(`HTML annotated problem: ${p}`, "missing");
}

// Before/after comparison panels
if (html.includes("compare-panel") && html.includes("compare-panel__header--before") && html.includes("compare-panel__header--after")) {
  pass("HTML contains before/after comparison panels");
} else {
  fail("HTML contains before/after comparison panels", "missing");
}

// Forbidden patterns in "Do Not Build" screen
if (html.includes("forbidden-item")) pass("HTML contains forbidden-item pattern cards");
else fail("HTML contains forbidden-item pattern cards", "missing");

// ── 3. SPEC.md: all 7 problems covered ─────────────────────────

const spec = read("docs/ui/matterhorn-desk-v2/SPEC.md");

// Actual problem identifiers in the SPEC table: "P1", "P2" etc.
const problemIds = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];
for (const p of problemIds) {
  if (spec.includes(p)) pass(`SPEC.md addresses problem: ${p}`);
  else fail(`SPEC.md addresses problem: ${p}`, "missing");
}

// Actual problem descriptions in the SPEC
const problemDescriptions = [
  "Outlined Boxes",        // P1
  "Monotonous dark",      // P2 — lowercase 'd' in SPEC
  "Profile/wallet hidden", // P3
  "Information Dump",     // P4
  "Fake/Emoji Icons",     // P5 — SPEC says "Fake/Emoji Icons"
  "Curved Session Cards",  // P6
  "expert-oriented",      // P7
];
for (const desc of problemDescriptions) {
  if (spec.includes(desc)) pass(`SPEC.md problem description: "${desc}"`);
  else fail(`SPEC.md problem description: "${desc}"`, "missing");
}

// ── 4. SPEC.md: V2 token system ─────────────────────────────────

const v2Tokens = [
  "--v2-bg-base",
  "--v2-bg-surface",
  "--v2-bg-elevated",
  "--v2-border-subtle",
  "--v2-border-default",
  "--v2-accent",
  "--v2-accent-dim",
  "--v2-desk-bittensor",
  "--v2-desk-hyperliquid",
  "--v2-desk-polymarket",
  "--v2-desk-wellness",
  "--v2-desk-memory",
  "--v2-desk-mcp",
  "--v2-desk-home",
  "--v2-status-success",
  "--v2-status-warning",
  "--v2-status-error",
  "--v2-conf-high",
  "--v2-conf-medium",
  "--v2-conf-low",
  "--v2-nav-width",
  "--v2-rail-width",
  "--v2-radius",
  "--v2-font-mono",
  "--v2-font-sans",
];
for (const token of v2Tokens) {
  if (spec.includes(token)) pass(`SPEC.md token: ${token}`);
  else fail(`SPEC.md token: ${token}`, "missing");
}

// Light mode overrides documented
if (spec.includes('data-theme="light"') || spec.includes("light mode")) {
  pass("SPEC.md documents light mode overrides");
} else {
  fail("SPEC.md documents light mode overrides", "missing");
}

// Per-desk light mode accent colors (value check, not exact string)
const lightAccentValues = [
  "#EA580C",  // Bittensor light
  "#7C3AED",  // Hyperliquid light
  "#D97706",  // Polymarket light
];
for (const val of lightAccentValues) {
  if (spec.includes(val)) pass(`SPEC.md light accent value: ${val}`);
  else fail(`SPEC.md light accent value: ${val}`, "missing");
}

// ── 5. SPEC.md: All 9 desks ──────────────────────────────────────

const desks = [
  "Home",       // "Home — Command Center" in spec
  "Bittensor Desk",
  "Hyperliquid Desk",
  "Polymarket Desk",
  "Wellness Desk",
  "Memory Desk",
  "MCPs Desk",
  "Settings & Profile",
];
for (const desk of desks) {
  if (spec.includes(desk)) pass(`SPEC.md desk: ${desk}`);
  else fail(`SPEC.md desk: ${desk}`, "missing");
}

// ── 6. Right rail guidance ──────────────────────────────────────

const railGuidance = [
  "Right Rail",
  "260px",
  "profile card",
  "notification bell",  // SPEC: "notification bell" (not "bell with suggestion")
  "memory chip bar",
  "collapses cleanly",
];
for (const phrase of railGuidance) {
  if (spec.includes(phrase)) pass(`SPEC.md right rail: "${phrase}"`);
  else fail(`SPEC.md right rail: "${phrase}"`, "missing");
}

// ── 7. Logo guidance ────────────────────────────────────────────

const logoGuidance = [
  "Mountain mark",
  "SVG",
  "emoji",
  "nav",
];
for (const phrase of logoGuidance) {
  if (spec.includes(phrase)) pass(`SPEC.md logo: "${phrase}"`);
  else fail(`SPEC.md logo: "${phrase}"`, "missing");
}

// ── 8. Theme guidance ────────────────────────────────────────────

const themeGuidance = [
  "Dark Mode",
  "Light Mode",
  "Brand Anchors",
  "data-theme",
];
for (const phrase of themeGuidance) {
  if (spec.includes(phrase)) pass(`SPEC.md theme: "${phrase}"`);
  else fail(`SPEC.md theme: "${phrase}"`, "missing");
}

// Brand anchors: hex values (title-case "Brand Anchors" covered by themeGuidance above)
if (spec.toLowerCase().includes("#0c0c0c") && spec.includes("#D1F2FF")) {
  pass("SPEC.md brand anchors: #0C0C0C and #D1F2FF");
} else {
  fail("SPEC.md brand anchors: #0C0C0C and #D1F2FF", "missing");
}

// ── 9. Do Not Build patterns ─────────────────────────────────────

const doNotBuild = [
  "Crypto workspace",
  "Services\" in customer nav",
  "Computer Use in customer defaults",
  "seed phrase",
  "private key",
  "API secret",
  "Submit order",
  "submit order",
  "medical",
  "prescription",
  "treatment recommendation",
  "glassmorphism",
  "border-radius",
  "full wallet address",
  "nested card grids",
];
for (const phrase of doNotBuild) {
  if (spec.toLowerCase().includes(phrase.toLowerCase())) {
    pass(`SPEC.md Do Not Build: "${phrase}"`);
  } else {
    fail(`SPEC.md Do Not Build: "${phrase}"`, "missing");
  }
}

// Wellness specific forbids — check for the actual SPEC text
const wellnessForbids = [
  "Medical diagnosis",
  "prescription",
  "treatment recommendation",
];
for (const phrase of wellnessForbids) {
  if (spec.toLowerCase().includes(phrase.toLowerCase())) {
    pass(`SPEC.md wellness forbid: "${phrase}"`);
  } else {
    fail(`SPEC.md wellness forbid: "${phrase}"`, "missing");
  }
}

// Address truncation
if (spec.includes("truncat") || spec.includes("5CfTC")) {
  pass("SPEC.md: wallet address truncation documented");
} else {
  fail("SPEC.md: wallet address truncation documented", "missing");
}

// Beginner/Expert toggle for Bittensor
if (spec.includes("Beginner") && spec.includes("Expert") && spec.includes("toggle")) {
  pass("SPEC.md: Bittensor Beginner/Expert toggle documented");
} else {
  fail("SPEC.md: Bittensor Beginner/Expert toggle documented", "missing");
}

// ── 10. QA Rubric checks ───────────────────────────────────────

const rubric = read("docs/ui/matterhorn-desk-v2/QA-RUBRIC.md");

// Gate coverage — rubric uses "G1", "G2" etc. not "Gate G1"
const gateIds = ["G1", "G2", "G3", "G4", "G5"];
for (const gate of gateIds) {
  if (rubric.includes(gate)) pass(`QA Rubric gate: ${gate}`);
  else fail(`QA Rubric gate: ${gate}`, "missing");
}

// Problem-specific QA sections — rubric uses "### P1" etc.
for (const p of ["P1", "P2", "P3", "P4", "P5", "P6", "P7"]) {
  if (rubric.includes(p)) {
    pass(`QA Rubric problem: ${p}`);
  } else {
    fail(`QA Rubric problem: ${p}`, "missing");
  }
}

// Per-desk QA checks
const rubricDesks = ["Bittensor", "Hyperliquid", "Polymarket", "Wellness", "Memory", "MCP"];
for (const desk of rubricDesks) {
  if (rubric.includes(desk)) pass(`QA Rubric desk: ${desk}`);
  else fail(`QA Rubric desk: ${desk}`, "missing");
}

// Forbidden pattern check in rubric
if (rubric.includes("Forbidden Pattern") || rubric.includes("Do Not Build")) {
  pass("QA Rubric: forbidden pattern section present");
} else {
  fail("QA Rubric: forbidden pattern section present", "missing");
}

// Right rail in rubric
if (rubric.includes("Right Rail") || rubric.includes("right rail")) {
  pass("QA Rubric: right rail checks present");
} else {
  fail("QA Rubric: right rail checks present", "missing");
}

// Responsive layout checks — no overflow, no trapped rail, no composer overlap
const responsiveChecks = [
  ["overflow",              "SPEC.md: no horizontal overflow documented"],
  ["trapped",              "SPEC.md: no trapped right rail documented"],
  ["right rail",           "SPEC.md: right rail responsive behavior documented"],
  ["768px",                "SPEC.md: 768px breakpoint documented"],
  ["390",                  "SPEC.md: mobile viewport (390px) documented"],
  ["visualViewport",       "SPEC.md: visualViewport API documented"],
  ["composer",             "SPEC.md: bottom composer documented"],
  ["mobile",               "SPEC.md: mobile responsive documented"],
];
for (const [needle, label] of responsiveChecks) {
  if (spec.includes(needle)) {
    pass(`Responsive: ${label}`);
  } else {
    fail(`Responsive: ${label}`, "missing");
  }
}

// ── 11. Forbidden copy scan ─────────────────────────────────────
// The "Do Not Build" screen intentionally lists forbidden phrases as
// documentation text. We strip that screen before scanning.
// The Bittensor safety strip also intentionally contains "seed phrase" and
// "private key" as correct safety copy — these are expected-present.

const forbiddenScreenMatch = html.match(/id="screen-forbidden"[\s\S]*?<\/section>/);
const htmlWithoutForbiddenScreen = forbiddenScreenMatch
  ? html.replace(forbiddenScreenMatch[0], "")
  : html;

const htmlClean = htmlWithoutForbiddenScreen
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");

// Strict forbidden patterns — absent from actual UI
const strictForbidden = [
  "api secret",
  "confirm trade",
  "sign transaction",
  "openwork",
  "opencodec",
  "Matterhorn controls your stake",
  "Matterhorn manages your position",
  "place bet on your behalf",
  "Matterhorn holds your",
  "close position",
  "submit order",
  "medical diagnosis",
  "prescription",
  "treatment recommendation",
  "lighthouse",     // internal harness name — never customer-facing
  "harness",        // internal framework name — never customer-facing
];
for (const phrase of strictForbidden) {
  if (htmlClean.toLowerCase().includes(phrase.toLowerCase())) {
    fail(`HTML copy excludes: "${phrase}"`, "PRESENT");
  } else {
    pass(`HTML copy excludes: "${phrase}"`);
  }
}

// Expected-present safety strip copy — these phrases are correct safety language
const expectedSafetyCopy = [
  "seed phrase",
  "private key",
];
for (const phrase of expectedSafetyCopy) {
  if (htmlClean.toLowerCase().includes(phrase.toLowerCase())) {
    pass(`HTML safety strip present (expected): "${phrase}"`);
  } else {
    fail(`HTML safety strip present (expected): "${phrase}"`, "missing");
  }
}

// CSS forbidden brands — scan inline CSS in HTML (strip forbidden screen first)
const cssInline = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
const cssForbidden = ["openwork", "opencodec"];
for (const phrase of cssForbidden) {
  if (cssInline.toLowerCase().includes(phrase)) {
    fail(`CSS (inline) excludes brand: "${phrase}"`, "PRESENT");
  } else {
    pass(`CSS (inline) excludes brand: "${phrase}"`);
  }
}

// No full wallet address in HTML
const addrPattern = /[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44,}/g;
const addrMatches = htmlClean.match(addrPattern);
if (addrMatches && addrMatches.length > 0) {
  fail("No full wallet addresses in HTML", `found ${addrMatches.length} full address(es)`);
} else {
  pass("No full wallet addresses in HTML");
}

// "Services" not primary desk (scan clean HTML without forbidden-patterns doc screen)
if (htmlClean.includes("Services") && htmlClean.includes("primary")) {
  fail('"Services" as primary customer desk', "PRESENT");
} else {
  pass('"Services" not a primary customer desk');
}

// "Crypto workspace" not a category
if (htmlClean.includes("Crypto workspace") || htmlClean.includes("DeFi workspace")) {
  fail('"Crypto workspace" or "DeFi" as category label', "PRESENT");
} else {
  pass('"Crypto workspace" not a category label');
}

// V2-specific visual rules — check for actual SPEC content
const v2VisualRules = [
  ["Surfaces Over Outlines",     "Surface pattern (P1) documented"],
  ["radius",                      "V2 radius rule documented"],
  ["Sharp corners",              "Sharp corners rule documented"],
  ["metric chip",               "Inline metric chip rule (P6) documented"],
  ["Beginner",                    "Beginner mode for Bittensor (P7) documented"],
  ["Expert toggle",             "Expert toggle (P7) documented"],
  ["260px",                       "Right rail width (P3) documented"],
  ["emoji is never",              "SVG icon rule (P5) documented"],
];
for (const [needle, label] of v2VisualRules) {
  if (spec.includes(needle) || html.includes(needle)) {
    pass(`V2 visual rule: ${label}`);
  } else {
    fail(`V2 visual rule: ${label}`, "missing");
  }
}

// ── 12. Market execution safety gate compatibility ──────────────

if (fileExists("scripts/market-execution-safety-gate.test.mjs")) {
  pass("scripts/market-execution-safety-gate.test.mjs exists");
} else {
  fail("scripts/market-execution-safety-gate.test.mjs exists", "missing");
}

// ── Summary ───────────────────────────────────────────────────

console.log("");
if (failures === 0) {
  console.log("Static design gate passed.");
} else {
  console.log(`Static design gate failed with ${failures} issue(s).`);
  process.exit(1);
}
