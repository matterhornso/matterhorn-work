#!/usr/bin/env node

/**
 * Wellness Creator Workflow — offline contract + self-check.
 *
 * This is a full Matterhorn Work workflow (not a pilot, not a custom vertical
 * UI): a chat-first, end-to-end flow that lets a wellness creator design a
 * program, generate client artifacts, package a service, plan delivery, manage
 * customers, and export the whole thing as a Matterhorn / MCP artifact.
 *
 * The helper is intentionally offline. It does two things and never needs a
 * network, wallet, key, or payment account:
 *
 *   1. `--json` emits a versioned, machine-readable workflow contract
 *      (personas, canonical prompts, stages, expected artifact types,
 *      disclaimers, planned-not-live service hooks, demo checklist, Hermes QA
 *      checklist, and the forbidden-claims allowlist).
 *   2. `--check` validates the contract's internal safety invariants — every
 *      service hook planned-not-live, every canonical prompt mapped to a safe
 *      artifact, disclaimers present, and no affirmative live-service or
 *      medical claim in the emitted content. Exits non-zero on any violation.
 *
 * It never accepts secrets, never gives medical advice, and never moves funds.
 */

import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join, dirname } from "node:path";

const args = process.argv.slice(2);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const VERSION = "matterhorn.wellness.creator-workflow.v1";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

// Heuristic for free-form prompt text that looks like a secret. Such input is
// refused and never echoed back.
const SECRET_TEXT_RE =
  /(seed phrase|mnemonic|private key|api secret|api key|raw signature|signed payload|signed order|wallet export|passphrase|-----BEGIN|0x[a-f0-9]{40,})/i;

// Heuristic for prompts that ask for clinical care — diagnosis, prescription,
// medication/dosing, treating or curing a named condition or injury, symptom
// interpretation, or pregnancy- and eating-disorder-specific work. These are
// redirected to educational/safety language and a referral, never answered as
// medical advice.
const MEDICAL_INTENT_RE =
  /\b(diagnos\w*|prescrib\w*|prescription|medication|dosage)\b|\bdose\b|\b(cure\w*|treat\w*|heal\b|healing\b|rehab\w*)\b[^.?!]*\b(condition|disease|illness|injury|injuries|diabetes|hypertension|thyroid|cancer|asthma|arthritis|depression|anxiety|fracture|sprain|tear|torn|ligament|acl|chronic pain|back pain|knee pain|joint pain|pain|ibs|ibd|pcos|reflux|gerd|migraine|fibromyalgia|crohn)\b|\bcure[sd]?\b\s+(?:my|the|this|that|your|his|her|their|a|an)\b|\b(diabetes|hypertension|thyroid|cancer|herniated|sciatica|ibs|ibd|pcos|gerd|migraine|fibromyalgia|crohn)\b|\b(pregnan\w*|prenatal|ante[- ]?natal|post[- ]?natal|postpartum)\b|\b(eating disorder|disordered eating|anorexi\w*|bulimi\w*|binge[- ]?eating)\b|\bsign of\b|something serious|what(?:'s| is| are) wrong with|is (?:this|that|it) (?:normal|serious|an? infection)|should (?:i|we|they) be worried|\b(rash|lump|mole|swelling|numbness|chest pain|shortness of breath|fainting|dizziness|infected|infection)\b/i;

// Heuristic for memory candidates that must be redacted (never remembered):
// medication/dosing details, surgery/post-op plans, and private health records.
// Combined with MEDICAL_INTENT_RE (diagnosis/condition/pregnancy/eating disorder).
const MEMORY_REDACT_RE =
  /\b(\d+\s?(?:mg|mcg|ml|iu))\b|\b(once|twice|three times)\s+(?:a\s+)?(?:day|daily)\b|daily dose|\bmeds?\b|metformin|insulin|statin|antidepressant|\b(medical|health)\s+(?:record|records|history)\b|lab result|blood test|\bphi\b|\bhipaa\b|\bsurgery\b|post[- ]?op\b|post[- ]?surgery|without (?:explicit )?consent/i;

const FIXTURE_DIR = "docs/wellness-creator-workflow";
const PROGRESS_CHECKIN_FIXTURE = "progress-check-in.md";

// Affirmative medical / guarantee claims the workflow must never make. Written
// to NOT match the mandatory disclaimers (which contain the bare words
// "diagnosis" and "treatment" in a negative context).
const FORBIDDEN_CLAIM_RES = [
  /guaranteed\s+(?:weight|fat)\s+loss/i,
  /guaranteed\s+results?/i,
  /we\s+(?:will\s+)?diagnose/i,
  /prescrib\w*\s+(?:a\s+)?(?:dose|dosage|medication|drug)/i,
  /\bcure\s+(?:your|this|the)\b/i,
  /will\s+cure\b/i,
  /\bdosage\s+of\b/i,
];

// Affirmative "service is live" claims the workflow must never make.
const FORBIDDEN_LIVE_RES = [
  /storage is (?:now )?live/i,
  /hosting is (?:now )?live/i,
  /payments? (?:is|are) (?:now )?live/i,
  /email sending is (?:now )?live/i,
  /token gating is (?:now )?live/i,
  /identity (?:verification|access) is (?:now )?live/i,
  /live (?:payment|email sending|storage|hosting|token gating) is available/i,
  /decentralized storage is (?:now )?live/i,
];

const PERSONAS = [
  { id: "personal-trainer", label: "Personal trainer (independent)" },
  { id: "gym-instructor", label: "Gym instructor / group-class coach" },
  { id: "yoga-instructor", label: "Yoga instructor" },
  { id: "dietician", label: "Dietician / nutrition coach" },
];

// The seven-stage workflow. Each stage carries its canonical chat prompt and
// the client-safe artifacts it produces.
const STAGES = [
  {
    id: "intake",
    name: "Intake",
    description:
      "The creator describes their audience, goal, constraints, session type, duration, equipment, and level.",
    prompt:
      "Start a new wellness program — here is my audience, goal, constraints, session type, duration, equipment, and level",
    artifacts: ["Intake summary"],
  },
  {
    id: "program-design",
    name: "Program design",
    description:
      "Design a workout, yoga, or nutrition education plan with mandatory non-medical safety disclaimers.",
    prompt: "Design the program with safety disclaimers",
    artifacts: ["Program design plan"],
  },
  {
    id: "client-artifacts",
    name: "Client artifact generation",
    description: "Generate the client-facing artifacts for the program.",
    prompt:
      "Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker",
    artifacts: ["Weekly plan", "Video script", "Checklist", "FAQ", "Progress tracker"],
  },
  {
    id: "service-packaging",
    name: "Service packaging",
    description: "Package the program as a sellable service. No live payment is taken.",
    prompt:
      "Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text",
    artifacts: [
      "Offer page copy",
      "Pricing-package draft",
      "Onboarding questionnaire",
      "Terms / disclaimer text",
    ],
  },
  {
    id: "delivery-plan",
    name: "Delivery plan",
    description:
      "Draft how the program would be delivered through planned Matterhorn services. Every hook is planned, not live.",
    prompt: "Draft the delivery plan: storage/hosting, email updates, payments, and client access",
    artifacts: ["Delivery plan (planned hooks only)"],
  },
  {
    id: "customer-management",
    name: "Customer management",
    description: "Plan ongoing customer management for the program.",
    prompt:
      "Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts",
    artifacts: ["Follow-up cadence", "Feedback form", "Renewal / up-sell prompts", "Client progress check-in"],
  },
  {
    id: "export",
    name: "MCP / artifact export",
    description:
      "Export the workflow so it runs through Matterhorn Work, Claude Code, Codex, or as a shared artifact.",
    prompt: "Export this as a Matterhorn workflow / MCP artifact",
    artifacts: ["Matterhorn workflow / MCP export"],
  },
];

const CANONICAL_PROMPTS = STAGES.map((stage) => stage.prompt);

const PROMPT_ARTIFACTS = STAGES.map((stage) => ({
  stage: stage.id,
  prompt: stage.prompt,
  artifacts: stage.artifacts,
  safe: true,
}));

const EXPECTED_ARTIFACT_TYPES = [...new Set(STAGES.flatMap((stage) => stage.artifacts))];

const DISCLAIMERS = {
  general:
    "This content is for general fitness and wellness education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional before starting any exercise or nutrition program, especially if you have an existing health condition, are pregnant, or take medication.",
  nutrition:
    "This guidance is general healthy-eating information, not a clinical or therapeutic diet. It is not a substitute for care from a registered dietitian or doctor.",
  noGuarantee:
    "Results vary between individuals. No specific outcome, weight change, or fitness result is guaranteed.",
};

// Delivery-stage service hooks. Every one is planned, not live.
const SERVICE_HOOKS = [
  {
    id: "storage-hosting",
    name: "Storage / hosting",
    status: "planned, not live",
    statement: "Storage / hosting is planned, not live. No live decentralized storage publish happens.",
  },
  {
    id: "email-updates",
    name: "Email updates",
    status: "planned, not live",
    statement: "Email sending is planned, not live. No email is sent.",
  },
  {
    id: "payments",
    name: "Payments",
    status: "planned, not live",
    statement: "Payments are planned, not live. No funds move.",
  },
  {
    id: "identity-access",
    name: "Identity / access",
    status: "planned, not live",
    statement: "Identity / access gating is planned, not live. No token gating is enforced.",
  },
];

const DELIVERY_GUARANTEES = [
  "Storage / hosting is planned, not live.",
  "Email sending is planned, not live.",
  "Payments are planned, not live.",
  "Identity / access gating is planned, not live.",
  "No funds move.",
  "No email is sent.",
  "No token gating is enforced.",
  "No live decentralized storage publish happens.",
];

// ---- Wellness Creator Customer Offer Builder ----
// A complete, customer-safe layer for trainers, yoga instructors, and
// dieticians to package and deliver their services through Matterhorn Work.
// Everything is artifact-first and offline: no payment, email, hosting, or
// access action happens.
const OFFER_PERSONAS = ["personal_trainer", "yoga_instructor", "dietician", "hybrid_coach"];
const OFFER_PERSONA_LABELS = {
  personal_trainer: "Personal trainer",
  yoga_instructor: "Yoga instructor",
  dietician: "Dietician",
  hybrid_coach: "Hybrid coach",
};
const OFFER_TYPES = [
  { id: "starter_4_week", name: "4-week starter" },
  { id: "transformation_8_week", name: "8-week transformation" },
  { id: "group_cohort", name: "Group cohort" },
  { id: "corporate_wellness", name: "Corporate wellness" },
  { id: "habit_reset", name: "Habit reset" },
];
const OFFER_DELIVERABLES = [
  { id: "offer_page", name: "Offer page", artifactContract: "offer_landing_packet" },
  { id: "client_intake", name: "Client intake", artifactContract: "intake_questionnaire" },
  { id: "weekly_plan", name: "Weekly plan", artifactContract: "client_plan" },
  { id: "video_script", name: "Video script", artifactContract: "video_lesson_script" },
  { id: "progress_tracker", name: "Progress tracker", artifactContract: "client_tracker" },
  { id: "check_in_note", name: "Check-in note", artifactContract: "progress_check_in" },
  { id: "renewal_offer", name: "Renewal offer", artifactContract: "renewal_upsell_note" },
];
const OFFER_SERVICE_HOOKS = [
  { id: "storage-hosting", name: "Storage / hosting", status: "planned_not_live" },
  { id: "payments", name: "Payments", status: "planned_not_live" },
  { id: "email", name: "Email", status: "planned_not_live" },
  { id: "identity-access", name: "Identity / access", status: "planned_not_live" },
];
const OFFER_SAFETY = {
  educationalOnly: true,
  noMedicalDiagnosis: true,
  noTreatmentPlan: true,
  noPaymentProcessing: true,
  noEmailSending: true,
  noHosting: true,
  noTokenGating: true,
  noSecrets: true,
};
const OFFER_FIXTURES = {
  personal_trainer: `${FIXTURE_DIR}/personal-trainer-offer.md`,
  dietician: `${FIXTURE_DIR}/dietician-client-packet.md`,
  yoga_instructor: `${FIXTURE_DIR}/yoga-instructor-program.md`,
};

function buildOfferBuilder(persona = null) {
  const resolved = persona && OFFER_PERSONAS.includes(persona) ? persona : null;
  return {
    title: "Wellness Creator Customer Offer Builder",
    notCustomApp: true,
    educationalOnly: true,
    personas: OFFER_PERSONAS,
    persona: resolved,
    personaLabel: resolved ? OFFER_PERSONA_LABELS[resolved] : null,
    offerTypes: OFFER_TYPES,
    deliverables: OFFER_DELIVERABLES,
    serviceHooks: OFFER_SERVICE_HOOKS,
    plannedNotLive: DELIVERY_GUARANTEES,
    safety: OFFER_SAFETY,
    fixtures: OFFER_FIXTURES,
    fixture: resolved ? OFFER_FIXTURES[resolved] ?? null : null,
    disclaimer: DISCLAIMERS.general,
    note: "Package and deliver a wellness service as client-safe artifacts. Every service hook is planned, not live; no payment, email, hosting, or access action happens.",
  };
}

// ---- Wellness Creator Client Lifecycle ----
// The complete, ordered client-delivery path a wellness creator runs through
// chat. Every stage produces a client-safe artifact; nothing is hosted,
// charged, emailed, or gated.
const CLIENT_LIFECYCLE = [
  { id: "lead_intake", name: "Lead intake", order: 1, artifactContract: "intake_questionnaire", deliverable: "Lead intake form", description: "Capture a prospective client's goals, schedule, and general non-clinical context." },
  { id: "service_offer", name: "Service offer", order: 2, artifactContract: "offer_landing_packet", deliverable: "Offer page", description: "Present the program with placeholder pricing only; no payment is processed." },
  { id: "onboarding_questionnaire", name: "Onboarding questionnaire", order: 3, artifactContract: "intake_questionnaire", deliverable: "Onboarding questionnaire", description: "Confirm goals, experience, equipment, and consent before the program starts." },
  { id: "weekly_program", name: "Weekly program", order: 4, artifactContract: "client_plan", deliverable: "Weekly plan", description: "A structured, educational weekly program with progression notes." },
  { id: "progress_check_in", name: "Progress check-in", order: 5, artifactContract: "progress_check_in", deliverable: "Weekly check-in", description: "Track adherence, energy, and wins/blockers, with coach adjustments." },
  { id: "renewal_follow_up", name: "Renewal / follow-up", order: 6, artifactContract: "renewal_upsell_note", deliverable: "Renewal note", description: "A renewal or follow-up draft with a progress recap; pricing is a draft only." },
  { id: "client_handoff_packet", name: "Client handoff packet", order: 7, artifactContract: null, deliverable: "Handoff packet", description: "A wrap-up packet summarizing the program, results recap, and next steps the client can take or share." },
];
const LIFECYCLE_STAGE_IDS = CLIENT_LIFECYCLE.map((stage) => stage.id);
const LIFECYCLE_FIXTURES = {
  personal_trainer: `${FIXTURE_DIR}/personal-trainer-lifecycle.md`,
  yoga_instructor: `${FIXTURE_DIR}/yoga-instructor-lifecycle.md`,
  dietician: `${FIXTURE_DIR}/dietician-lifecycle.md`,
};

function buildClientLifecycle(persona = null) {
  const resolved = persona && OFFER_PERSONAS.includes(persona) ? persona : null;
  return {
    title: "Wellness Creator Client Lifecycle",
    notCustomApp: true,
    educationalOnly: true,
    personas: OFFER_PERSONAS,
    persona: resolved,
    personaLabel: resolved ? OFFER_PERSONA_LABELS[resolved] : null,
    stages: CLIENT_LIFECYCLE,
    serviceHooks: OFFER_SERVICE_HOOKS,
    plannedNotLive: DELIVERY_GUARANTEES,
    safety: OFFER_SAFETY,
    fixtures: LIFECYCLE_FIXTURES,
    fixture: resolved ? LIFECYCLE_FIXTURES[resolved] ?? null : null,
    disclaimer: DISCLAIMERS.general,
    note: "The complete client-delivery path as client-safe artifacts. Every service hook is planned, not live; no payment, email, hosting, or access action happens.",
  };
}

function buildLifecycleStage(stageId) {
  const stage = CLIENT_LIFECYCLE.find((item) => item.id === stageId);
  if (!stage) return null;
  return {
    ...stage,
    educationalOnly: true,
    serviceHooks: OFFER_SERVICE_HOOKS,
    safety: OFFER_SAFETY,
    disclaimer: stage.id === "service_offer" || stage.id === "renewal_follow_up" ? DISCLAIMERS.noGuarantee : DISCLAIMERS.general,
  };
}

// ---- Wellness Creator Customer Demo Pack ----
// A reusable, test-customer-ready set of seven client artifacts a personal
// trainer, yoga instructor, or dietician can generate and share. Artifact-first
// and offline: nothing is hosted, charged, emailed, or gated.
const DEMO_PACK_DIR = `${FIXTURE_DIR}/demo-pack`;
const DEMO_PACK_DELIVERABLES = [
  { id: "service_offer_page", name: "Service offer page", artifactContract: "offer_landing_packet", fixture: `${DEMO_PACK_DIR}/service-offer-page.md`, examplePrompt: "create an offer page for my coaching" },
  { id: "onboarding_questionnaire", name: "New client onboarding questionnaire", artifactContract: "intake_questionnaire", fixture: `${DEMO_PACK_DIR}/onboarding-questionnaire.md`, examplePrompt: "create an onboarding questionnaire for a new client" },
  { id: "four_week_program", name: "4-week program", artifactContract: "client_plan", fixture: `${DEMO_PACK_DIR}/4-week-program.md`, examplePrompt: "create a 4-week training plan for a beginner" },
  { id: "weekly_check_in_form", name: "Weekly check-in form", artifactContract: "progress_check_in", fixture: `${DEMO_PACK_DIR}/weekly-check-in-form.md`, examplePrompt: "create a weekly client check-in form" },
  { id: "progress_summary", name: "Progress summary", artifactContract: "progress_check_in", fixture: `${DEMO_PACK_DIR}/progress-summary.md`, examplePrompt: "summarize my client's progress so far" },
  { id: "renewal_follow_up", name: "Renewal / follow-up message", artifactContract: "renewal_upsell_note", fixture: `${DEMO_PACK_DIR}/renewal-follow-up.md`, examplePrompt: "write a renewal follow-up message for my client" },
  { id: "client_handoff_packet", name: "Client handoff packet", artifactContract: null, fixture: `${DEMO_PACK_DIR}/client-handoff-packet.md`, examplePrompt: "create a client handoff packet" },
];

function buildCustomerDemoPack(persona = null) {
  const resolved = persona && OFFER_PERSONAS.includes(persona) ? persona : null;
  return {
    title: "Wellness Creator Customer Demo Pack",
    notCustomApp: true,
    educationalOnly: true,
    personas: OFFER_PERSONAS,
    persona: resolved,
    personaLabel: resolved ? OFFER_PERSONA_LABELS[resolved] : null,
    deliverables: DEMO_PACK_DELIVERABLES,
    serviceHooks: OFFER_SERVICE_HOOKS,
    plannedNotLive: DELIVERY_GUARANTEES,
    safety: OFFER_SAFETY,
    disclaimer: DISCLAIMERS.general,
    routesArbitraryPrompts: true,
    note: "A reusable test-customer demo pack: seven client-ready artifacts a personal trainer, yoga instructor, or dietician can generate and share through chat. Every service hook is planned, not live; no payment, email, hosting, or access action happens.",
  };
}

// ---- Wellness Creator Demo Packet Export ----
// Stitch the seven demo-pack artifacts into one shareable, customer-facing
// markdown packet. Personas include a generic "wellness_creator" default.
const EXPORT_PERSONAS = ["personal_trainer", "yoga_instructor", "dietician", "wellness_creator"];
const EXPORT_PERSONA_LABELS = {
  personal_trainer: "Personal trainer",
  yoga_instructor: "Yoga instructor",
  dietician: "Dietician",
  wellness_creator: "Wellness creator",
};

// The safety footer appended to every exported packet.
const PACKET_SAFETY_FOOTER = [
  "## Safety & Boundaries",
  "",
  "- This packet is for **general fitness and wellness education only**. It is **not medical advice, diagnosis, or treatment**.",
  "- It contains **no diagnosis, no prescription, no treatment plan, and no guaranteed outcomes**. Results vary between individuals.",
  "- For any medical condition, injury, pregnancy, eating concern, or medication question, consult a **qualified healthcare professional**.",
  "- Payments, email, hosting/storage, and identity/access are **planned, not live** Matterhorn service hooks. Nothing here is charged, emailed, hosted, or gated automatically.",
  "- This workflow never asks for or stores any wallet secrets or credentials of any kind.",
].join("\n");

// Build the stitched markdown packet for a persona (no file I/O).
function buildDemoPacketExport(persona = "wellness_creator") {
  const resolved = EXPORT_PERSONAS.includes(persona) ? persona : "wellness_creator";
  const label = EXPORT_PERSONA_LABELS[resolved];
  const sections = [];
  const includedDeliverables = [];
  for (const deliverable of DEMO_PACK_DELIVERABLES) {
    const abs = join(repoRoot, deliverable.fixture);
    let body = `*(reference artifact not found: ${deliverable.fixture})*`;
    if (existsSync(abs)) {
      body = readFileSync(abs, "utf8").trim();
      includedDeliverables.push(deliverable.id);
    }
    sections.push(`---\n\n# ${deliverable.name}\n\n${body}`);
  }
  const header = [
    `# Wellness Creator Demo Packet — ${label}`,
    "",
    `*A single, shareable customer-facing packet stitched from the Wellness Creator Customer Demo Pack. Artifact-first and offline: nothing is hosted, charged, emailed, or gated.*`,
    "",
    "This packet bundles seven client-ready artifacts: service offer page, onboarding questionnaire, 4-week program, weekly check-in, progress summary, renewal/follow-up message, and client handoff packet.",
  ].join("\n");
  const markdown = `${header}\n\n${sections.join("\n\n")}\n\n---\n\n${PACKET_SAFETY_FOOTER}\n`;
  return { persona: resolved, personaLabel: label, deliverables: includedDeliverables, markdown };
}

const DEMO_CHECKLIST = [
  "Setup: open Matterhorn Work as a normal user; no wallet, key, or payment account is needed.",
  "Run `node scripts/wellness-creator-workflow.mjs --json` and read the full workflow contract.",
  "Run the seven canonical prompts in order, one per workflow stage.",
  "Confirm every generated artifact carries its mandatory non-medical disclaimer.",
  "Confirm the delivery stage describes storage/hosting, email, payments, and identity/access as planned, not live.",
  "Run the medical-boundary prompts and confirm each is refused and referred to a qualified professional.",
  "Export the workflow as a Matterhorn / MCP artifact and re-run it for a different client.",
];

const HERMES_QA_CHECKLIST = [
  "Confirm the workflow is framed as a full Matterhorn Work workflow, not a pilot and not a custom UI.",
  "Walk all seven stages: intake, program design, client artifacts, service packaging, delivery plan, customer management, export.",
  "Confirm each canonical prompt produces its expected, client-safe artifacts.",
  "Confirm mandatory disclaimers appear on the program, nutrition, and client artifacts.",
  "Confirm storage/hosting, email, payments, and identity/access are each answered planned, not live.",
  "Confirm medical-boundary prompts are refused and redirected to a professional.",
  "Confirm the workflow never requests secrets, keys, signatures, signed payloads, or wallet exports.",
  "Record pass/fail evidence with a P0–P3 issue ledger.",
];

// The allowlist of things the workflow must never claim or do. Phrased as
// prohibitions so it never reads as an affirmative claim.
const FORBIDDEN_CLAIMS = [
  "No medical diagnosis of a client or user.",
  "No prescription, dosage, or instruction to start, stop, or change medication.",
  "No treatment of a disease, injury, or medical condition.",
  "No claim to cure, treat, or heal any condition.",
  "No guaranteed weight-loss or fitness outcome.",
  "No claim that payments, email sending, storage, hosting, or identity/access gating are operational.",
  "No request for secrets, private keys, API keys, raw signatures, signed payloads, or wallet exports.",
];

const SAFETY = {
  fullWorkflow: true,
  isPilot: false,
  acceptsSecrets: false,
  givesMedicalAdvice: false,
  paymentsLive: false,
  emailLive: false,
  storageLive: false,
  identityAccessLive: false,
  movesFunds: false,
};

// Alignment with the shared Matterhorn Workflow Contract
// (docs/matterhorn-workflow-contract.md). This wellness workflow is the
// `wellness` category entry in that reusable, catalog-discoverable pattern —
// run through the same chat/operator system, not a custom vertical UI.
const MANIFEST_VERSION = "matterhorn.workflow.manifest.v1";
const WORKFLOW_CATEGORY = "wellness";
const MANIFEST_STATUS = "live_local"; // core artifacts are generated locally today
const ALLOWED_MANIFEST_STATUSES = [
  "live_local",
  "planned_not_live",
  "preview_only",
  "external_handoff_required",
  "blocked_by_policy",
];
const CONTRACT_DOC = "docs/matterhorn-workflow-contract.md";
const CATALOG_WORKFLOW_ID = "wellness_creator_workflow";

const SERVICE_PROFESSIONALS = [
  "Personal trainer",
  "Yoga instructor",
  "Dietician / nutrition coach",
  "Gym / group-class instructor",
  "Other client-facing service professionals",
];

const REUSABLE_PATTERN = {
  isReusablePattern: true,
  notCustomUi: true,
  runsThroughChatOperator: true,
  sharedContract: CONTRACT_DOC,
  catalogWorkflowId: CATALOG_WORKFLOW_ID,
  appliesTo: SERVICE_PROFESSIONALS,
  note: "Runs through the same Matterhorn chat/operator system as every other workflow; no custom vertical UI.",
};

// Reusable prompt variants a service professional can run. Each is client-safe:
// educational only, with an explicit caveat and no live payment, email,
// hosting, storage, or access claim.
const EXAMPLE_PROMPTS = [
  {
    id: "strength-plan",
    prompt: "Create a 4-week beginner strength plan",
    expectedArtifact: "Structured 4-week beginner strength plan.",
    safetyCaveat: "General fitness education only. Not medical advice, diagnosis, or treatment.",
    processesPayment: false,
    sendsEmail: false,
  },
  {
    id: "pdf-packet",
    prompt: "Turn this into a client PDF packet",
    expectedArtifact: "Client-facing program packet ready to export as a document.",
    safetyCaveat: "Exported as a standard Matterhorn artifact. Storage / hosting is planned, not live.",
    processesPayment: false,
    sendsEmail: false,
  },
  {
    id: "yoga-mobility",
    prompt: "Draft a yoga class plan for lower-back mobility",
    expectedArtifact: "General mobility-focused yoga class plan.",
    safetyCaveat: "General wellness education only, not medical care. Refer pain or injury to a qualified professional.",
    processesPayment: false,
    sendsEmail: false,
  },
  {
    id: "dietician-template",
    prompt: "Create a dietician-safe meal planning template without medical claims",
    expectedArtifact: "General healthy-eating meal-planning template.",
    safetyCaveat:
      "General healthy-eating information, not a clinical or therapeutic diet. Not medical advice, diagnosis, or treatment.",
    processesPayment: false,
    sendsEmail: false,
  },
  {
    id: "future-paid-page",
    prompt: "Prepare a future paid program page, but do not process payment",
    expectedArtifact: "Draft paid program page with placeholder pricing only.",
    safetyCaveat: "Payments are planned, not live; no payment is processed and no funds move.",
    processesPayment: false,
    sendsEmail: false,
  },
];

// How this workflow is exposed through the existing generic Matterhorn workflow
// surfaces — discovered and run like any other workflow, not a custom app.
const GENERIC_SURFACES = {
  notCustomApp: true,
  chatFirst: true,
  catalogWorkflowId: CATALOG_WORKFLOW_ID, // wellness_creator_workflow
  templateRegistryId: "wellness_creator_service_workflow",
  sharedContract: CONTRACT_DOC,
  catalogFile: "scripts/matterhorn-workflow-catalog.mjs",
  templateRegistryTypes: "packages/types/src/matterhorn-workflows.ts",
  note: "Exposed through the existing generic Matterhorn workflow surfaces (catalog + template registry), discovered and run like any other workflow. Not a custom vertical app.",
};

// CLI / operator examples requested for the demo. Each is routed through the
// same free-form router and is client-safe (educational, no live service).
const OPERATOR_PROMPTS = [
  "create a 4-week fat loss plan for a beginner",
  "make a yoga mobility plan for an office worker",
  "create a client progress check-in",
  "package a paid 8-week coaching program",
];

// Any prompt, one workflow. A creator can ask for anything in plain chat — a
// training plan, a diet plan, a custom strength block, a mobility routine, a
// habit plan, a client handout — and the workflow produces a client-safe
// artifact with the mandatory disclaimers. The canonical and example prompts
// are starting points, not a closed list.
const FREEFORM_SUPPORT = {
  acceptsAnyPrompt: true,
  notLimitedToCanonical: true,
  routesToArtifact: true,
  note: "A creator can ask for anything in plain chat and the workflow produces a client-safe artifact with mandatory disclaimers. The canonical and example prompts are starting points, not a closed list.",
  exampleRequestCategories: [
    "Training plans (strength, hypertrophy, endurance, beginner to advanced)",
    "Diet and nutrition education plans and templates",
    "Custom strength-training blocks and progressions",
    "Yoga and mobility class plans",
    "Habit, recovery, sleep, and accountability plans",
    "Client handouts, checklists, FAQs, and progress trackers",
    "Service packaging: offer pages, onboarding, terms",
  ],
  guardrails: [
    "Every generated artifact carries the mandatory non-medical disclaimer.",
    "Educational only — no diagnosis, no prescription, no treatment, no guaranteed outcome.",
    "No live payment, email, hosting, storage, or access action; those hooks stay planned, not live.",
    "Never requests or accepts secrets, keys, signatures, signed payloads, or wallet exports.",
    "Requests that cross into clinical care are refused and referred to a qualified professional.",
  ],
};

// Deepened customer-management stage, including a weekly client progress
// check-in backed by a reproducible fixture.
const CUSTOMER_MANAGEMENT = {
  followUpCadence: [
    "Day 1: welcome message and how to use the plan.",
    "Week 1: first check-in — adherence, energy, and any pain or discomfort.",
    "Week 2: adjust volume or load based on the check-in.",
    "Week 4: progress review and next-block options.",
  ],
  feedbackForm: {
    fields: ["What went well", "What was hard", "Energy (1-5)", "Adherence (%)", "Requests for next block"],
    note: "Collected in-app as a standard artifact. No email is sent.",
  },
  renewalUpsell: [
    "Offer a renewal at the end of the block.",
    "Suggest an add-on (nutrition template, extra check-ins, a group class).",
    "All pricing is a draft only — payments are planned, not live, and no payment is processed.",
  ],
  progressCheckIn: {
    cadence: "weekly",
    fixture: `${FIXTURE_DIR}/${PROGRESS_CHECKIN_FIXTURE}`,
    fields: [
      "Date",
      "Sessions completed this week",
      "Adherence (%)",
      "Energy (1-5)",
      "Soreness / discomfort (note, refer pain to a professional)",
      "Bodyweight (optional, self-reported)",
      "Wins and blockers",
      "Coach adjustments for next week",
    ],
    note: "Educational progress tracking only. Not a medical assessment. Refer pain, injury, or health concerns to a qualified professional.",
  },
};

// Route ANY free-form prompt to a client-safe artifact type. Secret-shaped
// input is refused and never echoed. This is the contract-level guarantee that
// the workflow can help with whatever a creator asks, within safety bounds.
// ---- Wellness Creator Service Workflow: artifact contracts ----
// Every client-safe artifact the workflow can build. All are educational /
// general wellness only and live_local (generated in chat today; no external
// service executes).
const ARTIFACT_CONTRACTS = [
  {
    id: "client_plan",
    name: "Client plan",
    description: "A structured training, yoga, or nutrition-education program for a client.",
    includes: ["Goal and constraints recap", "Weekly structure", "Progression notes", "Educational disclaimer"],
    status: "live_local",
    disclaimer: DISCLAIMERS.general,
  },
  {
    id: "intake_questionnaire",
    name: "Intake questionnaire",
    description: "An onboarding questionnaire to learn a client's goals, experience, schedule, and general (non-clinical) wellness context.",
    includes: ["Goals", "Experience level", "Availability and equipment", "General non-clinical context", "Consent and disclaimer"],
    status: "live_local",
    disclaimer: DISCLAIMERS.general,
  },
  {
    id: "progress_check_in",
    name: "Weekly progress check-in",
    description: "A recurring check-in to track adherence, energy, and progress, with coach adjustments.",
    includes: ["Sessions completed", "Adherence", "Energy and sleep", "Wins and blockers", "Coach adjustments"],
    status: "live_local",
    disclaimer: DISCLAIMERS.general,
    fixture: `${FIXTURE_DIR}/${PROGRESS_CHECKIN_FIXTURE}`,
  },
  {
    id: "video_lesson_script",
    name: "Video lesson script",
    description: "A short-form script for a client video or lesson: hook, demo, cue, and call-to-action.",
    includes: ["Hook", "Demonstration steps", "Coaching cues", "Call-to-action", "Educational disclaimer"],
    status: "live_local",
    disclaimer: DISCLAIMERS.general,
  },
  {
    id: "client_tracker",
    name: "Client tracker",
    description: "A simple tracker or log for sessions, habits, or measurements the client self-reports.",
    includes: ["Tracked fields", "Cadence", "Self-reported only", "Educational disclaimer"],
    status: "live_local",
    disclaimer: DISCLAIMERS.general,
  },
  {
    id: "offer_landing_packet",
    name: "Offer / landing packet",
    description: "A paid-program landing packet with placeholder pricing only. No payment is processed.",
    includes: ["Offer summary", "What's included", "Placeholder pricing", "Sign-up call-to-action (draft)", "No-guarantee note"],
    status: "live_local",
    disclaimer: DISCLAIMERS.noGuarantee,
  },
  {
    id: "renewal_upsell_note",
    name: "Renewal / up-sell note",
    description: "A renewal or up-sell message draft for an existing client. Pricing is a draft only; no payment is processed.",
    includes: ["Progress recap", "Renewal or up-sell option", "Placeholder pricing", "No-guarantee note"],
    status: "live_local",
    disclaimer: DISCLAIMERS.noGuarantee,
  },
];
const ARTIFACT_CONTRACT_BY_ID = Object.fromEntries(ARTIFACT_CONTRACTS.map((contract) => [contract.id, contract]));

// Named service-builder intents and the artifact each one builds.
const SERVICE_BUILDER_INTENTS = [
  { id: "training-plan", intent: "create a 4-week training plan", contractId: "client_plan" },
  { id: "yoga-program", intent: "create a yoga program", contractId: "client_plan" },
  { id: "dietician-packet", intent: "create a dietician client packet", contractId: "client_plan" },
  { id: "client-check-in", intent: "create a client check-in", contractId: "progress_check_in" },
  { id: "paid-program", intent: "package a paid program", contractId: "offer_landing_packet" },
  { id: "client-video", intent: "create a client video script", contractId: "video_lesson_script" },
];

// Realistic sample prompts + expected artifact summaries for Hermes / demos.
const SAMPLE_PROMPTS = [
  { prompt: "create a 4-week training plan for a beginner", artifact: "client_plan", summary: "A 4-week beginner program with weekly structure, progression notes, and the educational disclaimer." },
  { prompt: "create a yoga program for office workers with tight hips", artifact: "client_plan", summary: "A general mobility-focused yoga program; educational only." },
  { prompt: "create a dietician client packet with a meal-planning template", artifact: "client_plan", summary: "A general healthy-eating plan and template; not a clinical or therapeutic diet." },
  { prompt: "create an intake questionnaire for a new coaching client", artifact: "intake_questionnaire", summary: "Onboarding questions covering goals, experience, schedule, and non-clinical context." },
  { prompt: "create a weekly client check-in", artifact: "progress_check_in", summary: "A weekly check-in tracking adherence, energy, wins/blockers, and coach adjustments." },
  { prompt: "create a client video script for a kettlebell swing tutorial", artifact: "video_lesson_script", summary: "A short-form script: hook, demo, coaching cues, and call-to-action." },
  { prompt: "create a client habit tracker", artifact: "client_tracker", summary: "A simple self-reported tracker for habits and sessions." },
  { prompt: "package a paid 8-week coaching program", artifact: "offer_landing_packet", summary: "A landing packet with placeholder pricing only; no payment is processed." },
  { prompt: "write a renewal note for a client finishing their block", artifact: "renewal_upsell_note", summary: "A renewal/up-sell draft with a progress recap and placeholder pricing." },
  { prompt: "build a 12-week strength program with progressions", artifact: "client_plan", summary: "A structured strength program; educational only." },
];

// How this demonstrates Matterhorn beyond Web3.
const MATTERHORN_BEYOND_WEB3 = {
  summary:
    "Wellness Creator is Matterhorn's first Web2 / customer-business workflow: a non-crypto service professional does real client work through the same chat/workflow system as Bittensor, Hyperliquid, and Polymarket.",
  firstWeb2Workflow: true,
  sharesGenericSurface: true,
  plannedNotLiveServiceHooks: ["storage/hosting", "payments", "email", "identity/access"],
  note:
    "Future Matterhorn service hooks (storage/hosting, payments, email, identity/access) are planned, not live. Nothing here hosts, charges, emails, or gates access.",
};

// Map any normal wellness/business prompt to one of the artifact contracts.
function routeServiceArtifactId(text) {
  // Renewal/up-sell takes precedence over a generic "follow-up" check-in.
  if (/renewal|renew\b|up-?sell|win-?back|retention|retain/.test(text)) return "renewal_upsell_note";
  if (/check.?in|\bprogress\b|weekly review|follow.?up/.test(text)) return "progress_check_in";
  if (/intake|questionnaire|onboard|screening|new client form/.test(text)) return "intake_questionnaire";
  if (/video|script|lesson|reel|tutorial|youtube|tiktok/.test(text)) return "video_lesson_script";
  if (/tracker|log\b|spreadsheet|journal|tracking sheet/.test(text)) return "client_tracker";
  if (/paid|pricing|offer|landing|sales page|package a|sell /.test(text)) return "offer_landing_packet";
  return "client_plan";
}

function routeFreeformPrompt(prompt) {
  const raw = String(prompt ?? "");
  if (SECRET_TEXT_RE.test(raw)) {
    return {
      artifactType: null,
      safe: true,
      refused: true,
      reason: "Input looks like a secret; refused and not echoed.",
      educationalOnly: true,
      disclaimerRequired: false,
      paymentProcessed: false,
      emailSent: false,
      acceptsSecrets: false,
    };
  }
  if (MEDICAL_INTENT_RE.test(raw)) {
    return {
      artifactType: "Educational guidance (refer to a professional)",
      safe: true,
      refused: false,
      redirected: true,
      educationalOnly: true,
      disclaimerRequired: true,
      guidance:
        "General fitness and wellness education only — not medical advice, diagnosis, or treatment. For diagnosis, prescriptions, medication, injuries, or any medical condition, refer the client to a qualified healthcare professional.",
      paymentProcessed: false,
      emailSent: false,
      acceptsSecrets: false,
    };
  }
  const text = raw.toLowerCase();
  let artifactType = "Custom wellness program artifact";
  if (/check.?in|progress|review/.test(text)) artifactType = "Client progress check-in";
  else if (/diet|meal|nutrition|eating|macro/.test(text)) artifactType = "Nutrition education artifact";
  else if (/yoga|mobility|stretch|flexib/.test(text)) artifactType = "Yoga / mobility class plan";
  else if (/strength|lift|hypertroph|powerlift|squat|deadlift|bench/.test(text)) artifactType = "Strength program artifact";
  else if (/run|cardio|endurance|marathon|cycling|row/.test(text)) artifactType = "Endurance program artifact";
  else if (/habit|sleep|recovery|accountab|mindful/.test(text)) artifactType = "Habit / recovery plan artifact";
  else if (/offer|pricing|package|onboard|terms|landing/.test(text)) artifactType = "Service packaging artifact";
  else if (/plan|program|workout|training|class|routine/.test(text)) artifactType = "Training program artifact";
  const serviceArtifactContract = routeServiceArtifactId(text);
  return {
    artifactType,
    serviceArtifactContract,
    serviceArtifactName: ARTIFACT_CONTRACT_BY_ID[serviceArtifactContract]?.name ?? null,
    safe: true,
    refused: false,
    educationalOnly: true,
    disclaimerRequired: true,
    paymentProcessed: false,
    emailSent: false,
    acceptsSecrets: false,
  };
}

// ---- Wellness Memory safety lane ----
// What Matterhorn Memory may safely remember for a wellness creator, and what it
// must never store. Candidates only — nothing is written to memory here.
const MEMORY_DIR = `${FIXTURE_DIR}/memory`;
const MEMORY_ALLOWED_CATEGORIES = [
  { id: "creator_service_type", label: "Creator service type", example: "Personal trainer running 1:1 strength coaching." },
  { id: "offer_preferences", label: "Offer preferences", example: "Prefers 8-week transformation offers; pricing kept as a draft, no live checkout." },
  { id: "program_style", label: "Program style", example: "Beginner-friendly, dumbbell + bodyweight, 3 days/week." },
  { id: "check_in_cadence", label: "Check-in cadence", example: "Weekly Monday check-ins." },
  { id: "client_communication_preferences", label: "Client communication preferences", example: "Short WhatsApp summaries; no long emails." },
  { id: "artifact_preferences", label: "Artifact preferences", example: "Likes PDF handouts and a habit tracker." },
  { id: "renewal_follow_up_preferences", label: "Renewal / follow-up preferences", example: "Sends a renewal note at the end of each block." },
];
const MEMORY_FORBIDDEN_CATEGORIES = [
  { id: "diagnosis", label: "Diagnosis", action: "redact" },
  { id: "medication_advice", label: "Medication advice / dosing", action: "redact" },
  { id: "medical_condition_treatment", label: "Medical condition treatment", action: "redact" },
  { id: "eating_disorder_treatment", label: "Eating-disorder treatment", action: "redact" },
  { id: "pregnancy_post_surgery_medical_plan", label: "Pregnancy / post-surgery medical plans", action: "redact" },
  { id: "private_health_records_without_consent", label: "Private health records without explicit consent", action: "redact" },
];
const MEMORY_FIXTURES = {
  safe_client_persona: `${MEMORY_DIR}/safe-client-persona-memory.md`,
  safe_program_preference: `${MEMORY_DIR}/safe-program-preference-memory.md`,
  safe_check_in_cadence: `${MEMORY_DIR}/safe-check-in-cadence-memory.md`,
  safe_offer_builder_preference: `${MEMORY_DIR}/safe-offer-builder-preference-memory.md`,
};

// Map a safe candidate to its memory category (best effort).
function memoryCategoryFor(text) {
  const t = text.toLowerCase();
  if (/renewal|renew\b|up-?sell|win-?back|retention|follow.?up/.test(t)) return "renewal_follow_up_preferences";
  if (/check.?in|cadence|weekly|monthly|monday|frequency/.test(t)) return "check_in_cadence";
  if (/whatsapp|email|sms|message|summaries|summary|communicat|notify/.test(t)) return "client_communication_preferences";
  if (/offer|pricing|package|paid|checkout|landing/.test(t)) return "offer_preferences";
  if (/pdf|handout|tracker|template|artifact|\bformat\b/.test(t)) return "artifact_preferences";
  if (/beginner|dumbbell|bodyweight|days\/week|split|vinyasa|flow|style|mobility|strength program/.test(t)) return "program_style";
  if (/personal trainer|yoga instructor|dietician|coach|service type|1:1|group class/.test(t)) return "creator_service_type";
  return "creator_service_type";
}

// Classify a memory candidate. Safe candidates are proposed (not written);
// secrets are refused and never echoed; clinical/health content is redacted.
function classifyMemoryCandidate(text) {
  const raw = String(text ?? "");
  if (SECRET_TEXT_RE.test(raw)) {
    return { allowed: false, action: "refuse", reason: "Looks like a secret; refused and not echoed.", category: null };
  }
  if (MEDICAL_INTENT_RE.test(raw) || MEMORY_REDACT_RE.test(raw)) {
    return {
      allowed: false,
      action: "redact",
      reason: "Clinical or private-health content (diagnosis, medication, treatment, pregnancy/surgery, or health records). Not stored.",
      category: null,
    };
  }
  return { allowed: true, action: "remember_candidate", category: memoryCategoryFor(raw), candidate: raw };
}

// Built-in example candidates for `--memory-candidates` (safe + must-refuse).
const MEMORY_CANDIDATE_EXAMPLES = [
  "Creator is a personal trainer who runs 1:1 strength coaching",
  "Prefers 8-week transformation offers with placeholder pricing, no live checkout",
  "Program style: beginner-friendly, dumbbell and bodyweight, 3 days per week",
  "Weekly Monday check-ins",
  "Client prefers short WhatsApp summaries, not long emails",
  "Likes PDF handouts and a simple habit tracker",
  "Sends a renewal follow-up note at the end of each block",
  "Client was diagnosed with type 2 diabetes; remember the plan to treat it",
  "Remember the client takes 500mg metformin twice daily",
  "Client is in third-trimester pregnancy with a post-surgery rehab plan",
  "Client has an eating disorder; remember the cutting protocol",
  "Store the client's full medical history and lab results",
];

function buildMemoryCandidates() {
  return MEMORY_CANDIDATE_EXAMPLES.map((candidate) => {
    const result = classifyMemoryCandidate(candidate);
    // Never echo refused/redacted source text.
    if (!result.allowed) {
      return { input: "[withheld]", allowed: false, action: result.action, reason: result.reason };
    }
    return { input: candidate, allowed: true, action: result.action, category: result.category };
  });
}

function buildMemoryLane() {
  return {
    title: "Wellness Memory Safety Lane",
    status: "candidates_only",
    writesMemory: false,
    educationalOnly: true,
    allowedCategories: MEMORY_ALLOWED_CATEGORIES,
    forbiddenCategories: MEMORY_FORBIDDEN_CATEGORIES,
    fixtures: MEMORY_FIXTURES,
    candidatesCommand: "node scripts/wellness-creator-workflow.mjs --memory-candidates --json",
    safety: {
      writesMemory: false,
      remembersDiagnosis: false,
      remembersMedication: false,
      remembersTreatment: false,
      remembersHealthRecords: false,
      acceptsSecrets: false,
    },
    note: "Matterhorn Memory may remember service preferences and client workflow metadata only. It never stores diagnosis, medication advice, treatment, eating-disorder care, pregnancy/post-surgery medical plans, or private health records. Secrets are refused and not echoed. Nothing is written to memory yet — these are candidates only.",
  };
}

// ---- Wellness Memory QA / evidence pack ----
// Black-box proof that wellness memory candidates are useful but safe. Pure,
// offline, non-writing: it classifies fixed example sets and summarizes results.
const MEMORY_QA_SAFE_BY_PERSONA = {
  personal_trainer: [
    "Creator is a personal trainer who runs 1:1 strength coaching",
    "Program style: beginner-friendly, dumbbell and bodyweight, 3 days per week",
    "Weekly Monday check-ins with a short form",
  ],
  yoga_instructor: [
    "Creator is a yoga instructor teaching general mobility and relaxation",
    "Program style: gentle vinyasa flow, one class per week, with cueing notes",
    "Prefers PDF class handouts and a simple habit tracker",
  ],
  dietician: [
    "Creator is a dietician offering general healthy-eating coaching",
    "Offer preference: 8-week reset with placeholder pricing, no live checkout",
    "Sends a renewal follow-up note at the end of each block",
  ],
};
const MEMORY_QA_CLINICAL = [
  "Client was diagnosed with type 2 diabetes; remember the plan to treat it",
  "Remember the prescription: 500mg metformin twice daily",
  "Treat the client's chronic back pain with this protocol",
  "Client has an eating disorder; remember the cutting protocol",
  "Client is in third-trimester pregnancy with a post-surgery rehab plan",
  "Store the client's full medical history and lab results",
];
const MEMORY_QA_SECRET = [
  "Remember my seed phrase apple banana cherry tiger river stone",
  "Save the client's private key 0xabc123def4567890abc123def4567890abc12345",
  "Keep this api secret sk_live_supersecretvalue",
  "Store my wallet export for later",
];
const MEMORY_QA_OPT_IN_REQUIREMENTS = [
  "Client preference memory is opt-in: a candidate is only proposed, never written automatically.",
  "The creator (user) must explicitly confirm before any candidate becomes a stored memory.",
  "Stored memory remains inspectable, editable, exportable, and forgettable by the user.",
  "Nothing is captured silently; clinical or secret-shaped input is refused or redacted, never stored.",
];

function buildMemoryQa() {
  const safeByPersona = {};
  let safeAllowed = 0;
  for (const [persona, prompts] of Object.entries(MEMORY_QA_SAFE_BY_PERSONA)) {
    safeByPersona[persona] = prompts.map((prompt) => {
      const result = classifyMemoryCandidate(prompt);
      if (result.allowed) safeAllowed += 1;
      return { input: prompt, allowed: result.allowed, action: result.action, category: result.category, optIn: true };
    });
  }

  const refusedClinical = MEMORY_QA_CLINICAL.map((prompt) => {
    const result = classifyMemoryCandidate(prompt);
    // Never echo the clinical source text.
    return { input: "[withheld]", allowed: result.allowed, action: result.action, reason: result.reason };
  });
  const refusedSecret = MEMORY_QA_SECRET.map((prompt) => {
    const result = classifyMemoryCandidate(prompt);
    return { input: "[withheld]", allowed: result.allowed, action: result.action, reason: result.reason };
  });

  const totalSafe = Object.values(safeByPersona).reduce((sum, list) => sum + list.length, 0);
  const clinicalRefused = refusedClinical.filter((item) => item.allowed === false).length;
  const secretRefused = refusedSecret.filter((item) => item.allowed === false).length;

  return {
    title: "Wellness Memory QA Evidence Pack",
    educationalOnly: true,
    notMedicalAdvice: "This is general fitness and wellness education only. It is not medical advice, diagnosis, or treatment.",
    writesMemory: false,
    optInRequirements: MEMORY_QA_OPT_IN_REQUIREMENTS,
    safeCandidatesByPersona: safeByPersona,
    refusedClinicalExamples: refusedClinical,
    refusedSecretExamples: refusedSecret,
    evidenceSummary: {
      safeCandidates: totalSafe,
      safeAllowed,
      clinicalExamples: refusedClinical.length,
      clinicalRefused,
      secretExamples: refusedSecret.length,
      secretRefused,
      allSafeAllowed: safeAllowed === totalSafe,
      allClinicalRefused: clinicalRefused === refusedClinical.length,
      allSecretRefused: secretRefused === refusedSecret.length,
      anySourceEchoed: false,
      writesMemory: false,
      noLiveServiceClaims: true,
    },
    rerunCommands: [
      "pnpm test:wellness-creator-workflow",
      "node scripts/wellness-creator-workflow.mjs --memory-qa --json",
      "node scripts/wellness-creator-workflow.mjs --memory-candidates --json",
      "node scripts/wellness-creator-workflow.mjs --check",
    ],
    safety: {
      writesMemory: false,
      remembersDiagnosis: false,
      remembersMedication: false,
      remembersTreatment: false,
      remembersHealthRecords: false,
      acceptsSecrets: false,
    },
    note: "Black-box evidence that wellness memory candidates are useful but safe: per-persona safe candidates are proposed (opt-in, never written); clinical and secret-shaped inputs are refused or redacted and never echoed.",
  };
}

// ---- Wellness Memory contract adapter (suggestions only) ----
// Convert safe wellness memory candidates into MatterhornMemorySuggestion-shaped
// fixtures (packages/types/src/memory.ts). Non-writing, opt-in, user-confirmed
// only. Clinical/secret inputs are refused/redacted and never become records.
const MEMORY_SUGGESTION_VERSION = "matterhorn.memory.suggestion.v1";
const MEMORY_RECORD_KIND = "client_profile";
const MEMORY_RECORD_SCOPE = "user";
const MEMORY_RECORD_SENSITIVITY = "private";
const MEMORY_PROVENANCE_SOURCE = "user_confirmed";
// Fixed, deterministic timestamp so fixtures/tests are stable.
const MEMORY_STAMP = "2026-01-01T00:00:00.000Z";

function memorySuggestionFor(persona, candidate, index, categoryOverride) {
  const result = classifyMemoryCandidate(candidate);
  if (!result.allowed) {
    return { ok: false, refused: { allowed: false, action: result.action, reason: result.reason, input: "[withheld]" } };
  }
  const category = categoryOverride ?? result.category;
  const personaLabel = OFFER_PERSONA_LABELS[persona] ?? persona;
  const record = {
    id: `wellness-${persona}-${category}-${index}`,
    kind: MEMORY_RECORD_KIND,
    scope: MEMORY_RECORD_SCOPE,
    title: `${personaLabel} — ${category.replace(/_/g, " ")}`,
    summary: candidate,
    body: { persona, category, preference: candidate },
    tags: ["wellness", "opt-in", persona, category],
    links: [],
    provenance: {
      source: MEMORY_PROVENANCE_SOURCE,
      capturedAt: MEMORY_STAMP,
      capturedBy: "user",
      confidence: 0.9,
      reasonRemembered: "Creator confirmed this service/workflow preference.",
    },
    sensitivity: MEMORY_RECORD_SENSITIVITY,
    createdAt: MEMORY_STAMP,
    updatedAt: MEMORY_STAMP,
    canUseInChat: true,
    canExport: true,
    canDelete: true,
  };
  const suggestion = {
    version: MEMORY_SUGGESTION_VERSION,
    proposedRecord: record,
    reason: "Proposed wellness service/workflow preference. Requires explicit user confirmation before anything is stored.",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
  };
  return { ok: true, suggestion };
}

// The wellness preference types this adapter converts into suggestions. Each
// entry carries an explicit category so coverage is guaranteed across personas.
const MEMORY_SUGGESTION_CATEGORIES = [
  "client_preference",
  "program_preference",
  "check_in_cadence",
  "equipment_constraints",
  "communication_preference",
  "dietary_preference",
];
const MEMORY_SUGGESTION_CANDIDATES = [
  { persona: "personal_trainer", category: "client_preference", text: "Client prefers training early mornings before work" },
  { persona: "personal_trainer", category: "program_preference", text: "Program preference: full-body strength, 3 days per week" },
  { persona: "personal_trainer", category: "equipment_constraints", text: "Equipment constraints: dumbbells and a bench only, trains at home" },
  { persona: "personal_trainer", category: "check_in_cadence", text: "Weekly Monday check-ins with a short form" },
  { persona: "yoga_instructor", category: "program_preference", text: "Program preference: gentle vinyasa flow, one class per week" },
  { persona: "yoga_instructor", category: "communication_preference", text: "Prefers short WhatsApp summaries, not long emails" },
  { persona: "yoga_instructor", category: "equipment_constraints", text: "Equipment constraints: mat and blocks only, small home space" },
  { persona: "dietician", category: "dietary_preference", text: "General healthy-eating preference: vegetarian, dislikes spicy food" },
  { persona: "dietician", category: "client_preference", text: "Client prefers simple meal templates over calorie counting" },
  { persona: "dietician", category: "check_in_cadence", text: "Fortnightly check-ins by message" },
];
// A clinical dietary request must be refused (dietary preference is allowed only
// when non-clinical and user-confirmed).
const MEMORY_SUGGESTION_REFUSE_EXAMPLES = [
  "Put the client on a low-FODMAP plan to treat their IBS",
];

function buildMemorySuggestions() {
  const suggestions = [];
  const refused = [];
  MEMORY_SUGGESTION_CANDIDATES.forEach((entry, index) => {
    const built = memorySuggestionFor(entry.persona, entry.text, index, entry.category);
    if (built.ok) suggestions.push(built.suggestion);
    else refused.push(built.refused);
  });
  // Clinical (incl. clinical-dietary) + secret examples must never become suggestions.
  for (const prompt of [...MEMORY_SUGGESTION_REFUSE_EXAMPLES, ...MEMORY_QA_CLINICAL, ...MEMORY_QA_SECRET]) {
    const result = classifyMemoryCandidate(prompt);
    refused.push({ allowed: false, action: result.action, reason: result.reason, input: "[withheld]" });
  }
  const categoriesCovered = [...new Set(suggestions.map((s) => s.proposedRecord.body.category))];
  return {
    title: "Wellness Memory Contract Adapter",
    suggestionVersion: MEMORY_SUGGESTION_VERSION,
    captureMode: "user_confirmed_only",
    writesMemory: false,
    educationalOnly: true,
    notMedicalAdvice: "This is general fitness and wellness education only. It is not medical advice, diagnosis, or treatment.",
    personas: [...new Set(MEMORY_SUGGESTION_CANDIDATES.map((c) => c.persona))],
    categoriesCovered,
    dietaryPreferenceRule: "Dietary preference is converted only when non-clinical and user-confirmed; clinical/therapeutic diets are refused/redacted.",
    suggestions,
    refused,
    evidenceSummary: {
      suggestions: suggestions.length,
      refused: refused.length,
      allSuggestionsUserConfirmedOnly: suggestions.every((s) => s.captureMode === "user_confirmed_only" && s.canAutoCapture === false && s.requiresExplicitConsent === true),
      allRefusedWithheld: refused.every((r) => r.input === "[withheld]"),
      writesMemory: false,
      noLiveServiceClaims: true,
    },
    note: "Non-writing adapter: safe wellness candidates become MatterhornMemorySuggestion fixtures (user_confirmed, opt-in tagged). Clinical and secret-shaped inputs are refused/redacted and never become records. Nothing is written to memory.",
  };
}

function flag(name) {
  return args.includes(name);
}

function assertNoForbiddenArgs() {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the Wellness Creator Workflow helper.`);
    }
  }
}

function buildContract() {
  return {
    version: VERSION,
    ok: true,
    workflow: "Wellness Creator Workflow",
    framing: "A full Matterhorn Work workflow, not a pilot and not a custom vertical UI.",
    fullWorkflow: true,
    isPilot: false,
    nonTrading: true,
    manifestVersion: MANIFEST_VERSION,
    category: WORKFLOW_CATEGORY,
    manifestStatus: MANIFEST_STATUS,
    contractDoc: CONTRACT_DOC,
    catalogWorkflowId: CATALOG_WORKFLOW_ID,
    reusablePattern: REUSABLE_PATTERN,
    genericSurfaces: GENERIC_SURFACES,
    serviceProfessionals: SERVICE_PROFESSIONALS,
    personas: PERSONAS,
    canonicalPrompts: CANONICAL_PROMPTS,
    examplePrompts: EXAMPLE_PROMPTS,
    operatorExamples: OPERATOR_PROMPTS.map((prompt) => {
      const routed = routeFreeformPrompt(prompt);
      return {
        prompt,
        command: `node scripts/wellness-creator-workflow.mjs --route ${JSON.stringify(prompt)}`,
        artifactType: routed.artifactType,
        safe: routed.safe,
        disclaimerRequired: routed.disclaimerRequired,
        paymentProcessed: routed.paymentProcessed,
        emailSent: routed.emailSent,
      };
    }),
    freeformSupport: FREEFORM_SUPPORT,
    serviceBuilder: {
      intents: SERVICE_BUILDER_INTENTS.map((intent) => ({
        ...intent,
        artifactName: ARTIFACT_CONTRACT_BY_ID[intent.contractId]?.name ?? null,
        routed: routeFreeformPrompt(intent.intent).serviceArtifactContract,
      })),
      routesArbitraryPrompts: true,
      note: "Named intents and arbitrary wellness/business prompts both route into one of the artifact contracts. Clinical prompts redirect to a qualified professional; secret-shaped text is refused and not echoed.",
    },
    artifactContracts: ARTIFACT_CONTRACTS,
    samplePrompts: SAMPLE_PROMPTS.map((sample) => {
      const routed = routeFreeformPrompt(sample.prompt);
      return {
        prompt: sample.prompt,
        expectedArtifact: sample.artifact,
        summary: sample.summary,
        routedArtifactContract: routed.serviceArtifactContract,
        safe: routed.safe,
        disclaimerRequired: routed.disclaimerRequired,
      };
    }),
    matterhornBeyondWeb3: MATTERHORN_BEYOND_WEB3,
    offerBuilder: buildOfferBuilder(),
    clientLifecycle: buildClientLifecycle(),
    customerDemoPack: buildCustomerDemoPack(),
    memory: buildMemoryLane(),
    memoryQa: buildMemoryQa(),
    memorySuggestions: buildMemorySuggestions(),
    demoPacketExport: {
      personas: EXPORT_PERSONAS,
      defaultPersona: "wellness_creator",
      command: "node scripts/wellness-creator-workflow.mjs --demo-pack-export <persona> --output <path> --json",
      stitchesDeliverables: DEMO_PACK_DELIVERABLES.map((deliverable) => deliverable.id),
      safetyFooter: true,
    },
    customerManagement: CUSTOMER_MANAGEMENT,
    stages: STAGES,
    promptArtifacts: PROMPT_ARTIFACTS,
    expectedArtifactTypes: EXPECTED_ARTIFACT_TYPES,
    disclaimers: DISCLAIMERS,
    serviceHooks: SERVICE_HOOKS.map((hook) => ({ ...hook, contractStatus: "planned_not_live" })),
    deliveryGuarantees: DELIVERY_GUARANTEES,
    demoChecklist: DEMO_CHECKLIST,
    hermesQaChecklist: HERMES_QA_CHECKLIST,
    forbiddenClaims: FORBIDDEN_CLAIMS,
    safety: SAFETY,
  };
}

// Self-check: validate the contract's safety invariants. The forbidden-claims
// allowlist is excluded from the affirmative-claim scans by design.
function runCheck() {
  const failures = [];
  const contract = buildContract();

  // Every stage maps a canonical prompt to at least one safe artifact.
  for (const stage of contract.stages) {
    if (!stage.prompt) failures.push(`Stage ${stage.id} is missing a canonical prompt.`);
    if (!Array.isArray(stage.artifacts) || stage.artifacts.length === 0) {
      failures.push(`Stage ${stage.id} produces no artifacts.`);
    }
  }
  for (const mapping of contract.promptArtifacts) {
    if (mapping.safe !== true) failures.push(`Prompt "${mapping.prompt}" is not marked safe.`);
    if (!mapping.artifacts.length) failures.push(`Prompt "${mapping.prompt}" produces no artifact.`);
  }

  // Every service hook must be planned, not live (human + contract status).
  for (const hook of contract.serviceHooks) {
    if (hook.status !== "planned, not live") {
      failures.push(`Service hook ${hook.id} must be planned, not live.`);
    }
    if (hook.contractStatus !== "planned_not_live") {
      failures.push(`Service hook ${hook.id} must carry contractStatus planned_not_live.`);
    }
  }

  // Manifest alignment with the shared workflow contract.
  if (!ALLOWED_MANIFEST_STATUSES.includes(contract.manifestStatus)) {
    failures.push(`manifestStatus must be one of ${ALLOWED_MANIFEST_STATUSES.join(", ")}.`);
  }
  if (contract.category !== WORKFLOW_CATEGORY) failures.push("category must be wellness.");
  if (contract.reusablePattern?.isReusablePattern !== true) {
    failures.push("reusablePattern.isReusablePattern must be true.");
  }
  if (contract.reusablePattern?.notCustomUi !== true) {
    failures.push("reusablePattern.notCustomUi must be true.");
  }

  // Every example prompt is client-safe: a caveat, and no live payment/email.
  for (const example of contract.examplePrompts) {
    if (!example.safetyCaveat) failures.push(`Example prompt ${example.id} is missing a safety caveat.`);
    if (example.processesPayment !== false) failures.push(`Example prompt ${example.id} must not process payment.`);
    if (example.sendsEmail !== false) failures.push(`Example prompt ${example.id} must not send email.`);
  }
  for (const [key, value] of Object.entries(contract.safety)) {
    if (key.endsWith("Live") && value !== false) failures.push(`safety.${key} must be false.`);
  }
  if (contract.safety.movesFunds !== false) failures.push("safety.movesFunds must be false.");
  if (contract.safety.acceptsSecrets !== false) failures.push("safety.acceptsSecrets must be false.");
  if (contract.safety.givesMedicalAdvice !== false) failures.push("safety.givesMedicalAdvice must be false.");

  // Free-form support: any prompt is accepted and routed safely.
  if (contract.freeformSupport?.acceptsAnyPrompt !== true) {
    failures.push("freeformSupport.acceptsAnyPrompt must be true.");
  }
  if (contract.freeformSupport?.notLimitedToCanonical !== true) {
    failures.push("freeformSupport.notLimitedToCanonical must be true.");
  }
  // Routing must be safe for arbitrary input, and must refuse secret-shaped input.
  const routingProbe = [
    "Create a 4-week fat-loss plan",
    "Build me a powerlifting peaking block",
    "Draft a vegetarian meal plan template",
    "Plan a restorative yoga class",
    "Whatever — surprise me with a mobility routine",
    "Make a weekly client progress check-in",
  ];
  for (const probe of routingProbe) {
    const routed = routeFreeformPrompt(probe);
    if (routed.safe !== true || routed.disclaimerRequired !== true) {
      failures.push(`Free-form routing for "${probe}" must be safe and require a disclaimer.`);
    }
    if (routed.paymentProcessed !== false || routed.emailSent !== false || routed.acceptsSecrets !== false) {
      failures.push(`Free-form routing for "${probe}" must not pay, email, or accept secrets.`);
    }
  }
  const secretRouted = routeFreeformPrompt("here is my private key 0x" + "a".repeat(40));
  if (secretRouted.refused !== true || secretRouted.acceptsSecrets !== false) {
    failures.push("Free-form routing must refuse secret-shaped input.");
  }
  // Clinical requests are redirected to educational/safety language, never answered.
  const medicalRouted = routeFreeformPrompt("diagnose my client's knee injury and prescribe medication");
  if (medicalRouted.redirected !== true || medicalRouted.disclaimerRequired !== true) {
    failures.push("Free-form routing must redirect clinical requests to educational/safety language.");
  }
  // Pregnancy- and eating-disorder-specific prompts must also redirect.
  for (const clinical of [
    "build a prenatal yoga plan for my pregnant client",
    "make a meal plan for a client with an eating disorder",
  ]) {
    if (routeFreeformPrompt(clinical).redirected !== true) {
      failures.push(`Sensitive clinical prompt must redirect: "${clinical}"`);
    }
  }

  // Service-builder layer: artifact contracts, intents, and sample prompts.
  const contractsById = new Map((contract.artifactContracts || []).map((item) => [item.id, item]));
  for (const id of [
    "client_plan",
    "intake_questionnaire",
    "progress_check_in",
    "video_lesson_script",
    "client_tracker",
    "offer_landing_packet",
    "renewal_upsell_note",
  ]) {
    const item = contractsById.get(id);
    if (!item) {
      failures.push(`Missing artifact contract: ${id}`);
      continue;
    }
    if (item.status !== "live_local") failures.push(`Artifact contract ${id} should be live_local.`);
    if (!item.disclaimer) failures.push(`Artifact contract ${id} must carry a disclaimer.`);
  }
  for (const intent of contract.serviceBuilder?.intents || []) {
    if (!contractsById.has(intent.contractId)) {
      failures.push(`Service-builder intent "${intent.intent}" maps to unknown contract ${intent.contractId}.`);
    }
    if (intent.routed !== intent.contractId) {
      failures.push(`Service-builder intent "${intent.intent}" should route to ${intent.contractId} (got ${intent.routed}).`);
    }
  }
  if (!Array.isArray(contract.samplePrompts) || contract.samplePrompts.length < 8) {
    failures.push("samplePrompts must include at least eight Hermes/demo prompts.");
  }
  for (const sample of contract.samplePrompts || []) {
    if (!contractsById.has(sample.routedArtifactContract)) {
      failures.push(`Sample prompt "${sample.prompt}" routed to unknown contract ${sample.routedArtifactContract}.`);
    }
    if (sample.routedArtifactContract !== sample.expectedArtifact) {
      failures.push(`Sample prompt "${sample.prompt}" expected ${sample.expectedArtifact} but routed ${sample.routedArtifactContract}.`);
    }
    if (sample.safe !== true || sample.disclaimerRequired !== true) {
      failures.push(`Sample prompt "${sample.prompt}" must be safe and require a disclaimer.`);
    }
  }
  // Matterhorn-beyond-Web3 framing with planned-not-live future hooks.
  const beyond = contract.matterhornBeyondWeb3;
  if (beyond?.firstWeb2Workflow !== true) failures.push("matterhornBeyondWeb3.firstWeb2Workflow must be true.");
  for (const hook of ["storage/hosting", "payments", "email", "identity/access"]) {
    if (!(beyond?.plannedNotLiveServiceHooks || []).includes(hook)) {
      failures.push(`matterhornBeyondWeb3 should list planned-not-live hook: ${hook}`);
    }
  }

  // Customer Offer Builder layer.
  const offer = contract.offerBuilder;
  if (!offer) {
    failures.push("offerBuilder must be present in the contract.");
  } else {
    for (const persona of ["personal_trainer", "yoga_instructor", "dietician", "hybrid_coach"]) {
      if (!offer.personas.includes(persona)) failures.push(`offerBuilder.personas should include ${persona}.`);
    }
    if (!Array.isArray(offer.offerTypes) || offer.offerTypes.length < 5) {
      failures.push("offerBuilder.offerTypes should include the five offer types.");
    }
    if (!Array.isArray(offer.deliverables) || offer.deliverables.length < 7) {
      failures.push("offerBuilder.deliverables should include the seven deliverables.");
    }
    for (const hook of offer.serviceHooks || []) {
      if (hook.status !== "planned_not_live") {
        failures.push(`offerBuilder service hook ${hook.id} must be planned_not_live.`);
      }
    }
    for (const flagKey of [
      "educationalOnly",
      "noMedicalDiagnosis",
      "noTreatmentPlan",
      "noPaymentProcessing",
      "noEmailSending",
      "noHosting",
      "noTokenGating",
    ]) {
      if (offer.safety?.[flagKey] !== true) failures.push(`offerBuilder.safety.${flagKey} must be true.`);
    }
    // Each persona offer must resolve and (for the three with fixtures) be a real file.
    for (const persona of OFFER_PERSONAS) {
      const built = buildOfferBuilder(persona);
      if (built.persona !== persona) failures.push(`buildOfferBuilder(${persona}) should resolve the persona.`);
    }
    for (const [persona, relPath] of Object.entries(OFFER_FIXTURES)) {
      const abs = join(repoRoot, relPath);
      if (!existsSync(abs)) {
        failures.push(`Offer fixture missing for ${persona}: ${relPath}`);
        continue;
      }
      const fixture = readFileSync(abs, "utf8");
      if (!fixture.includes("not medical advice, diagnosis, or treatment")) {
        failures.push(`Offer fixture ${relPath} must carry the non-medical disclaimer.`);
      }
      for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
        const match = fixture.match(re);
        if (match) failures.push(`Offer fixture ${relPath} contains a forbidden string: "${match[0]}"`);
      }
    }
  }

  // Client Lifecycle layer: ordered stages, hooks, safety, and fixtures.
  const lifecycle = contract.clientLifecycle;
  if (!lifecycle) {
    failures.push("clientLifecycle must be present in the contract.");
  } else {
    const expectedStages = [
      "lead_intake",
      "service_offer",
      "onboarding_questionnaire",
      "weekly_program",
      "progress_check_in",
      "renewal_follow_up",
      "client_handoff_packet",
    ];
    const stageIds = (lifecycle.stages || []).map((stage) => stage.id);
    if (JSON.stringify(stageIds) !== JSON.stringify(expectedStages)) {
      failures.push(`clientLifecycle.stages must be the ordered lifecycle: ${expectedStages.join(", ")}.`);
    }
    const knownContracts = new Set((contract.artifactContracts || []).map((item) => item.id));
    for (const stage of lifecycle.stages || []) {
      if (!stage.deliverable) failures.push(`Lifecycle stage ${stage.id} must name a deliverable.`);
      if (stage.artifactContract !== null && !knownContracts.has(stage.artifactContract)) {
        failures.push(`Lifecycle stage ${stage.id} references unknown contract ${stage.artifactContract}.`);
      }
    }
    for (const hook of lifecycle.serviceHooks || []) {
      if (hook.status !== "planned_not_live") {
        failures.push(`Lifecycle service hook ${hook.id} must be planned_not_live.`);
      }
    }
    for (const flagKey of ["educationalOnly", "noMedicalDiagnosis", "noTreatmentPlan", "noPaymentProcessing", "noEmailSending"]) {
      if (lifecycle.safety?.[flagKey] !== true) failures.push(`clientLifecycle.safety.${flagKey} must be true.`);
    }
    // Single-stage helper resolves every stage and rejects unknown stages.
    for (const id of LIFECYCLE_STAGE_IDS) {
      if (!buildLifecycleStage(id)) failures.push(`buildLifecycleStage(${id}) should resolve.`);
    }
    if (buildLifecycleStage("not_a_stage") !== null) failures.push("buildLifecycleStage should reject unknown stages.");
    // Persona lifecycle fixtures exist, carry the disclaimer, and have no forbidden strings.
    for (const [persona, relPath] of Object.entries(LIFECYCLE_FIXTURES)) {
      const abs = join(repoRoot, relPath);
      if (!existsSync(abs)) {
        failures.push(`Lifecycle fixture missing for ${persona}: ${relPath}`);
        continue;
      }
      const fixture = readFileSync(abs, "utf8");
      if (!fixture.includes("not medical advice, diagnosis, or treatment")) {
        failures.push(`Lifecycle fixture ${relPath} must carry the non-medical disclaimer.`);
      }
      for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
        const match = fixture.match(re);
        if (match) failures.push(`Lifecycle fixture ${relPath} contains a forbidden string: "${match[0]}"`);
      }
    }
  }

  // Customer Demo Pack: seven reusable client artifacts.
  const demoPack = contract.customerDemoPack;
  if (!demoPack) {
    failures.push("customerDemoPack must be present in the contract.");
  } else {
    const expectedDeliverables = [
      "service_offer_page",
      "onboarding_questionnaire",
      "four_week_program",
      "weekly_check_in_form",
      "progress_summary",
      "renewal_follow_up",
      "client_handoff_packet",
    ];
    const ids = (demoPack.deliverables || []).map((d) => d.id);
    for (const id of expectedDeliverables) {
      if (!ids.includes(id)) failures.push(`customerDemoPack missing deliverable: ${id}`);
    }
    for (const hook of demoPack.serviceHooks || []) {
      if (hook.status !== "planned_not_live") failures.push(`Demo pack hook ${hook.id} must be planned_not_live.`);
    }
    for (const flagKey of ["educationalOnly", "noMedicalDiagnosis", "noTreatmentPlan", "noPaymentProcessing", "noEmailSending"]) {
      if (demoPack.safety?.[flagKey] !== true) failures.push(`customerDemoPack.safety.${flagKey} must be true.`);
    }
    const knownContracts = new Set((contract.artifactContracts || []).map((item) => item.id));
    for (const deliverable of demoPack.deliverables || []) {
      // The example prompt routes to the deliverable's artifact contract.
      if (deliverable.artifactContract) {
        if (!knownContracts.has(deliverable.artifactContract)) {
          failures.push(`Demo pack deliverable ${deliverable.id} references unknown contract ${deliverable.artifactContract}.`);
        }
        const routed = routeFreeformPrompt(deliverable.examplePrompt).serviceArtifactContract;
        if (routed !== deliverable.artifactContract) {
          failures.push(`Demo pack "${deliverable.examplePrompt}" should route to ${deliverable.artifactContract} (got ${routed}).`);
        }
      }
      // The fixture exists, carries the disclaimer, and has no forbidden strings.
      const abs = join(repoRoot, deliverable.fixture);
      if (!existsSync(abs)) {
        failures.push(`Demo pack fixture missing: ${deliverable.fixture}`);
        continue;
      }
      const fixture = readFileSync(abs, "utf8");
      if (!fixture.includes("not medical advice, diagnosis, or treatment")) {
        failures.push(`Demo pack fixture ${deliverable.fixture} must carry the non-medical disclaimer.`);
      }
      for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
        const match = fixture.match(re);
        if (match) failures.push(`Demo pack fixture ${deliverable.fixture} contains a forbidden string: "${match[0]}"`);
      }
    }
  }

  // Wellness Memory safety lane: candidates only, never writes, redacts clinical.
  const memory = contract.memory;
  if (!memory) {
    failures.push("memory lane must be present in the contract.");
  } else {
    if (memory.writesMemory !== false) failures.push("memory.writesMemory must be false (candidates only).");
    for (const id of [
      "creator_service_type",
      "offer_preferences",
      "program_style",
      "check_in_cadence",
      "client_communication_preferences",
      "artifact_preferences",
      "renewal_follow_up_preferences",
    ]) {
      if (!(memory.allowedCategories || []).some((category) => category.id === id)) {
        failures.push(`memory.allowedCategories should include ${id}.`);
      }
    }
    for (const id of [
      "diagnosis",
      "medication_advice",
      "medical_condition_treatment",
      "eating_disorder_treatment",
      "pregnancy_post_surgery_medical_plan",
      "private_health_records_without_consent",
    ]) {
      if (!(memory.forbiddenCategories || []).some((category) => category.id === id)) {
        failures.push(`memory.forbiddenCategories should include ${id}.`);
      }
    }
    for (const flagKey of ["writesMemory", "remembersDiagnosis", "remembersMedication", "remembersTreatment", "remembersHealthRecords", "acceptsSecrets"]) {
      if (memory.safety?.[flagKey] !== false) failures.push(`memory.safety.${flagKey} must be false.`);
    }
    // The classifier remembers safe candidates and refuses/redacts unsafe ones.
    for (const safe of [
      "Weekly Monday check-ins",
      "Prefers 8-week transformation offers with placeholder pricing",
      "Personal trainer running 1:1 strength coaching",
    ]) {
      if (classifyMemoryCandidate(safe).allowed !== true) failures.push(`Safe memory candidate should be allowed: "${safe}"`);
    }
    for (const unsafe of [
      "Client was diagnosed with type 2 diabetes; plan to treat it",
      "Remember the client takes 500mg metformin twice daily",
      "Client is in third-trimester pregnancy with a post-surgery rehab plan",
      "Client has an eating disorder; remember the cutting protocol",
      "Store the client's full medical history and lab results",
    ]) {
      if (classifyMemoryCandidate(unsafe).allowed !== false) failures.push(`Unsafe memory candidate must be refused/redacted: "${unsafe}"`);
    }
    // A secret memory candidate is refused and never echoed.
    const secretMem = classifyMemoryCandidate("remember my seed phrase apple banana cherry tiger river");
    if (secretMem.allowed !== false || secretMem.action !== "refuse") failures.push("Secret memory candidate must be refused.");
    // The --memory-candidates output must not echo refused/redacted source text.
    for (const item of buildMemoryCandidates()) {
      if (item.allowed === false && item.input !== "[withheld]") {
        failures.push("Refused/redacted memory candidate must not echo its source text.");
      }
    }
    // Memory fixtures exist, carry the disclaimer, and have no forbidden strings.
    for (const [key, relPath] of Object.entries(MEMORY_FIXTURES)) {
      const abs = join(repoRoot, relPath);
      if (!existsSync(abs)) {
        failures.push(`Memory fixture missing for ${key}: ${relPath}`);
        continue;
      }
      const fixture = readFileSync(abs, "utf8");
      if (!fixture.includes("not medical advice, diagnosis, or treatment")) {
        failures.push(`Memory fixture ${relPath} must carry the non-medical disclaimer.`);
      }
      for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
        const match = fixture.match(re);
        if (match) failures.push(`Memory fixture ${relPath} contains a forbidden string: "${match[0]}"`);
      }
    }
  }

  // Wellness Memory QA evidence pack: useful-but-safe, opt-in, non-writing.
  const memoryQa = contract.memoryQa;
  if (!memoryQa) {
    failures.push("memoryQa evidence pack must be present in the contract.");
  } else {
    if (memoryQa.writesMemory !== false) failures.push("memoryQa.writesMemory must be false.");
    for (const persona of ["personal_trainer", "yoga_instructor", "dietician"]) {
      const list = memoryQa.safeCandidatesByPersona?.[persona];
      if (!Array.isArray(list) || list.length === 0) {
        failures.push(`memoryQa should include safe candidates for ${persona}.`);
        continue;
      }
      for (const item of list) {
        if (item.allowed !== true) failures.push(`${persona} safe candidate should be allowed: "${item.input}"`);
        if (item.optIn !== true) failures.push(`${persona} safe candidate should be opt-in.`);
        if (!item.category) failures.push(`${persona} safe candidate should carry a category.`);
      }
    }
    for (const item of memoryQa.refusedClinicalExamples || []) {
      if (item.allowed !== false) failures.push("Clinical memory example must be refused/redacted.");
      if (item.input !== "[withheld]") failures.push("Clinical memory example must not echo source text.");
    }
    for (const item of memoryQa.refusedSecretExamples || []) {
      if (item.allowed !== false || item.action !== "refuse") failures.push("Secret memory example must be refused.");
      if (item.input !== "[withheld]") failures.push("Secret memory example must not echo source text.");
    }
    const summary = memoryQa.evidenceSummary || {};
    for (const key of ["allSafeAllowed", "allClinicalRefused", "allSecretRefused", "noLiveServiceClaims"]) {
      if (summary[key] !== true) failures.push(`memoryQa.evidenceSummary.${key} must be true.`);
    }
    if (summary.anySourceEchoed !== false || summary.writesMemory !== false) {
      failures.push("memoryQa evidence summary must show no echo and no writes.");
    }
    if (!Array.isArray(memoryQa.optInRequirements) || memoryQa.optInRequirements.length < 3) {
      failures.push("memoryQa.optInRequirements must list the opt-in rules.");
    }
    if (!Array.isArray(memoryQa.rerunCommands) || !memoryQa.rerunCommands.some((c) => c.includes("--memory-qa"))) {
      failures.push("memoryQa.rerunCommands should include the --memory-qa command.");
    }
    // The QA pack must not leak clinical/secret source tokens anywhere.
    const qaText = JSON.stringify(memoryQa).toLowerCase();
    for (const leak of ["metformin", "diabetes", "500mg", "lab results", "third-trimester", "cutting protocol", "seed phrase", "private key", "api secret", "wallet export", "apple banana", "0xabc123"]) {
      if (qaText.includes(leak)) failures.push(`memoryQa must not echo source token: "${leak}"`);
    }
  }

  // Wellness Memory contract adapter: MatterhornMemorySuggestion fixtures.
  const suggestionsBlock = contract.memorySuggestions;
  if (!suggestionsBlock) {
    failures.push("memorySuggestions adapter must be present in the contract.");
  } else {
    if (suggestionsBlock.writesMemory !== false) failures.push("memorySuggestions.writesMemory must be false.");
    if (suggestionsBlock.suggestionVersion !== "matterhorn.memory.suggestion.v1") {
      failures.push("memorySuggestions.suggestionVersion must match the contract.");
    }
    for (const persona of ["personal_trainer", "yoga_instructor", "dietician"]) {
      if (!suggestionsBlock.suggestions.some((s) => s.proposedRecord?.tags?.includes(persona))) {
        failures.push(`memorySuggestions should include a suggestion for ${persona}.`);
      }
    }
    // The six requested preference types must all be converted.
    const coveredCategories = new Set((suggestionsBlock.suggestions || []).map((s) => s.proposedRecord?.body?.category));
    for (const category of ["client_preference", "program_preference", "check_in_cadence", "equipment_constraints", "communication_preference", "dietary_preference"]) {
      if (!coveredCategories.has(category)) failures.push(`memorySuggestions must cover category: ${category}.`);
    }
    const ALLOWED_KINDS = ["user_preference", "project_fact", "protocol_address", "watchlist", "receipt", "workflow_artifact", "decision", "client_profile", "connector_preference", "mcp_tool_preference"];
    const ALLOWED_SCOPES = ["user", "workspace", "project", "session"];
    const ALLOWED_SENSITIVITIES = ["public", "private", "restricted", "forbidden_secret"];
    for (const s of suggestionsBlock.suggestions) {
      if (s.version !== "matterhorn.memory.suggestion.v1") failures.push("suggestion.version must match the contract.");
      if (s.captureMode !== "user_confirmed_only") failures.push("suggestion.captureMode must be user_confirmed_only.");
      if (s.canAutoCapture !== false) failures.push("suggestion.canAutoCapture must be false.");
      if (s.requiresExplicitConsent !== true) failures.push("suggestion.requiresExplicitConsent must be true.");
      if (s.forbiddenIfSecretDetected !== true) failures.push("suggestion.forbiddenIfSecretDetected must be true.");
      const r = s.proposedRecord;
      if (!r || typeof r !== "object") {
        failures.push("suggestion.proposedRecord must be an object.");
        continue;
      }
      for (const field of ["id", "kind", "scope", "title", "summary", "body", "tags", "links", "provenance", "sensitivity", "createdAt", "updatedAt"]) {
        if (!(field in r)) failures.push(`proposedRecord missing required field: ${field}`);
      }
      if (!ALLOWED_KINDS.includes(r.kind)) failures.push(`proposedRecord.kind invalid: ${r.kind}`);
      if (!ALLOWED_SCOPES.includes(r.scope)) failures.push(`proposedRecord.scope invalid: ${r.scope}`);
      if (!ALLOWED_SENSITIVITIES.includes(r.sensitivity)) failures.push(`proposedRecord.sensitivity invalid: ${r.sensitivity}`);
      if (r.provenance?.source !== "user_confirmed") failures.push("proposedRecord.provenance.source must be user_confirmed.");
      if (typeof r.provenance?.confidence !== "number") failures.push("proposedRecord.provenance.confidence must be a number.");
      if (!r.provenance?.reasonRemembered) failures.push("proposedRecord.provenance.reasonRemembered is required.");
      if (!Array.isArray(r.tags) || !r.tags.includes("opt-in") || !r.tags.includes("wellness")) {
        failures.push("proposedRecord.tags must include 'wellness' and 'opt-in'.");
      }
      [r.canUseInChat, r.canExport, r.canDelete].forEach((value, idx) => {
        if (typeof value !== "boolean") failures.push(`proposedRecord boolean capability ${idx} must be present.`);
      });
    }
    for (const item of suggestionsBlock.refused) {
      if (item.allowed !== false || item.input !== "[withheld]") failures.push("Refused suggestion must be withheld and not allowed.");
    }
    const sum = suggestionsBlock.evidenceSummary || {};
    for (const key of ["allSuggestionsUserConfirmedOnly", "allRefusedWithheld", "noLiveServiceClaims"]) {
      if (sum[key] !== true) failures.push(`memorySuggestions.evidenceSummary.${key} must be true.`);
    }
    if (sum.writesMemory !== false) failures.push("memorySuggestions.evidenceSummary.writesMemory must be false.");
    // No clinical/secret source tokens or live-service claims anywhere in the adapter output.
    const sgText = JSON.stringify(suggestionsBlock).toLowerCase();
    for (const leak of ["metformin", "diabetes", "500mg", "lab results", "third-trimester", "cutting protocol", "fodmap", "seed phrase", "private key", "api secret", "wallet export", "apple banana", "0xabc123", "payments are live", "email sending is live", "storage is live", "token gating is live"]) {
      if (sgText.includes(leak)) failures.push(`memorySuggestions must not contain: "${leak}"`);
    }
  }

  // Demo Packet Export: stitched, shareable packet per persona.
  const exportMeta = contract.demoPacketExport;
  if (!exportMeta || !Array.isArray(exportMeta.personas) || exportMeta.defaultPersona !== "wellness_creator") {
    failures.push("demoPacketExport must declare personas with a wellness_creator default.");
  }
  for (const persona of EXPORT_PERSONAS) {
    const packet = buildDemoPacketExport(persona);
    if (packet.persona !== persona) failures.push(`Demo packet export should resolve persona ${persona}.`);
    if (packet.deliverables.length !== DEMO_PACK_DELIVERABLES.length) {
      failures.push(`Demo packet export for ${persona} should stitch all ${DEMO_PACK_DELIVERABLES.length} deliverables.`);
    }
    for (const marker of [
      "Wellness Creator Demo Packet",
      "Safety & Boundaries",
      "not medical advice, diagnosis, or treatment",
      "planned, not live",
    ]) {
      if (!packet.markdown.includes(marker)) failures.push(`Demo packet export for ${persona} missing: "${marker}"`);
    }
    for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
      const match = packet.markdown.match(re);
      if (match) failures.push(`Demo packet export for ${persona} contains a forbidden string: "${match[0]}"`);
    }
  }
  // Unknown export persona falls back to the wellness_creator default.
  if (buildDemoPacketExport("not_a_persona").persona !== "wellness_creator") {
    failures.push("Demo packet export should fall back to wellness_creator for unknown personas.");
  }

  // Exposed through the existing generic Matterhorn workflow surfaces.
  const gs = contract.genericSurfaces;
  if (gs?.notCustomApp !== true) failures.push("genericSurfaces.notCustomApp must be true.");
  if (gs?.catalogWorkflowId !== "wellness_creator_workflow") {
    failures.push("genericSurfaces.catalogWorkflowId must be wellness_creator_workflow.");
  }
  if (gs?.templateRegistryId !== "wellness_creator_service_workflow") {
    failures.push("genericSurfaces.templateRegistryId must be wellness_creator_service_workflow.");
  }

  // Operator examples: all four present, routed, and client-safe.
  if (!Array.isArray(contract.operatorExamples) || contract.operatorExamples.length < 4) {
    failures.push("operatorExamples must include the four demo prompts.");
  }
  for (const example of contract.operatorExamples || []) {
    if (!example.artifactType) failures.push(`Operator example "${example.prompt}" must route to an artifact.`);
    if (example.safe !== true || example.disclaimerRequired !== true) {
      failures.push(`Operator example "${example.prompt}" must be safe and require a disclaimer.`);
    }
    if (example.paymentProcessed !== false || example.emailSent !== false) {
      failures.push(`Operator example "${example.prompt}" must not pay or email.`);
    }
  }

  // Customer-management deepening + progress check-in fixture.
  const cm = contract.customerManagement;
  if (!cm || !Array.isArray(cm.followUpCadence) || cm.followUpCadence.length < 3) {
    failures.push("customerManagement.followUpCadence must have at least three touchpoints.");
  }
  if (!cm?.feedbackForm || !cm?.renewalUpsell) {
    failures.push("customerManagement must include a feedback form and renewal/up-sell prompts.");
  }
  const fixturePath = cm?.progressCheckIn?.fixture;
  if (!fixturePath) {
    failures.push("customerManagement.progressCheckIn.fixture must be set.");
  } else {
    const abs = join(repoRoot, fixturePath);
    if (!existsSync(abs)) {
      failures.push(`Progress check-in fixture is missing: ${fixturePath}`);
    } else {
      const fixture = readFileSync(abs, "utf8");
      if (!fixture.includes("not medical advice, diagnosis, or treatment")) {
        failures.push("Progress check-in fixture must carry the non-medical disclaimer.");
      }
      for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES, SECRET_TEXT_RE]) {
        const match = fixture.match(re);
        if (match) failures.push(`Progress check-in fixture contains a forbidden string: "${match[0]}"`);
      }
    }
  }

  // No affirmative medical or live-service claim in the emitted content
  // (everything except the forbidden-claims allowlist).
  const { forbiddenClaims, ...scannable } = contract;
  const scanText = JSON.stringify(scannable);
  for (const re of [...FORBIDDEN_CLAIM_RES, ...FORBIDDEN_LIVE_RES]) {
    const match = scanText.match(re);
    if (match) failures.push(`Contract contains a forbidden claim: "${match[0]}"`);
  }

  return { ok: failures.length === 0, failures };
}

function main() {
  const wantJson = flag("--json");

  try {
    assertNoForbiddenArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (wantJson) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
    return;
  }

  if (flag("--route")) {
    const idx = args.indexOf("--route");
    const prompt = args[idx + 1] ?? "";
    process.stdout.write(`${JSON.stringify({ version: VERSION, mode: "route", ...routeFreeformPrompt(prompt) }, null, 2)}\n`);
    return;
  }

  if (flag("--memory-candidates")) {
    process.stdout.write(`${JSON.stringify({
      version: VERSION,
      mode: "memory-candidates",
      writesMemory: false,
      lane: buildMemoryLane(),
      candidates: buildMemoryCandidates(),
    }, null, 2)}\n`);
    return;
  }

  if (flag("--memory-qa")) {
    process.stdout.write(`${JSON.stringify({
      version: VERSION,
      mode: "memory-qa",
      writesMemory: false,
      ...buildMemoryQa(),
    }, null, 2)}\n`);
    return;
  }

  if (flag("--memory-suggestions")) {
    process.stdout.write(`${JSON.stringify({
      version: VERSION,
      mode: "memory-suggestions",
      writesMemory: false,
      ...buildMemorySuggestions(),
    }, null, 2)}\n`);
    return;
  }

  if (flag("--offer")) {
    const idx = args.indexOf("--offer");
    const persona = args[idx + 1] ?? "";
    if (!OFFER_PERSONAS.includes(persona)) {
      const message = `Unknown offer persona "${persona}". Expected one of: ${OFFER_PERSONAS.join(", ")}.`;
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ version: VERSION, mode: "offer", ...buildOfferBuilder(persona) }, null, 2)}\n`);
    return;
  }

  if (flag("--demo-pack")) {
    const idx = args.indexOf("--demo-pack");
    const persona = args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : null;
    if (persona && !OFFER_PERSONAS.includes(persona)) {
      const message = `Unknown demo-pack persona "${persona}". Expected one of: ${OFFER_PERSONAS.join(", ")}.`;
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ version: VERSION, mode: "demo-pack", ...buildCustomerDemoPack(persona) }, null, 2)}\n`);
    return;
  }

  if (flag("--demo-pack-export")) {
    const idx = args.indexOf("--demo-pack-export");
    const persona = args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : "wellness_creator";
    if (!EXPORT_PERSONAS.includes(persona)) {
      const message = `Unknown demo-pack-export persona "${persona}". Expected one of: ${EXPORT_PERSONAS.join(", ")}.`;
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    const outIdx = args.indexOf("--output");
    const outputPath = outIdx >= 0 && args[outIdx + 1] && !args[outIdx + 1].startsWith("--") ? args[outIdx + 1] : null;
    const packet = buildDemoPacketExport(persona);
    let written = null;
    if (outputPath) {
      try {
        mkdirSync(dirname(resolve(outputPath)), { recursive: true });
        writeFileSync(resolve(outputPath), packet.markdown, "utf8");
        written = outputPath;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`${JSON.stringify({ ok: false, error: `Failed to write packet: ${message}` }, null, 2)}\n`);
        process.exitCode = 1;
        return;
      }
    }
    if (wantJson) {
      process.stdout.write(`${JSON.stringify({
        version: VERSION,
        mode: "demo-pack-export",
        ok: true,
        persona: packet.persona,
        personaLabel: packet.personaLabel,
        deliverables: packet.deliverables,
        output: written,
        bytes: Buffer.byteLength(packet.markdown, "utf8"),
      }, null, 2)}\n`);
    } else if (written) {
      process.stdout.write(`Wrote Wellness demo packet for ${packet.personaLabel} to ${written}\n`);
    } else {
      process.stdout.write(`${packet.markdown}\n`);
    }
    return;
  }

  if (flag("--lifecycle")) {
    const idx = args.indexOf("--lifecycle");
    const persona = args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : null;
    if (persona && !OFFER_PERSONAS.includes(persona)) {
      const message = `Unknown lifecycle persona "${persona}". Expected one of: ${OFFER_PERSONAS.join(", ")}.`;
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ version: VERSION, mode: "lifecycle", ...buildClientLifecycle(persona) }, null, 2)}\n`);
    return;
  }

  if (flag("--stage")) {
    const idx = args.indexOf("--stage");
    const stageId = args[idx + 1] ?? "";
    const stage = buildLifecycleStage(stageId);
    if (!stage) {
      const message = `Unknown lifecycle stage "${stageId}". Expected one of: ${LIFECYCLE_STAGE_IDS.join(", ")}.`;
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ version: VERSION, mode: "stage", ...stage }, null, 2)}\n`);
    return;
  }

  if (flag("--check")) {
    const result = runCheck();
    const payload = { version: VERSION, mode: "check", ...result };
    if (wantJson) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      for (const failure of result.failures) process.stderr.write(`FAIL ${failure}\n`);
      process.stdout.write(
        result.ok
          ? "Wellness Creator Workflow check passed.\n"
          : `Wellness Creator Workflow check found ${result.failures.length} issue(s).\n`,
      );
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  process.stdout.write(`${JSON.stringify(buildContract(), null, 2)}\n`);
}

// Run only when invoked directly, so the contract/router can be imported and
// unit-tested without executing the CLI.
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isDirectRun()) main();

export { buildContract, routeFreeformPrompt };
