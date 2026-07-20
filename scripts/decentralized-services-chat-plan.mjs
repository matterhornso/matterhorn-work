#!/usr/bin/env node

const CAPABILITIES = [
  {
    capability: "hosting",
    label: "Hosting",
    userIntents: ["Host this app", "Deploy my frontend", "Publish this site"],
    futureProviderExamples: ["Akash", "Fleek", "Spheron"],
    outputArtifacts: ["deployment_url", "deployment_log_url", "build_hash", "domain_record"],
    keywords: ["host", "hosting", "deploy", "deployment", "publish", "website", "site", "frontend", "domain", "landing"],
  },
  {
    capability: "storage",
    label: "Storage",
    userIntents: ["Store this file on decentralized storage", "Pin this CID", "Back up this artifact"],
    futureProviderExamples: ["IPFS/Filecoin", "Arweave", "Storj"],
    outputArtifacts: ["content_cid", "storage_receipt", "gateway_url", "integrity_hash"],
    keywords: ["store", "storage", "upload", "file", "artifact", "pin", "cid", "ipfs", "arweave", "backup"],
  },
  {
    capability: "email",
    label: "Email",
    userIntents: ["Send emails to my customers", "Send a newsletter", "Verify a user by email"],
    futureProviderExamples: ["Resend", "SendGrid", "Mailgun"],
    outputArtifacts: ["message_preview", "recipient_count", "delivery_receipt", "suppression_summary"],
    keywords: ["email", "newsletter", "mail", "message", "notify", "notification", "transactional", "customer update"],
  },
  {
    capability: "payments",
    label: "Payments",
    userIntents: ["Collect payments", "Create a paid creator program", "Issue an invoice"],
    futureProviderExamples: ["Stripe", "Coinbase Commerce", "Loop"],
    outputArtifacts: ["checkout_preview", "invoice_url", "payment_receipt", "refund_policy"],
    keywords: ["payment", "payments", "pay", "paid", "charge", "checkout", "invoice", "subscription", "sell", "purchase", "pricing"],
  },
  {
    capability: "identity",
    label: "Identity / Access",
    userIntents: ["Create a customer login", "Gate this file by wallet", "Issue a membership"],
    futureProviderExamples: ["ENS", "World ID", "Privy", "Dynamic"],
    outputArtifacts: ["access_policy", "membership_receipt", "identity_attestation", "revocation_log"],
    keywords: ["identity", "login", "access", "gate", "gated", "membership", "member", "wallet gate", "token gate", "verify"],
  },
];

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase)$/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  const value = (name, fallback = "") => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((item) => item.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : fallback;
  };
  return {
    json: args.includes("--json"),
    message: value("--message", value("--prompt", "")).trim() || args.filter((item) => !item.startsWith("--")).join(" ").trim(),
    capability: value("--capability", value("--service", "")).trim().toLowerCase(),
    help: args.includes("--help") || args.includes("-h"),
    args,
  };
}

function assertNoForbiddenArgs(args) {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the decentralized services chat planner.`);
    }
  }
}

function classify(message, capability) {
  if (capability) {
    const selected = CAPABILITIES.find((item) => item.capability === capability);
    if (!selected) throw new Error(`Unknown decentralized service capability: ${capability}`);
    return [selected.capability];
  }
  const normalized = message.toLowerCase();
  const matched = CAPABILITIES
    .filter((item) => item.keywords.some((keyword) => normalized.includes(keyword)))
    .map((item) => item.capability);
  if (matched.length) return matched;
  if (/\b(service|services|web3|decentralized|matterhorn)\b/i.test(message)) return CAPABILITIES.map((item) => item.capability);
  return [];
}

function buildPlan(config) {
  if (!config.message) throw new Error("message is required for services chat planning");
  const matchedCapabilities = classify(config.message, config.capability);
  const selected = matchedCapabilities.length ? matchedCapabilities : CAPABILITIES.map((item) => item.capability);
  const items = CAPABILITIES.filter((item) => selected.includes(item.capability));
  const requiresClarification = matchedCapabilities.length === 0;
  const safety = {
    custody: "none",
    status: "future_contract",
    liveExecutionEnabled: false,
    acceptsPrivateKeys: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSecrets: false,
    canExecute: false,
  };
  return {
    success: true,
    version: "matterhorn.services.chat-plan.v1",
    status: "future_contract",
    execution: "planned_not_live",
    message: config.message,
    responseText: requiresClarification
      ? "Matterhorn can plan hosting, storage, email, payments, and identity/access workflows, but these service rails are future-contract only. Which capability should I plan first?"
      : `Matterhorn can plan this ${items.map((item) => item.label).join(", ")} workflow, but live service execution is not enabled yet.`,
    matchedCapabilities,
    requiresClarification,
    clarificationQuestion: requiresClarification
      ? "Should I plan hosting, storage, email, payments, identity/access, or a combined workflow?"
      : null,
    safety,
    cards: items.map((item) => ({
      kind: "service_plan",
      version: "matterhorn.services.card.v1",
      title: `${item.label} plan`,
      capability: item.capability,
      status: "future_contract",
      summary: "No real provider is wired up yet. Matterhorn can explain and plan this capability, but cannot execute it live.",
      providerExamples: item.futureProviderExamples,
      outputArtifacts: item.outputArtifacts,
      supportedUserIntents: item.userIntents,
      nextSteps: [
        "Collect only public/redacted requirements for the desired workflow.",
        "Render a preview with consequence text, cost estimate, and required confirmation.",
        "Use external provider or signer handoff only after a future security review enables it.",
      ],
      safety: {
        canExecute: false,
        liveExecutionEnabled: false,
        acceptsSecrets: false,
        plannedNotLive: true,
      },
    })),
    nextActions: [
      "Use this plan as product guidance only; do not call a live provider.",
      "Keep secrets, private keys, raw signatures, and provider credentials out of chat and API payloads.",
      "Run pnpm test:decentralized-services-chat-plan before changing the service planner contract.",
    ],
    warnings: [
      "Services are future-contract only in this build.",
      "Matterhorn does not host, store, email, charge, gate access, sign, submit, or execute provider actions from this planner.",
    ],
  };
}

function printText(plan) {
  process.stdout.write(`${plan.responseText}\n\n`);
  process.stdout.write("Live execution: Off\n");
  process.stdout.write("Can execute: No\n\n");
  for (const card of plan.cards) {
    process.stdout.write(`${card.title}\n`);
    process.stdout.write(`  Capability: ${card.capability}\n`);
    process.stdout.write(`  Future providers: ${card.providerExamples.join(", ")}\n`);
    process.stdout.write(`  Artifacts: ${card.outputArtifacts.join(", ")}\n`);
    process.stdout.write("  Status: planned, not live\n\n");
  }
}

function main() {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write([
      "Matterhorn Desks decentralized services chat planner",
      "",
      "Usage:",
      "  node scripts/decentralized-services-chat-plan.mjs --message <text> [--capability hosting|storage|email|payments|identity] [--json]",
      "  matterhorn-work services chat --message <text> --json",
      "",
      "This planner is future-contract only. It never accepts secrets, signs, submits, or executes provider actions.",
      "",
    ].join("\n"));
    return;
  }
  assertNoForbiddenArgs(config.args);
  const plan = buildPlan(config);
  if (config.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  printText(plan);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
