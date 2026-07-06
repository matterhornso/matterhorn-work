import { readFileSync } from "node:fs";
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

    const matterhornIconIndex = index.indexOf('href="/matterhorn-logo-square.svg"');
    const legacyFaviconIndex = index.indexOf('href="/favicon-32x32.png"');

    expect(matterhornIconIndex).toBeGreaterThan(0);
    expect(legacyFaviconIndex).toBeGreaterThan(matterhornIconIndex);
    expect(index).toContain('<title>Matterhorn Work</title>');
  });

  test("browser notifications use the Matterhorn logo instead of the legacy favicon", () => {
    const notifications = readReactSource("domains/wallet/lib/notifications.ts");

    expect(notifications).toContain('const NOTIFICATION_ICON = "/matterhorn-logo.png";');
    expect(notifications).not.toContain('const NOTIFICATION_ICON = "/favicon.ico";');
  });
});
