/**
 * CoinGecko free tier research tools.
 * Cache 15s to avoid rate limits.
 */

import { ApiClient } from "./api-client.js";

const client = new ApiClient({ baseUrl: "https://api.coingecko.com/api/v3" });

const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 15_000;

function cached(key: string, fetcher: () => Promise<unknown>): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Promise.resolve(hit.data);
  }
  return fetcher().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

/** Search for coins by keyword. Returns top 10. */
export async function searchCoins(query: string) {
  const data = (await cached(
    `search:${query}`,
    () => client.get("/search", { query })
  )) as { coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }> };

  return data.coins.slice(0, 10).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol.toUpperCase(),
    rank: c.market_cap_rank,
  }));
}

/** Get current USD prices for coin IDs. */
export async function getPrices(ids: string[]) {
  const data = (await cached(
    `prices:${ids.sort().join(",")}`,
    () => client.get("/simple/price", {
      ids: ids.join(","),
      vs_currencies: "usd",
      include_24hr_change: "true",
    })
  )) as Record<string, { usd: number; usd_24h_change: number }>;

  return Object.entries(data).map(([id, v]) => ({
    id,
    price: v.usd,
    change24h: v.usd_24h_change,
  }));
}

/** Trending coins. */
export async function trending() {
  const data = (await cached(
    "trending",
    () => client.get("/search/trending")
  )) as {
    coins: Array<{ item: { id: string; name: string; symbol: string; thumb: string } }>;
  };

  return data.coins.slice(0, 10).map((c) => ({
    id: c.item.id,
    name: c.item.name,
    symbol: c.item.symbol.toUpperCase(),
    image: c.item.thumb,
  }));
}
