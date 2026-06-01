/**
 * Polymarket Research Tools.
 * Gamma API wrapper. Research only — no execution possible without broker API.
 * When user says "bet on Polymarket", agent researches → proposes → says
 * "Go to polymarket.com/event/{id} and buy YES at {odds}. Here's why..."
 */

import { ApiClient } from "./api-client.js";

const client = new ApiClient({ baseUrl: "https://gamma-api.polymarket.com" });

export interface PolymarketEvent {
  id: string;
  title: string;
  description: string;
  endDate: string;
  volume: number;
  liquidity: number;
  status: string;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  id: string;
  question: string;
  outcomePrices: Record<string, number>; // YES / NO
  volume: number;
  liquidity: number;
  resolutionDate: string;
  status: string;
}

/**
 * Search events by keyword.
 */
export async function pm_searchEvents(query: string, limit = 10): Promise<
  Pick<PolymarketEvent, "id" | "title" | "description" | "endDate" | "volume">[]
> {
  const data = (await client.get("/events", {
    closed: "false",
    active: "true",
    _q: query,
    limit: String(limit),
  })) as { events: PolymarketEvent[] };

  return (data.events || []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    endDate: e.endDate,
    volume: e.volume,
  }));
}

/**
 * Get full event details including all markets.
 */
export async function pm_getEvent(eventId: string): Promise<PolymarketEvent> {
  const data = (await client.get(`/events/${eventId}`)) as PolymarketEvent;
  return data;
}

/**
 * Get orderbook for a specific market.
 */
export async function pm_getOrderbook(marketId: string, limit = 5): Promise<{
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}> {
  const data = (await client.get(`/markets/${marketId}/orderbook`, { limit: String(limit) })) as {
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
  };

  return {
    bids: (data.bids || []).map((b) => ({ price: Number(b.price), size: Number(b.size) })),
    asks: (data.asks || []).map((a) => ({ price: Number(a.price), size: Number(a.size) })),
  };
}
