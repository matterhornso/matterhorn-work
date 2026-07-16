import { describe, expect, test } from "bun:test";

const denSource = await Bun.file(new URL("../src/app/lib/den.ts", import.meta.url)).text();
const accountSource = await Bun.file(
  new URL("../src/react-app/domains/settings/pages/cloud-account-view.tsx", import.meta.url),
).text();
const cloudProvidersSource = await Bun.file(
  new URL("../src/react-app/domains/settings/pages/cloud-providers-view.tsx", import.meta.url),
).text();
const launchPolicySource = await Bun.file(
  new URL("../src/app/lib/launch-features.ts", import.meta.url),
).text();
const settingsPageSource = await Bun.file(
  new URL("../src/react-app/domains/settings/shell/settings-page.tsx", import.meta.url),
).text();
const settingsRouteSource = await Bun.file(
  new URL("../src/react-app/shell/settings-route.tsx", import.meta.url),
).text();

describe("Matterhorn Cloud availability contract", () => {
  test("requires explicit Cloud configuration instead of trusting the fallback hostname", () => {
    expect(denSource).toContain("EXPLICIT_DEN_BASE_URL");
    expect(denSource).toContain("VITE_MATTERHORN_CLOUD_ENABLED");
    expect(denSource).toContain("Boolean(EXPLICIT_DEN_BASE_URL)");
    expect(denSource).toContain("export const MATTERHORN_CLOUD_ENABLED");
  });

  test("keeps unavailable Cloud actions out while preserving the local Profile surface", () => {
    expect(accountSource).toContain("cloudAvailable");
    expect(accountSource).toContain("<ProfileCapabilityStatus");
    expect(accountSource).toContain("runtimeWorkspaceId?: string | null");
    expect(accountSource).toContain('const workspaceIdForBackend = runtimeWorkspaceId?.trim() ?? ""');
    expect(settingsRouteSource).toContain("runtimeWorkspaceId={runtimeWorkspaceId}");
    expect(accountSource).toContain("{cloudAvailable ? <SettingsSection>");
    expect(accountSource).toContain("{cloudAvailable ? <section");
    expect(launchPolicySource).toContain('if (tab === "cloud-account" && options.allowLocalProfile) return true;');
    expect(settingsRouteSource).toContain("{ allowLocalProfile: props.embedded }");
    expect(settingsPageSource).toContain("filterLaunchSettingsTabs");
  });

  test("keeps the Account surface focused on profile and Cloud state", () => {
    expect(accountSource).not.toContain("ProfileTaskLogSection");
    expect(accountSource).not.toContain("Recent task state from this workspace session.");
  });

  test("keeps unavailable team-provider sign-in actions out of AI settings", () => {
    expect(cloudProvidersSource).toContain("MATTERHORN_CLOUD_ENABLED");
    expect(cloudProvidersSource).toContain("Matterhorn Cloud provider sharing is not available in this build.");
  });
});
