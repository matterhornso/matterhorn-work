import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactSource(path: string) {
  return readFileSync(
    new URL(`../src/react-app/${path}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
}

describe("Web update settings contract", () => {
  test("keeps desktop update actions disabled in the web app", () => {
    const source = readReactSource("domains/settings/pages/updates-view.tsx");

    expect(source).toContain(
      "const updateChecksUnavailable = props.webDeployment",
    );
    expect(source).toContain("props.busy || updateChecksUnavailable");
    expect(source).toContain('? "Desktop updates"');
    expect(source).toContain(
      'props.webDeployment ? t("settings.updates_desktop_only")',
    );
    expect(source).toContain(
      '!props.webDeployment && updateState === "error" && updateErrorMessage',
    );
  });
});
