/** @jsxImportSource react */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DenAuthProvider, useDenAuth } from "../../src/react-app/domains/cloud/den-auth-provider";
import { BetaAuthProvider, useBetaAuth } from "../../src/react-app/domains/auth/beta-auth-provider";
import { DesktopConfigProvider } from "../../src/react-app/domains/cloud/desktop-config-provider";
import { PlatformProvider, createDefaultPlatform } from "../../src/react-app/kernel/platform";
import { writeDenSettings } from "../../src/app/lib/den";
import { accountClientState } from "../../src/app/lib/account-client-state";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import { useSessionDraftState, getSessionDraft } from "../../src/react-app/domains/session/sync/draft-store";
import { getReactQueryClient } from "../../src/react-app/infra/query-client";
import { applyRetroUi } from "../../src/app/lib/retro-ui";
import "../../src/app/index.css";

applyRetroUi(document.documentElement, true);
document.documentElement.dataset.theme = "light";
let queuedWrite: (() => void) | null = null;
const client = createMatterhornServerClient({ baseUrl: location.origin });

function Composer() {
  const auth = useDenAuth();
  const draft = useSessionDraftState("shared-workspace-fixture", "shared-session-fixture");
  return <section className="space-y-3">
    <label className="block" htmlFor="draft">Fixture draft</label>
    <textarea id="draft" className="w-full border p-3" value={draft.snapshot?.text ?? ""}
      onChange={event => draft.save({ text: event.target.value, mode: "prompt" })} />
    <button className="border p-3" onClick={() => { const oldAccount = auth.user?.id; queuedWrite = () => draft.save({ text: `late private draft from ${oldAccount}`, mode: "prompt" }); }}>Queue old draft write</button>
  </section>;
}

function Fixture() {
  const auth = useDenAuth();
  const beta = useBetaAuth();
  const [outcome, setOutcome] = useState("");
  const [evidence, setEvidence] = useState("");
  const login = async (id: string) => {
    await fetch(`/__qa/login/${id}`, { method: "POST" });
    writeDenSettings({ baseUrl: location.origin, apiBaseUrl: location.origin, authToken: `synthetic-${id}` }, { persistBootstrap: false });
    await auth.refresh();
  };
  const simulate = async (path: string) => { await fetch(`/__qa/${path}`, { method: "POST" }); await auth.refresh(); };
  const inspect = () => setEvidence(JSON.stringify({
    status: auth.status, user: auth.user?.id ?? null,
    draft: getSessionDraft("shared-workspace-fixture", "shared-session-fixture"),
    persistedDraft: localStorage.getItem("openwork.session-drafts.v1"),
    lateAnswer: getReactQueryClient().getQueryData(["late-answer"]) ?? null,
    appearance: localStorage.getItem("fixture-appearance"), generation: accountClientState.generation(),
  }, null, 2));
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-xl font-bold">Account boundary QA fixture</h1>
    <p>Synthetic accounts and HTTP responses only. No live account, provider, wallet or chat data.</p>
    <p role="status">{auth.status}: {auth.user?.name ?? "No account"}</p>
    {auth.error && <p role="alert">{auth.error}</p>}
    <div className="flex flex-wrap gap-3">
      <button className="border p-3" onClick={() => void login("a")}>Sign in A</button>
      <button className="border p-3" onClick={() => void login("b")}>Sign in B</button>
      <button className="border p-3" onClick={() => void auth.refresh()}>Refresh account</button>
      <button className="border p-3" onClick={() => void beta.signOut()}>Sign out</button>
      <button className="border p-3" onClick={() => void simulate("expire")}>Expire session</button>
      <button className="border p-3" onClick={() => void simulate("offline")}>Simulate offline</button>
      <button className="border p-3" onClick={() => void simulate("online")}>Restore connection</button>
    </div>
    {auth.isSignedIn && <Composer key={auth.user?.id} />}
    <div className="flex flex-wrap gap-3">
      <button className="border p-3" onClick={() => {
        setOutcome("Waiting for fixture response");
        void client.health().then(value => {
          getReactQueryClient().setQueryData(["late-answer"], value.version);
          setOutcome("Response accepted");
        }).catch(error => setOutcome(error instanceof Error ? error.message : "Rejected"));
      }}>Start delayed response</button>
      <button className="border p-3" onClick={() => { queuedWrite?.(); queuedWrite = null; void fetch("/__qa/release", { method: "POST" }); }}>Release delayed work</button>
      <button className="border p-3" onClick={inspect}>Inspect cleanup</button>
    </div>
    <p>{outcome}</p><pre className="whitespace-pre-wrap">{evidence}</pre>
  </main>;
}

localStorage.setItem("fixture-appearance", "keep-light");
createRoot(document.getElementById("root")!).render(
  <PlatformProvider value={createDefaultPlatform()}><DenAuthProvider><DesktopConfigProvider><BetaAuthProvider>
    <Fixture />
  </BetaAuthProvider></DesktopConfigProvider></DenAuthProvider></PlatformProvider>,
);
