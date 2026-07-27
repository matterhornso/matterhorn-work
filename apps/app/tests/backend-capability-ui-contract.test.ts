import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  backendCapabilityLabel,
  backendCapabilityTone,
  storageLocationLabel,
  summarizeModelSelection,
  summarizeModelRoutingPolicy,
  summarizeModelSource,
  walletFamilySummary,
  walletRuntimeSupportSummary,
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
          label: "Sui wallet",
          family: "sui",
          custody: false,
          directConnect: true,
          publicRead: true,
          preview: true,
          signing: "client_wallet",
          supportedChains: ["sui-testnet", "sui-mainnet"],
          runtimeSupport: {
            web: {
              runtime: "web",
              status: "preview",
              label: "Web wallet-standard connect",
              description: "Sui wallet-standard wallets can connect in the web app through Mysten dApp Kit.",
              custody: false,
              directConnect: true,
              publicRead: true,
              preview: true,
              signing: "client_wallet",
            },
            desktop: {
              runtime: "desktop",
              status: "preview",
              label: "Desktop external handoff",
              description: "Desktop prepares Sui handoffs; signing happens in an external Sui wallet or protocol client.",
              custody: false,
              directConnect: false,
              publicRead: true,
              preview: true,
              signing: "external_signer",
            },
            electron: {
              runtime: "electron",
              status: "preview",
              label: "Electron external handoff",
              description: "Electron prepares Sui handoffs; signing happens in an external Sui wallet or protocol client.",
              custody: false,
              directConnect: false,
              publicRead: true,
              preview: true,
              signing: "external_signer",
            },
          },
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
    expect(source).toContain("workspaceBackendModels");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/models`');
    expect(source).toContain("workspaceModelSelection");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/model-selection`');
    expect(source).toContain("saveWorkspaceModelSelection");
    expect(source).toContain("clearWorkspaceModelSelection");
    expect(source).toContain("workspaceReadiness");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/readiness`');
    expect(source).toContain("workspaceBackendControlPlane");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/control-plane`');
    expect(source).toContain("workspaceBackendSupportReport");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/support-report`');
    expect(source).toContain("workspaceDataMap");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/data-map`');
    expect(source).toContain("workspaceDataControls");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/data-controls`');
    expect(source).toContain("workspaceDataPolicy");
    expect(source).toContain("updateWorkspaceDataPolicy");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/data-policy`');
    expect(source).toContain("workspaceTeamAccess");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/team-access`');
    expect(source).toContain("workspaceTeamAccessSummary");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/team-access/summary`');
    expect(source).toContain("createWorkspaceTeamAccessToken");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/team-access/tokens`');
    expect(source).toContain("revokeWorkspaceTeamAccessToken");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/backend/team-access/tokens/${encodeURIComponent(tokenId)}`');
    expect(source).toContain("listProjectDataLedger");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/data-ledger${suffix}`');
    expect(source).toContain("exportProjectDataLedger");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/data-ledger/export${suffix}`');
    expect(source).toContain('query.set("desk", options.desk.trim())');
    expect(source).toContain('query.set("sessionId", options.sessionId.trim())');
    expect(source).toContain('query.set("taskId", options.taskId.trim())');
    expect(source).toContain('query.set("from", options.from.trim())');
    expect(source).toContain('query.set("to", options.to.trim())');
    expect(source).toContain("submitProjectFeedback");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/feedback`');
    expect(source).toContain("deleteProjectFeedback");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/feedback/${encodeURIComponent(feedbackId)}`');
    expect(source).toContain("deleteAllProjectFeedback");
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
    expect(source).toContain("workspaceBittensorPublicReadEvidence");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/bittensor/evidence/public-read`');
    expect(source).toContain("workspaceBittensorReceiptEvidence");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/bittensor/extrinsics/receipt`');
    expect(source).toContain("deleteWorkspaceOutput");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/outputs?${query.toString()}`');
    expect(source).toContain("searchWorkspaceMemory");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/search${suffix}`');
    expect(source).toContain("listWorkspaceMemory");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/entities${suffix}`');
    expect(source).toContain("captureWorkspaceMemory");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/capture`');
    expect(source).toContain("createWorkspaceMemorySuggestions");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/suggestions`');
    expect(source).toContain("listWorkspaceMemorySuggestions");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/suggestions${suffix}`');
    expect(source).toContain("resolveStoredWorkspaceMemorySuggestion");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/suggestions/${encodeURIComponent(id)}/resolve`');
    expect(source).toContain("forgetWorkspaceMemory");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/entities/${encodeURIComponent(id)}`');
    expect(source).toContain("exportWorkspaceMemory");
    expect(source).toContain('`/workspace/${encodeURIComponent(workspaceId)}/memory/export`');
    expect(source).toContain("MatterhornSuiWorkspaceEvidence");
  });

  test("Settings overview reads backend capabilities and workspace data map", () => {
    const source = readAppSource("react-app/domains/settings/pages/overview-view.tsx");
    expect(source).toContain("settings-workspace-backend-control-plane");
    expect(source).toContain("client.workspaceBackendControlPlane(backendWorkspaceId)");
    expect(source).toContain("workspaceBackendControlPlaneQuery.data?.capabilities");
    expect(source).toContain("workspaceBackendControlPlaneQuery.data?.dataControls");
    expect(source).toContain("settings-backend-capabilities");
    expect(source).toContain("client.backendCapabilities()");
    expect(source).toContain("settings-workspace-readiness");
    expect(source).toContain("client.workspaceReadiness(workspaceId)");
    expect(source).toContain("workspaceReadiness.summary.recommendedActions");
    expect(source).toContain("settings-workspace-data-map");
    expect(source).toContain("client.workspaceDataMap(workspaceId)");
    expect(source).toContain("settings-workspace-data-controls");
    expect(source).toContain("client.workspaceDataControls(workspaceId)");
    expect(source).toContain("settings-team-access-summary");
    expect(source).toContain("client.workspaceTeamAccessSummary(workspaceId)");
    expect(source).toContain("settings-team-access");
    expect(source).toContain("client.workspaceTeamAccess(workspaceId)");
    expect(source).toContain("TeamAccessControls");
    expect(source).toContain("teamAccessInviteText");
    expect(source).toContain("Copy invite");
    expect(source).toContain("Teammates use Connect custom remote in the same Matterhorn interface.");
    expect(source).toContain("This is local server access, not durable Matterhorn Cloud team membership.");
    expect(source).toContain("Durable org invites and shared cloud workspaces still require Matterhorn Cloud.");
    expect(source).toContain("teamAccessSummaryQuery.data.sharingMode.label");
    expect(source).toContain("props.summary?.sharingMode.description");
    expect(source).toContain("props.summary?.scopeCapabilities");
    expect(source).toContain("capability.canWriteWorkspace");
    expect(source).toContain("createWorkspaceTeamAccessToken");
    expect(source).toContain("revokeWorkspaceTeamAccessToken");
    expect(source).toContain("Local access token created. Copy it now; it will not be shown again.");
    expect(source).toContain("props.summary?.connection ?? props.data?.connection");
    expect(source).toContain("Connect custom remote");
    expect(source).toContain("Copy server URL");
    expect(source).toContain("reachableFromOtherDevices");
    expect(source).toContain("Math.max(0, tokenCount - 1)");
    expect(source).toContain("settings-project-data-ledger");
    expect(source).toContain("client.listProjectDataLedger(workspaceId");
    expect(source).toContain("ProjectLedgerControlSummary");
    expect(source).toContain("Use the Manage links for user-controlled stores.");
    expect(source).toContain("Append-only history");
    expect(source).toContain("Project history");
    expect(source).toContain("client.exportProjectDataLedger(workspaceId");
    expect(source).toContain("client.workspaceBackendSupportReport(workspaceId)");
    expect(source).toContain("copySupportReport");
    expect(source).toContain("writeClipboardText(JSON.stringify(report, null, 2))");
    expect(source).toContain("Billing readiness is included without secrets.");
    expect(source).toContain("The browser blocked clipboard access. Click the page and try again, or use Support report.");
    expect(source).toContain("summarizeModelSelection");
    expect(source).toContain("Workspace health");
    expect(source).toContain("Support report");
    expect(source).toContain("Workspace setup");
    expect(source).toContain("Wallet safety");
    expect(source).toContain("Training use");
    expect(source).toContain("controls={workspaceDataControls}");
    const sectionSource = readAppSource("react-app/domains/settings/backend-capabilities/backend-capability-section.tsx");
    expect(sectionSource).toContain("section.route");
    expect(sectionSource).toContain("section.backendDependencies.length");
  });

  test("AI settings shows backend model routing alongside live provider counts", () => {
    const source = readAppSource("react-app/domains/settings/pages/ai-view.tsx");
    const routeSource = readAppSource("react-app/shell/settings-route.tsx");
    const sessionRouteSource = readAppSource("react-app/shell/session-route.tsx");

    expect(source).toContain("settings-backend-models");
    expect(source).toContain("client.backendModels()");
    expect(source).toContain("settings-workspace-backend-models");
    expect(source).toContain("client.workspaceBackendModels(runtimeWorkspaceId)");
    expect(source).toContain("settings-workspace-model-selection");
    expect(source).toContain("client.workspaceModelSelection(runtimeWorkspaceId)");
    expect(source).toContain("client.saveWorkspaceModelSelection(runtimeWorkspaceId");
    expect(source).toContain("client.clearWorkspaceModelSelection(runtimeWorkspaceId)");
    expect(source).toContain("notifyWorkspaceModelSelectionChanged(runtimeWorkspaceId)");
    expect(source).toContain("runtimeWorkspaceId?: string | null");
    expect(source).toContain("backendModels?.catalog");
    expect(source).toContain('catalog?.errorCode === "opencode_unconfigured"');
    expect(source).toContain("Matterhorn Desks is not ready to answer yet");
    expect(source).toContain("Models could not load");
    expect(source).toContain("buildModelReadinessSummary");
    expect(source).toContain(
      "<LayoutSectionTitle>Model provider</LayoutSectionTitle>",
    );
    expect(source).toContain(
      "Connect a provider, then choose what answers chats and desk tasks",
    );
    expect(source).toContain("onOpenModelPicker");
    expect(source).toContain("Choose model");
    expect(source).toContain("Use workspace default");
    expect(source).toContain("Save for workspace");
    expect(source).toContain("modelReadiness.workspaceDefault");
    expect(source).toContain("modelReadiness.effectiveModel");
    expect(source).toContain("modelReadiness.providerCatalog");
    expect(source).toContain("ModelRoutingRow");
    expect(source).toContain("How models work");
    expect(source).toContain("modelReadiness.catalogRows");
    expect(source).toContain("Available providers");
    expect(source).toContain("row.modelCountLabel");
    expect(source).toContain("modelReadiness.trainingPolicy");
    expect(routeSource).toContain("connectedModelCount");
    expect(routeSource).toContain("defaultModelLabel={defaultModelLabel}");
    expect(routeSource).toContain("defaultModelRef={defaultModelRef}");
    expect(routeSource).toContain("defaultModelProviderId={");
    expect(routeSource).toContain("local.prefs.defaultModel?.providerID ?? null");
    expect(routeSource).toContain("defaultModelId={local.prefs.defaultModel?.modelID ?? null}");
    expect(routeSource).toContain("hasLocalModelOverride={Boolean(local.prefs.defaultModel)}");
    expect(routeSource).toContain("onUseWorkspaceDefault={() =>");
    expect(routeSource).toContain("defaultModel: null");
    expect(routeSource).toContain("onOpenModelPicker={() =>");
    expect(routeSource).toContain("matterhornServerClient={settingsCapabilityClient}");
    expect(routeSource).toContain("runtimeWorkspaceId={runtimeWorkspaceId}");
    expect(sessionRouteSource).toContain("WORKSPACE_MODEL_SELECTION_CHANGED_EVENT");
    expect(sessionRouteSource).toContain("refreshWorkspaceModelSelection");
    expect(sessionRouteSource).toContain("WorkspaceModelSelectionChangedDetail");
    expect(sessionRouteSource).toContain("window.addEventListener(WORKSPACE_MODEL_SELECTION_CHANGED_EVENT");

    const eventSource = readAppSource("react-app/domains/settings/model-selection-events.ts");
    expect(eventSource).toContain('WORKSPACE_MODEL_SELECTION_CHANGED_EVENT = "matterhorn:workspace-model-selection-changed"');
    expect(eventSource).toContain("WorkspaceModelSelectionChangedDetail");
    expect(eventSource).toContain("notifyWorkspaceModelSelectionChanged");
  });

  test("Wallet settings uses backend wallet family status including Sui", () => {
    const walletSource = readAppSource("react-app/domains/settings/pages/wallet-view.tsx");
    const routeSource = readAppSource("react-app/shell/settings-route.tsx");
    const walletRuntimeSource = readAppSource("react-app/shell/LazyWalletRuntimeShell.tsx");
    expect(walletSource).toContain("matterhornServerClient?: MatterhornServerClient | null");
    expect(walletSource).toContain("wallet-backend-capabilities");
    expect(walletSource).toContain("matterhornServerClient.backendCapabilities()");
    expect(walletSource).toContain('wallet.family === "Sui"');
    expect(walletSource).toContain("Sui wallet");
    expect(walletSource).toContain("Wallets");
    expect(walletSource).toContain(
      "Connect a supported wallet. Signing stays in your wallet.",
    );
    expect(walletSource).toContain("Prepare Sui actions");
    expect(walletSource).toContain('"Prepare only"');
    expect(walletSource).toContain("Review & submit");
    expect(walletSource).toContain("always needs your wallet approval");
    expect(walletSource).toContain("Prepare only");
    expect(walletSource).toMatch(
      /makes a draft\s+for another compatible client/,
    );
    expect(walletSource).toContain("Limited release");
    expect(walletSource).toMatch(/means\s+compatibility is still expanding/);
    expect(walletSource).not.toContain('"Handoff only"');
    expect(walletSource).toContain("Action guide");
    expect(walletSource).toContain("Signing &amp; privacy");
    expect(walletSource).not.toContain("Matterhorn either completes the action here or prepares it for you to finish elsewhere.");
    expect(walletSource).not.toContain("Current read, preview, and signing limits.");
    expect(walletSource).toContain("useWallets");
    expect(walletSource).toContain("connectSuiWallet");
    expect(walletSource).toContain("matterhornServerClient.suiAccount(");
    expect(walletSource).toContain("suiAddress,");
    expect(walletSource).toContain("account?.address ?? phantomSui.address");
    expect(walletSource).toContain("SuiWorkflowPanel");
    expect(walletSource).toContain("WalletSafetyLedger");
    expect(walletSource).toContain("matterhornServerClient.listProjectDataLedger");
    expect(walletSource).toContain('kind: "wallet"');
    expect(walletSource).toContain('source: "audit"');
    expect(walletSource).toContain("getSecurityLog(5)");
    expect(walletSource).toContain("subscribeSecurityLog");
    expect(walletSource).toContain("Project ledger");
    expect(walletSource).toContain("Local fallback");
    expect(walletSource).toContain("useEffect(() =>");
    expect(walletSource).toContain("syncStore();");
    expect(walletSource).toContain("}, [syncStore]);");
    expect(walletSource).toContain("needsConnectionSync");
    expect(walletSource).toContain("balanceSnapshot.ethBalance !== nextEthBalance");
    expect(walletSource).not.toContain("useState(() => { syncStore(); return null; });");
    expect(walletSource).toContain("backendSui?.runtimeSupport?.[props.capability.runtime]");
    expect(walletSource).toContain("walletRuntimeSupportSummary");
    expect(walletSource).toContain("Prepare Sui actions");
    expect(walletSource).toContain("Finish wallet actions outside Matterhorn");
    expect(walletSource).toContain("wallet-extension connect");
    expect(walletSource).toContain("runtime={runtime}");
    expect(walletSource).toContain("Browser wallet extensions are available when installed and allowed.");
    expect(walletSource).not.toContain("planned wallet strategy");
    expect(walletSource).toContain("runtimeWorkspaceId?: string | null");
    expect(walletSource).toContain('sourceLabel: "Matterhorn engine"');
    expect(routeSource).toContain("runtimeWorkspaceId={runtimeWorkspaceId}");
    expect(walletRuntimeSource).toContain("DAppKitProvider");
    expect(walletRuntimeSource).toContain("suiDAppKit");
    expect(routeSource).toContain("matterhornServerClient={settingsCapabilityClient}");
  });

  test("Workspace Home exposes compact wallet runtime readiness", () => {
    const sessionSource = readAppSource("react-app/domains/session/chat/session-page.tsx");
    expect(sessionSource).toContain("HomeWalletRuntimeStatus");
    expect(sessionSource).toContain("home-wallet-backend-capabilities");
    expect(sessionSource).toContain("props.matterhornServerClient!.backendCapabilities()");
    expect(sessionSource).toContain("walletFamilySummary(capabilities)");
    expect(sessionSource).toContain("walletRuntimeSupportSummary(support)");
    expect(sessionSource).toContain("homeWalletTone(row.status)");
    expect(sessionSource).toContain('aria-label={headline}');
    expect(sessionSource).toContain("Wallet readiness");
    expect(sessionSource).toContain("Wallet readiness details");
    expect(sessionSource).not.toContain("Sui signing stays in your wallet; desktop uses external handoff.");
    expect(sessionSource).toContain("Open wallet settings");
    expect(sessionSource).toContain('onOpenWallet={() => setCurrentSidePanel("wallet")}');
  });

  test("Sui workflow panel saves wallet preview and receipt evidence through workspace routes", () => {
    const source = readAppSource("react-app/domains/wallet/sui-workflow-panel.tsx");
    const sessionSource = readAppSource("react-app/domains/session/chat/session-page.tsx");
    const activitySource = readAppSource("react-app/domains/recent-activity/recent-activity-section.tsx");

    expect(source).toContain("workspaceSuiTransactionPreview");
    expect(source).toContain("workspaceSuiTransactionReceipt");
    expect(source).toContain("signAndExecuteTransaction");
    expect(source).toContain("new Transaction()");
    expect(source).toContain("directWalletAvailable");
    expect(source).toContain("Desktop handoff:");
    expect(source).toContain("Copy handoff");
    expect(source).toContain("Prepare handoff");
    expect(source).toContain("Handoff ready");
    expect(source).toContain("Sign in wallet");
    expect(source).not.toContain("Prepare preview");
    expect(source).not.toContain("Sign preview");
    expect(source).toContain("matterhorn:task-log-updated");
    expect(source).toContain("matterhorn:project-evidence-updated");
    expect(source).toContain("embedded?: boolean");
    expect(source).toContain("!directWalletAvailable || connectedAddress");
    expect(source).toContain("account?.address ?? phantomSui.address");
    expect(source).not.toContain("No custody");
    expect(source).not.toContain("Sui wallet workflow");
    expect(source).toContain("Use wallet");
    expect(source).toContain("wallet-only. Matterhorn does not hold keys or submit directly.");
    expect(source).toContain("Do not paste signatures or signed payloads");
    expect(sessionSource).toContain('visibleSidePanel === "sui"');
    expect(sessionSource).toContain("SuiWorkflowPanel");
    expect(sessionSource).toContain('setCurrentSidePanel("wallet")');
    expect(activitySource).toContain("matterhorn:project-evidence-updated");
  });

  test("Profile readiness copy does not claim memory sync before data policy supports it", () => {
    const source = readRepoSource("packages/types/src/profile-readiness.ts");
    const viewSource = readAppSource("react-app/domains/settings/pages/cloud-account-view.tsx");
    const profileSource = readAppSource("react-app/domains/profile/profile-capability-status.tsx");
    expect(source).not.toContain("Preferences and memory are synced");
    expect(source).not.toContain("sync preferences and memory");
    expect(source).toContain("Local project memory stays on this device");
    expect(viewSource).toContain("ProfileCapabilityStatus");
    expect(viewSource).toContain("profile-backend-control-plane");
    expect(viewSource).toContain("matterhornServerClient.workspaceBackendControlPlane(workspaceIdForBackend)");
    expect(viewSource).toContain("matterhornServerClient.backendCapabilities()");
    expect(profileSource).toContain("ProfileStatusRow");
    expect(profileSource).toContain("ProfileStatusText");
    expect(profileSource).toContain("grid min-w-0 gap-1");
    expect(profileSource).not.toContain("BackendCapabilityStatusRow");
    expect(profileSource).not.toContain("col-start-2");
  });

  test("status helpers use truthful user-facing labels", () => {
    expect(backendCapabilityLabel("working")).toBe("Working");
    expect(backendCapabilityLabel("needs_setup")).toBe("Needs setup");
    expect(backendCapabilityLabel("preview")).toBe("Limited release");
    expect(backendCapabilityLabel("unsupported")).toBe("Not supported here");
    expect(backendCapabilityTone("unsupported")).toBe("neutral");
  });

  test("model and wallet helpers explain limited Sui support instead of hiding it", () => {
    const result = capabilities();
    expect(summarizeModelSource(result)).toBe("Included models / Big Pickle");
    expect(summarizeModelRoutingPolicy(result)).toContain(
      "Chats and desk tasks use the selected model",
    );
    expect(summarizeModelRoutingPolicy(result)).toContain("in Models");
    expect(summarizeModelSelection(result)).toBe(
      "You can change the workspace model in Models.",
    );
    const walletRows = walletFamilySummary(result);
    expect(walletRows.map((row) => [row.family, row.label, row.status])).toEqual([
      ["EVM", "EVM direct connect", "working"],
      ["Sui", "Sui wallet", "preview"],
      ["Bittensor", "Bittensor external signer", "preview"],
    ]);
    expect(walletRows.find((row) => row.family === "Sui")?.runtimeSupport?.web.directConnect).toBe(true);
    expect(walletRows.find((row) => row.family === "Sui")?.runtimeSupport?.desktop.directConnect).toBe(false);
    expect(walletRows.find((row) => row.family === "Sui")?.runtimeSupport?.desktop.signing).toBe("external_signer");
    const webCopy = walletRuntimeSupportSummary(walletRows.find((row) => row.family === "Sui")?.runtimeSupport?.web);
    expect(webCopy.label).toBe("Connect here · Limited release");
    expect(webCopy.detail).toContain("review and sign every transaction in your wallet");
    expect(webCopy.detail).toContain("Wallet compatibility is still expanding");
    const desktopCopy = walletRuntimeSupportSummary(walletRows.find((row) => row.family === "Sui")?.runtimeSupport?.desktop);
    expect(desktopCopy.label).toBe("Prepare only · Limited release");
    expect(desktopCopy.detail).toContain("Review, sign, and submit it in your own wallet or protocol client");
  });

  test("Sui wallet card keeps healthy capability labels silent", () => {
    const walletViewSource = readAppSource("react-app/domains/settings/pages/wallet-view.tsx");

    expect(walletViewSource).not.toContain("function suiWalletStatusLabel");
    expect(walletViewSource).not.toContain('"Preview only"');
    expect(walletViewSource).toContain(
      "Connect a supported wallet. Signing stays in your wallet.",
    );
    expect(walletViewSource).toContain("[grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]");
    expect(walletViewSource).not.toContain("border-b border-dls-border/45");
    expect(walletViewSource).not.toContain('className="grid grid-cols-2 gap-3"');
    expect(walletViewSource).not.toContain('rounded-md border px-2 py-0.5 text-xs font-medium", statusTone');
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

    expect(storageLocationLabel(dataMap.stores.chat)).toBe("Managed chat history on this device");
    expect(storageLocationLabel({ ...dataMap.stores.chat, path: undefined })).toBe("Managed chat history on this device");
    expect(storageLocationLabel(dataMap.stores.notes)).toBe("/tmp/project/notes");
    expect(workspaceDataPolicySummary(dataMap)).toBe("No training use by default.");
  });
});
