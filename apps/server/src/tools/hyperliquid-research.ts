/**
 * Hyperliquid Research Tools.
 * Public API — no key required for reads.
 * Endpoint: POST https://api.hyperliquid.xyz/info (JSON-RPC style).
 */

import { ApiClient } from "./api-client.js";

const client = new ApiClient({ baseUrl: "https://api.hyperliquid.xyz/info" });

/**
 * Call Hyperliquid info endpoint with a JSON-RPC-like payload.
 */
async function hlCall(type: string, payload?: unknown) {
  const data = (await client.post(
    "",
    { type, ...(payload !== undefined ? { ...payload } : {}) }
  )) as Record<string, unknown>;
  if ("error" in data) throw new Error(`Hyperliquid error: ${data.error}`);
  return data;
}

/**
 * Get all perpetual markets with status, max leverage, and metadata.
 */
export async function hl_getMarkets(): Promise<
  Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
    fundingIntervalHours: number;
    isActive: boolean;
  }>
> {
  const data = (await hlCall("metaAndAssetCtxs")) as {
    universe: Array<{
      name: string;
      szDecimals: number;
      maxLeverage: number;
      fundingIntervalHours: number;
      isActive: boolean;
    }>;
  };
  return data.universe;
}

/**
 * Get funding rates for a specific market.
 */
export async function hl_getFundingRates(symbol: string): Promise<{
  fundingRate: number;
  markPrice: number;
  openInterest: number;
  prevFundingRate: number;
  nextFundingTime: number;
}> {
  const data = (await hlCall("metaAndAssetCtxs")) as {
    universe: Array<{
      name: string;
      szDecimals: number;
      maxLeverage: number;
      fundingIntervalHours: number;
      isActive: boolean;
    }>;
    assetCtxs: Array<{
      fundingRate: string;
        markPrice: string;
        openInterest: string;
        prevFundingRate: string;
        nextFundingTime: number;
      }
    >;
  };

  const idx = data.universe.findIndex((u) => u.name === symbol);
  if (idx < 0) throw new Error(`Market not found: ${symbol}`);

  const ctx = data.assetCtxs[idx];
  return {
    fundingRate: Number(ctx.fundingRate),
    markPrice: Number(ctx.markPrice),
    openInterest: Number(ctx.openInterest),
    prevFundingRate: Number(ctx.prevFundingRate),
    nextFundingTime: ctx.nextFundingTime,
  };
}

/**
 * Get orderbook depth for a market.
 */
export async function hl_getOrderbook(symbol: string, limit = 20): Promise<{
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}> {
  const data = await client.post("", { type: "l2Book", coin: symbol });
  const book = data as { levels: Array<Array<{ px: string; sz: string }>> };
  const toArray = (lvl: Array<{ px: string; sz: string }>) =>
    lvl.slice(0, limit).map((x) => [Number(x.px), Number(x.sz)] as [number, number]);
  return { bids: toArray(book.levels[0] ?? []), asks: toArray(book.levels[1] ?? []) };
}

/**
 * Get open positions for a user.
 */
export async function hl_getPositions(user: string): Promise<
  Array<{
    coin: string;
    entryPx: number;
    positionValue: number;
    unrealizedPnl: number;
    leverage: number;
    liquidationPx: number | null;
    marginUsed: number;
  }>
> {
  const data = (await hlCall("clearinghouseState", { user })) as {
    assetPositions: Array<{
      position: {
        coin: string;
        entryPx: string;
        positionValue: string;
        unrealizedPnl: string;
        leverage: { value: string };
        liquidationPx: string | null;
        marginUsed: string;
      };
    }>;
  };

  return data.assetPositions.map((ap) => ({
    coin: ap.position.coin,
    entryPx: Number(ap.position.entryPx),
    positionValue: Number(ap.position.positionValue),
    unrealizedPnl: Number(ap.position.unrealizedPnl),
    leverage: Number(ap.position.leverage.value),
    liquidationPx: ap.position.liquidationPx ? Number(ap.position.liquidationPx) : null,
    marginUsed: Number(ap.position.marginUsed),
  }));
}

/**
 * Get account summary: margin, available balance, account value.
 */
export async function hl_getAccountSummary(user: string): Promise<{
  accountValue: number;
  marginUsed: number;
  withdrawable: number;
}> {
  const data = (await hlCall("clearinghouseState", { user })) as {
    accountValue: string;
    marginUsed: string;
    withdrawable: string;
  };
  return {
    accountValue: Number(data.accountValue),
    marginUsed: Number(data.marginUsed),
    withdrawable: Number(data.withdrawable),
  };
}
