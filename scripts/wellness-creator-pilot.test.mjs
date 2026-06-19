#!/usr/bin/env node
// Static wiring + safety gate for the Wellness Creator Pilot use case.
// Verifies: docs exist, canonical prompts exist, mandatory safety disclaimers
// exist, no affirmative medical diagnosis/prescription claims, and no false
// claim that planned Web3 storage/payment rails are live.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const DOC_PATH = "docs/wellness-creator-pilot.md";
const HANDOFF_PATH = "docs/handoffs/hermes-wellness-creator-qa.md";

// 1. Docs exist.
for (const path of [DOC_PATH, HANDOFF_PATH]) {
  assert.ok(existsSync(path), `Wellness Creator Pilot doc should exist: ${path}`);
}

const doc = readFileSync(DOC_PATH, "utf8");
const handoff = readFileSync(HANDOFF_PATH, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 2. Test is wired into package.json.
assert.equal(
  pkg.scripts?.["test:wellness-creator-pilot"],
  "node scripts/wellness-creator-pilot.test.mjs",
  "package.json should expose the Wellness Creator Pilot gate",
);

// 3. Canonical demo prompts exist in both the doc and the handoff.
const CANONICAL_PROMPTS = [
  "Create a 4-week fat-loss plan for a beginner",
  "Turn this plan into client handouts",
  "Create scripts for 10 short training videos",
  "Create a client-facing artifact I can share",
  "Prepare a paid program landing packet",
  "Package this as a Matterhorn artifact / MCP workflow",
];
for (const prompt of CANONICAL_PROMPTS) {
  assert.ok(doc.includes(prompt), `Pilot doc should include canonical prompt: ${prompt}`);
  assert.ok(handoff.includes(prompt), `Hermes handoff should include canonical prompt: ${prompt}`);
}

// 4. Target personas are documented.
for (const persona of ["Personal trainer", "Gym instructor", "Dietician", "Yoga instructor"]) {
  assert.ok(doc.includes(persona), `Pilot doc should document persona: ${persona}`);
}

// 5. Required outputs are documented.
for (const output of [
  "Training plan",
  "Nutrition guide",
  "Video scripts",
  "Client artifact",
  "payment-ready packet",
]) {
  assert.ok(doc.includes(output), `Pilot doc should document output: ${output}`);
}

// 6. Mandatory safety disclaimers exist.
for (const disclaimer of [
  "not medical advice, diagnosis, or treatment",
  "Consult a qualified healthcare professional",
  "general healthy-eating information, not a clinical or therapeutic diet",
  "No specific outcome, weight change, or fitness result is guaranteed.",
  "educational, not medical care",
]) {
  assert.ok(doc.includes(disclaimer), `Pilot doc should include safety disclaimer: ${disclaimer}`);
}
assert.ok(
  handoff.includes("educational, not medical care") || handoff.includes("qualified healthcare professional"),
  "Hermes handoff should reference the medical-boundary safety framing",
);

// 7. No affirmative medical diagnosis / prescription / cure claims in the doc.
//    (The doc may say what it will NOT do; it must never make these claims.)
for (const forbidden of [
  "we diagnose",
  "we will diagnose",
  "prescribe a dose",
  "prescribe medication",
  "cure your condition",
  "this is medical advice",
  "guaranteed weight loss",
  "guaranteed results",
]) {
  assert.equal(
    doc.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `Pilot doc must not make a medical/guarantee claim: ${forbidden}`,
  );
}

// 8. Web3 hooks are disclosed as planned, not live.
for (const planned of [
  "planned, not live",
  "Decentralized storage (planned)",
  "On-chain / crypto payments (planned)",
  "Web3 is the upgrade path, not the entry fee",
]) {
  assert.ok(doc.includes(planned), `Pilot doc should disclose Web3 hook as planned: ${planned}`);
}

// 9. No false claim that a planned Web3 storage/payment rail is already live.
for (const forbidden of [
  "decentralized storage is live",
  "payments are live",
  "on-chain payments are live",
  "storage is now live",
  "crypto payments are now live",
]) {
  assert.equal(
    doc.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `Pilot doc must not claim a planned Web3 rail is live: ${forbidden}`,
  );
}

// 10. Handoff carries the safety + Web3-honesty QA sections.
for (const phrase of [
  "Safety Tests (Medical Boundary)",
  "Web3 Honesty Tests",
  "planned, not live",
  "Issue Ledger",
  "Red Lines",
  "Do not paste seed phrases",
]) {
  assert.ok(handoff.includes(phrase), `Hermes handoff should include section/phrase: ${phrase}`);
}

console.log("Wellness Creator Pilot pilot check passed.");
