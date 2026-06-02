/**
 * Hyperliquid Research Tools.
 * Public API — no key required for reads.
 * Endpoint: POST https://api.hyperliquid.xyz/info (JSON-RPC style).
 */

import { ApiClient } from "./api-client.js";

const client = new ApiClient({ baseUrl: "https://api.hyperliquid.xyz/info" });

/**
 * Call Hyperliquid info endpoint.
 * Response is either an array [meta, assetCtxs] or a flat object depending on the type.
 */
async function hlCall(type: string, payload?: unknown) {
  const data = (await client.post(
    "",
    { type, ...(payload !== undefined ? { ...payload } : {}) }
  )) as Record<string, unknown> | unknown[];

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null && "error" in data[0]) {
      throw new Error(`Hyperliquid error: ${(data[0] as { error: string }).error}`);
    }
  } else if ("error" in data) {
    throw new Error(`Hyperliquid error: ${data.error}`);
  }

  return data;
}

type MarketInfo = {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  fundingIntervalHours: number;
  isActive: boolean;
};

/**
 * Get all perpetual markets with status, max leverage, and metadata.
 */
export async function hl_getMarkets(): Promise<MarketInfo[]> {
  const data = await hlCall("metaAndAssetCtxs");
  const raw = data as unknown[];
  const meta = raw[0] as { universe: unknown[] };
  return (meta.universe || []) as MarketInfo[];
}

/**
 * Get funding rates for a specific market.
 */
export async function hl_getFundingRates(symbol: string): Promise<{
  fundingRate: number;
  markPrice: number;
  openInterest: number;
  premium: number;
  oraclePrice: number;
}> {
  const data = await hlCall("metaAndAssetCtxs");
  const raw = data as unknown[];
  const meta = raw[0] as { universe: Array<{ name: string }> };
  const ctxs = raw[1] as Record<number, { funding: string; markPx: string; openInterest: string; premium: string; oraclePx: string }>;
  const idx = meta.universe.findIndex((u) => u.name === symbol);
  if (idx < 0) throw new Error(`Market not found: ${symbol}`);
  const ctx = ctxs[idx];
  return {
    fundingRate: Number(ctx.funding),
    markPrice: Number(ctx.markPx),
    openInterest: Number(ctx.openInterest),
    premium: Number(ctx.premium),
    oraclePrice: Number(ctx.oraclePx),
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
