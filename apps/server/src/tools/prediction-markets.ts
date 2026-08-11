import type {
  MatterhornPredictionMarketSearchResponse,
  MatterhornPredictionMarketSummary,
  MatterhornPredictionMarketVenue,
  MatterhornPredictionMarketVenueId,
  MatterhornPredictionMarketVenueSearchStatus,
  MatterhornPredictionMarketVenuesResponse,
} from "@matterhorn-work/types/prediction-markets";
import type { PolymarketMarketSummary, PolymarketProvider } from "./polymarket.js";
import { polymarketProvider } from "./polymarket.js";

const KALSHI_MARKETS_URL = "https://external-api.kalshi.com/trade-api/v2/markets";
const MANIFOLD_SEARCH_URL = "https://api.manifold.markets/v0/search-markets";
const RESPONSE_LIMIT_BYTES = 2_500_000;
const REQUEST_TIMEOUT_MS = 8_000;

export const MATTERHORN_PREDICTION_MARKET_VENUES: MatterhornPredictionMarketVenue[] = [
  {
    id: "polymarket",
    name: "Polymarket",
    description: "Public event markets with live probability, liquidity, and orderbook context.",
    marketType: "real_money",
    discovery: "live_public_api",
    execution: "wallet_reviewed",
    executionLabel: "Wallet review when eligible",
    eligibility: "provider_check_required",
    eligibilityLabel: "Polymarket geoblock check required",
    sourceUrl: "https://docs.polymarket.com/api-reference/introduction",
    termsUrl: "https://polymarket.com/terms-of-use",
  },
  {
    id: "kalshi",
    name: "Kalshi",
    description: "Public event-contract data across economics, climate, technology, entertainment, and more.",
    marketType: "real_money",
    discovery: "live_public_api",
    execution: "external_account",
    executionLabel: "Research only in Matterhorn",
    eligibility: "external_account_required",
    eligibilityLabel: "Kalshi account eligibility required",
    sourceUrl: "https://docs.kalshi.com/getting_started/quick_start_market_data",
    termsUrl: "https://kalshi.com/terms",
  },
  {
    id: "manifold",
    name: "Manifold",
    description: "Community prediction markets with public probabilities and play-money liquidity.",
    marketType: "play_money",
    discovery: "live_public_api",
    execution: "research_only",
    executionLabel: "Research only",
    eligibility: "not_applicable",
    eligibilityLabel: "No Matterhorn transaction path",
    sourceUrl: "https://docs.manifold.markets/api",
    termsUrl: "https://manifold.markets/terms",
  },
];

const SAFETY: MatterhornPredictionMarketVenuesResponse["safety"] = {
  researchOnlyOutsideReviewedPolymarket: true,
  eligibilityCheckedBeforeExecution: true,
  unattendedTrading: false,
};

export function buildPredictionMarketVenuesResponse(): MatterhornPredictionMarketVenuesResponse {
  return {
    version: "matterhorn.prediction-markets.venues.v1",
    venues: MATTERHORN_PREDICTION_MARKET_VENUES,
    safety: SAFETY,
  };
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type PredictionMarketDependencies = {
  fetchImpl?: FetchLike;
  polymarket?: Pick<PolymarketProvider, "searchMarkets">;
  now?: () => Date;
};

type UnknownObject = Record<string, unknown>;

function isUnknownObject(value: unknown): value is UnknownObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): UnknownObject | null {
  return isUnknownObject(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampProbability(value: number | null): number | null {
  return value == null || value < 0 || value > 1 ? null : value;
}

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

async function fetchJson(url: URL, fetchImpl: FetchLike): Promise<unknown> {
  let lastError: unknown = new Error("Prediction-market provider did not answer");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": "Matterhorn-Desks/1.0" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > RESPONSE_LIMIT_BYTES) {
        throw new Error("Response is larger than the Matterhorn market-data limit");
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > RESPONSE_LIMIT_BYTES) {
        throw new Error("Response is larger than the Matterhorn market-data limit");
      }
      const parsed: unknown = JSON.parse(body);
      return parsed;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function matchesQuery(value: UnknownObject, query: string): boolean {
  if (!query) return true;
  const terms = query.toLowerCase().split(" ").filter(Boolean);
  const haystack = [value.title, value.subtitle, value.yes_sub_title, value.no_sub_title, value.ticker]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function mapPolymarketMarket(market: PolymarketMarketSummary, fetchedAt: string): MatterhornPredictionMarketSummary {
  const firstProbability = Object.entries(market.outcomePrices)
    .find(([, probability]) => Number.isFinite(probability));
  return {
    venueId: "polymarket",
    venueName: "Polymarket",
    id: market.id,
    title: market.question,
    url: market.slug ? `https://polymarket.com/event/${market.slug}` : "https://polymarket.com/markets",
    status: market.closed ? "closed" : market.active ? "open" : "unknown",
    probability: clampProbability(firstProbability?.[1] ?? null),
    probabilityLabel: firstProbability?.[0] ?? null,
    volume: market.volume,
    liquidity: market.liquidity,
    unit: "USDC",
    closesAt: market.endDate,
    sourceFetchedAt: market.source.fetchedAt || fetchedAt,
  };
}

async function searchPolymarket(
  query: string,
  limit: number,
  provider: Pick<PolymarketProvider, "searchMarkets">,
  fetchedAt: string,
): Promise<MatterhornPredictionMarketSummary[]> {
  const markets = await provider.searchMarkets(query, limit);
  return markets.slice(0, limit).map((market) => mapPolymarketMarket(market, fetchedAt));
}

async function searchKalshi(
  query: string,
  limit: number,
  fetchImpl: FetchLike,
  fetchedAt: string,
): Promise<MatterhornPredictionMarketSummary[]> {
  const results: MatterhornPredictionMarketSummary[] = [];
  let cursor = "";
  const pageCount = query ? 2 : 1;
  for (let page = 0; page < pageCount && results.length < limit; page += 1) {
    const url = new URL(KALSHI_MARKETS_URL);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", query ? "1000" : String(limit));
    url.searchParams.set("mve_filter", "exclude");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = objectValue(await fetchJson(url, fetchImpl));
    const markets = Array.isArray(payload?.markets) ? payload.markets : [];
    results.push(...markets
      .map(objectValue)
      .filter((market): market is UnknownObject => market !== null && matchesQuery(market, query))
      .slice(0, limit - results.length)
      .flatMap((market): MatterhornPredictionMarketSummary[] => {
      const id = stringValue(market.ticker);
      const baseTitle = stringValue(market.title);
      const yesSubtitle = stringValue(market.yes_sub_title);
      if (!id || !baseTitle) return [];
      const title = yesSubtitle && !baseTitle.toLowerCase().includes(yesSubtitle.toLowerCase())
        ? `${baseTitle}: ${yesSubtitle}`
        : baseTitle;
      const last = clampProbability(numberValue(market.last_price_dollars));
      const bid = clampProbability(numberValue(market.yes_bid_dollars));
      const ask = clampProbability(numberValue(market.yes_ask_dollars));
      const probability = last && last > 0 ? last : bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : bid ?? ask;
      return [{
        venueId: "kalshi",
        venueName: "Kalshi",
        id,
        title,
        url: `https://kalshi.com/markets/${encodeURIComponent(id.toLowerCase())}`,
        status: stringValue(market.status) === "active" ? "open" : "unknown",
        probability,
        probabilityLabel: yesSubtitle ?? "Yes",
        volume: numberValue(market.volume_fp),
        liquidity: numberValue(market.liquidity_dollars),
        unit: "USD",
        closesAt: stringValue(market.close_time),
        sourceFetchedAt: fetchedAt,
      }];
      }));
    cursor = stringValue(payload?.cursor) ?? "";
    if (!cursor) break;
  }
  return results;
}

async function searchManifold(
  query: string,
  limit: number,
  fetchImpl: FetchLike,
  fetchedAt: string,
): Promise<MatterhornPredictionMarketSummary[]> {
  const url = new URL(MANIFOLD_SEARCH_URL);
  url.searchParams.set("term", query);
  url.searchParams.set("filter", "open");
  url.searchParams.set("sort", query ? "score" : "liquidity");
  url.searchParams.set("limit", String(limit));
  const payload = await fetchJson(url, fetchImpl);
  const markets = Array.isArray(payload) ? payload : [];
  return markets
    .map(objectValue)
    .filter((market): market is UnknownObject => Boolean(market))
    .slice(0, limit)
    .flatMap((market): MatterhornPredictionMarketSummary[] => {
      const id = stringValue(market.id);
      const title = stringValue(market.question);
      const urlValue = stringValue(market.url);
      if (!id || !title || !urlValue) return [];
      const closeTime = numberValue(market.closeTime);
      return [{
        venueId: "manifold",
        venueName: "Manifold",
        id,
        title,
        url: urlValue,
        status: market.isResolved === true ? "resolved" : "open",
        probability: clampProbability(numberValue(market.probability)),
        probabilityLabel: "Yes",
        volume: numberValue(market.volume),
        liquidity: numberValue(market.totalLiquidity),
        unit: "MANA",
        closesAt: closeTime == null ? null : new Date(closeTime).toISOString(),
        sourceFetchedAt: fetchedAt,
      }];
    });
}

export async function searchPredictionMarkets(
  rawQuery: string,
  rawLimit = 5,
  dependencies: PredictionMarketDependencies = {},
): Promise<MatterhornPredictionMarketSearchResponse> {
  const query = normalizeQuery(rawQuery);
  const limit = normalizeLimit(rawLimit);
  const fetchedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const provider = dependencies.polymarket ?? polymarketProvider;
  const searches: Array<{
    id: MatterhornPredictionMarketVenueId;
    run: () => Promise<MatterhornPredictionMarketSummary[]>;
  }> = [
    { id: "polymarket", run: () => searchPolymarket(query, limit, provider, fetchedAt) },
    { id: "kalshi", run: () => searchKalshi(query, limit, fetchImpl, fetchedAt) },
    { id: "manifold", run: () => searchManifold(query, limit, fetchImpl, fetchedAt) },
  ];
  const settled = await Promise.allSettled(searches.map((search) => search.run()));
  const markets: MatterhornPredictionMarketSummary[] = [];
  const venues: MatterhornPredictionMarketVenueSearchStatus[] = settled.map((result, index) => {
    const venueId = searches[index]!.id;
    if (result.status === "fulfilled") {
      markets.push(...result.value);
      return { venueId, status: "ready", resultCount: result.value.length, message: "Live public data loaded." };
    }
    return { venueId, status: "degraded", resultCount: 0, message: "This venue did not answer; the other venue results remain available." };
  });
  return {
    version: "matterhorn.prediction-markets.search.v1",
    query,
    markets,
    venues,
    fetchedAt,
    safety: SAFETY,
  };
}
