/**
 * DeFiLlama yield & TVL research tools.
 * Cache 60s — data moves slower than prices.
 */

import { ApiClient } from "./api-client.js";

const client = new ApiClient({ baseUrl: "https://yields.llama.fi" });

const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 60_000;

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

export interface YieldPool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number;
  pool: string;
}

/** Get top pools on a chain, optionally filtered by protocol. */
export async function getYields(chain: string, protocol?: string, limit = 20) {
  const data = (await cached(
    `yields:${chain}:${protocol ?? "*"}`,
    () => client.get("/pools") as Promise<{ data: YieldPool[] }>
  )) as { data: YieldPool[] };

  let pools = data.data.filter((p) => p.chain.toLowerCase() === chain.toLowerCase());
  if (protocol) {
    pools = pools.filter((p) =>
      p.project.toLowerCase().includes(protocol.toLowerCase())
    );
  }

  return pools
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, limit)
    .map((p) => ({
      pool: p.pool,
      project: p.project,
      symbol: p.symbol,
      chain: p.chain,
      tvlUsd: p.tvlUsd,
      apy: p.apy,
      apyBase: p.apyBase,
      apyReward: p.apyReward,
    }));
}

/** Quick summary for a specific pool ID. */
export async function getPoolInfo(poolId: string) {
  const data = (await cached(
    `pool:${poolId}`,
    () => client.get(`/chart/${poolId}`) as Promise<{ data: { timestamp: string; tvlUsd: number; apy: number }[] }>
  )) as { data: { timestamp: string; tvlUsd: number; apy: number }[] };

  const latest = data.data[data.data.length - 1];
  return { poolId, tvlUsd: latest.tvlUsd, apy: latest.apy };
}
