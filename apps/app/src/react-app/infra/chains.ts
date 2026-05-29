import { base, baseSepolia } from "wagmi/chains";

export const MATTERHORN_CHAINS = {
  baseSepolia,
  base,
} as const;

export type MatterhornChainId = (typeof MATTERHORN_CHAINS)[keyof typeof MATTERHORN_CHAINS]["id"];

export const CHAIN_NAMES: Record<number, string> = {
  [baseSepolia.id]: "Base Sepolia",
  [base.id]: "Base",
};

export const DEFAULT_CHAIN = baseSepolia;
