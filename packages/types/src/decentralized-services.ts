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
