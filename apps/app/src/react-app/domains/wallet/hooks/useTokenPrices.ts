/**
 * Token price hook — fetches real-time USD prices from server-side CoinGecko.
 * Cache 30s client-side to avoid hammering the API.
 */
import { useState, useEffect, useCallback, useRef } from "react";

export interface TokenPrice {
  id: string;
  price: number;
  change24h: number;
}

const CACHE_MS = 30_000;

export function useTokenPrices() {
  const [prices, setPrices] = useState<TokenPrice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchPrices = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const now = Date.now();
    if (now - lastFetchRef.current < CACHE_MS && prices.length > 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prices?ids=${encodeURIComponent(ids.join(","))}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.prices)) {
        setPrices(json.prices);
        lastFetchRef.current = now;
      } else {
        setError(json.error ?? "Could not load token prices.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [prices.length]);

  const getPrice = useCallback(
    (id: string): number => {
      return prices.find((p) => p.id === id)?.price ?? 0;
    },
    [prices],
  );

  return { prices, isLoading, error, fetchPrices, getPrice };
}
