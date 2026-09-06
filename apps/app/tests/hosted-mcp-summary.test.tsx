import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MCPS_PROTOCOL_DESK_MANIFEST } from "@matterhorn-work/types";

import {
  HostedMcpSummary,
  resolveHostedMcpAccessView,
} from "../src/react-app/domains/settings/pages/hosted-mcp-summary";

describe("hosted MCP summary", () => {
  test("shows the exact guarded MCP inventory shipped to external clients", () => {
    const source = readFileSync(
      new URL(
        "../../../packages/matterhorn-guarded-mcp/tools.mjs",
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

  test("keeps hosted credential handling account-scoped and memory-only", () => {
    const summarySource = readFileSync(
      new URL(
        "../src/react-app/domains/settings/pages/hosted-mcp-summary.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const clientSource = readFileSync(
      new URL(
        "../src/react-app/domains/settings/pages/hosted-mcp-access-client.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(summarySource).toContain("Create key");
    expect(summarySource).toContain("Save this key before continuing");
    expect(summarySource).toContain("Matterhorn stores only a secure fingerprint");
    expect(summarySource).toContain("/mcp/guarded");
    expect(summarySource).toContain("MCP address");
    expect(summarySource).not.toContain('label: "Server"');
    expect(summarySource).toContain('aria-label={tokenVisible ? "Hide access key" : "Show access key"}');
    expect(summarySource).toContain('"•".repeat(16)');
    expect(summarySource).toContain("Could not check external AI access");
    expect(summarySource).toContain("External AI access is not open yet");
    expect(summarySource).toContain("Use Matterhorn Desktop instead");
    expect(summarySource).toContain("hosted connector is still an invite preview");
    expect(summarySource).not.toContain("border-l-2");
    expect(summarySource).toContain("Revoke");
    expect(clientSource).toContain("/api/auth/account/mcp-access");
    expect(clientSource).toContain('credentials: "include"');
    expect(summarySource).not.toContain("localStorage");
    expect(summarySource).not.toContain("sessionStorage");
    expect(clientSource).not.toContain("localStorage");
    expect(clientSource).not.toContain("sessionStorage");
  });

  test("distinguishes loading, failure, rollout, invitation, and ready states", () => {
    const off = { mode: "off" as const, eligible: false, maxExpiresInDays: 30, credentials: [] };
    const notInvited = { mode: "invite" as const, eligible: false, maxExpiresInDays: 30, credentials: [] };
    const ready = { mode: "invite" as const, eligible: true, maxExpiresInDays: 30, credentials: [] };

    expect(resolveHostedMcpAccessView(null, true, false)).toBe("loading");
    expect(resolveHostedMcpAccessView(null, false, true)).toBe("error");
    expect(resolveHostedMcpAccessView(off, false, false)).toBe("off");
    expect(resolveHostedMcpAccessView(notInvited, false, false)).toBe("not_invited");
    expect(resolveHostedMcpAccessView(ready, false, false)).toBe("ready");
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
    expect(html).toContain("Checking external AI app access");
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
