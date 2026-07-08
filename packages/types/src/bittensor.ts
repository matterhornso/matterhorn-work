export type BittensorProviderStatus = "ok" | "provider_unavailable";

export type BittensorChatIntent =
  | "learn"
  | "discover"
  | "wallet"
  | "stake_plan"
  | "subnet_use"
  | "monitor";

export type BittensorChatExecutionStatus =
  | "answered"
  | "clarification_required"
  | "unsigned_preview"
  | "unsupported";

export type BittensorRiskLevel = "unknown" | "low" | "medium" | "high";

export interface BittensorChatContext {
  id: string;
  ss58Address: string | null;
  netuid: number | null;
  amountTao: string | null;
  validatorHotkey: string | null;
  coldkey: string | null;
  recipient: string | null;
  destination: string | null;
  lastIntent: BittensorChatIntent | null;
  lastExecution: BittensorChatExecutionStatus | null;
  updatedAt: string;
  warnings: string[];
}

export interface BittensorSubnetSummary {
  netuid: number;
  name: string;
  symbol: string;
  category: string;
  benefitSummary: string;
  ownerColdkey: string | null;
  ownerHotkey: string | null;
  priceTao: number | null;
  emission: number | null;
  tempo: number | null;
  updatedAt: string;
  source: string;
  block?: number | null;
  freshness?: string | null;
}

export interface BittensorSubnetDetail extends BittensorSubnetSummary {
  metagraphSummary: {
    neurons: number | null;
    totalStake: number | null;
    block: number | null;
  };
  topValidators: Array<{
    uid: number | null;
    hotkey: string | null;
    coldkey: string | null;
    stake: number | null;
    trust: number | null;
    dividends: number | null;
  }>;
  knownUseCases: string[];
  risks: string[];
  links: Array<{ label: string; url: string }>;
}

export interface BittensorStakePosition {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  alphaAmount: number | null;
  taoValue: number | null;
  slippageRisk: BittensorRiskLevel;
}

export interface BittensorWalletSnapshot {
  ss58Address: string;
  taoBalance: number | null;
  stakePositions: BittensorStakePosition[];
  estimatedValueTao: number | null;
  providerStatus: BittensorProviderStatus;
  updatedAt: string;
  message?: string;
  source?: string;
  block?: number | null;
  freshness?: string | null;
  warnings?: string[];
}

export interface BittensorActionQuote {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid: number | null;
  amountTao: number | null;
  priceTao?: number | null;
  idealAlpha?: number | null;
  expectedAlpha: number | null;
  feeTao: number | null;
  slippageBps: number | null;
  rateTolerance?: number | null;
  source?: string;
  block?: number | null;
  freshness?: string | null;
  warnings: string[];
  requiresExternalSignature: true;
}

export interface BittensorSubtensorSidecarStatus {
  configured: boolean;
  status: "healthy" | "unreachable" | "unconfigured" | "disabled";
  message?: string;
  source?: string;
  network?: string;
  endpoint?: string;
  block?: number | null;
  freshness?: string | null;
  canRead?: boolean;
  canPrepare?: boolean;
  canSubmit?: boolean;
  reachable?: boolean;
}

export interface BittensorSubtensorSidecarHealth extends BittensorSubtensorSidecarStatus {
  checkedAt: string;
  latencyMs?: number | null;
  warnings?: string[];
}
