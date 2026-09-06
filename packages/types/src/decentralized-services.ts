export const DECENTRALIZED_SERVICE_CAPABILITIES = [
  "hosting",
  "storage",
  "email",
  "payments",
  "identity",
] as const;
export type DecentralizedServiceCapability =
  (typeof DECENTRALIZED_SERVICE_CAPABILITIES)[number];

export const DECENTRALIZED_SERVICE_EXECUTION_STATES = [
  "preview_required",
  "confirmation_required",
  "external_handoff_required",
  "unsupported",
  "blocked_by_policy",
] as const;
export type DecentralizedServiceExecutionState =
  (typeof DECENTRALIZED_SERVICE_EXECUTION_STATES)[number];

export const DECENTRALIZED_SERVICE_AUTH_MODELS = [
  "none",
  "oauth2",
  "api_key_reference",
  "wallet_address",
  "did",
  "external_signer",
  "subscription",
] as const;
export type DecentralizedServiceAuthModel =
  (typeof DECENTRALIZED_SERVICE_AUTH_MODELS)[number];

export interface DecentralizedServiceProviderManifest {
  version: "matterhorn.services.provider-manifest.v1";
  providerId: string;
  capability: DecentralizedServiceCapability;
  displayName: string;
  status: "future_contract" | "readonly_preview" | "live_beta" | "live";
  authModels: DecentralizedServiceAuthModel[];
  previewSupported: boolean;
  confirmationRequired: boolean;
  externalSignerOrHandoff: boolean;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
  liveExecutionEnabled: false;
  supportedIntents: string[];
  unsupportedIntents: string[];
  requiredCustomerDisclosures: string[];
  outputArtifacts: string[];
}

export interface DecentralizedServicePreview {
  version: "matterhorn.services.preview.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  execution: DecentralizedServiceExecutionState;
  summary: string;
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  estimatedCost?: {
    amount: number | null;
    asset: string | null;
    period?: string | null;
  } | null;
  requiredAuth: DecentralizedServiceAuthModel[];
  requiresExternalSigner: boolean;
  requiresCustomerConfirmation: boolean;
  unsupportedReason?: string | null;
  warnings: string[];
  canExecute: false;
}

export interface DecentralizedServiceConfirmation {
  version: "matterhorn.services.confirmation.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256: string;
  confirmedBy: "operator" | "customer" | "external_signer";
  confirmedAt: string;
  expiresAt: string;
  operatorAcknowledgement: string;
}

export interface DecentralizedServiceHandoff {
  version: "matterhorn.services.external-action-handoff.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256: string;
  handoffSha256: string;
  action: string;
  externalSignerOrProviderUrl?: string | null;
  payloadPublicHash?: string | null;
  instructions: string;
  operatorConfirmation: string;
  createdAt: string;
  expiresAt: string;
  canExecute: false;
  liveExecutionEnabled: false;
}

export interface DecentralizedServiceReceipt {
  version: "matterhorn.services.receipt.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256: string;
  handoffSha256?: string | null;
  status:
    | "previewed"
    | "confirmed"
    | "handed_off"
    | "pending"
    | "succeeded"
    | "failed"
    | "rolled_back";
  action: string;
  publicResult?: Record<string, unknown>;
  evidenceUrl?: string | null;
  rollbackAvailable: boolean;
  failureReason?: string | null;
  recordedAt: string;
  warnings: string[];
}

export interface DecentralizedServiceUnsupportedResponse {
  version: "matterhorn.services.unsupported.v1";
  capability: DecentralizedServiceCapability;
  intent: string;
  status: "unsupported";
  reason: string;
  suggestedCapabilities: DecentralizedServiceCapability[];
  customerMessage: string;
}

export interface DecentralizedServiceFailureResult {
  version: "matterhorn.services.failure.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  intent: string;
  previewSha256?: string | null;
  status: "failed" | "rolled_back";
  failureReason: string;
  rollbackAttempted: boolean;
  rollbackResult?: string | null;
  customerMessage: string;
  recordedAt: string;
  warnings: string[];
}

export const DECENTRALIZED_SERVICE_FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  "(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)";

export const DECENTRALIZED_SERVICE_SAFETY_DEFAULTS = {
  custody: "none",
  liveExecutionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
  rejectsRawSigningMaterial: true,
} as const;

export interface DecentralizedServiceSafetyChecklist {
  version: "matterhorn.services.safety-checklist.v1";
  capabilities: DecentralizedServiceCapability[];
  allContractsFutureOnly: true;
  liveExecutionEnabled: false;
  acceptsPrivateKeys: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  requiresPreviewBeforeExecution: true;
  requiresConfirmationBeforeExecution: true;
  requiresExternalSignerOrProviderHandoff: true;
  publicReceiptRequired: true;
  rollbackFieldRequired: true;
}

export interface DecentralizedServiceDiscoveryFixture {
  version: "matterhorn.services.discovery-fixture.v1";
  capability: DecentralizedServiceCapability;
  providerId: string;
  displayName: string;
  status: "future_contract" | "readonly_preview";
  discoveryMode: "fixture";
  authModels: DecentralizedServiceAuthModel[];
  supportedIntents: string[];
  outputArtifacts: string[];
  publicMetadata: Record<string, unknown>;
  liveExecutionEnabled: false;
  canExecute: false;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
}

export const HOSTING_DISCOVERY_FIXTURES: DecentralizedServiceDiscoveryFixture[] = [
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
    publicMetadata: {
      network: "akash-sandbox",
      region: "fixture-region",
      estimatedCostUsd: null,
    },
    liveExecutionEnabled: false,
    canExecute: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
  },
];

export const STORAGE_DISCOVERY_FIXTURES: DecentralizedServiceDiscoveryFixture[] = [
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
    publicMetadata: {
      network: "ipfs-fixnet",
      replicationTarget: 1,
      estimatedCostUsd: null,
    },
    liveExecutionEnabled: false,
    canExecute: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
  },
];

export const EMAIL_DISCOVERY_FIXTURES: DecentralizedServiceDiscoveryFixture[] = [
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
    publicMetadata: {
      providerDomain: "example.com",
      maxRecipientsPerBatch: 50,
      estimatedCostUsd: null,
    },
    liveExecutionEnabled: false,
    canExecute: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
  },
];

export const PAYMENTS_DISCOVERY_FIXTURES: DecentralizedServiceDiscoveryFixture[] = [
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
    publicMetadata: {
      currencyAllowlist: ["USD"],
      creatorProgramSupported: true,
      estimatedCostUsd: null,
    },
    liveExecutionEnabled: false,
    canExecute: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
  },
];

export const IDENTITY_DISCOVERY_FIXTURES: DecentralizedServiceDiscoveryFixture[] = [
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
    publicMetadata: {
      chain: "ethereum-sepolia-fixture",
      proofKind: "wallet_ownership",
      estimatedCostUsd: null,
    },
    liveExecutionEnabled: false,
    canExecute: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
  },
];

export const DECENTRALIZED_SERVICE_DISCOVERY_FIXTURES: Record<
  DecentralizedServiceCapability,
  DecentralizedServiceDiscoveryFixture[]
> = {
  hosting: HOSTING_DISCOVERY_FIXTURES,
  storage: STORAGE_DISCOVERY_FIXTURES,
  email: EMAIL_DISCOVERY_FIXTURES,
  payments: PAYMENTS_DISCOVERY_FIXTURES,
  identity: IDENTITY_DISCOVERY_FIXTURES,
};

export const HOSTING_PREVIEW_FIXTURES: DecentralizedServicePreview[] = [
  {
    version: "matterhorn.services.preview.v1",
    capability: "hosting",
    providerId: "example-hosting-akash",
    intent: "deploy_frontend",
    execution: "confirmation_required",
    summary: "Build and deploy a public preview of the frontend to example hosting.",
    consequence:
      "This would create a public deployment URL. No live build, DNS change, or hosting publish happens because this is a fixture preview.",
    confirmationText: "Preview this frontend deployment?",
    previewSha256:
      "0000000000000000000000000000000000000000000000000000000000000000",
    estimatedCost: { amount: null, asset: null, period: null },
    requiredAuth: ["oauth2", "wallet_address"],
    requiresExternalSigner: false,
    requiresCustomerConfirmation: true,
    warnings: ["This is a fixture preview. No provider is connected."],
    canExecute: false,
  },
];

export const STORAGE_PREVIEW_FIXTURES: DecentralizedServicePreview[] = [
  {
    version: "matterhorn.services.preview.v1",
    capability: "storage",
    providerId: "example-storage-ipfs",
    intent: "upload_file",
    execution: "confirmation_required",
    summary: "Upload and pin a file to decentralized storage.",
    consequence:
      "This would produce a public CID. No file is stored, pinned, or published because this is a fixture preview.",
    confirmationText: "Preview this storage upload?",
    previewSha256:
      "0000000000000000000000000000000000000000000000000000000000000001",
    estimatedCost: { amount: null, asset: null, period: null },
    requiredAuth: ["wallet_address", "did"],
    requiresExternalSigner: false,
    requiresCustomerConfirmation: true,
    warnings: ["This is a fixture preview. No provider is connected."],
    canExecute: false,
  },
];

export const EMAIL_PREVIEW_FIXTURES: DecentralizedServicePreview[] = [
  {
    version: "matterhorn.services.preview.v1",
    capability: "email",
    providerId: "example-email-resend",
    intent: "send_transactional",
    execution: "confirmation_required",
    summary: "Send a transactional email to verified recipients.",
    consequence:
      "This would queue an email send. No messages are sent because this is a fixture preview.",
    confirmationText: "Preview this transactional email?",
    previewSha256:
      "0000000000000000000000000000000000000000000000000000000000000002",
    estimatedCost: { amount: null, asset: null, period: null },
    requiredAuth: ["oauth2", "api_key_reference"],
    requiresExternalSigner: false,
    requiresCustomerConfirmation: true,
    warnings: ["This is a fixture preview. No provider is connected."],
    canExecute: false,
  },
];

export const PAYMENTS_PREVIEW_FIXTURES: DecentralizedServicePreview[] = [
  {
    version: "matterhorn.services.preview.v1",
    capability: "payments",
    providerId: "example-payments-stripe",
    intent: "create_checkout",
    execution: "external_handoff_required",
    summary: "Create a checkout page for a one-time payment.",
    consequence:
      "This would create a public checkout URL. No payment is collected, charged, or settled because this is a fixture preview.",
    confirmationText: "Preview this checkout creation?",
    previewSha256:
      "0000000000000000000000000000000000000000000000000000000000000003",
    estimatedCost: { amount: 10.0, asset: "USD", period: null },
    requiredAuth: ["oauth2", "wallet_address", "external_signer"],
    requiresExternalSigner: true,
    requiresCustomerConfirmation: true,
    warnings: [
      "This is a fixture preview. No provider is connected.",
      "Customer must complete payment outside Matterhorn Desks.",
    ],
    canExecute: false,
  },
];

export const IDENTITY_PREVIEW_FIXTURES: DecentralizedServicePreview[] = [
  {
    version: "matterhorn.services.preview.v1",
    capability: "identity",
    providerId: "example-identity-ens",
    intent: "gate_by_wallet",
    execution: "external_handoff_required",
    summary: "Create a wallet-gated access policy for a resource.",
    consequence:
      "This would create an on-chain access policy. No policy is deployed, no access is granted, and no identity is verified because this is a fixture preview.",
    confirmationText: "Preview this wallet gate?",
    previewSha256:
      "0000000000000000000000000000000000000000000000000000000000000004",
    estimatedCost: { amount: null, asset: null, period: null },
    requiredAuth: ["wallet_address", "did", "external_signer"],
    requiresExternalSigner: true,
    requiresCustomerConfirmation: true,
    warnings: [
      "This is a fixture preview. No provider is connected.",
      "Ownership proof happens through a connected-wallet request, never by sharing a private key.",
    ],
    canExecute: false,
  },
];

export const DECENTRALIZED_SERVICE_PREVIEW_FIXTURES: Record<
  DecentralizedServiceCapability,
  DecentralizedServicePreview[]
> = {
  hosting: HOSTING_PREVIEW_FIXTURES,
  storage: STORAGE_PREVIEW_FIXTURES,
  email: EMAIL_PREVIEW_FIXTURES,
  payments: PAYMENTS_PREVIEW_FIXTURES,
  identity: IDENTITY_PREVIEW_FIXTURES,
};
