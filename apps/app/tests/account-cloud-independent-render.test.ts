import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Keep the session mock in a child process: shared test workers must retain the
// real provider and auth client for the account-lifetime suites.
function renderAccount(options: { compact: boolean; cloud: boolean; signedIn?: boolean; authError?: string }) {
  const page = fileURLToPath(new URL("../src/react-app/domains/settings/pages/cloud-account-view.tsx", import.meta.url));
  const provider = fileURLToPath(new URL("../src/react-app/domains/settings/cloud/cloud-session-provider.tsx", import.meta.url));
  const den = fileURLToPath(new URL("../src/app/lib/den.ts", import.meta.url));
  const result = Bun.spawnSync({
    cmd: [process.execPath, "--eval", `
      import * as React from "react";
      import { mock } from "bun:test";
      import { renderToStaticMarkup } from "react-dom/server";
      import { MemoryRouter } from "react-router";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      const options = ${JSON.stringify(options)};
      const { createDenClient, MATTERHORN_CLOUD_ENABLED } = await import(${JSON.stringify(den)});
      if (MATTERHORN_CLOUD_ENABLED) throw new Error("Fixture requires Cloud disabled");
      const user = { id: "account-fixture", email: "profile@example.invalid", name: "Profile Fixture" };
      mock.module(${JSON.stringify(provider)}, () => ({ useCloudSession: () => ({
        user: options.signedIn === false ? null : user,
        isSignedIn: options.signedIn !== false,
        activeOrganization: null,
        statusMessage: null,
        client: createDenClient({ baseUrl: "http://localhost:1" }),
      }) }));
      const { CloudAccountView } = await import(${JSON.stringify(page)});
      const noop = () => {};
      const session = {
        authBusy: false, authError: options.authError || null,
        baseUrlDraft: "", baseUrlError: null, needsOrgSelection: true,
        orgs: [{ id: "org-fixture", name: "Optional Cloud Organization", slug: "fixture", role: "owner" }],
        orgsBusy: false, orgsError: "Optional organization lookup failed",
        sessionBusy: false, summaryLabel: "Connected", summaryTone: "ready",
        onActiveOrgChange: noop, onApplyBaseUrl: noop, onBaseUrlDraftChange: noop,
        onClearAuthError: noop, onOpenBrowserAuth: noop, onOpenControlPlane: noop,
        onRefreshOrgs: noop, onResetBaseUrl: noop, onSessionEnded: noop,
        onSignOut: noop, onSubmitManualAuth: async () => false,
      };
      const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const tree = React.createElement(QueryClientProvider, { client: queries },
        React.createElement(MemoryRouter, null,
          React.createElement(CloudAccountView, { compact: options.compact, developerMode: options.cloud, session })));
      process.stdout.write(renderToStaticMarkup(tree));
      queries.clear();
    `],
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, VITE_MATTERHORN_CLOUD_ENABLED: "0", VITE_DEN_BASE_URL: "", VITE_MATTERHORN_DEN_BASE_URL: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

describe("Account is independent of optional Cloud services", () => {
  for (const compact of [false, true]) {
    test(`renders identity and sign-out without Cloud in ${compact ? "compact" : "full"} profile`, () => {
      const html = renderAccount({ compact, cloud: false });
      expect(html).toContain("Profile Fixture");
      expect(html).toContain("profile@example.invalid");
      expect(html).toContain("Sign out");
      expect(html).not.toContain("Optional Cloud Organization");
      expect(html).not.toContain("Optional organization lookup failed");
      expect(html).not.toContain("Select an organization");
      expect(html).not.toContain("Create account");
    });

    test(`preserves explicitly enabled organization controls in ${compact ? "compact" : "full"} profile`, () => {
      const html = renderAccount({ compact, cloud: true });
      expect(html).toContain("Sign out");
      expect(html).toContain("Optional Cloud Organization");
      expect(html).toContain("Select an organization");
    });

    test(`announces failed sign-out without hiding identity in ${compact ? "compact" : "full"} profile`, () => {
      const html = renderAccount({ compact, cloud: false, authError: "Your session is still active." });
      expect(html).toContain('role="alert"');
      expect(html).toContain("Your session is still active.");
      expect(html).toContain("Sign out");
    });
  }

  test("does not expose optional Cloud authentication for a signed-out local profile", () => {
    const html = renderAccount({ compact: false, cloud: false, signedIn: false });
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Create account");
    expect(html).not.toContain("Select an organization");
  });
});
