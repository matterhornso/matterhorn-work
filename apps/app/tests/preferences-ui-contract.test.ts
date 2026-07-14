import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Preferences workspace setting contract", () => {
  test("keeps auto compaction inert until live workspace config is available", () => {
    const viewSource = readReactSource("domains/settings/pages/preferences-view.tsx");
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(viewSource).toContain("autoCompactContextReady");
    expect(viewSource).toContain("Loading workspace setting...");
    expect(viewSource).toContain("Loading auto context compaction setting");
    expect(viewSource).toContain("Auto context compaction unavailable");
    expect(viewSource).toContain("props.autoCompactContextReady ? (");
    expect(routeSource).toContain("setAutoCompactContextLoaded(false)");
    expect(routeSource).toContain("Could not read this setting from the workspace engine.");
    expect(routeSource).toContain("autoCompactContextBusy || !autoCompactContextLoaded");
  });

  test("rolls back failed writes and explains the failure", () => {
    const routeSource = readReactSource("shell/settings-route.tsx");

    expect(routeSource).toContain("setAutoCompactContext(!next)");
    expect(routeSource).toContain("Could not save this setting. Check the workspace connection and try again.");
    expect(routeSource).toContain("autoCompactContextError={autoCompactContextError}");
  });
});
