import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MATTERHORN_SECURITY_REPORT_URL,
  MATTERHORN_SUPPORT_EMAIL,
  PUBLIC_TRUST_PATHS,
  isPublicTrustPath,
  shouldGatePublicWebEntry,
} from "../src/react-app/domains/public/public-trust-content";

const appRootSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/shell/app-root.tsx"),
  "utf8",
);
const entrySource = readFileSync(
  resolve(import.meta.dir, "../src/index.react.tsx"),
  "utf8",
);
const trustRouteSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/domains/public/public-trust-route.tsx"),
  "utf8",
);
const publicTrustBootstrapSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/shell/public-trust-bootstrap.tsx"),
  "utf8",
);

describe("public trust routes", () => {
  test("publishes the complete launch trust surface", () => {
    expect(PUBLIC_TRUST_PATHS).toEqual([
      "/privacy",
      "/terms",
      "/security",
      "/support",
      "/status",
    ]);
    for (const path of PUBLIC_TRUST_PATHS) {
      expect(isPublicTrustPath(path)).toBe(true);
      expect(isPublicTrustPath(`${path}/`)).toBe(true);
      expect(appRootSource).toContain(`path="${path}"`);
    }
  });

  test("does not treat arbitrary application routes as public trust pages", () => {
    expect(isPublicTrustPath("/session")).toBe(false);
    expect(isPublicTrustPath("/settings/security")).toBe(false);
    expect(isPublicTrustPath("/privacy/export")).toBe(false);
  });

  test("bypasses the outer public-web sign-in bootstrap only for trust pages", () => {
    for (const pathname of PUBLIC_TRUST_PATHS) {
      expect(shouldGatePublicWebEntry({
        publicBetaWeb: true,
        requireSignin: true,
        pathname,
      })).toBe(false);
    }

    expect(shouldGatePublicWebEntry({
      publicBetaWeb: true,
      requireSignin: true,
      pathname: "/session",
    })).toBe(true);
    expect(shouldGatePublicWebEntry({
      publicBetaWeb: false,
      requireSignin: true,
      pathname: "/session",
    })).toBe(false);
    expect(shouldGatePublicWebEntry({
      publicBetaWeb: true,
      requireSignin: false,
      pathname: "/session",
    })).toBe(true);
  });

  test("keeps trust pages outside the forced sign-in block", () => {
    expect(appRootSource).toContain("if (isPublicTrustPath(path)) return;");
    expect(appRootSource).toContain("!isPublicTrustPath(location.pathname)");
    expect(entrySource).toContain("shouldGatePublicWebEntry({");
  });

  test("serves direct trust routes above the authenticated application boundary", () => {
    expect(entrySource).toContain("const publicTrustEntry = isPublicTrustPath(window.location.pathname)");
    expect(entrySource).toContain('import("./react-app/shell/public-trust-bootstrap")');
    expect(entrySource).toContain("if (publicTrustEntry)");
    expect(publicTrustBootstrapSource).toContain("<BrowserRouter>");
    expect(publicTrustBootstrapSource).toContain("<PublicTrustRoute />");
    expect(publicTrustBootstrapSource).not.toContain("AppProviders");
    expect(publicTrustBootstrapSource).not.toContain("QueryClientProvider");
  });

  test("uses Matterhorn public identity and safe support channels", () => {
    expect(MATTERHORN_SUPPORT_EMAIL).toBe("updates@matterhorn.so");
    expect(MATTERHORN_SECURITY_REPORT_URL).toContain("security/advisories/new");
    expect(trustRouteSource).toContain("Matterhorn Desks");
    expect(trustRouteSource).not.toMatch(/\bOpenWork\b|\bOpenCode\b/);
  });

  test("keeps public trust navigation usable at the 320px launch floor", () => {
    expect(trustRouteSource).toContain("grid-cols-[minmax(0,1fr)]");
    expect(trustRouteSource).toContain('<aside className="min-w-0">');
    expect(trustRouteSource).toContain('className="flex flex-wrap gap-1 md:flex-col"');
    expect(trustRouteSource).toContain("inline-flex min-h-11 shrink-0 items-center");
    expect(trustRouteSource).toContain("-ml-2 mb-4 inline-flex min-h-11 items-center");
  });

  test("status checks use same-origin redacted health endpoints", () => {
    expect(trustRouteSource).toContain('probeHealth("/health/live")');
    expect(trustRouteSource).toContain('probeHealth("/health/ready")');
    expect(trustRouteSource).toContain('credentials: "same-origin"');
    expect(trustRouteSource).toContain('cache: "no-store"');
    expect(trustRouteSource).toContain("Checks whether the API process can answer requests.");
    expect(trustRouteSource).toContain("Checks storage, workspace routing, and authorization readiness.");
    expect(trustRouteSource).not.toContain("The API process is running and can answer requests.");
    expect(trustRouteSource).not.toContain("Storage, workspace routing, and authorization are ready.");
    expect(trustRouteSource).not.toContain("dangerouslySetInnerHTML");
  });
});
