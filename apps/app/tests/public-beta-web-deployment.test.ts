import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  isMatterhornPublicBetaWebDeployment,
  resolveMatterhornDeployment,
} from "../src/app/lib/matterhorn-deployment";

describe("public Beta web deployment", () => {
  test("prefers the Matterhorn deployment setting while preserving the legacy fallback", () => {
    expect(resolveMatterhornDeployment({
      VITE_MATTERHORN_DEPLOYMENT: "web",
      VITE_OPENWORK_DEPLOYMENT: "desktop",
    })).toBe("web");
    expect(resolveMatterhornDeployment({ VITE_OPENWORK_DEPLOYMENT: "web" })).toBe("web");
  });

  test("requires both web deployment and the explicit public Beta flag", () => {
    expect(isMatterhornPublicBetaWebDeployment({
      VITE_MATTERHORN_DEPLOYMENT: "web",
      VITE_MATTERHORN_PUBLIC_BETA: "true",
    })).toBe(true);
    expect(isMatterhornPublicBetaWebDeployment({
      VITE_MATTERHORN_DEPLOYMENT: "desktop",
      VITE_MATTERHORN_PUBLIC_BETA: "true",
    })).toBe(false);
    expect(isMatterhornPublicBetaWebDeployment({
      VITE_MATTERHORN_DEPLOYMENT: "web",
      VITE_MATTERHORN_PUBLIC_BETA: "0",
    })).toBe(false);
  });

  test("keeps direct server credentials out of public web desk requests", () => {
    const serverSettings = readFileSync(
      new URL("../src/app/lib/matterhorn-server.ts", import.meta.url),
      "utf8",
    );
    const protocolDesk = readFileSync(
      new URL("../src/react-app/domains/wallet/pages/BittensorPanel.tsx", import.meta.url),
      "utf8",
    );

    expect(serverSettings).toContain("Public web never persists a direct server target or bearer credentials.");
    expect(protocolDesk).toContain("isPublicBetaWebDeployment()");
    expect(protocolDesk).toContain('credentials: "same-origin"');
  });

  test("uses cookie-backed Cloud sign-in without accepting desktop handoff links", () => {
    const appEntry = readFileSync(
      new URL("../src/index.react.tsx", import.meta.url),
      "utf8",
    );
    const den = readFileSync(
      new URL("../src/app/lib/den.ts", import.meta.url),
      "utf8",
    );
    const remoteLinks = readFileSync(
      new URL("../src/react-app/shell/remote-connect-deep-links.tsx", import.meta.url),
      "utf8",
    );
    const sessionRoute = readFileSync(
      new URL("../src/react-app/shell/session-route.tsx", import.meta.url),
      "utf8",
    );
    const workspaceModal = readFileSync(
      new URL("../src/react-app/domains/workspace/create-workspace-modal.tsx", import.meta.url),
      "utf8",
    );

    expect(den).toContain('target.searchParams.set("returnTo", `${window.location.origin}/onboarding`)');
    expect(den).toContain('credentials: "include"');
    expect(den).toContain("Browser Cloud auth is cookie-backed");
    expect(appEntry).toContain('await import("./app/lib/den").then((denModule)');
    expect(appEntry).toContain("const publicTrustEntry = isPublicTrustPath(window.location.pathname)");
    expect(appEntry).toContain("const bootstrapConfig = publicTrustEntry");
    expect(appEntry).toContain("denModule.setDenBootstrapConfig(publicCloudConfig)");
    expect(remoteLinks).toContain("stripRemoteConnectQuery");
    expect(remoteLinks).toContain("if (isPublicBetaWebDeployment())");
    expect(sessionRoute).toContain("onConfirmRemote={publicBetaWeb ? undefined : handleCreateRemoteWorkspace}");
    expect(sessionRoute).toContain("onRecoverWorkspace: publicBetaWeb");
    expect(workspaceModal).toContain("Public web does not accept worker URLs or access tokens.");
  });

  test("keeps signed-out app routes behind sign-in while trust routes remain public", () => {
    const appRoot = readFileSync(
      new URL("../src/react-app/shell/app-root.tsx", import.meta.url),
      "utf8",
    );

    expect(appRoot).toContain("!isPublicTrustPath(location.pathname)");
    expect(appRoot).toContain("requireSignin &&");
    expect(appRoot).toContain('(denAuth.status === "checking" || !denAuth.isSignedIn)');
  });

  test("keeps Cloud connectivity failures actionable without exposing browser internals", () => {
    const denAuthProvider = readFileSync(
      new URL("../src/react-app/domains/cloud/den-auth-provider.tsx", import.meta.url),
      "utf8",
    );

    expect(denAuthProvider).toContain("function userFacingCloudSessionError");
    expect(denAuthProvider).toContain(
      "Matterhorn Cloud could not be reached. Check your connection and try again.",
    );
    expect(denAuthProvider).toContain("setError(userFacingCloudSessionError(nextError));");
  });

  test("removes hosted execution and global runtime controls", () => {
    const sessionRoute = readFileSync(
      new URL("../src/react-app/shell/session-route.tsx", import.meta.url),
      "utf8",
    );
    const legacySessionActions = readFileSync(
      new URL("../src/react-app/domains/session/sync/actions-store.ts", import.meta.url),
      "utf8",
    );
    const settingsRoute = readFileSync(
      new URL("../src/react-app/shell/settings-route.tsx", import.meta.url),
      "utf8",
    );
    const settingsPage = readFileSync(
      new URL("../src/react-app/domains/settings/shell/settings-page.tsx", import.meta.url),
      "utf8",
    );
    const globalSync = readFileSync(
      new URL("../src/react-app/kernel/global-sync-provider.tsx", import.meta.url),
      "utf8",
    );
    const serverClient = readFileSync(
      new URL("../src/app/lib/matterhorn-server.ts", import.meta.url),
      "utf8",
    );
    const sessionSurface = readFileSync(
      new URL("../src/react-app/domains/session/surface/session-surface.tsx", import.meta.url),
      "utf8",
    );

    expect(sessionRoute).toContain("Shell commands are unavailable in Matterhorn web workspaces.");
    expect(sessionRoute).toContain('draft.command.name.trim().toLowerCase() !== "compact"');
    expect(sessionRoute).toContain("await client.compactSession(");
    expect(legacySessionActions).toContain("if (isPublicBetaWebDeployment())");
    expect(settingsRoute).toContain("UNSUPPORTED_HOSTED_SETTINGS_TABS.has(launchRoute.tab)");
    expect(settingsPage).toContain('isPublicBetaWebDeployment() ? [] : ["shell" as const]');
    expect(settingsPage).toContain("developerMode && !isPublicBetaWebDeployment()");
    expect(globalSync).toContain("if (isPublicBetaWebDeployment()) return;");
    expect(serverClient).toContain("/sessions/${encodeURIComponent(sessionId)}/compact");
    expect(serverClient).toContain("sendAgentMessage:");
    expect(serverClient).toContain("/sessions/${encodeURIComponent(sessionId)}/messages");
    expect(sessionRoute).toContain("await client.sendAgentMessage(selectedWorkspaceId, selectedSessionId");
    expect(sessionRoute).toContain("await endpoint.client.sendAgentMessage(endpoint.workspaceId, session.id");
    expect(sessionRoute).toContain("!publicBetaWeb && options?.sendImmediately && selectedProviderPrivacyPolicy?.allowed === false");
    expect(sessionSurface).toContain("Public research can proceed; private context requires");
    expect(sessionSurface).toContain("(!publicBetaWeb && props.providerPrivacyPolicy?.allowed === false)");
    expect(sessionRoute).toContain("publicBetaWeb\n            ? Promise.resolve(undefined)");
  });
});
