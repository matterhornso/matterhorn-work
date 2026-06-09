export type BittensorProviderStatus = "ok" | "provider_unavailable";

export type BittensorSubnetSummary = {
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
};

export type BittensorSubnetDetail = BittensorSubnetSummary & {
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
};

export type BittensorStakePosition = {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  alphaAmount: number | null;
  taoValue: number | null;
  slippageRisk: "unknown" | "low" | "medium" | "high";
};

export type BittensorWalletSnapshot = {
  ss58Address: string;
  taoBalance: number | null;
  stakePositions: BittensorStakePosition[];
  estimatedValueTao: number | null;
  providerStatus: BittensorProviderStatus;
  updatedAt: string;
  message?: string;
};

export type BittensorActionQuote = {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid: number | null;
  amountTao: number | null;
  expectedAlpha: number | null;
  feeTao: number | null;
  slippageBps: number | null;
  warnings: string[];
  requiresExternalSignature: true;
};

