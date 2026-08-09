import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dir, "../src");
const appCss = readFileSync(resolve(appRoot, "app/index.css"), "utf8");
const reloadToast = readFileSync(
  resolve(appRoot, "react-app/domains/shell-feedback/reload-workspace-toast.tsx"),
  "utf8",
);
const providerToast = readFileSync(
  resolve(appRoot, "react-app/shell/new-providers-toast.tsx"),
  "utf8",
);
const layeredSurfaces = [
  ["dropdown", "react-app/design-system/select-menu.tsx"],
  ["tooltip", "react-app/design-system/flyout-item.tsx"],
  ["modal", "react-app/shell/loading-overlay.tsx"],
  ["coachmark", "react-app/shell/control/control-provider.tsx"],
  ["diagnostics", "react-app/shell/react-render-watchdog-overlay.tsx"],
  ["diagnostics", "react-app/shell/dev-profiler.tsx"],
  ["modal", "react-app/domains/wallet/components/CommandPalette.tsx"],
] as const;

describe("semantic overlay layering", () => {
  test("defines an ordered product layer scale", () => {
    const layerValues = [
      "dropdown",
      "sticky",
      "modal-backdrop",
      "modal",
      "coachmark",
      "toast",
      "tooltip",
      "diagnostics",
    ].map((name) => {
      const match = appCss.match(new RegExp(`--matterhorn-layer-${name}:\\s*(\\d+);`));
      expect(match, `missing ${name} layer`).not.toBeNull();
      return Number(match?.[1]);
    });

    expect(layerValues).toEqual([...layerValues].sort((a, b) => a - b));
    expect(new Set(layerValues).size).toBe(layerValues.length);
  });

  test("recovery and provider toasts use the semantic toast layer", () => {
    for (const source of [reloadToast, providerToast]) {
      expect(source).toContain("z-[var(--matterhorn-layer-toast)]");
      expect(source).not.toContain("z-[9999]");
    }
  });

  test("product overlays use named layers instead of literal z-index values", () => {
    for (const [layer, relativePath] of layeredSurfaces) {
      const source = readFileSync(resolve(appRoot, relativePath), "utf8");
      expect(source).toContain(`z-[var(--matterhorn-layer-${layer})]`);
      expect(source).not.toMatch(/z-\[\d+\]/);
    }
  });
});
