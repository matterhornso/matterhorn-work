#!/usr/bin/env node
/**
 * scripts/minimax-app-shell-v2.test.mjs
 *
 * Static design gate for docs/ui/app-shell-v2/
 *
 * Checks:
 * 1. All required files exist (SPEC, HTML, QA-RUBRIC)
 * 2. HTML: annotated screens for all desks + shell layout
 * 3. SPEC.md: App Shell V2 criteria covered
 * 4. Right rail checklist in SPEC
 * 5. Dark/light theme criteria
 * 6. Responsive state criteria
 * 7. Forbidden patterns absent from HTML
 * 8. QA Rubric covers all gates and desks
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

console.log("\nMatterhorn App Shell V2 — Static Design Gate\n");

// ── 1. Required files exist ─────────────────────────────────────

const requiredFiles = [
  "docs/ui/app-shell-v2/SPEC.md",
  "docs/ui/app-shell-v2/index.html",
  "docs/ui/app-shell-v2/QA-RUBRIC.md",
];
for (const f of requiredFiles) {
  try {
    readFileSync(join(repoRoot, f));
    pass(`File exists: ${f}`);
  } catch {
    fail(`File exists: ${f}`, "missing");
  }
}

// ── 2. HTML: annotated visual screens ─────────────────────────

const html = read("docs/ui/app-shell-v2/index.html");

const screens = [
  ["Shell Layout",           "screen-shell"],
  ["Home",                   "screen-home"],
  ["Bittensor",              "screen-bittensor"],
  ["Hyperliquid",            "screen-hyperliquid"],
  ["Polymarket",             "screen-polymarket"],
  ["Wellness",               "screen-wellness"],
  ["Memory",                 "screen-memory"],
  ["MCPs",                   "screen-mcps"],
  ["Before/After",          "screen-beforeafter"],
  ["Mobile",                 "screen-mobile"],
  ["States",                 "screen-states"],
];
for (const [label, id] of screens) {
  if (html.includes(`id="${id}"`)) {
    pass(`HTML screen: ${label} (${id})`);
  } else {
    fail(`HTML screen: ${label} (${id})`, "missing");
  }
}

// Shell layout components
const shellComponents = [
  [".shell",              "Layout shell (3-column)"],
  [".nav",               "Left nav rail"],
  [".rail",              "Right rail"],
  [".rprof",             "Rail profile card"],
  [".rwallet",           "Rail wallet address with copy"],
  [".rstats",            "Rail quick stats (2×2)"],
  [".rbell",             "Rail bell with badge"],
  [".cbar",              "Memory chip bar"],
  [".chip--a",           "Active memory chip"],
];
for (const [cls, label] of shellComponents) {
  if (html.includes(cls)) {
    pass(`HTML shell: ${label}`);
  } else {
    fail(`HTML shell: ${label}`, "missing");
  }
}

// Nav rail
if (html.includes(".nav__mark") || html.includes("nav__mark")) {
  pass("HTML nav: Mountain mark SVG logo");
} else {
  fail("HTML nav: Mountain mark SVG logo", "missing");
}

if (html.includes(".ni__tip")) {
  pass("HTML nav: tooltip on hover");
} else {
  fail("HTML nav: tooltip on hover", "missing");
}

// Right rail FAB for tablet
if (html.includes(".tfab")) {
  pass("HTML tablet: FAB for right rail toggle");
} else {
  fail("HTML tablet: FAB for right rail toggle", "missing");
}

// Mobile shell
if (html.includes(".mshell")) {
  pass("HTML mobile: mobile shell");
} else {
  fail("HTML mobile: mobile shell", "missing");
}

if (html.includes(".mtop")) {
  pass("HTML mobile: top bar with avatar");
} else {
  fail("HTML mobile: top bar with avatar", "missing");
}

if (html.includes(".mbtm")) {
  pass("HTML mobile: bottom tab bar");
} else {
  fail("HTML mobile: bottom tab bar", "missing");
}

if (html.includes(".mcomp")) {
  pass("HTML mobile: composer above keyboard");
} else {
  fail("HTML mobile: composer above keyboard", "missing");
}

// Theme toggle
if (html.includes("data-theme")) {
  pass("HTML: data-theme toggle (light/dark)");
} else {
  fail("HTML: data-theme toggle", "missing");
}

// Safety strips
const safetyStrips = [
  ["screen-bittensor",     "Read-only. Public Subtensor"],
  ["screen-hyperliquid",    "Preview only. Read-only"],
  ["screen-polymarket",     "Preview only. Read-only browsing"],
  ["screen-wellness",       "Stored locally only"],
  ["screen-mcps",          "MCP tools run locally"],
];
for (const [screen, text] of safetyStrips) {
  const screenMatch = html.match(new RegExp(`id="${screen}"[\\s\\S]*?id="screen-[\\w-]+"`));
  if (screenMatch && screenMatch[0].includes(text)) {
    pass(`HTML safety strip: ${screen} contains "${text.substring(0, 30)}"`);
  } else {
    fail(`HTML safety strip: ${screen} contains "${text.substring(0, 30)}"`, "missing");
  }
}

// V2 card pattern
const cardPatterns = [
  [".dcard",          "V2 desk card class"],
  [".dcard__bar",     "Card accent bar (3px)"],
  [".dcard__title",   "Card title"],
  [".dcard__desc",    "Card description"],
  [".dcard__a",       "Card actions"],
];
for (const [cls, label] of cardPatterns) {
  if (html.includes(cls)) {
    pass(`HTML V2 card: ${label}`);
  } else {
    fail(`HTML V2 card: ${label}`, "missing");
  }
}

// Session cards
const sessionPatterns = [
  [".sc",               "Session card"],
  [".sc__dot",          "Active dot (no animation)"],
  [".sc__chips",        "Session inline metric chips"],
];
for (const [cls, label] of sessionPatterns) {
  if (html.includes(cls)) {
    pass(`HTML session: ${label}`);
  } else {
    fail(`HTML session: ${label}`, "missing");
  }
}

// Toggle pill (Beginner/Expert)
if (html.includes(".tpill")) {
  pass("HTML contains toggle pill (Beginner/Expert)");
} else {
  fail("HTML contains toggle pill", "missing");
}

// Confidence bar
if (html.includes(".cbar2")) {
  pass("HTML contains confidence bar (3-segment)");
} else {
  fail("HTML contains confidence bar", "missing");
}

// Before/after comparison panels
if (html.includes(".cpanel")) {
  pass("HTML contains before/after comparison panels");
} else {
  fail("HTML contains before/after comparison panels", "missing");
}

// Annotation system
if (html.includes("ann--s") && html.includes("ann--w")) {
  pass("HTML contains annotation system (success/warning)");
} else {
  fail("HTML contains annotation system", "missing");
}

// Wellness: toggle + local badge
if (html.includes(".wtoggle") && html.includes(".tsw")) {
  pass("HTML wellness: toggle switch");
} else {
  fail("HTML wellness: toggle switch", "missing");
}

if (html.includes(".lbadge")) {
  pass("HTML wellness: local-only badge");
} else {
  fail("HTML wellness: local-only badge", "missing");
}

// Memory: chip bar in rail + forget button
if (html.includes(".cbar") && html.includes(".chip--a")) {
  pass("HTML memory: chip bar with active chip");
} else {
  fail("HTML memory: chip bar with active chip", "missing");
}

if (html.includes(".bt-fgt") || html.includes("Forget")) {
  pass("HTML memory: forget button");
} else {
  fail("HTML memory: forget button", "missing");
}

// Position tiles (Hyperliquid)
if (html.includes(".ptile")) {
  pass("HTML hyperliquid: position tiles");
} else {
  fail("HTML hyperliquid: position tiles", "missing");
}

// Loading/empty/degraded states
const stateScreens = [
  ["screen-states",     "load"],
  ["screen-states",     "spin"],
  ["screen-states",     "empty"],
];
for (const [screen, needle] of stateScreens) {
  const screenMatch = html.match(new RegExp(`id="${screen}"[\\s\\S]*?(?:id="screen-[\\w-]+"|$)`));
  if (screenMatch && screenMatch[0].includes(needle)) {
    pass(`HTML state: ${needle} in ${screen}`);
  } else {
    fail(`HTML state: ${needle} in ${screen}`, "missing");
  }
}

// ── 3. SPEC.md: App Shell V2 coverage ──────────────────────────

const spec = read("docs/ui/app-shell-v2/SPEC.md");

// App Shell V2 layout sections
const shellSections = [
  "3-column",
  "56px",
  "260px",
  "Right Rail",
  "Left Navigation",
  "Top Bar",
  "Bottom Tab",
  "Composer",
];
for (const s of shellSections) {
  if (spec.includes(s)) {
    pass(`SPEC.md shell section: "${s}"`);
  } else {
    fail(`SPEC.md shell section: "${s}"`, "missing");
  }
}

// All 7 desks in SPEC
const specDesks = [
  "Home",
  "Bittensor",
  "Hyperliquid",
  "Polymarket",
  "Wellness",
  "Memory",
  "MCPs",
];
for (const d of specDesks) {
  if (spec.includes(d)) {
    pass(`SPEC.md desk: "${d}"`);
  } else {
    fail(`SPEC.md desk: "${d}"`, "missing");
  }
}

// Token system
const specTokens = [
  "--v2-bg-base",
  "--v2-bg-surface",
  "--v2-bg-elevated",
  "--v2-border-subtle",
  "--v2-accent",
  "--v2-desk-bittensor",
  "--v2-desk-hyperliquid",
  "--v2-desk-polymarket",
  "--v2-desk-wellness",
  "--v2-desk-memory",
  "--v2-desk-mcp",
  "--v2-radius",
  "--v2-font-mono",
];
for (const t of specTokens) {
  if (spec.includes(t)) {
    pass(`SPEC.md token: ${t}`);
  } else {
    fail(`SPEC.md token: ${t}`, "missing");
  }
}

// Right rail checklist items
const railItems = [
  "Profile card",
  "truncated",
  "copy",
  "Bell",
  "chip bar",
  "FAB",
  "tablet",
  "mobile",
];
for (const item of railItems) {
  if (spec.includes(item)) {
    pass(`SPEC.md right rail: "${item}"`);
  } else {
    fail(`SPEC.md right rail: "${item}"`, "missing");
  }
}

// Theme coverage
const themeItems = [
  "Dark Mode",
  "Light Mode",
  "#0C0C0C",
  "#D1F2FF",
  "data-theme",
  "contrast ratio",
  "focus-visible",
];
for (const item of themeItems) {
  if (spec.includes(item)) {
    pass(`SPEC.md theme: "${item}"`);
  } else {
    fail(`SPEC.md theme: "${item}"`, "missing");
  }
}

// Responsive items
const responsiveItems = [
  "768",
  "1200px",
  "390",
  "1-column",
  "2-column",
  "3-column",
  "visualViewport",
];
for (const item of responsiveItems) {
  if (spec.includes(item)) {
    pass(`SPEC.md responsive: "${item}"`);
  } else {
    fail(`SPEC.md responsive: "${item}"`, "missing");
  }
}

// Forbidden patterns in SPEC
const specForbidden = [
  "Crypto workspace",
  "Services\"",
  "seed phrase",
  "private key",
  "submit order",
  "sign transaction",
  "glassmorphism",
  "border-radius",
  "backdrop-filter",
  "nested card",
];
for (const phrase of specForbidden) {
  if (spec.includes(phrase)) {
    pass(`SPEC.md forbids: "${phrase}"`);
  } else {
    fail(`SPEC.md forbids: "${phrase}"`, "missing");
  }
}

// Boxiness fix
const boxinessItems = [
  "surface fill",
  "Sharp corners",
  "border-radius",
  "accent bar",
];
for (const item of boxinessItems) {
  if (spec.includes(item)) {
    pass(`SPEC.md boxiness: "${item}"`);
  } else {
    fail(`SPEC.md boxiness: "${item}"`, "missing");
  }
}

// ── 4. QA Rubric checks ───────────────────────────────────────

const rubric = read("docs/ui/app-shell-v2/QA-RUBRIC.md");

const rubricGates = ["S1", "S2", "S3", "S4", "S5"];
for (const gate of rubricGates) {
  if (rubric.includes(gate)) {
    pass(`QA Rubric gate: ${gate}`);
  } else {
    fail(`QA Rubric gate: ${gate}`, "missing");
  }
}

const rubricDesks = ["Home", "Bittensor", "Hyperliquid", "Polymarket", "Wellness", "Memory", "MCPs"];
for (const d of rubricDesks) {
  if (rubric.includes(d)) {
    pass(`QA Rubric desk: ${d}`);
  } else {
    fail(`QA Rubric desk: ${d}`, "missing");
  }
}

if (rubric.includes("Forbidden") || rubric.includes("forbidden")) {
  pass("QA Rubric: forbidden pattern section");
} else {
  fail("QA Rubric: forbidden pattern section", "missing");
}

// ── 5. Forbidden copy scan ─────────────────────────────────────

// Strip screen-forbidden and screen-beforeafter before scanning (they intentionally contain forbidden text)
const htmlForScan = html
  .replace(/id="screen-forbidden"[\s\S]*?<\/section>/gi, "")
  .replace(/id="screen-beforeafter"[\s\S]*?<\/section>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");

// Forbidden in actual UI (not the doc screens)
const uiForbidden = [
  "submit order",
  "sign transaction",
  "close position",
  "place bet on your behalf",
  "confirm trade",
  "matterhorn controls your stake",
  "matterhorn manages your position",
  "matterhorn holds or manages your",
  "mint now",
  "hire agent",
  "api secret",
  "medical diagnosis",
  "prescription",
  "treatment recommendation",
  "openwork",
  "opencodec",
];
for (const phrase of uiForbidden) {
  if (htmlForScan.toLowerCase().includes(phrase.toLowerCase())) {
    fail(`HTML UI forbids: "${phrase}"`, "PRESENT");
  } else {
    pass(`HTML UI forbids: "${phrase}"`);
  }
}

// Expected: seed phrase and private key appear in safety strip (correct usage)
const safetyPhrases = ["seed phrase", "private key"];
for (const phrase of safetyPhrases) {
  if (htmlForScan.toLowerCase().includes(phrase.toLowerCase())) {
    pass(`HTML safety strip (expected): "${phrase}"`);
  } else {
    fail(`HTML safety strip (expected): "${phrase}"`, "missing");
  }
}

// CSS scan for brand
const cssInline = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || "";
const brandInCss = ["openwork", "opencodec"];
for (const brand of brandInCss) {
  if (cssInline.toLowerCase().includes(brand)) {
    fail(`CSS excludes brand: "${brand}"`, "PRESENT");
  } else {
    pass(`CSS excludes brand: "${brand}"`);
  }
}

// Services and Crypto workspace not as primary desks
if (htmlForScan.includes("Services") && htmlForScan.includes("primary")) {
  fail('"Services" as primary customer desk', "PRESENT");
} else {
  pass('"Services" not a primary customer desk');
}

if (htmlForScan.includes("Crypto workspace") || htmlForScan.includes("DeFi workspace")) {
  fail('"Crypto workspace" as category', "PRESENT");
} else {
  pass('"Crypto workspace" not a category label');
}

// No full wallet address (44+ char SS58 or 0x + 40 hex)
const fullAddr = /0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{44,}/g;
const addrMatches = htmlForScan.match(fullAddr);
if (addrMatches && addrMatches.length > 0) {
  fail("No full wallet addresses in HTML", `found ${addrMatches.length}`);
} else {
  pass("No full wallet addresses in HTML");
}

// ── Summary ───────────────────────────────────────────────────

console.log("");
if (failures === 0) {
  console.log("Static design gate passed.");
} else {
  console.log(`Static design gate failed with ${failures} issue(s).`);
  process.exit(1);
}
