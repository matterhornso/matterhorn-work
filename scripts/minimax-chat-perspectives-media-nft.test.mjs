#!/usr/bin/env node
/**
 * scripts/minimax-chat-perspectives-media-nft.test.mjs
 *
 * Static design gate for docs/ui/matterhorn-chat-perspectives-media-nft/
 *
 * Checks:
 * 1. Required files exist
 * 2. Prototype HTML contains all 13 screens
 * 3. CSS defines required design tokens
 * 4. Three response modes documented
 * 5. Safety rules present
 * 6. Media Studio screens present
 * 7. NFT flow present (ERC-721, ERC-1155, metadata, IPFS, wallet handoff)
 * 8. Forbidden strings absent
 * 9. Brand language correct
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

console.log("\nMatterhorn Chat Perspectives & Media Studio — Static Design Gate\n");

const DIR = "docs/ui/matterhorn-chat-perspectives-media-nft";

// ── 1. Required files exist ─────────────────────────────────────

const requiredFiles = [
  `${DIR}/chat-usp-and-response-modes.md`,
  `${DIR}/response-mode-flow.md`,
  `${DIR}/media-studio-nft-handoff.md`,
  `${DIR}/index.html`,
  `${DIR}/styles.css`,
  `${DIR}/prototype.js`,
];
for (const f of requiredFiles) {
  if (fileExists(f)) pass(`File exists: ${f}`);
  else fail(`File exists: ${f}`, "missing");
}

// ── 2. Prototype: all 13 screens present ──────────────────────

const html = read(`${DIR}/index.html`);

const screens = [
  ["screen-1", "Chat home with Perspectives USP"],
  ["screen-2", "Single-output mode"],
  ["screen-3", "Multi-output mode"],
  ["screen-4", "Bittensor stake TAO example"],
  ["screen-5", "Hyperliquid preview"],
  ["screen-6", "Polymarket compliance"],
  ["screen-7", "Wellness medical boundary"],
  ["screen-8", "Media Studio home"],
  ["screen-9", "Video generation"],
  ["screen-10", "Audio generation"],
  ["screen-11", "NFT metadata preview"],
  ["screen-12", "External wallet handoff"],
  ["screen-13", "Mobile layout"],
];
for (const [id, label] of screens) {
  if (html.includes(`id="${id}"`)) pass(`Prototype screen: ${label}`);
  else fail(`Prototype screen: ${label}`, "missing");
}

// Showcase nav present
if (html.includes("showcase-nav")) pass("Prototype: showcase nav present");
else fail("Prototype: showcase nav present", "missing");

// Theme toggle
if (html.includes("theme-toggle")) pass("Prototype: theme toggle present");
else fail("Prototype: theme toggle present", "missing");

// Mode toggle
if (html.includes("cp-mode-toggle")) pass("Prototype: mode toggle present");
else fail("Prototype: mode toggle present", "missing");

// Safety strip
if (html.includes("cp-safety-strip")) pass("Prototype: safety strip present");
else fail("Prototype: safety strip present", "missing");

// Memory chip bar
if (html.includes("cp-chip-bar")) pass("Prototype: memory chip bar present");
else fail("Prototype: memory chip bar present", "missing");

// Response cards
if (html.includes("cp-response-card--nonopt")) pass("Prototype: non-optimistic card present");
else fail("Prototype: non-optimistic card present", "missing");

if (html.includes("cp-response-card--neutral")) pass("Prototype: neutral card present");
else fail("Prototype: neutral card present", "missing");

if (html.includes("cp-response-card--opt")) pass("Prototype: optimistic card present");
else fail("Prototype: optimistic card present", "missing");

// Media Studio
if (html.includes("ms-app")) pass("Prototype: Media Studio app shell present");
else fail("Prototype: Media Studio app shell present", "missing");

if (html.includes("ms-safety-panel")) pass("Prototype: safety panel present");
else fail("Prototype: safety panel present", "missing");

// ── 3. CSS design tokens ─────────────────────────────────────

const css = read(`${DIR}/styles.css`);

const cssTokens = [
  ["--cp-nonopt:", "#F59E0B"],
  ["--cp-neutral:", "#94A3B8"],
  ["--cp-opt:", "#22C55E"],
  ["--cp-accent:", "#D1F2FF"],
  ["--cp-bg:", "#0C0C0C"],
  ["--ms-bg:", "#0C0C0C"],
  ["--ms-nft:", "#A78BFA"],
  ["--cp-nonopt-dim:", "rgba(245,158,11"],
  ["--cp-opt-dim:", "rgba(34,197,94"],
];
for (const [token] of cssTokens) {
  if (css.includes(token)) pass(`CSS defines: ${token}`);
  else fail(`CSS defines: ${token}`, "missing");
}

// Light theme override
if (css.includes('[data-theme="light"]')) {
  pass("CSS contains [data-theme='light'] overrides");
} else {
  fail("CSS contains [data-theme='light'] overrides", "missing");
}

// Mobile responsive
if (css.includes("@media") && css.includes("max-width: 768px")) {
  pass("CSS contains mobile responsive breakpoint");
} else {
  fail("CSS contains mobile responsive breakpoint", "missing");
}

// ── 4. Three response modes documented ─────────────────────────

const usp = read(`${DIR}/chat-usp-and-response-modes.md`);
const flow = read(`${DIR}/response-mode-flow.md`);

const modes = [
  "Non-optimistic",
  "Neutral",
  "Optimistic",
];
for (const m of modes) {
  if (usp.includes(m) && flow.includes(m)) pass(`Docs cover mode: ${m}`);
  else fail(`Docs cover mode: ${m}`, "missing");
}

// Mode descriptions
if (usp.includes("conservative") && usp.includes("risk-first")) {
  pass("Non-optimistic mode described as risk-first");
} else {
  fail("Non-optimistic mode described as risk-first", "missing");
}

if (usp.includes("balanced") && usp.includes("factual")) {
  pass("Neutral mode described as balanced/factual");
} else {
  fail("Neutral mode described as balanced/factual", "missing");
}

if (usp.includes("opportunity-forward") || (usp.includes("optimistic") && usp.includes("constructive"))) {
  pass("Optimistic mode described as opportunity-forward/constructive");
} else {
  fail("Optimistic mode described as opportunity-forward/constructive", "missing");
}

// Mode selector design
if (flow.includes("mode") && (flow.includes("amber") || flow.includes("blue") || flow.includes("green"))) {
  pass("Mode selector design documented");
} else {
  fail("Mode selector design documented", "missing");
}

// ── 5. Safety rules ────────────────────────────────────────────

const safetyRules = [
  ["Never weakened", "Optimistic does not weaken safety"],
  ["non-custodial", "non-custodial"],
  ["external signer", "external signer"],
  ["medical disclaimer", "medical disclaimer"],
  ["Provenance drawer", "Provenance drawer"],
  ["receipt", "Receipt for actions"],
];
for (const [topic, label] of safetyRules) {
  if (usp.includes(topic) || flow.includes(topic)) {
    pass(`Safety rule present: ${label}`);
  } else {
    fail(`Safety rule present: ${label}`, "missing");
  }
}

// Hyperliquid/Polymarket safety
const hlSafety = ["Preview", "external signer", "non-custodial"];
for (const s of hlSafety) {
  if (flow.includes(s)) pass(`Hyperliquid safety: "${s}"`);
  else fail(`Hyperliquid safety: "${s}"`, "missing");
}

// Wellness safety
const wellnessSafety = [
  "not medical advice",
  "educational",
  "not diagnose",
  "not a medical",
];
for (const s of wellnessSafety) {
  if (flow.includes(s)) pass(`Wellness safety: "${s}"`);
  else fail(`Wellness safety: "${s}"`, "missing");
}

// ── 6. Media Studio screens ───────────────────────────────────

const mediaDoc = read(`${DIR}/media-studio-nft-handoff.md`);

const mediaScreens = [
  "Media Studio Overview",
  "Video Generation",
  "Audio Generation",
  "Generate",
];
for (const s of mediaScreens) {
  if (mediaDoc.includes(s) || html.includes(s.replace(" ", "").toLowerCase())) {
    pass(`Media Studio doc/screen: "${s}"`);
  } else {
    fail(`Media Studio doc/screen: "${s}"`, "missing");
  }
}

// ── 7. NFT flow ────────────────────────────────────────────────

const nftItems = [
  "ERC-721",
  "ERC-1155",
  "metadata",
  "tokenURI",
  "IPFS",
  "Pinata",
  "external wallet",
  "wallet handoff",
  "mint",
  "never takes custody",
];
for (const item of nftItems) {
  if (mediaDoc.includes(item) || html.includes(item)) {
    pass(`NFT flow: "${item}" present`);
  } else {
    fail(`NFT flow: "${item}" present`, "missing");
  }
}

// NFT safety — check for actual phrases from media-studio-nft-handoff.md
const nftSafety = [
  "does not take private keys",
  "never holds your keys",
  "not mint",
  "external wallet",
  "fees",
  "gas",
  "Matterhorn never takes custody",
  "Matterhorn never takes ownership",
];
for (const s of nftSafety) {
  if (mediaDoc.toLowerCase().includes(s.toLowerCase())) pass(`NFT safety: "${s}"`);
  else fail(`NFT safety: "${s}"`, "missing");
}

// External wallet handoff screen
if (html.includes("Connect Wallet") && html.includes("wallet")) {
  pass("Prototype: external wallet connect UI present");
} else {
  fail("Prototype: external wallet connect UI present", "missing");
}

// ── 8. Forbidden strings ────────────────────────────────────────

// HTML + CSS scan
const scanContent = (html + css).toLowerCase();

const forbidden = [
  "seed phrase",
  "raw signature",
  "signed payload",
  "api secret",
  "openwork",
  "opencodec",
];
for (const phrase of forbidden) {
  if (scanContent.includes(phrase)) {
    fail(`Forbidden string present in prototype: "${phrase}"`, "PRESENT");
  } else {
    pass(`Prototype excludes: "${phrase}"`);
  }
}
// "private key" is allowed in safety disclaimers; flag only if near an <input>
const pkIdx = scanContent.indexOf("private key");
if (pkIdx !== -1) {
  const near = scanContent.slice(Math.max(0, pkIdx - 200), pkIdx + 300);
  if (/<\w+[^>]*type=["']?(?:password|text|number|email|url|tel)/i.test(near)) {
    fail(`Forbidden string present in prototype: "private key"`, "PRESENT (near input)");
  } else {
    pass('Prototype excludes: "private key" (safety disclaimer only)');
  }
}

// Doc scan (strip instructional sections before checking for forbidden terms)
// The media doc intentionally describes forbidden patterns in ## 6. Forbidden Patterns.
// The usp doc has a safety summary table with "No X / Y" rows describing what the product
// does NOT do — strip those before scanning.  All other content survives.
const docScan = (usp + " " + flow + " " + mediaDoc)
  // Strip ## 6. Forbidden Patterns section from media doc
  .replace(/## 6\. Forbidden Patterns[\s\S]*?(?=\n## 7\. )/g, " STRIPPED-FORBIDDEN ")
  // Strip safety summary rows like "│  • No medical diagnosis / prescription"
  .replace(/│\s*[•*-]?\s*No\s+(?:medical\s+diagnosis|prescription|treatment\s+advice|seed\s+phrase|private\s+key)[^\n]*/gi, " ")
  // Strip ⚠ warning lines
  .replace(/⚠ .*?(?:Never|No|Do not|Forbidden).*?(?=\n)/gi, " ");

for (const phrase of ["seed phrase input", "private key input", "raw signature input", "sign transaction", "live mint now", "guaranteed profit", "medical diagnosis", "prescription", "treatment advice"]) {
  if (docScan.toLowerCase().includes(phrase)) {
    fail(`Doc excludes: "${phrase}"`, "PRESENT in non-instructional content");
  } else {
    pass(`Doc excludes: "${phrase}"`);
  }
}

// ── 9. Brand language ─────────────────────────────────────────

const brandChecks = [
  ["Matterhorn Desks", true],
  ["Matterhorn Perspectives", true],
  ["matterhorn-work engine", false], // forbidden
];
if (html.includes("Matterhorn Desks")) pass("Prototype: uses 'Matterhorn Desks'");
else fail("Prototype: uses 'Matterhorn Desks'", "missing");

if (html.includes("Matterhorn Perspectives")) pass("Prototype: uses 'Matterhorn Perspectives'");
else fail("Prototype: uses 'Matterhorn Perspectives'", "missing");

if (html.includes("OpenWork") || html.includes("openwork")) {
  fail("Prototype excludes OpenWork branding", "PRESENT");
} else {
  pass("Prototype excludes OpenWork branding");
}

if (html.includes("OpenCode") || html.includes("opencode")) {
  fail("Prototype excludes OpenCode branding", "PRESENT");
} else {
  pass("Prototype excludes OpenCode branding");
}

// ── 10. Feature requirements ──────────────────────────────────

const featureChecks = [
  ["Chat Perspectives", "Chat USP documented"],
  ["Response Mode", "Response mode flow documented"],
  ["## 4. Composer", "Composer layout documented"],
  ["Mode selector", "Mode selector documented"],
  ["Multi-output", "Multi-output mode documented"],
  ["Single-output", "Single-output mode documented"],
  ["Safety Strip", "Safety strip documented"],
  ["Memory chip bar", "Memory chip bar documented"],
  ["Provenance drawer", "Provenance drawer documented"],
  ["Use this", "Use this answer action documented"],
  ["Compare modes", "Compare modes action documented"],
  ["Generate media", "Generate media action documented"],
];
for (const [term, label] of featureChecks) {
  if (usp.includes(term) || flow.includes(term) || html.includes(term)) {
    pass(`Feature: ${label}`);
  } else {
    fail(`Feature: ${label}`, "missing");
  }
}

// ── 11. Example prompts documented ─────────────────────────────

const examples = [
  "Should I stake 1 TAO",
  "Hyperliquid",
  "Polymarket",
  "wellness",
  "wellness plan",
];
for (const ex of examples) {
  if (flow.includes(ex) || usp.includes(ex)) {
    pass(`Example prompt documented: "${ex}"`);
  } else {
    fail(`Example prompt documented: "${ex}"`, "missing");
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
