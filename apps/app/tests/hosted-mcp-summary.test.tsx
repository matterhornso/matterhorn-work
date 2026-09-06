import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MCPS_PROTOCOL_DESK_MANIFEST } from "@matterhorn-work/types";

import { HostedMcpSummary } from "../src/react-app/domains/settings/pages/hosted-mcp-summary";

describe("hosted MCP summary", () => {
  test("shows the exact guarded MCP inventory shipped to external clients", () => {
    const source = readFileSync(
      new URL(
        "../../../packages/matterhorn-guarded-mcp/index.mjs",
        import.meta.url,
      ),
      "utf8",
    );
    const shippedToolNames = Array.from(
      source.matchAll(/\bname: "(matterhorn_[a-z_]+)"/g),
      (match) => match[1]!,
    );
    const html = renderToStaticMarkup(
      React.createElement(HostedMcpSummary, {
        connections: [],
      }),
    );

    expect(shippedToolNames).toHaveLength(11);
    for (const toolName of shippedToolNames) {
      expect(html).toContain(toolName);
    }
  });

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
    expect(html).toContain("Use Matterhorn from another AI app");
    expect(html).toContain("Supported AI apps");
    expect(html).toContain("Codex");
    expect(html).toContain("Claude Code");
    expect(html).toContain("Claude Desktop");
    expect(html).toContain("Cursor");
    expect(html).toContain("What it can do");
    expect(html).toContain("View all 11 tool names");
    expect(html).toContain("matterhorn_submit_session_prompt");
    expect(html).toContain("cannot approve wallet actions");
    expect(html).toContain("Connecting an external client directly");
    expect(html).toContain("Set up with Matterhorn Desktop");
    expect(html).toContain("client-only token");
    expect(html).toContain("not published to npm yet");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).not.toContain("Marketplace");
    expect(html).not.toContain("Add Custom MCP");
    expect(html).not.toContain("Copy command");
    expect(html).not.toContain("host token");
    expect(html).not.toContain("wallet submission");
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
