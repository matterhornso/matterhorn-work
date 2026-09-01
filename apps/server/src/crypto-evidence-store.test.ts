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
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
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
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.from(sourceKey),
        keyReference: "arn:aws:kms:test:key/evidence",
        wrappedKey: Buffer.from("wrapped-key-material").toString("base64"),
        keyContext: "a".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.from(sourceKey),
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
      const store = new MatterhornCryptoEvidenceStore(state, keyManager);
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
      const published = store.attachVerifiedWalrusProof({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: created.revision,
        proof,
      });
      expect(published.state).toBe("published");
      expect(() => store.attachVerifiedWalrusProof({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: published.revision,
        proof: { ...proof, network: "mainnet" },
      })).toThrow("crypto_evidence_mainnet_disabled");

      const destroyedRecord = await store.destroyKey({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: published.revision,
      });
      expect(destroyedRecord.state).toBe("key_destroyed");
      expect(destroyedRecord.envelope).toBeNull();
      expect(destroyedRecord.key.wrappedKey).toBeNull();
      expect(destroyedRecord.key.keyContext).toBeNull();
      expect(destroyed).toBe(1);
      expect((await readFile(join(directory, "state.db"))).toString("utf8")).not.toContain(
        Buffer.from("wrapped-key-material").toString("base64"),
      );
      expect((await store.destroyKey({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
        expectedRevision: published.revision,
      })).state).toBe("key_destroyed");
      expect(destroyed).toBe(1);
      await expect(store.decrypt({
        workspaceId: "workspace_store",
        ownerId: "owner_store",
        coworkerId: "coworker_store",
        evidenceId: created.id,
      })).rejects.toThrow("crypto_evidence_key_destroyed");

      const reloaded = new MatterhornCryptoEvidenceStore(state, keyManager);
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

  test("destroys every owner key during workspace deletion and expires remaining records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-lifecycle-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    let destroyed = 0;
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.alloc(32, 3),
        keyReference: "arn:aws:kms:test:key/evidence",
        wrappedKey: Buffer.from(`wrapped-${recipientKeyIds[0]}`).toString("base64"),
        keyContext: "c".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.alloc(32, 3),
      destroyKey: async () => { destroyed += 1; },
    };
    try {
      const store = new MatterhornCryptoEvidenceStore(state, keyManager);
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
