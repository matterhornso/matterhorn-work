import type {
  ReviewedActionAirlockIssue,
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
} from "@matterhorn-work/types/reviewed-actions";
import {
  isReviewedActionDraftHandoff,
  isReviewedActionHandoffV2,
  MATTERHORN_REVIEWED_ACTION_HANDOFF_V2,
} from "@matterhorn-work/types/reviewed-actions";
import { equalDigest, sha256 } from "./guarded-runtime-crypto.js";

export const MATTERHORN_REVIEWED_ACTION_POLICY_VERSION = "matterhorn.reviewed-action-policy.v2";
export const REVIEWED_ACTION_MAX_SIMULATION_AGE_MS = 60_000;
const REVIEWED_ACTION_DEFAULT_TTL_MS = 5 * 60_000;

type AirlockPolicy = {
  walletControlledSubmission: true;
  agentSubmitCapability: false;
  simulationRequired: true;
  policyVersion: typeof MATTERHORN_REVIEWED_ACTION_POLICY_VERSION;
  extra?: Record<string, unknown>;
};

type ExactTerms = Pick<
  ReviewedActionHandoffV2,
  "network" | "operation" | "amount" | "asset" | "recipient" | "slippage" | "signer"
>;

function exactTerms(handoff: ReviewedActionDraftHandoff, requestedSigner?: string | null): ExactTerms {
  const signer = requestedSigner?.trim() || null;
  if (handoff.protocol === "hyperliquid") {
    return {
      signer,
      network: handoff.draft.network,
      operation: handoff.draft.operation,
      amount: handoff.draft.size == null ? null : String(handoff.draft.size),
      asset: handoff.draft.asset,
      recipient: handoff.draft.orderId == null ? null : String(handoff.draft.orderId),
      slippage: handoff.draft.slippageBps == null ? null : `${handoff.draft.slippageBps}bps`,
    };
  }
  if (handoff.protocol === "polymarket") {
    return {
      signer,
      network: "polygon",
      operation: handoff.draft.operation,
      amount: handoff.draft.amountUsdc == null
        ? handoff.draft.amountShares == null ? null : `${handoff.draft.amountShares} shares`
        : `${handoff.draft.amountUsdc} pUSD`,
      asset: handoff.draft.outcome,
      recipient: handoff.draft.marketId ?? (handoff.draft.cancelAll ? "all_open_orders" : handoff.draft.orderIds.join(",")),
      slippage: handoff.draft.slippageTolerance == null ? null : `${handoff.draft.slippageTolerance}%`,
    };
  }
  if (handoff.protocol === "bittensor") {
    return {
      signer: signer ?? handoff.draft.sender,
      network: "finney",
      operation: handoff.draft.operation,
      amount: `${handoff.draft.amountTao} TAO`,
      asset: "TAO",
      recipient: handoff.draft.operation === "transfer" ? handoff.draft.destination : handoff.draft.hotkey,
      slippage: null,
    };
  }
  return {
    signer: signer ?? handoff.draft.sender,
    network: handoff.draft.network,
    operation: handoff.draft.operation,
    amount: handoff.draft.amount,
    asset: handoff.draft.coinType ?? (handoff.draft.objectId ? `object:${handoff.draft.objectId}` : "SUI"),
    recipient: handoff.draft.recipient ?? (
      handoff.draft.transfers.length > 0 ? `batch:${sha256(handoff.draft.transfers)}` : null
    ),
    slippage: null,
  };
}

function policyHash(policy: AirlockPolicy): string {
  return sha256(policy);
}

function intentMaterial(input: Omit<ReviewedActionHandoffV2, "version" | "intentHash">): unknown {
  return {
    protocol: input.protocol,
    source: input.source,
    runId: input.runId,
    policyHash: input.policyHash,
    signer: input.signer,
    network: input.network,
    operation: input.operation,
    amount: input.amount,
    asset: input.asset,
    recipient: input.recipient,
    slippage: input.slippage,
    expiresAt: input.expiresAt,
    simulation: input.simulation,
    preparedAt: input.preparedAt,
    capabilityClass: input.capabilityClass,
    draft: input.draft,
  };
}

export function buildReviewedActionHandoffV2(input: {
  handoff: ReviewedActionDraftHandoff;
  runId: string;
  signer?: string | null;
  exactTerms?: ExactTerms;
  simulation: { reference: string; block?: string | null; simulatedAt?: Date };
  preparedAt?: Date;
  expiresAt?: Date;
  policy?: Record<string, unknown>;
}): ReviewedActionHandoffV2 {
  if (!isReviewedActionDraftHandoff(input.handoff)) throw new Error("reviewed_action_v1_invalid");
  const runId = input.runId.trim();
  const reference = input.simulation.reference.trim();
  if (!runId || !reference) throw new Error("reviewed_action_airlock_context_missing");
  const preparedAt = input.preparedAt ?? new Date();
  const simulatedAt = input.simulation.simulatedAt ?? preparedAt;
  const expiresAt = input.expiresAt ?? new Date(preparedAt.getTime() + REVIEWED_ACTION_DEFAULT_TTL_MS);
  if (expiresAt.getTime() <= preparedAt.getTime()) throw new Error("reviewed_action_expiry_invalid");
  const policy: AirlockPolicy = {
    walletControlledSubmission: true,
    agentSubmitCapability: false,
    simulationRequired: true,
    policyVersion: MATTERHORN_REVIEWED_ACTION_POLICY_VERSION,
    ...(input.policy && Object.keys(input.policy).length > 0 ? { extra: input.policy } : {}),
  };
  const terms = input.exactTerms ?? exactTerms(input.handoff, input.signer);
  const withoutHash = {
    protocol: input.handoff.protocol,
    source: input.handoff.source,
    runId,
    policyHash: policyHash(policy),
    ...terms,
    expiresAt: expiresAt.toISOString(),
    simulation: {
      reference,
      block: input.simulation.block?.trim() || null,
      simulatedAt: simulatedAt.toISOString(),
    },
    preparedAt: preparedAt.toISOString(),
    capabilityClass: "wallet_review_only" as const,
    draft: structuredClone(input.handoff.draft),
  };
  const handoff = {
    version: MATTERHORN_REVIEWED_ACTION_HANDOFF_V2,
    ...withoutHash,
    intentHash: sha256(intentMaterial(withoutHash)),
  } as ReviewedActionHandoffV2;
  if (!isReviewedActionHandoffV2(handoff)) throw new Error("reviewed_action_v2_invalid");
  return handoff;
}

export function validateReviewedActionHandoffV2(input: {
  handoff: ReviewedActionHandoffV2;
  currentDraft?: ReviewedActionDraftHandoff;
  now?: Date;
  maxSimulationAgeMs?: number;
}): ReviewedActionAirlockIssue[] {
  if (!isReviewedActionHandoffV2(input.handoff)) return ["invalid"];
  const issues: ReviewedActionAirlockIssue[] = [];
  const { version: _version, intentHash, ...withoutHash } = input.handoff;
  if (!equalDigest(intentHash, sha256(intentMaterial(withoutHash)))) issues.push("intent_hash_mismatch");
  const nowMs = (input.now ?? new Date()).getTime();
  if (Date.parse(input.handoff.expiresAt) <= nowMs) issues.push("expired");
  const maxSimulationAgeMs = Math.max(1, input.maxSimulationAgeMs ?? REVIEWED_ACTION_MAX_SIMULATION_AGE_MS);
  if (nowMs - Date.parse(input.handoff.simulation.simulatedAt) > maxSimulationAgeMs) issues.push("simulation_stale");
  if (input.currentDraft) {
    if (!isReviewedActionDraftHandoff(input.currentDraft)) issues.push("material_change");
    else if (!equalDigest(sha256(input.currentDraft), sha256({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: input.handoff.protocol,
      source: input.handoff.source,
      draft: input.handoff.draft,
    }))) issues.push("material_change");
  }
  return [...new Set(issues)];
}

export function assertReviewedActionReceiptBinding(input: {
  handoff: ReviewedActionHandoffV2;
  receiptIntentHash: string;
}): void {
  if (!equalDigest(input.handoff.intentHash, input.receiptIntentHash.trim())) {
    throw new Error("reviewed_action_receipt_intent_mismatch");
  }
}
