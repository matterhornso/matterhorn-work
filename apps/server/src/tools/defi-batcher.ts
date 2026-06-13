/**
 * Multi-step DeFi Batcher.
 * Builds ordered transaction batches (swap → approve → deposit) where each
 * step depends on the previous. Provides rollback and step-by-step status.
 */

import { tokensForChain } from "../infra/token-registry.js";
import { encodeFunctionData, isHex, type Address, type Hex } from "viem";
import type { buildSwap } from "./swap-builder.js";
import type { buildRevokeApprovalTx } from "./approval-manager.js";
import {
  normalizeAddressField,
  validateKnownToken,
  validatePositiveUint256,
  validateWhitelistedProtocol,
} from "./tx-security.js";

export type BatchStepType = "swap" | "approve" | "revoke" | "supply" | "custom";

export type BatchStep = {
  id: string;
  type: BatchStepType;
  description: string;
  to: Address;
  data: Hex;
  value?: string;
  dependsOn?: string;
  outputKey?: string;
  estimatedGas?: string | null;
  estimatedCostEth?: string | null;
};

export type BatchPlan = {
  steps: BatchStep[];
  totalEstimatedGas: string;
  totalEstimatedCostEth: string | null;
  chainId: number;
  from: Address;
};

export type BatchResult =
  | { status: "pending" }
  | { status: "success"; stepId: string; txHash: string }
  | { status: "failed"; stepId: string; error: string };

export type BatchExecutionState = {
  results: BatchResult[];
  currentStepIndex: number;
  allDone: boolean;
};

/**
 * Build a batch plan from an array of steps.
 * Validates inputs, resolves tokens, and computes total estimates.
 */
export async function buildBatchPlan({
  chainId,
  from,
  steps,
}: {
  chainId: number;
  from: Address;
  steps: BatchStep[];
}): Promise<{ success: true; plan: BatchPlan } | { success: false; error: string }> {
  if (!steps.length) {
    return { success: false, error: "Batch must contain at least one step" };
  }
  const safeFrom = normalizeAddressField("from", from);
  if (!safeFrom.success) return safeFrom;

  // Validate chain support
  const registry = tokensForChain(chainId);
  if (!registry) {
    return { success: false, error: `Unsupported chainId: ${chainId}` };
  }

  // Validate dependencies exist
  const ids = new Set(steps.map((s) => s.id));
  const normalizedSteps: BatchStep[] = [];
  for (const step of steps) {
    if (step.dependsOn && !ids.has(step.dependsOn)) {
      return { success: false, error: `Step ${step.id} depends on unknown step ${step.dependsOn}` };
    }
    const target = normalizeAddressField(`Step ${step.id} target`, step.to);
    if (!target.success) return target;
    if (typeof step.data !== "string" || !isHex(step.data)) {
      return { success: false, error: `Step ${step.id} data must be hex encoded` };
    }
    if (step.value !== undefined) {
      try {
        const value = BigInt(step.value);
        if (value < 0n) return { success: false, error: `Step ${step.id} value cannot be negative` };
      } catch {
        return { success: false, error: `Step ${step.id} value must be an integer` };
      }
    }
    normalizedSteps.push({ ...step, to: target.value, data: step.data });
  }

  // Compute total estimates (best effort — will refine at UI level with live gas)
  let totalGas = 0n;
  let totalCostEth: number | null = 0;

  for (const step of normalizedSteps) {
    const gas = BigInt(step.estimatedGas ?? "0");
    totalGas += gas;
    if (step.estimatedCostEth !== null && step.estimatedCostEth !== undefined) {
      totalCostEth = (totalCostEth ?? 0) + Number(step.estimatedCostEth);
    }
  }

  const plan: BatchPlan = {
    steps: normalizedSteps,
    totalEstimatedGas: totalGas.toString(),
    totalEstimatedCostEth: totalCostEth !== null && totalCostEth !== undefined ? totalCostEth.toFixed(8) : null,
    chainId,
    from: safeFrom.value,
  };

  return { success: true, plan };
}

/**
 * Build an ERC-20 approve calldata for a spender.
 */
export function buildApproveTx({
  chainId,
  tokenAddress,
  spender,
  amount = ((1n << 256n) - 1n).toString(), // max uint256 for unlimited
}: {
  chainId?: number;
  tokenAddress: Address;
  spender: Address;
  amount?: string;
}): { to: Address; data: Hex } {
  const safeToken = chainId === undefined
    ? normalizeAddressField("tokenAddress", tokenAddress)
    : validateKnownToken(chainId, tokenAddress, "tokenAddress");
  if (!safeToken.success) throw new Error(safeToken.error);
  const safeSpender = normalizeAddressField("spender", spender);
  if (!safeSpender.success) throw new Error(safeSpender.error);
  const safeAmount = validatePositiveUint256("amount", amount);
  if (!safeAmount.success) throw new Error(safeAmount.error);
  const data = encodeFunctionData({
    abi: [
      {
        name: "approve",
        type: "function",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [safeSpender.value, BigInt(safeAmount.value)],
  });
  return { to: safeToken.value, data };
}

/**
 * Helper: Create a common swap → approve → supply batch.
 * Uses swap-builder output for the swap step + manual approve/supply.
 */
export function createSwapApproveSupplyBatch({
  chainId,
  from,
  swapTx, // output from buildSwap()
  tokenToApprove,
  spender,
  supplyTx,
}: {
  chainId: number;
  from: Address;
  swapTx: Awaited<ReturnType<typeof buildSwap>>;
  tokenToApprove: Address;
  spender: Address;
  supplyTx: { to: Address; data: Hex; value?: string; description: string };
}): BatchPlan {
  const safeFrom = normalizeAddressField("from", from);
  if (!safeFrom.success) throw new Error(safeFrom.error);
  const safeToken = validateKnownToken(chainId, tokenToApprove, "tokenToApprove");
  if (!safeToken.success) throw new Error(safeToken.error);
  const safeSpender = normalizeAddressField("spender", spender);
  if (!safeSpender.success) throw new Error(safeSpender.error);
  const aavePool = validateWhitelistedProtocol(chainId, "aaveV3Pool");
  if (!aavePool.success) throw new Error(aavePool.error);
  if (safeSpender.value.toLowerCase() !== aavePool.value.toLowerCase()) {
    throw new Error("spender must be the whitelisted Aave V3 pool for this supply batch");
  }
  const safeSupplyTarget = normalizeAddressField("supply target", supplyTx.to);
  if (!safeSupplyTarget.success) throw new Error(safeSupplyTarget.error);
  if (!isHex(supplyTx.data)) throw new Error("supply data must be hex encoded");

  const steps: BatchStep[] = [
    {
      id: "swap",
      type: "swap",
      description: swapTx.summary,
      to: swapTx.tx.to as Address,
      data: swapTx.tx.data as Hex,
      value: swapTx.tx.value,
      outputKey: "swapReceipt",
    },
    {
      id: "approve",
      type: "approve",
      description: `Approve ERC-20 for ${safeSpender.value}`,
      to: safeToken.value,
      data: buildApproveTx({ chainId, tokenAddress: safeToken.value, spender: safeSpender.value }).data,
      dependsOn: "swap",
    },
    {
      id: "supply",
      type: "supply",
      description: supplyTx.description,
      to: safeSupplyTarget.value,
      data: supplyTx.data,
      value: supplyTx.value ?? "0",
      dependsOn: "approve",
      outputKey: "supplyReceipt",
    },
  ];

  return {
    steps,
    totalEstimatedGas: "0", // populated by UI with per-step gas estimation
    totalEstimatedCostEth: null,
    chainId,
    from: safeFrom.value,
  };
}

/**
 * Advance execution: returns the next pending step that should be executed.
 * Skips steps whose dependencies failed.
 */
export function nextPendingStep(
  plan: BatchPlan,
  state: BatchExecutionState,
): { step: BatchStep; index: number } | null {
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const already = state.results.find((r) => "stepId" in r && r.stepId === step.id);
    if (already) continue; // already processed

    // Check dependency
    if (step.dependsOn) {
      const dep = state.results.find(
        (r): r is Extract<typeof r, { status: "success" | "failed" }> =>
          "stepId" in r && r.stepId === step.dependsOn,
      );
      if (!dep) return null; // dependency not yet done
      if (dep.status === "failed") {
        // Mark current step as failed due to dependency
        state.results.push({ status: "failed", stepId: step.id, error: `Dependency ${step.dependsOn} failed` });
        continue;
      }
    }

    return { step, index: i };
  }
  return null;
}
