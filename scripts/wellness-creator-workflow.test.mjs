#!/usr/bin/env node
// Gate for the full Wellness Creator Workflow.
// Proves: it is framed as a full workflow (not a pilot); every service hook is
// planned-not-live; no medical-advice expansion; no live payments/storage/
// email/identity claims; no secret-taking examples; and every canonical prompt
// produces a safe expected artifact.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { routeFreeformPrompt } from "./wellness-creator-workflow.mjs";

const DOC_PATH = "docs/wellness-creator-workflow.md";
const HANDOFF_PATH = "docs/handoffs/hermes-wellness-creator-workflow-qa.md";
const HELPER_PATH = "scripts/wellness-creator-workflow.mjs";

// 1. Files exist.
for (const path of [DOC_PATH, HANDOFF_PATH, HELPER_PATH]) {
  assert.ok(existsSync(path), `Wellness Creator Workflow file should exist: ${path}`);
}

const doc = readFileSync(DOC_PATH, "utf8");
const handoff = readFileSync(HANDOFF_PATH, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 2. Test wired into package.json.
assert.equal(
  pkg.scripts?.["test:wellness-creator-workflow"],
  "node scripts/wellness-creator-workflow.test.mjs",
  "package.json should expose the Wellness Creator Workflow gate",
);

// 3. Helper emits the versioned contract.
const jsonResult = spawnSync(process.execPath, [HELPER_PATH, "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(jsonResult.status, 0, `Workflow helper --json should exit 0. stderr=${jsonResult.stderr}`);
const contract = JSON.parse(jsonResult.stdout);
assert.equal(contract.version, "matterhorn.wellness.creator-workflow.v1");
assert.equal(contract.ok, true);

// 4. Framed as a FULL workflow, not a pilot.
assert.equal(contract.fullWorkflow, true, "Contract must declare fullWorkflow: true");
assert.equal(contract.isPilot, false, "Contract must declare isPilot: false");
assert.ok(/full/i.test(contract.framing), "Contract framing should describe a full workflow");
assert.ok(/not a pilot/i.test(contract.framing), "Contract framing should say not a pilot");
assert.ok(doc.includes("full Matterhorn Work workflow"), "Doc should frame this as a full Matterhorn Work workflow");
assert.ok(doc.includes("not a pilot"), "Doc should state this is not a pilot");

// 5. Personas (all four).
const personaLabels = contract.personas.map((p) => p.label).join(" | ");
for (const persona of ["Personal trainer", "Gym instructor", "Yoga instructor", "Dietician"]) {
  assert.ok(personaLabels.includes(persona), `Workflow should include persona: ${persona}`);
}

// 6. Seven-stage workflow with stable stage ids.
const EXPECTED_STAGES = [
  "intake",
  "program-design",
  "client-artifacts",
  "service-packaging",
  "delivery-plan",
  "customer-management",
  "export",
];
assert.equal(contract.stages.length, 7, "Workflow should have seven stages");
assert.deepEqual(contract.stages.map((s) => s.id), EXPECTED_STAGES, "Workflow stage ids should match");

// 7. Canonical prompts — seven, each mapped to a safe, non-empty artifact set.
assert.equal(contract.canonicalPrompts.length, 7, "Workflow should have seven canonical prompts");
assert.equal(contract.promptArtifacts.length, 7, "Each canonical prompt should map to artifacts");
for (const mapping of contract.promptArtifacts) {
  assert.ok(contract.canonicalPrompts.includes(mapping.prompt), `promptArtifacts prompt should be canonical: ${mapping.prompt}`);
  assert.equal(mapping.safe, true, `Prompt should be marked safe: ${mapping.prompt}`);
  assert.ok(Array.isArray(mapping.artifacts) && mapping.artifacts.length > 0, `Prompt should produce an artifact: ${mapping.prompt}`);
}
// Each stage prompt is documented.
for (const prompt of contract.canonicalPrompts) {
  assert.ok(doc.includes(prompt), `Doc should include canonical prompt: ${prompt}`);
}

// 8. Expected artifact types cover the required client artifacts and packaging.
for (const artifact of [
  "Weekly plan",
  "Video script",
  "Checklist",
  "FAQ",
  "Progress tracker",
  "Offer page copy",
  "Pricing-package draft",
  "Onboarding questionnaire",
  "Terms / disclaimer text",
  "Follow-up cadence",
  "Feedback form",
  "Renewal / up-sell prompts",
  "Matterhorn workflow / MCP export",
]) {
  assert.ok(
    contract.expectedArtifactTypes.includes(artifact),
    `Workflow should produce expected artifact type: ${artifact}`,
  );
}

// 9. Mandatory disclaimers present in the contract and the doc.
const REQUIRED_DISCLAIMERS = [
  "not medical advice, diagnosis, or treatment",
  "general healthy-eating information, not a clinical or therapeutic diet",
  "No specific outcome, weight change, or fitness result is guaranteed.",
];
const contractFull = JSON.stringify(contract);
for (const disclaimer of REQUIRED_DISCLAIMERS) {
  assert.ok(contractFull.includes(disclaimer), `Contract should include disclaimer: ${disclaimer}`);
  assert.ok(doc.includes(disclaimer), `Doc should include disclaimer: ${disclaimer}`);
}

// 10. Every service hook planned-not-live; safety flags pinned off.
const hookNames = contract.serviceHooks.map((h) => h.name);
for (const name of ["Storage / hosting", "Email updates", "Payments", "Identity / access"]) {
  assert.ok(hookNames.includes(name), `Workflow should include planned service hook: ${name}`);
}
for (const hook of contract.serviceHooks) {
  assert.equal(hook.status, "planned, not live", `Service hook ${hook.id} must be planned, not live`);
}
for (const [key, value] of Object.entries(contract.safety)) {
  if (key.endsWith("Live")) assert.equal(value, false, `safety.${key} must be false`);
}
assert.equal(contract.safety.movesFunds, false, "safety.movesFunds must be false");
assert.equal(contract.safety.acceptsSecrets, false, "safety.acceptsSecrets must be false");
assert.equal(contract.safety.givesMedicalAdvice, false, "safety.givesMedicalAdvice must be false");
assert.equal(contract.safety.fullWorkflow, true, "safety.fullWorkflow must be true");
assert.equal(contract.safety.isPilot, false, "safety.isPilot must be false");

// 11. Planned-not-live guarantees present in contract and doc.
for (const guarantee of [
  "Storage / hosting is planned, not live.",
  "Email sending is planned, not live.",
  "Payments are planned, not live.",
  "Identity / access gating is planned, not live.",
  "No funds move.",
  "No email is sent.",
  "No token gating is enforced.",
  "No live decentralized storage publish happens.",
]) {
  assert.ok(contractFull.includes(guarantee), `Contract should state guarantee: ${guarantee}`);
  assert.ok(doc.includes(guarantee), `Doc should state guarantee: ${guarantee}`);
}

// 12. Forbidden-claims allowlist present (medical + secret + service prohibitions).
assert.ok(Array.isArray(contract.forbiddenClaims) && contract.forbiddenClaims.length >= 5, "Contract should list forbidden claims");
const forbiddenText = contract.forbiddenClaims.join("\n");
assert.ok(/diagnos/i.test(forbiddenText), "Forbidden claims should prohibit diagnosis");
assert.ok(/prescription|medication/i.test(forbiddenText), "Forbidden claims should prohibit prescription/medication");
assert.ok(/private keys|wallet exports|secrets/i.test(forbiddenText), "Forbidden claims should prohibit secrets");
assert.ok(/payments.*operational|operational/i.test(forbiddenText), "Forbidden claims should prohibit live-service claims");

// 13. Demo checklist + Hermes QA checklist present.
assert.ok(Array.isArray(contract.demoChecklist) && contract.demoChecklist.length >= 5, "Contract should include a demo checklist");
assert.ok(Array.isArray(contract.hermesQaChecklist) && contract.hermesQaChecklist.length >= 5, "Contract should include a Hermes QA checklist");

// 14. No affirmative live-service / medical / secret claims in the doc or the
//     emitted content (excluding the forbidden-claims allowlist).
const { forbiddenClaims: _allowlist, ...scannable } = contract;
const scanTargets = [doc.toLowerCase(), JSON.stringify(scannable).toLowerCase()];

const FORBIDDEN_LIVE = [
  "storage is live", "hosting is live", "payments are live", "payment is live",
  "email sending is live", "email is live", "token gating is live",
  "identity verification is live", "identity access is live",
  "live payment is available", "live email sending is available",
  "live storage is available", "live hosting is available", "decentralized storage is live",
];
const FORBIDDEN_MEDICAL = [
  "we diagnose", "we will diagnose", "prescribe a dose", "prescribe medication",
  "cure your", "will cure", "guaranteed weight loss", "guaranteed results", "dosage of",
];
const FORBIDDEN_SECRET_EXAMPLE = [
  "use this private key", "paste your private key", "paste your seed phrase",
  "enter your api secret", "here is my seed phrase", "here is my private key",
  "private key:", "seed phrase:", "api secret:", "mnemonic:",
];
for (const text of scanTargets) {
  for (const phrase of [...FORBIDDEN_LIVE, ...FORBIDDEN_MEDICAL, ...FORBIDDEN_SECRET_EXAMPLE]) {
    assert.equal(text.includes(phrase), false, `Workflow content must not contain: "${phrase}"`);
  }
}

// 15. Self-check passes.
const checkResult = spawnSync(process.execPath, [HELPER_PATH, "--check"], { encoding: "utf8" });
assert.equal(checkResult.status, 0, `Workflow --check should exit 0. stderr=${checkResult.stderr}`);

// 16. Helper rejects credential-shaped flags (no secret-taking).
const reject = spawnSync(process.execPath, [HELPER_PATH, "--json", "--private-key", "redacted"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "Workflow helper should reject credential-shaped flags");
assert.ok(reject.stdout.includes("Forbidden credential-shaped flag"), "Workflow helper should explain forbidden credential flags");

// 17. Handoff carries the QA + safety sections.
for (const phrase of [
  "Run This Workflow (Customer Quick Start)",
  "Planned-Not-Live Honesty Prompts",
  "Safety Tests (Medical Boundary)",
  "Secret-Safety Tests",
  "Issue Ledger",
  "Do not paste seed phrases",
]) {
  assert.ok(handoff.includes(phrase), `Hermes handoff should include: ${phrase}`);
}

// 18. Reusable Matterhorn workflow pattern slice.
assert.equal(contract.category, "wellness", "Workflow category should be wellness");
assert.equal(
  contract.manifestVersion,
  "matterhorn.workflow.manifest.v1",
  "manifestVersion should match the shared workflow contract",
);
const ALLOWED_MANIFEST_STATUSES = [
  "live_local",
  "planned_not_live",
  "preview_only",
  "external_handoff_required",
  "blocked_by_policy",
];
assert.ok(
  ALLOWED_MANIFEST_STATUSES.includes(contract.manifestStatus),
  "manifestStatus should be an allowed contract status",
);
assert.equal(contract.reusablePattern?.isReusablePattern, true, "Workflow should declare a reusable pattern");
assert.equal(contract.reusablePattern?.notCustomUi, true, "Workflow should declare no custom UI");
assert.ok(
  String(contract.reusablePattern?.sharedContract).includes("matterhorn-workflow-contract"),
  "Reusable pattern should reference the shared workflow contract",
);

// Reusability across service-professional roles, not a single role.
const professionals = contract.serviceProfessionals.join(" | ");
for (const pro of ["Personal trainer", "Yoga instructor", "Dietician", "Gym", "service professionals"]) {
  assert.ok(professionals.includes(pro), `serviceProfessionals should include: ${pro}`);
}

// Every service hook carries the contract planned_not_live status.
for (const hook of contract.serviceHooks) {
  assert.equal(hook.contractStatus, "planned_not_live", `Service hook ${hook.id} should be planned_not_live`);
}

// The five reusable QA example prompts, each client-safe (no payment, no email).
const EXAMPLE_PROMPTS = [
  "Create a 4-week beginner strength plan",
  "Turn this into a client PDF packet",
  "Draft a yoga class plan for lower-back mobility",
  "Create a dietician-safe meal planning template without medical claims",
  "Prepare a future paid program page, but do not process payment",
];
const examplePromptText = contract.examplePrompts.map((e) => e.prompt);
for (const prompt of EXAMPLE_PROMPTS) {
  assert.ok(examplePromptText.includes(prompt), `Workflow should include example prompt: ${prompt}`);
  assert.ok(doc.includes(prompt), `Doc should include example prompt: ${prompt}`);
  assert.ok(handoff.includes(prompt), `Handoff should include example prompt: ${prompt}`);
}
for (const example of contract.examplePrompts) {
  assert.ok(
    typeof example.safetyCaveat === "string" && example.safetyCaveat.length > 0,
    `Example ${example.id} should carry a safety caveat`,
  );
  assert.equal(example.processesPayment, false, `Example ${example.id} must not process payment`);
  assert.equal(example.sendsEmail, false, `Example ${example.id} must not send email`);
}

// Doc + handoff carry the reusable-pattern sections.
for (const phrase of [
  "Reusable Matterhorn Workflow Pattern",
  "Example Prompts (Reusable Variants)",
  "wellness_creator_workflow",
  "planned_not_live",
]) {
  assert.ok(doc.includes(phrase), `Doc should include: ${phrase}`);
}
assert.ok(
  handoff.includes("Reusable Pattern Black-Box Prompts"),
  "Handoff should include the reusable-pattern black-box prompts",
);

// 19. Any prompt, one workflow — free-form support is declared and safe.
assert.equal(contract.freeformSupport?.acceptsAnyPrompt, true, "Workflow should accept any prompt");
assert.equal(contract.freeformSupport?.notLimitedToCanonical, true, "Workflow should not be limited to canonical prompts");
assert.ok(
  Array.isArray(contract.freeformSupport?.guardrails) && contract.freeformSupport.guardrails.length >= 4,
  "Free-form support should declare safety guardrails",
);
const categoriesText = (contract.freeformSupport?.exampleRequestCategories || []).join(" | ").toLowerCase();
for (const cat of ["training", "diet", "strength", "yoga"]) {
  assert.ok(categoriesText.includes(cat), `Free-form categories should mention: ${cat}`);
}

// 19a. THOROUGH: a wide spread of arbitrary trainer prompts must all route to a
//      client-safe artifact requiring a disclaimer, with no payment/email/secret.
const PROMPT_SWEEP = [
  "Create a 4-week beginner strength plan",
  "Build me a custom 6-week powerlifting peaking block",
  "Design a 30-minute beginner kettlebell circuit",
  "Make a hypertrophy upper/lower split",
  "Write a vegetarian high-protein meal-planning template",
  "Draft a cutting diet plan for general fat loss",
  "Plan a restorative yoga class for stress and sleep",
  "Draft a yoga class plan for lower-back mobility",
  "Give me a daily mobility and stretching routine",
  "Create a marathon base-building running plan",
  "Build a beginner cycling endurance plan",
  "Give me a daily habit and accountability plan",
  "Make a sleep and recovery routine",
  "Turn this into a client PDF packet",
  "Prepare an offer page and onboarding questionnaire",
  "Create this week's client progress check-in",
  "Whatever you think a new client needs in week one",
  "Surprise me with something useful for my clients",
  "",
  "asdf qwer custom thing",
];
for (const prompt of PROMPT_SWEEP) {
  const routed = routeFreeformPrompt(prompt);
  assert.equal(routed.safe, true, `Free-form prompt should be safe: "${prompt}"`);
  assert.equal(routed.disclaimerRequired, true, `Free-form prompt should require a disclaimer: "${prompt}"`);
  assert.equal(routed.refused, false, `Normal prompt should not be refused: "${prompt}"`);
  assert.ok(routed.artifactType, `Free-form prompt should route to an artifact type: "${prompt}"`);
  assert.equal(routed.paymentProcessed, false, `Free-form prompt must not process payment: "${prompt}"`);
  assert.equal(routed.emailSent, false, `Free-form prompt must not send email: "${prompt}"`);
  assert.equal(routed.acceptsSecrets, false, `Free-form prompt must not accept secrets: "${prompt}"`);
}

// 19b. Secret-shaped inputs are refused and never echoed back.
const SECRET_SWEEP = [
  "my seed phrase is correct horse battery staple apple river",
  "here is my private key 0x" + "a".repeat(40),
  "use this api secret sk_live_supersecretvalue",
  "wallet export: paste the mnemonic below",
];
for (const secret of SECRET_SWEEP) {
  const routed = routeFreeformPrompt(secret);
  assert.equal(routed.refused, true, `Secret-shaped input should be refused: "${secret}"`);
  assert.equal(routed.artifactType, null, "Refused routing should produce no artifact type");
  assert.equal(routed.acceptsSecrets, false, "Refused routing must not accept secrets");
  assert.equal(JSON.stringify(routed).includes(secret), false, "Refused routing must not echo the secret input");
}

// 20. Customer-management deepening + reproducible progress check-in fixture.
const cm = contract.customerManagement;
assert.ok(cm, "Contract should include a customerManagement block");
assert.ok(Array.isArray(cm.followUpCadence) && cm.followUpCadence.length >= 3, "followUpCadence should have >=3 touchpoints");
assert.ok(cm.feedbackForm, "customerManagement should include a feedback form");
assert.ok(Array.isArray(cm.renewalUpsell) && cm.renewalUpsell.length >= 1, "customerManagement should include renewal/up-sell prompts");
assert.ok(cm.progressCheckIn?.fixture, "customerManagement should reference a progress check-in fixture");

const PROGRESS_FIXTURE = cm.progressCheckIn.fixture;
assert.equal(PROGRESS_FIXTURE, "docs/wellness-creator-workflow/progress-check-in.md", "Progress fixture path should be stable");
assert.ok(existsSync(PROGRESS_FIXTURE), `Progress check-in fixture should exist: ${PROGRESS_FIXTURE}`);
const progressFixture = readFileSync(PROGRESS_FIXTURE, "utf8");
assert.ok(
  progressFixture.includes("not medical advice, diagnosis, or treatment"),
  "Progress check-in fixture should carry the non-medical disclaimer",
);
// The "Client progress check-in" artifact type is part of the customer-management stage.
const cmStage = contract.stages.find((s) => s.id === "customer-management");
assert.ok(cmStage.artifacts.includes("Client progress check-in"), "Customer-management stage should include the progress check-in artifact");

// 20a. No medical / live-service / secret strings in the progress fixture.
const progressText = progressFixture.toLowerCase();
for (const phrase of [
  ...["we diagnose", "prescribe a dose", "cure your", "will cure", "guaranteed weight loss", "guaranteed results", "dosage of"],
  ...["storage is live", "hosting is live", "payments are live", "payment is live", "email sending is live", "token gating is live"],
  ...["private key", "seed phrase", "api secret", "mnemonic", "wallet export", "signed payload"],
]) {
  assert.equal(progressText.includes(phrase), false, `Progress fixture must not contain: "${phrase}"`);
}

// 21. Doc + handoff carry the free-form and customer-management sections.
for (const phrase of ["Any Prompt, One Workflow", "Free-Form Support", "client progress check-in", "progress-check-in.md"]) {
  assert.ok(doc.includes(phrase), `Doc should include: ${phrase}`);
}
for (const phrase of ["Free-Form Prompt Tests", "Customer Management & Progress Check-In Tests"]) {
  assert.ok(handoff.includes(phrase), `Handoff should include: ${phrase}`);
}

// 22. Exposed through the existing generic Matterhorn workflow surfaces.
const gs = contract.genericSurfaces;
assert.ok(gs, "Contract should include a genericSurfaces block");
assert.equal(gs.notCustomApp, true, "genericSurfaces.notCustomApp must be true");
assert.equal(gs.catalogWorkflowId, "wellness_creator_workflow", "catalog id should be wellness_creator_workflow");
assert.equal(
  gs.templateRegistryId,
  "wellness_creator_service_workflow",
  "template registry id should be wellness_creator_service_workflow",
);
// Prove the exposure is real: the ids actually appear in the generic surfaces.
const catalogSource = readFileSync("scripts/matterhorn-workflow-catalog.mjs", "utf8");
assert.ok(
  catalogSource.includes("wellness_creator_workflow"),
  "Workflow catalog should register wellness_creator_workflow",
);
const typesSource = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
assert.ok(
  typesSource.includes("wellness_creator_service_workflow"),
  "Template registry types should register wellness_creator_service_workflow",
);

// 22a. The four CLI/operator examples route to a client-safe artifact.
const OPERATOR_PROMPTS = [
  "create a 4-week fat loss plan for a beginner",
  "make a yoga mobility plan for an office worker",
  "create a client progress check-in",
  "package a paid 8-week coaching program",
];
const operatorPromptText = contract.operatorExamples.map((e) => e.prompt);
for (const prompt of OPERATOR_PROMPTS) {
  assert.ok(operatorPromptText.includes(prompt), `Operator examples should include: ${prompt}`);
  assert.ok(doc.includes(prompt), `Doc should include operator example: ${prompt}`);
  assert.ok(handoff.includes(prompt), `Handoff should include operator example: ${prompt}`);
}
for (const example of contract.operatorExamples) {
  assert.ok(example.artifactType, `Operator example "${example.prompt}" should route to an artifact`);
  assert.equal(example.safe, true, `Operator example "${example.prompt}" must be safe`);
  assert.equal(example.disclaimerRequired, true, `Operator example "${example.prompt}" must require a disclaimer`);
  assert.equal(example.paymentProcessed, false, `Operator example "${example.prompt}" must not process payment`);
  assert.equal(example.emailSent, false, `Operator example "${example.prompt}" must not send email`);
}

// 22b. Clinical requests are redirected to educational/safety language, not answered.
const MEDICAL_SWEEP = [
  "Diagnose my client's knee pain",
  "Prescribe a supplement dose and medication for my client",
  "Build a plan to treat my client's diabetes",
  "Give a rehab protocol for a torn ACL",
  "Promise this cures her thyroid condition",
];
for (const prompt of MEDICAL_SWEEP) {
  const routed = routeFreeformPrompt(prompt);
  assert.equal(routed.redirected, true, `Clinical request should be redirected: "${prompt}"`);
  assert.equal(routed.disclaimerRequired, true, `Redirected request should require a disclaimer: "${prompt}"`);
  assert.equal(routed.educationalOnly, true, `Redirected request should be educational only: "${prompt}"`);
  assert.equal(routed.paymentProcessed, false, "Redirected request must not pay");
  assert.equal(routed.emailSent, false, "Redirected request must not email");
  assert.equal(routed.acceptsSecrets, false, "Redirected request must not accept secrets");
  assert.ok(
    /qualified healthcare professional/i.test(routed.guidance || ""),
    `Redirect should refer to a professional: "${prompt}"`,
  );
  assert.ok(
    !/strength program|training program|nutrition education/i.test(routed.artifactType || ""),
    `Clinical request must not produce a normal program artifact: "${prompt}"`,
  );
}
// Non-clinical prompts must NOT be redirected (no false positives).
for (const prompt of OPERATOR_PROMPTS) {
  assert.notEqual(routeFreeformPrompt(prompt).redirected, true, `Non-clinical prompt should not be redirected: ${prompt}`);
}

// 22c. No live-service execution is claimed in the generic-surface / operator content.
const surfaceText = JSON.stringify({ genericSurfaces: gs, operatorExamples: contract.operatorExamples }).toLowerCase();
for (const phrase of [
  "storage is live", "hosting is live", "payments are live", "payment is live",
  "email sending is live", "token gating is live", "identity verification is live",
]) {
  assert.equal(surfaceText.includes(phrase), false, `Generic-surface content must not claim a live service: "${phrase}"`);
}

// 22d. Doc + handoff carry the generic-surface sections.
assert.ok(doc.includes("Exposed Through Generic Matterhorn Workflow Surfaces"), "Doc should explain generic-surface exposure");
assert.ok(doc.includes("not a custom wellness app"), "Doc should state this is not a custom wellness app");
assert.ok(handoff.includes("Generic-Surface & Operator-Example Tests"), "Handoff should include generic-surface QA");

console.log("Wellness Creator Workflow gate passed.");
