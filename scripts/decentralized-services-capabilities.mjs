#!/usr/bin/env node

const CAPABILITIES = [
  {
    capability: "hosting",
    label: "Hosting",
    userIntents: ["Host this app", "Deploy my frontend", "Publish this site"],
    futureProviderExamples: ["Akash", "Fleek", "Spheron"],
    authModels: ["oauth2", "api_key_reference", "wallet_address", "subscription"],
    outputArtifacts: ["deployment_url", "deployment_log_url", "build_hash", "domain_record"],
  },
  {
    capability: "storage",
    label: "Storage",
    userIntents: ["Store this file on decentralized storage", "Pin this CID", "Back up this artifact"],
    futureProviderExamples: ["IPFS/Filecoin", "Arweave", "Storj"],
    authModels: ["oauth2", "api_key_reference", "wallet_address", "subscription"],
    outputArtifacts: ["content_cid", "storage_receipt", "gateway_url", "integrity_hash"],
  },
  {
    capability: "email",
    label: "Email",
    userIntents: ["Send emails to my customers", "Send a newsletter", "Verify a user by email"],
    futureProviderExamples: ["Resend", "SendGrid", "Mailgun"],
    authModels: ["oauth2", "api_key_reference", "subscription"],
    outputArtifacts: ["message_preview", "recipient_count", "delivery_receipt", "suppression_summary"],
  },
  {
    capability: "payments",
    label: "Payments",
    userIntents: ["Collect payments", "Create a paid creator program", "Issue an invoice"],
    futureProviderExamples: ["Stripe", "Coinbase Commerce", "Loop"],
    authModels: ["oauth2", "wallet_address", "external_signer", "subscription"],
    outputArtifacts: ["checkout_preview", "invoice_url", "payment_receipt", "refund_policy"],
  },
  {
    capability: "identity",
    label: "Identity / Access",
    userIntents: ["Create a customer login", "Gate this file by wallet", "Issue a membership"],
    futureProviderExamples: ["ENS", "World ID", "Privy", "Dynamic"],
    authModels: ["oauth2", "wallet_address", "did", "external_signer", "subscription"],
    outputArtifacts: ["access_policy", "membership_receipt", "identity_attestation", "revocation_log"],
  },
];

const SAFETY_DEFAULTS = {
  custody: "none",
  status: "future_contract",
  liveExecutionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSecrets: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
  rejectsRawSigningMaterial: true,
};

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
    capability: value("--capability", value("--service", "")).trim().toLowerCase(),
    help: args.includes("--help") || args.includes("-h"),
    args,
  };
}

function assertNoForbiddenArgs(args) {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the decentralized services helper.`);
    }
  }
}

function buildCatalog(config) {
  const selected = config.capability
    ? CAPABILITIES.filter((item) => item.capability === config.capability)
    : CAPABILITIES;
  if (config.capability && selected.length === 0) {
    throw new Error(`Unknown decentralized service capability: ${config.capability}`);
  }

  return {
    success: true,
    version: "matterhorn.services.capability-catalog.v1",
    status: "future_contract",
    summary: "Provider-neutral future contracts for hosting, storage, email, payments, and identity/access through Matterhorn Work chat.",
    commands: {
      capabilities: "matterhorn-work services capabilities --json",
      capabilityFilter: "matterhorn-work services capabilities --capability hosting --json",
      contractGate: "pnpm test:decentralized-services-contract",
      helperGate: "pnpm test:decentralized-services-operator-helper",
    },
    safety: {
      ...SAFETY_DEFAULTS,
      allContractsFutureOnly: true,
      canExecute: false,
    },
    capabilities: selected.map((item) => ({
      ...item,
      version: "matterhorn.services.provider-manifest.v1",
      status: "future_contract",
      liveExecutionEnabled: false,
      previewSupported: true,
      confirmationRequired: true,
      externalSignerOrHandoff: true,
      canExecute: false,
      unsupportedLiveMessage: "No real provider is wired up yet. Matterhorn can explain and plan this capability, but cannot execute it live.",
      safety: SAFETY_DEFAULTS,
    })),
    nextBuildPhases: [
      "Add read-only provider discovery manifests.",
      "Add preview-only provider adapters with cost and consequence text.",
      "Add explicit confirmation and external-provider handoff packets.",
      "Add public receipt import and rollback evidence.",
      "Promote a provider only after security review and customer QA.",
    ],
    references: [
      "docs/decentralized-services-capability-contract.md",
      "docs/handoffs/kimi-decentralized-services-contract.md",
      "packages/types/src/decentralized-services.ts",
    ],
  };
}

function printText(catalog) {
  process.stdout.write(`${catalog.summary}\n\n`);
  process.stdout.write(`Status: ${catalog.status}\n`);
  process.stdout.write("Live execution: Off\n");
  process.stdout.write("Can execute: No\n\n");
  for (const item of catalog.capabilities) {
    process.stdout.write(`${item.label} (${item.capability})\n`);
    process.stdout.write(`  Intents: ${item.userIntents.join("; ")}\n`);
    process.stdout.write(`  Future providers: ${item.futureProviderExamples.join(", ")}\n`);
    process.stdout.write(`  Artifacts: ${item.outputArtifacts.join(", ")}\n\n`);
  }
  process.stdout.write(`Run: ${catalog.commands.contractGate}\n`);
}

function main() {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write([
      "Matterhorn Work decentralized services capability helper",
      "",
      "Usage:",
      "  node scripts/decentralized-services-capabilities.mjs [--json] [--capability hosting|storage|email|payments|identity]",
      "  matterhorn-work services capabilities --json",
      "",
      "This helper is future-contract only. It never accepts secrets, signs, submits, or executes provider actions.",
      "",
    ].join("\n"));
    return;
  }

  assertNoForbiddenArgs(config.args);
  const catalog = buildCatalog(config);
  if (config.json) {
    process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
    return;
  }
  printText(catalog);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
