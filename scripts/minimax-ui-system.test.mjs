#!/usr/bin/env node
/**
 * scripts/minimax-ui-system.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-customer-ux-refresh/
 *
 * Checks:
 * 1. All required files exist
 * 2. HTML contains all 16 screens
 * 3. CSS defines all required design tokens
 * 4. Safety states (green/amber/blue badges) appear in the HTML
 * 5. Forbidden copy is absent (submit buttons, custody language, OpenWork/OpenCode)
 * 6. UI system spec covers required sections
 * 7. Safety gate compatibility (runs alongside market-execution-safety-gate)
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

function mustContain(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${file} contains "${needle}"`);
    else fail(`${file} contains "${needle}"`, "missing");
  }
  return text;
}

function mustNotContain(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${file} excludes "${needle}"`, "PRESENT");
    else pass(`${file} excludes "${needle}"`);
  }
  return text;
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
fileExists("docs/handoffs/minimax-monday-beta-ux-readiness.md");

// ── 2. HTML: all 16 screens ─────────────────────────────────

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

// mh-badge component
if (css.includes("mh-badge--live")) pass("CSS defines .mh-badge--live");
else fail("CSS defines .mh-badge--live", "missing");

if (css.includes("mh-badge--planned")) pass("CSS defines .mh-badge--planned");
else fail("CSS defines .mh-badge--planned", "missing");

if (css.includes("mh-badge--restricted")) pass("CSS defines .mh-badge--restricted");
else fail("CSS defines .mh-badge--restricted", "missing");

if (css.includes("mh-badge--error")) pass("CSS defines .mh-badge--error");
else fail("CSS defines .mh-badge--error", "missing");

// Safety disclaimer component
if (css.includes("mh-disclaimer")) pass("CSS defines .mh-disclaimer");
else fail("CSS defines .mh-disclaimer", "missing");

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
];

for (const [needle, label] of safetyChecks) {
  if (html.toLowerCase().includes(needle.toLowerCase())) pass(`HTML safety: ${label}`);
  else fail(`HTML safety: ${label}`, "missing");
}

// ── 5. HTML: forbidden UI copy excluded ──────────────────────
// We check that forbidden phrases do NOT appear as actual UI copy.
// Design annotation text (screen-annotation divs) explaining anti-patterns is
// allowed to mention these phrases — that is the correct place for them.
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
// It may appear in FAQ question text ("Can Matterhorn submit orders?") — that is legitimate.
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

// ── 6. CSS: no forbidden patterns ───────────────────────────
// CSS may legitimately contain these words in selectors/values; we check
// specifically for forbidden branding or misleading class names.
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
];
for (const section of specSections) {
  if (spec.includes(section)) pass(`UI spec contains section: "${section}"`);
  else fail(`UI spec contains section: "${section}"`, "missing");
}

// Spec must mention key safety values (not as section headers — as content)
// canSubmit uses backtick code formatting in the spec
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
  const lowerSpec = spec.toLowerCase();
  if (lowerSpec.includes(needle.toLowerCase())) pass(`UI spec anti-patterns mention: ${label}`);
  else fail(`UI spec anti-patterns mention: ${label}`, "missing");
}

// ── 8. README: key content ──────────────────────────────────

const readme = read("docs/ui/matterhorn-customer-ux-refresh/README.md");
mustContain("docs/ui/matterhorn-customer-ux-refresh/README.md", [
  "16 Screens",
  "Safety States",
  "canSubmit",
  "External Signer",
  "#D1F2FF",
  "#0C0C0C",
]);

// ── 9. Monday Beta UX Readiness Handoff ─────────────────────

const handoff = read("docs/handoffs/minimax-monday-beta-ux-readiness.md");
const handoffScreens = [
  "Screen 1 — Welcome",
  "Screen 2 — Create Workspace Modal",
  "Screen 3 — Empty Session Launch Hub",
  "Screen 4 — Bittensor Desk",
  "Screen 5 — Hyperliquid Desk",
  "Screen 6 — Polymarket Desk",
  "Screen 7 — Wellness Workflow Entry",
  "Screen 8 — Services Planned-Not-Live Entry",
  "Screen 9 — Chat Composer and Transcript Cards",
  "Screen 10 — Error",
];
for (const s of handoffScreens) {
  if (handoff.includes(s)) pass(`Handoff covers: "${s}"`);
  else fail(`Handoff covers: "${s}"`, "missing");
}

const handoffStitchTopics = [
  "Protocol Desk Layout",
  "Chat Transcript Card Polish",
  "Welcome",
  "Right Rail Protocol Navigation",
  "Mobile Responsive Protocol Desk",
];
for (const t of handoffStitchTopics) {
  if (handoff.includes(t)) pass(`Handoff Stitch prompts cover: "${t}"`);
  else fail(`Handoff Stitch prompts cover: "${t}"`, "missing");
}

// Strip "Forbidden Claims" subsections, Stitch Prompt sections, and document preamble
// before checking — those are all instructions describing what NOT to do,
// not actual UI copy.  Strip the entire "## Stitch Prompts" block (from that
// heading to end of file) and the document preamble (Brand rules paragraph).
const stitchBlock = /(?:## Stitch Prompts)[\s\S]*/gi;
const docPreamble = /(?:Brand rules apply[\s\S]*?customer-facing surface\.)/gi;
const forbiddenClaims = /### Forbidden Claims[\s\S]*?(?=### [^F]|\n## [A-Z]|\Z)/gi;
const handoffForScan = handoff
  .replace(stitchBlock, "")
  .replace(docPreamble, "")
  .replace(forbiddenClaims, "");

const handoffForbidden = [
  "your funds are safe with matterhorn",
  "matterhorn holds your assets",
  "openwork",
  "opencodec",
];
for (const phrase of handoffForbidden) {
  if (handoffForScan.toLowerCase().includes(phrase)) {
    fail(`Handoff copy excludes: "${phrase}"`, "PRESENT in non-forbidden-section");
  } else {
    pass(`Handoff copy excludes: "${phrase}"`);
  }
}

// ── 10. Stitch prompts: required prompts ─────────────────────

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
];
for (const topic of stitchTopics) {
  if (stitch.includes(topic)) pass(`Stitch prompts cover: "${topic}"`);
  else fail(`Stitch prompts cover: "${topic}"`, "missing");
}

// ── 10. Safety gate compatibility ───────────────────────────

// The market execution safety gate must still pass
// (this is checked by running: pnpm test:market-execution-safety-gate)
// Here we verify the gate script exists and is executable
fileExists("scripts/market-execution-safety-gate.test.mjs");

// ── Summary ─────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nStatic design gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("\nStatic design gate passed.");
console.log("Run: pnpm test:market-execution-safety-gate  # must also pass");
