#!/usr/bin/env node
// Go-live gate for the Wellness Creator Pilot use case.
// Verifies: docs + artifact fixtures exist; canonical prompts present; mandatory
// safety disclaimers present; no affirmative medical diagnosis/prescription
// claims; no false "Web3 rail is live" claims; and that the offline pilot helper
// emits the expected versioned contract, passes its fixture go-live check, and
// rejects credential-shaped flags.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DOC_PATH = "docs/wellness-creator-pilot.md";
const HANDOFF_PATH = "docs/handoffs/hermes-wellness-creator-qa.md";
const HELPER_PATH = "scripts/wellness-creator-pilot.mjs";
const FIXTURE_DIR = "docs/wellness-creator-pilot";
const FIXTURES = [
  "README.md",
  "01-training-plan.md",
  "02-client-handouts.md",
  "03-nutrition-guide.md",
  "04-video-scripts.md",
  "05-client-artifact.md",
  "06-landing-packet.md",
];

// 1. Docs, helper, and fixtures exist.
for (const path of [DOC_PATH, HANDOFF_PATH, HELPER_PATH]) {
  assert.ok(existsSync(path), `Wellness Creator Pilot file should exist: ${path}`);
}
for (const fixture of FIXTURES) {
  assert.ok(existsSync(`${FIXTURE_DIR}/${fixture}`), `Artifact fixture should exist: ${FIXTURE_DIR}/${fixture}`);
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

// 6. Go-live runbook sections are present.
for (const section of [
  "Acceptance Criteria",
  "Go-Live Checklist",
  "Operator Demo Script",
  "Success Metrics",
  "Rollout & Rollback",
  "Reproducible Artifact Fixtures",
  "Pilot Contract (Offline Helper)",
]) {
  assert.ok(doc.includes(section), `Pilot doc should include go-live section: ${section}`);
}

// 7. Mandatory safety disclaimers exist.
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

// 8. No affirmative medical diagnosis / prescription / cure / guarantee claims in
//    the doc or any artifact fixture. (Fixtures may quote the disclaimers, which
//    legitimately contain the bare words "diagnosis"/"treatment".)
const FORBIDDEN_CLAIMS = [
  "we diagnose",
  "we will diagnose",
  "prescribe a dose",
  "prescribe medication",
  "cure your condition",
  "cure your",
  "this is medical advice",
  "guaranteed weight loss",
  "guaranteed results",
];
const claimTargets = [DOC_PATH, ...FIXTURES.map((f) => `${FIXTURE_DIR}/${f}`)];
for (const path of claimTargets) {
  const text = readFileSync(path, "utf8").toLowerCase();
  for (const forbidden of FORBIDDEN_CLAIMS) {
    assert.equal(
      text.includes(forbidden.toLowerCase()),
      false,
      `${path} must not make a medical/guarantee claim: ${forbidden}`,
    );
  }
}

// 9. Web3 hooks disclosed as planned, not live.
for (const planned of [
  "planned, not live",
  "Decentralized storage (planned)",
  "On-chain / crypto payments (planned)",
  "Web3 is the upgrade path, not the entry fee",
]) {
  assert.ok(doc.includes(planned), `Pilot doc should disclose Web3 hook as planned: ${planned}`);
}

// 10. No false claim that a planned Web3 rail is already live, in doc or fixtures.
const FORBIDDEN_LIVE = [
  "decentralized storage is live",
  "payments are live",
  "on-chain payments are live",
  "storage is now live",
  "crypto payments are now live",
];
for (const path of claimTargets) {
  const text = readFileSync(path, "utf8").toLowerCase();
  for (const forbidden of FORBIDDEN_LIVE) {
    assert.equal(
      text.includes(forbidden.toLowerCase()),
      false,
      `${path} must not claim a planned Web3 rail is live: ${forbidden}`,
    );
  }
}

// 11. Each artifact fixture carries its required disclaimer marker.
const FIXTURE_MARKERS = {
  "01-training-plan.md": ["not medical advice, diagnosis, or treatment"],
  "02-client-handouts.md": ["not medical advice, diagnosis, or treatment"],
  "03-nutrition-guide.md": [
    "not medical advice, diagnosis, or treatment",
    "general healthy-eating information, not a clinical or therapeutic diet",
  ],
  "04-video-scripts.md": ["not medical advice, diagnosis, or treatment"],
  "05-client-artifact.md": ["not medical advice, diagnosis, or treatment"],
  "06-landing-packet.md": ["No specific outcome, weight change, or fitness result is guaranteed."],
};
for (const [fixture, markers] of Object.entries(FIXTURE_MARKERS)) {
  const text = readFileSync(`${FIXTURE_DIR}/${fixture}`, "utf8");
  for (const marker of markers) {
    assert.ok(text.includes(marker), `${fixture} should carry disclaimer marker: ${marker}`);
  }
}
// The landing packet must keep payment as placeholder-only.
const packet = readFileSync(`${FIXTURE_DIR}/06-landing-packet.md`, "utf8");
assert.ok(packet.includes("placeholder"), "Landing packet should mark pricing/checkout as placeholder");
assert.ok(
  packet.includes("does not process payments") || packet.includes("no payment is taken"),
  "Landing packet should state no payment is processed",
);

// 12. Handoff carries the safety + Web3-honesty QA sections.
for (const phrase of [
  "Safety Tests (Medical Boundary)",
  "Web3 Honesty Tests",
  "planned, not live",
  "Issue Ledger",
  "Red Lines",
  "Do not paste seed phrases",
  "Evidence Matrix",
]) {
  assert.ok(handoff.includes(phrase), `Hermes handoff should include section/phrase: ${phrase}`);
}

// 13. Offline helper emits the expected versioned contract with pinned safety flags.
const contractResult = spawnSync(process.execPath, [HELPER_PATH, "--dry-run", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(contractResult.status, 0, `Pilot helper should exit 0. stderr=${contractResult.stderr}`);
const contract = JSON.parse(contractResult.stdout);
assert.equal(contract.version, "matterhorn.wellness.creator-pilot.v1");
assert.equal(contract.ok, true);
assert.equal(contract.dryRun, true);
assert.equal(contract.nonTrading, true);
assert.equal(contract.safety.acceptsSecrets, false);
assert.equal(contract.safety.givesMedicalAdvice, false);
assert.equal(contract.safety.web3PaymentsLive, false);
assert.equal(contract.safety.web3StorageLive, false);
assert.equal(contract.safety.movesFunds, false);
assert.equal(contract.prompts.length, 7);
const contractPromptText = contract.prompts.map((p) => p.prompt);
for (const prompt of CANONICAL_PROMPTS) {
  assert.ok(contractPromptText.includes(prompt), `Helper contract should list canonical prompt: ${prompt}`);
}
assert.equal(contract.web3Hooks.length, 4);
for (const hook of contract.web3Hooks) {
  assert.equal(hook.live, false, `Web3 hook ${hook.id} must be not-live`);
  assert.equal(hook.status, "planned", `Web3 hook ${hook.id} must be planned`);
}
assert.ok(contract.goLiveChecklist.length >= 5, "Helper contract should include a go-live checklist");

// 14. Helper go-live check passes over the fixtures.
const checkResult = spawnSync(process.execPath, [HELPER_PATH, "--check", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(checkResult.status, 0, `Pilot helper --check should exit 0. stderr=${checkResult.stderr}`);
const check = JSON.parse(checkResult.stdout);
assert.equal(check.ok, true, `Go-live check should pass. failures=${JSON.stringify(check.failures)}`);
assert.deepEqual(check.failures, []);
assert.ok(check.checked.length >= 6, "Go-live check should validate all artifact fixtures");

// 15. Helper rejects credential-shaped flags.
const reject = spawnSync(process.execPath, [HELPER_PATH, "--json", "--private-key", "redacted"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "Pilot helper should reject credential-shaped flags");
assert.ok(
  reject.stdout.includes("Forbidden credential-shaped flag"),
  "Pilot helper should explain forbidden credential flags",
);

console.log("Wellness Creator Pilot go-live gate passed.");
