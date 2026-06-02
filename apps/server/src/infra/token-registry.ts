/**
 * Canonical token addresses and metadata for Base + Base Sepolia.
 * Hardcoded for speed — avoids external registry lookups in agent loop.
 */

export interface TokenMeta {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
  name: string;
}

/** Mainnet (chainId 8453) */
export const MAINNET: Record<string, TokenMeta> = {
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  cbETH: {
    address: "0x2Ae3F1Ec7F1F5012CFEab8915BA8908c95F7e269",
    decimals: 18,
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
  },
} as const;

/** Sepolia testnet (chainId 84532) */
export const SEPOLIA: Record<string, TokenMeta> = {
  USDC: {
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
  },
} as const;

/**
 * Get token registry for a chain.
 */
export function tokensForChain(chainId: number): Record<string, TokenMeta> | undefined {
  if (chainId === 8453) return MAINNET;
  if (chainId === 84532) return SEPOLIA;
  return undefined;
}

/** Known safe protocol addresses per chain for security guardrails. */
export const WHITELISTED_PROTOCOLS: Record<number, Record<string, `0x${string}`>> = {
  8453: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
    cbETH: "0x2Ae3F1Ec7F1F5012CFEab8915BA8908c95F7e269",
    oneInchRouter: "0x111111125421ca6dc452d289314280a0f8842a65",
    uniswapV3Router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  },
  84532: {
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    WETH: "0x4200000000000000000000000000000000000006",
  },
};

export function isWhitelistedAddress(chainId: number, address: string): boolean {
  const registry = WHITELISTED_PROTOCOLS[chainId];
  if (!registry) return false;
  const lower = address.toLowerCase();
  return Object.values(registry).some((a) => a.toLowerCase() === lower);
}
