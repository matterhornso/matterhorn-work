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
