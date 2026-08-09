import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(
  new URL("../src/react-app/shell/settings-route.tsx", import.meta.url),
  "utf8",
);

describe("settings route stability", () => {
  test("declares tab callbacks before redirect returns", () => {
    const callbackIndex = source.indexOf("const openExtensionDetail = useCallback");
    const redirectIndex = source.indexOf("if (route.redirectPath && !props.embedded)");

    expect(callbackIndex).toBeGreaterThan(-1);
    expect(redirectIndex).toBeGreaterThan(-1);
    expect(callbackIndex).toBeLessThan(redirectIndex);
  });

  test("isolates each settings tab with the shared surface error boundary", () => {
    expect(source).toContain('import { SurfaceErrorBoundary } from "./surface-error-boundary"');
    expect(source).toContain("resetKey={route.tab}");
    expect(source).toContain('source={`SettingsRoute:${route.tab}`}');
    expect(source).toContain("<Suspense");
    expect(source).toContain("{settingsView}\n          </Suspense>\n        </SurfaceErrorBoundary>");
  });
});
