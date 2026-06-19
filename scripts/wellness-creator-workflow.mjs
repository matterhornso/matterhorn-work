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

const args = process.argv.slice(2);

const VERSION = "matterhorn.wellness.creator-workflow.v1";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

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
    artifacts: ["Follow-up cadence", "Feedback form", "Renewal / up-sell prompts"],
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
    personas: PERSONAS,
    canonicalPrompts: CANONICAL_PROMPTS,
    stages: STAGES,
    promptArtifacts: PROMPT_ARTIFACTS,
    expectedArtifactTypes: EXPECTED_ARTIFACT_TYPES,
    disclaimers: DISCLAIMERS,
    serviceHooks: SERVICE_HOOKS,
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

  // Every service hook must be planned, not live.
  for (const hook of contract.serviceHooks) {
    if (hook.status !== "planned, not live") {
      failures.push(`Service hook ${hook.id} must be planned, not live.`);
    }
  }
  for (const [key, value] of Object.entries(contract.safety)) {
    if (key.endsWith("Live") && value !== false) failures.push(`safety.${key} must be false.`);
  }
  if (contract.safety.movesFunds !== false) failures.push("safety.movesFunds must be false.");
  if (contract.safety.acceptsSecrets !== false) failures.push("safety.acceptsSecrets must be false.");
  if (contract.safety.givesMedicalAdvice !== false) failures.push("safety.givesMedicalAdvice must be false.");

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

main();
