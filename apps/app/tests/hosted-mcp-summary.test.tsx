import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MCPS_PROTOCOL_DESK_MANIFEST } from "@matterhorn-work/types";

import { HostedMcpSummary } from "../src/react-app/domains/settings/pages/hosted-mcp-summary";

describe("hosted MCP summary", () => {
  test("keeps the shared manifest aligned with managed web capability", () => {
    expect(MCPS_PROTOCOL_DESK_MANIFEST.status).toBe("beta_ready");
    expect(MCPS_PROTOCOL_DESK_MANIFEST.backendStatus).toBe("partial");
    expect(MCPS_PROTOCOL_DESK_MANIFEST.actionStatus).toBe("read_only");
    expect(MCPS_PROTOCOL_DESK_MANIFEST.extensionStatus).toBe(
      "built_in_partial",
    );
    expect(MCPS_PROTOCOL_DESK_MANIFEST.launcherDescription).toContain(
      "Matterhorn-managed tools on web",
    );
    expect(MCPS_PROTOCOL_DESK_MANIFEST.launcherDescription).toContain(
      "Matterhorn Desktop",
    );
    expect(MCPS_PROTOCOL_DESK_MANIFEST.emptyStateCopy.headline).not.toContain(
      "coming soon",
    );
  });

  test("presents the managed Public Beta tool inventory", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostedMcpSummary, {
        connections: [],
        showHeader: true,
      }),
    );

    expect(html).toContain("MCPs &amp; Tools");
    expect(html).toContain("Managed tools for this web workspace");
    expect(html).toContain("Desk research");
    expect(html).toContain("Workspace evidence");
    expect(html).toContain("Reviewed wallet actions");
    expect(html).toContain("Matterhorn Desktop");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).not.toContain("Marketplace");
    expect(html).not.toContain("Add Custom MCP");
    expect(html).not.toContain("Copy command");
  });

  test("continues the Settings shell heading hierarchy when embedded", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostedMcpSummary, {
        connections: [],
        showHeader: false,
      }),
    );

    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h4");
  });

  test("renders managed connection health without configuration controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostedMcpSummary, {
        connections: [
          { name: "Wallet MCP", statusLabel: "Ready", ready: true },
          {
            name: "Prediction markets",
            statusLabel: "Unavailable",
            ready: false,
          },
        ],
      }),
    );

    expect(html).toContain("Managed connections");
    expect(html).toContain("Wallet MCP");
    expect(html).toContain("Prediction markets");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("<button");
  });

  test("distills the session rail into a managed-tools summary", () => {
    const html = renderToStaticMarkup(
      React.createElement(HostedMcpSummary, {
        compact: true,
        connections: [
          { name: "Wallet MCP", statusLabel: "Ready", ready: true },
        ],
        onViewTools: () => undefined,
      }),
    );

    expect(html).toContain("Matterhorn tools");
    expect(html).toContain("No MCP setup is required");
    expect(html).toContain("Managed");
    expect(html).toContain("1 of 1 managed connections ready");
    expect(html).toContain("View managed tools");
    expect(html).not.toContain("Manage MCPs");
  });
});
