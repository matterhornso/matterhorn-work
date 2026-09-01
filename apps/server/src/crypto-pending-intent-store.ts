import type {
  MatterhornCryptoIntent,
  MatterhornCryptoPublicReceipt,
  MatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";
import {
  MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION,
  validateMatterhornCryptoPublicReceipt,
  validateMatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";
import type { ReviewedActionHandoffV2 } from "@matterhorn-work/types/reviewed-actions";
import { isReviewedActionHandoffV2 } from "@matterhorn-work/types/reviewed-actions";

import {
  cryptoIntentToReviewedActionHandoffV2,
  validateCryptoIntentIntegrity,
} from "./crypto-transaction-coordinator.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

export const MATTERHORN_PENDING_CRYPTO_INTENT_VERSION = "matterhorn.pending-crypto-intent.v1";

export type MatterhornPendingCryptoIntentState =
  | "wallet_review"
  | "refreshing"
  | "regeneration_required"
  | "cancelled"
  | "expired"
  | "wallet_approved"
  | "submitted"
  | "confirmed"
  | "failed";

export type MatterhornPendingCryptoIntent = {
  version: typeof MATTERHORN_PENDING_CRYPTO_INTENT_VERSION;
  id: string;
  workspaceId: string;
  sessionId: string;
  ownerId: string;
  coworkerId: string;
  revision: number;
  state: MatterhornPendingCryptoIntentState;
  intent: MatterhornCryptoIntent;
  policyDecision: MatterhornPolicyDecision;
  reviewedAction: ReviewedActionHandoffV2;
  receipt: MatterhornCryptoPublicReceipt | null;
  previousIntentHash: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type CreateInput = {
  workspaceId: string;
  sessionId: string;
  ownerId: string;
  coworkerId: string;
  intent: MatterhornCryptoIntent;
  policyDecision: MatterhornPolicyDecision;
  reviewedAction: ReviewedActionHandoffV2;
  previousIntentHash?: string | null;
};

const RETENTION_AFTER_CREATION_MS = 7 * 24 * 60 * 60_000;

const TRANSITIONS: Readonly<Record<MatterhornPendingCryptoIntentState, ReadonlySet<MatterhornPendingCryptoIntentState>>> = {
  wallet_review: new Set(["refreshing", "cancelled", "expired", "wallet_approved", "submitted", "failed"]),
  refreshing: new Set(["wallet_review", "regeneration_required", "cancelled", "expired"]),
  regeneration_required: new Set(["cancelled", "expired"]),
  wallet_approved: new Set(["submitted", "confirmed", "failed", "cancelled", "expired"]),
  cancelled: new Set(),
  expired: new Set(),
  submitted: new Set(),
  confirmed: new Set(),
  failed: new Set(),
};

function storageKey(workspaceId: string, id: string): string {
  return `pending_${sha256({ workspaceId, id })}`;
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function publicText(value: string | null, maximum: number): boolean {
  return value === null || (value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(value));
}

function receiptProtocol(value: string): MatterhornCryptoPublicReceipt["protocol"] {
  if (value === "sui" || value === "hyperliquid" || value === "bittensor" || value === "polymarket") {
    return value;
  }
  throw new Error("pending_crypto_receipt_protocol_unsupported");
}

function validateRecord(record: MatterhornPendingCryptoIntent): void {
  const expectedReviewedAction = record.policyDecision.decision === "wallet_review_required"
    ? cryptoIntentToReviewedActionHandoffV2(record.intent, record.policyDecision)
    : null;
  if (record.version !== MATTERHORN_PENDING_CRYPTO_INTENT_VERSION
    || record.id !== `cpending_${record.intent.intentHash.slice(0, 24)}`
    || record.workspaceId !== record.intent.workspaceId
    || !record.sessionId.trim()
    || record.coworkerId !== record.intent.coworkerId
    || !record.ownerId.trim()
    || !Number.isSafeInteger(record.revision)
    || record.revision < 1
    || !TRANSITIONS[record.state]
    || validateCryptoIntentIntegrity(record.intent).length > 0
    || validateMatterhornPolicyDecision(record.policyDecision).length > 0
    || record.policyDecision.decision !== "wallet_review_required"
    || record.policyDecision.runId !== record.intent.runId
    || record.policyDecision.intentHash !== record.intent.intentHash
    || !isReviewedActionHandoffV2(record.reviewedAction)
    || expectedReviewedAction === null
    || expectedReviewedAction.intentHash !== record.reviewedAction.intentHash
    || record.reviewedAction.runId !== record.intent.runId
    || record.reviewedAction.signer !== record.intent.signer
    || record.reviewedAction.capabilityClass !== "wallet_review_only"
    || record.reviewedAction.simulation.reference !== record.intent.simulation.reference
    || record.reviewedAction.expiresAt !== record.intent.expiresAt
    || (record.receipt !== null && validateMatterhornCryptoPublicReceipt(record.receipt).length > 0)
    || (record.receipt !== null && (record.receipt.intentHash !== record.intent.intentHash
      || record.receipt.protocol !== record.intent.protocol
      || record.receipt.network !== record.intent.network
      || record.receipt.status !== record.state))
    || (record.receipt === null && ["submitted", "confirmed", "failed"].includes(record.state))
    || (record.receipt !== null && !["submitted", "confirmed", "failed"].includes(record.state))
    || (record.previousIntentHash !== null && !/^[a-f0-9]{64}$/.test(record.previousIntentHash))
    || !validDate(record.createdAt)
    || !validDate(record.updatedAt)
    || !validDate(record.expiresAt)
    || Date.parse(record.createdAt) > Date.parse(record.updatedAt)
    || record.expiresAt !== record.intent.expiresAt) {
    throw new Error("pending_crypto_intent_invalid");
  }
}

function clone(record: MatterhornPendingCryptoIntent): MatterhornPendingCryptoIntent {
  return structuredClone(record);
}

function normalizeRecord(record: MatterhornPendingCryptoIntent): MatterhornPendingCryptoIntent {
  // Pending-intent v1 records created before public receipt reconciliation did
  // not persist this additive field. Treat them as having no receipt so an
  // upgrade cannot strand an already-reviewed wallet action.
  return record.receipt === undefined ? { ...record, receipt: null } : record;
}

export class MatterhornPendingCryptoIntentStore {
  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(input: CreateInput): MatterhornPendingCryptoIntent {
    const now = this.now();
    const record: MatterhornPendingCryptoIntent = {
      version: MATTERHORN_PENDING_CRYPTO_INTENT_VERSION,
      id: `cpending_${input.intent.intentHash.slice(0, 24)}`,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      revision: 1,
      state: "wallet_review",
      intent: structuredClone(input.intent),
      policyDecision: structuredClone(input.policyDecision),
      reviewedAction: structuredClone(input.reviewedAction),
      receipt: null,
      previousIntentHash: input.previousIntentHash ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: input.intent.expiresAt,
    };
    validateRecord(record);
    const key = storageKey(record.workspaceId, record.id);
    const existingValue = this.stateStore.get<MatterhornPendingCryptoIntent>("crypto_pending_intent", key, now.getTime());
    const existing = existingValue ? normalizeRecord(existingValue) : null;
    if (existing) {
      validateRecord(existing);
      if (existing.ownerId !== record.ownerId
        || existing.coworkerId !== record.coworkerId
        || existing.sessionId !== record.sessionId
        || existing.intent.intentHash !== record.intent.intentHash
        || existing.reviewedAction.intentHash !== record.reviewedAction.intentHash
        || existing.policyDecision.intentHash !== record.policyDecision.intentHash
        || existing.previousIntentHash !== record.previousIntentHash
        || existing.state !== "wallet_review") {
        throw new Error("pending_crypto_intent_conflict");
      }
      return clone(existing);
    }
    this.stateStore.put({
      kind: "crypto_pending_intent",
      key,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      value: record,
      expiresAtMs: now.getTime() + RETENTION_AFTER_CREATION_MS,
      nowMs: now.getTime(),
    });
    return clone(record);
  }

  get(workspaceId: string, ownerId: string, coworkerId: string, id: string): MatterhornPendingCryptoIntent | null {
    const stored = this.stateStore.get<MatterhornPendingCryptoIntent>(
      "crypto_pending_intent",
      storageKey(workspaceId, id),
      this.now().getTime(),
    );
    if (!stored) return null;
    const record = normalizeRecord(stored);
    validateRecord(record);
    if (record.workspaceId !== workspaceId
      || record.ownerId !== ownerId
      || record.coworkerId !== coworkerId) return null;
    if (Date.parse(record.expiresAt) <= this.now().getTime()
      && TRANSITIONS[record.state].has("expired")) {
      return this.transition({
        workspaceId,
        ownerId,
        coworkerId,
        id,
        expectedRevision: record.revision,
        nextState: "expired",
      });
    }
    return clone(record);
  }

  list(workspaceId: string, ownerId: string, coworkerId: string): MatterhornPendingCryptoIntent[] {
    const records = this.stateStore.list<MatterhornPendingCryptoIntent>("crypto_pending_intent", {
      workspaceId,
      nowMs: this.now().getTime(),
    }).map((stored) => {
      const record = normalizeRecord(stored);
      validateRecord(record);
      return record;
    }).filter((record) => record.ownerId === ownerId && record.coworkerId === coworkerId);
    return records.map((record) => this.get(
      workspaceId,
      ownerId,
      coworkerId,
      record.id,
    )).filter((record): record is MatterhornPendingCryptoIntent => record !== null);
  }

  transition(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    id: string;
    expectedRevision: number;
    nextState: MatterhornPendingCryptoIntentState;
  }): MatterhornPendingCryptoIntent {
    const now = this.now();
    const key = storageKey(input.workspaceId, input.id);
    const stored = this.stateStore.take<MatterhornPendingCryptoIntent>(
      "crypto_pending_intent",
      key,
      now.getTime(),
    );
    if (!stored) throw new Error("pending_crypto_intent_not_found");
    const current = normalizeRecord(stored);
    validateRecord(current);
    try {
      if (current.workspaceId !== input.workspaceId
        || current.ownerId !== input.ownerId
        || current.coworkerId !== input.coworkerId) {
        throw new Error("pending_crypto_intent_not_found");
      }
      if (current.revision !== input.expectedRevision) throw new Error("pending_crypto_intent_revision_conflict");
      if (!TRANSITIONS[current.state].has(input.nextState)) throw new Error("pending_crypto_intent_transition_invalid");
      const next: MatterhornPendingCryptoIntent = {
        ...current,
        revision: current.revision + 1,
        state: input.nextState,
        updatedAt: now.toISOString(),
      };
      validateRecord(next);
      this.stateStore.put({
        kind: "crypto_pending_intent",
        key,
        workspaceId: next.workspaceId,
        sessionId: next.sessionId,
        value: next,
        expiresAtMs: Date.parse(next.createdAt) + RETENTION_AFTER_CREATION_MS,
        nowMs: now.getTime(),
      });
      return clone(next);
    } catch (error) {
      this.stateStore.put({
        kind: "crypto_pending_intent",
        key,
        workspaceId: current.workspaceId,
        sessionId: current.sessionId,
        value: current,
        expiresAtMs: Date.parse(current.createdAt) + RETENTION_AFTER_CREATION_MS,
        nowMs: now.getTime(),
      });
      throw error;
    }
  }

  reconcileWalletReceipt(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    id: string;
    expectedRevision: number;
    status: "submitted" | "failed";
    publicId: string;
    transactionHash: string | null;
    blockHash: string | null;
    network: string;
    signer: string | null;
    operation: string;
    authorizedArgumentsHash: string;
  }): MatterhornPendingCryptoIntent {
    const now = this.now();
    const key = storageKey(input.workspaceId, input.id);
    const stored = this.stateStore.take<MatterhornPendingCryptoIntent>(
      "crypto_pending_intent",
      key,
      now.getTime(),
    );
    if (!stored) throw new Error("pending_crypto_intent_not_found");
    const current = normalizeRecord(stored);
    validateRecord(current);
    const restore = (record: MatterhornPendingCryptoIntent) => this.stateStore.put({
      kind: "crypto_pending_intent",
      key,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      value: record,
      expiresAtMs: Date.parse(record.createdAt) + RETENTION_AFTER_CREATION_MS,
      nowMs: now.getTime(),
    });
    if (Date.parse(current.expiresAt) <= now.getTime()
      && TRANSITIONS[current.state].has("expired")) {
      const expired: MatterhornPendingCryptoIntent = {
        ...current,
        revision: current.revision + 1,
        state: "expired",
        updatedAt: now.toISOString(),
      };
      validateRecord(expired);
      restore(expired);
      throw new Error("pending_crypto_intent_expired");
    }
    try {
      if (current.workspaceId !== input.workspaceId
        || current.ownerId !== input.ownerId
        || current.coworkerId !== input.coworkerId) {
        throw new Error("pending_crypto_intent_not_found");
      }
      if (!publicText(input.publicId, 256)
        || !publicText(input.transactionHash, 256)
        || !publicText(input.blockHash, 256)
        || input.network !== current.intent.network
        || input.signer !== current.intent.signer
        || input.operation !== current.intent.operation
        || input.authorizedArgumentsHash !== current.intent.authorizedArgumentsHash
        || !/^[a-f0-9]{64}$/.test(input.authorizedArgumentsHash)
        || (current.intent.protocol === "sui"
          && (input.transactionHash === null
            || input.transactionHash !== input.publicId
            || !/^[1-9A-HJ-NP-Za-km-z]{20,128}$/.test(input.transactionHash)))) {
        throw new Error("pending_crypto_receipt_terms_mismatch");
      }
      const receiptMaterial = {
        intentHash: current.intent.intentHash,
        protocol: current.intent.protocol,
        network: current.intent.network,
        status: input.status,
        publicId: input.publicId,
        transactionHash: input.transactionHash,
        blockHash: input.blockHash,
        signer: input.signer,
        operation: input.operation,
        authorizedArgumentsHash: input.authorizedArgumentsHash,
      };
      const receipt: MatterhornCryptoPublicReceipt = {
        version: MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION,
        intentHash: current.intent.intentHash,
        protocol: receiptProtocol(current.intent.protocol),
        network: current.intent.network,
        status: input.status,
        publicId: input.publicId,
        transactionHash: input.transactionHash,
        blockHash: input.blockHash,
        observedAt: now.toISOString(),
        verification: {
          kind: "wallet_reported_public_metadata",
          chainVerified: false,
        },
        evidenceHash: sha256(receiptMaterial),
      };
      if (validateMatterhornCryptoPublicReceipt(receipt).length > 0) {
        throw new Error("pending_crypto_receipt_invalid");
      }
      if (current.receipt) {
        if (current.receipt.evidenceHash !== receipt.evidenceHash
          || current.state !== input.status) {
          throw new Error("pending_crypto_receipt_conflict");
        }
        restore(current);
        return clone(current);
      }
      if (current.revision !== input.expectedRevision) {
        throw new Error("pending_crypto_intent_revision_conflict");
      }
      if (!TRANSITIONS[current.state].has(input.status)) {
        throw new Error("pending_crypto_intent_transition_invalid");
      }
      const next: MatterhornPendingCryptoIntent = {
        ...current,
        revision: current.revision + 1,
        state: input.status,
        receipt,
        updatedAt: now.toISOString(),
      };
      validateRecord(next);
      restore(next);
      return clone(next);
    } catch (error) {
      restore(current);
      throw error;
    }
  }

  purgeWorkspace(workspaceId: string): number {
    return this.stateStore.purgeWorkspace(workspaceId, ["crypto_pending_intent"], {
      includeConsumedCapabilities: false,
    }).states;
  }

  invalidateCoworker(input: { workspaceId: string; ownerId: string; coworkerId: string }): number {
    let invalidated = 0;
    for (const record of this.list(input.workspaceId, input.ownerId, input.coworkerId)) {
      const nextState = TRANSITIONS[record.state].has("cancelled") ? "cancelled" : null;
      if (!nextState) continue;
      this.transition({
        ...input,
        id: record.id,
        expectedRevision: record.revision,
        nextState,
      });
      invalidated += 1;
    }
    return invalidated;
  }
}
