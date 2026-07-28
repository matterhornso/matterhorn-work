import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import type { MatterhornDataStoreDescriptor } from "@matterhorn-work/types/backend-capabilities";
import {
  getInitialThemeMode,
  setThemeMode,
  subscribeToTheme,
} from "../src/app/theme";
import { settingsStorageLocationLabel } from "../src/react-app/domains/settings/state/privacy-display";

function readAppSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
}

function store(
  scope: MatterhornDataStoreDescriptor["scope"],
): MatterhornDataStoreDescriptor {
  return {
    id: scope,
    status: "working",
    label: scope,
    scope,
    path: "/Users/private-user/Documents/private-repository/notes",
    paths: ["/Users/private-user/Documents/private-repository/outputs"],
    containsUserContent: true,
    containsSecrets: "never",
    retention: "user_controlled",
    exportable: true,
    deletable: true,
  };
}

describe("Settings state and privacy contracts", () => {
  test.each([
    ["opencode_runtime", "Local chat history"],
    ["workspace", "Project files"],
    ["machine_global", "Local app data"],
    ["matterhorn_cloud", "Matterhorn Cloud"],
    ["unknown", "Location unavailable"],
  ] as const)("redacts %s storage paths", (scope, expected) => {
    const label = settingsStorageLocationLabel(store(scope));

    expect(label).toBe(expected);
    expect(label).not.toContain("/");
    expect(label).not.toContain("private-user");
    expect(label).not.toContain("private-repository");
  });

  test("Settings Overview only renders semantic storage labels", () => {
    const source = readAppSource("domains/settings/pages/overview-view.tsx");

    expect(source).toContain("settingsStorageLocationLabel(store)");
    expect(source).toContain(
      "settingsStorageLocationLabel( workspaceDataMap.stores.notes, )",
    );
    expect(source).not.toContain("storageLocationLabel(store)");
    expect(source).not.toContain("store.path");
    expect(source).not.toContain("store.paths");
  });

  test("Generated Media only renders semantic storage labels", () => {
    const source = readAppSource(
      "domains/settings/pages/generated-media-view.tsx",
    );

    expect(source).toContain("settingsStorageLocationLabel(store.store)");
    expect(source).not.toContain("storageLocationLabel(store.store)");
  });

  test("Overview and Appearance consume the same reactive theme store", () => {
    const hookSource = readAppSource(
      "domains/settings/state/settings-theme.ts",
    );
    const overviewSource = readAppSource(
      "domains/settings/pages/overview-view.tsx",
    );
    const appearanceSource = readAppSource(
      "domains/settings/appearance/theme-section.tsx",
    );

    expect(hookSource).toContain("useSyncExternalStore( subscribeToTheme");
    expect(hookSource).toContain("getInitialThemeMode");
    expect(hookSource).toContain("return [themeMode, setThemeMode] as const");
    expect(overviewSource).toContain(
      "const [theme, onThemeChange] = useSettingsThemeMode()",
    );
    expect(appearanceSource).toContain(
      "const [themeMode, setThemeMode] = useSettingsThemeMode()",
    );
    expect(appearanceSource).toContain(
      'interface ThemeSectionProps extends Pick<AppearanceViewProps, "busy">',
    );
    expect(appearanceSource).toContain("themeMode={themeMode}");
    expect(appearanceSource).toContain("setThemeMode={setThemeMode}");
  });

  test("the shared theme store notifies every Settings subscriber immediately", () => {
    const initial = getInitialThemeMode();
    const observed: string[] = [];
    const unsubscribeOverview = subscribeToTheme(() =>
      observed.push(`overview:${getInitialThemeMode()}`),
    );
    const unsubscribeAppearance = subscribeToTheme(() =>
      observed.push(`appearance:${getInitialThemeMode()}`),
    );

    try {
      setThemeMode(initial === "dark" ? "light" : "dark");
      expect(observed).toEqual([
        `overview:${getInitialThemeMode()}`,
        `appearance:${getInitialThemeMode()}`,
      ]);
    } finally {
      unsubscribeOverview();
      unsubscribeAppearance();
      setThemeMode(initial);
    }
  });
});
