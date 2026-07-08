import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { GeneratedMediaSettingsView } from "../src/react-app/domains/settings/pages/generated-media-view";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

function readServerSource(path: string) {
  return readFileSync(new URL(`../../server/src/${path}`, import.meta.url), "utf8");
}

describe("Generated media settings surface", () => {
  test("SettingsTab and sidebar expose Generated media as a first-class workspace tab", () => {
    const types = readAppSource("app/types.ts");
    const settingsPage = readAppSource("react-app/domains/settings/shell/settings-page.tsx");
    expect(types).toContain('"generated-media"');
    expect(settingsPage).toContain('case "generated-media"');
    expect(settingsPage).toContain('return "Generated media"');
    expect(settingsPage).toContain('"generated-media": ["image-generation", "nft"]');
    expect(settingsPage).toContain('["preferences", "permissions", "wallet", "generated-media", "extensions"]');
  });

  test("settings route parses and renders the generated-media page", () => {
    const route = readAppSource("react-app/shell/settings-route.tsx");
    expect(route).toContain('case "generated-media"');
    expect(route).toContain("GeneratedMediaSettingsView");
    expect(route).toContain("onOpenWorkspaceChat={openWorkspaceChat}");
    expect(route).toContain("onOpenRunHistory={openWorkspaceOutputs}");
  });

  test("generated media settings page reads live backend contracts", () => {
    const source = readAppSource("react-app/domains/settings/pages/generated-media-view.tsx");
    const client = readAppSource("app/lib/matterhorn-server.ts");
    expect(source).toContain("backendCapabilities");
    expect(source).toContain("listGeneratedMediaHistory");
    expect(source).toContain("listImageNftDrafts");
    expect(source).toContain("workspaceDataControls");
    expect(source).toContain("deleteGeneratedImage");
    expect(source).toContain("deleteImageNftDraft");
    expect(source).toContain("buildNftPublishingReadinessItems");
    expect(source).toContain("NftPublishingSetupRows");
    expect(source).toContain("Delete local generated image");
    expect(source).toContain("Delete local NFT draft");
    expect(client).toContain("deleteGeneratedImage");
    expect(client).toContain("deleteImageNftDraft");
  });

  test("backend image and NFT settings actions route to the real generated-media page", () => {
    const server = readServerSource("server.ts");
    const fixtures = readAppSource("react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts");
    expect(server).toContain('route: "/settings/generated-media"');
    expect(server).toContain('href: "/settings/generated-media"');
    expect(fixtures).toContain('"image-generation": "/settings/generated-media"');
    expect(fixtures).toContain('nft: "/settings/generated-media"');
    expect(server).not.toContain('"/settings/image-generation"');
    expect(server).not.toContain('"/settings/nft"');
  });

  test("empty/offline render explains the workspace requirement", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(GeneratedMediaSettingsView, {
          matterhornServerClient: null,
          runtimeWorkspaceId: null,
          onOpenWorkspaceChat: () => {},
          onOpenRunHistory: () => {},
        }),
      ),
    );
    expect(html).toContain("Production readiness");
    expect(html).toContain("Open a connected workspace");
    expect(html).toContain("Recent media");
    expect(html).toContain("Data controls");
  });
});
