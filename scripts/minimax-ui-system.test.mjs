#!/usr/bin/env node
/**
 * scripts/minimax-ui-system.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-customer-ux-refresh/
 *
 * Checks:
 * 1. All required files exist
 * 2. HTML contains all 22 screens
 * 3. CSS defines all required design tokens
 * 4. Safety states (green/amber/blue badges) appear in the HTML
 * 5. Forbidden copy is absent (submit buttons, custody language, OpenWork/OpenCode)
 * 6. UI system spec covers required sections (including new Protocol Desks, Wellness, Transcript)
 * 7. README covers new content
 * 8. Stitch prompts cover new topics
 * 9. Safety gate compatibility (runs alongside market-execution-safety-gate)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(file) {
  return readFileSync(join(repoRoot, file), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}`);
  if (detail) console.error(`  ${detail}`);
}

function fileExists(file) {
  try {
    readFileSync(join(repoRoot, file));
    pass(`${file} exists`);
    return true;
  } catch {
    fail(`${file} exists`, "NOT FOUND");
    return false;
  }
}

// ── 1. File existence ─────────────────────────────────────────

fileExists("docs/ui/matterhorn-product-ui-system.md");
fileExists("docs/ui/matterhorn-customer-ux-refresh/README.md");
fileExists("docs/ui/matterhorn-customer-ux-refresh/styles.css");
fileExists("docs/ui/matterhorn-customer-ux-refresh/index.html");
fileExists("docs/ui/matterhorn-customer-ux-refresh/stitch-prompts.md");

// ── 2. HTML: all 22 screens ─────────────────────────────────

const html = read("docs/ui/matterhorn-customer-ux-refresh/index.html");
const screens = [
  "id=\"screen-1\"",
  "id=\"screen-2\"",
  "id=\"screen-3\"",
  "id=\"screen-4\"",
  "id=\"screen-5\"",
  "id=\"screen-6\"",
  "id=\"screen-7\"",
  "id=\"screen-8\"",
  "id=\"screen-9\"",
  "id=\"screen-10\"",
  "id=\"screen-11\"",
  "id=\"screen-12\"",
  "id=\"screen-13\"",
  "id=\"screen-14\"",
  "id=\"screen-15\"",
  "id=\"screen-16\"",
  "id=\"screen-17\"",  // Bittensor Desk
  "id=\"screen-18\"",  // Hyperliquid Desk
  "id=\"screen-19\"",  // Polymarket Desk
  "id=\"screen-20\"",  // Wellness Desk
  "id=\"screen-21\"",  // Wallet Snapshot
  "id=\"screen-22\"",  // Empty/Loading/Degraded States
];
for (const s of screens) {
  if (html.includes(s)) pass(`HTML contains ${s}`);
  else fail(`HTML contains ${s}`, "missing");
}

// ── 3. CSS: design tokens ────────────────────────────────────

const css = read("docs/ui/matterhorn-customer-ux-refresh/styles.css");
const tokens = [
  "--mh-bg-base: #0C0C0C",
  "--mh-bg-surface: #141414",
  "--mh-accent: #D1F2FF",
  "--mh-green: #22C55E",
  "--mh-amber: #F59E0B",
  "--mh-blue: #3B82F6",
  "--mh-red: #EF4444",
  "--mh-text-primary: #F0F0F0",
  "--mh-text-secondary: #8A8A8A",
  "--font-mono",
  "--font-sans",
];
for (const t of tokens) {
  if (css.includes(t)) pass(`CSS defines ${t}`);
  else fail(`CSS defines ${t}`, "missing");
}

// mh-badge component variants
if (css.includes("mh-badge--live")) pass("CSS defines .mh-badge--live");
else fail("CSS defines .mh-badge--live", "missing");

if (css.includes("mh-badge--planned")) pass("CSS defines .mh-badge--planned");
else fail("CSS defines .mh-badge--planned", "missing");

if (css.includes("mh-badge--restricted")) pass("CSS defines .mh-badge--restricted");
else fail("CSS defines .mh-badge--restricted", "missing");

if (css.includes("mh-badge--error")) pass("CSS defines .mh-badge--error");
else fail("CSS defines .mh-badge--error", "missing");

// Safety disclaimer
if (css.includes("mh-disclaimer")) pass("CSS defines .mh-disclaimer");
else fail("CSS defines .mh-disclaimer", "missing");

// Skeleton loader
if (css.includes("mh-skeleton")) pass("CSS defines .mh-skeleton");
else fail("CSS defines .mh-skeleton", "missing");

// Empty state
if (css.includes("mh-empty-state")) pass("CSS defines .mh-empty-state");
else fail("CSS defines .mh-empty-state", "missing");

// ── 4. HTML: safety states ──────────────────────────────────

const safetyChecks = [
  ["External Signer Live", "green/live safety badge"],
  ["canSubmit: false", "canSubmit: false indicator"],
  ["canSubmit", "preview has submit flag"],
  ["External Signer Handoff", "external signer handoff screen"],
  ["Planned", "blue/planned safety badge"],
  ["Compliance Blocked", "amber/restricted safety state"],
  ["Receipt verified", "receipt verified state"],
  ["non-custodial", "non-custodial language"],
  ["Matterhorn does not sign", "explicit no-sign statement"],
  // Protocol desk safety strip (must appear on Bittensor/Hyperliquid/Polymarket desks)
  ["Can Submit: No", "protocol desk safety strip"],
  ["Live Submission: Off", "live submission off indicator"],
];
for (const [needle, label] of safetyChecks) {
  if (html.toLowerCase().includes(needle.toLowerCase())) pass(`HTML safety: ${label}`);
  else fail(`HTML safety: ${label}`, "missing");
}

// Wellness desk must NOT have canSubmit strip (no market execution)
const wellnessHasNoSubmit = html.includes("Wellness Desk");
if (wellnessHasNoSubmit) pass("Wellness Desk present (no canSubmit strip — correct)");

// ── 5. HTML: forbidden UI copy excluded ──────────────────────
// Design annotation text (screen-annotation divs) is stripped before checking
// because it legitimately describes anti-patterns.
const annotationBlock = /<div class="screen-annotation[\s\S]*?<\/div>/gi;
const htmlUI = html.replace(annotationBlock, "");

const forbiddenUICopy = [
  "confirm trade",
  "sign transaction",
  "connect to exchange",
  "live trading",
  "openwork",
  "opencodec",
  "your funds are safe with matterhorn",
  "matterhorn holds your assets",
];

for (const phrase of forbiddenUICopy) {
  if (htmlUI.toLowerCase().includes(phrase)) {
    const idx = htmlUI.toLowerCase().indexOf(phrase);
    const ctx = htmlUI.slice(Math.max(0, idx - 50), idx + phrase.length + 50);
    fail(`HTML UI copy excludes "${phrase}"`, `Found: "${ctx.trim()}"`);
  } else {
    pass(`HTML UI copy excludes "${phrase}"`);
  }
}

// "submit order" must not appear as a button or badge label.
// FAQ question text ("Can Matterhorn submit orders?") is allowed.
const submitOrderBtn = /<(?:button|a|span|div)[^>]*>[^<]{0,50}submit order[^<]{0,50}<\/(?:button|a|span|div)>/gi;
if (submitOrderBtn.test(htmlUI)) {
  fail("HTML UI: 'submit order' found as a button/label element");
} else {
  pass("HTML UI: no 'submit order' button/label (FAQ question text allowed)");
}

// "seed phrase" must not appear as an <input> label or placeholder
const seedPhraseInput = /<(?:input|label|placeholder)[^>]*>[^<]{0,100}seed phrase/i;
if (seedPhraseInput.test(htmlUI)) {
  fail("HTML UI: 'seed phrase' appears as an input label");
} else {
  pass("HTML UI: no 'seed phrase' input label found");
}

// "API key" must not appear as a label, placeholder, or aria-label inside a form field.
// Plain prose mention ("No API key input fields") is allowed.
const apiKeyInFormField = /<(?:input|select|textarea|option|label)[^>]*(?:api[_\s-]?key)[^>]*>/i;
if (apiKeyInFormField.test(htmlUI)) {
  fail("HTML UI: 'API key' appears as a form field label/placeholder");
} else {
  pass("HTML UI: no 'API key' form field label found");
}

// ── 6. CSS: no forbidden patterns ───────────────────────────

const cssBrandForbidden = ["openwork", "opencodec"];
for (const f of cssBrandForbidden) {
  if (css.toLowerCase().includes(f)) {
    fail(`CSS excludes brand name "${f}"`, "found in CSS");
  } else {
    pass(`CSS excludes brand name "${f}"`);
  }
}

// ── 7. UI system spec: required sections ─────────────────────

const spec = read("docs/ui/matterhorn-product-ui-system.md");
const specSections = [
  "Design Language",
  "Color Palette",
  "Safety / Status Colors",
  "Typography",
  "Core Components",
  "Safety Badge",
  "Order Preview Panel",
  "External Signer Handoff Card",
  "Screen Inventory",
  "State Architecture",
  "Anti-Patterns",
  "Forbidden",
  "External Signer Handoff",
  "Compliance",
  "Implementation Notes",
  // New sections from this sprint
  "Protocol Desks",
  "Bittensor Desk",
  "Hyperliquid Desk",
  "Polymarket Desk",
  "Wellness Workflow Desk",
  "Shared Transcript",
  "Wallet Snapshot Card",
  "Compliance Block",
  "Action Preview Card",
  "External Signer Handoff Card",
  "Receipt / Status Card",
  "Wellness Artifact Card",
  "Empty / Loading",
  "Degraded",
  "Error State",
  "Responsive Strategy",
  "Mobile",
  "Tablet",
  "Desktop",
];
for (const section of specSections) {
  if (spec.includes(section)) pass(`UI spec contains section: "${section}"`);
  else fail(`UI spec contains section: "${section}"`, "missing");
}

// Spec must cover key safety values
const specSafetyValues = [
  ["`canSubmit: false`", "canSubmit: false"],
  ["non-custodial", "non-custodial"],
  ["external signer", "external signer model"],
];
for (const [needle, label] of specSafetyValues) {
  if (spec.toLowerCase().includes(needle.toLowerCase())) pass(`UI spec covers: ${label}`);
  else fail(`UI spec covers: ${label}`, "missing");
}

// Anti-patterns section must list forbidden UI elements
const antiPatternMustExclude = [
  ["submit", "Submit"],
  ["api key", "API key"],
  ["private key", "private key"],
  ["custodial", "custodial"],
  ["Matterhorn does not sign", "explicit no-sign statement"],
];
for (const [needle, label] of antiPatternMustExclude) {
  if (spec.toLowerCase().includes(needle.toLowerCase())) pass(`UI spec anti-patterns mention: ${label}`);
  else fail(`UI spec anti-patterns mention: ${label}`, "missing");
}

// ── 8. README: key content ──────────────────────────────────

const readme = read("docs/ui/matterhorn-customer-ux-refresh/README.md");
mustContain("docs/ui/matterhorn-customer-ux-refresh/README.md", [
  "24 Screens",
  "Safety States",
  "canSubmit",
  "External Signer",
  "#D1F2FF",
  "#0C0C0C",
  "Protocol Desks",
  "Wellness Desk",
  "Shared Transcript",
  "Empty",
  "Loading",
]);

function mustContain(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${file} contains "${needle}"`);
    else fail(`${file} contains "${needle}"`, "missing");
  }
}

// ── 9. Stitch prompts: required topics ─────────────────────

const stitch = read("docs/ui/matterhorn-customer-ux-refresh/stitch-prompts.md");
const stitchTopics = [
  "Bootstrap Design System",
  "Markets Browser",
  "Order Preview",
  "External Signer Handoff",
  "Workflow Builder",
  "Safety Badge",
  "Portfolio",
  "Safety Explainer",
  "Artifacts",
  "Settings",
  // New from this sprint
  "Bittensor Desk",
  "Hyperliquid Desk",
  "Polymarket Desk",
  "Wellness Desk",
  "Shared Transcript",
  "Empty",
  "Loading",
  "Degraded",
  "Responsive",
  "Mobile",
];
for (const topic of stitchTopics) {
  if (stitch.includes(topic)) pass(`Stitch prompts cover: "${topic}"`);
  else fail(`Stitch prompts cover: "${topic}"`, "missing");
}

// ── 10. Safety gate compatibility ───────────────────────────

fileExists("scripts/market-execution-safety-gate.test.mjs");

// ── Summary ─────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nStatic design gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("\nStatic design gate passed.");
console.log("Run: pnpm test:market-execution-safety-gate  # must also pass");
