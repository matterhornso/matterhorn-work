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

describe("semantic overlay layering", () => {
  test("defines an ordered product layer scale", () => {
    const layerValues = [
      "dropdown",
      "sticky",
      "modal-backdrop",
      "modal",
      "toast",
      "tooltip",
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
});
