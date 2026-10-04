/** @jsxImportSource react */
// Isolated real-composer fixture: no account, provider, or protocol requests.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactSessionComposer } from "../../src/react-app/domains/session/surface/composer/composer";
import { useComposerSubmission } from "../../src/react-app/domains/session/surface/composer/use-composer-submission";
import { SigninBoundary } from "../../src/react-app/shell/signin-boundary";
import { useComposerStateStore } from "../../src/react-app/domains/session/surface/composer-state-store";
import { accountClientState } from "../../src/app/lib/account-client-state";
import type { DenAuthStatus } from "../../src/react-app/domains/cloud/den-auth-provider";
import { applyRetroUi, RETRO_UI } from "../../src/app/lib/retro-ui";
import { PrimaryDeskLauncher } from "../../src/react-app/domains/session/workflows/primary-desk-launcher";
import { AppSidebar } from "../../src/react-app/domains/session/sidebar/app-sidebar";
import { ShellConfigProvider } from "../../src/react-app/shell/shell-config";
import { SidebarProvider, SidebarTrigger } from "../../src/components/ui/sidebar";
import { Button } from "../../src/components/ui/button";
import { ModelSelect } from "../../src/components/model-select";
import { WorkspaceProvider } from "../../src/react-app/shell/workspace-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { providerListQueryKey } from "../../src/react-app/domains/connections/provider-list-query";
import { PRIMARY_DESKS } from "../../src/app/lib/minimal-ui";
import type { WorkspaceSessionGroup } from "../../src/app/types";
import type { ComposerAttachment } from "../../src/app/types";
import type { ReactComposerNotice } from "../../src/react-app/domains/session/surface/composer/notice";
import "../../src/app/index.css";

applyRetroUi(document.documentElement, RETRO_UI);
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";

const noop = () => {};
function CompactModelFixture() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState({ providerID: "", modelID: "" });
  const [draft, setDraft] = useState("Unsent compact-picker draft");
  const [queryClient] = useState(() => {
    const cache = new QueryClient();
    cache.setQueryData(providerListQueryKey({ baseUrl: location.origin, directory: "/fixture" }), {
      connected: ["cudos"], default: {}, all: [{ id: "cudos", name: "ASI:Cloud", source: "env", models: {
        "asi1-mini": { id: "asi1-mini", name: "ASI1 Mini", capabilities: {}, variants: {} },
        "text-embedding-3": { id: "text-embedding-3", name: "Embedding only", capabilities: {}, variants: {} },
      } }],
    });
    return cache;
  });
  return <QueryClientProvider client={queryClient}><WorkspaceProvider client={null} opencodeBaseUrl={location.origin} selectedWorkspaceRoot="/fixture">
    <main className="space-y-4 p-6"><h1>Isolated header model selector</h1>
      <label>Draft<textarea value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <ModelSelect open={open} onOpenChange={setOpen} value={value} onChange={setValue} />
      <output data-testid="model-selected">{value.modelID}</output>
    </main>
  </WorkspaceProvider></QueryClientProvider>;
}
const fixtureGroups: WorkspaceSessionGroup[] = [{
  workspace: { id: "fixture", name: "Disposable workspace", path: "/fixture", preset: "starter", workspaceType: "local" },
  sessions: [{ id: "fixture-chat", title: "Research draft", time: { created: 1 } }], status: "ready",
}];

function SidebarFixture() {
  const [action, setAction] = useState("");
  return <ShellConfigProvider><SidebarProvider>
    <AppSidebar workspaceSessionGroups={fixtureGroups} selectedWorkspaceId="fixture" selectedSessionId="fixture-chat"
      developerMode={false} connectingWorkspaceId={null} workspaceConnectionStateById={{}} newTaskDisabled={false}
      onSelectWorkspace={() => setAction("Workspace selected")} onOpenSession={() => setAction("Conversation selected")}
      onCreateTaskInWorkspace={() => setAction("New chat requested")} onOpenSettings={() => setAction("Settings requested")}
      onOpenRenameWorkspace={noop} onShareWorkspace={noop} onRevealWorkspace={noop} onForgetWorkspace={noop} onOpenCreateWorkspace={() => setAction("Workspace setup requested")}
      deskNavigation={<nav aria-label="Desks" className="grid gap-1">{PRIMARY_DESKS.map(desk => <Button key={desk.id} variant="ghost" className="justify-start" onClick={() => setAction(desk.name)}>{desk.name}</Button>)}</nav>} />
    <div className="min-w-0 flex-1">
      <header className="matterhorn-workspace-header flex items-center gap-3 p-4"><SidebarTrigger /><h1 className="text-base font-semibold">Isolated workspace navigation</h1></header>
      <p role="status" className="px-6">{action}</p>
      <Fixture />
    </div>
  </SidebarProvider></ShellConfigProvider>;
}

function AuthFixture() {
  const [status, setStatus] = useState<DenAuthStatus>("signed_in");
  return <>
    <button onClick={() => setStatus("checking")}>Recheck session</button>
    <button onClick={() => setStatus("signed_in")}>Confirm session</button>
    <button onClick={() => setStatus("signed_out")}>Expire session</button>
    <SigninBoundary required status={status} loading={<p role="status">Checking session</p>} signedOut={<h1>Sign in</h1>}>
      <h1>Authenticated desk</h1>
    </SigninBoundary>
  </>;
}

function Fixture() {
  const [attachmentScope, setAttachmentScope] = useState("first");
  const [attachmentAllowed, setAttachmentAllowed] = useState(true);
  const [composerVisible, setComposerVisible] = useState(true);
  const [attachmentCallbacks, setAttachmentCallbacks] = useState(0);
  const [noticeCallbacks, setNoticeCallbacks] = useState(0);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [notice, setNotice] = useState<ReactComposerNotice | null>(null);
  const [desk, setDesk] = useState("");
  const [draft, setDraft] = useState("Explain a blockchain in one sentence.");
  const [result, setResult] = useState("");
  const [calls, setCalls] = useState<unknown[]>([]);
  const [pending, setPending] = useState(false);
  const release = useRef<() => void>(() => {});
  const attempt = useRef(0);
  const params = new URLSearchParams(location.search);
  const send = (privacyConsentToken?: unknown) => {
    try {
      setResult(JSON.stringify({ parts: [{ type: "text", text: draft }], privacyConsentToken }));
    } catch {
      setResult("serialization_failed");
    }
  };
  const submission = useComposerSubmission(async (privacyConsentToken) => {
    if (params.has("draftRace")) useComposerStateStore.getState().setDraft("fixture", draft);
    const submitted = useComposerStateStore.getState().sessions.fixture;
    attempt.current += 1;
    setCalls((current) => [...current, { text: draft, privacyConsentToken }]);
    setPending(true);
    await new Promise<void>((resolve) => { release.current = resolve; });
    setPending(false);
    if (params.has("failFirst") && attempt.current === 1) throw new Error("Fixture failure");
    if (params.has("draftRace") && useComposerStateStore.getState().clearSubmittedSession("fixture", submitted)) setDraft("");
    setResult("accepted");
  });
  const managedSend = () => submission.send().catch(() => setResult("retry_available"));
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <p>Isolated desk/composer fixture. No account, provider or chain requests.</p>
    {params.has("launcher") ? <><PrimaryDeskLauncher onOpenDesk={setDesk} /><output data-testid="selected-desk">{desk}</output></> : null}
    {composerVisible ? <ReactSessionComposer
      draftScopeKey={attachmentScope}
      draft={params.has("empty") ? "" : draft}
      placeholder="Test prompt"
      mentions={{}}
      onDraftChange={(text) => {
        setDraft(text);
        if (params.has("draftRace")) useComposerStateStore.getState().setDraft("fixture", text);
      }}
      onSend={params.has("managed") ? managedSend : send}
      onStop={() => setResult("stopped")}
      busy={params.has("busy")}
      disabled={params.has("disabled") || (pending && !params.has("draftRace"))}
      statusLabel=""
      showModelPicker={false}
      modelPickerOpen={false}
      selectedModel={{ providerID: "fixture", modelID: "fixture" }}
      onModelPickerOpenChange={noop}
      onModelChange={noop}
      attachments={attachments}
      onAttachFiles={files => {
        setAttachmentCallbacks(count => count + 1);
        setAttachments(current => [...current, ...files.map((file): ComposerAttachment => ({
          id: `${current.length}-${file.name}`, name: file.name, size: file.size,
          mimeType: file.type, kind: "file", file,
        }))]);
      }}
      onRemoveAttachment={id => setAttachments(current => current.filter(file => file.id !== id))}
      attachmentsEnabled={params.has("attachments") && attachmentAllowed}
      attachmentsDisabledReason={null}
      modelBehaviorTitle="Default"
      modelVariantLabel="Default"
      modelVariant={null}
      modelBehaviorIsProviderDefault={true}
      modelBehaviorDefaultLabel="Default"
      onModelVariantChange={noop}
      responsePerspective="balanced"
      onResponsePerspectiveChange={noop}
      executionMode="discuss"
      executionModesEnabled={false}
      onExecutionModeChange={noop}
      agentLabel="Private AI"
      selectedAgent={null}
      listAgents={async () => []}
      onSelectAgent={noop}
      listCommands={async () => []}
      recentFiles={[]}
      searchFiles={async () => []}
      onInsertMention={noop}
      notice={notice}
      onNotice={value => { setNoticeCallbacks(count => count + 1); setNotice(value); }}
      onPasteText={noop}
      onUnsupportedFileLinks={noop}
      pastedText={[]}
      onExpandPastedText={noop}
      onRevealPastedText={noop}
      onRemovePastedText={noop}
      isRemoteWorkspace={false}
      isSandboxWorkspace={false}
    /> : null}
    {params.has("attachmentLifetime") ? <section aria-label="Attachment fixture controls">
      <button onClick={() => setAttachmentScope("second")}>Change fixture chat</button>
      <button onClick={() => setAttachmentScope("first")}>Return to fixture chat</button>
      <button onClick={() => setAttachmentAllowed(false)}>Disable fixture attachments</button>
      <button onClick={() => setAttachmentAllowed(true)}>Enable fixture attachments</button>
      <button onClick={() => setComposerVisible(false)}>Unmount fixture composer</button>
      <button onClick={() => accountClientState.clear()}>Clear fixture account</button>
      <output data-testid="attachment-callbacks">{attachmentCallbacks}</output>
      <output data-testid="notice-callbacks">{noticeCallbacks}</output>
    </section> : null}
    <output data-testid="result">{result}</output>
    <output data-testid="calls">{JSON.stringify(calls)}</output>
    <output data-testid="attachments">{JSON.stringify(attachments.map(file => ({ name: file.name, size: file.size })))}</output>
    <button onClick={() => release.current()}>Complete fixture request</button>
    <button onClick={managedSend}>Retry fixture request</button>
    <button onClick={() => {
      void managedSend();
      void managedSend();
    }}>Two sends before render</button>
    <button onClick={() => void submission.sendWithConsent("fixture-consent-token")}>Confirm fixture consent</button>
    <button onClick={() => void submission.sendWithConsent(undefined).catch(() => setResult("invalid_consent"))}>Missing fixture consent</button>
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
const fixtureParams = new URLSearchParams(location.search);
createRoot(root).render(fixtureParams.has("compactModels") ? <CompactModelFixture /> : fixtureParams.has("authBoundary") ? <AuthFixture /> : fixtureParams.has("sidebar") ? <SidebarFixture /> : <Fixture />);
