import type {
  MatterhornEncryptedEvidenceEnvelope,
  MatterhornEvidenceBundle,
  MatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";
import { validateMatterhornWalrusProof } from "@matterhorn-work/types/crypto-coworkers";
import { createHash } from "node:crypto";

import type {
  MatterhornEvidenceKeyManager,
  MatterhornSealedEvidence,
} from "./crypto-evidence-sealer.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import {
  decryptMatterhornEvidenceEnvelope,
  serializeMatterhornWalrusCiphertext,
} from "./walrus-evidence-envelope.js";
import { verifyMatterhornEvidenceMerkleProof } from "./walrus-evidence-merkle.js";

const RECORD_VERSION = "matterhorn.crypto-evidence-record.v1" as const;
const STATE_KIND = "crypto_evidence_record" as const;

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
  };
  index: Omit<
    MatterhornSealedEvidence["localIndex"],
    "keyReference" | "wrappedKey" | "keyContext" | "recipientKeyIds"
  >;
  walrusProof: MatterhornWalrusProof | null;
  createdAt: string;
  updatedAt: string;
};

function clone(record: MatterhornCryptoEvidenceRecord): MatterhornCryptoEvidenceRecord {
  return structuredClone(record);
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
  constructor(
    private readonly stateStore: MatterhornGuardedRuntimeStateStore,
    private readonly keyManager: MatterhornEvidenceKeyManager,
    private readonly options: { allowMainnet?: boolean } = {},
  ) {}

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
    if (this.stateStore.get<MatterhornCryptoEvidenceRecord>(STATE_KIND, input.sealed.localIndex.evidenceId)) {
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.stateStore.put({
      kind: STATE_KIND,
      key: record.id,
      workspaceId: record.workspaceId,
      value: record,
      // Do not use generic state expiry: key destruction must run first.
      expiresAtMs: null,
      nowMs: now.getTime(),
    });
    return clone(record);
  }

  get(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
    evidenceId: string;
  }): MatterhornCryptoEvidenceRecord | null {
    const record = this.stateStore.get<MatterhornCryptoEvidenceRecord>(STATE_KIND, input.evidenceId);
    if (!record) return null;
    assertTenant(record, input);
    return clone(record);
  }

  list(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId?: string;
  }): MatterhornCryptoEvidenceRecord[] {
    return this.stateStore.list<MatterhornCryptoEvidenceRecord>(STATE_KIND, { workspaceId: input.workspaceId })
      .filter((record) => record.ownerId === input.ownerId
        && (input.coworkerId === undefined || record.coworkerId === input.coworkerId))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(clone);
  }

  attachVerifiedWalrusProof(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
    expectedRevision: number;
    proof: MatterhornWalrusProof;
    now?: Date;
  }): MatterhornCryptoEvidenceRecord {
    const current = this.get(input);
    if (!current) throw new Error("crypto_evidence_not_found");
    if (current.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    if (current.state === "key_destroyed") throw new Error("crypto_evidence_key_destroyed");
    const issues = validateMatterhornWalrusProof(input.proof);
    if (issues.length > 0) throw new Error(`crypto_evidence_walrus_proof_invalid:${issues.join(",")}`);
    if (input.proof.network === "mainnet" && this.options.allowMainnet !== true) {
      throw new Error("crypto_evidence_mainnet_disabled");
    }
    if (!verifyMatterhornEvidenceMerkleProof({
      ciphertextHash: current.index.ciphertextHash,
      leaf: current.index.merkleLeaf,
      root: input.proof.merkleRoot,
      proof: input.proof.merkleProof,
    })) throw new Error("crypto_evidence_merkle_proof_mismatch");
    const now = input.now ?? new Date();
    const next: MatterhornCryptoEvidenceRecord = {
      ...current,
      revision: current.revision + 1,
      state: "published",
      walrusProof: structuredClone(input.proof),
      updatedAt: now.toISOString(),
    };
    this.stateStore.put({ kind: STATE_KIND, key: next.id, workspaceId: next.workspaceId, value: next, nowMs: now.getTime() });
    return clone(next);
  }

  async decrypt(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
  }): Promise<MatterhornEvidenceBundle> {
    const record = this.get(input);
    if (!record) throw new Error("crypto_evidence_not_found");
    if (!record.envelope || !record.key.keyReference || !record.key.wrappedKey || !record.key.keyContext) {
      throw new Error("crypto_evidence_key_destroyed");
    }
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
      return bundle;
    } finally {
      key.fill(0);
    }
  }

  async destroyKey(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    evidenceId: string;
    expectedRevision: number;
    now?: Date;
  }): Promise<MatterhornCryptoEvidenceRecord> {
    const current = this.get(input);
    if (!current) throw new Error("crypto_evidence_not_found");
    if (current.state === "key_destroyed") return current;
    if (current.revision !== input.expectedRevision) throw new Error("crypto_evidence_revision_conflict");
    const keyReference = current.key.keyReference;
    if (!keyReference) throw new Error("crypto_evidence_key_destroyed");
    await this.keyManager.destroyKey({ workspaceId: current.workspaceId, keyReference });
    const now = input.now ?? new Date();
    const next: MatterhornCryptoEvidenceRecord = {
      ...current,
      revision: current.revision + 1,
      state: "key_destroyed",
      envelope: null,
      key: {
        ...current.key,
        keyReference: null,
        wrappedKey: null,
        keyContext: null,
        recipientKeyIds: [],
      },
      updatedAt: now.toISOString(),
    };
    this.stateStore.put({ kind: STATE_KIND, key: next.id, workspaceId: next.workspaceId, value: next, nowMs: now.getTime() });
    this.stateStore.secureCheckpoint();
    return clone(next);
  }

  async destroyExpired(now = new Date()): Promise<{
    checked: number;
    destroyed: number;
    failures: Array<{ evidenceId: string; error: string }>;
  }> {
    const records = this.stateStore.list<MatterhornCryptoEvidenceRecord>(STATE_KIND);
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
    const records = this.stateStore.list<MatterhornCryptoEvidenceRecord>(STATE_KIND, {
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
