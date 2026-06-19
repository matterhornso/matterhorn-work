const DECENTRALIZED_SERVICE_CAPABILITIES = [
  "hosting",
  "storage",
  "email",
  "payments",
  "identity",
] as const;

export type DecentralizedServiceCapability = (typeof DECENTRALIZED_SERVICE_CAPABILITIES)[number];

type DecentralizedServiceDiscoveryFixture = {
  version: "matterhorn.services.discovery-fixture.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  displayName: string;
  status: "future_contract" | "readonly_preview";
  discoveryMode: "fixture";
  authModels: string[];
  supportedIntents: string[];
  outputArtifacts: string[];
  publicMetadata: Record<string, unknown>;
  liveExecutionEnabled: false;
  canExecute: false;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
};

type DecentralizedServiceCapabilitySummary = {
  capability: DecentralizedServiceCapability;
  label: string;
  userIntents: string[];
  futureProviderExamples: string[];
  authModels: string[];
  outputArtifacts: string[];
};

export type DecentralizedServicesCapabilityCatalog = {
  success: true;
  version: "matterhorn.services.capability-catalog.v1";
  status: "future_contract";
  source: "matterhorn_server_services_discovery";
  summary: string;
  safety: {
    custody: "none";
    status: "future_contract";
    liveExecutionEnabled: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    acceptsSecrets: false;
    requiresPreviewBeforeExecution: true;
    requiresConfirmationBeforeExecution: true;
    rejectsRawSigningMaterial: true;
    allContractsFutureOnly: true;
    canExecute: false;
  };
  capabilities: Array<
    DecentralizedServiceCapabilitySummary & {
      version: "matterhorn.services.provider-manifest.v1";
      status: "future_contract";
      liveExecutionEnabled: false;
      previewSupported: true;
      confirmationRequired: true;
      externalSignerOrHandoff: true;
      canExecute: false;
      unsupportedLiveMessage: string;
      discoveryFixtures: DecentralizedServiceDiscoveryFixture[];
    }
  >;
  nextBuildPhases: string[];
  references: string[];
};

const FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  /(?:seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|wallet[-_]?export)/i;

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
} as const;

const CAPABILITIES: DecentralizedServiceCapabilitySummary[] = [
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

const DISCOVERY_FIXTURES: Record<DecentralizedServiceCapability, DecentralizedServiceDiscoveryFixture[]> = {
  hosting: [
    {
      version: "matterhorn.services.discovery-fixture.v1",
      capability: "hosting",
      providerId: "example-hosting-akash",
      displayName: "Example Akash Hosting (Fixture)",
      status: "future_contract",
      discoveryMode: "fixture",
      authModels: ["oauth2", "wallet_address", "subscription"],
      supportedIntents: ["deploy_frontend", "publish_site"],
      outputArtifacts: ["deployment_url", "build_hash", "domain_record"],
      publicMetadata: { network: "akash-sandbox", region: "fixture-region", estimatedCostUsd: null },
      liveExecutionEnabled: false,
      canExecute: false,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    },
  ],
  storage: [
    {
      version: "matterhorn.services.discovery-fixture.v1",
      capability: "storage",
      providerId: "example-storage-ipfs",
      displayName: "Example IPFS Storage (Fixture)",
      status: "future_contract",
      discoveryMode: "fixture",
      authModels: ["wallet_address", "did", "api_key_reference"],
      supportedIntents: ["upload_file", "pin_cid", "retrieve_file"],
      outputArtifacts: ["cid", "retrieval_url", "storage_deal_id"],
      publicMetadata: { network: "ipfs-fixnet", replicationTarget: 1, estimatedCostUsd: null },
      liveExecutionEnabled: false,
      canExecute: false,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    },
  ],
  email: [
    {
      version: "matterhorn.services.discovery-fixture.v1",
      capability: "email",
      providerId: "example-email-resend",
      displayName: "Example Resend Email (Fixture)",
      status: "future_contract",
      discoveryMode: "fixture",
      authModels: ["oauth2", "api_key_reference", "subscription"],
      supportedIntents: ["send_transactional", "send_newsletter", "verify_email"],
      outputArtifacts: ["message_id", "delivery_status", "template_version"],
      publicMetadata: { providerDomain: "example.com", maxRecipientsPerBatch: 50, estimatedCostUsd: null },
      liveExecutionEnabled: false,
      canExecute: false,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    },
  ],
  payments: [
    {
      version: "matterhorn.services.discovery-fixture.v1",
      capability: "payments",
      providerId: "example-payments-stripe",
      displayName: "Example Stripe Payments (Fixture)",
      status: "future_contract",
      discoveryMode: "fixture",
      authModels: ["oauth2", "api_key_reference", "wallet_address", "external_signer"],
      supportedIntents: ["create_checkout", "create_invoice", "create_subscription", "create_creator_program"],
      outputArtifacts: ["checkout_url", "invoice_id", "subscription_id", "public_payment_link"],
      publicMetadata: { currencyAllowlist: ["USD"], creatorProgramSupported: true, estimatedCostUsd: null },
      liveExecutionEnabled: false,
      canExecute: false,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    },
  ],
  identity: [
    {
      version: "matterhorn.services.discovery-fixture.v1",
      capability: "identity",
      providerId: "example-identity-ens",
      displayName: "Example ENS Identity (Fixture)",
      status: "future_contract",
      discoveryMode: "fixture",
      authModels: ["wallet_address", "did", "external_signer"],
      supportedIntents: ["create_login", "gate_by_wallet", "issue_membership", "verify_did"],
      outputArtifacts: ["access_policy_id", "membership_nft_contract", "did_document_url", "gate_check_url"],
      publicMetadata: { chain: "ethereum-sepolia-fixture", proofKind: "wallet_ownership", estimatedCostUsd: null },
      liveExecutionEnabled: false,
      canExecute: false,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    },
  ],
};

export function isDecentralizedServiceCapability(value: string): value is DecentralizedServiceCapability {
  return DECENTRALIZED_SERVICE_CAPABILITIES.includes(value as DecentralizedServiceCapability);
}

export function findForbiddenDecentralizedServiceQueryKey(keys: Iterable<string>): string | null {
  for (const key of keys) {
    if (FORBIDDEN_CREDENTIAL_KEY_PATTERN.test(key)) return key;
  }
  return null;
}

export function buildDecentralizedServicesCapabilityCatalog(input: {
  capability?: string | null;
} = {}): DecentralizedServicesCapabilityCatalog {
  const capability = input.capability?.trim().toLowerCase() || "";
  if (capability && !isDecentralizedServiceCapability(capability)) {
    throw new Error(`Unknown decentralized service capability: ${capability}`);
  }
  const selected = capability
    ? CAPABILITIES.filter((item) => item.capability === capability)
    : CAPABILITIES;
  return {
    success: true,
    version: "matterhorn.services.capability-catalog.v1",
    status: "future_contract",
    source: "matterhorn_server_services_discovery",
    summary: "Provider-neutral future contracts for hosting, storage, email, payments, and identity/access through Matterhorn Work chat.",
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
      discoveryFixtures: DISCOVERY_FIXTURES[item.capability],
    })),
    nextBuildPhases: [
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
