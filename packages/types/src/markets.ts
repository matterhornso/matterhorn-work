export const MARKET_VENUES = ["bittensor", "hyperliquid", "polymarket"] as const;
export type MarketVenue = (typeof MARKET_VENUES)[number];

export const MARKET_CHAT_INTENTS = [
  "learn",
  "discover",
  "account",
  "positions",
  "orderbook",
  "quote",
  "order_preview",
  "cancel_preview",
  "monitor",
  "compliance",
] as const;
export type MarketChatIntent = (typeof MARKET_CHAT_INTENTS)[number];

export const MARKET_SIGNER_POLICIES = [
  "read_only",
  "external_signer_required",
  "api_wallet_required",
  "blocked_by_compliance",
  "disabled",
] as const;
export type MarketSignerPolicy = (typeof MARKET_SIGNER_POLICIES)[number];

export const MARKET_EXECUTION_STATES = [
  "answered",
  "clarification_required",
  "read_only",
  "preview_required",
  "unsigned_preview",
  "blocked_by_compliance",
  "unsupported",
] as const;
export type MarketExecutionState = (typeof MARKET_EXECUTION_STATES)[number];

export type MarketSide = "buy" | "sell" | "yes" | "no" | "long" | "short" | "stake" | "unstake" | "transfer";

export interface MarketSourceFreshness {
  source: string;
  block?: number | null;
  sequence?: number | null;
  fetchedAt?: string | null;
  freshness?: "live" | "recent" | "stale" | "fallback" | "unknown";
  warnings?: string[];
}

export interface MarketComplianceStatus {
  status: "allowed" | "blocked" | "unknown";
  reason?: string | null;
  jurisdiction?: string | null;
  checkedAt?: string | null;
  source?: string | null;
}

export interface MarketActionFee {
  label: string;
  amount: number | null;
  asset: string | null;
}

export interface MarketActionPreview {
  version: "matterhorn.market.action-preview.v1";
  venue: MarketVenue;
  intent: MarketChatIntent;
  signerPolicy: MarketSignerPolicy;
  execution: Extract<MarketExecutionState, "preview_required" | "unsigned_preview" | "blocked_by_compliance" | "unsupported">;
  action: string;
  marketId?: string | null;
  marketLabel?: string | null;
  asset?: string | null;
  side?: MarketSide | null;
  size?: number | null;
  sizeAsset?: string | null;
  price?: number | null;
  priceAsset?: string | null;
  slippageTolerance?: number | null;
  rateTolerance?: number | null;
  reduceOnly?: boolean | null;
  expiresAt?: string | null;
  fees?: MarketActionFee[];
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  source: MarketSourceFreshness;
  compliance?: MarketComplianceStatus | null;
  warnings: string[];
  canSubmit: false;
}

export interface MarketReceipt {
  version: "matterhorn.market.receipt.v1";
  venue: MarketVenue;
  status: "received" | "pending" | "filled" | "cancelled" | "rejected" | "failed" | "unknown";
  action: string;
  previewSha256?: string | null;
  orderId?: string | null;
  txHash?: string | null;
  blockHash?: string | null;
  signerAddress?: string | null;
  submittedAt?: string | null;
  source?: MarketSourceFreshness | null;
  publicResult?: Record<string, unknown>;
  warnings: string[];
}

export interface MarketChatExecutionInput {
  venue?: MarketVenue | "auto";
  message: string;
  address?: string;
  marketId?: string;
  asset?: string;
  side?: MarketSide;
  size?: number;
  price?: number;
  limit?: number;
  strategy?: string;
  slippageTolerance?: number;
  rateTolerance?: number;
}

export interface MarketChatExecutionResult {
  venue: MarketVenue | "auto";
  intent: MarketChatIntent;
  execution: MarketExecutionState;
  responseText: string;
  cards: unknown[];
  data?: Record<string, unknown>;
  preview?: MarketActionPreview;
  receipt?: MarketReceipt;
  compliance?: MarketComplianceStatus;
  warnings: string[];
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}

export const MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  "(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)";

export const MARKET_SAFETY_DEFAULTS = {
  custody: "none",
  liveSubmissionEnabled: false,
  allowsPrivateKeyImport: false,
  allowsApiSecretStorage: false,
  requiresPreviewBeforeAction: true,
  requiresComplianceBeforePreview: true,
  rejectsRawSigningMaterial: true,
} as const;

export const MARKET_EXECUTION_READINESS_CONTROLS = [
  "preview_hash_binding",
  "stale_preview_rejection",
  "operator_confirmation",
  "external_signer_handoff",
  "public_receipt_import",
  "audit_logging",
  "prompt_injection_rejection",
  "secret_injection_rejection",
  "compliance_bypass_rejection",
] as const;
export type MarketExecutionReadinessControl = (typeof MARKET_EXECUTION_READINESS_CONTROLS)[number];

export interface MarketExecutionReadinessChecklist {
  version: "matterhorn.market.execution-readiness.v1";
  venues: Array<Extract<MarketVenue, "hyperliquid" | "polymarket">>;
  controls: MarketExecutionReadinessControl[];
  futureArchitecture: "external_signer_only";
  liveSubmissionEnabled: false;
  acceptsPrivateKeys: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  requiresSecurityReviewBeforeSubmit: true;
}

export type MarketExecutionReadinessReportStatus = "disabled" | "unavailable" | "review" | "ready";
export type MarketExecutionReadinessControlStatus = "pass" | "warning" | "fail" | "blocked" | "skip";
export type MarketExecutionReadinessCardTone = "good" | "warning" | "danger" | "info";

export interface MarketExecutionReadinessVenueReport {
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  routeFamily: string;
  supportedNow: string[];
  blockedNow: string[];
  missingBeforeLiveSubmit: string[];
}

export interface MarketExecutionReadinessControlReport {
  id: string;
  status: MarketExecutionReadinessControlStatus;
  summary: string;
}

export interface MarketExecutionReadinessSafety {
  nonCustodial: true;
  liveSubmissionEnabled: false;
  canSubmit: false;
  signsOrSubmits: false;
  acceptsSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
}

export interface MarketExecutionReadinessReport {
  version: "matterhorn.market.execution-readiness.v1";
  checkedAt: string;
  readyForLiveSubmission: false;
  status: MarketExecutionReadinessReportStatus;
  venues: MarketExecutionReadinessVenueReport[];
  controls: MarketExecutionReadinessControlReport[];
  nextActions: string[];
  safety: MarketExecutionReadinessSafety;
}

export interface MarketExecutionReadinessCardItem {
  label: string;
  value: string;
  tone: MarketExecutionReadinessCardTone;
}

export interface MarketExecutionReadinessCard {
  kind: "market_execution_readiness";
  title: "Market execution readiness";
  summary: string;
  tone: Extract<MarketExecutionReadinessCardTone, "warning" | "danger" | "info">;
  source: MarketSourceFreshness;
  items: MarketExecutionReadinessCardItem[];
  warnings: string[];
  data: { report: MarketExecutionReadinessReport };
}

export interface MarketExecutionReadinessResponse {
  success: true;
  report: MarketExecutionReadinessReport;
  cards: MarketExecutionReadinessCard[];
}

export const MARKET_EXECUTION_CHAIN_STEP_IDS = [
  "preview_handoff",
  "external_sign_request",
  "redacted_artifact_validation",
  "artifact_reconciliation",
  "public_receipt_import",
] as const;
export type MarketExecutionChainStepId = (typeof MARKET_EXECUTION_CHAIN_STEP_IDS)[number];

export interface MarketExecutionChainSafety {
  canSubmit: false;
  liveSubmissionEnabled: false;
  nonCustodial: true;
  externalSignerRequired: true;
  acceptsSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
}

export interface MarketExecutionChainStep {
  id: MarketExecutionChainStepId;
  label: string;
  purpose: string;
  commands: string[];
  output: string;
}

export interface MarketExecutionChainGuide {
  success: true;
  version: "matterhorn.market.execution-chain-guide.v1";
  title: "Matterhorn market execution chain";
  summary: string;
  safety: MarketExecutionChainSafety;
  stages: MarketExecutionChainStep[];
  forbidden: string[];
}

export interface MarketExecutionChainCard {
  kind: "market_execution_chain";
  title: string;
  summary: string;
  tone: Extract<MarketExecutionReadinessCardTone, "warning" | "info">;
  source: MarketSourceFreshness;
  items: MarketExecutionReadinessCardItem[];
  warnings: string[];
  data: {
    guide: MarketExecutionChainGuide;
    highlightedStep: MarketExecutionChainStep | null;
  };
}

export interface MarketExecutionChainResponse {
  success: true;
  guide: MarketExecutionChainGuide;
  cards: MarketExecutionChainCard[];
}

export const MARKET_EXECUTION_MODES = [
  "disabled",
  "testnet_external_signer",
  "mainnet_external_signer",
] as const;
export type MarketExecutionMode = (typeof MARKET_EXECUTION_MODES)[number];

export const MARKET_SIGNED_SUBMISSION_ACTIONS = [
  "place_order",
  "cancel_order",
  "cancel_all",
] as const;
export type MarketSignedSubmissionAction = (typeof MARKET_SIGNED_SUBMISSION_ACTIONS)[number];

export const MARKET_SUBMIT_SIGN_PHASE0_CONTROLS = [
  "explicit_execution_mode",
  "route_level_kill_switch",
  "network_allowlist",
  "preview_hash_binding",
  "handoff_hash_binding",
  "signed_artifact_hash_binding",
  "stale_preview_rejection",
  "operator_confirmation",
  "external_signer_only",
  "no_custody",
  "no_secret_storage",
  "compliance_recheck",
  "audit_log_redaction",
  "public_receipt_only",
] as const;
export type MarketSubmitSignPhase0Control = (typeof MARKET_SUBMIT_SIGN_PHASE0_CONTROLS)[number];

export const MARKET_ALWAYS_FORBIDDEN_EXECUTION_FIELDS = [
  "seed",
  "seedPhrase",
  "mnemonic",
  "privateKey",
  "suri",
  "keyfile",
  "walletExport",
  "apiSecret",
  "apiKeySecret",
  "passphrase",
  "password",
] as const;
export type MarketAlwaysForbiddenExecutionField = (typeof MARKET_ALWAYS_FORBIDDEN_EXECUTION_FIELDS)[number];

export const MARKET_SIGNED_ARTIFACT_FIELDS_REQUIRE_ENVELOPE = [
  "signature",
  "signedOrder",
  "signedAction",
  "exchangePayload",
] as const;
export type MarketSignedArtifactField = (typeof MARKET_SIGNED_ARTIFACT_FIELDS_REQUIRE_ENVELOPE)[number];

export const MARKET_FUTURE_EXECUTION_ROUTE_NAMES = [
  "hyperliquid.orders.sign_request",
  "hyperliquid.orders.submit_signed",
  "hyperliquid.orders.cancel_sign_request",
  "hyperliquid.orders.cancel_submit_signed",
  "polymarket.orders.sign_request",
  "polymarket.orders.submit_signed",
  "polymarket.orders.cancel_sign_request",
  "polymarket.orders.cancel_submit_signed",
] as const;
export type MarketFutureExecutionRouteName = (typeof MARKET_FUTURE_EXECUTION_ROUTE_NAMES)[number];

export interface MarketSignedSubmissionEnvelope {
  version: "matterhorn.market.signed-submission-envelope.v1";
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  executionMode: Extract<MarketExecutionMode, "testnet_external_signer" | "mainnet_external_signer">;
  network: string;
  action: MarketSignedSubmissionAction;
  routeName: MarketFutureExecutionRouteName;
  previewSha256: string;
  handoffSha256: string;
  unsignedPayloadSha256: string;
  signedArtifactPublicHash: string;
  signedArtifactRedacted: true;
  signerAddress: string;
  operatorConfirmation: string;
  createdAt: string;
  expiresAt: string;
  compliance: MarketComplianceStatus;
  source: MarketSourceFreshness;
  submitSignedAllowedByContract: boolean;
  warnings: string[];
}

export interface MarketExternalSignRequest {
  version: "matterhorn.market.external-sign-request.v1";
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  routeName: Extract<MarketFutureExecutionRouteName, "hyperliquid.orders.sign_request" | "polymarket.orders.sign_request">;
  executionMode: Extract<MarketExecutionMode, "testnet_external_signer">;
  network: string;
  action: MarketSignedSubmissionAction;
  previewSha256: string;
  handoffSha256: string;
  unsignedPayloadSha256: string;
  signRequestSha256: string;
  readyToSign: boolean;
  signedArtifactAccepted: false;
  submitSignedAllowedByContract: false;
  canSubmit: false;
  liveSubmissionEnabled: false;
  externalSignerOnly: true;
  operatorConfirmation: string;
  createdAt: string;
  expiresAt: string;
  warnings: string[];
}

export interface MarketRedactedSignedArtifactEnvelope {
  version: "matterhorn.market.redacted-signed-artifact-envelope.v1";
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  routeName: Extract<MarketFutureExecutionRouteName, "hyperliquid.orders.sign_request" | "polymarket.orders.sign_request">;
  validationMode: "public_redacted_metadata";
  executionMode: Extract<MarketExecutionMode, "testnet_external_signer">;
  network: string;
  action: MarketSignedSubmissionAction;
  signRequestSha256: string;
  previewSha256: string;
  handoffSha256: string;
  unsignedPayloadSha256: string;
  signedArtifactPublicHash: string;
  signedArtifactRedacted: true;
  signerAddress?: string | null;
  artifactKind?: "wallet_signed_action" | "clob_order" | "exchange_order" | "unknown";
  producedAt?: string | null;
  source?: MarketSourceFreshness | null;
  canSubmit: false;
  liveSubmissionEnabled: false;
  warnings: string[];
}

export interface MarketArtifactValidationResult {
  version: "matterhorn.market.artifact-validation.v1";
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  status: "accepted_public_metadata" | "rejected";
  validationMode: "public_redacted_metadata";
  matchesSignRequest: boolean;
  signRequestSha256: string;
  signedArtifactPublicHash?: string | null;
  signedArtifactRedacted: boolean;
  redactedMetadataAccepted: boolean;
  signedArtifactAccepted: false;
  submitSignedAllowedByContract: false;
  canSubmit: false;
  liveSubmissionEnabled: false;
  publicAuditReceiptCandidate: MarketReceipt | null;
  errors: string[];
  warnings: string[];
}

export interface MarketExecutionAuditRecord {
  version: "matterhorn.market.execution-audit.v1";
  envelopeVersion: MarketSignedSubmissionEnvelope["version"];
  venue: Extract<MarketVenue, "hyperliquid" | "polymarket">;
  routeName: MarketFutureExecutionRouteName;
  status: "accepted" | "rejected" | "submitted" | "failed" | "blocked";
  previewSha256: string;
  handoffSha256: string;
  signedArtifactPublicHash?: string | null;
  receiptHash?: string | null;
  rejectionReason?: string | null;
  redacted: true;
  recordedAt: string;
  warnings: string[];
}
