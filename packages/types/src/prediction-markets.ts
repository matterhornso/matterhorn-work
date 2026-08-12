export const MATTERHORN_PREDICTION_MARKET_VENUE_IDS = [
  "polymarket",
  "kalshi",
  "manifold",
] as const;

export type MatterhornPredictionMarketVenueId =
  (typeof MATTERHORN_PREDICTION_MARKET_VENUE_IDS)[number];

export type MatterhornPredictionMarketExecutionSupport =
  | "wallet_reviewed"
  | "external_account"
  | "research_only";

export interface MatterhornPredictionMarketVenue {
  id: MatterhornPredictionMarketVenueId;
  name: string;
  description: string;
  marketType: "real_money" | "play_money";
  discovery: "live_public_api";
  execution: MatterhornPredictionMarketExecutionSupport;
  executionLabel: string;
  eligibility: "provider_check_required" | "external_account_required" | "not_applicable";
  eligibilityLabel: string;
  sourceUrl: string;
  termsUrl: string;
}

export interface MatterhornPredictionMarketSummary {
  venueId: MatterhornPredictionMarketVenueId;
  venueName: string;
  id: string;
  title: string;
  url: string;
  status: "open" | "closed" | "resolved" | "unknown";
  probability: number | null;
  probabilityLabel: string | null;
  volume: number | null;
  liquidity: number | null;
  unit: "USD" | "USDC" | "MANA";
  closesAt: string | null;
  sourceFetchedAt: string;
}

export interface MatterhornPredictionMarketVenueSearchStatus {
  venueId: MatterhornPredictionMarketVenueId;
  status: "ready" | "degraded";
  resultCount: number;
  message: string;
}

export interface MatterhornPredictionMarketVenuesResponse {
  version: "matterhorn.prediction-markets.venues.v1";
  venues: MatterhornPredictionMarketVenue[];
  safety: {
    researchOnlyOutsideReviewedPolymarket: true;
    eligibilityCheckedBeforeExecution: true;
    unattendedTrading: false;
  };
}

export interface MatterhornPredictionMarketSearchResponse {
  version: "matterhorn.prediction-markets.search.v1";
  query: string;
  markets: MatterhornPredictionMarketSummary[];
  venues: MatterhornPredictionMarketVenueSearchStatus[];
  fetchedAt: string;
  safety: MatterhornPredictionMarketVenuesResponse["safety"];
}
