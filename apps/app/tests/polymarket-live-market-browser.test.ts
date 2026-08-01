import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Polymarket live market browser", () => {
  const source = readFileSync(
    resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
    "utf8",
  );

  it("loads active markets without requiring a model response", () => {
    expect(source).toContain("void searchMarkets(\"\")");
    expect(source).toContain("/api/polymarket/markets?");
    expect(source).toContain("Search active markets");
  });

  it("uses a selected public market ID in the reviewed order path", () => {
    expect(source).toContain("setMarketId(market.id)");
    expect(source).toContain("Select a live market above or enter its public ID");
    expect(source).toContain("value={marketId}");
    expect(source).toContain("/api/polymarket/orders/handoff");
    expect(source).toContain("Authorize and submit");
  });
});
