/** @jsxImportSource react */
import { Shield, X, AlertTriangle, CheckCircle2, XCircle, TrendingUp, Fuel, FileCode } from "lucide-react";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { WalletStore } from "./state/wallet-store";
import {
  useWalletStore,
  analyzeWalletTransaction,
  evaluateWalletApprovalAgainstPolicy,
  walletSafetyPolicyFromSnapshot,
} from "./state/wallet-store";
import { CHAIN_NAMES, FORCE_TESTNET } from "../../infra/chains";
import { isWhitelistedAddress } from "./infra/whitelist";
import { sanitizeGasEstimateError, type GasEstimateResult } from "./lib/gas-estimate";
import { lookupEnsName, truncateAddress } from "./lib/ens";
import { TransactionBatch, type BatchStepGuardView } from "./components/TransactionBatch";
import { appendSecurityLog } from "./state/security-log";
import type { ReviewedWalletSimulationProof } from "./lib/reviewed-wallet-send";
import type {
  MatterhornWalletTransactionSimulationInput,
  MatterhornWalletTransactionSimulationResponse,
} from "../../../app/lib/matterhorn-server";

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
  onApprove: (tx: TxApprovalRequest, simulationProof: ReviewedWalletSimulationProof) => void | Promise<unknown>;
  onReject: () => void;
  onSimulateTransaction?: (input: MatterhornWalletTransactionSimulationInput) => Promise<MatterhornWalletTransactionSimulationResponse>;
  /** Called to execute a single batch step (for multi-hop / batch approvals). */
  onExecuteBatchStep?: (step: { to: string; data?: string; value?: string; chainId?: number }) => Promise<string>;
};

type SimulationReviewState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "passed" }
  | { status: "failed"; error: string }
  | { status: "unavailable"; error: string };

export function dispatchTxApprovalRequest(tx: TxApprovalRequest) {
  window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", { detail: tx }));
}

export function dispatchTxApprovalResponse(approved: boolean, txHash?: string) {
  window.dispatchEvent(
    new CustomEvent("matterhorn:tx-approval-response", { detail: { approved, txHash } }),
  );
}

const MAINNET_COUNTDOWN_SECONDS = 3;
const TRUSTED_APPROVAL_ERROR_PREFIXES = [
  "Switch your wallet to ",
  "Mainnet is disabled",
  "Wallet chain is unavailable",
  "Wallet not connected",
  "This transaction exceeds",
  "Swap rate limit reached",
  "Matterhorn cannot verify",
];

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

function sanitizeApprovalError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (TRUSTED_APPROVAL_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;
  return sanitizeGasEstimateError(error);
}

function ReviewNotice({
  tone,
  children,
}: {
  tone: "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        tone === "danger"
          ? "border-red-7/30 bg-red-3/40 text-red-12 dark:bg-red-3/10 dark:text-red-11"
          : "border-amber-7/30 bg-amber-3/40 text-amber-12 dark:bg-amber-3/10 dark:text-amber-11",
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "danger" ? "text-red-11" : "text-amber-11",
        )}
      />
      <p>{children}</p>
    </div>
  );
}

function ApprovalStatusSummary({
  blocked,
  notices,
}: {
  blocked: boolean;
  notices: string[];
}) {
  if (notices.length === 0) return null;

  const [primaryNotice, ...secondaryNotices] = notices;
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-3.5 py-3 text-xs leading-5",
        blocked
          ? "border-red-7/30 bg-red-3/40 text-red-12 dark:bg-red-3/10 dark:text-red-11"
          : "border-amber-7/30 bg-amber-3/40 text-amber-12 dark:bg-amber-3/10 dark:text-amber-11",
      )}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", blocked ? "text-red-11" : "text-amber-11")} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-current">{blocked ? "Action required" : "Review carefully"}</p>
          <p className="mt-0.5 text-current/85">{primaryNotice}</p>
          {secondaryNotices.length > 0 ? (
            <details className="mt-2 text-current/80">
              <summary className="w-fit cursor-pointer select-none font-medium text-current transition-colors hover:text-dls-text">
                {secondaryNotices.length === 1 ? "1 more detail" : `${secondaryNotices.length} more details`}
              </summary>
              <ul className="mt-2 grid gap-1.5 pl-4">
                {secondaryNotices.map((notice) => <li key={notice} className="list-disc">{notice}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewField({
  label,
  children,
  icon,
}: {
  label: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 rounded-md bg-dls-surface-muted/[0.08] px-3 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-dls-secondary">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 text-dls-text">{children}</div>
    </div>
  );
}

export function TransactionApproval({ store, onApprove, onReject, onSimulateTransaction, onExecuteBatchStep }: TransactionApprovalProps) {
  const state = useWalletStore(store);
  const pending = state.pendingApproval;
  const safetyPolicy = walletSafetyPolicyFromSnapshot(state);
  const [countdown, setCountdown] = useState(0);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [gasEstimate, setGasEstimate] = useState<GasEstimateResult | null>(null);
  const [decoded, setDecoded] = useState<{ selector: string; signature: string | null } | null>(null);
  const [simulation, setSimulation] = useState<SimulationReviewState>({ status: "idle" });
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Countdown delay for mainnet transactions
  useEffect(() => {
    if (!pending || pending.type !== "tx") return;
    const isMainnet = pending.chainId === 8453;
    if (isMainnet) {
      setCountdown(MAINNET_COUNTDOWN_SECONDS);
    } else {
      setCountdown(0);
    }
    setApprovalBusy(false);
    setApprovalError(null);
  }, [pending]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Allow rejecting via Escape key
  useEffect(() => {
    if (!pending) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dispatchTxApprovalResponse(false);
        onReject();
        store.clearApproval();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pending, store, onReject]);

  useEffect(() => {
    if (!pending) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const frame = window.requestAnimationFrame(() => {
      const dialog = overlayRef.current?.querySelector<HTMLElement>("[role='dialog']");
      if (!dialog) return;
      const safeAction = dialog.querySelector<HTMLElement>("[data-approval-cancel]");
      const firstAction = dialog.querySelector<HTMLElement>(focusableSelector);
      (safeAction ?? firstAction ?? dialog).focus();
    });

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const dialog = overlayRef.current?.querySelector<HTMLElement>("[role='dialog']");
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", trapFocus);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [pending]);

  // ENS reverse lookup + calldata decode. Gas estimation is server-routed with
  // the exact transaction simulation so wallet-private context never leaks
  // from the browser to a separate public RPC.
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

    return () => { cancelled = true; };
  }, [pending, state.address]);

  useEffect(() => {
    if (!pending || pending.type !== "tx") {
      setSimulation({ status: "idle" });
      return;
    }
    if (!state.address) {
      setSimulation({ status: "idle" });
      return;
    }
    if (!onSimulateTransaction) {
      setSimulation({ status: "unavailable", error: "Simulation service is unavailable." });
      return;
    }

    let cancelled = false;
    setGasEstimate(null);
    setSimulation({ status: "checking" });
    onSimulateTransaction({
      chainId: pending.chainId,
      to: pending.to,
      data: pending.data ?? "0x",
      value: pending.value,
      from: state.address,
    }).then((response) => {
      if (cancelled) return;
      const result = response.simulation;
      if (result.gasUnits) {
        setGasEstimate({
          success: true,
          gas: result.gasUnits,
          gasFormatted: Number(result.gasUnits).toLocaleString(),
          gasPriceGwei: null,
          estimatedCostEth: null,
          estimatedCostUSD: null,
        });
      } else if (result.gasError) {
        setGasEstimate({ success: false, error: result.gasError });
      }
      if (result.status === "passed") {
        setSimulation({ status: "passed" });
        return;
      }
      const message = result.error ?? (result.status === "failed" ? "Simulation failed before approval." : "Simulation service is unavailable.");
      setSimulation({ status: result.status, error: message });
      if (result.status === "failed") {
        let valueUSD = 0;
        try {
          valueUSD = analyzeWalletTransaction({
            chainId: pending.chainId,
            to: pending.to,
            value: pending.value,
            data: pending.data,
          }).valueUSD;
        } catch {
          valueUSD = 0;
        }
        appendSecurityLog({
          timestamp: Date.now(),
          action: "simulation_failed",
          chainId: pending.chainId,
          to: pending.to,
          valueUSD,
          riskLevel: pending.riskLevel,
          reason: message,
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setSimulation({ status: "unavailable", error: "Simulation service is unavailable." });
      }
    });

    return () => { cancelled = true; };
  }, [pending, state.address, onSimulateTransaction]);

  if (!pending) return null;

  // ─── Hyperliquid Order Approval UI ───────────────────────
  if (pending.type === "hl_order") {
    const side = pending.isBuy ? "Buy" : "Sell";
    const type = pending.limitPx !== undefined ? `Limit @ ${pending.limitPx}` : "Market";

    return (
      <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200 motion-reduce:animate-none motion-reduce:backdrop-blur-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="matterhorn-hyperliquid-order-approval-title"
          tabIndex={-1}
          className="matterhorn-overlay-surface mx-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-6 ring-1 ring-dls-border/45 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
        >
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-dls-hover/45">
                <TrendingUp className="size-5 text-dls-accent" />
              </div>
              <div>
                <h2 id="matterhorn-hyperliquid-order-approval-title" className="text-base font-semibold text-dls-text">Hyperliquid Handoff</h2>
                <p className="text-xs text-dls-secondary">Review before external execution</p>
              </div>
            </div>
            <button
              type="button"
              data-approval-cancel
              aria-label="Close Hyperliquid handoff review"
              className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
              onClick={() => {
                dispatchTxApprovalResponse(false);
                onReject();
                store.clearApproval();
              }}
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Perpetual trade warning */}
          <ReviewNotice tone="danger">
            This is a perpetual trade handoff. Matterhorn does not sign, submit, or hold exchange credentials.
          </ReviewNotice>

          {/* Order details */}
          <div className="mb-6 space-y-2">
            <ReviewField label="Asset">
              <div className="font-mono text-sm">{pending.asset}</div>
            </ReviewField>
            <ReviewField label="Side">
              <div className={cn("font-mono text-sm font-semibold", pending.isBuy ? "text-green-11" : "text-red-11")}>
                {side}
              </div>
            </ReviewField>
            <ReviewField label="Size">
              <div className="font-mono text-sm">{pending.sz}</div>
            </ReviewField>
            {pending.limitPx !== undefined && (
              <ReviewField label="Limit price">
                <div className="font-mono text-sm">{pending.limitPx}</div>
              </ReviewField>
            )}
            <ReviewField label="Summary">
              <div className="font-mono text-sm">{pending.summary}</div>
            </ReviewField>
            {pending.reduceOnly && (
              <ReviewField label="Reduce only">
                <div className="font-mono text-sm text-amber-11">Yes</div>
              </ReviewField>
            )}
            <ReviewField label="Type">
              <div className="font-mono text-sm">{type}</div>
            </ReviewField>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              data-approval-cancel
              variant="outline"
              className="flex-1 gap-1.5 h-10"
              onClick={() => {
                dispatchTxApprovalResponse(false);
                onReject();
                store.clearApproval();
              }}
            >
              <XCircle className="size-4" />
              Cancel
            </Button>
            <Button
              className="h-10 flex-1 gap-1.5"
              onClick={() => {
                dispatchTxApprovalResponse(true);
                store.clearApproval();
              }}
            >
              <CheckCircle2 className="size-4" />
              Mark reviewed
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Batch Transaction Approval UI ───────────────────────
  if (pending.type === "batch") {
    const chainName = CHAIN_NAMES[pending.chainId] ?? `Chain ${pending.chainId}`;
    const connectedChainId = state.chainId;
    const connectedChainName = connectedChainId ? CHAIN_NAMES[connectedChainId] ?? `Chain ${connectedChainId}` : null;
    const walletUnavailable = !state.isConnected || !state.address || !connectedChainId;
    const chainMismatch = Boolean(connectedChainId && connectedChainId !== pending.chainId);
    let plannedDailySpendUSD = state.dailySpendUSD;
    const stepGuards: BatchStepGuardView[] = pending.steps.map((step) => {
      const blockers: string[] = [];
      const warnings: string[] = [];
      let displayValue = "0 ETH";
      let valueUSD = 0;

      if (walletUnavailable) {
        blockers.push("Connect your wallet before approving. Matterhorn cannot send this batch without an active wallet.");
      } else if (chainMismatch) {
        blockers.push(`Switch your wallet to ${chainName}. It is currently on ${connectedChainName}. Matterhorn will not send on the wrong chain.`);
      }

      if ((FORCE_TESTNET || !state.mainnetEnabled) && pending.chainId === 8453) {
        blockers.push("Mainnet is disabled. Enable mainnet in Settings > Wallet before approving.");
      }

      try {
        const analysis = analyzeWalletTransaction({
          chainId: pending.chainId,
          to: step.to,
          value: step.value ?? "0",
          data: step.data,
        });
        displayValue = analysis.displayValue;
        valueUSD = analysis.valueUSD;
        warnings.push(...analysis.warnings);
        blockers.push(...evaluateWalletApprovalAgainstPolicy({
          valueUSD,
          valueUSDIsKnown: analysis.valueUSDIsKnown,
          policy: { ...safetyPolicy, dailySpendUSD: plannedDailySpendUSD },
          isSwap: analysis.isSwap,
        }));
        plannedDailySpendUSD += valueUSD;
      } catch {
        blockers.push("This batch step could not be decoded safely. Matterhorn will not send it.");
      }

      return {
        stepId: step.id,
        displayValue,
        valueUSD,
        warnings,
        blockers,
        chainName,
      };
    });

    return (
      <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200 motion-reduce:animate-none motion-reduce:backdrop-blur-none">
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
          stepGuards={stepGuards}
          onExecute={async (stepIndex) => {
            const step = pending.steps[stepIndex];
            if (!step) throw new Error("Step not found");
            if (onExecuteBatchStep) {
              const hash = await onExecuteBatchStep({ to: step.to, data: step.data, value: step.value, chainId: pending.chainId });
              return hash;
            }
            throw new Error("Batch execution is unavailable. Matterhorn will not submit this batch.");
          }}
          onDismiss={() => {
            dispatchTxApprovalResponse(false);
            onReject();
            store.clearApproval();
          }}
        />
      </div>
    );
  }

  // ─── Standard Transaction Approval UI ─────────────────────
  const isContractInteraction = pending.data && pending.data !== "0x";
  const isWhitelisted = isWhitelistedAddress(pending.chainId, pending.to);
  const isMainnet = pending.chainId === 8453;
  const mainnetBlocked = isMainnet && (FORCE_TESTNET || !state.mainnetEnabled);
  const chainName = CHAIN_NAMES[pending.chainId] ?? `Chain ${pending.chainId}`;
  const connectedChainId = state.chainId;
  const connectedChainName = connectedChainId ? CHAIN_NAMES[connectedChainId] ?? `Chain ${connectedChainId}` : null;
  const walletUnavailable = !state.isConnected || !state.address || !connectedChainId;
  const chainMismatch = Boolean(connectedChainId && connectedChainId !== pending.chainId);
  const analysis = analyzeWalletTransaction({
    chainId: pending.chainId,
    to: pending.to,
    value: pending.value,
    data: pending.data,
  });
  const usdValue = analysis.valueUSD;
  const policyReasons = evaluateWalletApprovalAgainstPolicy({
    valueUSD: usdValue,
    valueUSDIsKnown: analysis.valueUSDIsKnown,
    policy: safetyPolicy,
    isSwap: analysis.isSwap,
  });
  const simulationChecking = simulation.status === "checking";
  const simulationFailed = simulation.status === "failed";
  const simulationUnavailable = simulation.status === "unavailable";
  const simulationBlocked = simulationFailed || simulationUnavailable;
  const isBlocked = walletUnavailable || chainMismatch || mainnetBlocked || policyReasons.length > 0 || simulationBlocked;
  const usdLabel = analysis.tokenAction?.isUnlimitedApproval
    ? "Unlimited allowance"
    : analysis.valueUSDIsKnown
      ? `~$${usdValue.toFixed(2)} USD`
      : "USD value unavailable";
  const blockingNotices = [
    approvalError,
    walletUnavailable
      ? "Connect your wallet before approving. Matterhorn cannot send this transaction without an active wallet."
      : null,
    chainMismatch
      ? `Switch your wallet to ${chainName}. It is currently on ${connectedChainName}. Matterhorn will not send on the wrong chain.`
      : null,
    mainnetBlocked
      ? "Mainnet is disabled. Enable mainnet in Settings > Wallet before approving."
      : null,
    ...policyReasons.map((reason) => `${reason} Change the limit in Settings > Wallet before approving.`),
    simulationFailed
      ? `${simulation.error} Matterhorn will not send a transaction that fails simulation.`
      : null,
    simulationUnavailable
      ? `${simulation.error} Matterhorn will not send this transaction until simulation is available.`
      : null,
  ].filter((notice): notice is string => Boolean(notice));
  const cautionNotices = [
    isMainnet ? "You are on Base Mainnet. This will spend real money." : null,
    ...analysis.warnings,
    !isWhitelisted
      ? "This contract is not on the known protocol whitelist. Only proceed if you trust this address."
      : null,
    isContractInteraction ? "This is a contract interaction. Make sure you trust the contract." : null,
    pending.contractWarning ?? null,
  ].filter((notice): notice is string => Boolean(notice));
  const reviewNotices = [...blockingNotices, ...cautionNotices];

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200 motion-reduce:animate-none motion-reduce:backdrop-blur-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="matterhorn-transaction-approval-title"
        tabIndex={-1}
        className="matterhorn-overlay-surface mx-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg p-6 ring-1 ring-dls-border/45 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-dls-hover/45">
              <Shield className="size-5 text-dls-accent" />
            </div>
            <div>
              <h2 id="matterhorn-transaction-approval-title" className="text-base font-semibold text-dls-text">Review wallet action</h2>
              <p className="text-xs text-dls-secondary">Nothing moves until you continue in your wallet</p>
            </div>
          </div>
          <button
            type="button"
            data-approval-cancel
            aria-label="Close wallet action review"
            className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
            onClick={() => {
              dispatchTxApprovalResponse(false);
              onReject();
              store.clearApproval();
            }}
          >
            <X className="size-4" />
          </button>
        </div>

        <ApprovalStatusSummary blocked={isBlocked || Boolean(approvalError)} notices={reviewNotices} />

        <div className="matterhorn-raised-surface mb-4 rounded-lg px-4 py-4 text-center ring-1 ring-dls-border/25">
          <p className="text-xs font-medium text-dls-secondary">Amount</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-dls-text">{analysis.displayValue}</p>
          {usdValue > 0 || !analysis.valueUSDIsKnown || analysis.tokenAction?.isUnlimitedApproval ? (
            <p className="mt-1 font-mono text-sm tabular-nums text-dls-secondary">{usdLabel}</p>
          ) : null}
        </div>

        {/* Details */}
        <div className="mb-6 space-y-2">
          <ReviewField label="Recipient">
            <div className="font-mono text-sm text-dls-text break-all" title={pending.to}>
              {ensName ?? truncateAddress(pending.to)}
            </div>
            {ensName && (
              <div className="text-xs text-dls-secondary mt-0.5">{truncateAddress(pending.to)}</div>
            )}
          </ReviewField>

          {analysis.assetChanges.length > 0 && (
            <ReviewField label="Asset changes">
              <div className="space-y-2">
                {analysis.assetChanges.map((change, index) => {
                  const subject = change.spender
                    ? `Spender: ${truncateAddress(change.spender)}`
                    : change.recipient
                      ? `Recipient: ${truncateAddress(change.recipient)}`
                      : change.from
                        ? `From: ${truncateAddress(change.from)}`
                        : null;
                  return (
                    <div key={`${change.asset}-${change.direction}-${index}`} className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dls-text">
                        <span>{change.summary}</span>
                        {change.usdValue > 0 ? (
                          <span className="text-xs text-dls-secondary">~${change.usdValue.toFixed(2)} USD</span>
                        ) : null}
                      </div>
                      {subject ? (
                        <div className="mt-0.5 text-xs text-dls-secondary">{subject}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ReviewField>
          )}

          {analysis.tokenAction && (
            <ReviewField label="Token action">
              <div className="text-sm text-dls-text">
                {analysis.tokenAction.kind === "approve"
                  ? `Approve ${analysis.tokenAction.amountFormatted} ${analysis.tokenAction.tokenSymbol}`
                  : `Transfer ${analysis.tokenAction.amountFormatted} ${analysis.tokenAction.tokenSymbol}`}
              </div>
              {analysis.tokenAction.spender && (
                <div className="mt-1 text-xs text-dls-secondary break-all">Spender: {analysis.tokenAction.spender}</div>
              )}
              {analysis.tokenAction.recipient && (
                <div className="mt-1 text-xs text-dls-secondary break-all">Recipient: {analysis.tokenAction.recipient}</div>
              )}
              {analysis.tokenAction.from && (
                <div className="mt-1 text-xs text-dls-secondary break-all">From: {analysis.tokenAction.from}</div>
              )}
            </ReviewField>
          )}

          {isContractInteraction && (
            <ReviewField label="Contract details" icon={<FileCode className="size-3" />}>
              <details>
                <summary className="min-h-7 cursor-pointer text-xs font-medium text-dls-secondary outline-none focus-visible:text-dls-text focus-visible:ring-2 focus-visible:ring-ring/35">Show technical data</summary>
                {decoded?.signature && (
                  <div className="mb-1 mt-1 text-xs font-medium text-green-11">{decoded.signature}</div>
                )}
                <div className="font-mono text-xs text-dls-text break-all max-h-24 overflow-y-auto scrollbar-thin">
                  {pending.data!.length > 120 ? `${pending.data!.slice(0, 60)}...${pending.data!.slice(-20)}` : pending.data}
                </div>
                {decoded && !decoded.signature && (
                  <div className="mt-1 text-xs text-amber-11">Unrecognized contract action: {decoded.selector}</div>
                )}
              </details>
            </ReviewField>
          )}

          {gasEstimate && (
            <ReviewField label="Network fee estimate" icon={<Fuel className="size-3" />}>
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
                <div className="text-xs text-amber-11">{gasEstimate.error}</div>
              )}
            </ReviewField>
          )}

          <ReviewField label="Safety check" icon={simulation.status === "passed" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}>
            {simulation.status === "checking" ? (
              <div className="text-sm text-dls-secondary">Checking this action before wallet review…</div>
            ) : simulation.status === "passed" ? (
              <div className="text-sm text-green-11">Checks passed. Your wallet can review this action.</div>
            ) : simulation.status === "failed" ? (
              <div className="text-sm text-red-11">{simulation.error}</div>
            ) : simulation.status === "unavailable" ? (
              <div className="text-sm text-amber-11">{simulation.error}</div>
            ) : (
              <div className="text-sm text-dls-secondary">Waiting for wallet details.</div>
            )}
          </ReviewField>

          <ReviewField label="Network">
            <div className="flex items-center gap-2 text-sm text-dls-text">
              <span className={cn("size-2 rounded-full", isMainnet ? "bg-red-500" : "bg-yellow-500")} />
              <span className={cn(isMainnet && "font-semibold text-red-11")}>{chainName}</span>
            </div>
          </ReviewField>

          <ReviewField label="Requested by">
            <div className="font-mono text-sm text-dls-text">{pending.proposedBy}</div>
          </ReviewField>

          {state.maxSlippageBps > 0 && (
            <ReviewField label="Max slippage">
              <div className="font-mono text-sm text-dls-text">{(state.maxSlippageBps / 100).toFixed(2)}%</div>
            </ReviewField>
          )}

        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            data-approval-cancel
            variant="outline"
            className="flex-1 gap-1.5 h-10"
            onClick={() => {
              dispatchTxApprovalResponse(false);
              onReject();
              store.clearApproval();
            }}
          >
            <XCircle className="size-4" />
            Reject
          </Button>
          <Button
            disabled={approvalBusy || simulationChecking || isBlocked || (isMainnet && countdown > 0)}
            className={cn(
              "h-10 flex-1 gap-1.5",
              (approvalBusy || simulationChecking || isBlocked || (isMainnet && countdown > 0)) && "opacity-60 cursor-not-allowed",
            )}
            onClick={async () => {
              if (approvalBusy || simulationChecking || isBlocked || (isMainnet && countdown > 0)) return;
              if (simulation.status !== "passed") return;
              setApprovalBusy(true);
              setApprovalError(null);
              try {
                if (!onSimulateTransaction || !state.address) {
                  throw new Error("Simulation service is unavailable.");
                }
                const refreshed = await onSimulateTransaction({
                  chainId: pending.chainId,
                  to: pending.to,
                  data: pending.data ?? "0x",
                  value: pending.value,
                  from: state.address,
                });
                if (refreshed.simulation.status !== "passed") {
                  throw new Error(
                    refreshed.simulation.error
                    ?? (refreshed.simulation.status === "failed"
                      ? "Simulation failed before approval."
                      : "Simulation service is unavailable."),
                  );
                }
                await onApprove(pending, {
                  status: "passed",
                  chainId: refreshed.simulation.chainId,
                  to: refreshed.simulation.to,
                  from: refreshed.simulation.from,
                  value: refreshed.simulation.value,
                  data: refreshed.simulation.data,
                  dataSelector: refreshed.simulation.dataSelector,
                  checkedAt: refreshed.simulation.checkedAt,
                });
                dispatchTxApprovalResponse(true);
                store.clearApproval();
              } catch (error) {
                const message = sanitizeApprovalError(error);
                setApprovalError(message);
                store.setError(message);
              } finally {
                setApprovalBusy(false);
              }
            }}
          >
            <CheckCircle2 className="size-4" />
            {approvalBusy ? "Opening wallet…" : simulationChecking ? "Checking…" : isBlocked ? "Blocked" : isMainnet && countdown > 0 ? `Continue in wallet (${countdown})…` : "Continue in wallet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
