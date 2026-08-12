import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("prediction markets Phase 2", () => {
  test("shows venue coverage in the Polymarket desk", () => {
    const sessionPage = read("../src/react-app/domains/session/chat/session-page.tsx");
    const coverage = read("../src/react-app/domains/session/workflows/prediction-market-venue-coverage.tsx");

    expect(sessionPage).toContain('<PredictionMarketVenueCoverage client={matterhornServerClient} />');
    expect(coverage).toContain("Available venues");
    expect(coverage).toContain("Search all supported venues. Transactions remain venue-specific.");
    expect(coverage).toContain('venue.marketType === "play_money" ? "Play money" : "Real money"');
    expect(coverage).toContain("venue.executionLabel");
  });

  test("keeps non-Polymarket venues research-only in prompts and agent policy", () => {
    const starters = read("../src/react-app/domains/session/workflows/desk-task-starters.ts");
    const agents = read("../../../packages/types/src/desk-agents.ts");

    expect(starters).toContain('id: "compare-venues"');
    expect(starters).toContain("Polymarket, Kalshi, and Manifold");
    expect(starters).toContain("Keep Kalshi and Manifold research-only");
    expect(agents).toContain("Never route their markets into a Polymarket order, wallet ticket, handoff, watch, or receipt");
    expect(agents).toContain('"matterhorn-work_matterhorn_prediction_markets_search"');
  });
});
