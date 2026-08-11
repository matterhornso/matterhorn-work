import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  );
}

describe("AI provider UI contract", () => {
  test("does not present an empty catalog while connected models are still loading", () => {
    const pickerSource = readReactSource(
      "domains/session/modals/model-picker-modal.tsx",
    );
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(pickerSource).toContain("Loading available models...");
    expect(pickerSource).toContain(
      "props.loading && providerGroups.length === 0",
    );
    expect(routeSource).toContain("setModelOptionsLoading(true)");
    expect(routeSource).toContain("setModelOptionsLoading(false)");
    expect(routeSource).toContain("loading={modelOptionsLoading}");
  });

  test("uses backend catalog truth while the direct provider store catches up", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");

    expect(viewSource).toContain("catalog?.providers ?? []");
    expect(viewSource).toContain("catalogProviderById.get(provider.id)");
    expect(viewSource).toContain("Checking models...");
    expect(viewSource).toContain("Checking model provider");
    expect(viewSource).toContain("Loading the models managed for this workspace.");
    expect(viewSource).toContain("Checking availability...");
    expect(viewSource).toContain("provider.modelCount");
    expect(viewSource).toContain("countConnectedCatalogModels(catalog)");
    expect(viewSource).not.toContain(
      "catalog?.serverFetched ? catalog.modelCount",
    );
  });

  test("keeps provider availability focused on user actions", () => {
    const summarySource = readReactSource(
      "domains/settings/state/model-readiness-summary.ts",
    );

    expect(summarySource).toContain("connectedOnly?: boolean");
    expect(summarySource).toContain("privacyPolicies?:");
    expect(summarySource).toContain("connectedOnly: true");
    expect(summarySource).toContain("privacyPolicies:");
    expect(summarySource).toContain("countConnectedCatalogModels");
    expect(summarySource).toContain("more provider");
    expect(summarySource).toContain("Connect a provider before chats and desk tasks can start.");
  });

  test("shows provider privacy at model setup and beside the composer", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");
    const routeSource = readReactSource("shell/session-route.tsx");
    const surfaceSource = readReactSource(
      "domains/session/surface/session-surface.tsx",
    );

    expect(viewSource).toContain("modelReadiness.providerPrivacy");
    expect(viewSource).toContain("Review provider policy");
    expect(surfaceSource).toContain(
      "Matterhorn does not use prompts to train models.",
    );
    expect(surfaceSource).toContain("Privacy details");
    expect(surfaceSource).toContain("props.onOpenPrivacyDetails");
    expect(surfaceSource).not.toContain('href="/privacy"');
    expect(routeSource).toContain('handleOpenSettings("/settings/privacy")');
    expect(surfaceSource).toContain(
      "props.providerPrivacyPolicy?.allowed === false",
    );
  });

  test("connect-provider recovery from the picker opens the real provider flow", () => {
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(routeSource).toContain("onOpenSettings={() => {");
    expect(routeSource).toContain("handleOpenProviderAuth();");
  });

  test("does not advertise Matterhorn Cloud model subscriptions in a local-only build", () => {
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(routeSource).toContain("MATTERHORN_CLOUD_ENABLED &&");
    expect(routeSource).toContain(
      "showOpenWorkModelsSubscribe={showOpenWorkModelsSubscribe}",
    );
  });

  test("separates a ready model provider from a catalog-only entry", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");
    const summarySource = readReactSource(
      "domains/settings/state/model-readiness-summary.ts",
    );
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(viewSource).toContain("isMatterhornManagedProvider");
    expect(viewSource).toContain("<LayoutSectionTitle>Model provider</LayoutSectionTitle>");
    expect(viewSource).toContain("<LayoutSectionTitle>Available models</LayoutSectionTitle>");
    expect(viewSource).toContain("<LayoutSectionTitle>Model providers</LayoutSectionTitle>");
    expect(viewSource).toContain("Connected model catalog");
    expect(viewSource).toContain("Browse models");
    expect(viewSource).toContain("Choose provider");
    expect(viewSource).toContain("Provider and data details");
    expect(viewSource).toContain("A model catalog is only a list.");
    expect(viewSource).not.toContain('"Included models ready"');
    expect(viewSource).not.toContain('label="Included"');
    expect(viewSource).not.toContain("Matterhorn Models");
    expect(summarySource).toContain("resolveProviderDisplayName");
    expect(routeSource).toContain(
      "resolveProviderDisplayName(provider.id, provider.name)",
    );
  });

  test("keeps setup in one clear provider section until a model is ready", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");

    expect(viewSource).toContain(
      "Connect a provider below, then choose a model for chats and desk tasks.",
    );
    expect(viewSource).not.toContain(
      'props.cudosBusy ? "Opening..." : "Connect ASI:Cloud"',
    );
    expect(viewSource).toContain('"Add CUDOS API key"');
    expect(viewSource).toContain('"Update CUDOS key"');
  });

  test("starts provider setup with a focused set and keeps the long tail deliberate", () => {
    const modalSource = readReactSource(
      "domains/connections/provider-auth/provider-auth-modal.tsx",
    );

    expect(modalSource).toContain("RECOMMENDED_PROVIDER_IDS");
    expect(modalSource).toContain("Recommended providers");
    expect(modalSource).toContain("Browse all providers");
    expect(modalSource).toContain("Search all providers");
    expect(modalSource).toContain("Add a model provider");
  });

  test("uses the Matterhorn brand mark for the included model catalog", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");
    const providerIconSource = readReactSource(
      "design-system/provider-icon.tsx",
    );

    expect(viewSource).toContain("providerName={providerName}");
    expect(providerIconSource).toContain(
      'const isMatterhorn = hasProviderFamily("matterhorn")',
    );
    expect(providerIconSource).toContain(
      'src="/matterhorn-logo-square.svg"',
    );
  });

  test("shows a bounded free-beta allowance without implying automatic billing", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");
    const sessionSource = readReactSource("domains/session/surface/session-surface.tsx");
    const clientSource = readFileSync(
      new URL("../src/app/lib/matterhorn-server.ts", import.meta.url),
      "utf8",
    );

    expect(viewSource).toContain("Free beta allowance");
    expect(viewSource).toContain("There are no automatic charges.");
    expect(viewSource).toContain("Requests pause when an allowance is reached.");
    expect(viewSource).toContain("workspaceModelUsageStatus");
    expect(clientSource).toContain("/model-usage/status");
    expect(clientSource).toContain("/model-usage/reconcile");
    expect(sessionSource).toContain("reconcileWorkspaceModelUsage");
  });
});
