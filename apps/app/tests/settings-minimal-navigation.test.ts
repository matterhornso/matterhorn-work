import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isPublicBetaWebDeployment } from "../src/app/lib/matterhorn-deployment";
import {
  getCloudSettingsTabs,
  getGlobalSettingsTabs,
  getMinimalSettingsGroups,
  getWorkspaceSettingsTabs,
  MINIMAL_SETTINGS_GROUPS,
} from "../src/react-app/domains/settings/shell/settings-page";

describe("minimal settings destination parity", () => {
  for (const developerMode of [false, true]) {
    test(`retains each available legacy destination with developer mode ${developerMode}`, () => {
      const groups = getMinimalSettingsGroups(developerMode);
      const tabs = groups.flatMap((group) => group.tabs);
      expect(groups.slice(0, 4)).toEqual(MINIMAL_SETTINGS_GROUPS);
      expect(groups.at(-1)?.label).toBe("More settings");
      expect(new Set(tabs).size).toBe(tabs.length);
      for (const tab of ["general", ...getWorkspaceSettingsTabs(developerMode), ...getGlobalSettingsTabs(developerMode), ...getCloudSettingsTabs(developerMode)]) {
        expect(tabs).toContain(tab);
      }
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
    expect(source).toContain("MINIMAL_UI ? getMinimalSettingsGroups(props.developerMode) : allSections");
  });
});
