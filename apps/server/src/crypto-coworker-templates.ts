import type { MatterhornCoworkerCreateInput } from "./crypto-coworkers.js";

export type MatterhornCoworkerTemplate = {
  id: "market_analyst" | "risk_monitor";
  name: string;
  role: string;
  description: string;
  suggestedPrompts: string[];
  profile: MatterhornCoworkerCreateInput;
};

const ZERO_FINANCIAL_LIMITS = {
  perActionUsd: 0,
  dailyUsd: 0,
  weeklyUsd: 0,
  maxSlippageBps: 0,
  maxLeverage: 1,
  minimumReserveUsd: 0,
  maxPrepareCallsPerFamily: 0,
} as const;

const TEMPLATES: readonly MatterhornCoworkerTemplate[] = [
  {
    id: "market_analyst",
    name: "Market Analyst",
    role: "market_analyst",
    description: "Compares certified public market evidence and keeps cited research notes.",
    suggestedPrompts: [
      "Compare current Hyperliquid testnet markets and explain the strongest differences.",
      "Read this Sui testnet address and summarize the public balance evidence.",
      "Turn today’s approved market evidence into a concise research note.",
    ],
    profile: {
      name: "Market Analyst",
      role: "market_analyst",
      mission: "Research only through approved crypto apps, distinguish facts from inference, cite evidence and freshness, and write concise workspace notes when asked.",
      allowedAppIds: ["matterhorn.sui-testnet", "matterhorn.hyperliquid-testnet"],
      allowedActionIds: [
        "sui_account_read",
        "hyperliquid_market_read",
        "hyperliquid_orderbook_read",
        "hyperliquid_account_exposure",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH"],
      automaticAuthorities: ["read", "write_note"],
      limits: {
        ...ZERO_FINANCIAL_LIMITS,
        maxActiveWatches: 0,
        maxReadCallsPerRun: 12,
      },
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
      },
    },
  },
  {
    id: "risk_monitor",
    name: "Risk Monitor",
    role: "risk_monitor",
    description: "Watches approved public and disclosed account state, then escalates changes without acting on funds.",
    suggestedPrompts: [
      "Monitor my disclosed Hyperliquid testnet exposure and flag material margin changes.",
      "Watch this Sui testnet balance and tell me when the evidence becomes stale.",
      "Summarize unresolved risks and the evidence needed before any wallet review.",
    ],
    profile: {
      name: "Risk Monitor",
      role: "risk_monitor",
      mission: "Monitor only approved public or explicitly disclosed crypto state, flag stale evidence and material risk changes, and escalate to the user without preparing or submitting transactions.",
      allowedAppIds: ["matterhorn.sui-testnet", "matterhorn.hyperliquid-testnet"],
      allowedActionIds: [
        "sui_account_read",
        "hyperliquid_market_read",
        "hyperliquid_orderbook_read",
        "hyperliquid_account_exposure",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH"],
      automaticAuthorities: ["read", "watch", "write_note"],
      limits: {
        ...ZERO_FINANCIAL_LIMITS,
        maxActiveWatches: 8,
        maxReadCallsPerRun: 12,
      },
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "wallet_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
      },
    },
  },
] as const;

export function listMatterhornCoworkerTemplates(): MatterhornCoworkerTemplate[] {
  return structuredClone(TEMPLATES) as MatterhornCoworkerTemplate[];
}

export function getMatterhornCoworkerTemplate(id: string): MatterhornCoworkerTemplate | null {
  const template = TEMPLATES.find((candidate) => candidate.id === id);
  return template ? structuredClone(template) as MatterhornCoworkerTemplate : null;
}
