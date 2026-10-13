import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isPublicBetaWebDeployment } from "../src/app/lib/matterhorn-deployment";
import {
  getCloudSettingsTabs,
  getGlobalSettingsTabs,
  getWorkspaceSettingsTabs,
} from "../src/react-app/domains/settings/shell/settings-page";

describe("restored settings destination parity", () => {
  for (const developerMode of [false, true]) {
    test(`retains each available legacy destination with developer mode ${developerMode}`, () => {
      const tabs = ["general", ...getWorkspaceSettingsTabs(developerMode), ...getGlobalSettingsTabs(developerMode), ...getCloudSettingsTabs(developerMode)];
      expect(new Set(tabs).size).toBe(tabs.length);
      expect(tabs).toContain("cloud-account");
      expect(tabs).toContain("ai");
      for (const tab of ["advanced", "environment", "recovery", "debug", "marketplace", "billing", "cloud-workers", "generated-media"]) {
        expect(tabs).not.toContain(tab);
      }
      expect(tabs).toContain("wallet");
      expect(tabs).toContain("updates");
      expect(tabs.includes("shell")).toBe(!isPublicBetaWebDeployment());
    });
  }

  test("mobile and compact menus use the same gated destination groups", () => {
    const source = readFileSync(new URL("../src/react-app/domains/settings/shell/settings-shell.tsx", import.meta.url), "utf8");
    expect(source).toContain("allSections.filter((section) => section.tabs.length > 0)");
    expect(source).not.toContain("getMinimalSettingsGroups");
  });
});
