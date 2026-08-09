import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Bittensor public wallet history UI", () => {
  test("exposes explicit save, export, and two-step clear controls without custody", () => {
    const source = readFileSync(
      "apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx",
      "utf8",
    );

    expect(source).toContain("/api/bittensor/wallet/timeline/status");
    expect(source).toContain("/api/bittensor/wallet/timeline/capture");
    expect(source).toContain("/api/bittensor/wallet/timeline/export");
    expect(source).toContain("/api/bittensor/wallet/timeline/clear");
    expect(source).toContain("Public wallet history");
    expect(source).toContain("Save snapshot");
    expect(source).toContain("Export JSON");
    expect(source).toContain("Confirm clear");
    expect(source).toContain("watch-only balance and stake snapshots");
    expect(source).not.toContain("walletTimelineStatus.path");
  });
});
