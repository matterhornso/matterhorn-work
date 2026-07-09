/** @jsxImportSource react */
import { Shield, X, AlertTriangle, CheckCircle2, XCircle, TrendingUp, Fuel, FileCode } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore, computeTxValueUSD, formatTxValueEth } from "./state/wallet-store";
import { CHAIN_NAMES, FORCE_TESTNET } from "../../infra/chains";
import { isWhitelistedAddress } from "./infra/whitelist";
import { estimateGasClient, type GasEstimateResult } from "./lib/gas-estimate";
import { lookupEnsName, truncateAddress } from "./lib/ens";
import { TransactionBatch } from "./components/TransactionBatch";

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
  /** Called to execute a single batch step (for multi-hop / batch approvals). */
  onExecuteBatchStep?: (step: { to: string; data?: string; value?: string; chainId?: number }) => Promise<string>;
};

export function dispatchTxApprovalRequest(tx: TxApprovalRequest) {
  window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", { detail: tx }));
}

export function dispatchTxApprovalResponse(approved: boolean, txHash?: string) {
  window.dispatchEvent(
    new CustomEvent("matterhorn:tx-approval-response", { detail: { approved, txHash } }),
  );
}

const MAINNET_COUNTDOWN_SECONDS = 3;

function decodeSelector(data: string): { selector: string; signature: string | null } {
  const clean = data.toLowerCase().replace(/^0x/, "");
  const selector = `0x${clean.slice(0, 8)}`;
  const KNOWN: Record<string, string> = {
    "0x095ea7b3": "approve(address,uint256)",
    "0xa9059cbb": "transfer(address,uint256)",
    "0x23b872dd": "transferFrom(address,address,uint256)",
    "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
    "0x8803dbee": "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
    "0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
    "0x18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
    "0xd0e30db0": "deposit()",
    "0x2e1a7d4d": "withdraw(uint256)",
  };
  return { selector, signature: KNOWN[selector] ?? null };
}

export function TransactionApproval({ store, onApprove, onReject, onExecuteBatchStep }: TransactionApprovalProps) {
  const state = useWalletStore(store);
  const pending = state.pendingApproval;
  const [countdown, setCountdown] = useState(0);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<GasEstimateResult | null>(null);
  const [decoded, setDecoded] = useState<{ selector: string; signature: string | null } | null>(null);

  // Countdown delay for mainnet transactions
  useEffect(() => {
    if (!pending || pending.type !== "tx") return;
    const isMainnet = pending.chainId === 8453;
    if (isMainnet) {
      setCountdown(MAINNET_COUNTDOWN_SECONDS);
    } else {
      setCountdown(0);
    }
  }, [pending]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

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

  // Gas estimation + ENS reverse lookup + calldata decode
  useEffect(() => {
    if (!pending || pending.type !== "tx" || !state.address) {
      setGasEstimate(null);
      setEnsName(null);
      setDecoded(null);
      return;
    }
    let cancelled = false;

    // Decode calldata
    if (pending.data && pending.data !== "0x") {
      setDecoded(decodeSelector(pending.data));
    } else {
      setDecoded(null);
    }

    // ENS lookup
    lookupEnsName(pending.to as `0x${string}`).then((name) => {
      if (!cancelled) setEnsName(name);
    }).catch(() => {});

    // Gas estimation
    estimateGasClient({
      chainId: pending.chainId,
      to: pending.to as `0x${string}`,
      data: (pending.data ?? "0x") as `0x${string}`,
      value: pending.value,
      from: state.address,
    }).then((result) => {
      if (!cancelled) setGasEstimate(result);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [pending, state.address]);

  if (!pending) return null;

  // ─── Hyperliquid Order Approval UI ───────────────────────
  if (pending.type === "hl_order") {
    const side = pending.isBuy ? "Buy" : "Sell";
    const type = pending.limitPx !== undefined ? `Limit @ ${pending.limitPx}` : "Market";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="mx-4 w-full max-w-md rounded-lg border border-dls-border bg-dls-sidebar p-6 shadow-sm animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
                <TrendingUp className="size-5 text-violet-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-dls-text">Hyperliquid Order</h2>
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

          {/* Perpetual trade warning */}
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              ⚠️ This is a PERPETUAL TRADE on Hyperliquid. Losses can exceed your deposit.
            </p>
          </div>

          {/* Order details */}
          <div className="space-y-2.5 mb-6">
            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Asset</div>
              <div className="font-mono text-sm text-dls-text">{pending.asset}</div>
            </div>

            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Side</div>
              <div className={cn("font-mono text-sm font-semibold", pending.isBuy ? "text-green-400" : "text-red-400")}>
                {side}
              </div>
            </div>

            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Size</div>
              <div className="font-mono text-sm text-dls-text">{pending.sz}</div>
            </div>

            {pending.limitPx !== undefined && (
              <div className="rounded-lg bg-dls-surface p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Limit Price</div>
                <div className="font-mono text-sm text-dls-text">{pending.limitPx}</div>
              </div>
            )}

            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Summary</div>
              <div className="font-mono text-sm text-dls-text">{pending.summary}</div>
            </div>

            {pending.reduceOnly && (
              <div className="rounded-lg bg-dls-surface p-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Reduce Only</div>
                <div className="font-mono text-sm text-amber-400">Yes</div>
              </div>
            )}

            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Type</div>
              <div className="font-mono text-sm text-dls-text">{type}</div>
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
              Cancel
            </Button>
            <Button
              className={cn("flex-1 gap-1.5 h-11 bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/20")}
              onClick={() => {
                dispatchTxApprovalResponse(true);
                onApprove(pending as unknown as TxApprovalRequest);
                store.clearApproval();
              }}
            >
              <CheckCircle2 className="size-4" />
              Sign & Submit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Batch Transaction Approval UI ───────────────────────
  if (pending.type === "batch") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <TransactionBatch
          plan={{
            steps: pending.steps.map(s => ({
              id: s.id,
              type: s.type,
              description: s.description,
              to: s.to,
              data: s.data,
              value: s.value,
            })),
            totalEstimatedGas: "0",
            totalEstimatedCostEth: null,
            chainId: pending.chainId,
            from: state.address ?? "",
          }}
          onExecute={async (stepIndex) => {
            const step = pending.steps[stepIndex];
            if (!step) throw new Error("Step not found");
            if (onExecuteBatchStep) {
              const hash = await onExecuteBatchStep({ to: step.to, data: step.data, value: step.value, chainId: pending.chainId });
              return hash;
            }
            // Fallback: old behavior for backwards compat
            dispatchTxApprovalResponse(true);
            onApprove(pending as unknown as TxApprovalRequest);
            return "0x";
          }}
          onDismiss={() => {
            dispatchTxApprovalResponse(false);
            store.clearApproval();
            onReject();
          }}
        />
      </div>
    );
  }

  // ─── Standard Transaction Approval UI ─────────────────────
  const isContractInteraction = pending.data && pending.data !== "0x";
  const isWhitelisted = isWhitelistedAddress(pending.chainId, pending.to);
  const isMainnet = pending.chainId === 8453;
  const chainName = CHAIN_NAMES[pending.chainId] ?? `Chain ${pending.chainId}`;
  const ethValue = formatTxValueEth(pending.value);
  const usdValue = computeTxValueUSD(pending.value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="mx-4 w-full max-w-md rounded-lg border border-dls-border bg-dls-sidebar p-6 shadow-sm animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
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

        {/* FORCE_TESTNET block */}
        {FORCE_TESTNET && isMainnet && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              Mainnet is disabled. Switch to a testnet in Settings &gt; Wallet.
            </p>
          </div>
        )}

        {/* Mainnet warning */}
        {isMainnet && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              You are on Base Mainnet — this will spend real money.
            </p>
          </div>
        )}

        {/* Spend limit warning */}
        {state.pendingApproval?.type === "tx" && state.maxPerTransactionUSD > 0 && computeTxValueUSD(state.pendingApproval.value) > state.maxPerTransactionUSD && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This transaction exceeds your per-transaction limit of ${state.maxPerTransactionUSD}. Go to Settings &gt; Wallet to increase.
            </p>
          </div>
        )}

        {/* Daily limit warning */}
        {state.pendingApproval?.type === "tx" && state.maxDailySpendUSD > 0 && (state.dailySpendUSD + computeTxValueUSD(state.pendingApproval.value)) > state.maxDailySpendUSD && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This transaction exceeds your daily limit of ${state.maxDailySpendUSD}. Go to Settings &gt; Wallet to increase.
            </p>
          </div>
        )}

        {/* Whitelist warning */}
        {!isWhitelisted && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This contract is not on the known protocol whitelist. Only proceed if you trust this address.
            </p>
          </div>
        )}

        {/* Warning for contract interactions */}
        {isContractInteraction && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              This is a contract interaction. Make sure you trust the contract.
            </p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2.5 mb-6">
          <div className="rounded-lg bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">To</div>
            <div className="font-mono text-sm text-dls-text break-all" title={pending.to}>
              {ensName ?? truncateAddress(pending.to)}
            </div>
            {ensName && (
              <div className="text-xs text-dls-secondary mt-0.5">{truncateAddress(pending.to)}</div>
            )}
          </div>

          <div className="rounded-lg bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Value</div>
            <div className="font-mono text-sm text-dls-text">{ethValue} ETH</div>
            {usdValue > 0 ? (
              <div className="mt-0.5 text-xs text-dls-secondary">~${usdValue.toFixed(2)} USD</div>
            ) : null}
          </div>

          {isContractInteraction && (
            <div className="rounded-lg bg-dls-surface p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileCode className="size-3 text-dls-secondary" />
                <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Calldata</div>
              </div>
              {decoded?.signature && (
                <div className="text-xs text-green-400 mb-1 font-medium">{decoded.signature}</div>
              )}
              <div className="font-mono text-xs text-dls-text break-all max-h-24 overflow-y-auto scrollbar-thin">
                {pending.data!.length > 120 ? `${pending.data!.slice(0, 60)}...${pending.data!.slice(-20)}` : pending.data}
              </div>
              {decoded && !decoded.signature && (
                <div className="text-xs text-amber-400 mt-1">Unknown function selector: {decoded.selector}</div>
              )}
            </div>
          )}

          {gasEstimate && (
            <div className="rounded-lg bg-dls-surface p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Fuel className="size-3 text-dls-secondary" />
                <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Estimated Gas</div>
              </div>
              {gasEstimate.success ? (
                <div className="space-y-1">
                  <div className="font-mono text-sm text-dls-text">{gasEstimate.gasFormatted} units</div>
                  {gasEstimate.gasPriceGwei !== null && (
                    <div className="text-xs text-dls-secondary">
                      {gasEstimate.gasPriceGwei.toFixed(2)} gwei • ~{gasEstimate.estimatedCostEth} ETH
                      {gasEstimate.estimatedCostUSD && ` ($${gasEstimate.estimatedCostUSD})`}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-amber-400">{gasEstimate.error}</div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Network</div>
            <div className="flex items-center gap-2 text-sm text-dls-text">
              <span className={cn("size-2 rounded-full", isMainnet ? "bg-red-500" : "bg-yellow-500")} />
              <span className={cn(isMainnet && "font-semibold text-red-400")}>{chainName}</span>
            </div>
          </div>

          <div className="rounded-lg bg-dls-surface p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Proposed By</div>
            <div className="font-mono text-sm text-dls-text">{pending.proposedBy}</div>
          </div>

          {state.maxSlippageBps > 0 && (
            <div className="rounded-lg bg-dls-surface p-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">Max Slippage</div>
              <div className="font-mono text-sm text-dls-text">{(state.maxSlippageBps / 100).toFixed(2)}%</div>
            </div>
          )}

          {pending.type === "tx" && pending.contractWarning && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300">{pending.contractWarning}</p>
            </div>
          )}
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
            disabled={isMainnet && countdown > 0}
            className={cn(
              "flex-1 gap-1.5 h-11 bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/20",
              isMainnet && countdown > 0 && "opacity-60 cursor-not-allowed",
            )}
            onClick={() => {
              if (FORCE_TESTNET && isMainnet) return;
              dispatchTxApprovalResponse(true);
              onApprove(pending);
              store.clearApproval();
            }}
          >
            <CheckCircle2 className="size-4" />
            {isMainnet && countdown > 0 ? `Approve (${countdown})...` : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}
