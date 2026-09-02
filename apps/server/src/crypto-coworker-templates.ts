import type { MatterhornCoworkerTemplateId } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCoworkerCreateInput } from "./crypto-coworkers.js";

export type MatterhornCoworkerTemplate = {
  id: MatterhornCoworkerTemplateId;
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
      "Compare Bittensor testnet validators for subnet 14 using fresh public evidence.",
      "Read this Sui testnet address and summarize the public balance evidence.",
      "Turn today’s approved market evidence into a concise research note.",
    ],
    profile: {
      name: "Market Analyst",
      role: "market_analyst",
      mission: "Research only through approved crypto apps, distinguish facts from inference, cite evidence and freshness, and write concise workspace notes when asked.",
      allowedAppIds: [
        "matterhorn.sui-testnet",
        "matterhorn.hyperliquid-testnet",
        "matterhorn.bittensor-testnet",
      ],
      allowedActionIds: [
        "sui_account_read",
        "hyperliquid_market_read",
        "hyperliquid_orderbook_read",
        "hyperliquid_account_exposure",
        "bittensor_subnet_list",
        "bittensor_subnet_read",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet", "bittensor:test"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH", "TAO"],
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
      "Watch Bittensor testnet subnet 14 and alert me when validator stake changes.",
      "Watch this Sui testnet balance and tell me when the evidence becomes stale.",
      "Summarize unresolved risks and the evidence needed before any wallet review.",
    ],
    profile: {
      name: "Risk Monitor",
      role: "risk_monitor",
      mission: "Monitor only approved public or explicitly disclosed crypto state, flag stale evidence and material risk changes, and escalate to the user without preparing or submitting transactions.",
      allowedAppIds: [
        "matterhorn.sui-testnet",
        "matterhorn.hyperliquid-testnet",
        "matterhorn.bittensor-testnet",
      ],
      allowedActionIds: [
        "sui_account_read",
        "hyperliquid_market_read",
        "hyperliquid_orderbook_read",
        "hyperliquid_account_exposure",
        "bittensor_subnet_list",
        "bittensor_subnet_read",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet", "bittensor:test"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH", "TAO"],
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
  {
    id: "transaction_coordinator",
    name: "Transaction Coordinator",
    role: "transaction_coordinator",
    description: "Turns exact testnet requests into fresh previews that only your wallet can approve.",
    suggestedPrompts: [
      "Prepare a Sui testnet transfer and ask me for any exact terms you still need.",
      "Prepare a Hyperliquid testnet limit order, then show me the price, size, fees, and expiry before wallet review.",
      "Check my pending wallet reviews and tell me which ones need a fresh preview.",
    ],
    profile: {
      name: "Transaction Coordinator",
      role: "transaction_coordinator",
      mission: "Collect exact transaction terms, refresh certified testnet evidence, and prepare one policy-checked wallet review at a time. Never choose missing financial terms or act beyond the user’s explicit request.",
      allowedAppIds: ["matterhorn.sui-testnet", "matterhorn.hyperliquid-testnet"],
      allowedActionIds: [
        "sui_account_read",
        "sui_transfer_preview",
        "hyperliquid_market_read",
        "hyperliquid_orderbook_read",
        "hyperliquid_account_exposure",
        "hyperliquid_preview_order",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH"],
      automaticAuthorities: ["read", "prepare"],
      limits: {
        perActionUsd: 250,
        dailyUsd: 500,
        weeklyUsd: 1_000,
        maxSlippageBps: 100,
        maxLeverage: 2,
        minimumReserveUsd: 0,
        maxActiveWatches: 0,
        maxReadCallsPerRun: 12,
        maxPrepareCallsPerFamily: 1,
      },
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "wallet_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
      },
    },
  },
  {
    id: "treasury_coworker",
    name: "Treasury Coworker",
    role: "treasury_coworker",
    description: "Tracks approved balances and prepares exact Sui testnet transfers for wallet review.",
    suggestedPrompts: [
      "Summarize the approved Sui and Hyperliquid testnet balances I have shared.",
      "Prepare an exact Sui testnet treasury transfer and stop at wallet review.",
      "List unresolved treasury risks and the fresh evidence needed before I move funds.",
    ],
    profile: {
      name: "Treasury Coworker",
      role: "treasury_coworker",
      mission: "Maintain a concise view of approved testnet balances, decisions, and unresolved risks. Prepare exact Sui testnet transfers only from user-supplied terms and always stop at connected-wallet review.",
      allowedAppIds: ["matterhorn.sui-testnet", "matterhorn.hyperliquid-testnet"],
      allowedActionIds: [
        "sui_account_read",
        "sui_transfer_preview",
        "hyperliquid_market_read",
        "hyperliquid_account_exposure",
      ],
      allowedNetworks: ["sui:testnet", "hyperliquid:testnet"],
      allowedAssets: ["SUI", "USDC", "BTC", "ETH"],
      automaticAuthorities: ["read", "prepare", "write_note"],
      limits: {
        perActionUsd: 1_000,
        dailyUsd: 2_500,
        weeklyUsd: 5_000,
        maxSlippageBps: 0,
        maxLeverage: 1,
        minimumReserveUsd: 0,
        maxActiveWatches: 0,
        maxReadCallsPerRun: 12,
        maxPrepareCallsPerFamily: 1,
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
