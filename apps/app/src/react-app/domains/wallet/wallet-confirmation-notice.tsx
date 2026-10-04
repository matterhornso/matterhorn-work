/** @jsxImportSource react */
import { Button } from "../../../components/ui/button";
import type { useWalletConfirmationRecovery } from "./use-wallet-confirmation-recovery";

const labels = {
  "evidence-renewal": "Backup renewal", "file-renewal": "File backup renewal",
  "evidence-deletion": "Walrus deletion", "evidence-anchor": "Sui anchor",
};

export function WalletConfirmationNotice(props: {
  recovery: ReturnType<typeof useWalletConfirmationRecovery>;
  kind: "file" | "evidence";
  onConfirmed: () => Promise<void>;
}) {
  const pending = props.recovery.pending.filter((item) => (item.action === "file-renewal") === (props.kind === "file"));
  if (!pending.length && !props.recovery.error) return null;
  return (
    <section className="border-b border-border py-4 text-sm text-foreground" aria-label="Wallet confirmation recovery">
      {props.recovery.error ? <p role="alert" className="mb-3 leading-6 text-destructive">{props.recovery.error}</p> : null}
      {pending.map((item) => (
        <div key={`${item.action}:${item.resourceId}`} className="py-2">
          <p className="font-semibold">{labels[item.action]} · Confirmation pending</p>
          <p className="mt-1 max-w-prose leading-6">Check the transaction in your wallet. Checking confirmation will not open another wallet request.</p>
          <details className="mt-2">
            <summary className="cursor-pointer">Transaction details</summary>
            <dl className="mt-2 space-y-1 break-all text-xs leading-5">
              <dt>Network</dt><dd>Sui testnet</dd>
              <dt>Transaction</dt><dd className="font-mono">{item.transactionDigest}</dd>
              <dt>Wallet</dt><dd className="font-mono">{item.signer}</dd>
              <dt>Confirmation deadline</dt><dd>{new Date(item.expiresAt).toLocaleString()}</dd>
            </dl>
          </details>
          <Button className="mt-3 min-h-11" size="sm" variant="outline" disabled={props.recovery.busy || !props.recovery.ready}
            onClick={() => void props.recovery.retry(item, props.onConfirmed)}>
            {props.recovery.busy ? "Checking confirmation…" : "Check confirmation"}
          </Button>
        </div>
      ))}
    </section>
  );
}
