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
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import {
  cryptoIntentToReviewedActionHandoffV2,
  validateCryptoIntentIntegrity,
} from "./crypto-transaction-coordinator.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import {
  MatterhornGuardedRuntimeStateStore,
  type GuardedRuntimeStateRecord,
} from "./guarded-runtime-state-store.js";

export const MATTERHORN_PENDING_CRYPTO_INTENT_VERSION = "matterhorn.pending-crypto-intent.v1";
const MATTERHORN_PENDING_CRYPTO_INTENT_ENVELOPE_VERSION = "matterhorn.pending-crypto-intent-envelope.v1";
const PENDING_INTENT_AUTHORITY_DOMAIN = "matterhorn.pending-crypto-intent.authority.v1";
const PENDING_INTENT_AUTHORITY_SALT = Buffer.from("matterhorn.pending-crypto-intent.key.v1", "utf8");
const PENDING_INTENT_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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

type StoredPendingCryptoIntentEnvelope = {
  version: typeof MATTERHORN_PENDING_CRYPTO_INTENT_ENVELOPE_VERSION;
  record: MatterhornPendingCryptoIntent;
  authoritySeal: string;
};

const RETENTION_AFTER_CREATION_MS = 7 * 24 * 60 * 60_000;

const TRANSITIONS: Readonly<Record<MatterhornPendingCryptoIntentState, ReadonlySet<MatterhornPendingCryptoIntentState>>> = {
  wallet_review: new Set(["refreshing", "cancelled", "expired", "wallet_approved", "submitted", "failed"]),
  refreshing: new Set(["wallet_review", "regeneration_required", "cancelled", "expired"]),
  regeneration_required: new Set(["cancelled", "expired"]),
  wallet_approved: new Set(["submitted", "confirmed", "failed", "cancelled", "expired"]),
  cancelled: new Set(),
  expired: new Set(),
  submitted: new Set(["confirmed", "failed"]),
  confirmed: new Set(),
  failed: new Set(),
};

function storageKey(workspaceId: string, id: string): string {
  return `pending_${sha256({ workspaceId, id })}`;
}

function exactObjectKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function pendingIntentAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < PENDING_INTENT_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new Error("pending_crypto_intent_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    PENDING_INTENT_AUTHORITY_SALT,
    PENDING_INTENT_AUTHORITY_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function pendingIntentAuthorityValue(input: {
  key: string;
  workspaceId: string;
  sessionId: string | null;
  expiresAtMs: number | null;
  updatedAtMs: number;
  record: MatterhornPendingCryptoIntent;
}) {
  return {
    domain: PENDING_INTENT_AUTHORITY_DOMAIN,
    kind: "crypto_pending_intent",
    ...input,
  };
}

function sealPendingIntentAuthority(value: unknown, key: Buffer): string {
  return createHmac("sha256", key).update(canonicalJson(value), "utf8").digest("base64url");
}

function pendingIntentAuthoritySealValid(value: unknown, seal: string, key: Buffer): boolean {
  if (!AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const expected = Buffer.from(sealPendingIntentAuthority(value, key), "base64url");
  const actual = Buffer.from(seal, "base64url");
  try {
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  } finally {
    expected.fill(0);
    actual.fill(0);
  }
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

export class MatterhornPendingCryptoIntentStore {
  readonly #authorityKey: Buffer | null;

  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly now: () => Date = () => new Date(),
    integritySecret = process.env.MATTERHORN_COWORKER_INTEGRITY_SECRET ?? "",
  ) {
    this.#authorityKey = integritySecret.length > 0
      ? pendingIntentAuthorityKey(integritySecret)
      : null;
  }

  #requireAuthorityKey(): Buffer {
    if (!this.#authorityKey) throw new Error("pending_crypto_intent_integrity_secret_invalid");
    return this.#authorityKey;
  }

  #recordFromStored(
    stored: GuardedRuntimeStateRecord<unknown>,
  ): MatterhornPendingCryptoIntent {
    const value = stored.value;
    if (!exactObjectKeys(value, ["version", "record", "authoritySeal"])
      || value.version !== MATTERHORN_PENDING_CRYPTO_INTENT_ENVELOPE_VERSION
      || typeof value.authoritySeal !== "string"
      || !exactObjectKeys(value.record, [
        "version",
        "id",
        "workspaceId",
        "sessionId",
        "ownerId",
        "coworkerId",
        "revision",
        "state",
        "intent",
        "policyDecision",
        "reviewedAction",
        "receipt",
        "previousIntentHash",
        "createdAt",
        "updatedAt",
        "expiresAt",
      ])) {
      throw new Error("pending_crypto_intent_state_corrupt");
    }
    const record = value.record as MatterhornPendingCryptoIntent;
    try {
      validateRecord(record);
    } catch {
      throw new Error("pending_crypto_intent_state_corrupt");
    }
    const expectedKey = storageKey(record.workspaceId, record.id);
    const expectedRetentionExpiry = Date.parse(record.createdAt) + RETENTION_AFTER_CREATION_MS;
    const expectedUpdatedAt = Date.parse(record.updatedAt);
    if (stored.kind !== "crypto_pending_intent"
      || stored.key !== expectedKey
      || stored.workspaceId !== record.workspaceId
      || stored.sessionId !== record.sessionId
      || stored.expiresAtMs !== expectedRetentionExpiry
      || stored.updatedAtMs !== expectedUpdatedAt) {
      throw new Error("pending_crypto_intent_state_corrupt");
    }
    const authorityValue = pendingIntentAuthorityValue({
      key: stored.key,
      workspaceId: stored.workspaceId,
      sessionId: stored.sessionId,
      expiresAtMs: stored.expiresAtMs,
      updatedAtMs: stored.updatedAtMs,
      record,
    });
    if (!pendingIntentAuthoritySealValid(
      authorityValue,
      value.authoritySeal,
      this.#requireAuthorityKey(),
    )) {
      throw new Error("pending_crypto_intent_state_corrupt");
    }
    return clone(record);
  }

  #putRecord(record: MatterhornPendingCryptoIntent): void {
    validateRecord(record);
    const key = storageKey(record.workspaceId, record.id);
    const expiresAtMs = Date.parse(record.createdAt) + RETENTION_AFTER_CREATION_MS;
    const updatedAtMs = Date.parse(record.updatedAt);
    const authorityValue = pendingIntentAuthorityValue({
      key,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      expiresAtMs,
      updatedAtMs,
      record,
    });
    const envelope: StoredPendingCryptoIntentEnvelope = {
      version: MATTERHORN_PENDING_CRYPTO_INTENT_ENVELOPE_VERSION,
      record: clone(record),
      authoritySeal: sealPendingIntentAuthority(authorityValue, this.#requireAuthorityKey()),
    };
    this.stateStore.put({
      kind: "crypto_pending_intent",
      key,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      value: envelope,
      expiresAtMs,
      nowMs: updatedAtMs,
    });
  }

  #takeRecord(key: string, nowMs: number): MatterhornPendingCryptoIntent | null {
    const stored = this.stateStore.takeRecord<unknown>("crypto_pending_intent", key, nowMs);
    return stored ? this.#recordFromStored(stored) : null;
  }

  #listRecords(workspaceId: string, nowMs: number): MatterhornPendingCryptoIntent[] {
    return this.stateStore.listRecords<unknown>("crypto_pending_intent", {
      workspaceId,
      nowMs,
    }).map((stored) => this.#recordFromStored(stored));
  }

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
    const existingValue = this.stateStore.getRecord<unknown>("crypto_pending_intent", key, now.getTime());
    const existing = existingValue ? this.#recordFromStored(existingValue) : null;
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
    this.#putRecord(record);
    return clone(record);
  }

  get(workspaceId: string, ownerId: string, coworkerId: string, id: string): MatterhornPendingCryptoIntent | null {
    const stored = this.stateStore.getRecord<unknown>(
      "crypto_pending_intent",
      storageKey(workspaceId, id),
      this.now().getTime(),
    );
    if (!stored) return null;
    const record = this.#recordFromStored(stored);
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
    const records = this.#listRecords(workspaceId, this.now().getTime())
      .filter((record) => record.ownerId === ownerId && record.coworkerId === coworkerId);
    return records.map((record) => this.get(
      workspaceId,
      ownerId,
      coworkerId,
      record.id,
    )).filter((record): record is MatterhornPendingCryptoIntent => record !== null);
  }

  listForOwner(workspaceId: string, ownerId: string): MatterhornPendingCryptoIntent[] {
    const records = this.#listRecords(workspaceId, this.now().getTime())
      .filter((record) => record.ownerId === ownerId);
    return records.map((record) => this.get(
      workspaceId,
      ownerId,
      record.coworkerId,
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
    return this.stateStore.transaction(() => {
      const stored = this.#takeRecord(key, now.getTime());
      if (!stored) throw new Error("pending_crypto_intent_not_found");
      const current = stored;
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
      this.#putRecord(next);
      return clone(next);
    });
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
    let expiredTransition = false;
    const record = this.stateStore.transaction(() => {
      const stored = this.#takeRecord(key, now.getTime());
      if (!stored) throw new Error("pending_crypto_intent_not_found");
      const current = stored;
      const restore = (record: MatterhornPendingCryptoIntent) => this.#putRecord(record);
      if (Date.parse(current.expiresAt) <= now.getTime()
        && TRANSITIONS[current.state].has("expired")) {
        const expiredRecord: MatterhornPendingCryptoIntent = {
          ...current,
          revision: current.revision + 1,
          state: "expired",
          updatedAt: now.toISOString(),
        };
        validateRecord(expiredRecord);
        restore(expiredRecord);
        expiredTransition = true;
        return clone(expiredRecord);
      }
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
            || input.blockHash !== null
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
    });
    if (expiredTransition) throw new Error("pending_crypto_intent_expired");
    return record;
  }

  reconcileVerifiedSuiReceipt(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    id: string;
    expectedRevision: number;
    verification: {
      network: "sui:testnet";
      digest: string;
      status: "confirmed" | "failed";
      signer: string;
      recipient: string;
      amountMist: string;
      epoch: string | null;
      source: "sui.grpc";
      observedAt: string;
    };
  }): MatterhornPendingCryptoIntent {
    const now = this.now();
    const key = storageKey(input.workspaceId, input.id);
    return this.stateStore.transaction(() => {
      const stored = this.#takeRecord(key, now.getTime());
      if (!stored) throw new Error("pending_crypto_intent_not_found");
      const current = stored;
      const restore = (record: MatterhornPendingCryptoIntent) => this.#putRecord(record);
      const canonical = current.intent.canonicalArguments;
      const amountSui = typeof canonical.amountSui === "string" ? canonical.amountSui : "";
      const recipient = typeof canonical.recipient === "string" ? canonical.recipient : "";
      const [whole = "", fraction = ""] = amountSui.split(".");
      const amountMist = /^(?:0|[1-9][0-9]*)$/.test(whole)
        && /^\d{0,9}$/.test(fraction)
        ? (BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"))).toString()
        : "";
      const verification = input.verification;
      if (current.workspaceId !== input.workspaceId
        || current.ownerId !== input.ownerId
        || current.coworkerId !== input.coworkerId) {
        throw new Error("pending_crypto_intent_not_found");
      }
      if (current.revision !== input.expectedRevision) {
        throw new Error("pending_crypto_intent_revision_conflict");
      }
      if (current.state !== "submitted"
        || !current.receipt
        || current.receipt.verification.kind !== "wallet_reported_public_metadata"
        || current.intent.protocol !== "sui"
        || current.intent.network !== verification.network
        || current.intent.signer !== verification.signer
        || current.intent.operation !== "transfer_sui"
        || recipient !== verification.recipient
        || amountMist !== verification.amountMist
        || current.receipt.publicId !== verification.digest
        || current.receipt.transactionHash !== verification.digest
        || current.receipt.blockHash !== null
        || !Number.isFinite(Date.parse(verification.observedAt))
        || Date.parse(verification.observedAt) < Date.parse(current.receipt.observedAt)
        || (verification.epoch !== null && !/^(?:0|[1-9][0-9]*)$/.test(verification.epoch))
        || verification.source !== "sui.grpc") {
        throw new Error("pending_crypto_receipt_chain_verification_mismatch");
      }
      if (!TRANSITIONS[current.state].has(verification.status)) {
        throw new Error("pending_crypto_intent_transition_invalid");
      }
      const receiptMaterial = {
        intentHash: current.intent.intentHash,
        protocol: current.intent.protocol,
        network: current.intent.network,
        status: verification.status,
        publicId: verification.digest,
        transactionHash: verification.digest,
        blockHash: null,
        verification: {
          source: verification.source,
          observedAt: verification.observedAt,
          epoch: verification.epoch,
          signer: verification.signer,
          recipient: verification.recipient,
          amountMist: verification.amountMist,
        },
      };
      const receipt: MatterhornCryptoPublicReceipt = {
        version: MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION,
        intentHash: current.intent.intentHash,
        protocol: "sui",
        network: current.intent.network,
        status: verification.status,
        publicId: verification.digest,
        transactionHash: verification.digest,
        blockHash: null,
        observedAt: verification.observedAt,
        verification: { kind: "public_chain", chainVerified: true },
        evidenceHash: sha256(receiptMaterial),
      };
      if (validateMatterhornCryptoPublicReceipt(receipt).length > 0) {
        throw new Error("pending_crypto_receipt_invalid");
      }
      const next: MatterhornPendingCryptoIntent = {
        ...current,
        revision: current.revision + 1,
        state: verification.status,
        receipt,
        updatedAt: now.toISOString(),
      };
      validateRecord(next);
      restore(next);
      return clone(next);
    });
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

  invalidateConnection(input: { workspaceId: string; connectionId: string }): number {
    const records = this.#listRecords(input.workspaceId, this.now().getTime())
      .filter((record) => record.intent.connectionId === input.connectionId);
    let invalidated = 0;
    for (const record of records) {
      if (!TRANSITIONS[record.state].has("cancelled")) continue;
      this.transition({
        workspaceId: record.workspaceId,
        ownerId: record.ownerId,
        coworkerId: record.coworkerId,
        id: record.id,
        expectedRevision: record.revision,
        nextState: "cancelled",
      });
      invalidated += 1;
    }
    return invalidated;
  }
}
