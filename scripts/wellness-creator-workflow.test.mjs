#!/usr/bin/env node
// Gate for the full Longevity Creator Workflow.
// Proves: it is framed as a full workflow (not a pilot); every service hook is
// planned-not-live; no medical-advice expansion; no live payments/storage/
// email/identity claims; no secret-taking examples; and every canonical prompt
// produces a safe expected artifact.
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { routeFreeformPrompt } from "./wellness-creator-workflow.mjs";

const DOC_PATH = "docs/wellness-creator-workflow.md";
const HANDOFF_PATH = "docs/handoffs/hermes-wellness-creator-workflow-qa.md";
const HELPER_PATH = "scripts/wellness-creator-workflow.mjs";

// 1. Files exist.
for (const path of [DOC_PATH, HANDOFF_PATH, HELPER_PATH]) {
  assert.ok(existsSync(path), `Longevity Creator Workflow file should exist: ${path}`);
}

const doc = readFileSync(DOC_PATH, "utf8");
const handoff = readFileSync(HANDOFF_PATH, "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 2. Test wired into package.json.
assert.equal(
  pkg.scripts?.["test:wellness-creator-workflow"],
  "node scripts/wellness-creator-workflow.test.mjs",
  "package.json should expose the Longevity Creator Workflow gate",
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
  // Beta black-box QA regressions: symptom interpretation + cure-claims + named GI conditions.
  "is this rash a sign of something serious?",
  "create a meal plan to cure my client's IBS",
  "what is wrong with my client's stomach, is it serious",
  "build a plan for my client's PCOS",
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
for (const prompt of [
  ...OPERATOR_PROMPTS,
  "low-sodium plan avoiding cured meats",
  "secure a habit tracker for my client",
  "restorative yoga class for stress and better sleep",
  "high-protein vegetarian meal-planning template",
]) {
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
assert.ok(doc.includes("not a custom longevity app"), "Doc should state this is not a custom longevity app");
assert.ok(handoff.includes("Generic-Surface & Operator-Example Tests"), "Handoff should include generic-surface QA");

// 23. Longevity Creator Service Workflow layer: artifact contracts, service
//     builder intents, sample prompts, sensitive redirects, beyond-Web3.
const ARTIFACT_IDS = [
  "client_plan",
  "intake_questionnaire",
  "progress_check_in",
  "video_lesson_script",
  "client_tracker",
  "offer_landing_packet",
  "renewal_upsell_note",
];
assert.ok(Array.isArray(contract.artifactContracts), "Contract should include artifactContracts");
const contractIds = contract.artifactContracts.map((c) => c.id);
for (const id of ARTIFACT_IDS) {
  assert.ok(contractIds.includes(id), `artifactContracts should include: ${id}`);
  const item = contract.artifactContracts.find((c) => c.id === id);
  assert.equal(item.status, "live_local", `Artifact contract ${id} should be live_local`);
  assert.ok(item.disclaimer, `Artifact contract ${id} should carry a disclaimer`);
}

// Service-builder intents map to contracts and route correctly.
const INTENT_EXPECT = {
  "create a 4-week training plan": "client_plan",
  "create a yoga program": "client_plan",
  "create a dietician client packet": "client_plan",
  "create a client check-in": "progress_check_in",
  "package a paid program": "offer_landing_packet",
  "create a client video script": "video_lesson_script",
};
assert.ok(Array.isArray(contract.serviceBuilder?.intents), "Contract should include serviceBuilder.intents");
for (const [intent, expected] of Object.entries(INTENT_EXPECT)) {
  const routed = routeFreeformPrompt(intent).serviceArtifactContract;
  assert.equal(routed, expected, `Intent "${intent}" should route to ${expected} (got ${routed})`);
}

// 8-12 sample prompts, each routing to its expected contract, safe + disclaimer.
assert.ok(contract.samplePrompts.length >= 8 && contract.samplePrompts.length <= 12, "samplePrompts should number 8-12");
for (const sample of contract.samplePrompts) {
  assert.ok(ARTIFACT_IDS.includes(sample.routedArtifactContract), `Sample "${sample.prompt}" should route to a known contract`);
  assert.equal(sample.routedArtifactContract, sample.expectedArtifact, `Sample "${sample.prompt}" should route to ${sample.expectedArtifact}`);
  assert.equal(sample.safe, true, `Sample "${sample.prompt}" must be safe`);
  assert.equal(sample.disclaimerRequired, true, `Sample "${sample.prompt}" must require a disclaimer`);
  assert.ok(doc.includes(sample.prompt), `Doc should include sample prompt: ${sample.prompt}`);
}

// Clinical / sensitive prompts redirect (no service artifact), incl. pregnancy + eating disorder.
for (const clinical of [
  "my client has knee pain, diagnose it and prescribe rehab",
  "build a prenatal yoga plan for my pregnant client",
  "make a meal plan for a client with an eating disorder",
  "treat my client's diabetes with a diet",
]) {
  const routed = routeFreeformPrompt(clinical);
  assert.equal(routed.redirected, true, `Sensitive prompt should redirect: "${clinical}"`);
  assert.ok(/qualified healthcare professional/i.test(routed.guidance || ""), `Redirect should refer out: "${clinical}"`);
  assert.notEqual(routed.serviceArtifactContract, "client_plan", "Clinical prompt must not build a normal artifact");
}

// Secret-shaped text is refused and not echoed.
const secret = "my seed phrase is apple banana cherry tiger river stone";
const secretRouted = routeFreeformPrompt(secret);
assert.equal(secretRouted.refused, true, "Secret-shaped input should be refused");
assert.equal(secretRouted.artifactType, null, "Refused routing should produce no artifact");
assert.equal(JSON.stringify(secretRouted).includes("apple banana"), false, "Refused routing must not echo the secret");

// Beyond-Web3 framing with planned-not-live future hooks.
assert.equal(contract.matterhornBeyondWeb3?.firstWeb2Workflow, true, "Should declare the first Web2 workflow");
for (const hook of ["storage/hosting", "payments", "email", "identity/access"]) {
  assert.ok(contract.matterhornBeyondWeb3.plannedNotLiveServiceHooks.includes(hook), `Beyond-Web3 should list planned hook: ${hook}`);
}

// Doc carries the new sections; must not regress into self-describing pilot language.
for (const phrase of [
  "Service Builder & Artifact Contracts",
  "Sample Prompts (Hermes / Customer Demos)",
  "How This Demonstrates Matterhorn Beyond Web3",
  "first Web2 / customer-business workflow",
]) {
  assert.ok(doc.includes(phrase), `Doc should include: ${phrase}`);
}
assert.equal(contract.isPilot, false, "Workflow must not regress to a pilot");
assert.equal(contract.fullWorkflow, true, "Workflow must remain a full workflow");
for (const pilotPhrase of ["this is a pilot", "still a pilot", "wellness creator pilot demonstrates"]) {
  assert.equal(doc.toLowerCase().includes(pilotPhrase), false, `Doc must not describe itself as a pilot: ${pilotPhrase}`);
}
assert.ok(handoff.includes("Service-Builder & Artifact-Contract Tests"), "Handoff should include service-builder QA");

// 24. Customer Offer Builder layer.
const offer = contract.offerBuilder;
assert.ok(offer, "Contract should include offerBuilder");
for (const persona of ["personal_trainer", "yoga_instructor", "dietician", "hybrid_coach"]) {
  assert.ok(offer.personas.includes(persona), `offerBuilder.personas should include ${persona}`);
}
for (const id of ["starter_4_week", "transformation_8_week", "group_cohort", "corporate_wellness", "habit_reset"]) {
  assert.ok(offer.offerTypes.some((o) => o.id === id), `offerBuilder.offerTypes should include ${id}`);
}
for (const id of ["offer_page", "client_intake", "weekly_plan", "video_script", "progress_tracker", "check_in_note", "renewal_offer"]) {
  assert.ok(offer.deliverables.some((d) => d.id === id), `offerBuilder.deliverables should include ${id}`);
}
for (const hook of offer.serviceHooks) {
  assert.equal(hook.status, "planned_not_live", `offerBuilder hook ${hook.id} must be planned_not_live`);
}
for (const flagKey of ["educationalOnly", "noMedicalDiagnosis", "noTreatmentPlan", "noPaymentProcessing", "noEmailSending"]) {
  assert.equal(offer.safety[flagKey], true, `offerBuilder.safety.${flagKey} must be true`);
}

// CLI --offer <persona> --json for the three documented personas.
function runOffer(persona) {
  const result = spawnSync(process.execPath, [HELPER_PATH, "--offer", persona, "--json"], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  return { status: result.status, json: result.stdout ? JSON.parse(result.stdout) : null };
}
const OFFER_FIXTURES = {
  personal_trainer: "docs/wellness-creator-workflow/personal-trainer-offer.md",
  dietician: "docs/wellness-creator-workflow/dietician-client-packet.md",
  yoga_instructor: "docs/wellness-creator-workflow/yoga-instructor-program.md",
};
for (const [persona, fixturePath] of Object.entries(OFFER_FIXTURES)) {
  const { status, json } = runOffer(persona);
  assert.equal(status, 0, `--offer ${persona} should exit 0`);
  assert.equal(json.mode, "offer", `--offer ${persona} should be offer mode`);
  assert.equal(json.persona, persona, `--offer ${persona} should resolve the persona`);
  assert.equal(json.offerTypes.length, 5, `--offer ${persona} should have five offer types`);
  assert.equal(json.deliverables.length, 7, `--offer ${persona} should have seven deliverables`);
  for (const hook of json.serviceHooks) {
    assert.equal(hook.status, "planned_not_live", `--offer ${persona} hook ${hook.id} must be planned_not_live`);
  }
  assert.equal(json.fixture, fixturePath, `--offer ${persona} should point at its fixture`);
  // Fixture exists, carries the disclaimer, and has no live/medical/secret claims.
  assert.ok(existsSync(fixturePath), `Offer fixture should exist: ${fixturePath}`);
  const fixture = readFileSync(fixturePath, "utf8");
  assert.ok(fixture.includes("not medical advice, diagnosis, or treatment"), `${fixturePath} should carry the non-medical disclaimer`);
  const lower = fixture.toLowerCase();
  for (const forbidden of [
    "we diagnose", "prescribe a dose", "cure your", "will cure", "guaranteed weight loss", "guaranteed results",
    "storage is live", "hosting is live", "payments are live", "payment is live", "email sending is live", "token gating is live",
    "private key", "seed phrase", "api secret", "wallet export",
  ]) {
    assert.equal(lower.includes(forbidden), false, `${fixturePath} must not contain: "${forbidden}"`);
  }
}
// Invalid persona is rejected.
const badOffer = spawnSync(process.execPath, [HELPER_PATH, "--offer", "bogus", "--json"], { encoding: "utf8" });
assert.notEqual(badOffer.status, 0, "Unknown offer persona should exit non-zero");
assert.ok(JSON.parse(badOffer.stdout).error.includes("Unknown offer persona"), "Unknown persona should report an error");

// Doc + handoff carry the offer-builder material.
for (const phrase of [
  "Customer Offer Builder",
  "personal-trainer-offer.md",
  "dietician-client-packet.md",
  "yoga-instructor-program.md",
  "planned_not_live",
]) {
  assert.ok(doc.includes(phrase), `Doc should include offer-builder reference: ${phrase}`);
}
assert.ok(handoff.includes("Customer Offer Builder Tests"), "Handoff should include offer-builder QA");

// 25. Client Lifecycle layer.
const EXPECTED_LIFECYCLE_STAGES = [
  "lead_intake",
  "service_offer",
  "onboarding_questionnaire",
  "weekly_program",
  "progress_check_in",
  "renewal_follow_up",
  "client_handoff_packet",
];
const lifecycle = contract.clientLifecycle;
assert.ok(lifecycle, "Contract should include clientLifecycle");
assert.deepEqual(lifecycle.stages.map((s) => s.id), EXPECTED_LIFECYCLE_STAGES, "Lifecycle stages should be in order");
for (const stage of lifecycle.stages) {
  assert.ok(stage.deliverable, `Lifecycle stage ${stage.id} should name a deliverable`);
}
for (const hook of lifecycle.serviceHooks) {
  assert.equal(hook.status, "planned_not_live", `Lifecycle hook ${hook.id} must be planned_not_live`);
}
for (const flagKey of ["educationalOnly", "noMedicalDiagnosis", "noTreatmentPlan", "noPaymentProcessing", "noEmailSending"]) {
  assert.equal(lifecycle.safety[flagKey], true, `clientLifecycle.safety.${flagKey} must be true`);
}

// CLI --lifecycle <persona> --json for the three documented personas.
const LIFECYCLE_FIXTURES = {
  personal_trainer: "docs/wellness-creator-workflow/personal-trainer-lifecycle.md",
  yoga_instructor: "docs/wellness-creator-workflow/yoga-instructor-lifecycle.md",
  dietician: "docs/wellness-creator-workflow/dietician-lifecycle.md",
};
function runMode(modeFlag, value) {
  const result = spawnSync(process.execPath, [HELPER_PATH, modeFlag, value, "--json"], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  return { status: result.status, json: result.stdout ? JSON.parse(result.stdout) : null };
}
for (const [persona, fixturePath] of Object.entries(LIFECYCLE_FIXTURES)) {
  const { status, json } = runMode("--lifecycle", persona);
  assert.equal(status, 0, `--lifecycle ${persona} should exit 0`);
  assert.equal(json.mode, "lifecycle", `--lifecycle ${persona} should be lifecycle mode`);
  assert.equal(json.persona, persona, `--lifecycle ${persona} should resolve the persona`);
  assert.equal(json.stages.length, 7, `--lifecycle ${persona} should have seven stages`);
  assert.equal(json.fixture, fixturePath, `--lifecycle ${persona} should point at its fixture`);
  assert.ok(existsSync(fixturePath), `Lifecycle fixture should exist: ${fixturePath}`);
  const fixture = readFileSync(fixturePath, "utf8");
  assert.ok(fixture.includes("not medical advice, diagnosis, or treatment"), `${fixturePath} should carry the non-medical disclaimer`);
  const lower = fixture.toLowerCase();
  for (const forbidden of [
    "we diagnose", "prescribe a dose", "cure your", "will cure", "guaranteed weight loss", "guaranteed results",
    "storage is live", "hosting is live", "payments are live", "payment is live", "email sending is live", "token gating is live",
    "private key", "seed phrase", "api secret", "wallet export",
  ]) {
    assert.equal(lower.includes(forbidden), false, `${fixturePath} must not contain: "${forbidden}"`);
  }
}

// CLI --stage <stageId> --json for every stage; unknown stage rejected.
for (const stageId of EXPECTED_LIFECYCLE_STAGES) {
  const { status, json } = runMode("--stage", stageId);
  assert.equal(status, 0, `--stage ${stageId} should exit 0`);
  assert.equal(json.mode, "stage", `--stage ${stageId} should be stage mode`);
  assert.equal(json.id, stageId, `--stage ${stageId} should return that stage`);
  assert.ok(json.deliverable, `--stage ${stageId} should name a deliverable`);
  assert.equal(json.educationalOnly, true, `--stage ${stageId} should be educational only`);
}
const badStage = spawnSync(process.execPath, [HELPER_PATH, "--stage", "not_a_stage", "--json"], { encoding: "utf8" });
assert.notEqual(badStage.status, 0, "Unknown stage should exit non-zero");
assert.ok(JSON.parse(badStage.stdout).error.includes("Unknown lifecycle stage"), "Unknown stage should report an error");
const badLifecycle = spawnSync(process.execPath, [HELPER_PATH, "--lifecycle", "bogus", "--json"], { encoding: "utf8" });
assert.notEqual(badLifecycle.status, 0, "Unknown lifecycle persona should exit non-zero");

// Doc + handoff carry the lifecycle material.
for (const phrase of [
  "Client Lifecycle (Full Test-Customer Demo Path)",
  "personal-trainer-lifecycle.md",
  "yoga-instructor-lifecycle.md",
  "dietician-lifecycle.md",
  "--lifecycle personal_trainer --json",
]) {
  assert.ok(doc.includes(phrase), `Doc should include lifecycle reference: ${phrase}`);
}
assert.ok(handoff.includes("Client Lifecycle (Full Flow) Tests"), "Handoff should include lifecycle QA");

// 26. Customer Demo Pack: seven reusable client artifacts.
const demoPack = contract.customerDemoPack;
assert.ok(demoPack, "Contract should include customerDemoPack");
const DEMO_PACK_EXPECTED = {
  service_offer_page: { contract: "offer_landing_packet", fixture: "docs/wellness-creator-workflow/demo-pack/service-offer-page.md" },
  onboarding_questionnaire: { contract: "intake_questionnaire", fixture: "docs/wellness-creator-workflow/demo-pack/onboarding-questionnaire.md" },
  four_week_program: { contract: "client_plan", fixture: "docs/wellness-creator-workflow/demo-pack/4-week-program.md" },
  weekly_check_in_form: { contract: "progress_check_in", fixture: "docs/wellness-creator-workflow/demo-pack/weekly-check-in-form.md" },
  progress_summary: { contract: "progress_check_in", fixture: "docs/wellness-creator-workflow/demo-pack/progress-summary.md" },
  renewal_follow_up: { contract: "renewal_upsell_note", fixture: "docs/wellness-creator-workflow/demo-pack/renewal-follow-up.md" },
  client_handoff_packet: { contract: null, fixture: "docs/wellness-creator-workflow/demo-pack/client-handoff-packet.md" },
};
const demoIds = demoPack.deliverables.map((d) => d.id);
for (const id of Object.keys(DEMO_PACK_EXPECTED)) {
  assert.ok(demoIds.includes(id), `Demo pack should include deliverable: ${id}`);
}
for (const hook of demoPack.serviceHooks) {
  assert.equal(hook.status, "planned_not_live", `Demo pack hook ${hook.id} must be planned_not_live`);
}
for (const flagKey of ["educationalOnly", "noMedicalDiagnosis", "noTreatmentPlan", "noPaymentProcessing", "noEmailSending"]) {
  assert.equal(demoPack.safety[flagKey], true, `customerDemoPack.safety.${flagKey} must be true`);
}

const DEMO_FORBIDDEN = [
  "we diagnose", "prescribe a dose", "cure your", "will cure", "guaranteed weight loss", "guaranteed results",
  "storage is live", "hosting is live", "payments are live", "payment is live", "email sending is live", "token gating is live",
  "private key", "seed phrase", "api secret", "wallet export",
];
for (const deliverable of demoPack.deliverables) {
  const expected = DEMO_PACK_EXPECTED[deliverable.id];
  assert.ok(expected, `Unexpected demo-pack deliverable: ${deliverable.id}`);
  assert.equal(deliverable.fixture, expected.fixture, `Demo pack ${deliverable.id} fixture path should be stable`);
  // Example prompt routes to the deliverable's artifact contract (where set).
  if (expected.contract) {
    assert.equal(
      routeFreeformPrompt(deliverable.examplePrompt).serviceArtifactContract,
      expected.contract,
      `Demo pack "${deliverable.examplePrompt}" should route to ${expected.contract}`,
    );
  }
  // Fixture exists, carries the disclaimer, and has no forbidden strings.
  assert.ok(existsSync(deliverable.fixture), `Demo pack fixture should exist: ${deliverable.fixture}`);
  const fixture = readFileSync(deliverable.fixture, "utf8");
  assert.ok(fixture.includes("not medical advice, diagnosis, or treatment"), `${deliverable.fixture} should carry the non-medical disclaimer`);
  const lower = fixture.toLowerCase();
  for (const forbidden of DEMO_FORBIDDEN) {
    assert.equal(lower.includes(forbidden), false, `${deliverable.fixture} must not contain: "${forbidden}"`);
  }
}

// CLI --demo-pack [persona] --json.
const demoCli = spawnSync(process.execPath, [HELPER_PATH, "--demo-pack", "--json"], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
assert.equal(demoCli.status, 0, "--demo-pack should exit 0");
const demoCliJson = JSON.parse(demoCli.stdout);
assert.equal(demoCliJson.mode, "demo-pack", "--demo-pack should be demo-pack mode");
assert.equal(demoCliJson.deliverables.length, 7, "--demo-pack should expose seven deliverables");
const demoPersona = spawnSync(process.execPath, [HELPER_PATH, "--demo-pack", "dietician", "--json"], { encoding: "utf8" });
assert.equal(JSON.parse(demoPersona.stdout).persona, "dietician", "--demo-pack dietician should resolve the persona");
const demoBad = spawnSync(process.execPath, [HELPER_PATH, "--demo-pack", "bogus", "--json"], { encoding: "utf8" });
assert.notEqual(demoBad.status, 0, "--demo-pack with unknown persona should exit non-zero");

// Doc + handoff carry the demo-pack material.
for (const phrase of [
  "Customer Demo Pack (Test-Customer Ready)",
  "demo-pack/service-offer-page.md",
  "demo-pack/onboarding-questionnaire.md",
  "demo-pack/client-handoff-packet.md",
  "--demo-pack --json",
]) {
  assert.ok(doc.includes(phrase), `Doc should include demo-pack reference: ${phrase}`);
}
assert.ok(handoff.includes("Customer Demo Pack QA (Black-Box Reviewer)"), "Handoff should include demo-pack QA");
assert.ok(handoff.includes("Red-line failure examples"), "Handoff should include red-line failure examples");

// 27. Demo Packet Export: single shareable packet per persona, written to disk.
assert.ok(contract.demoPacketExport, "Contract should include demoPacketExport metadata");
assert.equal(contract.demoPacketExport.defaultPersona, "wellness_creator", "Export default persona should be wellness_creator");
for (const persona of ["personal_trainer", "yoga_instructor", "dietician", "wellness_creator"]) {
  assert.ok(contract.demoPacketExport.personas.includes(persona), `Export should support persona: ${persona}`);
}

const exportTmp = mkdtempSync(joinPath(tmpdir(), "wellness-export-"));
function runExport(extraArgs) {
  const result = spawnSync(process.execPath, [HELPER_PATH, "--demo-pack-export", ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout };
}
for (const persona of ["personal_trainer", "yoga_instructor", "dietician", "wellness_creator"]) {
  const outPath = joinPath(exportTmp, `${persona}.md`);
  const { status, stdout } = runExport([persona, "--output", outPath, "--json"]);
  assert.equal(status, 0, `--demo-pack-export ${persona} should exit 0`);
  const json = JSON.parse(stdout);
  assert.equal(json.mode, "demo-pack-export", "Should report demo-pack-export mode");
  assert.equal(json.ok, true, "Export should report ok");
  assert.equal(json.persona, persona, `Export should resolve persona ${persona}`);
  assert.equal(json.output, outPath, "Export should report the output path");
  assert.equal(json.deliverables.length, 7, "Export should stitch seven deliverables");
  // The written packet exists and is well-formed.
  assert.ok(existsSync(outPath), `Exported packet should exist: ${outPath}`);
  const packet = readFileSync(outPath, "utf8");
  assert.ok(packet.includes("# Longevity Creator Demo Packet"), "Packet should have the demo-packet header");
  assert.ok(packet.includes("## Safety & Boundaries"), "Packet should carry the safety footer");
  assert.ok(packet.includes("not medical advice, diagnosis, or treatment"), "Packet safety footer should state non-medical boundary");
  assert.ok(packet.includes("planned, not live"), "Packet should state planned-not-live hooks");
  for (const name of ["# Service offer page", "# New client onboarding questionnaire", "# 4-week program", "# Weekly check-in form", "# Progress summary", "# Renewal / follow-up message", "# Client handoff packet"]) {
    assert.ok(packet.includes(name), `Packet should include section: ${name}`);
  }
  // No medical/live/secret strings anywhere in the stitched packet.
  const lower = packet.toLowerCase();
  for (const forbidden of [
    "we diagnose", "prescribe a dose", "cure your", "will cure", "guaranteed weight loss", "guaranteed results",
    "storage is live", "hosting is live", "payments are live", "payment is live", "email sending is live", "token gating is live",
    "private key", "seed phrase", "api secret", "wallet export",
  ]) {
    assert.equal(lower.includes(forbidden), false, `Exported packet must not contain: "${forbidden}"`);
  }
}
// Default persona (no persona arg) resolves to wellness_creator; unknown rejected.
const defaultExport = runExport(["--json"]);
assert.equal(JSON.parse(defaultExport.stdout).persona, "wellness_creator", "No-persona export should default to wellness_creator");
const badExport = runExport(["bogus", "--json"]);
assert.notEqual(badExport.status, 0, "Unknown export persona should exit non-zero");

// Doc + handoff carry the export material.
for (const phrase of ["--demo-pack-export", "Demo Packet Export"]) {
  assert.ok(doc.includes(phrase), `Doc should include export reference: ${phrase}`);
}
assert.ok(handoff.includes("Demo Packet Export QA"), "Handoff should include export QA");

// 28. Longevity Memory safety lane.
const memory = contract.memory;
assert.ok(memory, "Contract should include the memory lane");
assert.equal(memory.writesMemory, false, "memory.writesMemory must be false (candidates only)");
for (const id of [
  "creator_service_type",
  "offer_preferences",
  "program_style",
  "check_in_cadence",
  "client_communication_preferences",
  "artifact_preferences",
  "renewal_follow_up_preferences",
]) {
  assert.ok(memory.allowedCategories.some((c) => c.id === id), `memory.allowedCategories should include ${id}`);
}
for (const id of [
  "diagnosis",
  "medication_advice",
  "medical_condition_treatment",
  "eating_disorder_treatment",
  "pregnancy_post_surgery_medical_plan",
  "private_health_records_without_consent",
]) {
  assert.ok(memory.forbiddenCategories.some((c) => c.id === id), `memory.forbiddenCategories should include ${id}`);
}
for (const flagKey of ["writesMemory", "remembersDiagnosis", "remembersMedication", "remembersTreatment", "remembersHealthRecords", "acceptsSecrets"]) {
  assert.equal(memory.safety[flagKey], false, `memory.safety.${flagKey} must be false`);
}

// --memory-candidates emits candidates without writing memory; unsafe withheld.
const memCli = spawnSync(process.execPath, [HELPER_PATH, "--memory-candidates", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(memCli.status, 0, "--memory-candidates should exit 0");
const memJson = JSON.parse(memCli.stdout);
assert.equal(memJson.mode, "memory-candidates", "should report memory-candidates mode");
assert.equal(memJson.writesMemory, false, "--memory-candidates must not write memory");
const allowed = memJson.candidates.filter((c) => c.allowed);
const blocked = memJson.candidates.filter((c) => !c.allowed);
assert.ok(allowed.length >= 4, "should propose at least four safe candidates");
assert.ok(blocked.length >= 5, "should refuse/redact the unsafe candidates");
for (const item of allowed) {
  assert.ok(item.category, "allowed candidate should carry a category");
  assert.ok(memory.allowedCategories.some((c) => c.id === item.category), `allowed candidate category should be known: ${item.category}`);
}
for (const item of blocked) {
  assert.equal(item.input, "[withheld]", "refused/redacted candidate must not echo source text");
  assert.ok(["refuse", "redact"].includes(item.action), "blocked candidate should be refuse or redact");
}
// Refused/redacted candidates must not echo their specific source text. Scan the
// candidates array for source-specific tokens (the generic category reason may
// name categories like "pregnancy/surgery"; that is descriptive, not a leak).
const candidatesOut = JSON.stringify(memJson.candidates).toLowerCase();
for (const forbidden of ["metformin", "diabetes", "500mg", "lab results", "third-trimester", "cutting protocol", "seed phrase", "apple banana"]) {
  assert.equal(candidatesOut.includes(forbidden), false, `--memory-candidates must not echo source text: "${forbidden}"`);
}

// Safe memory fixtures exist, carry the disclaimer, and have no forbidden strings.
const MEMORY_FIXTURE_PATHS = [
  "docs/wellness-creator-workflow/memory/safe-client-persona-memory.md",
  "docs/wellness-creator-workflow/memory/safe-program-preference-memory.md",
  "docs/wellness-creator-workflow/memory/safe-check-in-cadence-memory.md",
  "docs/wellness-creator-workflow/memory/safe-offer-builder-preference-memory.md",
];
for (const fixturePath of MEMORY_FIXTURE_PATHS) {
  assert.ok(existsSync(fixturePath), `Memory fixture should exist: ${fixturePath}`);
  const fixture = readFileSync(fixturePath, "utf8");
  assert.ok(fixture.includes("not medical advice, diagnosis, or treatment"), `${fixturePath} should carry the non-medical disclaimer`);
  const lower = fixture.toLowerCase();
  for (const forbidden of ["we diagnose", "prescribe a dose", "cure your", "guaranteed results", "private key", "seed phrase", "api secret", "wallet export"]) {
    assert.equal(lower.includes(forbidden), false, `${fixturePath} must not contain: "${forbidden}"`);
  }
}

// Doc + handoff carry the memory lane.
assert.ok(doc.includes("Longevity Memory Safety Lane"), "Doc should include the memory safety lane");
assert.ok(doc.includes("--memory-candidates"), "Doc should show the memory-candidates command");
assert.ok(handoff.includes("Longevity Memory QA"), "Handoff should include memory QA");

// 29. Longevity Memory QA evidence pack.
const memCli2 = spawnSync(process.execPath, [HELPER_PATH, "--memory-qa", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(memCli2.status, 0, "--memory-qa should exit 0");
const qa = JSON.parse(memCli2.stdout);
assert.equal(qa.mode, "memory-qa", "should report memory-qa mode");
assert.equal(qa.writesMemory, false, "--memory-qa must not write memory");
assert.ok(qa.notMedicalAdvice && /not medical advice/i.test(qa.notMedicalAdvice), "QA pack should say not medical advice");

// Safe candidates for each persona, all allowed and opt-in.
for (const persona of ["personal_trainer", "yoga_instructor", "dietician"]) {
  const list = qa.safeCandidatesByPersona[persona];
  assert.ok(Array.isArray(list) && list.length >= 3, `${persona} should have safe memory candidates`);
  for (const item of list) {
    assert.equal(item.allowed, true, `${persona} safe candidate should be allowed: "${item.input}"`);
    assert.equal(item.optIn, true, `${persona} safe candidate should be opt-in`);
    assert.ok(item.category, `${persona} safe candidate should carry a category`);
  }
}

// Clinical (diagnosis/prescription/treatment/eating-disorder/pregnancy/health-records) refused + withheld.
assert.ok(qa.refusedClinicalExamples.length >= 6, "should refuse a spread of clinical examples");
for (const item of qa.refusedClinicalExamples) {
  assert.equal(item.allowed, false, "clinical example must be refused/redacted");
  assert.equal(item.input, "[withheld]", "clinical example must not echo source text");
}
// Secret-shaped (seed/private key/API secret/wallet export) refused + withheld.
assert.ok(qa.refusedSecretExamples.length >= 4, "should refuse seed/key/secret/wallet examples");
for (const item of qa.refusedSecretExamples) {
  assert.equal(item.allowed, false, "secret example must be refused");
  assert.equal(item.action, "refuse", "secret example action should be refuse");
  assert.equal(item.input, "[withheld]", "secret example must not echo source text");
}

// Evidence summary verdicts + opt-in requirements + rerun commands.
for (const key of ["allSafeAllowed", "allClinicalRefused", "allSecretRefused", "noLiveServiceClaims"]) {
  assert.equal(qa.evidenceSummary[key], true, `evidenceSummary.${key} must be true`);
}
assert.equal(qa.evidenceSummary.anySourceEchoed, false, "evidence summary must show no source echo");
assert.equal(qa.evidenceSummary.writesMemory, false, "evidence summary must show no writes");
assert.ok(qa.optInRequirements.length >= 3, "QA pack should list opt-in requirements");
assert.ok(/opt-?in/i.test(qa.optInRequirements.join(" ")), "opt-in requirements should mention opt-in");
assert.ok(qa.rerunCommands.some((c) => c.includes("--memory-qa")), "rerun commands should include --memory-qa");
for (const flagKey of ["writesMemory", "remembersDiagnosis", "remembersMedication", "remembersTreatment", "remembersHealthRecords", "acceptsSecrets"]) {
  assert.equal(qa.safety[flagKey], false, `memoryQa.safety.${flagKey} must be false`);
}

// No clinical/secret source tokens or live-service claims anywhere in the QA pack.
const qaOut = JSON.stringify(qa).toLowerCase();
for (const leak of [
  "metformin", "diabetes", "500mg", "lab results", "third-trimester", "cutting protocol",
  "seed phrase", "private key", "api secret", "wallet export", "apple banana", "0xabc123",
  "payments are live", "email sending is live", "storage is live", "token gating is live",
]) {
  assert.equal(qaOut.includes(leak), false, `--memory-qa must not contain: "${leak}"`);
}

// Contract block matches the CLI mode, and docs carry the QA section.
assert.ok(contract.memoryQa, "Contract should include the memoryQa block");
assert.equal(contract.memoryQa.writesMemory, false, "contract memoryQa must not write memory");
assert.ok(doc.includes("--memory-qa"), "Doc should reference --memory-qa");
assert.ok(handoff.includes("Longevity Memory QA"), "Handoff should include the Longevity Memory QA section");

// 30. Longevity Memory contract adapter (suggestions only).
const sugCli = spawnSync(process.execPath, [HELPER_PATH, "--memory-suggestions", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(sugCli.status, 0, "--memory-suggestions should exit 0");
const sug = JSON.parse(sugCli.stdout);
assert.equal(sug.mode, "memory-suggestions", "should report memory-suggestions mode");
assert.equal(sug.writesMemory, false, "--memory-suggestions must not write memory");

// Tie the adapter to the merged contract shape (read packages/types read-only).
const memorySrc = readFileSync("packages/types/src/memory.ts", "utf8");
const contractVersionMatch = memorySrc.match(/MATTERHORN_MEMORY_SUGGESTION_VERSION\s*=\s*"([^"]+)"/);
assert.ok(contractVersionMatch, "memory.ts should define the suggestion version");
assert.equal(sug.suggestionVersion, contractVersionMatch[1], "adapter suggestion version must match the contract");
// The kind/scope/sensitivity/source we emit must exist in the contract enums.
for (const token of ['"client_profile"', '"user"', '"private"', '"user_confirmed"']) {
  assert.ok(memorySrc.includes(token), `memory.ts should define ${token}`);
}

// Persona examples present.
for (const persona of ["personal_trainer", "yoga_instructor", "dietician"]) {
  assert.ok(
    sug.suggestions.some((s) => s.proposedRecord.tags.includes(persona)),
    `suggestions should include a ${persona} example`,
  );
}

// All requested preference categories are converted (original + product slice).
const sugCategories = new Set(sug.suggestions.map((s) => s.proposedRecord.body.category));
for (const category of [
  "client_preference", "program_preference", "check_in_cadence", "equipment_constraints", "communication_preference", "dietary_preference",
  "client_communication_style", "preferred_program_length", "preferred_format", "offer_builder_preference", "export_format_preference",
]) {
  assert.ok(sugCategories.has(category), `suggestions should cover category: ${category}`);
}

// Adapter-level safety attributes: opt-in, educational, restricted, never clinical/auto-saved/hidden.
for (const key of ["optInOnly", "educationalOnly", "restrictedByDefault", "neverClinical", "neverAutoSaved", "noHiddenCapture"]) {
  assert.equal(sug.safetyAttributes[key], true, `safetyAttributes.${key} must be true`);
}

// Every suggestion is restricted-by-default, educational, opt-in, non-clinical, never auto-saved.
for (const s of sug.suggestions) {
  assert.equal(s.proposedRecord.sensitivity, "restricted", "suggestion sensitivity must be restricted by default");
  const b = s.proposedRecord.body;
  assert.equal(b.optIn, true, "suggestion body.optIn must be true");
  assert.equal(b.educationalOnly, true, "suggestion body.educationalOnly must be true");
  assert.equal(b.restrictedByDefault, true, "suggestion body.restrictedByDefault must be true");
  assert.equal(b.clinical, false, "suggestion body.clinical must be false");
  assert.equal(b.autoSaved, false, "suggestion body.autoSaved must be false");
}

// New clinical/medical refusal cases are never converted to a suggestion: no
// suggestion summary/body may contain clinical tokens, and they appear only as
// withheld refusals.
const suggestionsText = JSON.stringify(sug.suggestions).toLowerCase();
for (const clinicalToken of ["symptom", "lab result", "blood test", "prescription", "medication", "rehab", "medical record", "diagnosis", "torn ligament"]) {
  assert.equal(suggestionsText.includes(clinicalToken), false, `clinical token must not appear in suggestions: "${clinicalToken}"`);
}

// Every suggestion is opt-in / user-confirmed only and contract-shaped.
const ALLOWED_KINDS = ["user_preference", "project_fact", "protocol_address", "watchlist", "receipt", "workflow_artifact", "decision", "client_profile", "connector_preference", "mcp_tool_preference"];
assert.ok(sug.suggestions.length >= 9, "should propose at least nine safe suggestions");
for (const s of sug.suggestions) {
  assert.equal(s.version, sug.suggestionVersion, "suggestion version should match");
  assert.equal(s.captureMode, "user_confirmed_only", "suggestion captureMode must be user_confirmed_only");
  assert.equal(s.canAutoCapture, false, "suggestion must not auto-capture");
  assert.equal(s.requiresExplicitConsent, true, "suggestion must require explicit consent");
  assert.equal(s.forbiddenIfSecretDetected, true, "suggestion must forbid on secret detection");
  const r = s.proposedRecord;
  for (const field of ["id", "kind", "scope", "title", "summary", "body", "tags", "links", "provenance", "sensitivity", "createdAt", "updatedAt"]) {
    assert.ok(field in r, `proposedRecord must include ${field}`);
  }
  assert.ok(ALLOWED_KINDS.includes(r.kind), `record.kind must be a contract kind: ${r.kind}`);
  assert.equal(r.provenance.source, "user_confirmed", "record provenance must be user_confirmed");
  assert.ok(r.tags.includes("opt-in") && r.tags.includes("wellness"), "record tags must include wellness + opt-in");
}

// Clinical and secret inputs are refused/redacted and never become records.
assert.ok(sug.refused.length >= 6, "should refuse clinical + secret examples");
for (const item of sug.refused) {
  assert.equal(item.allowed, false, "refused item must not be allowed");
  assert.equal(item.input, "[withheld]", "refused item must be withheld");
}

// No clinical/secret source tokens or live-service claims anywhere.
const sugOut = JSON.stringify(sug).toLowerCase();
for (const leak of [
  "metformin", "diabetes", "500mg", "lab results", "third-trimester", "cutting protocol", "fodmap", " ibs",
  "symptom", "torn ligament", "blood test",
  "seed phrase", "private key", "api secret", "wallet export", "apple banana", "0xabc123",
  "payments are live", "email sending is live", "storage is live", "token gating is live",
]) {
  assert.equal(sugOut.includes(leak), false, `--memory-suggestions must not contain: "${leak}"`);
}

// Contract block + docs carry the adapter.
assert.ok(contract.memorySuggestions, "Contract should include memorySuggestions");
assert.equal(contract.memorySuggestions.writesMemory, false, "contract memorySuggestions must not write");
assert.ok(doc.includes("--memory-suggestions"), "Doc should reference --memory-suggestions");
assert.ok(handoff.includes("--memory-suggestions"), "Handoff should reference --memory-suggestions");

console.log("Longevity Creator Workflow gate passed.");
