/** @jsxImportSource react */
import { Shield, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export type TxApprovalRequest = {
  to: string;
  value: string;
  data?: string;
  chainId: number;
};

export type TransactionApprovalProps = {
  store: WalletStore;
  onApprove: (tx: TxApprovalRequest) => void;
  onReject: () => void;
};

export function dispatchTxApprovalRequest(tx: TxApprovalRequest) {
  window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", { detail: tx }));
}

export function dispatchTxApprovalResponse(approved: boolean, txHash?: string) {
  window.dispatchEvent(
    new CustomEvent("matterhorn:tx-approval-response", { detail: { approved, txHash } }),
  );
}

export function TransactionApproval({ store, onApprove, onReject }: TransactionApprovalProps) {
  const state = useWalletStore(store);
  const pending = state.pendingApproval;

  useEffect(() => {
    function handleTxRequest(e: Event) {
      const detail = (e as CustomEvent).detail as TxApprovalRequest;
      store.requestApproval(detail.to, detail.value, detail.data, detail.chainId);
    }
    window.addEventListener("matterhorn:tx-approval-request", handleTxRequest);
    return () => window.removeEventListener("matterhorn:tx-approval-request", handleTxRequest);
  }, [store]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-dls-border bg-dls-sidebar p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-violet-500" />
            <h2 className="text-lg font-semibold text-dls-text">Transaction Approval</h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-8 hover:bg-dls-surface hover:text-gray-10 transition-colors"
            onClick={onReject}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-xs text-gray-8 mb-1">To</div>
            <div className="font-mono text-sm text-dls-text break-all" title={pending.to}>
              {truncateAddress(pending.to)}
            </div>
          </div>

          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-xs text-gray-8 mb-1">Value</div>
            <div className="font-mono text-sm text-dls-text">{pending.value} ETH</div>
          </div>

          {pending.data && pending.data !== "0x" && (
            <div className="rounded-xl bg-dls-surface p-3">
              <div className="text-xs text-gray-8 mb-1">Data</div>
              <div className="font-mono text-xs text-dls-text break-all max-h-20 overflow-y-auto">
                {pending.data.length > 100 ? `${pending.data.slice(0, 50)}...${pending.data.slice(-10)}` : pending.data}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-xs text-gray-8 mb-1">Chain</div>
            <div className="text-sm text-dls-text">{pending.chainId === 8453 ? "Base" : "Base Sepolia"}</div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              dispatchTxApprovalResponse(false);
              store.clearApproval();
              onReject();
            }}
          >
            Reject
          </Button>
          <Button
            className={cn("flex-1 bg-violet-500 hover:bg-violet-600 text-white")}
            onClick={() => {
              dispatchTxApprovalResponse(true);
              onApprove(pending);
              store.clearApproval();
            }}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
