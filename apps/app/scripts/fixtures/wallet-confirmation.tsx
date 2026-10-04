/** @jsxImportSource react */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { createMatterhornServerClient } from "../../src/app/lib/matterhorn-server";
import { accountClientState } from "../../src/app/lib/account-client-state";
import { useWalletConfirmationRecovery } from "../../src/react-app/domains/wallet/use-wallet-confirmation-recovery";
import { WalletConfirmationNotice } from "../../src/react-app/domains/wallet/wallet-confirmation-notice";
import "../../src/app/index.css";

document.documentElement.dataset.matterhornUi = "retro";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
accountClientState.bind(location.origin, "fixture-a");
const client = createMatterhornServerClient({ baseUrl: location.origin });
function Fixture() {
  const recovery = useWalletConfirmationRecovery(client, "fixture-workspace");
  const [message, setMessage] = useState("");
  const [submissions, setSubmissions] = useState(0);
  const [action, setAction] = useState<"file-renewal" | "evidence-anchor">("evidence-anchor");
  const run = async () => {
    setMessage("");
    try {
      await recovery.execute(action, "fixture-record", async () => ({
        pending: {
          action, resourceId: "fixture-record", revision: 2, signer: `0x${"1".repeat(64)}`, network: "testnet",
          intentId: "fixture-intent", intentHash: "a".repeat(64), transactionDigest: "3".repeat(44),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        },
        submit: async () => { setSubmissions((value) => value + 1); },
      }));
      setMessage("Matching transaction recorded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Fixture failed"); }
  };
  return <main className="mx-auto max-w-3xl bg-background px-5 py-6 text-foreground">
    <h1 className="text-xl font-semibold">Wallet confirmation QA</h1>
    <p className="my-4 leading-6">Synthetic wallet and API responses only. No wallet connection, chain, account credentials or funds.</p>
    <div className="flex flex-wrap gap-3" aria-label="Synthetic QA controls">
      <label>Action <select value={action} onChange={(event) => setAction(event.target.value === "file-renewal" ? "file-renewal" : "evidence-anchor")}>
        <option value="evidence-anchor">Sui anchor</option><option value="file-renewal">File renewal</option>
      </select></label>
      <Button disabled={!recovery.ready} onClick={() => void run()}>Simulate wallet request</Button>
      <Button variant="outline" onClick={() => void fetch("/__qa/restore", { method: "POST" })}>Restore verifier</Button>
      <Button variant="outline" onClick={() => accountClientState.bind(location.origin, "fixture-b")}>Switch account</Button>
    </div>
    <p className="mt-4" role="status">Synthetic submissions in this mount: {submissions}</p>
    {message ? <p className="mt-4 leading-6" role="alert">{message}</p> : null}
    <WalletConfirmationNotice recovery={recovery} kind="evidence" onConfirmed={async () => { setMessage("Matching transaction recorded."); }} />
    <WalletConfirmationNotice recovery={recovery} kind="file" onConfirmed={async () => { setMessage("Matching transaction recorded."); }} />
  </main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
