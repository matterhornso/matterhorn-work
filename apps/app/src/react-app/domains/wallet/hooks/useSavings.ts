import { useState, useEffect, useCallback } from "react";
import type { Address } from "viem";
import type { PortfolioData, TokenPosition } from "../pages/PortfolioView";

interface AavePosition {
  asset: Address;
  symbol: string;
  depositAmount: string;
  depositValue: number;
  supplyApy: number;
}

interface SavingsState {
  savingsValue: number;
  idleValue: number;
  blendedApy: number;
  yieldEarned: number;
  positions: AavePosition[];
}

const YIELD_SYMBOLS = ["USDC", "WETH"] as const;

function isYieldSymbol(symbol: string): boolean {
  return YIELD_SYMBOLS.includes(symbol as typeof YIELD_SYMBOLS[number]);
}

export function useSavings(data: PortfolioData | null): SavingsState {
  const [positions, setPositions] = useState<AavePosition[]>([]);

  const fetchPositions = useCallback(async () => {
    if (!data || !data.address || !data.chainId) return;
    try {
      const depRes = await fetch(`/api/aave/deposits?chainId=${data.chainId}&address=${data.address}`);
      const depJson = await depRes.json();
      const deposits = depJson.success ? depJson.deposits : [];

      const yieldPositions: AavePosition[] = [];
      for (const token of data.tokens.filter((t) => isYieldSymbol(t.symbol))) {
        const apyRes = await fetch(`/api/aave/apy?chainId=${data.chainId}&asset=${token.address}`);
        const apyJson = await apyRes.json();
        const supplyApy = apyJson.success ? Number(apyJson.supplyApy) : 0;

        const deposit = deposits.find((d: any) => d.symbol === token.symbol);
        const depositAmount = deposit ? deposit.amount : "0";
        const depositValue = deposit
          ? (Number(deposit.amount) / 10 ** token.decimals)
          : 0;

        yieldPositions.push({
          asset: token.address as Address,
          symbol: token.symbol,
          depositAmount,
          depositValue,
          supplyApy,
        });
      }
      setPositions(yieldPositions);
    } catch {
      /* silent fail — don't block portfolio rendering */
    }
  }, [data?.address, data?.chainId, data?.tokens]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const idleValue = (data?.tokens ?? [])
    .filter((t) => isYieldSymbol(t.symbol))
    .reduce((sum, t) => sum + t.formatted, 0);

  const savingsValue = positions.reduce((sum, p) => sum + p.depositValue, 0);

  const blendedApy = savingsValue > 0
    ? positions.reduce((sum, p) => sum + p.depositValue * p.supplyApy, 0) / savingsValue
    : 0;

  return {
    savingsValue,
    idleValue,
    blendedApy,
    yieldEarned: 0,
    positions,
  };
}
