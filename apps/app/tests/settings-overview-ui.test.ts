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
    expect(source).toContain("summarizeModelRoutingPolicy");
    expect(source).toContain("walletFamilySummary");
    expect(source).toContain("storageLocationLabel");
    expect(source).toContain("workspaceDataPolicySummary");
    expect(source).toContain("buildNftPublishingReadinessItems");
    expect(source).toContain("NftPublishingReadinessRows");
    expect(source).toContain("rollUpNftPublishingReadinessStatus");
  });

  test("queries backend capabilities and workspace data map", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("settings-workspace-backend-control-plane");
    expect(source).toContain("client.workspaceBackendControlPlane(backendWorkspaceId)");
    expect(source).toContain("workspaceBackendControlPlaneQuery.data?.capabilities");
    expect(source).toContain("settings-backend-capabilities");
    expect(source).toContain("client.backendCapabilities()");
    expect(source).toContain("workspaceReadiness.summary.recommendedActions");
    expect(source).toContain("Next step");
    expect(source).toContain("action.command");
    expect(source).toContain("settings-workspace-data-map");
    expect(source).toContain("client.workspaceDataMap(workspaceId)");
    expect(source).toContain("settings-workspace-data-controls");
    expect(source).toContain("client.workspaceDataControls(workspaceId)");
    expect(source).toContain("settings-workspace-data-policy");
    expect(source).toContain("client.workspaceDataPolicy(workspaceId)");
    expect(source).toContain("client.updateWorkspaceDataPolicy(workspaceId, { feedbackUse })");
    expect(source).toContain("Backend status");
    expect(source).toContain("Image and NFT publishing");
    expect(source).toContain("Generated images, public storage, Sui minting, and marketplace listing readiness.");
    expect(source).toContain("Wallet families");
    expect(source).toContain("Training use");
  });

  test("renders profile overview status from backend capability instead of hardcoded sign-out copy", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain('settingsCapability(backendCapabilities, "profile")');
    expect(source).toContain("profileCapability?.description");
    expect(source).toContain("<CapabilityBadge status={profileCapability.status}");
    expect(source).toContain("Account and local/cloud profile readiness.");
    expect(source).not.toContain("You are not signed in to a Matterhorn Work account.");
    expect(source).not.toContain("<StatusBadge tone=\"setup\">Signed out</StatusBadge>");
  });

  test("renders data policy from workspace data-map instead of static copy", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("DataPolicySection");
    expect(source).toContain("DATA_POLICY_STORE_ORDER");
    expect(source).toContain('"modelPreferences"');
    expect(source).toContain('"dataPolicy"');
    expect(source).toContain('"walletEvidence"');
    expect(source).toContain("Object.values(props.dataMap.stores)");
    expect(source).toContain("orderedIds.has(store.id)");
    expect(source).toContain("storageLocationLabel(store)");
    expect(source).toContain("controlQuickActions(props.controls)");
    expect(source).toContain("dataControlActionTone(action)");
    expect(source).toContain("controlSummary(props.controls, store, \"export\")");
    expect(source).toContain("controlSummary(props.controls, store, \"deletion\")");
    expect(source).toContain("controlAppRoute(control)");
    expect(source).toContain("onOpenControlRoute");
    expect(source).toContain("retentionLabel(store.retention)");
    expect(source).toContain("secretsLabel(store.containsSecrets)");
    expect(source).toContain("Workspace data policy");
    expect(source).toContain("Model training");
    expect(source).toContain("Workspace data is not used for RL or model training.");
    expect(source).toContain("Feedback collection");
    expect(source).toContain("Toggle workspace feedback collection");
    expect(source).toContain("Export and delete");
    expect(source).toContain("Manage data");
    expect(source).toContain("Open the owning surface for review, export, or deletion controls.");
    expect(source).toContain("Storage locations, routes, and controls");
    expect(source).toContain("Use the Manage links for user-controlled stores");
    expect(source).toContain("retentionPolicy.summary");
    expect(source).toContain("Where workspace data lives, what can be exported, and what can be deleted.");
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
