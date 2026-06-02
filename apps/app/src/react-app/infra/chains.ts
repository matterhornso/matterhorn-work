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

export const CHAIN_LIST = [
  { id: baseSepolia.id, name: "Base Sepolia" },
  { id: base.id, name: "Base" },
];

export const DEFAULT_CHAIN = baseSepolia;

/**
 * FORCE_TESTNET — when true, rejects any mainnet chainId.
 * Default false for dev. Set true in CI or prod to enforce testnet-only.
 */
export const FORCE_TESTNET = false;

export function isTestnetChainId(chainId: number): boolean {
  return chainId === baseSepolia.id;
}
