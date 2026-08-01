import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
      customerStatus: "beta_ready",
      primaryPanelRouteId: "/workspaces/sui",
    });
    expect(MATTERHORN_DESK_MANIFEST_REGISTRY.sui).toMatchObject({
      deskId: "sui",
      deskDisplayName: "Sui",
      status: "beta_ready",
    });
    expect(PROTOCOL_DESK_MANIFEST_REGISTRY.sui).toMatchObject({
      id: "sui",
      displayName: "Sui",
      walletRailMode: "sui_wallet",
      walletRequirements: ["sui_wallet_standard", "sui_external_handoff"],
    });
    expect(PROTOCOL_BRAND_ASSET_REGISTRY["sui-logo"]).toMatchObject({
      protocol: "sui",
      lightAssetPath: "/assets/desks/sui/logo-light.svg",
      darkAssetPath: "/assets/desks/sui/logo-dark.svg",
      fallbackInitials: "SUI",
    });
  });

  test("uses the circular Sui logo asset for compact desk surfaces", () => {
    const lightLogo = readFileSync("apps/app/public/assets/desks/sui/logo-light.svg", "utf8");
    const darkLogo = readFileSync("apps/app/public/assets/desks/sui/logo-dark.svg", "utf8");

    for (const svg of [lightLogo, darkLogo]) {
      expect(svg).toContain('viewBox="0 0 300 300"');
      expect(svg).toContain('<circle cx="150" cy="150" r="150" fill="#4DA2FF"');
      expect(svg).toContain('fill="#FFFFFF"');
    }
  });

  test("registers Sui agent and connected-wallet action manifests without custody", () => {
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
      "sui_coin_transfer",
      "sui_object_transfer",
      "sui_batch_transfer",
      "sui_import_receipt",
    ]);
    expect(DESK_ACTION_REGISTRY.sui.sui_account_read.executionState).toBe("live_read");
    expect(DESK_ACTION_REGISTRY.sui.sui_transfer_preview.executionState).toBe("user_authorized_submit");
    expect(DESK_ACTION_REGISTRY.sui.sui_transfer_preview.safetyBoundary).toMatchObject({
      canSubmit: false,
      liveSubmissionEnabled: false,
      canRequestSecrets: false,
      acceptsPrivateKeys: false,
      acceptsRawSignatures: false,
    });
    expect(DESK_ACTION_REGISTRY.sui.sui_transfer_preview.userCompletion).toEqual({
      surface: "connected_wallet",
      actionLabel: "Sign in Sui wallet",
      result: "submitted_transaction",
      featureGate: "sui_wallet_standard",
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

  test("keeps transfer preparation available before wallet connection", () => {
    const panelSource = readFileSync(
      "apps/app/src/react-app/domains/wallet/sui-workflow-panel.tsx",
      "utf8",
    );

    expect(panelSource).toContain("You can prepare exact transfer terms now.");
    expect(panelSource).toContain("Install or enable Phantom for Sui");
    expect(panelSource).toContain("Review transaction");
    expect(panelSource).toContain("Review in wallet");
    expect(panelSource).not.toContain("!directWalletAvailable || connectedAddress ? <>");
  });
});
