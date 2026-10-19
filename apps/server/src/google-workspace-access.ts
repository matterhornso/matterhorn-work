import type { ApprovalService } from "./approvals.js";
import { ApiError } from "./errors.js";
import type { Actor } from "./types.js";

export type GoogleWorkspaceOperation =
  | "status" | "connect_status" | "connect" | "disconnect" | "test"
  | "smoke_test" | "calendar_list_events" | "gmail_create_draft"
  | "drive_search_files" | "drive_read_file";

interface GoogleWorkspaceAccess {
  actor?: Actor;
  matterhornSession?: unknown;
  hostedMcpAccess?: unknown;
  config: { readOnly: boolean };
  request: { signal: AbortSignal };
  approvals: Pick<ApprovalService, "requestApproval">;
}

function approvalSummary(operation: GoogleWorkspaceOperation): string | undefined {
  switch (operation) {
    case "connect": return "Connect the host's global Google Workspace account";
    case "disconnect": return "Disconnect the host's global Google Workspace account";
    case "smoke_test": return "Test the host's global Google Workspace account by creating a Drive file and Gmail draft (no email is sent)";
    case "gmail_create_draft": return "Create a Gmail draft in the host's global Google Workspace account (no email is sent)";
    default: return undefined;
  }
}

export function googleWorkspaceExtensionOperation(input: Record<string, unknown>): GoogleWorkspaceOperation {
  if (typeof input.extensionId !== "string" || input.extensionId.trim() !== "google-workspace") {
    throw new ApiError(404, "extension_action_not_found", "Matterhorn extension action not found");
  }
  const action = typeof input.action === "string" ? input.action.trim() : "";
  switch (action) {
    case "status":
    case "calendar_list_events":
    case "gmail_create_draft":
    case "drive_search_files":
    case "drive_read_file": return action;
    default: throw new ApiError(404, "extension_action_not_found", "Matterhorn extension action not found");
  }
}

/** The current vault is host-global, not bound to a hosted account or workspace. */
export async function runGoogleWorkspaceOperation<T>(
  access: GoogleWorkspaceAccess,
  operation: GoogleWorkspaceOperation,
  perform: () => Promise<T>,
): Promise<T> {
  if (access.matterhornSession || access.hostedMcpAccess || access.actor?.scope !== "owner") {
    throw new ApiError(403, "forbidden", "Google Workspace requires a local owner token");
  }
  // Even provider reads can refresh credentials and persist the host-global vault.
  if (operation !== "status" && operation !== "connect_status" && access.config.readOnly) {
    throw new ApiError(403, "read_only", "Server is read-only");
  }
  const summary = approvalSummary(operation);
  if (summary) {
    const result = await access.approvals.requestApproval({
      workspaceId: "global:google-workspace",
      action: `google_workspace.${operation}`,
      summary,
      paths: [],
      actor: access.actor,
    }, access.request.signal);
    if (!result.allowed) {
      throw new ApiError(403, "write_denied", "Write request denied", {
        requestId: result.id,
        reason: result.reason,
      });
    }
  }
  if (access.request.signal.aborted) {
    throw new ApiError(403, "write_denied", "Write request denied", { reason: "cancelled" });
  }
  return perform();
}
