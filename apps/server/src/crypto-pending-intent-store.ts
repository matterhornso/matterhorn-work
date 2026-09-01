import type {
  MatterhornCryptoIntent,
  MatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";
import { validateMatterhornPolicyDecision } from "@matterhorn-work/types/crypto-coworkers";
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
  wallet_review: new Set(["refreshing", "cancelled", "expired", "wallet_approved"]),
  refreshing: new Set(["wallet_review", "regeneration_required", "cancelled", "expired"]),
  regeneration_required: new Set(["cancelled", "expired"]),
  wallet_approved: new Set(["submitted", "failed", "expired"]),
  cancelled: new Set(),
  expired: new Set(),
  submitted: new Set(),
  failed: new Set(),
};

function storageKey(workspaceId: string, id: string): string {
  return `pending_${sha256({ workspaceId, id })}`;
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
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
      previousIntentHash: input.previousIntentHash ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: input.intent.expiresAt,
    };
    validateRecord(record);
    const key = storageKey(record.workspaceId, record.id);
    const existing = this.stateStore.get<MatterhornPendingCryptoIntent>("crypto_pending_intent", key, now.getTime());
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
    const record = this.stateStore.get<MatterhornPendingCryptoIntent>(
      "crypto_pending_intent",
      storageKey(workspaceId, id),
      this.now().getTime(),
    );
    if (!record) return null;
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
    }).map((record) => {
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
    const current = this.stateStore.take<MatterhornPendingCryptoIntent>(
      "crypto_pending_intent",
      key,
      now.getTime(),
    );
    if (!current) throw new Error("pending_crypto_intent_not_found");
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

  purgeWorkspace(workspaceId: string): number {
    return this.stateStore.purgeWorkspace(workspaceId, ["crypto_pending_intent"], {
      includeConsumedCapabilities: false,
    }).states;
  }

  invalidateCoworker(input: { workspaceId: string; ownerId: string; coworkerId: string }): number {
    let invalidated = 0;
    for (const record of this.list(input.workspaceId, input.ownerId, input.coworkerId)) {
      const nextState = record.state === "wallet_approved"
        ? "failed"
        : TRANSITIONS[record.state].has("cancelled")
          ? "cancelled"
          : null;
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
