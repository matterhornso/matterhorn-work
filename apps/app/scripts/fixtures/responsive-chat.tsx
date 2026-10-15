/** @jsxImportSource react */
// Production chat components, synthetic HTTP data only. Never a real-provider acceptance fixture.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Button } from "../../src/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../src/components/ui/dialog";
import { SessionPage, type SessionPageSurfaceProps } from "../../src/react-app/domains/session/chat/session-page";
import { WalletProvider } from "../../src/react-app/domains/wallet/WalletProvider";
import { StatusToastsProvider } from "../../src/react-app/domains/shell-feedback/status-toasts";
import type { WorkspaceInfo } from "../../src/app/lib/desktop";
import { providerListQueryKey } from "../../src/react-app/domains/connections/provider-list-query";
import { LocalProvider } from "../../src/react-app/kernel/local-provider";
import { PlatformProvider, createDefaultPlatform } from "../../src/react-app/kernel/platform";
import { ShellConfigProvider } from "../../src/react-app/shell/shell-config";
import { WorkspaceProvider } from "../../src/react-app/shell/workspace-provider";
import { QuickJotProvider } from "../../src/react-app/domains/notes/quick-jot-provider";
import { DesktopConfigProvider } from "../../src/react-app/domains/cloud/desktop-config-provider";
import { DenAuthProvider } from "../../src/react-app/domains/cloud/den-auth-provider";
import { RestrictionNoticeProvider } from "../../src/react-app/domains/cloud/restriction-notice-provider";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import "../../src/app/index.css";

const search = new URLSearchParams(location.search);
document.documentElement.dataset.theme = search.get("theme") === "dark" ? "dark" : "light";
const client = createMatterhornServerClient({ baseUrl: location.origin, token: "disposable-responsive-fixture" });
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
query.setQueryData(providerListQueryKey({ baseUrl: location.origin, directory: "/fixture" }), {
  connected: ["fixture"], default: {}, all: [{ id: "fixture", name: "Synthetic provider", source: "env", models: {
    asi1: { id: "asi1", name: "ASI1", capabilities: {}, variants: {} },
    alternative: { id: "alternative", name: "Alternative fixture model", capabilities: {}, variants: {} },
  } }],
});
const noop = () => undefined;
const empty = async () => [];
const workspace: WorkspaceInfo = { id: "ws_responsive", name: "Synthetic QA workspace", path: "/fixture", preset: "starter", workspaceType: "local" };

function ResponsiveChatFixture() {
  const [dialog, setDialog] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState({ providerID: "fixture", modelID: "asi1" });
  const surface: SessionPageSurfaceProps = {
    workspaceRoot: "/fixture", developerMode: false,
    modelLabel: "ASI1", onModelClick: () => setModelPickerOpen(true), modelPickerOpen,
    selectedModel, onModelPickerOpenChange: setModelPickerOpen, onModelChange: setSelectedModel,
    providerPrivacyPolicy: { providerId: "fixture", providerName: "CUDOS / ASI:Cloud", status: "unverified", trainingUse: "unknown", retentionDays: null, policyUrl: null, verifiedAt: null, allowed: false, label: "Policy unverified", description: "Synthetic unverified-policy state." },
    onOpenPrivacyDetails: () => setDialog("Provider privacy"), privateModeAvailable: false, privateModeEnabled: false,
    onPrivateModeChange: () => setDialog("Private model setup"), onOpenAiProviders: () => setDialog("Private model setup"),
    onSendDraft: async (draft, signal) => {
      const result = await fetch("/__qa/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft), signal });
      if (!result.ok) throw new Error(search.get("retry") === "outcome-unknown" ? await result.text() : "Synthetic request failed.");
      await query.invalidateQueries();
    }, onDraftChange: noop, attachmentsEnabled: true, attachmentsDisabledReason: null,
    modelBehaviorTitle: "Default", modelVariantLabel: "Default", modelVariant: null, modelBehaviorIsProviderDefault: true,
    modelBehaviorDefaultLabel: "Default", onModelVariantChange: noop, responsePerspective: "balanced", onResponsePerspectiveChange: noop,
    executionMode: "work", executionModesEnabled: true, onExecutionModeChange: noop, agentLabel: "Bittensor Agent", selectedAgent: "matterhorn-bittensor",
    listAgents: empty, onSelectAgent: noop, listCommands: empty, recentFiles: [], searchFiles: empty,
    isRemoteWorkspace: false, isSandboxWorkspace: false,
  };
  return <MemoryRouter initialEntries={["/workspace/ws_responsive/session/ses_responsive"]}><QueryClientProvider client={query}><PlatformProvider value={createDefaultPlatform()}><WorkspaceProvider client={null} opencodeBaseUrl={location.origin} selectedWorkspaceRoot="/fixture"><LocalProvider><DenAuthProvider><DesktopConfigProvider><RestrictionNoticeProvider><ShellConfigProvider><QuickJotProvider><WalletProvider><StatusToastsProvider>
    <SessionPage selectedSessionId="ses_responsive" selectedWorkspaceId="ws_responsive" selectedWorkspaceDisplay={workspace}
      selectedWorkspaceRoot="/fixture" runtimeWorkspaceId="ws_responsive" opencodeBaseUrl={location.origin} workspaces={[workspace]}
      clientConnected matterhornServerStatus="connected" matterhornServerClient={client} matterhornServerToken="disposable-responsive-fixture"
      developerMode={false} headerStatus="Synthetic fixture" busyHint={null} startupPhase="ready" providerConnectedIds={["fixture"]}
      mcpConnectedCount={0} onSendFeedback={() => setDialog("Send feedback")} onOpenSettings={() => setDialog("Profile & Settings")}
      todos={[]} sessionLoadingById={() => false} onRenameSession={noop} surface={surface}
      sidebar={{ workspaceSessionGroups: [{ workspace, sessions: [{ id: "ses_responsive", title: "Bittensor chat", time: { created: 1000 } }], status: "ready" }],
        selectedWorkspaceId: workspace.id, selectedSessionId: "ses_responsive", developerMode: false, sessionStatusById: {}, connectingWorkspaceId: null,
        workspaceConnectionStateById: {}, newTaskDisabled: false, sidebarHydratedFromCache: true, startupPhase: "ready",
        onSelectWorkspace: noop, onOpenSession: noop, onCreateTaskInWorkspace: noop, onOpenRenameWorkspace: noop, onShareWorkspace: noop,
        onRevealWorkspace: noop, onForgetWorkspace: noop, onOpenCreateWorkspace: () => setDialog("Workspace setup") }} />
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{dialog}</DialogTitle><DialogDescription>Synthetic callback reached. No model, provider policy, or account was changed.</DialogDescription></DialogHeader><Button onClick={() => setDialog(null)}>Close fixture dialog</Button></DialogContent>
    </Dialog>
  </StatusToastsProvider></WalletProvider></QuickJotProvider></ShellConfigProvider></RestrictionNoticeProvider></DesktopConfigProvider></DenAuthProvider></LocalProvider></WorkspaceProvider></PlatformProvider></QueryClientProvider></MemoryRouter>;
}

createRoot(document.getElementById("root")!).render(<ResponsiveChatFixture />);
