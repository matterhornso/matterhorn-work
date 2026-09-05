import type {
  MatterhornEncryptedEvidenceEnvelope,
  MatterhornEvidenceBundle,
  MatterhornEvidenceVerificationStatus,
  MatterhornSuiEvidenceAnchor,
  MatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";
import {
  validateMatterhornSuiEvidenceAnchor,
  validateMatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";
import { createHash, randomUUID } from "node:crypto";
import { normalizeSuiObjectId } from "@mysten/sui/utils";

import type {
  MatterhornEvidenceKeyManager,
  MatterhornSealedEvidence,
} from "./crypto-evidence-sealer.js";
import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import type {
  GuardedRuntimeStateRecord,
  MatterhornGuardedRuntimeStateStore,
} from "./guarded-runtime-state-store.js";
import type { MatterhornRecoveryErasureLedger } from "./recovery-erasure-ledger.js";
import {
  decryptMatterhornEvidenceEnvelope,
  serializeMatterhornWalrusCiphertext,
} from "./walrus-evidence-envelope.js";
import { verifyMatterhornEvidenceMerkleProof } from "./walrus-evidence-merkle.js";

const RECORD_VERSION = "matterhorn.crypto-evidence-record.v1" as const;
const STATE_KIND = "crypto_evidence_record" as const;
const RUN_INDEX_KIND = "crypto_evidence_run_index" as const;
const OPERATION_CLAIM_KIND = "crypto_evidence_operation_claim" as const;
const AUDIT_VERSION = "matterhorn.crypto-evidence-access.v1" as const;
const AUDIT_KIND = "crypto_evidence_audit" as const;
const VERIFICATION_STATUS_KIND = "crypto_evidence_verification_status" as const;
const SECURITY_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const OPERATION_CLAIM_TTL_MS = 5 * 60 * 1_000;

type MatterhornCryptoEvidenceOperationClaim = {
  version: "matterhorn.crypto-evidence-operation-claim.v1";
  claimId: string;
  evidenceId: string;
  expectedRevision: number;
  operation: "publish" | "renew" | "delete" | "anchor" | "rotate_key" | "destroy_key";
  createdAt: string;
  expiresAt: string;
};

type MatterhornCryptoEvidenceLegacyPublicationClaim = {
  version: "matterhorn.crypto-evidence-publication-claim.v1";
  claimId: string;
  evidenceId: string;
  expectedRevision: number;
  createdAt: string;
  expiresAt: string;
};

type MatterhornCryptoEvidencePublicationCandidate = MatterhornCryptoEvidenceRecord & {
  state: "sealed";
  envelope: MatterhornEncryptedEvidenceEnvelope;
};

type MatterhornCryptoEvidenceVerificationStatusRecord = {
  version: "matterhorn.crypto-evidence-verification-status.v1";
  evidenceId: string;
  evidenceRevision: number;
  ownerIdHash: string;
  verification: MatterhornEvidenceVerificationStatus;
};

export type MatterhornCryptoEvidenceAccessEvent = {
  version: typeof AUDIT_VERSION;
  id: string;
  evidenceId: string;
  sequence: number;
  workspaceIdHash: string;
  ownerIdHash: string;
  coworkerIdHash: string;
  action: "seal" | "decrypt" | "attach_proof" | "attach_anchor" | "renew_proof" | "rotate_key" | "destroy_key";
  outcome: "allowed" | "denied";
  reason: string;
  recordRevision: number;
  keyReferenceHash: string;
  previousHash: string | null;
  recordHash: string;
  createdAt: string;
  expiresAt: string;
};

export type MatterhornCryptoEvidenceRecord = {
  version: typeof RECORD_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
  runId: string;
  coworkerId: string;
  revision: number;
  state: "sealed" | "published" | "key_destroyed";
  envelope: MatterhornEncryptedEvidenceEnvelope | null;
  key: {
    keyReference: string | null;
    keyReferenceHash: string;
    wrappedKey: string | null;
    keyContext: string | null;
    recipientKeyIds: string[];
    rotatedAt?: string;
  };
  index: Omit<
    MatterhornSealedEvidence["localIndex"],
    "keyReference" | "wrappedKey" | "keyContext" | "recipientKeyIds"
  >;
  walrusProof: MatterhornWalrusProof | null;
  suiAnchor?: MatterhornSuiEvidenceAnchor | null;
  /** Hash only; the account-linked wallet address is never stored in this record. */
  walrusOwnerAddressHash?: string | null;
  createdAt: string;
  updatedAt: string;
};

function clone(record: MatterhornCryptoEvidenceRecord): MatterhornCryptoEvidenceRecord {
  return structuredClone(record);
}

function runIndexExpiry(record: MatterhornCryptoEvidenceRecord): number | null {
  if (record.state !== "key_destroyed") return null;
  const updatedAt = Date.parse(record.updatedAt);
  return Number.isFinite(updatedAt) ? updatedAt + SECURITY_RETENTION_MS : null;
}

function assertTenant(record: MatterhornCryptoEvidenceRecord, input: {
  workspaceId: string;
  ownerId: string;
  coworkerId?: string;
}): void {
  if (record.workspaceId !== input.workspaceId
    || record.ownerId !== input.ownerId
    || (input.coworkerId !== undefined && record.coworkerId !== input.coworkerId)) {
    throw new Error("crypto_evidence_not_found");
  }
}

function validateSealedEvidence(sealed: MatterhornSealedEvidence): void {
  const publicBytes = serializeMatterhornWalrusCiphertext(sealed.envelope);
  if (createHash("sha256").update(publicBytes).digest("hex") !== sealed.envelope.ciphertextHash
    || sealed.localIndex.evidenceId.length < 1
    || sealed.localIndex.keyReference !== sealed.envelope.keyReference
    || sealed.localIndex.ciphertextHash !== sealed.envelope.ciphertextHash
    || sealed.localIndex.merkleLeaf !== sealed.envelope.merkleLeaf
    || !sealed.localIndex.wrappedKey
    || !sealed.localIndex.keyContext) {
    throw new Error("crypto_evidence_sealed_record_invalid");
  }
}

export class MatterhornCryptoEvidenceStore {
  private readonly operationClaims: MatterhornDurableAuthorizedState | null;

  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly keyManager: MatterhornEvidenceKeyManager,
    private readonly options: { allowMainnet?: boolean } = {},
    private readonly erasureLedger: MatterhornRecoveryErasureLedger | null = null,
    private readonly authority?: MatterhornDurableStateAuthority,
  ) {
    this.operationClaims = authority
      ? new MatterhornDurableAuthorizedState(
        stateStore,
        authority,
        OPERATION_CLAIM_KIND,
        "crypto_evidence_operation_claim_integrity_invalid",
      )
      : null;
  }

  private requireAuthority(): MatterhornDurableStateAuthority {
    if (!this.authority) throw new Error("crypto_evidence_state_integrity_unavailable");
    return this.authority;
  }

  private requireOperationClaims(): MatterhornDurableAuthorizedState {
    if (!this.operationClaims) throw new Error("crypto_evidence_state_integrity_unavailable");
    return this.operationClaims;
  }

  private activeOperationClaim(input: {
    workspaceId: string;
    evidenceId: string;
    nowMs?: number;
  }): MatterhornCryptoEvidenceOperationClaim | null {
    return this.requireOperationClaims().get<MatterhornCryptoEvidenceOperationClaim>(
      this.operationClaimKey(input),
      input.nowMs ?? Date.now(),
    );
  }

  private admitRecord(
    state: GuardedRuntimeStateRecord<unknown> | null,
  ): MatterhornCryptoEvidenceRecord | null {
    if (!state) return null;
    try {
      const record = this.requireAuthority().open<MatterhornCryptoEvidenceRecord>(
        state,
        "crypto_evidence_state_integrity_invalid",
      );
      if (!record) throw new Error("crypto_evidence_state_integrity_invalid");
      const createdAtMs = Date.parse(record.createdAt);
      const updatedAtMs = Date.parse(record.updatedAt);
      const expectedExpiry = runIndexExpiry(record);
      const metadataIssues = [
        state.kind !== STATE_KIND && "kind",
        state.key !== record.id && "key",
        state.workspaceId !== record.workspaceId && "workspace",
        state.sessionId !== null && "session",
        state.expiresAtMs !== expectedExpiry && "expiry",
        state.updatedAtMs !== updatedAtMs && "updated_at",
        record.version !== RECORD_VERSION && "version",
        !record.id.trim() && "id",
        !record.workspaceId.trim() && "workspace_id",
        !record.ownerId.trim() && "owner_id",
        !record.runId.trim() && "run_id",
        !record.coworkerId.trim() && "coworker_id",
        (!Number.isSafeInteger(record.revision) || record.revision < 1) && "revision",
        (!Number.isFinite(createdAtMs)
          || new Date(createdAtMs).toISOString() !== record.createdAt) && "created_at",
        (!Number.isFinite(updatedAtMs)
          || new Date(updatedAtMs).toISOString() !== record.updatedAt) && "record_updated_at",
        record.index?.evidenceId !== record.id && "index",
        !record.key && "key_metadata",
        (!record.key || !/^[a-f0-9]{64}$/.test(record.key.keyReferenceHash)) && "key_hash",
        (record.walrusOwnerAddressHash !== undefined
          && record.walrusOwnerAddressHash !== null
          && !/^[a-f0-9]{64}$/.test(record.walrusOwnerAddressHash)) && "walrus_owner",
      ].filter(Boolean);
      if (metadataIssues.length > 0) {
        throw new Error("crypto_evidence_state_integrity_invalid");
      }
      if (record.state === "key_destroyed") {
        if (record.envelope !== null
          || record.key.keyReference !== null
          || record.key.wrappedKey !== null
          || record.key.keyContext !== null
          || record.key.recipientKeyIds.length !== 0) {
          throw new Error("crypto_evidence_state_integrity_invalid");
        }
      } else {
        if (!record.envelope
          || !record.key.keyReference?.trim()
          || !record.key.wrappedKey?.trim()
          || !record.key.keyContext?.trim()
          || record.envelope.ciphertextHash !== record.index.ciphertextHash
          || record.envelope.merkleLeaf !== record.index.merkleLeaf) {
          throw new Error("crypto_evidence_state_integrity_invalid");
        }
        // A recovery-erasure marker lives outside the ordinary backup rollback
        // domain. Once it exists, never parse or publish restored ciphertext;
        // admit only enough authenticated metadata for key-destruction cleanup.
        if (this.recoveryMaterialErased(record)) return record;
        if (record.key.keyReferenceHash !== sha256(record.key.keyReference)) {
          throw new Error("crypto_evidence_state_integrity_invalid");
        }
        serializeMatterhornWalrusCiphertext(record.envelope);
      }
      if ((record.state === "sealed" && record.walrusProof)
        || (record.state === "published" && !record.walrusProof)) {
        throw new Error("crypto_evidence_state_integrity_invalid");
      }
      if (record.walrusProof) {
        if (validateMatterhornWalrusProof(record.walrusProof).length > 0
          || !verifyMatterhornEvidenceMerkleProof({
            ciphertextHash: record.index.ciphertextHash,
            leaf: record.index.merkleLeaf,
            root: record.walrusProof.merkleRoot,
            proof: record.walrusProof.merkleProof,
          })) {
          throw new Error("crypto_evidence_state_integrity_invalid");
        }
      }
      if (record.suiAnchor && validateMatterhornSuiEvidenceAnchor(record.suiAnchor).length > 0) {
        throw new Error("crypto_evidence_state_integrity_invalid");
      }
      return record;
    } catch {
      throw new Error("crypto_evidence_state_integrity_invalid");
    }
  }

  private storedRecord(evidenceId: string, nowMs = Date.now()): MatterhornCryptoEvidenceRecord | null {
    return this.admitRecord(this.stateStore.getRecord(STATE_KIND, evidenceId, nowMs));
  }

  private storedRecords(input: { workspaceId?: string; nowMs?: number } = {}): MatterhornCryptoEvidenceRecord[] {
    return this.stateStore.listRecords(STATE_KIND, input).map((state) => {
      const record = this.admitRecord(state);
      if (!record) throw new Error("crypto_evidence_state_integrity_invalid");
      return record;
    });
  }

  private persistRecord(record: MatterhornCryptoEvidenceRecord, nowMs: number): void {
    const expiresAtMs = runIndexExpiry(record);
    if (Date.parse(record.updatedAt) !== nowMs) {
      throw new Error("crypto_evidence_state_integrity_invalid");
    }
    this.stateStore.put({
      kind: STATE_KIND,
      key: record.id,
      workspaceId: record.workspaceId,
      value: this.requireAuthority().seal({
        kind: STATE_KIND,
        key: record.id,
        workspaceId: record.workspaceId,
        sessionId: null,
        expiresAtMs,
        updatedAtMs: nowMs,
        value: record,
      }),
      expiresAtMs,
      nowMs,
    });
  }

  private recoveryMaterialErased(record: MatterhornCryptoEvidenceRecord): boolean {
    if (!this.erasureLedger || !record.key.wrappedKey || !record.key.keyContext) return false;
    return this.erasureLedger.eventFor({
      materialKind: "crypto_evidence",
      wrappedKey: record.key.wrappedKey,
      keyContext: record.key.keyContext,
    }) !== null;
  }

  private identityHash(kind: "workspace" | "owner" | "coworker", workspaceId: string, value: string): string {
    return sha256({ domain: `matterhorn:crypto-evidence-audit:${kind}:v1`, workspaceId, value });
  }

  private runIndexKey(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    runId: string;
  }): string {
    return sha256({
      domain: "matterhorn:crypto-evidence-run-index:v1",
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      runId: input.runId,
    });
  }

  private operationClaimKey(input: { workspaceId: string; evidenceId: string }): string {
    return sha256({
      domain: "matterhorn:crypto-evidence-operation-claim:v1",
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
    });
  }

  private legacyPublicationClaimKey(input: { workspaceId: string; evidenceId: string }): string {
    return sha256({
      domain: "matterhorn:crypto-evidence-publication-claim:v1",
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
    });
  }

  private verificationStatusKey(input: { workspaceId: string; evidenceId: string }): string {
    return sha256({
      domain: "matterhorn:crypto-evidence-verification-status:v1",
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
    });
  }

  private clearVerificationStatus(input: { workspaceId: string; evidenceId: string }): void {
    this.stateStore.delete(VERIFICATION_STATUS_KIND, this.verificationStatusKey(input));
  }

  private beginExclusiveOperation(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    operation: MatterhornCryptoEvidenceOperationClaim["operation"];
    now?: Date;
  }): { record: MatterhornCryptoEvidenceRecord; claimId: string } {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    return this.stateStore.transaction(() => {
      this.stateStore.deleteExpired(now.getTime());
      const record = this.storedRecord(input.evidenceId, now.getTime());
      if (!record) throw new Error("crypto_evidence_not_found");
      assertTenant(record, input);
      if (record.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
      const legacyClaim = this.stateStore.get<MatterhornCryptoEvidenceLegacyPublicationClaim>(
        "crypto_evidence_publication_claim",
        this.legacyPublicationClaimKey(input),
        now.getTime(),
      );
      if (legacyClaim) {
        throw new Error(input.operation === "publish"
          ? "crypto_evidence_walrus_publication_in_progress"
          : input.operation === "renew"
            ? "crypto_evidence_walrus_renewal_in_progress"
            : input.operation === "delete"
              ? "crypto_evidence_walrus_deletion_in_progress"
            : "crypto_evidence_operation_in_progress");
      }
      if (input.operation === "publish") {
        if (record.state !== "sealed" || !record.envelope || this.recoveryMaterialErased(record)) {
          throw new Error("crypto_evidence_walrus_publish_state_invalid");
        }
      } else if (record.state === "key_destroyed"
        || !record.key.keyReference
        || !record.key.wrappedKey
        || !record.key.keyContext
        || this.recoveryMaterialErased(record)) {
        throw new Error("crypto_evidence_key_destroyed");
      }

      const claimId = `crypto_evidence_operation_${randomUUID().replaceAll("-", "")}`;
      const expiresAtMs = now.getTime() + OPERATION_CLAIM_TTL_MS;
      const claim: MatterhornCryptoEvidenceOperationClaim = {
        version: "matterhorn.crypto-evidence-operation-claim.v1",
        claimId,
        evidenceId: record.id,
        expectedRevision: record.revision,
        operation: input.operation,
        createdAt: now.toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      const claimed = this.requireOperationClaims().putIfAbsent({
        key: this.operationClaimKey(input),
        workspaceId: input.workspaceId,
        value: claim,
        expiresAtMs,
        nowMs: now.getTime(),
      });
      if (!claimed) {
        const activeClaim = this.activeOperationClaim({ ...input, nowMs: now.getTime() });
        throw new Error(input.operation === "publish" && activeClaim?.operation === "publish"
          ? "crypto_evidence_walrus_publication_in_progress"
          : input.operation === "renew" && activeClaim?.operation === "renew"
            ? "crypto_evidence_walrus_renewal_in_progress"
            : input.operation === "delete" && activeClaim?.operation === "delete"
              ? "crypto_evidence_walrus_deletion_in_progress"
            : "crypto_evidence_operation_in_progress");
      }
      return { record: clone(record), claimId };
    });
  }

  private endExclusiveOperation(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now?: Date;
  }): boolean {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    return this.stateStore.transaction(() => this.endExclusiveOperationInTransaction({ ...input, now }));
  }

  private endExclusiveOperationInTransaction(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now: Date;
  }): boolean {
    const key = this.operationClaimKey(input);
    const claim = this.activeOperationClaim({ ...input, nowMs: input.now.getTime() });
    if (!claim || claim.claimId !== input.claimId || claim.evidenceId !== input.evidenceId) return false;
    return this.requireOperationClaims().delete(key);
  }

  findByRun(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    runId: string;
  }): MatterhornCryptoEvidenceRecord | null {
    const indexKey = this.runIndexKey(input);
    const indexed = this.stateStore.get<{ evidenceId: string }>(RUN_INDEX_KIND, indexKey);
    if (indexed) {
      const record = this.storedRecord(indexed.evidenceId);
      if (!record
        || record.workspaceId !== input.workspaceId
        || record.ownerId !== input.ownerId
        || record.coworkerId !== input.coworkerId
        || record.runId !== input.runId) {
        throw new Error("crypto_evidence_run_index_corrupt");
      }
      return clone(record);
    }

    const legacy = this.storedRecords({
      workspaceId: input.workspaceId,
    }).find((record) => record.ownerId === input.ownerId
      && record.coworkerId === input.coworkerId
      && record.runId === input.runId);
    if (!legacy) return null;
    this.stateStore.put({
      kind: RUN_INDEX_KIND,
      key: indexKey,
      workspaceId: input.workspaceId,
      value: { evidenceId: legacy.id },
      expiresAtMs: runIndexExpiry(legacy),
    });
    return clone(legacy);
  }

  private recordAccess(input: {
    record: MatterhornCryptoEvidenceRecord;
    action: MatterhornCryptoEvidenceAccessEvent["action"];
    outcome: MatterhornCryptoEvidenceAccessEvent["outcome"];
    reason: string;
    now?: Date;
  }): MatterhornCryptoEvidenceAccessEvent {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const existing = this.stateStore.list<MatterhornCryptoEvidenceAccessEvent>(AUDIT_KIND, {
      workspaceId: input.record.workspaceId,
      nowMs: now.getTime(),
    }).filter((event) => event.evidenceId === input.record.id)
      .sort((left, right) => left.sequence - right.sequence);
    const previous = existing.at(-1) ?? null;
    const reason = input.reason.trim().slice(0, 80) || "unspecified";
    const unsigned = {
      version: AUDIT_VERSION,
      id: `crypto_evidence_audit_${randomUUID().replaceAll("-", "")}`,
      evidenceId: input.record.id,
      sequence: (previous?.sequence ?? 0) + 1,
      workspaceIdHash: this.identityHash("workspace", input.record.workspaceId, input.record.workspaceId),
      ownerIdHash: this.identityHash("owner", input.record.workspaceId, input.record.ownerId),
      coworkerIdHash: this.identityHash("coworker", input.record.workspaceId, input.record.coworkerId),
      action: input.action,
      outcome: input.outcome,
      reason,
      recordRevision: input.record.revision,
      keyReferenceHash: input.record.key.keyReferenceHash,
      previousHash: previous?.recordHash ?? null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SECURITY_RETENTION_MS).toISOString(),
    } as const;
    const event: MatterhornCryptoEvidenceAccessEvent = {
      ...unsigned,
      recordHash: sha256({ domain: "matterhorn:crypto-evidence-access-record:v1", ...unsigned }),
    };
    this.stateStore.put({
      kind: AUDIT_KIND,
      key: event.id,
      workspaceId: input.record.workspaceId,
      value: event,
      expiresAtMs: Date.parse(event.expiresAt),
      nowMs: now.getTime(),
    });
    return structuredClone(event);
  }

  listAccessAudit(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId?: string;
  }): MatterhornCryptoEvidenceAccessEvent[] {
    const ownerIdHash = this.identityHash("owner", input.workspaceId, input.ownerId);
    const events = this.stateStore.list<MatterhornCryptoEvidenceAccessEvent>(AUDIT_KIND, {
      workspaceId: input.workspaceId,
    }).filter((event) => event.ownerIdHash === ownerIdHash
      && (input.evidenceId === undefined || event.evidenceId === input.evidenceId))
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId) || left.sequence - right.sequence);
    const previousByEvidence = new Map<string, MatterhornCryptoEvidenceAccessEvent>();
    for (const event of events) {
      const { recordHash, ...unsigned } = event;
      if (recordHash !== sha256({ domain: "matterhorn:crypto-evidence-access-record:v1", ...unsigned })) {
        throw new Error("crypto_evidence_audit_corrupt");
      }
      const previous = previousByEvidence.get(event.evidenceId);
      if (previous && event.previousHash !== previous.recordHash) {
        throw new Error("crypto_evidence_audit_chain_broken");
      }
      previousByEvidence.set(event.evidenceId, event);
    }
    return events.map((event) => structuredClone(event));
  }

  create(input: {
    workspaceId: string;
    ownerId: string;
    runId: string;
    coworkerId: string;
    sealed: MatterhornSealedEvidence;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord {
    for (const value of [input.workspaceId, input.ownerId, input.runId, input.coworkerId]) {
      if (!value.trim()) throw new Error("crypto_evidence_identity_invalid");
    }
    validateSealedEvidence(input.sealed);
    if (input.sealed.binding.workspaceId !== input.workspaceId
      || input.sealed.binding.runId !== input.runId
      || input.sealed.binding.coworkerId !== input.coworkerId) {
      throw new Error("crypto_evidence_tenant_binding_mismatch");
    }
    if (this.findByRun(input)) throw new Error("crypto_evidence_already_exists");
    if (this.storedRecord(input.sealed.localIndex.evidenceId)) {
      throw new Error("crypto_evidence_already_exists");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const record: MatterhornCryptoEvidenceRecord = {
      version: RECORD_VERSION,
      id: input.sealed.localIndex.evidenceId,
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      runId: input.runId,
      coworkerId: input.coworkerId,
      revision: 1,
      state: "sealed",
      envelope: structuredClone(input.sealed.envelope),
      key: {
        keyReference: input.sealed.localIndex.keyReference,
        keyReferenceHash: sha256(input.sealed.localIndex.keyReference),
        wrappedKey: input.sealed.localIndex.wrappedKey,
        keyContext: input.sealed.localIndex.keyContext,
        recipientKeyIds: [...input.sealed.localIndex.recipientKeyIds],
        rotatedAt: now.toISOString(),
      },
      index: {
        evidenceId: input.sealed.localIndex.evidenceId,
        workspaceIdHash: input.sealed.localIndex.workspaceIdHash,
        runIdHash: input.sealed.localIndex.runIdHash,
        coworkerIdHash: input.sealed.localIndex.coworkerIdHash,
        ciphertextHash: input.sealed.localIndex.ciphertextHash,
        merkleLeaf: input.sealed.localIndex.merkleLeaf,
        createdAt: input.sealed.localIndex.createdAt,
        expiresAt: input.sealed.localIndex.expiresAt,
        deletable: input.sealed.localIndex.deletable,
      },
      walrusProof: null,
      suiAnchor: null,
      walrusOwnerAddressHash: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.persistRecord(record, now.getTime());
    this.stateStore.put({
      kind: RUN_INDEX_KIND,
      key: this.runIndexKey(input),
      workspaceId: record.workspaceId,
      value: { evidenceId: record.id },
      expiresAtMs: runIndexExpiry(record),
      nowMs: now.getTime(),
    });
    this.recordAccess({ record, action: "seal", outcome: "allowed", reason: "sealed", now });
    return clone(record);
  }

  get(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
  }): MatterhornCryptoEvidenceRecord | null {
    const record = this.storedRecord(input.evidenceId);
    if (!record) return null;
    assertTenant(record, input);
    return clone(record);
  }

  list(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
  }): MatterhornCryptoEvidenceRecord[] {
    return this.storedRecords({ workspaceId: input.workspaceId })
      .filter((record) => record.ownerId === input.ownerId
        && (input.coworkerId === undefined || record.coworkerId === input.coworkerId))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(clone);
  }

  getVerificationStatus(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
  }): MatterhornEvidenceVerificationStatus | null {
    const record = this.get(input);
    if (!record) return null;
    const status = this.stateStore.get<MatterhornCryptoEvidenceVerificationStatusRecord>(
      VERIFICATION_STATUS_KIND,
      this.verificationStatusKey(input),
    );
    if (!status
      || status.evidenceId !== record.id
      || status.evidenceRevision !== record.revision
      || status.ownerIdHash !== this.identityHash("owner", record.workspaceId, record.ownerId)) {
      return null;
    }
    return structuredClone(status.verification);
  }

  recordVerificationStatus(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    verification: MatterhornEvidenceVerificationStatus;
  }): void {
    const record = this.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    if (record.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    const verifiedAt = Date.parse(input.verification.verifiedAt);
    if (!Number.isFinite(verifiedAt)
      || (input.verification.currentEpoch !== null
        && (!Number.isSafeInteger(input.verification.currentEpoch) || input.verification.currentEpoch < 0))
      || (input.verification.reason !== null && input.verification.reason.length > 80)) {
      throw new Error("crypto_evidence_verification_status_invalid");
    }
    const status: MatterhornCryptoEvidenceVerificationStatusRecord = {
      version: "matterhorn.crypto-evidence-verification-status.v1",
      evidenceId: record.id,
      evidenceRevision: record.revision,
      ownerIdHash: this.identityHash("owner", record.workspaceId, record.ownerId),
      verification: structuredClone(input.verification),
    };
    this.stateStore.put({
      kind: VERIFICATION_STATUS_KIND,
      key: this.verificationStatusKey(input),
      workspaceId: record.workspaceId,
      value: status,
      expiresAtMs: runIndexExpiry(record),
      nowMs: verifiedAt,
    });
  }

  listPublishedForVerification(input: {
    limit: number;
    minimumIntervalMs: number;
    now?: Date;
  }): Array<{ workspaceId: string; ownerId: string; evidenceId: string }> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error("crypto_evidence_verification_limit_invalid");
    }
    if (!Number.isSafeInteger(input.minimumIntervalMs) || input.minimumIntervalMs < 60_000) {
      throw new Error("crypto_evidence_verification_interval_invalid");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    return this.storedRecords()
      .filter((record) => record.state === "published")
      .map((record) => ({
        record,
        verification: this.getVerificationStatus({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          evidenceId: record.id,
        }),
      }))
      .filter(({ verification }) => {
        if (!verification) return true;
        const verifiedAt = Date.parse(verification.verifiedAt);
        return !Number.isFinite(verifiedAt) || verifiedAt + input.minimumIntervalMs <= now.getTime();
      })
      .sort((left, right) => {
        const leftAt = left.verification ? Date.parse(left.verification.verifiedAt) : Number.NEGATIVE_INFINITY;
        const rightAt = right.verification ? Date.parse(right.verification.verifiedAt) : Number.NEGATIVE_INFINITY;
        return leftAt - rightAt || Date.parse(left.record.createdAt) - Date.parse(right.record.createdAt);
      })
      .slice(0, input.limit)
      .map(({ record }) => ({
        workspaceId: record.workspaceId,
        ownerId: record.ownerId,
        evidenceId: record.id,
      }));
  }

  /**
   * Atomically claims one exact encrypted evidence revision for publication.
   * The expiring claim is durable across processes sharing the runtime SQLite
   * database, so only one publisher can spend network resources for it.
   */
  beginWalrusPublication(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): { record: MatterhornCryptoEvidencePublicationCandidate; claimId: string } {
    const claimed = this.beginExclusiveOperation({ ...input, operation: "publish" });
    return {
      record: claimed.record as MatterhornCryptoEvidencePublicationCandidate,
      claimId: claimed.claimId,
    };
  }

  hasWalrusPublicationClaim(input: {
    workspaceId: string;
    evidenceId: string;
    expectedRevision: number;
    claimId: string;
    now?: Date;
  }): boolean {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const claim = this.activeOperationClaim({ ...input, nowMs: now.getTime() });
    return claim?.version === "matterhorn.crypto-evidence-operation-claim.v1"
      && claim.claimId === input.claimId
      && claim.evidenceId === input.evidenceId
      && claim.expectedRevision === input.expectedRevision
      && claim.operation === "publish";
  }

  beginWalrusRenewal(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): { record: MatterhornCryptoEvidenceRecord & { state: "published"; envelope: MatterhornEncryptedEvidenceEnvelope; walrusProof: MatterhornWalrusProof }; claimId: string } {
    const claimed = this.beginExclusiveOperation({ ...input, operation: "renew" });
    if (claimed.record.state !== "published" || !claimed.record.envelope || !claimed.record.walrusProof) {
      this.endWalrusRenewal({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now: input.now,
      });
      throw new Error("crypto_evidence_walrus_renewal_state_invalid");
    }
    return {
      record: claimed.record as MatterhornCryptoEvidenceRecord & {
        state: "published";
        envelope: MatterhornEncryptedEvidenceEnvelope;
        walrusProof: MatterhornWalrusProof;
      },
      claimId: claimed.claimId,
    };
  }

  hasWalrusRenewalClaim(input: {
    workspaceId: string;
    evidenceId: string;
    expectedRevision: number;
    claimId: string;
    now?: Date;
  }): boolean {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const claim = this.activeOperationClaim({ ...input, nowMs: now.getTime() });
    return claim?.version === "matterhorn.crypto-evidence-operation-claim.v1"
      && claim.claimId === input.claimId
      && claim.evidenceId === input.evidenceId
      && claim.expectedRevision === input.expectedRevision
      && claim.operation === "renew";
  }

  endWalrusRenewal(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now?: Date;
  }): boolean {
    return this.endExclusiveOperation(input);
  }

  beginWalrusDeletion(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): { record: MatterhornCryptoEvidenceRecord & { state: "published"; envelope: MatterhornEncryptedEvidenceEnvelope; walrusProof: MatterhornWalrusProof }; claimId: string } {
    const claimed = this.beginExclusiveOperation({ ...input, operation: "delete" });
    if (claimed.record.state !== "published"
      || !claimed.record.envelope
      || !claimed.record.walrusProof
      || claimed.record.walrusProof.deletionTransactionDigest) {
      this.endWalrusDeletion({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now: input.now,
      });
      throw new Error("crypto_evidence_walrus_deletion_state_invalid");
    }
    return {
      record: claimed.record as MatterhornCryptoEvidenceRecord & {
        state: "published";
        envelope: MatterhornEncryptedEvidenceEnvelope;
        walrusProof: MatterhornWalrusProof;
      },
      claimId: claimed.claimId,
    };
  }

  hasWalrusDeletionClaim(input: {
    workspaceId: string;
    evidenceId: string;
    expectedRevision: number;
    claimId: string;
    now?: Date;
  }): boolean {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const claim = this.activeOperationClaim({ ...input, nowMs: now.getTime() });
    return claim?.version === "matterhorn.crypto-evidence-operation-claim.v1"
      && claim.claimId === input.claimId
      && claim.evidenceId === input.evidenceId
      && claim.expectedRevision === input.expectedRevision
      && claim.operation === "delete";
  }

  endWalrusDeletion(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now?: Date;
  }): boolean {
    return this.endExclusiveOperation(input);
  }

  beginSuiAnchor(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): { record: MatterhornCryptoEvidenceRecord; claimId: string } {
    const claimed = this.beginExclusiveOperation({ ...input, operation: "anchor" });
    if (claimed.record.state !== "published" || !claimed.record.walrusProof) {
      this.endExclusiveOperation({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now: input.now,
      });
      throw new Error("crypto_evidence_sui_anchor_state_invalid");
    }
    if (claimed.record.suiAnchor) {
      this.endExclusiveOperation({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now: input.now,
      });
      throw new Error("crypto_evidence_sui_anchor_exists");
    }
    return claimed;
  }

  hasSuiAnchorClaim(input: {
    workspaceId: string;
    evidenceId: string;
    expectedRevision: number;
    claimId: string;
    now?: Date;
  }): boolean {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const claim = this.activeOperationClaim({ ...input, nowMs: now.getTime() });
    return claim?.version === "matterhorn.crypto-evidence-operation-claim.v1"
      && claim.claimId === input.claimId
      && claim.evidenceId === input.evidenceId
      && claim.expectedRevision === input.expectedRevision
      && claim.operation === "anchor";
  }

  endSuiAnchor(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now?: Date;
  }): boolean {
    return this.endExclusiveOperation(input);
  }

  /** Complete a Sui anchor claim while the caller already owns the state-store transaction. */
  completeSuiAnchorClaimInTransaction(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now: Date;
  }): boolean {
    if (!Number.isFinite(input.now.getTime())) throw new Error("crypto_evidence_time_invalid");
    return this.endExclusiveOperationInTransaction(input);
  }

  attachVerifiedSuiAnchor(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    expectedBlobId: string;
    expectedWalrusObjectId: string;
    anchor: MatterhornSuiEvidenceAnchor;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord {
    const current = this.get(input);
    if (!current) throw new Error("crypto_evidence_not_found");
    if (current.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    if (current.state !== "published" || !current.walrusProof || current.suiAnchor) {
      throw new Error(current.suiAnchor
        ? "crypto_evidence_sui_anchor_exists"
        : "crypto_evidence_sui_anchor_state_invalid");
    }
    const issues = validateMatterhornSuiEvidenceAnchor(input.anchor);
    if (issues.length > 0) throw new Error(`crypto_evidence_sui_anchor_invalid:${issues.join(",")}`);
    const proof = current.walrusProof;
    let proofObjectId: string;
    try {
      proofObjectId = normalizeSuiObjectId(proof.suiObjectId);
    } catch {
      throw new Error("crypto_evidence_sui_anchor_binding_mismatch");
    }
    const expectedBatchId = sha256({
      domain: "matterhorn:sui-evidence-anchor-batch:v1",
      network: "testnet",
      merkleRoot: proof.merkleRoot,
      blobId: proof.blobId,
      walrusObjectId: proofObjectId,
      certifiedEpoch: proof.certifiedEpoch,
      validUntilEpoch: proof.validUntilEpoch,
    });
    if (proof.network !== "testnet"
      || proof.blobId !== input.expectedBlobId
      || proofObjectId !== input.expectedWalrusObjectId
      || input.anchor.network !== "testnet"
      || input.anchor.batchId !== expectedBatchId
      || input.anchor.merkleRoot !== proof.merkleRoot
      || input.anchor.walrusObjectId !== proofObjectId
      || input.anchor.certifiedEpoch !== proof.certifiedEpoch
      || input.anchor.validUntilEpoch !== proof.validUntilEpoch) {
      throw new Error("crypto_evidence_sui_anchor_binding_mismatch");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const next: MatterhornCryptoEvidenceRecord = {
      ...current,
      revision: current.revision + 1,
      suiAnchor: structuredClone(input.anchor),
      updatedAt: now.toISOString(),
    };
    this.persistRecord(next, now.getTime());
    this.clearVerificationStatus({ workspaceId: next.workspaceId, evidenceId: next.id });
    this.recordAccess({ record: next, action: "attach_anchor", outcome: "allowed", reason: "wallet_anchor_verified", now });
    return clone(next);
  }

  /** Release only the caller's claim; an expired worker cannot clear a newer claim. */
  endWalrusPublication(input: {
    workspaceId: string;
    evidenceId: string;
    claimId: string;
    now?: Date;
  }): boolean {
    return this.endExclusiveOperation(input);
  }

  attachVerifiedWalrusProof(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
    expectedRevision: number;
    claimId: string;
    proof: MatterhornWalrusProof;
    walrusOwnerAddressHash?: string | null;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    return this.stateStore.transaction(() => {
      if (!this.hasWalrusPublicationClaim({ ...input, now })) {
        throw new Error("crypto_evidence_walrus_publication_claim_invalid");
      }
      const current = this.get(input);
      if (!current) throw new Error("crypto_evidence_not_found");
      if (current.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
      if (current.state === "key_destroyed" || this.recoveryMaterialErased(current)) {
        throw new Error("crypto_evidence_key_destroyed");
      }
      const issues = validateMatterhornWalrusProof(input.proof);
      if (issues.length > 0) throw new Error(`crypto_evidence_walrus_proof_invalid:${issues.join(",")}`);
      if (input.proof.network === "mainnet" && this.options.allowMainnet !== true) {
        throw new Error("crypto_evidence_mainnet_disabled");
      }
      if (input.walrusOwnerAddressHash !== undefined
        && input.walrusOwnerAddressHash !== null
        && !/^[a-f0-9]{64}$/.test(input.walrusOwnerAddressHash)) {
        throw new Error("crypto_evidence_walrus_owner_invalid");
      }
      if (!verifyMatterhornEvidenceMerkleProof({
        ciphertextHash: current.index.ciphertextHash,
        leaf: current.index.merkleLeaf,
        root: input.proof.merkleRoot,
        proof: input.proof.merkleProof,
      })) throw new Error("crypto_evidence_merkle_proof_mismatch");
      const next: MatterhornCryptoEvidenceRecord = {
        ...current,
        revision: current.revision + 1,
        state: "published",
        walrusProof: structuredClone(input.proof),
        walrusOwnerAddressHash: input.walrusOwnerAddressHash ?? null,
        updatedAt: now.toISOString(),
      };
      this.persistRecord(next, now.getTime());
      this.clearVerificationStatus({ workspaceId: next.workspaceId, evidenceId: next.id });
      this.recordAccess({ record: next, action: "attach_proof", outcome: "allowed", reason: "proof_verified", now });
      if (!this.endExclusiveOperationInTransaction({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: input.claimId,
        now,
      })) throw new Error("crypto_evidence_walrus_publication_claim_invalid");
      return clone(next);
    });
  }

  renewVerifiedWalrusProof(input: {
    workspaceId: string;
    ownerId: string;
    evidenceId: string;
    expectedRevision: number;
    expectedBlobId: string;
    expectedSuiObjectId: string;
    expectedCiphertextSha256: string;
    expectedPreviousValidUntilEpoch: number;
    claimId: string;
    proof: MatterhornWalrusProof;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    if (!this.hasWalrusRenewalClaim({ ...input, now })) {
      throw new Error("crypto_evidence_walrus_renewal_claim_invalid");
    }
    const current = this.get(input);
    if (!current) throw new Error("crypto_evidence_not_found");
    if (current.state !== "published" || !current.envelope || !current.walrusProof) {
      throw new Error("crypto_evidence_walrus_renewal_state_invalid");
    }
    if (current.revision !== input.expectedRevision
      || current.index.ciphertextHash !== input.expectedCiphertextSha256
      || current.walrusProof.blobId !== input.expectedBlobId
      || current.walrusProof.suiObjectId !== input.expectedSuiObjectId
      || current.walrusProof.validUntilEpoch !== input.expectedPreviousValidUntilEpoch) {
      throw new Error("crypto_evidence_revision_conflict");
    }
    const issues = validateMatterhornWalrusProof(input.proof);
    if (issues.length > 0) throw new Error(`crypto_evidence_walrus_proof_invalid:${issues.join(",")}`);
    const previous = current.walrusProof;
    if (input.proof.network !== "testnet"
      || input.proof.blobId !== previous.blobId
      || input.proof.suiObjectId !== previous.suiObjectId
      || input.proof.certifiedEpoch !== previous.certifiedEpoch
      || input.proof.quiltPatchId !== previous.quiltPatchId
      || input.proof.merkleRoot !== previous.merkleRoot
      || JSON.stringify(input.proof.merkleProof) !== JSON.stringify(previous.merkleProof)
      || input.proof.suiTransactionDigest !== previous.suiTransactionDigest
      || input.proof.validUntilEpoch <= previous.validUntilEpoch
      || !input.proof.renewalTransactionDigest
      || !input.proof.renewedAt) {
      throw new Error("crypto_evidence_walrus_renewal_invalid");
    }
    if (!verifyMatterhornEvidenceMerkleProof({
      ciphertextHash: current.index.ciphertextHash,
      leaf: current.index.merkleLeaf,
      root: input.proof.merkleRoot,
      proof: input.proof.merkleProof,
    })) throw new Error("crypto_evidence_merkle_proof_mismatch");
    const next: MatterhornCryptoEvidenceRecord = {
      ...current,
      revision: current.revision + 1,
      walrusProof: structuredClone(input.proof),
      updatedAt: now.toISOString(),
    };
    this.persistRecord(next, now.getTime());
    this.clearVerificationStatus({ workspaceId: next.workspaceId, evidenceId: next.id });
    this.recordAccess({ record: next, action: "renew_proof", outcome: "allowed", reason: "wallet_renewal_verified", now });
    if (!this.endExclusiveOperationInTransaction({
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
      claimId: input.claimId,
      now,
    })) throw new Error("crypto_evidence_walrus_renewal_claim_invalid");
    return clone(next);
  }

  /**
   * Atomically attaches every proof from one ciphertext-only Walrus Quilt.
   * All records and proofs are validated before the first durable mutation, so
   * a conflict or malformed patch cannot leave a partially published batch.
   */
  attachVerifiedWalrusProofBatch(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    entries: Array<{
      evidenceId: string;
      expectedRevision: number;
      claimId: string;
      proof: MatterhornWalrusProof;
    }>;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord[] {
    if (input.entries.length < 2 || input.entries.length > 64) {
      throw new Error("crypto_evidence_walrus_batch_size_invalid");
    }
    if (new Set(input.entries.map((entry) => entry.evidenceId)).size !== input.entries.length) {
      throw new Error("crypto_evidence_walrus_batch_duplicate");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");

    return this.stateStore.transaction(() => {
      const nextRecords = input.entries.map((entry) => {
        if (!this.hasWalrusPublicationClaim({
          workspaceId: input.workspaceId,
          evidenceId: entry.evidenceId,
          expectedRevision: entry.expectedRevision,
          claimId: entry.claimId,
          now,
        })) throw new Error("crypto_evidence_walrus_publication_claim_invalid");
        const current = this.get({
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          coworkerId: input.coworkerId,
          evidenceId: entry.evidenceId,
        });
        if (!current) throw new Error("crypto_evidence_not_found");
        if (current.revision !== entry.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
        if (current.state !== "sealed" || !current.envelope || this.recoveryMaterialErased(current)) {
          throw new Error("crypto_evidence_walrus_publish_state_invalid");
        }
        const issues = validateMatterhornWalrusProof(entry.proof);
        if (issues.length > 0) throw new Error(`crypto_evidence_walrus_proof_invalid:${issues.join(",")}`);
        if (entry.proof.network === "mainnet" && this.options.allowMainnet !== true) {
          throw new Error("crypto_evidence_mainnet_disabled");
        }
        if (!entry.proof.quiltPatchId) throw new Error("crypto_evidence_walrus_quilt_patch_required");
        if (!verifyMatterhornEvidenceMerkleProof({
          ciphertextHash: current.index.ciphertextHash,
          leaf: current.index.merkleLeaf,
          root: entry.proof.merkleRoot,
          proof: entry.proof.merkleProof,
        })) throw new Error("crypto_evidence_merkle_proof_mismatch");
        return {
          ...current,
          revision: current.revision + 1,
          state: "published" as const,
          walrusProof: structuredClone(entry.proof),
          updatedAt: now.toISOString(),
        };
      });

      const first = nextRecords[0]?.walrusProof;
      if (!first) throw new Error("crypto_evidence_walrus_batch_missing");
      const batchBinding = (proof: MatterhornWalrusProof) => JSON.stringify({
        network: proof.network,
        blobId: proof.blobId,
        suiObjectId: proof.suiObjectId,
        certifiedEpoch: proof.certifiedEpoch,
        validUntilEpoch: proof.validUntilEpoch,
        merkleRoot: proof.merkleRoot,
        suiTransactionDigest: proof.suiTransactionDigest,
      });
      if (nextRecords.some((record) => !record.walrusProof
        || batchBinding(record.walrusProof) !== batchBinding(first))) {
        throw new Error("crypto_evidence_walrus_batch_binding_mismatch");
      }
      const patchIds = nextRecords.map((record) => record.walrusProof?.quiltPatchId ?? "");
      if (new Set(patchIds).size !== patchIds.length) {
        throw new Error("crypto_evidence_walrus_batch_patch_duplicate");
      }

      for (const record of nextRecords) {
        const entry = input.entries.find((candidate) => candidate.evidenceId === record.id);
        if (!entry) throw new Error("crypto_evidence_walrus_batch_missing");
        this.persistRecord(record, now.getTime());
        this.clearVerificationStatus({ workspaceId: record.workspaceId, evidenceId: record.id });
        this.recordAccess({
          record,
          action: "attach_proof",
          outcome: "allowed",
          reason: "quilt_proof_verified",
          now,
        });
        if (!this.endExclusiveOperationInTransaction({
          workspaceId: input.workspaceId,
          evidenceId: record.id,
          claimId: entry.claimId,
          now,
        })) throw new Error("crypto_evidence_walrus_publication_claim_invalid");
      }
      return nextRecords.map(clone);
    });
  }

  async decrypt(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
  }): Promise<MatterhornEvidenceBundle> {
    const record = this.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    if (!record.envelope || !record.key.keyReference || !record.key.wrappedKey || !record.key.keyContext
      || this.recoveryMaterialErased(record)) {
      this.recordAccess({ record, action: "decrypt", outcome: "denied", reason: "key_destroyed" });
      throw new Error("crypto_evidence_key_destroyed");
    }
    try {
      const key = await this.keyManager.decryptDataKey({
        workspaceId: record.workspaceId,
        runId: record.runId,
        keyReference: record.key.keyReference,
        wrappedKey: record.key.wrappedKey,
        keyContext: record.key.keyContext,
      });
      try {
        const bundle = decryptMatterhornEvidenceEnvelope({ envelope: record.envelope, key });
        if (bundle.workspaceIdHash !== record.index.workspaceIdHash
          || bundle.runIdHash !== record.index.runIdHash
          || bundle.coworkerIdHash !== record.index.coworkerIdHash) {
          throw new Error("crypto_evidence_identity_hash_mismatch");
        }
        this.recordAccess({ record, action: "decrypt", outcome: "allowed", reason: "decrypted" });
        return bundle;
      } finally {
        key.fill(0);
      }
    } catch (error) {
      this.recordAccess({ record, action: "decrypt", outcome: "denied", reason: "decrypt_failed" });
      throw error;
    }
  }

  async rotateKey(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceRecord> {
    const existing = this.get(input);
    if (!existing) throw new Error("crypto_evidence_not_found");
    if (existing.state === "key_destroyed" || !existing.key.keyReference
      || !existing.key.wrappedKey || !existing.key.keyContext || this.recoveryMaterialErased(existing)) {
      this.recordAccess({ record: existing, action: "rotate_key", outcome: "denied", reason: "key_destroyed" });
      throw new Error("crypto_evidence_key_destroyed");
    }
    if (existing.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    if (!this.keyManager.rotateDataKey) {
      this.recordAccess({ record: existing, action: "rotate_key", outcome: "denied", reason: "rotation_unavailable" });
      throw new Error("crypto_evidence_key_rotation_unavailable");
    }
    const now = input.now ?? new Date();
    const claimed = this.beginExclusiveOperation({ ...input, operation: "rotate_key", now });
    const current = claimed.record;
    try {
      const keyReference = current.key.keyReference;
      const wrappedKey = current.key.wrappedKey;
      const keyContext = current.key.keyContext;
      if (!keyReference || !wrappedKey || !keyContext) throw new Error("crypto_evidence_key_destroyed");
      let rotated: { keyReference: string; wrappedKey: string };
      try {
        rotated = await this.keyManager.rotateDataKey({
          workspaceId: current.workspaceId,
          runId: current.runId,
          keyReference,
          wrappedKey,
          keyContext,
        });
      } catch (error) {
        this.recordAccess({ record: current, action: "rotate_key", outcome: "denied", reason: "rotation_failed" });
        throw error;
      }
      if (!rotated.keyReference.trim() || !rotated.wrappedKey.trim()) {
        this.recordAccess({ record: current, action: "rotate_key", outcome: "denied", reason: "rotation_invalid" });
        throw new Error("crypto_evidence_key_rotation_invalid");
      }
      const next: MatterhornCryptoEvidenceRecord = {
        ...current,
        revision: current.revision + 1,
        key: {
          ...current.key,
          keyReference: rotated.keyReference,
          keyReferenceHash: sha256(rotated.keyReference),
          wrappedKey: rotated.wrappedKey,
          rotatedAt: now.toISOString(),
        },
        updatedAt: now.toISOString(),
      };
      this.persistRecord(next, now.getTime());
      this.clearVerificationStatus({ workspaceId: next.workspaceId, evidenceId: next.id });
      this.recordAccess({ record: next, action: "rotate_key", outcome: "allowed", reason: "rewrapped", now });
      this.stateStore.secureCheckpoint();
      return clone(next);
    } finally {
      this.endExclusiveOperation({
        workspaceId: input.workspaceId,
        evidenceId: input.evidenceId,
        claimId: claimed.claimId,
        now,
      });
    }
  }

  async rotateDue(input: { maxAgeMs: number; now?: Date }): Promise<{
    checked: number;
    rotated: number;
    failures: Array<{ evidenceId: string; error: string }>;
  }> {
    if (!Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 24 * 60 * 60 * 1_000) {
      throw new Error("crypto_evidence_rotation_window_invalid");
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const records = this.storedRecords();
    let checked = 0;
    let rotated = 0;
    const failures: Array<{ evidenceId: string; error: string }> = [];
    for (const record of records) {
      if (record.state === "key_destroyed") continue;
      const lastRotation = Date.parse(record.key.rotatedAt ?? record.createdAt);
      if (!Number.isFinite(lastRotation) || lastRotation + input.maxAgeMs > now.getTime()) continue;
      checked += 1;
      try {
        await this.rotateKey({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          coworkerId: record.coworkerId,
          evidenceId: record.id,
          expectedRevision: record.revision,
          now,
        });
        rotated += 1;
      } catch (error) {
        failures.push({ evidenceId: record.id, error: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return { checked, rotated, failures };
  }

  async destroyKey(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
    expectedRevision: number;
    walrusDeletion?: {
      expectedBlobId: string;
      expectedSuiObjectId: string;
      transactionDigest: string;
      deletedAt: string;
    };
    claimId?: string;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceRecord> {
    const existing = this.get(input);
    if (!existing) throw new Error("crypto_evidence_not_found");
    if (existing.state === "key_destroyed") {
      if (!input.walrusDeletion) return existing;
      if (existing.walrusProof?.blobId !== input.walrusDeletion.expectedBlobId
        || existing.walrusProof.suiObjectId !== input.walrusDeletion.expectedSuiObjectId
        || existing.walrusProof.deletionTransactionDigest !== input.walrusDeletion.transactionDigest
        || existing.walrusProof.deletedAt !== input.walrusDeletion.deletedAt) {
        throw new Error("crypto_evidence_walrus_deletion_mismatch");
      }
      return existing;
    }
    if (existing.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    let deletedWalrusProof: MatterhornWalrusProof | null = existing.walrusProof;
    if (input.walrusDeletion) {
      const deletion = input.walrusDeletion;
      if (existing.state !== "published"
        || !existing.walrusProof
        || existing.walrusProof.network !== "testnet"
        || existing.walrusProof.deletionTransactionDigest
        || existing.walrusProof.blobId !== deletion.expectedBlobId
        || existing.walrusProof.suiObjectId !== deletion.expectedSuiObjectId
        || !/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(deletion.transactionDigest)
        || !Number.isFinite(Date.parse(deletion.deletedAt))) {
        throw new Error("crypto_evidence_walrus_deletion_mismatch");
      }
      deletedWalrusProof = {
        ...existing.walrusProof,
        deletionTransactionDigest: deletion.transactionDigest,
        deletedAt: deletion.deletedAt,
      };
      if (validateMatterhornWalrusProof(deletedWalrusProof).length > 0) {
        throw new Error("crypto_evidence_walrus_deletion_mismatch");
      }
    }
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("crypto_evidence_time_invalid");
    const claimed = input.walrusDeletion
      ? {
          record: existing,
          claimId: input.claimId ?? "",
        }
      : this.beginExclusiveOperation({ ...input, operation: "destroy_key", now });
    if (input.walrusDeletion && !this.hasWalrusDeletionClaim({
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId,
      expectedRevision: input.expectedRevision,
      claimId: claimed.claimId,
      now,
    })) throw new Error("crypto_evidence_walrus_deletion_claim_invalid");
    const current = claimed.record;
    const keyReference = current.key.keyReference;
    const wrappedKey = current.key.wrappedKey;
    const keyContext = current.key.keyContext;
    if (!keyReference || !wrappedKey || !keyContext) throw new Error("crypto_evidence_key_destroyed");
    try {
      this.erasureLedger?.record({
        materialKind: "crypto_evidence",
        wrappedKey,
        keyContext,
        now,
      });
      try {
        await this.keyManager.destroyKey({ workspaceId: current.workspaceId, keyReference });
      } catch (error) {
        this.recordAccess({ record: current, action: "destroy_key", outcome: "denied", reason: "destruction_failed" });
        throw error;
      }
      const next: MatterhornCryptoEvidenceRecord = {
        ...current,
        revision: current.revision + 1,
        state: "key_destroyed",
        envelope: null,
        walrusProof: deletedWalrusProof,
        key: {
          ...current.key,
          keyReference: null,
          wrappedKey: null,
          keyContext: null,
          recipientKeyIds: [],
        },
        updatedAt: now.toISOString(),
      };
      this.stateStore.transaction(() => {
        const latest = this.storedRecord(input.evidenceId, now.getTime());
        if (!latest) throw new Error("crypto_evidence_not_found");
        assertTenant(latest, input);
        if (latest.revision !== current.revision
          || latest.state === "key_destroyed") throw new Error("crypto_evidence_revision_conflict");
        if (input.walrusDeletion && !this.hasWalrusDeletionClaim({
          workspaceId: input.workspaceId,
          evidenceId: input.evidenceId,
          expectedRevision: input.expectedRevision,
          claimId: claimed.claimId,
          now,
        })) throw new Error("crypto_evidence_walrus_deletion_claim_invalid");
        this.persistRecord(next, now.getTime());
        this.stateStore.delete("crypto_evidence_renewal_intent", next.id);
        if (!input.walrusDeletion) this.stateStore.delete("crypto_evidence_deletion_intent", next.id);
        this.clearVerificationStatus({ workspaceId: next.workspaceId, evidenceId: next.id });
        this.stateStore.put({
          kind: RUN_INDEX_KIND,
          key: this.runIndexKey(next),
          workspaceId: next.workspaceId,
          value: { evidenceId: next.id },
          expiresAtMs: now.getTime() + SECURITY_RETENTION_MS,
          nowMs: now.getTime(),
        });
        this.recordAccess({
          record: next,
          action: "destroy_key",
          outcome: "allowed",
          reason: input.walrusDeletion
            ? "walrus_deleted_and_recovery_material_deleted"
            : "recovery_material_deleted",
          now,
        });
        if (!this.endExclusiveOperationInTransaction({
          workspaceId: input.workspaceId,
          evidenceId: input.evidenceId,
          claimId: claimed.claimId,
          now,
        })) throw new Error(input.walrusDeletion
          ? "crypto_evidence_walrus_deletion_claim_invalid"
          : "crypto_evidence_operation_claim_invalid");
      });
      this.stateStore.secureCheckpoint();
      return clone(next);
    } finally {
      if (!input.walrusDeletion) {
        this.endExclusiveOperation({
          workspaceId: input.workspaceId,
          evidenceId: input.evidenceId,
          claimId: claimed.claimId,
          now,
        });
      }
    }
  }

  async destroyExpired(now = new Date()): Promise<{
    checked: number;
    destroyed: number;
    failures: Array<{ evidenceId: string; error: string }>;
  }> {
    const records = this.storedRecords();
    let checked = 0;
    let destroyed = 0;
    const failures: Array<{ evidenceId: string; error: string }> = [];
    for (const record of records) {
      if (record.state === "key_destroyed" || record.index.expiresAt === null) continue;
      const expiresAt = Date.parse(record.index.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) continue;
      checked += 1;
      try {
        await this.destroyKey({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          coworkerId: record.coworkerId,
          evidenceId: record.id,
          expectedRevision: record.revision,
          now,
        });
        destroyed += 1;
      } catch (error) {
        failures.push({ evidenceId: record.id, error: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return { checked, destroyed, failures };
  }

  async destroyWorkspace(input: { workspaceId: string; ownerId: string; now?: Date }): Promise<{
    checked: number;
    destroyed: number;
    failures: Array<{ evidenceId: string; error: string }>;
  }> {
    const records = this.list({ workspaceId: input.workspaceId, ownerId: input.ownerId });
    let destroyed = 0;
    const failures: Array<{ evidenceId: string; error: string }> = [];
    for (const record of records) {
      if (record.state === "key_destroyed") continue;
      try {
        await this.destroyKey({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          coworkerId: record.coworkerId,
          evidenceId: record.id,
          expectedRevision: record.revision,
          ...(input.now ? { now: input.now } : {}),
        });
        destroyed += 1;
      } catch (error) {
        failures.push({ evidenceId: record.id, error: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return { checked: records.length, destroyed, failures };
  }

  /**
   * Operator-only cleanup used after an owning workspace has been tombstoned.
   * It intentionally crosses record owners because deleting an organization
   * must erase every remaining recovery key in that workspace.
   */
  async destroyWorkspaceForDeletion(input: { workspaceId: string; now?: Date }): Promise<{
    checked: number;
    destroyed: number;
    failures: Array<{ evidenceId: string; error: string }>;
  }> {
    const records = this.storedRecords({
      workspaceId: input.workspaceId,
    });
    let destroyed = 0;
    const failures: Array<{ evidenceId: string; error: string }> = [];
    for (const record of records) {
      if (record.state === "key_destroyed") continue;
      try {
        await this.destroyKey({
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          coworkerId: record.coworkerId,
          evidenceId: record.id,
          expectedRevision: record.revision,
          ...(input.now ? { now: input.now } : {}),
        });
        destroyed += 1;
      } catch (error) {
        failures.push({ evidenceId: record.id, error: error instanceof Error ? error.message : "unknown_error" });
      }
    }
    return { checked: records.length, destroyed, failures };
  }
}
