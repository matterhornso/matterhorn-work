#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const VERSION = "matterhorn.workflow.evidence-bundle-operator.v1";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

function rejectCredentialArgs() {
  for (const arg of process.argv.slice(2)) {
    if (FORBIDDEN_ARG_RE.test(arg)) {
      console.error(`Forbidden credential-shaped flag ${arg}`);
      process.exit(1);
    }
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalJson);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalJson(value[key]);
  }
  return sorted;
}

function computeEvidenceHash(bundle) {
  const { evidenceHash, ...rest } = bundle;
  return createHash("sha256").update(JSON.stringify(canonicalJson(rest))).digest("hex");
}

export const EVIDENCE_BUNDLE_FIXTURES = {
  wellness_creator_workflow: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "wellness_creator_services",
    domain: "wellness",
    requestedOutcome: "Plan a safe wellness creator service package without collecting PII or secrets.",
    inputPrompt: "Create a wellness program for my clients",
    generatedArtifactType: "service_plan",
    safetyStatus: "planned_not_live",
    liveExecutionEnabled: false,
    acceptsCustody: false,
    acceptsSigning: false,
    acceptsSecrets: false,
    publicEvidence: [
      {
        id: "client_goal",
        label: "Client goal",
        value: "REDACTED",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "service_tier",
        label: "Selected service tier",
        value: "monthly_yoga_coaching",
        mimeType: "text/plain",
        public: true,
        source: "agent",
      },
      {
        id: "delivery_format",
        label: "Delivery format",
        value: "live_session",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
    ],
    plannedServiceHooks: [
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "hosting", status: "planned_not_live" },
    ],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_execution",
      "customer_pii_redacted_in_public_evidence",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "agent",
    status: "planned_not_live",
    canExecute: false,
    evidenceHash: "422205c6d38466073feaa2f89f272708bebd9ae2358653978380b2bc07af3b89",
  },
  bittensor_beta_workflow: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "bittensor_operator",
    domain: "bittensor",
    requestedOutcome: "Record the public inputs and safety checks for a TAO staking preview.",
    inputPrompt: "Show my Bittensor staking preview",
    generatedArtifactType: "stake_preview",
    safetyStatus: "external_handoff_required",
    liveExecutionEnabled: false,
    acceptsCustody: false,
    acceptsSigning: false,
    acceptsSecrets: false,
    publicEvidence: [
      {
        id: "wallet_address",
        label: "Wallet address",
        value: "5F3xxx...xxxx",
        mimeType: "text/plain",
        public: true,
        source: "customer",
        verifiedAt: "2026-06-19T12:00:00Z",
      },
      {
        id: "subnet",
        label: "Subnet ID",
        value: 1,
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "external_signer_required",
        label: "External signer required",
        value: true,
        mimeType: "text/plain",
        public: true,
        source: "system",
      },
    ],
    plannedServiceHooks: [{ hook: "bittensor", status: "live_local" }],
    safetyFlags: [
      "no_private_key_collected",
      "external_signer_required",
      "no_live_execution_by_matterhorn",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "operator",
    status: "external_handoff_required",
    canExecute: false,
    evidenceHash: "8c7b95b985070a721f94b0be660e2aac353fd23be2328e8794cdcb790f3b0aef",
  },
  hyperliquid_preview_workflow: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "market_read_preview",
    domain: "hyperliquid",
    requestedOutcome: "Generate a read-only Hyperliquid market preview without submission or signing.",
    inputPrompt: "Preview a Hyperliquid trade",
    generatedArtifactType: "market_preview",
    safetyStatus: "preview_only",
    liveExecutionEnabled: false,
    acceptsCustody: false,
    acceptsSigning: false,
    acceptsSecrets: false,
    publicEvidence: [
      {
        id: "venue",
        label: "Venue",
        value: "hyperliquid",
        mimeType: "text/plain",
        public: true,
        source: "system",
      },
      {
        id: "market_id",
        label: "Market or asset identifier",
        value: "BTC-PERP",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "wallet_address",
        label: "Wallet address",
        value: "0x1234...abcd",
        mimeType: "text/plain",
        public: true,
        source: "customer",
        verifiedAt: "2026-06-19T12:00:00Z",
      },
    ],
    plannedServiceHooks: [{ hook: "hyperliquid", status: "preview_only" }],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_execution",
      "preview_only_no_submission",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "agent",
    status: "preview_only",
    canExecute: false,
    evidenceHash: "67efcb8e3739e4c752de86a07f2eb45b25dbd7096d5aa68d87df02cc2466f22f",
  },
  polymarket_preview_workflow: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "market_read_preview",
    domain: "polymarket",
    requestedOutcome: "Generate a read-only Polymarket market preview without submission or signing.",
    inputPrompt: "Preview a Polymarket trade",
    generatedArtifactType: "market_preview",
    safetyStatus: "preview_only",
    liveExecutionEnabled: false,
    acceptsCustody: false,
    acceptsSigning: false,
    acceptsSecrets: false,
    publicEvidence: [
      {
        id: "venue",
        label: "Venue",
        value: "polymarket",
        mimeType: "text/plain",
        public: true,
        source: "system",
      },
      {
        id: "market_id",
        label: "Market or asset identifier",
        value: "will-it-rain-in-nyc-2026-07-01",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "wallet_address",
        label: "Wallet address",
        value: "0xabcd...1234",
        mimeType: "text/plain",
        public: true,
        source: "customer",
        verifiedAt: "2026-06-19T12:00:00Z",
      },
    ],
    plannedServiceHooks: [{ hook: "polymarket", status: "preview_only" }],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_execution",
      "preview_only_no_submission",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "agent",
    status: "preview_only",
    canExecute: false,
    evidenceHash: "e77a31b70aee28b0120981392e3ab69c8c1d1c5f072d74b2509e755e9a269fe2",
  },
  decentralized_services_planned_workflow: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "decentralized_services_planner",
    domain: "decentralized_services",
    requestedOutcome: "Capture the planned decentralized-service action and provider comparison.",
    inputPrompt: "Plan a decentralized storage upload",
    generatedArtifactType: "service_preview",
    safetyStatus: "planned_not_live",
    liveExecutionEnabled: false,
    acceptsCustody: false,
    acceptsSigning: false,
    acceptsSecrets: false,
    publicEvidence: [
      {
        id: "capability",
        label: "Selected capability",
        value: "storage",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "intent_description",
        label: "Intent description",
        value: "Pin a public research dataset to IPFS.",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "provider_fixture",
        label: "Example provider fixture",
        value: "example-storage-ipfs",
        mimeType: "text/plain",
        public: true,
        source: "agent",
      },
    ],
    plannedServiceHooks: [
      { hook: "storage", status: "planned_not_live" },
      { hook: "identity", status: "planned_not_live" },
    ],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_provider_execution",
      "future_contract_only",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "agent",
    status: "planned_not_live",
    canExecute: false,
    evidenceHash: "6143f1edb3a656ea372ffb046887ddf3e123dd81a8aa80c4a6b81458747767b0",
  },
};

function toPublicBundle(bundle) {
  return {
    ...bundle,
    publicEvidence: bundle.publicEvidence.filter((item) => item.public === true),
  };
}

function listBundles() {
  return {
    version: VERSION,
    action: "list",
    count: Object.keys(EVIDENCE_BUNDLE_FIXTURES).length,
    bundleIds: Object.keys(EVIDENCE_BUNDLE_FIXTURES),
  };
}

function showBundle(id) {
  const bundle = EVIDENCE_BUNDLE_FIXTURES[id];
  if (!bundle) {
    console.error(`Unknown evidence bundle: ${id}`);
    process.exit(1);
  }
  return {
    version: VERSION,
    action: "show",
    bundleId: id,
    bundle,
  };
}

function exportBundles(outputPath, { checksum = false, publicOnly = true } = {}) {
  const bundles = publicOnly
    ? Object.fromEntries(
        Object.entries(EVIDENCE_BUNDLE_FIXTURES).map(([id, bundle]) => [id, toPublicBundle(bundle)])
      )
    : EVIDENCE_BUNDLE_FIXTURES;

  const payload = {
    version: VERSION,
    action: "export",
    exportedAt: new Date().toISOString(),
    publicOnly,
    count: Object.keys(bundles).length,
    bundles,
  };
  const json = JSON.stringify(payload, null, 2);
  writeFileSync(outputPath, json, "utf8");

  let checksumPath = null;
  if (checksum) {
    const hash = createHash("sha256").update(json).digest("hex");
    checksumPath = `${outputPath}.sha256`;
    writeFileSync(checksumPath, `${hash}  ${outputPath}\n`, "utf8");
  }

  return {
    version: VERSION,
    action: "export",
    outputPath,
    checksumPath,
    publicOnly,
    count: Object.keys(bundles).length,
  };
}

function printHelp() {
  console.log(`Usage: matterhorn-workflow-evidence-bundles.mjs [options]

Options:
  --list                     List all evidence bundle IDs.
  --id <bundle-id>           Print one evidence bundle as JSON.
  --export <path>            Export all bundles to a public JSON file.
  --include-non-public       Include non-public evidence items in export (default: public only).
  --checksum                 Write a SHA-256 checksum file next to the export.
  --help                     Show this help message.

Examples:
  node scripts/matterhorn-workflow-evidence-bundles.mjs --list
  node scripts/matterhorn-workflow-evidence-bundles.mjs --id hyperliquid_preview_workflow
  node scripts/matterhorn-workflow-evidence-bundles.mjs --export /tmp/evidence-bundles.json --checksum
`);
}

function main() {
  rejectCredentialArgs();

  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    printHelp();
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const listIndex = args.indexOf("--list");
  const idIndex = args.indexOf("--id");
  const exportIndex = args.indexOf("--export");
  const includeNonPublic = args.includes("--include-non-public");
  const checksum = args.includes("--checksum");

  const actions = [listIndex !== -1, idIndex !== -1, exportIndex !== -1].filter(Boolean).length;
  if (actions !== 1) {
    console.error("Specify exactly one of --list, --id, or --export");
    process.exit(1);
  }

  if (listIndex !== -1) {
    console.log(JSON.stringify(listBundles(), null, 2));
    return;
  }

  if (idIndex !== -1) {
    const id = args[idIndex + 1];
    if (!id) {
      console.error("--id requires a bundle ID");
      process.exit(1);
    }
    console.log(JSON.stringify(showBundle(id), null, 2));
    return;
  }

  if (exportIndex !== -1) {
    const outputPath = args[exportIndex + 1];
    if (!outputPath) {
      console.error("--export requires a file path");
      process.exit(1);
    }
    console.log(JSON.stringify(exportBundles(outputPath, { checksum, publicOnly: !includeNonPublic }), null, 2));
    return;
  }
}

main();
