import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MATTERHORN_SECURITY_REPORT_URL,
  MATTERHORN_SUPPORT_EMAIL,
  PUBLIC_TRUST_PATHS,
  isPublicTrustPath,
} from "../src/react-app/domains/public/public-trust-content";

const appRootSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/shell/app-root.tsx"),
  "utf8",
);
const trustRouteSource = readFileSync(
  resolve(import.meta.dir, "../src/react-app/domains/public/public-trust-route.tsx"),
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

  test("keeps trust pages outside the forced sign-in block", () => {
    expect(appRootSource).toContain("if (isPublicTrustPath(path)) return;");
    expect(appRootSource).toContain("!isPublicTrustPath(location.pathname)");
  });

  test("uses Matterhorn public identity and safe support channels", () => {
    expect(MATTERHORN_SUPPORT_EMAIL).toBe("support@matterhorn.work");
    expect(MATTERHORN_SECURITY_REPORT_URL).toContain("security/advisories/new");
    expect(trustRouteSource).toContain("Matterhorn Desks");
    expect(trustRouteSource).not.toMatch(/\bOpenWork\b|\bOpenCode\b/);
  });

  test("status checks use same-origin redacted health endpoints", () => {
    expect(trustRouteSource).toContain('probeHealth("/health/live")');
    expect(trustRouteSource).toContain('probeHealth("/health/ready")');
    expect(trustRouteSource).toContain('credentials: "same-origin"');
    expect(trustRouteSource).toContain('cache: "no-store"');
    expect(trustRouteSource).not.toContain("dangerouslySetInnerHTML");
  });
});
