/**
 * Aave V3 Pool interactions — supply, withdraw, borrow, repay.
 * Builds calldata only; client signs and broadcasts.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { WHITELISTED_PROTOCOLS } from "../infra/token-registry.js";

const poolAbi = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
] as const;

function poolAddress(chainId: number): Address | undefined {
  return WHITELISTED_PROTOCOLS[chainId]?.aaveV3Pool as Address | undefined;
}

export function buildAaveSupplyTx({
  chainId,
  asset,
  amount,
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string; // raw wei
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "supply",
      args: [asset, BigInt(amount), onBehalfOf, 0],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Supply encoding failed" };
  }
}

export function buildAaveWithdrawTx({
  chainId,
  asset,
  amount,
  to,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  to: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "withdraw",
      args: [asset, BigInt(amount), to],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Withdraw encoding failed" };
  }
}

export function buildAaveBorrowTx({
  chainId,
  asset,
  amount,
  interestRateMode = 2, // variable
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  interestRateMode?: number;
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "borrow",
      args: [asset, BigInt(amount), BigInt(interestRateMode), 0, onBehalfOf],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Borrow encoding failed" };
  }
}

export function buildAaveRepayTx({
  chainId,
  asset,
  amount,
  interestRateMode = 2,
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  interestRateMode?: number;
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "repay",
      args: [asset, BigInt(amount), BigInt(interestRateMode), onBehalfOf],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Repay encoding failed" };
  }
}

const poolDataProviderAbi = [
  "function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryShares, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbackedMintCap, uint128 debtCeiling, uint128 debtCeilingDecimals, uint8 eModeCategory, uint128 borrowCap, uint128 supplyCap, uint40 eModeLabel, uint16 borrowableInIsolation, uint16 flashLoanEnabled)"
] as const;

export async function getAaveSupplyApy({
  chainId,
  asset,
}: {
  chainId: number;
  asset: Address;
}): Promise<{ success: true; supplyApy: string } | { success: false; error: string }> {
  const registry = WHITELISTED_PROTOCOLS[chainId];
  const provider = registry?.aaveV3PoolDataProvider as Address | undefined;
  if (!provider) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const { getClient } = await import("../infra/chain-client.js");
    const client = getClient(chainId);
    if (!client) return { success: false, error: "Chain client not available" };
    const result = await client.readContract({
      address: provider,
      abi: poolDataProviderAbi,
      functionName: "getReserveData",
      args: [asset],
    }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, number, Address, Address, Address, Address, bigint, bigint, bigint, bigint, number, number, number, number, number];
    const liquidityRate = result[5];
    const apy = (Number(liquidityRate) / 1e27) * 100;
    return { success: true, supplyApy: apy.toFixed(2) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "APY read failed" };
  }
}

export async function getAaveUserPositions({
  chainId,
  user,
}: {
  chainId: number;
  user: Address;
}): Promise<{ success: true; healthFactor: string; totalCollateral: string; totalDebt: string; availableBorrows: string } | { success: false; error: string }> {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const { getClient } = await import("../infra/chain-client.js");
    const client = getClient(chainId);
    if (!client) return { success: false, error: "Chain client not available" };
    const result = await client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getUserAccountData",
      args: [user],
    }) as [bigint, bigint, bigint, bigint, bigint, bigint];
    const [totalCollateralBase, totalDebtBase, availableBorrowsBase, , , healthFactor] = result;
    return {
      success: true,
      healthFactor: (Number(healthFactor) / 1e18).toFixed(2),
      totalCollateral: (Number(totalCollateralBase) / 1e8).toFixed(2),
      totalDebt: (Number(totalDebtBase) / 1e8).toFixed(2),
      availableBorrows: (Number(availableBorrowsBase) / 1e8).toFixed(2),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Position read failed" };
  }
}
