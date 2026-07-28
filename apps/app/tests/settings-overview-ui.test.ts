import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
}

describe("Settings overview backend capability integration", () => {
  test("imports existing backend capability helpers", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("backendCapabilityLabel");
    expect(source).toContain("backendCapabilityTone");
    expect(source).toContain("summarizeModelSelection");
    expect(source).toContain("settingsStorageLocationLabel");
    expect(source).toContain("workspaceDataPolicySummary");
    expect(source).toContain("buildNftPublishingReadinessItems");
    expect(source).toContain("buildNftPublishingSetupRequirements");
    expect(source).toContain("NftPublishingReadinessRows");
    expect(source).toContain("NftPublishingSetupRows");
    expect(source).toContain("rollUpNftPublishingReadinessStatus");
  });

  test("queries backend capabilities and workspace data map", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("settings-workspace-backend-control-plane");
    expect(source).toContain(
      "client.workspaceBackendControlPlane(backendWorkspaceId)",
    );
    expect(source).toContain(
      "workspaceBackendControlPlaneQuery.data?.capabilities",
    );
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
    expect(source).toContain(
      "client.updateWorkspaceDataPolicy(workspaceId, { feedbackUse })",
    );
    expect(source).toContain("Workspace health");
    expect(source).toContain("Image and NFT publishing");
    expect(source).toContain(
      "Generated images, public storage, Sui minting, and marketplace listing readiness.",
    );
    expect(source).toContain("These are backend setup gates only.");
    expect(source).toContain(
      "MATTERHORN_LAUNCH_FEATURES.generatedMedia && publishingReadiness.length",
    );
    expect(source).toContain("Wallet safety");
    expect(source).toContain("Training use");
  });

  test("renders profile overview status from backend capability instead of hardcoded sign-out copy", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain(
      'settingsCapability(backendCapabilities, "profile")',
    );
    expect(source).toContain("profileCapability?.description");
    expect(source).toContain(
      "<CapabilityBadge status={profileCapability.status}",
    );
    expect(source).toContain('"Profile and workspace access."');
    expect(source).not.toContain(
      "You are not signed in to a Matterhorn Desks account.",
    );
    expect(source).not.toContain(
      '<StatusBadge tone="setup">Signed out</StatusBadge>',
    );
    expect(source).toContain(
      "function UnavailableStatus(props: { label?: string })",
    );
    expect(source).toContain('{props.label ?? "Engine offline"}');
    expect(source).toContain(
      '<UnavailableStatus label="Workspace unavailable" />',
    );
    expect(source).toContain("text-red-10");
    expect(source).toContain("bg-red-9");
    expect(source).not.toContain(
      '<StatusBadge tone="error">Unavailable</StatusBadge>',
    );
    expect(source).toContain(
      'MATTERHORN_LAUNCH_FEATURES.cloud ? "cloud-account" : "preferences"',
    );
    expect(source).toContain('"Open workspace preferences"');
  });

  test("keeps healthy engine state quiet and hides technical detail by default", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain('if (status === "working") return null;');
    expect(source).toContain('className="group/backend-details"');
    expect(source).toContain("Workspace details");
    expect(source).toContain("<CollapsibleContent");
    expect(source).not.toContain(
      'status={<StatusBadge tone="ready">Ready</StatusBadge>}',
    );
    expect(source).not.toContain(
      'status={<StatusBadge tone="ready">Boundaries visible</StatusBadge>}',
    );
  });

  test("keeps secondary operational controls behind an intentional disclosure", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("advancedOverviewOpen");
    expect(source).toContain("More workspace controls");
    expect(source).toContain(
      "Activity, notes, appearance, wallet tools, connectors, and diagnostics.",
    );
    expect(source).toContain("group/overview-advanced");
    expect(source).toContain("OverviewControlGroup");
    expect(source).toContain("Work & evidence");
    expect(source).toContain("Wallet & protocols");
    expect(source).toContain("Workspace & diagnostics");
  });

  test("makes feedback filters and memory commands visibly interactive", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain('aria-label="Filter feedback"');
    expect(source).toContain('role="group"');
    expect(source).toContain(
      'variant={filter === "all" ? "default" : "outline"}',
    );
    expect(source).toContain(
      'variant={filter === kind ? "default" : "outline"}',
    );
    expect(source).toContain("Open Memory review");
    expect(source).toContain(
      '<ArrowRight className="size-3.5" aria-hidden="true" />',
    );
    expect(source).toContain("Create memory export");
    expect(source).toContain(
      '<Archive className="size-3.5" aria-hidden="true" />',
    );
  });

  test("renders data policy from workspace data-map instead of static copy", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("DataPolicySection");
    expect(source).toContain("DATA_POLICY_STORE_ORDER");
    expect(source).toContain('"modelPreferences"');
    expect(source).toContain('"billing"');
    expect(source).toContain('"dataPolicy"');
    expect(source).toContain('"walletEvidence"');
    expect(source).toContain("Object.values(props.dataMap.stores)");
    expect(source).toContain("orderedIds.has(store.id)");
    expect(source).toContain("settingsStorageLocationLabel(store)");
    expect(source).toContain("controlQuickActions(props.controls)");
    expect(source).toContain("seenLabels.has(labelKey)");
    expect(source).toContain("seenRoutes.has(routeKey)");
    expect(source).toContain(
      '!MATTERHORN_LAUNCH_FEATURES.billing && action.href.includes("/settings/billing")',
    );
    expect(source).toContain("dataControlActionTone(action)");
    expect(source).toContain('controlSummary(props.controls, store, "export")');
    expect(source).toContain(
      'controlSummary(props.controls, store, "deletion")',
    );
    expect(source).toContain("controlAppRoute(control)");
    expect(source).toContain("onOpenControlRoute");
    expect(source).toContain("retentionLabel(store.retention)");
    expect(source).toContain("secretsLabel(store.containsSecrets)");
    expect(source).toContain("Workspace data policy");
    expect(source).toContain("Model training");
    expect(source).toContain(
      "Workspace data is not used for RL or model training.",
    );
    expect(source).toContain("Feedback collection");
    expect(source).toContain("Toggle workspace feedback collection");
    expect(source).toContain("Export and delete");
    expect(source).toContain("Manage data");
    expect(source).toContain('<ArrowRight size={13} aria-hidden="true" />');
    expect(source).toContain(
      "Open the owning surface for review, export, or deletion controls.",
    );
    expect(source).toContain("Storage locations, routes, and controls");
    expect(source).toContain("Use the Manage links for user-controlled stores");
    expect(source).toContain("retentionPolicy.summary");
    expect(source).toContain("dataPrivacyOpen");
    expect(source).toContain("Local workspace controls for data, feedback, exports, and deletion.");
    expect(source).toContain("group/overview-data");
    expect(source).toContain("group-data-[state=open]/overview-data:rotate-180");
  });

  test("keeps truthful wallet copy constraints", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("non-custodial");
    expect(source).toContain("Bittensor:");
    expect(source).toContain("Staking and advanced calls remain");
    expect(source).toContain("Hyperliquid:</");
    expect(source).toContain("manual orders use a separate trade ticket");
    expect(source).toContain("agents and watches cannot submit");
    expect(source).toContain("Polymarket:");
    expect(source).toContain("No secret storage");
    expect(source).toContain(
      "Wallet signing still happens in the user's Sui wallet.",
    );
    expect(source).not.toContain("direct-connect");
  });

  test("derives protocol availability from runtime truth and distinguishes labels from actions", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain('queryKey: ["settings-market-execution-readiness"]');
    expect(source).toContain("client.marketExecutionReadiness()");
    expect(source).toContain("backendCapabilities?.wallets.families.bittensor");
    expect(source).toContain("liveProviderConfigured === true");
    expect(source).toContain('dataMode === "curated_fallback"');
    expect(source).toContain('venue.venue === "hyperliquid"');
    expect(source).toContain('venue.venue === "polymarket"');
    expect(source).toContain("Live reads · TAO transfers");
    expect(source).toContain("Fallback reads · TAO transfers");
    expect(source).toContain("Wallet-approved execution");
    expect(source).toContain("Live submission is enabled only through the exact-order trade ticket");
    expect(source).toContain("Live submission is disabled by the deployment execution switch");
    expect(source).toContain("Preview only");
    expect(source).toContain(
      "These labels describe what each desk can do; they are not action buttons.",
    );
    expect(source).not.toContain(">Review and sign</StatusBadge>");
    expect(source).not.toContain(">Compliance gated</StatusBadge>");
  });

  test("surfaces billing team-seat limits before local token creation", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("settings-workspace-billing-status");
    expect(source).toContain("client.workspaceBillingStatus(workspaceId)");
    expect(source).toContain("teamSeatUsageText");
    expect(source).toContain("teamLimitReached");
    expect(source).toContain(
      "Team seats are full on this plan. Open Billing to upgrade before creating teammate tokens.",
    );
    expect(source).toContain(
      "Upgrade to Matterhorn Max to create teammate tokens.",
    );
    expect(source).toContain(
      "MATTERHORN_LAUNCH_FEATURES.billing && props.matterhornServerClient",
    );
    expect(source).toContain(
      'MATTERHORN_LAUNCH_FEATURES.billing ? () => onSelectTab("billing") : undefined',
    );
    expect(source).toContain(
      "MATTERHORN_LAUNCH_FEATURES.cloud ? ` Cloud teams:",
    );
    expect(source).toContain(
      "Contact the workspace owner before creating another teammate token.",
    );
    expect(source).toContain(
      "refetchBilling={workspaceBillingStatusQuery.refetch}",
    );
  });

  test("keeps prepared, running, and waiting task states visually distinct", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain('status === "staged"');
    expect(source).toContain('label: "Prepared"');
    expect(source).toContain('status === "waiting"');
    expect(source).toContain('label: "Waiting"');
    expect(source).toContain('label: "Running"');
  });

  test("exposes selected state and honest clipboard feedback for overview controls", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("copyTextWithFallback");
    expect(source).toContain("copyTextWithSelection");
    expect(source).toContain("CLIPBOARD_WRITE_TIMEOUT_MS");
    expect(source).toContain("before the first await");
    expect(source).toContain("Promise.race([clipboardWrite, timeout])");
    expect(source).toContain('"Copy failed"');
    expect(source).toContain("RELEASE_DOCTOR_COMMAND");
    expect(source).toContain("select-all break-all");
    expect(source).toContain('aria-pressed={filter === "all"}');
    expect(source).toContain("aria-pressed={theme === option.id}");
    expect(source).toContain('aria-pressed={density === "comfortable"}');
    expect(source).toContain('label="Brand palette"');
    expect(source).toContain("<span>Fixed</span>");
  });

  test("labels an idle reconnect action differently from its busy state", () => {
    const en = readFileSync(
      new URL("../src/i18n/locales/en.ts", import.meta.url),
      "utf8",
    );

    expect(en).toContain('"settings.reconnect_server": "Reconnect server"');
    expect(en).toContain('"settings.reconnecting": "Reconnecting..."');
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
