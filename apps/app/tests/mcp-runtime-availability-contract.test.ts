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
    expect(view).toContain("const comingSoon = webSupportComingSoon || oauthComingSoon");
    expect(view).toContain('statusHint={comingSoon ? "Coming soon"');
    expect(view).toContain("disabled={props.busy || comingSoon}");
    expect(view).toContain("muted={comingSoon}");
    expect(card).toContain("muted?: boolean");
    expect(card).toContain('muted ? "cursor-default opacity-55"');
  });

  test("keeps unaccepted OAuth connectors muted and non-actionable", () => {
    const view = readAppSource("domains/settings/pages/mcp-view.tsx");

    expect(view).toContain("isPublicOauthConnectorEnabledAtLaunch");
    expect(view).toContain("const oauthComingSoon = Boolean(entry.oauth)");
    expect(view).toContain("muted={comingSoon}");
    expect(view).toContain("disabled={props.busy || comingSoon}");
    expect(view).toContain("actionLabel={comingSoon ? undefined");
  });
});
