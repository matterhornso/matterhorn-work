/** @jsxImportSource react */
// Isolated UI acceptance fixture: no accounts, TypeSafe, models or chains are contacted.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import { useJevChat } from "../../src/react-app/domains/session/surface/use-jev-chat";
import { JevChatControl } from "../../src/react-app/domains/session/surface/jev-chat-control";
import { Button } from "../../src/components/ui/button";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import "../../src/app/index.css";

applyRetroUi(document.documentElement, true);
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
function Fixture() {
  const [account, setAccount] = useState("alice");
  const client = useMemo(() => createMatterhornServerClient({ baseUrl: location.origin, token: account }), [account]);
  const [sessionId, setSessionId] = useState("session-a");
  const [privateMode, setPrivateMode] = useState(false);
  const [draft, setDraft] = useState("Compare public Bittensor validators.");
  const [modelId, setModelId] = useState("asi1-mini");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const model = useMemo(() => ({ providerID: "cudos", modelID: modelId }), [modelId]);
  const jev = useJevChat({ client, workspaceId: "fixture", sessionId, model, privateMode });
  async function send() {
    setBusy(true); setResult("");
    try {
      const prepared = await jev.prepare({ mode: "prompt", text: draft, parts: [{ type: "text", text: draft }], attachments: [] });
      const request = { parts: prepared.parts, model: { providerId: model.providerID, modelId: model.modelID }, ...(prepared.jevReceipt ? { jevReceipt: prepared.jevReceipt } : {}) };
      await client.preflightAgentMessage("fixture", sessionId, request);
      await client.sendAgentMessage("fixture", sessionId, request);
      setResult(`Fixture response from ${model.modelID}`);
    } catch (error) { setResult(error instanceof Error ? error.message : "Failed"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
    <p className="text-xs text-dls-secondary">Local Jev fixture — no live provider requests</p>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dls-border pb-4">
      <h1 className="text-lg font-semibold">Bittensor</h1>
      <label className="text-sm">Model <select aria-label="Selected model" value={modelId} onChange={event => setModelId(event.target.value)}>
        <option value="asi1-mini">ASI1 Mini</option><option value="asi1">ASI1</option>
      </select></label>
    </header>
    <div className="min-h-24 text-sm" data-testid="answer">{result || "Ask a question about public validators."}</div>
    <section aria-label="Message composer" className="space-y-3">
      <JevChatControl enabled={jev.enabled} available={Boolean(jev.availability?.available)} loading={!jev.availability && !jev.notice}
        privateMode={privateMode} notice={jev.notice} onChange={jev.change} />
      <label className="block text-sm">Message<textarea className="mt-2 min-h-28 w-full resize-y border border-dls-border bg-dls-surface p-3 text-dls-text" value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={!busy} onClick={jev.cancel}>Stop</Button><Button disabled={busy} onClick={() => void send()}>Send</Button></div>
    </section>
    <div className="flex flex-wrap gap-2 border-t border-dls-border pt-4">
      <Button variant="outline" onClick={() => setSessionId(id => `${id}-new`)}>New chat</Button>
      <Button variant="outline" onClick={() => setAccount(id => id === "alice" ? "bob" : "alice")}>Switch test account</Button>
      <Button variant="outline" aria-pressed={privateMode} onClick={() => setPrivateMode(value => !value)}>Private mode</Button>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
