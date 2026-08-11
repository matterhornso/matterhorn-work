/** @jsxImportSource react */
import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

export function PredictionMarketVenueCoverage({
  client,
}: {
  client: MatterhornServerClient | null;
}) {
  const query = useQuery({
    queryKey: ["prediction-market-venue-coverage", client?.baseUrl ?? "offline"],
    enabled: Boolean(client),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!client) throw new Error("Matterhorn Desks engine is offline.");
      return client.predictionMarketVenues();
    },
  });

  if (!client) return null;

  return (
    <section
      className="mx-1 border-y border-border/60 py-3"
      aria-labelledby="prediction-market-venue-coverage-title"
      aria-busy={query.isLoading || undefined}
    >
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h3 id="prediction-market-venue-coverage-title" className="text-[13px] font-semibold text-dls-text">
          Available venues
        </h3>
        <p className="text-xs leading-5 text-dls-secondary">
          Search all supported venues. Transactions remain venue-specific.
        </p>
      </div>

      {query.isLoading ? (
        <p role="status" className="px-1 pt-3 text-xs text-dls-secondary">
          Loading venue coverage…
        </p>
      ) : query.isError ? (
        <p role="status" className="px-1 pt-3 text-xs text-dls-secondary">
          Venue coverage is temporarily unavailable. Polymarket research still works from its existing tools.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/50" aria-label="Prediction-market venues">
          {query.data?.venues.map((venue) => (
            <li key={venue.id} className="flex min-w-0 flex-col gap-1 px-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-dls-text">{venue.name}</span>
                  <span className="text-xs text-dls-secondary">
                    {venue.marketType === "play_money" ? "Play money" : "Real money"}
                  </span>
                </div>
                <p className="text-xs leading-5 text-dls-secondary">{venue.description}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dls-text">
                  <ShieldCheck className="size-3.5 text-[var(--matterhorn-desk-color)]" aria-hidden="true" />
                  {venue.executionLabel}
                </span>
                <a
                  href={venue.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-dls-secondary underline underline-offset-4 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)] sm:min-h-8"
                  aria-label={`${venue.name} API source (opens in a new tab)`}
                >
                  Source
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
