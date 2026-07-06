import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Settings overview backend capability integration", () => {
  test("imports existing backend capability helpers", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("backendCapabilityLabel");
    expect(source).toContain("backendCapabilityTone");
    expect(source).toContain("summarizeModelSource");
    expect(source).toContain("walletFamilySummary");
    expect(source).toContain("storageLocationLabel");
    expect(source).toContain("workspaceDataPolicySummary");
  });

  test("queries backend capabilities and workspace data map", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("settings-backend-capabilities");
    expect(source).toContain("client.backendCapabilities()");
    expect(source).toContain("settings-workspace-data-map");
    expect(source).toContain("client.workspaceDataMap(workspaceId)");
    expect(source).toContain("Backend status");
    expect(source).toContain("Wallet families");
    expect(source).toContain("Training use");
  });

  test("keeps truthful wallet copy constraints", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("non-custodial");
    expect(source).toContain("Bittensor:");
    expect(source).toContain("external Bittensor-compatible signer");
    expect(source).toContain("No secret storage");
    expect(source).not.toContain("Sui wallet");
    expect(source).not.toContain("direct-connect");
  });
});

describe("Backend capability rendering layer files exist", () => {
  test.each([
    "domains/settings/backend-capability-status.ts",
    "domains/settings/backend-capabilities/backend-capability-helpers.ts",
    "domains/settings/backend-capabilities/backend-capability-fixtures.ts",
    "domains/settings/backend-capabilities/backend-capability-status.tsx",
    "domains/settings/backend-capabilities/backend-capability-section.tsx",
    "domains/settings/backend-capabilities/use-backend-capabilities.ts",
    "domains/profile/profile-capability-status.tsx",
  ])("%s exists", (path) => {
    const source = readAppSource(path);
    expect(source.length).toBeGreaterThan(0);
  });
});
