/** @jsxImportSource react */
import { Shield, X, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore, computeTxValueUSD } from "./state/wallet-store";
import { CHAIN_NAMES } from "../../infra/chains";
import { isWhitelistedAddress } from "./infra/whitelist";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export type TxApprovalRequest = {
  to: string;
  value: string;
  data?: string;
  chainId: number;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
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
      store.requestApproval(detail.to, detail.value, detail.data, detail.chainId, detail.proposedBy, detail.riskLevel);
    }
    window.addEventListener("matterhorn:tx-approval-request", handleTxRequest);
    return () => window.removeEventListener("matterhorn:tx-approval-request", handleTxRequest);
  }, [store]);

  // Allow rejecting via Escape key
  useEffect(() => {
    if (!pending) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dispatchTxApprovalResponse(false);
        store.clearApproval();
        onReject();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pending, store, onReject]);

  if (!pending) return null;

  const isContractInteraction = pending.data && pending.data !== "0x";
  const isWhitelisted = isWhitelistedAddress(pending.chainId, pending.to);
  const isMainnet = pending.chainId === 8453;
  const chainName = CHAIN_NAMES[pending.chainId] ?? `Chain ${pending.chainId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-dls-border bg-dls-sidebar p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10">
              <Shield className="size-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-dls-text">Transaction Approval</h2>
              <p className="text-xs text-dls-secondary">Review before signing</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
            onClick={() => {
              dispatchTxApprovalResponse(false);
              store.clearApproval();
              onReject();
            }}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Mainnet warning */}
        {isMainnet && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              You are on Base Mainnet — this will spend real money.
            </p>
          </div>
        )}

        {/* Spend limit warning */}
        {state.pendingApproval && state.maxPerTransactionUSD > 0 && computeTxValueUSD(state.pendingApproval.value) > state.maxPerTransactionUSD && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This transaction exceeds your per-transaction limit of ${state.maxPerTransactionUSD}. Go to Settings &gt; Wallet to increase.
            </p>
          </div>
        )}

        {/* Daily limit warning */}
        {state.pendingApproval && state.maxDailySpendUSD > 0 && (state.dailySpendUSD + computeTxValueUSD(state.pendingApproval.value)) > state.maxDailySpendUSD && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This transaction exceeds your daily limit of ${state.maxDailySpendUSD}. Go to Settings &gt; Wallet to increase.
            </p>
          </div>
        )}

        {/* Whitelist warning */}
        {!isWhitelisted && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This contract is not on the known protocol whitelist. Only proceed if you trust this address.
            </p>
          </div>
        )}

        {/* Warning for contract interactions */}
        {isContractInteraction && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This is a contract interaction. Make sure you trust the contract.
            </p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2.5 mb-6">
          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">To</div>
            <div className="font-mono text-sm text-dls-text break-all" title={pending.to}>
              {truncateAddress(pending.to)}
            </div>
          </div>

          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Value</div>
            <div className="font-mono text-sm text-dls-text">{pending.value} ETH</div>
          </div>

          {isContractInteraction && (
            <div className="rounded-xl bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Data</div>
              <div className="font-mono text-xs text-dls-text break-all max-h-24 overflow-y-auto scrollbar-thin">
                {pending.data!.length > 120 ? `${pending.data!.slice(0, 60)}...${pending.data!.slice(-20)}` : pending.data}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Network</div>
            <div className="flex items-center gap-2 text-sm text-dls-text">
              <span className={cn("size-2 rounded-full", isMainnet ? "bg-red-500" : "bg-yellow-500")} />
              <span className={cn(isMainnet && "font-semibold text-red-400")}>{chainName}</span>
            </div>
          </div>

          <div className="rounded-xl bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Proposed By</div>
            <div className="font-mono text-sm text-dls-text">{pending.proposedBy}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-1.5 h-11"
            onClick={() => {
              dispatchTxApprovalResponse(false);
              store.clearApproval();
              onReject();
            }}
          >
            <XCircle className="size-4" />
            Reject
          </Button>
          <Button
            className={cn("flex-1 gap-1.5 h-11 bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/20")}
            onClick={() => {
              dispatchTxApprovalResponse(true);
              onApprove(pending);
              store.clearApproval();
            }}
          >
            <CheckCircle2 className="size-4" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
