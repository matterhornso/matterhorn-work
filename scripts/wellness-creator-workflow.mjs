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

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

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
// medication/dosing, or treating a named condition or injury. These are
// redirected to educational/safety language and a referral, never answered as
// medical advice.
const MEDICAL_INTENT_RE =
  /\b(diagnos\w*|prescrib\w*|prescription|medication|dosage)\b|\bdose\b|\b(cure\w*|treat\w*|heal\b|healing\b|rehab\w*)\b[^.?!]*\b(condition|disease|illness|injury|injuries|diabetes|hypertension|thyroid|cancer|asthma|arthritis|depression|anxiety|fracture|sprain|tear|torn|ligament|acl|chronic pain|back pain|knee pain|joint pain|pain)\b|\b(diabetes|hypertension|thyroid|cancer|herniated|sciatica)\b/i;

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
  return {
    artifactType,
    safe: true,
    refused: false,
    educationalOnly: true,
    disclaimerRequired: true,
    paymentProcessed: false,
    emailSent: false,
    acceptsSecrets: false,
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
