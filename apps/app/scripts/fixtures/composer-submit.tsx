/** @jsxImportSource react */
// Isolated real-composer fixture: no account, provider, or protocol requests.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactSessionComposer } from "../../src/react-app/domains/session/surface/composer/composer";
import { useComposerSubmission } from "../../src/react-app/domains/session/surface/composer/use-composer-submission";

const noop = () => {};

function Fixture() {
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
    attempt.current += 1;
    setCalls((current) => [...current, { text: draft, privacyConsentToken }]);
    setPending(true);
    await new Promise<void>((resolve) => { release.current = resolve; });
    setPending(false);
    if (params.has("failFirst") && attempt.current === 1) throw new Error("Fixture failure");
    setResult("accepted");
  });
  const managedSend = () => submission.send().catch(() => setResult("retry_available"));
  return <>
    <ReactSessionComposer
      draft={params.has("empty") ? "" : draft}
      placeholder="Test prompt"
      mentions={{}}
      onDraftChange={setDraft}
      onSend={params.has("managed") ? managedSend : send}
      onStop={() => setResult("stopped")}
      busy={params.has("busy")}
      disabled={params.has("disabled") || pending}
      statusLabel=""
      showModelPicker={false}
      modelPickerOpen={false}
      selectedModel={{ providerID: "fixture", modelID: "fixture" }}
      onModelPickerOpenChange={noop}
      onModelChange={noop}
      attachments={[]}
      onAttachFiles={noop}
      onRemoveAttachment={noop}
      attachmentsEnabled={false}
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
      notice={null}
      onNotice={noop}
      onPasteText={noop}
      onUnsupportedFileLinks={noop}
      pastedText={[]}
      onExpandPastedText={noop}
      onRevealPastedText={noop}
      onRemovePastedText={noop}
      isRemoteWorkspace={false}
      isSandboxWorkspace={false}
    />
    <output data-testid="result">{result}</output>
    <output data-testid="calls">{JSON.stringify(calls)}</output>
    <button onClick={() => release.current()}>Complete fixture request</button>
    <button onClick={managedSend}>Retry fixture request</button>
    <button onClick={() => {
      void managedSend();
      void managedSend();
    }}>Two sends before render</button>
    <button onClick={() => void submission.sendWithConsent("fixture-consent-token")}>Confirm fixture consent</button>
    <button onClick={() => void submission.sendWithConsent(undefined).catch(() => setResult("invalid_consent"))}>Missing fixture consent</button>
  </>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
