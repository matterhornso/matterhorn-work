import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readAppSource = (path: string) =>
  readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");

describe("MCP runtime availability", () => {
  test("does not advertise disabled Cloud Control", () => {
    const source = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(source).toContain("MATTERHORN_CLOUD_ENABLED || getMcpServerName(entry) !== \"matterhorn-cloud\"");
  });

  test("presents web-only UI Control as a muted coming-soon item", () => {
    const view = readAppSource("domains/settings/pages/mcp-view.tsx");
    const card = readAppSource("design-system/extension-card.tsx");

    expect(view).toContain('getMcpServerName(entry) === "matterhorn-ui" && !isDesktopRuntime()');
    expect(view).toContain('statusHint={webSupportComingSoon ? "Coming soon"');
    expect(view).toContain("disabled={props.busy || webSupportComingSoon}");
    expect(view).toContain("muted={webSupportComingSoon}");
    expect(card).toContain("muted?: boolean");
    expect(card).toContain('muted ? "cursor-default opacity-55"');
  });
});
