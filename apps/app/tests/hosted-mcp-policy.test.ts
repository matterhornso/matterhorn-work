import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL(
    "../src/react-app/domains/settings/pages/mcp-view.tsx",
    import.meta.url,
  ),
  "utf8",
);
const settingsShellSource = readFileSync(
  new URL(
    "../src/react-app/domains/settings/shell/settings-page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const sessionPageSource = readFileSync(
  new URL(
    "../src/react-app/domains/session/chat/session-page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const extensionsViewSource = readFileSync(
  new URL(
    "../src/react-app/domains/settings/pages/extensions-view.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("hosted MCP policy", () => {
  test("selects the managed summary from the central Public Beta detector", () => {
    expect(source).toContain("isPublicBetaWebDeployment");
    expect(source).toContain("if (hostedManagedMode)");
    expect(source).toContain("<HostedMcpSummary");
  });

  test("consumes unsupported external configuration requests without opening local controls", () => {
    expect(source).toContain(
      "props.onDetailEntryRequestHandled?.(request.requestId)",
    );
    expect(source).toContain("props.onAddMcpRequestHandled?.(requestId)");
    expect(source).toContain("if (hostedManagedMode) {");
  });

  test("preserves the full local and Desktop management surface", () => {
    expect(source).toContain("<McpCustomAppCard");
    expect(source).toContain("Search MCPs, connectors, and skills");
    expect(source).toContain("<McpQuickConnectSection");
    expect(source).toContain("setAddMcpModalOpen(true)");
  });

  test("uses concise hosted navigation language without renaming Desktop MCP controls", () => {
    expect(settingsShellSource).toContain("isPublicBetaWebDeployment()");
    expect(settingsShellSource).toContain('? "Tools"');
    expect(settingsShellSource).toContain('t("settings.tab_extensions")');
    expect(settingsShellSource).toContain(
      '"Review managed tools available to this workspace"',
    );
    expect(sessionPageSource).toContain("hostedManagedTools");
    expect(sessionPageSource).toContain('title={hostedManagedTools ? "Tools"');
    expect(sessionPageSource).toContain(': "MCPs & Connectors"}');
  });

  test("does not leak local marketplace or engine-plugin controls around the hosted summary", () => {
    expect(extensionsViewSource).toContain("const marketplaceAvailable =");
    expect(extensionsViewSource).toContain(
      "!hostedManagedMode && Boolean(props.cloudMarketplaceView)",
    );
    expect(extensionsViewSource).toContain(
      "hostedManagedMode ? 0 : props.extensions.pluginList().length",
    );
    expect(extensionsViewSource).toContain("!hostedManagedMode &&");
    expect(extensionsViewSource).toContain(
      "connectedAppCount > 0 || !marketplaceAvailable",
    );
  });
});
