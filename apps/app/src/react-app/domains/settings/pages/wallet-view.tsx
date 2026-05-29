/** @jsxImportSource react */
import { Wallet, Shield, History, Settings as SettingsIcon } from "lucide-react";

import type { WalletStore } from "../../wallet/state/wallet-store";
import { useWalletStore } from "../../wallet/state/wallet-store";
import { WalletConnect } from "../../wallet/WalletConnect";
import { WalletPanel } from "../../wallet/WalletPanel";
import { TransactionApproval } from "../../wallet/TransactionApproval";
import { CHAIN_NAMES } from "../../../infra/chains";
import { USDC_BY_CHAIN } from "../../../infra/contracts";

export type WalletSettingsViewProps = {
  store: WalletStore;
  onTxApprove: (tx: { to: string; value: string; data?: string; chainId: number }) => void;
  onTxReject: () => void;
};

export function WalletSettingsView({ store, onTxApprove, onTxReject }: WalletSettingsViewProps) {
  const state = useWalletStore(store);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-dls-text">Wallet</h2>
        <p className="mt-1 text-sm text-gray-8">
          Connect your wallet to enable on-chain actions and transactions.
        </p>
      </div>

      <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-5 text-violet-500" />
            <span className="font-medium text-dls-text">Connection</span>
          </div>
          <WalletConnect store={store} />
        </div>
      </div>

      {state.isConnected && (
        <>
          <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="size-5 text-violet-500" />
              <span className="font-medium text-dls-text">Wallet Details</span>
            </div>
            <WalletPanel store={store} />
          </div>

          <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
            <div className="flex items-center gap-2 mb-4">
              <SettingsIcon className="size-5 text-violet-500" />
              <span className="font-medium text-dls-text">Network</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-8">Chain</span>
                <span className="text-gray-10">{CHAIN_NAMES[state.chainId ?? 0] ?? "Unknown"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-8">USDC Address</span>
                <span className="font-mono text-xs text-gray-10">
                  {state.chainId && USDC_BY_CHAIN[state.chainId]
                    ? `${USDC_BY_CHAIN[state.chainId]!.slice(0, 6)}...${USDC_BY_CHAIN[state.chainId]!.slice(-4)}`
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dls-border bg-dls-sidebar p-4">
            <div className="flex items-center gap-2 mb-4">
              <History className="size-5 text-violet-500" />
              <span className="font-medium text-dls-text">Transaction History</span>
            </div>
            {state.transactions.length === 0 ? (
              <p className="text-sm text-gray-8">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {state.transactions.map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center justify-between rounded-lg bg-dls-surface px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-gray-10">
                      {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                    </span>
                    <span className="text-gray-8">
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </span>
                    <span
                      className={
                        tx.status === "confirmed"
                          ? "text-green-400"
                          : tx.status === "failed"
                            ? "text-red-400"
                            : "text-yellow-400"
                      }
                    >
                      {tx.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <TransactionApproval store={store} onApprove={onTxApprove} onReject={onTxReject} />
    </div>
  );
}
