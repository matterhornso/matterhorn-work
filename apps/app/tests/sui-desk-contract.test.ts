import { describe, expect, test } from "bun:test";

import {
  CUSTOMER_DESK_ORDER,
  DESK_ACTION_REGISTRY,
  MATTERHORN_DESK_AGENT_MANIFESTS,
  MATTERHORN_DESK_MANIFEST_REGISTRY,
  MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
  MATTERHORN_NOTE_DESKS,
  MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY,
  PROTOCOL_BRAND_ASSET_REGISTRY,
  PROTOCOL_DESK_MANIFEST_REGISTRY,
} from "@matterhorn-work/types";

describe("Sui desk integration contract", () => {
  test("registers Sui as a first-class protocol desk and launcher", () => {
    expect(CUSTOMER_DESK_ORDER).toContain("sui");
    expect(MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY.sui).toMatchObject({
      id: "sui",
      displayName: "Sui",
      customerStatus: "preview_only",
      primaryPanelRouteId: "/workspaces/sui",
    });
    expect(MATTERHORN_DESK_MANIFEST_REGISTRY.sui).toMatchObject({
      deskId: "sui",
      deskDisplayName: "Sui",
      status: "preview_only",
    });
    expect(PROTOCOL_DESK_MANIFEST_REGISTRY.sui).toMatchObject({
      id: "sui",
      displayName: "Sui",
      walletRailMode: "sui_wallet",
      walletRequirements: ["sui_wallet_standard", "sui_external_handoff"],
    });
    expect(PROTOCOL_BRAND_ASSET_REGISTRY["sui-logo"]).toMatchObject({
      protocol: "sui",
      fallbackInitials: "SUI",
    });
  });

  test("registers Sui agent and action manifests without custody or live submit", () => {
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.sui).toMatchObject({
      deskId: "sui",
      agentId: "matterhorn-sui",
      workflowId: "sui_wallet_workflow",
      outputDeskId: "sui",
    });
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.sui.instructions).toContain("Never ask for seed phrases");
    expect(MATTERHORN_DESK_AGENT_MANIFESTS.sui.instructions).toContain("outputs/sui");

    expect(Object.keys(DESK_ACTION_REGISTRY.sui)).toEqual([
      "sui_account_read",
      "sui_transfer_preview",
      "sui_import_receipt",
    ]);
    expect(DESK_ACTION_REGISTRY.sui.sui_account_read.executionState).toBe("live_read");
    expect(DESK_ACTION_REGISTRY.sui.sui_transfer_preview.executionState).toBe("preview_only");
    expect(DESK_ACTION_REGISTRY.sui.sui_transfer_preview.safetyBoundary).toMatchObject({
      canSubmit: false,
      liveSubmissionEnabled: false,
      canRequestSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    });
  });

  test("allows Sui notes and memory only as public, user-confirmed project context", () => {
    expect(MATTERHORN_NOTE_DESKS).toContain("sui");
    expect(MATTERHORN_MEMORY_DESK_POLICY_MATRIX.sui).toMatchObject({
      desk: "sui",
      defaultSensitivity: "public",
      canUseInChat: true,
      canExport: true,
      canSendToMcpApi: true,
    });
    expect(MATTERHORN_MEMORY_DESK_POLICY_MATRIX.sui.allowedKinds).toContain("protocol_address");
    expect(MATTERHORN_MEMORY_DESK_POLICY_MATRIX.sui.allowedKinds).toContain("receipt");
    expect(MATTERHORN_MEMORY_DESK_POLICY_MATRIX.sui.forbiddenCases.join(" ")).toContain("private keys");
    expect(MATTERHORN_MEMORY_DESK_POLICY_MATRIX.sui.forbiddenCases.join(" ")).toContain("raw signatures");
  });
});
