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

    expect(den).toContain('target.searchParams.set("returnTo", `${window.location.origin}/session`)');
    expect(den).toContain('credentials: "include"');
    expect(den).toContain("Browser Cloud auth is cookie-backed");
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
});
