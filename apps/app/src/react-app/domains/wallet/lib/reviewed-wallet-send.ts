import {
  analyzeWalletTransaction,
  prepareWalletTransactionSend,
  type PreparedWalletSendRequest,
  type TxRecord,
  type WalletApprovalPolicyInput,
} from "../state/wallet-store";
import type { SecurityLogEntry, WalletSafetyReviewTrail } from "../state/security-log";

export type ReviewedWalletSendApproval = {
  chainId: number;
  to: string;
  value: string;
  data?: string;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
};

export type ReviewedWalletSendResult = {
  hash: `0x${string}`;
  request: PreparedWalletSendRequest["request"];
  analysis: PreparedWalletSendRequest["analysis"];
};

export type ReviewedWalletSendSimulationResult = {
  status: "passed" | "failed" | "unavailable";
  error?: string;
};

export type ReviewedWalletSimulationProof = {
  status: "passed";
  chainId: number;
  to: string;
  from: string;
  value: string;
  data: string;
  dataSelector: string;
  checkedAt: number;
};

export type ReviewedWalletSendInput = {
  approval: ReviewedWalletSendApproval;
  connectedChainId: number | null | undefined;
  connectedAddress?: string | null;
  forceTestnet?: boolean;
  policy: Omit<WalletApprovalPolicyInput, "valueUSD">;
  chainName?: (chainId: number) => string;
  simulateTransaction?: (
    request: PreparedWalletSendRequest["request"],
  ) => Promise<ReviewedWalletSendSimulationResult>;
  simulationProof?: ReviewedWalletSimulationProof;
  sendTransaction: (request: PreparedWalletSendRequest["request"]) => Promise<`0x${string}`>;
  now?: () => number;
  blockedReasonPrefix?: string;
  approvedReason: string;
  onTransaction?: (tx: TxRecord) => void;
  onDailySpend?: (amountUSD: number) => void;
  onSwapSubmitted?: () => void;
  onSecurityLog?: (entry: SecurityLogEntry) => void;
};

const REVIEWED_SIMULATION_MAX_AGE_MS = 60_000;

function verifiedSimulationProof(input: ReviewedWalletSendInput, timestamp: number): ReviewedWalletSendSimulationResult | null {
  const proof = input.simulationProof;
  if (!proof) return null;
  const expectedSelector = dataSelector(input.approval.data) ?? "0x";
  const connectedAddress = input.connectedAddress?.trim().toLowerCase() ?? "";
  const matches =
    proof.status === "passed"
    && proof.chainId === input.approval.chainId
    && proof.to.trim().toLowerCase() === input.approval.to.trim().toLowerCase()
    && proof.from.trim().toLowerCase() === connectedAddress
    && proof.value === input.approval.value
    && proof.data.trim().toLowerCase() === (input.approval.data ?? "0x").trim().toLowerCase()
    && proof.dataSelector.trim().toLowerCase() === expectedSelector.toLowerCase()
    && Number.isFinite(proof.checkedAt)
    && proof.checkedAt <= timestamp + 5_000
    && timestamp - proof.checkedAt <= REVIEWED_SIMULATION_MAX_AGE_MS;
  if (!matches) {
    return {
      status: "failed",
      error: "Reviewed simulation is stale or does not match this transaction. Reopen wallet review and try again.",
    };
  }
  return { status: "passed" };
}

function actionForBlockReason(reason: string): SecurityLogEntry["action"] {
  if (reason.startsWith("Switch your wallet to ")) return "chain_mismatch";
  if (reason.startsWith("Mainnet is disabled")) return "mainnet_blocked";
  if (reason.startsWith("Wallet chain is unavailable") || reason.startsWith("Wallet not connected")) {
    return "wallet_unavailable";
  }
  return reason.includes("rate limit") ? "rate_limit_hit" : "limit_hit";
}

function dataSelector(data: string | undefined): string | null {
  const clean = (data ?? "0x").trim();
  if (!clean || clean === "0x") return null;
  return clean.length >= 10 ? clean.slice(0, 10) : clean;
}

function reviewTrailForApproval(
  approval: ReviewedWalletSendApproval,
  analysis: { valueUSD: number; displayValue?: string },
  submitted?: PreparedWalletSendRequest["request"] & { txHash?: `0x${string}` },
): WalletSafetyReviewTrail {
  return {
    reviewed: {
      chainId: approval.chainId,
      to: approval.to,
      value: approval.value,
      valueUSD: analysis.valueUSD,
      dataSelector: dataSelector(approval.data),
      displayValue: analysis.displayValue ?? null,
      proposedBy: approval.proposedBy,
    },
    submitted: submitted
      ? {
        chainId: submitted.chainId,
        to: submitted.to,
        value: submitted.value.toString(),
        dataSelector: dataSelector(submitted.data),
        txHash: submitted.txHash ?? null,
      }
      : null,
  };
}

export async function sendReviewedWalletTransaction(input: ReviewedWalletSendInput): Promise<ReviewedWalletSendResult> {
  const { approval } = input;
  const timestamp = input.now?.() ?? Date.now();
  let prepared: PreparedWalletSendRequest;
  try {
    prepared = prepareWalletTransactionSend({
      chainId: approval.chainId,
      to: approval.to,
      value: approval.value,
      data: approval.data,
      connectedChainId: input.connectedChainId,
      forceTestnet: input.forceTestnet,
      chainName: input.chainName,
      policy: input.policy,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Transaction approval failed policy checks.";
    const fallbackAnalysis = (() => {
      try {
        return analyzeWalletTransaction({
          chainId: approval.chainId,
          to: approval.to,
          value: approval.value,
          data: approval.data,
        });
      } catch {
        return { valueUSD: 0 };
      }
    })();
    input.onSecurityLog?.({
      timestamp,
      action: actionForBlockReason(reason),
      chainId: approval.chainId,
      to: approval.to,
      valueUSD: fallbackAnalysis.valueUSD,
      riskLevel: approval.riskLevel,
      reason: `${input.blockedReasonPrefix ?? ""}${reason}`,
      review: reviewTrailForApproval(approval, fallbackAnalysis),
    });
    throw error;
  }

  let simulation: ReviewedWalletSendSimulationResult;
  try {
    simulation = verifiedSimulationProof(input, timestamp)
      ?? (input.simulateTransaction
        ? await input.simulateTransaction(prepared.request)
        : { status: "unavailable", error: "Simulation service is unavailable." });
  } catch {
    simulation = { status: "unavailable", error: "Simulation service is unavailable." };
  }
  if (simulation.status !== "passed") {
    const reason = simulation.error
      ?? (simulation.status === "failed" ? "Transaction simulation failed." : "Simulation service is unavailable.");
    input.onSecurityLog?.({
      timestamp,
      action: "simulation_failed",
      chainId: approval.chainId,
      to: approval.to,
      valueUSD: prepared.analysis.valueUSD,
      riskLevel: approval.riskLevel,
      reason,
      review: reviewTrailForApproval(approval, prepared.analysis),
    });
    throw new Error(reason);
  }

  const hash = await input.sendTransaction(prepared.request);
  input.onTransaction?.({
    hash,
    to: approval.to as `0x${string}`,
    value: approval.value,
    status: "pending",
    timestamp,
    chainId: approval.chainId,
    proposedBy: approval.proposedBy,
    riskLevel: approval.riskLevel,
  });
  input.onDailySpend?.(prepared.analysis.valueUSD);
  if (prepared.analysis.isSwap) {
    input.onSwapSubmitted?.();
  }
  input.onSecurityLog?.({
    timestamp,
    action: "tx_approved",
    chainId: approval.chainId,
    to: approval.to,
    valueUSD: prepared.analysis.valueUSD,
    riskLevel: approval.riskLevel,
    reason: input.approvedReason,
    txHash: hash,
    review: reviewTrailForApproval(approval, prepared.analysis, { ...prepared.request, txHash: hash }),
  });

  return {
    hash,
    request: prepared.request,
    analysis: prepared.analysis,
  };
}
