import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  backendCapabilityLabel,
  backendCapabilityTone,
  storageLocationLabel,
  summarizeModelRoutingPolicy,
  summarizeModelSource,
  walletFamilySummary,
  workspaceDataPolicySummary,
} from "../src/react-app/domains/settings/backend-capability-status";
import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornWorkspaceDataMapResponse,
} from "@matterhorn-work/types/backend-capabilities";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

function readRepoSource(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function capabilities(overrides: Partial<MatterhornBackendCapabilitiesResponse> = {}): MatterhornBackendCapabilitiesResponse {
  return {
    success: true,
    version: "matterhorn.backend.capabilities.v1",
    generatedAt: "2026-07-06T00:00:00.000Z",
    server: {
      version: "test",
      opencodeVersion: "test",
      host: "127.0.0.1",
      port: 8080,
      readOnly: false,
      approvalMode: "auto",
    },
    models: {
      status: "working",
      label: "Models",
      defaultModel: { providerId: "opencode", modelId: "big-pickle" },
      providerListSource: "opencode",
      selectedModelSource: "local_preferences",
      routing: {
        answerPath: "opencode_session_prompt_async",
        modelListTool: "opencode_provider_list",
        userSelectable: true,
        selectionSurface: "model_picker",
        preferenceStore: "local_preferences",
        cloudProviderImport: true,
      },
    },
    providers: { status: "working", label: "Providers", sources: ["opencode"] },
    storage: { status: "working", label: "Storage", stores: {} },
    memory: { status: "working", label: "Memory", scope: "machine_global" },
    notes: { status: "working", label: "Notes", scope: "workspace" },
    evidence: { status: "working", label: "Evidence", sources: ["notes", "memory", "task_events", "outputs"] },
    wallets: {
      status: "preview",
      label: "Wallets",
      families: {
        evm: {
          status: "working",
          label: "EVM direct connect",
          family: "evm",
          custody: false,
          directConnect: true,
          publicRead: true,
          preview: true,
          signing: "client_wallet",
          supportedChains: ["Base Sepolia", "Base"],
        },
        sui: {
          status: "preview",
          label: "Sui wallet preview",
          family: "sui",
          custody: false,
          directConnect: true,
          publicRead: true,
          preview: false,
          signing: "client_wallet",
          supportedChains: ["sui-testnet", "sui-mainnet"],
        },
        bittensor: {
          status: "preview",
          label: "Bittensor external signer",
          family: "bittensor",
          custody: false,
          directConnect: false,
          publicRead: true,
          preview: true,
          signing: "external_signer",
        },
      },
    },
    teams: {
      status: "unsupported",
      label: "Teams not supported",
      localTokenSharing: { status: "needs_setup", label: "Local token sharing" },
      cloudTeams: { status: "unsupported", label: "Cloud teams" },
    },
    security: {
      status: "working",
      label: "Security",
      loopback: { status: "working", label: "Loopback" },
      bearerTokens: { status: "working", label: "Bearer tokens" },
      hostToken: { status: "working", label: "Host token" },
      approvals: { status: "working", label: "Approvals" },
      cors: { status: "needs_setup", label: "CORS" },
      authorizedRoots: { status: "working", label: "Authorized roots" },
      requestLogging: { status: "working", label: "Request logging" },
      memoryWriteGuards: { status: "working", label: "Memory write guards" },
    },
    settings: [],
    ...overrides,
  };
}

describe("backend capability UI contract", () => {
  test("MatterhornServerClient exposes backend capabilities and data-map endpoints", () => {
    const source = readAppSource("app/lib/matterhorn-server.ts");
    expect(source).toContain("backendCapabilities");
    expect(source).toContain('"/api/backend/capabilities"');
    expect(source).toContain("backendModels");
    expect(source).toContain('"/api/backend/models"');
    expect(source).toContain("workspaceDataMap");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/data-map`');
    expect(source).toContain("listProjectDataLedger");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/data-ledger${suffix}`');
    expect(source).toContain('query.set("desk", options.desk.trim())');
    expect(source).toContain('query.set("sessionId", options.sessionId.trim())');
    expect(source).toContain('query.set("taskId", options.taskId.trim())');
    expect(source).toContain('query.set("from", options.from.trim())');
    expect(source).toContain('query.set("to", options.to.trim())');
    expect(source).toContain("submitProjectFeedback");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/feedback`');
    expect(source).toContain("suiAccount");
    expect(source).toContain('`/api/sui/account/${encodeURIComponent(address)}${suffix}`');
    expect(source).toContain("suiBalance");
    expect(source).toContain('`/api/sui/balance/${encodeURIComponent(address)}${suffix}`');
    expect(source).toContain("suiTransactionPreview");
    expect(source).toContain('"/api/sui/transactions/preview"');
    expect(source).toContain("suiTransactionReceipt");
    expect(source).toContain('"/api/sui/transactions/receipt"');
    expect(source).toContain("workspaceSuiTransactionPreview");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/sui/transactions/preview`');
    expect(source).toContain("workspaceSuiTransactionReceipt");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/sui/transactions/receipt`');
    expect(source).toContain("MatterhornSuiWorkspaceEvidence");
  });

  test("Settings overview reads backend capabilities and workspace data map", () => {
    const source = readAppSource("react-app/domains/settings/pages/overview-view.tsx");
    expect(source).toContain("settings-backend-capabilities");
    expect(source).toContain("client.backendCapabilities()");
    expect(source).toContain("settings-workspace-data-map");
    expect(source).toContain("client.workspaceDataMap(workspaceId)");
    expect(source).toContain("settings-project-data-ledger");
    expect(source).toContain("client.listProjectDataLedger(workspaceId");
    expect(source).toContain("summarizeModelRoutingPolicy");
    expect(source).toContain("Backend status");
    expect(source).toContain("Wallet families");
    expect(source).toContain("Training use");
  });

  test("AI settings shows backend model routing alongside live provider counts", () => {
    const source = readAppSource("react-app/domains/settings/pages/ai-view.tsx");
    const routeSource = readAppSource("react-app/shell/settings-route.tsx");

    expect(source).toContain("settings-backend-models");
    expect(source).toContain("client.backendModels()");
    expect(source).toContain("Model routing");
    expect(source).toContain("Current model, provider list source, and selection policy.");
    expect(source).toContain("OpenCode session prompts");
    expect(source).toContain("OpenCode provider list");
    expect(source).toContain("No model training by default");
    expect(routeSource).toContain("connectedModelCount");
    expect(routeSource).toContain("defaultModelLabel={defaultModelLabel}");
    expect(routeSource).toContain("defaultModelRef={defaultModelRef}");
    expect(routeSource).toContain("matterhornServerClient={matterhornClient}");
  });

  test("Wallet settings uses backend wallet family status including Sui", () => {
    const walletSource = readAppSource("react-app/domains/settings/pages/wallet-view.tsx");
    const routeSource = readAppSource("react-app/shell/settings-route.tsx");
    const providerSource = readAppSource("react-app/shell/providers.tsx");
    expect(walletSource).toContain("matterhornServerClient?: MatterhornServerClient | null");
    expect(walletSource).toContain("wallet-backend-capabilities");
    expect(walletSource).toContain("matterhornServerClient.backendCapabilities()");
    expect(walletSource).toContain('wallet.family === "Sui"');
    expect(walletSource).toContain("Sui wallet");
    expect(walletSource).toContain("useWallets");
    expect(walletSource).toContain("connectSuiWallet");
    expect(walletSource).toContain("matterhornServerClient.suiAccount(account.address");
    expect(walletSource).toContain("SuiWorkflowPanel");
    expect(walletSource).toContain("runtimeWorkspaceId?: string | null");
    expect(walletSource).toContain('sourceLabel: "Matterhorn engine"');
    expect(routeSource).toContain("runtimeWorkspaceId={runtimeWorkspaceId}");
    expect(providerSource).toContain("DAppKitProvider");
    expect(providerSource).toContain("suiDAppKit");
    expect(routeSource).toContain("matterhornServerClient={matterhornClient}");
  });

  test("Sui workflow panel saves wallet preview and receipt evidence through workspace routes", () => {
    const source = readAppSource("react-app/domains/wallet/sui-workflow-panel.tsx");
    const sessionSource = readAppSource("react-app/domains/session/chat/session-page.tsx");
    const activitySource = readAppSource("react-app/domains/recent-activity/recent-activity-section.tsx");

    expect(source).toContain("workspaceSuiTransactionPreview");
    expect(source).toContain("workspaceSuiTransactionReceipt");
    expect(source).toContain("matterhorn:task-log-updated");
    expect(source).toContain("matterhorn:project-evidence-updated");
    expect(source).toContain("No custody");
    expect(source).toContain("Sign and submit in your Sui wallet");
    expect(source).toContain("Do not paste signatures or signed payloads");
    expect(sessionSource).toContain("Sui workflow");
    expect(sessionSource).toContain('setCurrentSidePanel("wallet")');
    expect(activitySource).toContain("matterhorn:project-evidence-updated");
  });

  test("Profile readiness copy does not claim memory sync before data policy supports it", () => {
    const source = readRepoSource("packages/types/src/profile-readiness.ts");
    expect(source).not.toContain("Preferences and memory are synced");
    expect(source).not.toContain("sync preferences and memory");
    expect(source).toContain("Local project memory stays on this device");
  });

  test("status helpers use truthful user-facing labels", () => {
    expect(backendCapabilityLabel("working")).toBe("Working");
    expect(backendCapabilityLabel("needs_setup")).toBe("Needs setup");
    expect(backendCapabilityLabel("preview")).toBe("Preview");
    expect(backendCapabilityLabel("unsupported")).toBe("Not supported here");
    expect(backendCapabilityTone("unsupported")).toBe("neutral");
  });

  test("model and wallet helpers expose Sui as preview instead of hidden", () => {
    const result = capabilities();
    expect(summarizeModelSource(result)).toBe("opencode/big-pickle");
    expect(summarizeModelRoutingPolicy(result)).toContain("OpenCode session prompts");
    expect(summarizeModelRoutingPolicy(result)).toContain("OpenCode provider list");
    expect(summarizeModelRoutingPolicy(result)).toContain("model picker");
    expect(walletFamilySummary(result)).toEqual([
      { family: "EVM", label: "EVM direct connect", status: "working" },
      { family: "Sui", label: "Sui wallet preview", status: "preview" },
      { family: "Bittensor", label: "Bittensor external signer", status: "preview" },
    ]);
  });

  test("data-map helpers summarize local storage and policy", () => {
    const dataMap = {
      success: true,
      version: "matterhorn.backend.data-map.v1",
      generatedAt: "2026-07-06T00:00:00.000Z",
      workspace: {
        id: "ws_test",
        name: "Test",
        path: "/tmp/project",
        type: "local",
        preset: "default",
      },
      stores: {
        chat: {
          id: "chat",
          status: "working",
          label: "Chat",
          scope: "opencode_runtime",
          path: "/tmp/opencode.db",
          containsUserContent: true,
          containsSecrets: "possible",
          retention: "runtime_controlled",
          exportable: true,
          deletable: true,
        },
        notes: {
          id: "notes",
          status: "working",
          label: "Notes",
          scope: "workspace",
          paths: ["/tmp/project/notes"],
          containsUserContent: true,
          containsSecrets: "possible",
          retention: "user_controlled",
          exportable: true,
          deletable: true,
        },
      },
      policy: {
        trainingUse: "none_by_default",
        redaction: { status: "working", label: "Redaction" },
        export: { status: "working", label: "Export" },
        deletion: { status: "working", label: "Deletion" },
      },
    } as MatterhornWorkspaceDataMapResponse;

    expect(storageLocationLabel(dataMap.stores.chat)).toBe("/tmp/opencode.db");
    expect(storageLocationLabel(dataMap.stores.notes)).toBe("/tmp/project/notes");
    expect(workspaceDataPolicySummary(dataMap)).toBe("No training use by default.");
  });
});
