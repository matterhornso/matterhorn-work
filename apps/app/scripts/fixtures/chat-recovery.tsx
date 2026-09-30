/** @jsxImportSource react */
// Mounted production SessionSurface with disposable HTTP fixtures only.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { SessionSurface } from "../../src/react-app/domains/session/surface/session-surface";
import { LocalProvider } from "../../src/react-app/kernel/local-provider";
import { ShellConfigProvider } from "../../src/react-app/shell/shell-config";
import { QuickJotProvider } from "../../src/react-app/domains/notes/quick-jot-provider";
import { DesktopConfigProvider } from "../../src/react-app/domains/cloud/desktop-config-provider";
import { DenAuthProvider } from "../../src/react-app/domains/cloud/den-auth-provider";
import { RestrictionNoticeProvider } from "../../src/react-app/domains/cloud/restriction-notice-provider";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import "../../src/app/index.css";

applyRetroUi(document.documentElement, true);
document.documentElement.dataset.theme = "light";
const client = createMatterhornServerClient({ baseUrl: location.origin, token: "disposable-fixture" });
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const noop = () => undefined;
const empty = async () => [];
createRoot(document.getElementById("root")!).render(
  <MemoryRouter><QueryClientProvider client={query}><LocalProvider><DenAuthProvider><DesktopConfigProvider><RestrictionNoticeProvider><ShellConfigProvider><QuickJotProvider>
    <div className="flex h-screen flex-col">
      <p className="p-3 text-sm">Recovery QA fixture — no live models, credentials, chains, or accounts.</p>
      <SessionSurface client={client} workspaceId="ws_recovery" workspaceRoot="/fixture" sessionId="ses_recovery"
        opencodeBaseUrl={location.origin} matterhornToken="disposable-fixture" developerMode={false}
        modelLabel="Fixture model" onModelClick={noop} modelPickerOpen={false}
        selectedModel={{ providerID: "fixture", modelID: "fixture" }} onModelPickerOpenChange={noop} onModelChange={noop}
        onSendDraft={async (draft) => {
          const result = await fetch("/__qa/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
          const body = await result.json();
          if (!result.ok) throw new Error(JSON.stringify(body));
        }} onDraftChange={noop} attachmentsEnabled={false} attachmentsDisabledReason="Fixture"
        modelBehaviorTitle="Default" modelVariantLabel="Default" modelVariant={null} modelBehaviorIsProviderDefault
        modelBehaviorDefaultLabel="Default" onModelVariantChange={noop} responsePerspective="balanced" onResponsePerspectiveChange={noop}
        executionMode="work" executionModesEnabled={false} onExecutionModeChange={noop} agentLabel="Fixture" selectedAgent={null}
        listAgents={empty} onSelectAgent={noop} listCommands={empty} recentFiles={[]} searchFiles={empty}
        isRemoteWorkspace={false} isSandboxWorkspace={false} />
    </div>
  </QuickJotProvider></ShellConfigProvider></RestrictionNoticeProvider></DesktopConfigProvider></DenAuthProvider></LocalProvider></QueryClientProvider></MemoryRouter>,
);
