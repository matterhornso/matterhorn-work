export type CompactMcpRuntimeStatus =
  | "connected"
  | "needs_auth"
  | "needs_client_registration"
  | "failed"
  | "disabled"
  | "disconnected";

export type CompactMcpStateKind =
  | "skeleton"
  | "empty"
  | "syncing"
  | "offline"
  | "partial"
  | "error"
  | "success";

export type CompactMcpState = {
  kind: CompactMcpStateKind;
  label: string;
  description: string;
  announcementRole: "status" | "alert";
};

export function isEmptyMcpStatusMessage(message: string | null) {
  const normalized = message?.trim().toLowerCase() ?? "";
  return normalized.includes("no mcp servers configured") ||
    normalized.includes("no workspace mcp configuration");
}

export function deriveCompactMcpState(input: {
  statuses: CompactMcpRuntimeStatus[];
  busy: boolean;
  connectingName: string | null;
  hasSynced: boolean;
  statusMessage: string | null;
}): CompactMcpState {
  const configuredCount = input.statuses.length;
  const connectedCount = input.statuses.filter((status) => status === "connected").length;
  const failedCount = input.statuses.filter((status) => status === "failed").length;
  const syncing = input.busy || Boolean(input.connectingName);

  if (syncing && !input.hasSynced && configuredCount === 0) {
    return {
      kind: "skeleton",
      label: "Checking MCP connections",
      description: "Loading configured servers and their current availability.",
      announcementRole: "status",
    };
  }

  if (syncing) {
    return {
      kind: "syncing",
      label: input.connectingName ? `Connecting ${input.connectingName}` : "Syncing MCP connections",
      description: configuredCount > 0
        ? `Refreshing ${configuredCount} configured ${configuredCount === 1 ? "server" : "servers"}.`
        : "Checking for configured servers.",
      announcementRole: "status",
    };
  }

  if (configuredCount === 0 && !input.statusMessage) {
    return {
      kind: "empty",
      label: "No external MCPs connected.",
      description: "Open full settings to connect an approved server or review built-in tools.",
      announcementRole: "status",
    };
  }

  if (failedCount > 0 || input.statusMessage) {
    return {
      kind: "error",
      label: failedCount > 0
        ? `${failedCount} ${failedCount === 1 ? "connection has" : "connections have"} an error`
        : "MCP connections unavailable",
      description: input.statusMessage ?? "Open full settings to review the failed connection and retry.",
      announcementRole: "alert",
    };
  }

  if (connectedCount === configuredCount) {
    return {
      kind: "success",
      label: `${connectedCount} ${connectedCount === 1 ? "connection" : "connections"} ready`,
      description: "All configured MCP servers are available to this project.",
      announcementRole: "status",
    };
  }

  if (connectedCount > 0) {
    return {
      kind: "partial",
      label: `${connectedCount} of ${configuredCount} connections ready`,
      description: "Some configured servers are offline or need setup. Available tools still work.",
      announcementRole: "status",
    };
  }

  return {
    kind: "offline",
    label: "MCP connections offline",
    description: "Configured servers are offline, disabled, or need setup. Open full settings to recover them.",
    announcementRole: "status",
  };
}
