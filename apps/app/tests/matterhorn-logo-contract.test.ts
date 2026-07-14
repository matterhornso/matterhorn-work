import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

describe("Matterhorn logo asset contract", () => {
  test("web tabs prefer the Matterhorn logo asset before legacy favicons", () => {
    const index = readRepoFile("apps/app/index.html");

    const fullMatterhornIconIndex = index.indexOf('href="/matterhorn-logo.png?v=20260712b"');
    const matterhornIconIndex = index.indexOf('href="/matterhorn-logo-square.svg?v=20260712b"');
    const legacyFaviconIndex = index.indexOf('href="/favicon-32x32.png?v=20260712b"');

    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(fullMatterhornIconIndex).toBeGreaterThan(0);
    expect(matterhornIconIndex).toBeGreaterThan(0);
    expect(legacyFaviconIndex).toBeGreaterThan(matterhornIconIndex);
    expect(matterhornIconIndex).toBeGreaterThan(fullMatterhornIconIndex);
    expect(index).toContain('<title>Matterhorn Work</title>');
  });

  test("web app manifest advertises Matterhorn icons", () => {
    const manifest = JSON.parse(readRepoFile("apps/app/public/site.webmanifest")) as {
      name: string;
      short_name: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifest.name).toBe("Matterhorn Work");
    expect(manifest.short_name).toBe("Matterhorn");
    expect(manifest.icons).toContainEqual({
      src: "/matterhorn-logo.png?v=20260712b",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    });
    expect(manifest.icons.some((icon) => icon.src === "/favicon-32x32.png?v=20260712b")).toBe(true);
  });

  test("desktop packaging points to Matterhorn icon assets", () => {
    const builder = readRepoFile("apps/desktop/electron-builder.yml");

    expect(builder).toContain("productName: Matterhorn");
    expect(builder).toContain("icon: resources/icons/icon.icns");
    expect(builder).toContain("icon: resources/icons/icon.png");
    expect(builder).toContain("icon: resources/icons/icon.ico");
    expect(existsSync(new URL("../../../apps/desktop/resources/icons/icon.png", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../apps/desktop/resources/icons/icon.icns", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../../../apps/desktop/resources/icons/icon.ico", import.meta.url))).toBe(true);
  });

  test("browser notifications use the Matterhorn logo instead of the legacy favicon", () => {
    const notifications = readReactSource("domains/wallet/lib/notifications.ts");

    expect(notifications).toContain('const NOTIFICATION_ICON = "/matterhorn-logo.png";');
    expect(notifications).not.toContain('const NOTIFICATION_ICON = "/favicon.ico";');
  });
});
