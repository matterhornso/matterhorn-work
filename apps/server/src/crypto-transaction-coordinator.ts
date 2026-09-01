import {
  MATTERHORN_CRYPTO_INTENT_VERSION,
  type MatterhornCryptoAppResult,
  type MatterhornCryptoIntent,
  validateMatterhornCryptoIntent,
} from "@matterhorn-work/types/crypto-coworkers";
import type {
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
} from "@matterhorn-work/types/reviewed-actions";

import { canonicalJson, equalDigest, sha256 } from "./guarded-runtime-crypto.js";
import { buildReviewedActionHandoffV2 } from "./reviewed-action-airlock.js";

export type CertifiedCryptoIntentCompileInput = {
  workspaceId: string;
  runId: string;
  coworkerId: string;
  policyHash: string;
  canonicalRequestArguments: Record<string, unknown>;
  result: MatterhornCryptoAppResult;
  now?: Date;
};

type CompiledTerms = Pick<
  MatterhornCryptoIntent,
  "protocol" | "network" | "signer" | "operation" | "asset" | "amount" | "recipient" | "slippageBps"
> & {
  canonicalArguments: Record<string, unknown>;
  simulationReference: string;
  expiresAt: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("crypto_intent_result_invalid");
  return value as Record<string, unknown>;
}

function text(value: unknown, code = "crypto_intent_result_invalid"): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("crypto_intent_result_invalid");
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error("crypto_intent_result_invalid");
  }
  return Number(value);
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function equalValue(left: unknown, right: unknown): boolean {
  return equalDigest(sha256(left), sha256(right));
}

function assertRequestField(args: Record<string, unknown>, key: string, expected: unknown): void {
  if (!Object.prototype.hasOwnProperty.call(args, key) || !equalValue(args[key], expected)) {
    throw new Error("crypto_intent_request_result_mismatch");
  }
}

function canonicalDecimal(value: unknown): string {
  const decimal = text(value, "crypto_intent_request_result_mismatch");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(decimal)) {
    throw new Error("crypto_intent_request_result_mismatch");
  }
  const [integerPart = "0", fractionPart = ""] = decimal.split(".");
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  return normalizedFraction ? `${integerPart}.${normalizedFraction}` : integerPart;
}

function assertRequestDecimal(args: Record<string, unknown>, key: string, expected: string): void {
  if (!Object.prototype.hasOwnProperty.call(args, key)
    || canonicalDecimal(args[key]) !== canonicalDecimal(expected)) {
    throw new Error("crypto_intent_request_result_mismatch");
  }
}

function compileSui(input: CertifiedCryptoIntentCompileInput, result: Record<string, unknown>): CompiledTerms {
  if (input.result.app.id !== "matterhorn.sui-testnet"
    || input.result.action.id !== "sui_transfer_preview"
    || input.result.action.access !== "prepare"
    || input.result.action.network !== "sui:testnet") {
    throw new Error("crypto_intent_action_unsupported");
  }
  const network = text(result.network);
  const sender = text(result.sender);
  const recipient = text(result.recipient);
  const amountSui = text(result.amountSui);
  const simulationReference = text(result.simulationReference);
  const expiresAt = text(result.expiresAt);
  if (network !== "sui:testnet") throw new Error("crypto_intent_network_mismatch");
  assertRequestField(input.canonicalRequestArguments, "sender", sender);
  assertRequestField(input.canonicalRequestArguments, "recipient", recipient);
  assertRequestField(input.canonicalRequestArguments, "amountSui", amountSui);
  const canonicalArguments: Record<string, unknown> = {
    sender,
    recipient,
    amountSui,
    ...(input.canonicalRequestArguments.memo === undefined ? {} : { memo: input.canonicalRequestArguments.memo }),
  };
  return {
    protocol: "sui",
    network,
    signer: sender,
    operation: "transfer_sui",
    asset: "SUI",
    amount: amountSui,
    recipient,
    slippageBps: null,
    canonicalArguments,
    simulationReference,
    expiresAt,
  };
}

function compileHyperliquid(input: CertifiedCryptoIntentCompileInput, result: Record<string, unknown>): CompiledTerms {
  if (input.result.app.id !== "matterhorn.hyperliquid-testnet"
    || input.result.action.id !== "hyperliquid_preview_order"
    || input.result.action.access !== "prepare"
    || input.result.action.network !== "hyperliquid:testnet") {
    throw new Error("crypto_intent_action_unsupported");
  }
  const network = text(result.network);
  const address = text(result.address);
  const asset = text(result.asset);
  const side = text(result.side);
  const size = text(result.size);
  const orderType = text(result.orderType);
  const limitPrice = nullableText(result.limitPrice);
  const reduceOnly = boolean(result.reduceOnly);
  const maxSlippageBps = integer(result.maxSlippageBps, 0, 1_000);
  const simulationReference = text(result.simulationReference);
  const expiresAt = text(result.expiresAt);
  if (network !== "hyperliquid:testnet"
    || (side !== "buy" && side !== "sell")
    || (orderType !== "market" && orderType !== "limit")) {
    throw new Error("crypto_intent_result_invalid");
  }
  for (const [key, expected] of Object.entries({
    address,
    asset,
    side,
    size,
    orderType,
    reduceOnly,
    maxSlippageBps,
  })) assertRequestField(input.canonicalRequestArguments, key, expected);
  if (orderType === "limit") {
    if (limitPrice === null) throw new Error("crypto_intent_result_invalid");
    assertRequestDecimal(input.canonicalRequestArguments, "price", limitPrice);
  }
  const canonicalArguments = {
    address,
    asset,
    side,
    size,
    orderType,
    limitPrice,
    reduceOnly,
    maxSlippageBps,
  };
  return {
    protocol: "hyperliquid",
    network,
    signer: address,
    operation: "place_order",
    asset,
    amount: size,
    recipient: null,
    slippageBps: maxSlippageBps,
    canonicalArguments,
    simulationReference,
    expiresAt,
  };
}

function intentMaterial(intent: Omit<MatterhornCryptoIntent, "id" | "intentHash">): unknown {
  return intent;
}

export function validateCryptoIntentIntegrity(intent: MatterhornCryptoIntent): string[] {
  const issues = validateMatterhornCryptoIntent(intent);
  if (issues.length > 0) return issues;
  if (!equalDigest(intent.canonicalArgumentsHash, sha256(intent.canonicalArguments))) {
    issues.push("crypto_intent_arguments_hash_mismatch");
  }
  const { id: _id, intentHash, ...withoutIdentity } = intent;
  if (!equalDigest(intentHash, sha256(intentMaterial(withoutIdentity)))) {
    issues.push("crypto_intent_hash_mismatch");
  }
  if (intent.id !== `cintent_${intent.intentHash.slice(0, 24)}`) issues.push("crypto_intent_id_mismatch");
  return [...new Set(issues)];
}

export function compileCertifiedCryptoIntent(input: CertifiedCryptoIntentCompileInput): MatterhornCryptoIntent {
  if (!/^[a-f0-9]{64}$/.test(input.policyHash)
    || !input.workspaceId.trim()
    || !input.runId.trim()
    || !input.coworkerId.trim()
    || input.result.version !== "matterhorn.crypto-app-result.v1"
    || (input.result.action.access !== "prepare" && input.result.action.access !== "simulate")) {
    throw new Error("crypto_intent_context_invalid");
  }
  const preparedAt = new Date(input.result.timing.completedAt);
  const simulatedAt = new Date(input.result.observation.observedAt ?? "");
  const now = input.now ?? preparedAt;
  if (!Number.isFinite(preparedAt.getTime())
    || !Number.isFinite(simulatedAt.getTime())
    || simulatedAt.getTime() > preparedAt.getTime()
    || input.result.observation.freshnessMaxAgeMs === null
    || input.result.observation.ageMs === null
    || input.result.observation.ageMs < 0
    || input.result.observation.ageMs > input.result.observation.freshnessMaxAgeMs) {
    throw new Error("crypto_intent_simulation_stale");
  }
  const projected = record(input.result.result);
  const terms = input.result.app.id === "matterhorn.sui-testnet"
    ? compileSui(input, projected)
    : input.result.app.id === "matterhorn.hyperliquid-testnet"
      ? compileHyperliquid(input, projected)
      : (() => { throw new Error("crypto_intent_action_unsupported"); })();
  const expiresAt = new Date(terms.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())
    || expiresAt.getTime() <= now.getTime()
    || expiresAt.getTime() <= simulatedAt.getTime()) {
    throw new Error("crypto_intent_expired");
  }
  const canonicalArguments = JSON.parse(canonicalJson(terms.canonicalArguments)) as Record<string, unknown>;
  const withoutIdentity: Omit<MatterhornCryptoIntent, "id" | "intentHash"> = {
    version: MATTERHORN_CRYPTO_INTENT_VERSION,
    runId: input.runId.trim(),
    coworkerId: input.coworkerId.trim(),
    workspaceId: input.workspaceId.trim(),
    appId: input.result.app.id,
    actionId: input.result.action.id,
    protocol: terms.protocol,
    network: terms.network,
    signer: terms.signer,
    operation: terms.operation,
    asset: terms.asset,
    amount: terms.amount,
    recipient: terms.recipient,
    slippageBps: terms.slippageBps,
    canonicalArguments,
    canonicalArgumentsHash: sha256(canonicalArguments),
    policyHash: input.policyHash,
    simulation: {
      reference: terms.simulationReference,
      blockOrVersion: input.result.observation.blockOrVersion,
      simulatedAt: simulatedAt.toISOString(),
      validUntil: expiresAt.toISOString(),
    },
    capabilityClass: "wallet_review_only",
    preparedAt: preparedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const intentHash = sha256(intentMaterial(withoutIdentity));
  const intent: MatterhornCryptoIntent = {
    ...withoutIdentity,
    id: `cintent_${intentHash.slice(0, 24)}`,
    intentHash,
  };
  const issues = validateCryptoIntentIntegrity(intent);
  if (issues.length > 0) throw new Error(`crypto_intent_invalid:${issues.join(",")}`);
  return intent;
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("crypto_intent_numeric_term_invalid");
  return parsed;
}

export function cryptoIntentToReviewedActionHandoffV2(intent: MatterhornCryptoIntent): ReviewedActionHandoffV2 {
  const issues = validateCryptoIntentIntegrity(intent);
  if (issues.length > 0) throw new Error(`crypto_intent_invalid:${issues.join(",")}`);
  let handoff: ReviewedActionDraftHandoff;
  if (intent.protocol === "sui"
    && intent.appId === "matterhorn.sui-testnet"
    && intent.actionId === "sui_transfer_preview") {
    handoff = {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "agent-card",
      draft: {
        operation: "transfer_sui",
        network: "testnet",
        sender: intent.signer,
        recipient: text(intent.canonicalArguments.recipient),
        amount: text(intent.canonicalArguments.amountSui),
        coinType: null,
        objectId: null,
        transfers: [],
      },
    };
  } else if (intent.protocol === "hyperliquid"
    && intent.appId === "matterhorn.hyperliquid-testnet"
    && intent.actionId === "hyperliquid_preview_order") {
    const orderType = text(intent.canonicalArguments.orderType);
    const side = text(intent.canonicalArguments.side);
    if ((orderType !== "market" && orderType !== "limit") || (side !== "buy" && side !== "sell")) {
      throw new Error("crypto_intent_terms_invalid");
    }
    handoff = {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "agent-card",
      draft: {
        operation: "place_order",
        network: "testnet",
        asset: text(intent.canonicalArguments.asset),
        orderId: null,
        side,
        size: number(intent.canonicalArguments.size),
        orderType,
        limitPrice: intent.canonicalArguments.limitPrice === null
          ? null
          : number(intent.canonicalArguments.limitPrice),
        slippageBps: integer(intent.canonicalArguments.maxSlippageBps, 0, 1_000),
        reduceOnly: boolean(intent.canonicalArguments.reduceOnly),
      },
    };
  } else {
    throw new Error("crypto_intent_action_unsupported");
  }
  return buildReviewedActionHandoffV2({
    handoff,
    runId: intent.runId,
    signer: intent.signer,
    simulation: {
      reference: intent.simulation.reference,
      block: intent.simulation.blockOrVersion,
      simulatedAt: new Date(intent.simulation.simulatedAt),
    },
    preparedAt: new Date(intent.preparedAt),
    expiresAt: new Date(intent.expiresAt),
    policy: {
      cryptoIntentHash: intent.intentHash,
      evaluatedPolicyHash: intent.policyHash,
    },
  });
}
