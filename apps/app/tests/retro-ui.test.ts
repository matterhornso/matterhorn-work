import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyRetroUi, resolveRetroUi } from "../src/app/lib/retro-ui";
import { resolveMinimalUi } from "../src/app/lib/minimal-ui";

describe("retro visual rollout", () => {
  test("defaults to retro with an explicit visual rollback", () => {
    expect(resolveRetroUi(undefined)).toBe(true);
    for (const value of ["0", "false", false, true, "yes"])
      expect(resolveRetroUi({ VITE_MATTERHORN_RETRO_UI: value })).toBe(false);
    for (const value of [undefined, "", "1", "true"]) {
      const env = { VITE_MATTERHORN_RETRO_UI: value };
      expect(resolveRetroUi(env)).toBe(true);
      expect(resolveMinimalUi(env)).toBe(true);
    }
  });

  test("public first paint and Docker rollout use the same release switch", () => {
    const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    const docker = readFileSync(new URL("../../../packaging/docker/Dockerfile.public-beta-web", import.meta.url), "utf8");
    expect(vite).toContain("retroUiBuild = resolveRetroUi(config.env)");
    expect(docker).toContain("ARG VITE_MATTERHORN_RETRO_UI=1");
    expect(docker).toContain("ENV VITE_MATTERHORN_RETRO_UI=${VITE_MATTERHORN_RETRO_UI}");
  });

  test("rollback removes only the visual marker and does not touch theme or data", () => {
    const attributes = new Map([["data-theme", "dark"]]);
    const root = {
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
    };
    applyRetroUi(root, true);
    expect(attributes.get("data-matterhorn-ui")).toBe("retro");
    applyRetroUi(root, false);
    expect([...attributes]).toEqual([["data-theme", "dark"]]);
  });

  test("both entrypoints initialize the same root marker", () => {
    for (const file of ["index.bootstrap.ts", "overlay/index.tsx"]) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      expect(source).toContain("applyRetroUi(document.documentElement)");
    }
  });

  test("settings navigation inherits light and dark tokens instead of fixed dark styling", () => {
    const source = readFileSync(new URL("../src/react-app/domains/settings/shell/settings-page.tsx", import.meta.url), "utf8");
    expect(source).toContain("style={RETRO_UI ? undefined : SETTINGS_SIDEBAR_STYLE}");
    expect(source).toContain("text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground");
  });

  test("retro styling is scoped and retains errors, focus and reduced motion", () => {
    const css = readFileSync(new URL("../src/styles/retro.css", import.meta.url), "utf8");
    expect(css).toContain('html[data-matterhorn-ui="retro"]');
    expect(css).toContain('[aria-invalid="true"]');
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).not.toContain("!important");
    expect(css).not.toContain("linear-gradient");
  });

  test("light and dark core text pairs meet AA contrast", () => {
    const css = readFileSync(new URL("../src/styles/retro.css", import.meta.url), "utf8");
    const light = css.split('html[data-matterhorn-ui="retro"] {')[1].split("}")[0];
    const dark = css.split('html[data-matterhorn-ui="retro"]:is([data-theme="dark"], .dark) {')[1].split("}")[0];
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map(offset => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const theme of [light, dark]) {
      const colors = new Map([...theme.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map(match => [match[1], match[2]]));
      for (const [fg, bg] of [
        ["retro-ink", "retro-paper"], ["retro-ink", "retro-panel"],
        ["retro-muted", "retro-paper"], ["retro-muted", "retro-panel"],
        ["retro-muted", "retro-subtle"], ["retro-action-text", "retro-action"],
        ["retro-action-text", "retro-action-hover"],
        ["retro-selection-text", "retro-selection"], ["destructive", "retro-panel"],
        ["warning", "retro-panel"],
        ["retro-success", "retro-panel"], ["retro-success", "retro-paper"],
      ]) {
        const text = colors.get(fg), surface = colors.get(bg);
        if (!text || !surface) throw new Error(`Missing color pair ${fg}/${bg}`);
        const a = luminance(text), b = luminance(surface);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
