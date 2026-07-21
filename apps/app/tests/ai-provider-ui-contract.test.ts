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
    expect(viewSource).toContain("Checking provider connections");
    expect(viewSource).toContain("provider.modelCount");
    expect(viewSource).toContain("countConnectedCatalogModels(catalog)");
    expect(viewSource).not.toContain(
      "catalog?.serverFetched ? catalog.modelCount",
    );
  });

  test("keeps technical model details scoped to connected providers", () => {
    const summarySource = readReactSource(
      "domains/settings/state/model-readiness-summary.ts",
    );

    expect(summarySource).toContain(
      "options: { connectedOnly?: boolean } = {}",
    );
    expect(summarySource).toContain(
      "buildModelCatalogRows(catalog, { connectedOnly: true })",
    );
    expect(summarySource).toContain("countConnectedCatalogModels");
    expect(summarySource).toContain("available through Connect provider");
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

  test("presents the bundled runtime as included Matterhorn models instead of a disconnectable account", () => {
    const viewSource = readReactSource("domains/settings/pages/ai-view.tsx");
    const summarySource = readReactSource(
      "domains/settings/state/model-readiness-summary.ts",
    );
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(viewSource).toContain("isMatterhornManagedProvider");
    expect(viewSource).toContain('"Included model service"');
    expect(viewSource).toContain('label="Included"');
    expect(viewSource).toContain('"Included models ready"');
    expect(summarySource).toContain("resolveProviderDisplayName");
    expect(routeSource).toContain(
      "resolveProviderDisplayName(provider.id, provider.name)",
    );
  });
});
