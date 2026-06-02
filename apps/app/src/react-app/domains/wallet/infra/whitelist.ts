/**
 * Protocol whitelist for known safe contracts.
 * Duplicated from server token-registry for client-side use.
 */

export const WHITELISTED_PROTOCOLS: Record<number, Record<string, `0x${string}`>> = {
  8453: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WETH: "0x4200000000000000000000000000000000000006",
    cbETH: "0x2Ae3F1Ec7F1F5012CFEab8915BA8908c95F7E269",
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
