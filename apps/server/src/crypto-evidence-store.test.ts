import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_WALRUS_PROOF_VERSION,
  type MatterhornWalrusProof,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import {
  MatterhornCryptoEvidenceStore,
  type MatterhornCryptoEvidenceAccessEvent,
  type MatterhornCryptoEvidenceRecord,
  type MatterhornCryptoEvidenceRunIndexRecord,
} from "./crypto-evidence-store.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

function receipt(input: { id?: string; runId?: string; workspaceId?: string } = {}): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: input.id ?? "receipt_store",
    runId: input.runId ?? "run_store",
    workspaceId: input.workspaceId ?? "workspace_store",
    sessionId: "session_store",
    status: "success",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:01.000Z",
    responseDurationMs: 1_000,
    provider: {
      id: "local",
      name: "Local",
      modelId: "model",
      privacyStatus: "local_processing",
      trainingUse: "none",
      retentionDays: 0,
      policyUrl: null,
    },
    privacy: {
      mode: "transaction",
      dataCategories: ["wallet_private"],
      redactionCount: 0,
      consent: "not_required",
      dataLeavesMatterhorn: false,
    },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0,
      toolCallBudget: { reads: 12, preparesPerFamily: 1, submits: 0 },
    },
    tools: [],
    memory: { readIds: [], writtenIds: [] },
    capabilities: [],
    reviewedActions: [],
    integrity: { previousHash: null, recordHash: "record" },
  };
}

describe("durable crypto evidence store", () => {
  test("persists only encrypted evidence, enforces tenant isolation, and destroys recovery material", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-store-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    const sourceKey = Buffer.alloc(32, 7);
    let destroyed = 0;
    let rotated = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.from(sourceKey),
        keyReference: "arn:aws:kms:test:key/evidence",
        wrappedKey: Buffer.from("wrapped-key-material").toString("base64"),
        keyContext: "a".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.from(sourceKey),
      rotateDataKey: async () => {
        rotated += 1;
        return {
          keyReference: "arn:aws:kms:test:key/evidence-rotated",
          wrappedKey: Buffer.from("rotated-wrapped-key-material").toString("base64"),
        };
      },
      destroyKey: async () => { destroyed += 1; },
    };
    try {
      const sealed = await sealMatterhornRunEvidence({
        receipt: receipt(),
        coworkerId: "coworker_store",
        recipientKeyIds: ["recipient-store"],
        keyManager,
        now: new Date("2026-09-01T00:02:00.000Z"),
        correlationSalt: Buffer.alloc(32, 8),
        idEntropy: Buffer.alloc(24, 9),
      });
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      const created = store.create({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        runId: "run_store",
        coworkerId: "coworker_store",
        sealed,
      });
      expect(created.state).toBe("sealed");
      expect(created.key.recipientKeyIds).toEqual(["recipient-store"]);
      expect(JSON.stringify(created)).not.toContain(sourceKey.toString("hex"));
      expect(store.list({ workspaceId: "workspace_store", ownerId: "wrong_owner" })).toEqual([]);
      expect(() => store.get({
        workspaceId: "workspace_store",
        ownerId: "wrong_owner",
        coworkerId: "coworker_store",
        evidenceId: created.id,
      })).toThrow("crypto_evidence_not_found");
      expect((await store.decrypt({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
      })).runIdHash).toBe(created.index.runIdHash);

      const proof: MatterhornWalrusProof = {
        version: MATTERHORN_WALRUS_PROOF_VERSION,
        network: "testnet",
        blobId: "testnet-blob-id",
        suiObjectId: "0x1234",
        certifiedEpoch: 10,
        validUntilEpoch: 20,
        quiltPatchId: null,
        merkleRoot: created.index.merkleLeaf,
        merkleProof: [],
        suiTransactionDigest: null,
      };
      const mainnetClaim = store.beginWalrusPublication({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: created.revision,
      });
      expect(() => store.attachVerifiedWalrusProof({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: created.revision,
        claimId: mainnetClaim.claimId,
        proof: { ...proof, network: "mainnet" },
      })).toThrow("crypto_evidence_mainnet_disabled");
      expect(store.endWalrusPublication({
        workspaceId: "workspace_store",
        evidenceId: created.id,
        claimId: mainnetClaim.claimId,
      })).toBe(true);
      const publication = store.beginWalrusPublication({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: created.revision,
      });
      const published = store.attachVerifiedWalrusProof({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: created.revision,
        claimId: publication.claimId,
        proof,
      });
      expect(published.state).toBe("published");

      const rotatedRecord = await store.rotateKey({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: published.revision,
      });
      expect(rotatedRecord).toMatchObject({
        state: "published",
        revision: published.revision + 1,
        key: {
          keyReference: "arn:aws:kms:test:key/evidence-rotated",
          wrappedKey: Buffer.from("rotated-wrapped-key-material").toString("base64"),
        },
      });
      expect(rotatedRecord.envelope).toEqual(published.envelope);
      expect(rotated).toBe(1);

      const destroyedRecord = await store.destroyKey({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: rotatedRecord.revision,
      });
      expect(destroyedRecord.state).toBe("key_destroyed");
      expect(destroyedRecord.envelope).toBeNull();
      expect(destroyedRecord.key.wrappedKey).toBeNull();
      expect(destroyedRecord.key.keyContext).toBeNull();
      expect(destroyed).toBe(1);
      expect((await readFile(join(directory, "state.db"))).toString("utf8")).not.toContain(
        Buffer.from("wrapped-key-material").toString("base64"),
      );
      expect((await readFile(join(directory, "state.db"))).toString("utf8")).not.toContain(
        Buffer.from("rotated-wrapped-key-material").toString("base64"),
      );
      expect((await store.destroyKey({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: rotatedRecord.revision,
      })).state).toBe("key_destroyed");
      expect(destroyed).toBe(1);
      await expect(store.decrypt({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
      })).rejects.toThrow("crypto_evidence_key_destroyed");

      const audit = store.listAccessAudit({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        evidenceId: created.id,
      });
      expect(audit.map((event) => `${event.action}:${event.outcome}`)).toEqual([
        "seal:allowed",
        "decrypt:allowed",
        "attach_proof:allowed",
        "rotate_key:allowed",
        "destroy_key:allowed",
        "decrypt:denied",
      ]);
      expect(audit.every((event, index) => index === 0 || event.previousHash === audit[index - 1]?.recordHash)).toBe(true);
      expect(JSON.stringify(audit)).not.toContain("owner_store");
      expect(store.listAccessAudit({ workspaceId: "workspace_store", ownerId: "wrong_owner" })).toEqual([]);
      expect(state.get(
        "crypto_evidence_record",
        created.id,
        Date.now() + 366 * 24 * 60 * 60 * 1_000,
      )).toBeNull();

      const reloaded = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      expect(reloaded.get({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
      })?.state).toBe("key_destroyed");
    } finally {
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects mutated authority, publication, key, revision, tenant, and legacy state before use", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-authority-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    const authority = testDurableStateAuthority();
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.alloc(32, 21),
        keyReference: "arn:aws:kms:test:key/authority",
        wrappedKey: Buffer.from("authority-wrapped-key").toString("base64"),
        keyContext: "e".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.alloc(32, 21),
      destroyKey: async () => {},
    };
    try {
      const sealed = await sealMatterhornRunEvidence({
        receipt: receipt({ id: "receipt_authority", runId: "run_authority", workspaceId: "workspace_authority" }),
        coworkerId: "coworker_authority",
        recipientKeyIds: ["recipient-authority"],
        keyManager,
        now: new Date("2026-09-01T00:02:00.000Z"),
        correlationSalt: Buffer.alloc(32, 22),
        idEntropy: Buffer.alloc(24, 23),
      });
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, authority);
      const created = store.create({
        workspaceId: "workspace_authority",
        ownerId: "owner_authority",
        runId: "run_authority",
        coworkerId: "coworker_authority",
        sealed,
      });
      const persisted = state.getRecord<{
        version: string;
        value: MatterhornCryptoEvidenceRecord;
        authoritySeal: string;
      }>("crypto_evidence_record", created.id);
      if (!persisted) throw new Error("test evidence record missing");

      const mutations: MatterhornCryptoEvidenceRecord[] = [
        { ...persisted.value.value, revision: 2 },
        { ...persisted.value.value, ownerId: "owner_substituted" },
        { ...persisted.value.value, workspaceId: "workspace_substituted" },
        {
          ...persisted.value.value,
          key: { ...persisted.value.value.key, wrappedKey: "mutated-wrapped-key" },
        },
        { ...persisted.value.value, state: "published" },
      ];
      for (const mutation of mutations) {
        state.put({
          kind: "crypto_evidence_record",
          key: persisted.key,
          workspaceId: persisted.workspaceId,
          value: { ...persisted.value, value: mutation },
          nowMs: persisted.updatedAtMs,
        });
        expect(() => store.get({
          workspaceId: "workspace_authority",
          ownerId: "owner_authority",
          coworkerId: "coworker_authority",
          evidenceId: created.id,
        })).toThrow("crypto_evidence_state_integrity_invalid");
      }

      state.put({
        kind: "crypto_evidence_record",
        key: persisted.key,
        workspaceId: "workspace_transplanted",
        value: persisted.value,
        nowMs: persisted.updatedAtMs,
      });
      expect(() => store.get({
        workspaceId: "workspace_authority",
        ownerId: "owner_authority",
        coworkerId: "coworker_authority",
        evidenceId: created.id,
      })).toThrow("crypto_evidence_state_integrity_invalid");

      state.put({
        kind: "crypto_evidence_record",
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        value: persisted.value.value,
        nowMs: persisted.updatedAtMs,
      });
      expect(() => store.get({
        workspaceId: "workspace_authority",
        ownerId: "owner_authority",
        coworkerId: "coworker_authority",
        evidenceId: created.id,
      })).toThrow("crypto_evidence_state_integrity_invalid");

      state.put({
        kind: "crypto_evidence_record",
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        value: persisted.value,
        nowMs: persisted.updatedAtMs,
      });
      const wrongAuthority = testDurableStateAuthority(
        "different-authority-secret-that-is-more-than-32-bytes",
      );
      const wrongKeyStore = new MatterhornCryptoEvidenceStore(
        state,
        keyManager,
        {},
        null,
        wrongAuthority,
      );
      try {
        expect(() => wrongKeyStore.get({
          workspaceId: "workspace_authority",
          ownerId: "owner_authority",
          coworkerId: "coworker_authority",
          evidenceId: created.id,
        })).toThrow("crypto_evidence_state_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
    } finally {
      authority.close();
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("authenticates run indexes, verification status, and access-audit custody", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-auxiliary-authority-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    const authority = testDurableStateAuthority();
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.alloc(32, 31),
        keyReference: "arn:aws:kms:test:key/auxiliary-authority",
        wrappedKey: Buffer.from("auxiliary-authority-wrapped-key").toString("base64"),
        keyContext: "f".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.alloc(32, 31),
      destroyKey: async () => {},
    };
    const now = new Date("2026-09-01T00:10:00.000Z");
    try {
      const sealed = await sealMatterhornRunEvidence({
        receipt: receipt({
          id: "receipt_auxiliary_authority",
          runId: "run_auxiliary_authority",
          workspaceId: "workspace_auxiliary_authority",
        }),
        coworkerId: "coworker_auxiliary_authority",
        recipientKeyIds: ["recipient-auxiliary-authority"],
        keyManager,
        now,
        correlationSalt: Buffer.alloc(32, 32),
        idEntropy: Buffer.alloc(24, 33),
      });
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, authority);
      const created = store.create({
        workspaceId: "workspace_auxiliary_authority",
        ownerId: "owner_auxiliary_authority",
        runId: "run_auxiliary_authority",
        coworkerId: "coworker_auxiliary_authority",
        sealed,
        now,
      });
      const lookup = {
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        coworkerId: created.coworkerId,
        runId: created.runId,
      };
      const runIndex = state.listRecords<unknown>("crypto_evidence_run_index", {
        workspaceId: created.workspaceId,
      })[0];
      if (!runIndex) throw new Error("test run index missing");
      expect(authority.open<MatterhornCryptoEvidenceRunIndexRecord>(runIndex)).toMatchObject({
        version: "matterhorn.crypto-evidence-run-index.v1",
        evidenceId: created.id,
        workspaceIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        ownerIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        coworkerIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        runIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      const openedRunIndex = authority.open<MatterhornCryptoEvidenceRunIndexRecord>(runIndex)!;
      state.put({
        kind: runIndex.kind,
        key: runIndex.key,
        workspaceId: runIndex.workspaceId,
        sessionId: runIndex.sessionId,
        value: authority.seal({
          kind: runIndex.kind,
          key: runIndex.key,
          workspaceId: runIndex.workspaceId,
          sessionId: runIndex.sessionId,
          expiresAtMs: runIndex.expiresAtMs,
          updatedAtMs: runIndex.updatedAtMs,
          value: { ...openedRunIndex, ownerIdHash: "0".repeat(64) },
        }),
        expiresAtMs: runIndex.expiresAtMs,
        nowMs: runIndex.updatedAtMs,
      });
      expect(() => store.findByRun(lookup)).toThrow("crypto_evidence_run_index_integrity_invalid");
      state.put({
        kind: runIndex.kind,
        key: runIndex.key,
        workspaceId: runIndex.workspaceId,
        sessionId: runIndex.sessionId,
        value: runIndex.value,
        expiresAtMs: runIndex.expiresAtMs,
        nowMs: runIndex.updatedAtMs,
      });
      expect(store.findByRun(lookup)?.id).toBe(created.id);
      const wrongAuthority = testDurableStateAuthority(
        "wrong-auxiliary-authority-key-that-is-at-least-thirty-two-bytes",
      );
      try {
        const wrongStore = new MatterhornCryptoEvidenceStore(
          state,
          keyManager,
          {},
          null,
          wrongAuthority,
        );
        expect(() => wrongStore.findByRun(lookup))
          .toThrow("crypto_evidence_run_index_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
      state.put({
        kind: runIndex.kind,
        key: runIndex.key,
        workspaceId: runIndex.workspaceId,
        sessionId: runIndex.sessionId,
        value: openedRunIndex,
        expiresAtMs: runIndex.expiresAtMs,
        nowMs: runIndex.updatedAtMs,
      });
      expect(() => store.findByRun(lookup)).toThrow("crypto_evidence_run_index_integrity_invalid");
      state.put({
        kind: runIndex.kind,
        key: runIndex.key,
        workspaceId: runIndex.workspaceId,
        sessionId: runIndex.sessionId,
        value: runIndex.value,
        expiresAtMs: runIndex.expiresAtMs,
        nowMs: runIndex.updatedAtMs,
      });
      state.delete("crypto_evidence_run_index", runIndex.key);
      expect(store.findByRun(lookup)?.id).toBe(created.id);
      const rebuiltIndex = state.listRecords<unknown>("crypto_evidence_run_index", {
        workspaceId: created.workspaceId,
      })[0];
      expect(authority.open<MatterhornCryptoEvidenceRunIndexRecord>(rebuiltIndex ?? null)?.evidenceId)
        .toBe(created.id);

      store.recordVerificationStatus({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        evidenceId: created.id,
        expectedRevision: created.revision,
        verification: {
          status: "sealed_local",
          verifiedAt: new Date(now.getTime() + 1_000).toISOString(),
          checks: {
            tenantScope: true,
            ciphertextHash: true,
            merkleInclusion: false,
            suiCertification: false,
            walrusReadback: false,
          },
          currentEpoch: null,
          reason: "walrus_publication_not_attached",
        },
      });
      const statusRow = state.listRecords<unknown>("crypto_evidence_verification_status", {
        workspaceId: created.workspaceId,
      })[0];
      if (!statusRow) throw new Error("test verification status missing");
      const openedStatus = authority.open<Record<string, unknown>>(statusRow)!;
      state.put({
        kind: statusRow.kind,
        key: statusRow.key,
        workspaceId: statusRow.workspaceId,
        sessionId: statusRow.sessionId,
        value: openedStatus,
        expiresAtMs: statusRow.expiresAtMs,
        nowMs: statusRow.updatedAtMs,
      });
      expect(() => store.getVerificationStatus({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        evidenceId: created.id,
      })).toThrow("crypto_evidence_verification_status_integrity_invalid");
      state.put({
        kind: statusRow.kind,
        key: statusRow.key,
        workspaceId: statusRow.workspaceId,
        sessionId: statusRow.sessionId,
        value: authority.seal({
          kind: statusRow.kind,
          key: statusRow.key,
          workspaceId: statusRow.workspaceId,
          sessionId: statusRow.sessionId,
          expiresAtMs: statusRow.expiresAtMs,
          updatedAtMs: statusRow.updatedAtMs,
          value: {
            ...openedStatus,
            verification: {
              status: "verified",
              verifiedAt: new Date(statusRow.updatedAtMs).toISOString(),
              checks: {
                tenantScope: true,
                ciphertextHash: true,
                merkleInclusion: true,
                suiCertification: true,
                walrusReadback: true,
              },
              currentEpoch: 10,
              reason: null,
            },
          },
        }),
        expiresAtMs: statusRow.expiresAtMs,
        nowMs: statusRow.updatedAtMs,
      });
      expect(() => store.getVerificationStatus({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        evidenceId: created.id,
      })).toThrow("crypto_evidence_verification_status_integrity_invalid");

      const auditRows = state.listRecords<unknown>("crypto_evidence_audit", {
        workspaceId: created.workspaceId,
      });
      expect(auditRows).toHaveLength(1);
      const auditRow = auditRows[0]!;
      const openedAudit = authority.open<MatterhornCryptoEvidenceAccessEvent>(auditRow)!;
      state.put({
        kind: auditRow.kind,
        key: auditRow.key,
        workspaceId: auditRow.workspaceId,
        sessionId: auditRow.sessionId,
        value: authority.seal({
          kind: auditRow.kind,
          key: auditRow.key,
          workspaceId: auditRow.workspaceId,
          sessionId: auditRow.sessionId,
          expiresAtMs: auditRow.expiresAtMs,
          updatedAtMs: auditRow.updatedAtMs,
          value: { ...openedAudit, unexpectedAuthority: true },
        }),
        expiresAtMs: auditRow.expiresAtMs,
        nowMs: auditRow.updatedAtMs,
      });
      expect(() => store.listAccessAudit({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
      })).toThrow("crypto_evidence_audit_corrupt");
      state.put({
        kind: auditRow.kind,
        key: auditRow.key,
        workspaceId: auditRow.workspaceId,
        sessionId: auditRow.sessionId,
        value: auditRow.value,
        expiresAtMs: auditRow.expiresAtMs,
        nowMs: auditRow.updatedAtMs,
      });
      await store.decrypt({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        coworkerId: created.coworkerId,
        evidenceId: created.id,
      });
      await store.decrypt({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
        coworkerId: created.coworkerId,
        evidenceId: created.id,
      });
      const chainedRows = state.listRecords<unknown>("crypto_evidence_audit", {
        workspaceId: created.workspaceId,
      });
      const middleRow = chainedRows.find((row) => (
        authority.open<MatterhornCryptoEvidenceAccessEvent>(row)?.sequence === 2
      ));
      if (!middleRow) throw new Error("test middle audit row missing");
      state.delete("crypto_evidence_audit", middleRow.key);
      expect(() => store.listAccessAudit({
        workspaceId: created.workspaceId,
        ownerId: created.ownerId,
      })).toThrow("crypto_evidence_audit_chain_broken");
    } finally {
      authority.close();
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("serializes publication and key deletion across SQLite connections and protects a replacement claim", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-publication-claim-"));
    const databasePath = join(directory, "state.db");
    const stateA = new MatterhornGuardedRuntimeStateStore(databasePath);
    const stateB = new MatterhornGuardedRuntimeStateStore(databasePath);
    let destroyed = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.alloc(32, 4),
        keyReference: "arn:aws:kms:test:key/publication-claim",
        wrappedKey: Buffer.from("publication-claim-wrapped-key").toString("base64"),
        keyContext: "d".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.alloc(32, 4),
      destroyKey: async () => { destroyed += 1; },
    };
    try {
      const sealed = await sealMatterhornRunEvidence({
        receipt: receipt({ id: "receipt_claim", runId: "run_claim", workspaceId: "workspace_claim" }),
        coworkerId: "coworker_claim",
        recipientKeyIds: ["recipient-claim"],
        keyManager,
        now: new Date("2026-09-01T00:02:00.000Z"),
        correlationSalt: Buffer.alloc(32, 4),
        idEntropy: Buffer.alloc(24, 5),
      });
      const storeA = new MatterhornCryptoEvidenceStore(stateA, keyManager, {}, null, testDurableStateAuthority());
      const storeB = new MatterhornCryptoEvidenceStore(stateB, keyManager, {}, null, testDurableStateAuthority());
      const created = storeA.create({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        runId: "run_claim",
        coworkerId: "coworker_claim",
        sealed,
      });
      const firstNow = new Date("2026-09-01T00:03:00.000Z");
      const first = storeA.beginWalrusPublication({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      });
      const claimRow = stateA.listRecords<unknown>("crypto_evidence_operation_claim", {
        workspaceId: "workspace_claim",
        nowMs: firstNow.getTime(),
      })[0];
      if (!claimRow) throw new Error("test operation claim missing");
      const wrongAuthority = testDurableStateAuthority(
        "wrong-evidence-operation-authority-key-00000000000000000000",
      );
      try {
        const wrongStore = new MatterhornCryptoEvidenceStore(
          stateB,
          keyManager,
          {},
          null,
          wrongAuthority,
        );
        expect(() => wrongStore.hasWalrusPublicationClaim({
          workspaceId: "workspace_claim",
          evidenceId: created.id,
          expectedRevision: created.revision,
          claimId: first.claimId,
          now: firstNow,
        })).toThrow("crypto_evidence_operation_claim_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
      for (const mutation of ["tenant", "payload", "updated_at"] as const) {
        stateA.put({
          kind: claimRow.kind,
          key: claimRow.key,
          workspaceId: mutation === "tenant" ? "workspace_transplanted" : claimRow.workspaceId,
          sessionId: claimRow.sessionId,
          value: mutation === "payload" ? { legacy: true } : claimRow.value,
          expiresAtMs: claimRow.expiresAtMs,
          nowMs: mutation === "updated_at" ? claimRow.updatedAtMs + 1 : claimRow.updatedAtMs,
        });
        expect(() => storeB.hasWalrusPublicationClaim({
          workspaceId: "workspace_claim",
          evidenceId: created.id,
          expectedRevision: created.revision,
          claimId: first.claimId,
          now: firstNow,
        })).toThrow("crypto_evidence_operation_claim_integrity_invalid");
        stateA.put({
          kind: claimRow.kind,
          key: claimRow.key,
          workspaceId: claimRow.workspaceId,
          sessionId: claimRow.sessionId,
          value: claimRow.value,
          expiresAtMs: claimRow.expiresAtMs,
          nowMs: claimRow.updatedAtMs,
        });
      }
      expect(() => storeB.beginWalrusPublication({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      })).toThrow("crypto_evidence_walrus_publication_in_progress");
      await expect(storeB.destroyKey({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      })).rejects.toThrow("crypto_evidence_operation_in_progress");
      expect(destroyed).toBe(0);

      const replacementNow = new Date("2026-09-01T00:08:01.000Z");
      const replacement = storeB.beginWalrusPublication({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      });
      expect(storeA.endWalrusPublication({
        workspaceId: "workspace_claim",
        evidenceId: created.id,
        claimId: first.claimId,
        now: replacementNow,
      })).toBe(false);
      expect(() => storeA.beginWalrusPublication({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      })).toThrow("crypto_evidence_walrus_publication_in_progress");
      expect(storeB.endWalrusPublication({
        workspaceId: "workspace_claim",
        evidenceId: created.id,
        claimId: replacement.claimId,
        now: replacementNow,
      })).toBe(true);
      const deleted = await storeA.destroyKey({
        workspaceId: "workspace_claim",
        ownerId: "owner_claim",
        evidenceId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      });
      expect(deleted.state).toBe("key_destroyed");
      expect(destroyed).toBe(1);
    } finally {
      stateB.close();
      stateA.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("destroys every owner key during workspace deletion and expires remaining records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-lifecycle-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    let destroyed = 0;
    let rotated = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.alloc(32, 3),
        keyReference: "arn:aws:kms:test:key/evidence",
        wrappedKey: Buffer.from(`wrapped-${recipientKeyIds[0]}`).toString("base64"),
        keyContext: "c".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.alloc(32, 3),
      rotateDataKey: async ({ keyReference, wrappedKey }) => {
        rotated += 1;
        return { keyReference, wrappedKey: `${wrappedKey.slice(0, -2)}AA` };
      },
      destroyKey: async () => { destroyed += 1; },
    };
    try {
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      const seed = async (input: {
        workspaceId: string;
        ownerId: string;
        runId: string;
        coworkerId: string;
        entropy: number;
      }) => {
        const sealed = await sealMatterhornRunEvidence({
          receipt: receipt({
            id: `receipt_${input.runId}`,
            runId: input.runId,
            workspaceId: input.workspaceId,
          }),
          coworkerId: input.coworkerId,
          recipientKeyIds: [`recipient-${input.ownerId}`],
          keyManager,
          now: new Date("2026-09-01T00:02:00.000Z"),
          correlationSalt: Buffer.alloc(32, input.entropy),
          idEntropy: Buffer.alloc(24, input.entropy + 10),
        });
        return store.create({ ...input, sealed });
      };
      const ownerA = await seed({
        workspaceId: "workspace_delete",
        ownerId: "owner_a",
        runId: "run_a",
        coworkerId: "coworker_a",
        entropy: 1,
      });
      const ownerB = await seed({
        workspaceId: "workspace_delete",
        ownerId: "owner_b",
        runId: "run_b",
        coworkerId: "coworker_b",
        entropy: 2,
      });
      const retained = await seed({
        workspaceId: "workspace_retained",
        ownerId: "owner_c",
        runId: "run_c",
        coworkerId: "coworker_c",
        entropy: 3,
      });

      expect(await store.destroyWorkspaceForDeletion({ workspaceId: "workspace_delete" })).toMatchObject({
        checked: 2,
        destroyed: 2,
        failures: [],
      });
      expect(store.get({
        workspaceId: "workspace_delete",
        ownerId: "owner_a",
        coworkerId: "coworker_a",
        evidenceId: ownerA.id,
      })?.state).toBe("key_destroyed");
      expect(store.get({
        workspaceId: "workspace_delete",
        ownerId: "owner_b",
        coworkerId: "coworker_b",
        evidenceId: ownerB.id,
      })?.state).toBe("key_destroyed");
      expect(store.get({
        workspaceId: "workspace_retained",
        ownerId: "owner_c",
        coworkerId: "coworker_c",
        evidenceId: retained.id,
      })?.state).toBe("sealed");

      expect(await store.rotateDue({
        maxAgeMs: 24 * 60 * 60 * 1_000,
        now: new Date("2027-01-01T00:00:00.000Z"),
      })).toMatchObject({ checked: 1, rotated: 1, failures: [] });
      expect(rotated).toBe(1);

      expect(await store.destroyExpired(new Date("2100-01-01T00:00:00.000Z"))).toMatchObject({
        checked: 1,
        destroyed: 1,
        failures: [],
      });
      expect(destroyed).toBe(3);
    } finally {
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
