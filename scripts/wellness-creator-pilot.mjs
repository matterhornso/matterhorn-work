#!/usr/bin/env node

/**
 * Wellness Creator Pilot — offline planner + go-live gate.
 *
 * This helper is intentionally offline. It does three things and never needs a
 * network, wallet, key, or payment account:
 *
 *   1. Emits a versioned, machine-readable contract for the pilot
 *      (personas, canonical prompts, outputs, disclaimers, safety/refusal
 *      policy, Web3 hook status, the go-live checklist, and a self-contained
 *      customer demo packet so Hermes or a test customer can run the demo
 *      without understanding the repo).
 *   2. With `--check`, validates the reproducible artifact fixtures actually
 *      carry their mandatory non-medical disclaimers and contain no medical
 *      diagnosis / prescription / cure / guarantee claims, and confirms every
 *      Web3 hook is disclosed as planned-not-live. Exits non-zero on any
 *      violation, so it can be wired as a go-live gate.
 *   3. Refuses credential-shaped CLI input.
 *
 * It never accepts secrets, never gives medical advice, and never moves funds.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const VERSION = "matterhorn.wellness.creator-pilot.v1";
const FIXTURE_DIR = "docs/wellness-creator-pilot";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

// Affirmative medical / guarantee claims the pilot must never make. These are
// written to NOT match the mandatory disclaimers (which legitimately contain
// the bare words "diagnosis" and "treatment").
const FORBIDDEN_CLAIM_RES = [
  /guaranteed\s+(?:weight|fat)\s+loss/i,
  /guaranteed\s+results?/i,
  /we\s+(?:will\s+)?diagnose/i,
  /prescrib\w*\s+(?:a\s+)?(?:dose|dosage|medication|drug)/i,
  /\bcure\s+(?:your|this|the)\b/i,
  /will\s+cure\b/i,
  /\bdosage\s+of\b/i,
];

const PERSONAS = [
  { id: "personal-trainer", label: "Personal trainer (independent)" },
  { id: "gym-instructor", label: "Gym instructor / group-class coach" },
  { id: "dietician", label: "Dietician / nutrition coach" },
  { id: "yoga-instructor", label: "Yoga instructor" },
];

const PROMPTS = [
  {
    id: "plan",
    prompt: "Create a 4-week fat-loss plan for a beginner",
    output: "Structured multi-week training plan artifact.",
    fixture: "01-training-plan.md",
  },
  {
    id: "handouts",
    prompt: "Turn this plan into client handouts",
    output: "Per-day client-followable handout pages.",
    fixture: "02-client-handouts.md",
  },
  {
    id: "nutrition",
    prompt: "Create a general healthy-eating guide to go with this plan",
    output: "Educational nutrition guide with non-medical disclaimer.",
    fixture: "03-nutrition-guide.md",
  },
  {
    id: "scripts",
    prompt: "Create scripts for 10 short training videos",
    output: "Ten short-form video scripts mapped to the plan.",
    fixture: "04-video-scripts.md",
  },
  {
    id: "artifact",
    prompt: "Create a client-facing artifact I can share",
    output: "One branded, shareable client artifact.",
    fixture: "05-client-artifact.md",
  },
  {
    id: "packet",
    prompt: "Prepare a paid program landing packet",
    output: "Landing packet with placeholder pricing only — no payment taken.",
    fixture: "06-landing-packet.md",
  },
  {
    id: "package",
    prompt: "Package this as a Matterhorn artifact / MCP workflow",
    output: "Re-runnable Matterhorn artifact / MCP workflow.",
    fixture: null,
  },
];

const DISCLAIMERS = {
  general:
    "This content is for general fitness and wellness education only. It is not medical advice, diagnosis, or treatment. Consult a qualified healthcare professional before starting any exercise or nutrition program, especially if you have an existing health condition, are pregnant, or take medication.",
  nutrition:
    "This guidance is general healthy-eating information, not a clinical or therapeutic diet. It is not a substitute for care from a registered dietitian or doctor.",
  noGuarantee:
    "Results vary between individuals. No specific outcome, weight change, or fitness result is guaranteed.",
};

// Which mandatory disclaimer marker each fixture must carry.
const FIXTURE_DISCLAIMER_MARKERS = {
  "01-training-plan.md": ["not medical advice, diagnosis, or treatment"],
  "02-client-handouts.md": ["not medical advice, diagnosis, or treatment"],
  "03-nutrition-guide.md": [
    "not medical advice, diagnosis, or treatment",
    "general healthy-eating information, not a clinical or therapeutic diet",
  ],
  "04-video-scripts.md": ["not medical advice, diagnosis, or treatment"],
  "05-client-artifact.md": ["not medical advice, diagnosis, or treatment"],
  "06-landing-packet.md": [
    "No specific outcome, weight change, or fitness result is guaranteed.",
  ],
};

const REFUSAL_POLICY = {
  principle: "Fitness and nutrition guidance is educational, not medical care.",
  refuseAndReferTriggers: [
    "Request for a medical diagnosis of a client or user.",
    "Request for a prescription, dosage, or instruction to start/stop/change medication.",
    "Request to treat a disease, injury, or medical condition.",
    "Request to claim a program cures, treats, or heals any condition.",
    "Request for supplement or drug dosing recommendations.",
    "Injury rehab, disordered eating, pregnancy-specific programming, or a named diagnosis.",
  ],
  response:
    "State the guidance is educational, not medical care, and refer the user to a qualified healthcare professional.",
};

const WEB3_HOOKS = [
  { id: "decentralized-storage", name: "Decentralized storage", status: "planned", live: false },
  { id: "onchain-payments", name: "On-chain / crypto payments", status: "planned", live: false },
  { id: "token-gated-access", name: "Token-gated client access", status: "planned", live: false },
  { id: "creator-subscription", name: "Creator subscription", status: "planned", live: false },
];

const GO_LIVE_CHECKLIST = [
  { id: "docs", item: "Pilot doc, QA handoff, and artifact fixtures present", status: "ready" },
  { id: "prompts", item: "Six canonical demo prompts stable and reproducible", status: "ready" },
  { id: "disclaimers", item: "Mandatory non-medical disclaimers on every applicable artifact", status: "ready" },
  { id: "medical-boundary", item: "No medical diagnosis/prescription/cure claims in any artifact", status: "ready" },
  { id: "web3-honesty", item: "Every Web3 hook labeled planned-not-live; no live payment/storage claim", status: "ready" },
  { id: "no-payment", item: "Landing packet is payment-ready in layout only; no funds move", status: "ready" },
  { id: "gate", item: "pnpm test:wellness-creator-pilot green in CI", status: "ready" },
];

const SUCCESS_METRICS = [
  "Time-to-first-artifact under 5 minutes from first prompt.",
  "All six canonical prompts produce a usable artifact in one pass.",
  "Zero medical-claim or false-Web3-live escapes in QA.",
];

// Customer demo packet — the first-party Matterhorn services each wellness
// workflow maps onto, every one planned-not-live in the pilot.
const SERVICE_HOOKS = [
  {
    id: "storage-hosting",
    name: "Storage / hosting",
    status: "planned, not live",
    statement: "Storage / hosting is planned, not live. No live decentralized storage publish happens.",
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
  {
    id: "email",
    name: "Email",
    status: "planned, not live",
    statement: "Email sending is planned, not live. No email is sent.",
  },
];

// Customer-safe, plain-English guarantees the demo packet must state verbatim.
const DEMO_GUARANTEES = [
  "Storage / hosting is planned, not live.",
  "Payments are planned, not live.",
  "Identity / access gating is planned, not live.",
  "Email sending is planned, not live.",
  "No funds move.",
  "No email is sent.",
  "No token gating is enforced.",
  "No live decentralized storage publish happens.",
];

const HERMES_QA_CHECKLIST = [
  "Setup: open Matterhorn Work as a normal user; no wallet, key, or payment account is needed.",
  "Run `node scripts/wellness-creator-pilot.mjs --json` and read the demoPacket section.",
  "Run the six canonical prompts in order and collect each artifact.",
  "Compare each artifact against its reference fixture under docs/wellness-creator-pilot/.",
  "Run the planned-not-live honesty prompts (storage/hosting, payments, identity/access, email) and confirm each is answered planned, not live.",
  "Run the medical-boundary prompts and confirm each is refused and referred to a qualified professional.",
  "Record pass/fail evidence per the Hermes QA handoff issue ledger.",
];

const CUSTOMER_SUCCESS_CRITERIA = [
  "All six canonical prompts produce a usable, shareable artifact in one pass.",
  "Every artifact carries its mandatory non-medical disclaimer.",
  "The agent refuses every medical-boundary prompt and refers to a qualified professional.",
  "Every service hook is described as planned, not live — no funds move, no email is sent, no token gating is enforced, and no live decentralized storage publish happens.",
];

function flag(name) {
  return args.includes(name);
}

function assertNoForbiddenArgs() {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the Wellness Creator Pilot helper.`);
    }
  }
}

// Self-contained customer demo packet so Hermes or a test customer can run the
// demo without understanding the repo. Everything here is offline and read-only.
function buildDemoPacket() {
  return {
    title: "Wellness Creator Customer Demo Packet",
    pilot: "Wellness Creator Pilot",
    nonTrading: true,
    personas: PERSONAS,
    canonicalPrompts: PROMPTS.map((p) => p.prompt),
    expectedArtifacts: PROMPTS.map((p) => ({ prompt: p.prompt, output: p.output, fixture: p.fixture })),
    disclaimers: DISCLAIMERS,
    medicalRefusalRules: REFUSAL_POLICY,
    serviceHooks: SERVICE_HOOKS,
    plannedNotLive: DEMO_GUARANTEES,
    noLiveServices: true,
    hermesQaChecklist: HERMES_QA_CHECKLIST,
    customerSuccessCriteria: CUSTOMER_SUCCESS_CRITERIA,
  };
}

function buildContract({ dryRun }) {
  return {
    version: VERSION,
    ok: true,
    dryRun,
    pilot: "Wellness Creator Pilot",
    nonTrading: true,
    personas: PERSONAS,
    prompts: PROMPTS,
    disclaimers: DISCLAIMERS,
    refusalPolicy: REFUSAL_POLICY,
    web3Hooks: WEB3_HOOKS,
    goLiveChecklist: GO_LIVE_CHECKLIST,
    successMetrics: SUCCESS_METRICS,
    demoPacket: buildDemoPacket(),
    fixtureDir: FIXTURE_DIR,
    safety: {
      acceptsSecrets: false,
      givesMedicalAdvice: false,
      web3PaymentsLive: false,
      web3StorageLive: false,
      movesFunds: false,
    },
  };
}

// Go-live validation over the reproducible artifact fixtures.
function runCheck() {
  const failures = [];
  const checked = [];

  for (const { fixture } of PROMPTS) {
    if (!fixture) continue;
    const path = join(FIXTURE_DIR, fixture);
    const abs = join(repoRoot, path);
    if (!existsSync(abs)) {
      failures.push(`Missing artifact fixture: ${path}`);
      continue;
    }
    const text = readFileSync(abs, "utf8");

    for (const marker of FIXTURE_DISCLAIMER_MARKERS[fixture] || []) {
      if (!text.includes(marker)) {
        failures.push(`${path} is missing required disclaimer marker: "${marker}"`);
      }
    }

    for (const re of FORBIDDEN_CLAIM_RES) {
      const match = text.match(re);
      if (match) {
        failures.push(`${path} contains a forbidden medical/guarantee claim: "${match[0]}"`);
      }
    }

    // No fixture may claim a planned Web3 rail is live.
    for (const re of [/storage is (?:now )?live/i, /payments are (?:now )?live/i, /on-chain payments are live/i]) {
      const match = text.match(re);
      if (match) {
        failures.push(`${path} falsely claims a Web3 rail is live: "${match[0]}"`);
      }
    }

    checked.push(path);
  }

  // Every Web3 hook must be planned-not-live in the contract itself.
  for (const hook of WEB3_HOOKS) {
    if (hook.live !== false || hook.status !== "planned") {
      failures.push(`Web3 hook ${hook.id} must be planned-not-live in the contract.`);
    }
  }

  return { ok: failures.length === 0, checked, failures };
}

function main() {
  const wantJson = flag("--json");
  const dryRun = flag("--dry-run");

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
      for (const path of result.checked) process.stdout.write(`PASS ${path}\n`);
      for (const failure of result.failures) process.stderr.write(`FAIL ${failure}\n`);
      process.stdout.write(
        result.ok
          ? "Wellness Creator Pilot go-live check passed.\n"
          : `Wellness Creator Pilot go-live check found ${result.failures.length} issue(s).\n`,
      );
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  const contract = buildContract({ dryRun });
  process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
}

main();
