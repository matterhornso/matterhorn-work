import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Recovery settings UI", () => {
  test("shows release-unavailable diagnostics instead of dead destructive buttons", () => {
    const source = readAppSource("domains/settings/pages/recovery-view.tsx");
    const en = readFileSync(new URL("../src/i18n/locales/en.ts", import.meta.url), "utf8");

    expect(source).toContain("RecoveryActionUnavailable");
    expect(source).toContain("settings.recovery_action_unavailable");
    expect(en).toContain('"settings.recovery_action_unavailable": "Not available in this release"');
    expect(source).not.toContain("TODO: Restore");
    expect(source).not.toContain("onResetAppConfigDefaults()");
    expect(source).not.toContain("onRepairOpencodeCache()");
    expect(source).not.toContain("onCleanupOpenworkDockerContainers()");
    expect(source).not.toContain("TooltipTrigger");
  });
});
