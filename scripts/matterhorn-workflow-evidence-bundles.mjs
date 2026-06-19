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

export const EVIDENCE_BUNDLE_FIXTURES = {
  wellness_customer_intake: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "wellness_creator_services",
    domain: "wellness",
    requestedOutcome: "Create a safe intake summary for a new wellness client.",
    publicEvidence: [
      {
        id: "client_goal",
        label: "Client goal",
        value: "Improve flexibility and reduce stress",
        mimeType: "text/plain",
        public: false,
        source: "customer",
      },
      {
        id: "service_tier",
        label: "Selected service tier",
        value: "monthly_yoga_coaching",
        mimeType: "text/plain",
        public: false,
        source: "agent",
      },
    ],
    plannedServiceHooks: [
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
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
  },
  crypto_staking_decision: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "bittensor_operator",
    domain: "crypto",
    requestedOutcome: "Record the inputs and safety checks for a staking preview decision.",
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
  },
  decentralized_services_plan: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "decentralized_services_planner",
    domain: "decentralized_services",
    requestedOutcome: "Capture the planned decentralized-service action and provider comparison.",
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
  },
  research_summary: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "research_summary",
    domain: "research",
    requestedOutcome: "Record the public inputs used to generate a research summary.",
    publicEvidence: [
      {
        id: "topic",
        label: "Research topic",
        value: "Decentralized identity adoption in 2026",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "source_count",
        label: "Number of public sources reviewed",
        value: 12,
        mimeType: "text/plain",
        public: true,
        source: "agent",
      },
    ],
    plannedServiceHooks: [{ hook: "storage", status: "planned_not_live" }],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_execution",
      "public_sources_only",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "system",
    status: "preview_only",
    canExecute: false,
  },
  content_publish_plan: {
    version: "matterhorn.workflow.evidence-bundle.v1",
    workflowId: "content_publish",
    domain: "content",
    requestedOutcome: "Capture the plan for publishing content without executing provider actions.",
    publicEvidence: [
      {
        id: "content_title",
        label: "Content title",
        value: "Intro to Bittensor Staking",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
      {
        id: "publish_channel",
        label: "Publish channel",
        value: "newsletter",
        mimeType: "text/plain",
        public: true,
        source: "customer",
      },
    ],
    plannedServiceHooks: [
      { hook: "email", status: "planned_not_live" },
      { hook: "hosting", status: "planned_not_live" },
    ],
    safetyFlags: [
      "no_secrets_collected",
      "no_live_execution",
      "preview_before_publish",
    ],
    createdAt: "2026-06-19T12:00:00Z",
    source: "agent",
    status: "planned_not_live",
    canExecute: false,
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
  node scripts/matterhorn-workflow-evidence-bundles.mjs --id decentralized_services_plan
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
