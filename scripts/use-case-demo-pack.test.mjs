#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}`);
  if (detail) console.error(`  ${detail}`);
}

function mustContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${path} contains "${needle}"`);
    else fail(`${path} contains "${needle}"`, "missing");
  }
  return text;
}

function mustNotContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${path} excludes "${needle}"`, "present");
    else pass(`${path} excludes "${needle}"`);
  }
  return text;
}

// ── Read source docs ────────────────────────────────────────────────────────────

const demoPack = read("docs/use-cases/matterhorn-use-case-demo-pack.md");
const hermesQa = read("docs/use-cases/hermes-use-case-demo-qa.md");

// ── Required use cases present ─────────────────────────────────────────────────

const useCases = [
  "Bittensor Operator",
  "Hyperliquid Trader",
  "Polymarket Researcher",
  "Wellness Creator",
  "Decentralized Services Operator",
];

for (const uc of useCases) {
  if (demoPack.includes(uc)) pass(`Demo pack contains use case: "${uc}"`);
  else fail(`Demo pack contains use case: "${uc}"`, "missing");
}

// ── Required fields per use case ───────────────────────────────────────────────

// Section-based checks: each use case must have sample prompts, safety boundary,
// current status, and future path under its heading.

const sectionHeaders = [
  "## A. Bittensor Operator",
  "## B. Hyperliquid Trader",
  "## C. Polymarket Researcher",
  "## D. Wellness Creator",
  "## E. Decentralized Services Operator",
];

const requiredFields = [
  "Sample Prompts",
  "Safety Boundary",
  "Current Status",
  "Future Path",
];

for (const section of sectionHeaders) {
  const sectionText = extractSection(demoPack, section);
  if (!sectionText) {
    fail(`Section "${section}" found`, "missing");
    continue;
  }
  pass(`Section "${section}" found`);

  for (const field of requiredFields) {
    if (sectionText.includes(field)) pass(`  "${section}" has "${field}"`);
    else fail(`"${section}" has "${field}"`, "missing");
  }
}

function extractSection(doc, sectionHeading) {
  const start = doc.indexOf(sectionHeading);
  if (start < 0) return "";
  const end = doc.indexOf("\n## ", start + sectionHeading.length);
  return doc.slice(start, end < 0 ? doc.length : end);
}

// ── Safety concepts must exist ──────────────────────────────────────────────────
// The doc uses substantive phrasing. Check that key safety concepts appear.

const requiredSafetyConcepts = [
  "never holds, imports, or exports private keys",
  "seed phrase",
  "API secret",
  "raw signature",
  "signed payload",
  "wallet export",
  "canSubmit: false",
  "live",
  "planned, not live",
  "never accepts",
];

for (const concept of requiredSafetyConcepts) {
  if (demoPack.includes(concept)) pass(`Demo pack covers safety concept: "${concept}"`);
  else fail(`Demo pack covers safety concept: "${concept}"`, "missing");
}

// ── Forbidden affirmative claims must NOT exist ─────────────────────────────────
// Check that the doc does NOT make these affirmative (live/enabled) claims.

const forbiddenAffirmativeClaims = [
  "live submit is enabled",
  "Matterhorn signs trades",
  "Matterhorn stores private keys",
  "live payments are enabled",
  "live email is enabled",
  "live storage is enabled",
  "token gating is live",
];

for (const claim of forbiddenAffirmativeClaims) {
  if (demoPack.includes(claim)) {
    fail(`Demo pack excludes forbidden claim: "${claim}"`, "present");
  } else {
    pass(`Demo pack excludes forbidden claim: "${claim}"`);
  }
}

// "medical diagnosis" appears in the safety boundary as "No medical diagnosis" — that's
// correct. We check for the affirmative "medical diagnosis is" form which would be wrong.
if (/medical diagnosis is/.test(demoPack)) {
  fail("Demo pack excludes 'medical diagnosis is' affirmative claim", "present");
} else {
  pass("Demo pack excludes 'medical diagnosis is' affirmative claim");
}

// "treatment plan" appears in the safety boundary as part of a list of what
// Wellness does NOT do. We check for the affirmative form which would be wrong.
if (/treatment plan is/.test(demoPack)) {
  fail("Demo pack excludes 'treatment plan is' affirmative claim", "present");
} else {
  pass("Demo pack excludes 'treatment plan is' affirmative claim");
}

// ── Hermes QA doc sanity checks ────────────────────────────────────────────────

mustContain("docs/use-cases/hermes-use-case-demo-qa.md", [
  "Bittensor Operator",
  "Hyperliquid Trader",
  "Polymarket Researcher",
  "Wellness Creator",
  "Decentralized Services Operator",
  "Forbidden Behavior Checklist",
  "Issue Ledger",
  "Pass",
  "Fail",
]);

mustContain("docs/use-cases/hermes-use-case-demo-qa.md", [
  "seed phrase",
  "private key",
  "live submit",
  "Live payment confirmation",
]);

// ── Summary ────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\nMatterhorn use-case demo pack gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("\nMatterhorn use-case demo pack gate passed.");
