import { describe, expect, test } from "bun:test";

import {
  deriveCompactMcpState,
  isEmptyMcpStatusMessage,
  type CompactMcpRuntimeStatus,
} from "../src/react-app/domains/settings/pages/mcp-compact-state";

function state(input: {
  statuses?: CompactMcpRuntimeStatus[];
  busy?: boolean;
  connectingName?: string | null;
  hasSynced?: boolean;
  statusMessage?: string | null;
}) {
  return deriveCompactMcpState({
    statuses: input.statuses ?? [],
    busy: input.busy ?? false,
    connectingName: input.connectingName ?? null,
    hasSynced: input.hasSynced ?? false,
    statusMessage: input.statusMessage ?? null,
  });
}

describe("compact MCP connection state", () => {
  test("recognizes both first-run empty messages without hiding real errors", () => {
    expect(isEmptyMcpStatusMessage("No MCP servers configured yet.")).toBe(true);
    expect(isEmptyMcpStatusMessage("No workspace MCP configuration yet. Add an MCP to create one.")).toBe(true);
    expect(isEmptyMcpStatusMessage("Matterhorn Desks server unavailable. MCP config is read-only.")).toBe(false);
  });

  test("uses a skeleton only for the unresolved first load", () => {
    expect(state({ busy: true })).toMatchObject({
      kind: "skeleton",
      announcementRole: "status",
    });
  });

  test("keeps prior data visible while syncing", () => {
    expect(state({
      statuses: ["connected", "disconnected"],
      busy: true,
      hasSynced: true,
    })).toMatchObject({
      kind: "syncing",
      label: "Syncing MCP connections",
    });
  });

  test("distinguishes empty, offline, partial, and success", () => {
    expect(state({ hasSynced: true }).kind).toBe("empty");
    expect(state({ statuses: ["disconnected", "needs_auth"], hasSynced: true }).kind).toBe("offline");
    expect(state({ statuses: ["connected", "disabled"], hasSynced: true })).toMatchObject({
      kind: "partial",
      label: "1 of 2 connections ready",
    });
    expect(state({ statuses: ["connected", "connected"], hasSynced: true })).toMatchObject({
      kind: "success",
      label: "2 connections ready",
    });
  });

  test("promotes runtime failures and backend unavailability to alerts", () => {
    expect(state({ statuses: ["failed"], hasSynced: true })).toMatchObject({
      kind: "error",
      announcementRole: "alert",
    });
    expect(state({
      hasSynced: true,
      statusMessage: "Matterhorn Desks server unavailable. MCP config is read-only.",
    })).toEqual({
      kind: "error",
      label: "MCP connections unavailable",
      description: "Matterhorn Desks server unavailable. MCP config is read-only.",
      announcementRole: "alert",
    });
  });

  test("names the server being connected", () => {
    expect(state({ connectingName: "Wallet MCP", hasSynced: true })).toMatchObject({
      kind: "syncing",
      label: "Connecting Wallet MCP",
    });
  });
});
