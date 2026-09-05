import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { MATTERHORN_WALRUS_PROOF_VERSION } from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { MatterhornCryptoEvidenceVerificationService } from "./crypto-evidence-verification.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

function receipt(runId: string): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: `receipt_${runId}`,
    runId,
    workspaceId: "workspace_evidence",
    sessionId: "session_evidence",
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

describe("crypto evidence verification boundary", () => {
  test("projects no tenant or key material and live-verifies only the exact owner's record", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matterhorn-evidence-verification-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
    const key = Buffer.alloc(32, 23);
    const keyManager: MatterhornEvidenceKeyManager = {
      createDataKey: async ({ recipientKeyIds }) => ({
        plaintextKey: Buffer.from(key),
        keyReference: "kms://must-not-leak",
        wrappedKey: Buffer.from("wrapped-must-not-leak").toString("base64"),
        keyContext: "d".repeat(64),
        recipientKeyIds,
      }),
      decryptDataKey: async () => Buffer.from(key),
      destroyKey: async () => {},
    };
    try {
      const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, testDurableStateAuthority());
      const sealed = await sealMatterhornRunEvidence({
        receipt: receipt("run_evidence"),
        coworkerId: "coworker_private",
        recipientKeyIds: ["recipient_private"],
        keyManager,
        correlationSalt: Buffer.alloc(32, 24),
        idEntropy: Buffer.alloc(24, 25),
      });
      const created = store.create({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
        runId: "run_evidence",
        coworkerId: "coworker_private",
        sealed,
      });
      const publication = store.beginWalrusPublication({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
        coworkerId: "coworker_private",
        evidenceId: created.id,
        expectedRevision: created.revision,
      });
      const published = store.attachVerifiedWalrusProof({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
        coworkerId: "coworker_private",
        evidenceId: created.id,
        expectedRevision: created.revision,
        claimId: publication.claimId,
        proof: {
          version: MATTERHORN_WALRUS_PROOF_VERSION,
          network: "testnet",
          blobId: "public-blob",
          suiObjectId: "0x1234",
          certifiedEpoch: 7,
          validUntilEpoch: 12,
          quiltPatchId: null,
          merkleRoot: created.index.merkleLeaf,
          merkleProof: [],
          suiTransactionDigest: null,
        },
      });
      let currentTime = new Date("2026-09-01T00:05:00.000Z");
      let liveChecks = 0;
      let liveFailure: string | null = null;
      const service = new MatterhornCryptoEvidenceVerificationService(
        store,
        async (input) => {
          liveChecks += 1;
          expect(input).toMatchObject({
            workspaceId: "workspace_evidence",
            ownerId: "owner_private",
            evidenceId: published.id,
          });
          if (liveFailure) throw new Error(liveFailure);
          return {
            certification: {
              network: "testnet",
              blobId: "public-blob",
              suiObjectId: "0x1234",
              certifiedEpoch: 7,
              currentEpoch: 8,
              validUntilEpoch: 12,
              deletable: true,
              suiTransactionDigest: null,
            },
          };
        },
        () => new Date(currentTime),
      );
      const aborted = new AbortController();
      aborted.abort();
      await expect(service.verifyDue({
        minimumIntervalMs: 60_000,
        timeoutMs: 1_000,
        signal: aborted.signal,
      })).resolves.toEqual({ checked: 0, verified: 0, expired: 0, failed: 0 });
      await expect(service.verifyDue({ concurrency: 0 })).rejects.toThrow(
        "crypto_evidence_verification_concurrency_invalid",
      );
      await expect(service.verifyDue({ timeoutMs: 999 })).rejects.toThrow(
        "crypto_evidence_verification_timeout_invalid",
      );
      expect(liveChecks).toBe(0);
      const items = service.list({ workspaceId: "workspace_evidence", ownerId: "owner_private" });
      expect(items).toHaveLength(1);
      expect(items[0]?.lastVerification).toBeNull();
      const serialized = JSON.stringify(items);
      for (const forbidden of [
        "owner_private",
        "workspace_evidence",
        "coworker_private",
        "run_evidence",
        "recipient_private",
        "kms://must-not-leak",
        "wrapped-must-not-leak",
      ]) expect(serialized).not.toContain(forbidden);
      expect(service.list({ workspaceId: "workspace_evidence", ownerId: "attacker" })).toEqual([]);
      const verified = await service.verify({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
        evidenceId: published.id,
        signal: new AbortController().signal,
      });
      expect(verified.verification).toMatchObject({
        status: "verified",
        currentEpoch: 8,
        checks: {
          tenantScope: true,
          ciphertextHash: true,
          merkleInclusion: true,
          suiCertification: true,
          walrusReadback: true,
        },
      });
      expect(verified.evidence.lastVerification).toEqual(verified.verification);
      expect(service.list({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
      })[0]?.lastVerification).toEqual(verified.verification);

      const notDue = await service.verifyDue({
        minimumIntervalMs: 60_000,
        timeoutMs: 1_000,
      });
      expect(notDue).toEqual({ checked: 0, verified: 0, expired: 0, failed: 0 });
      currentTime = new Date("2026-09-01T00:07:00.000Z");
      const automatic = await service.verifyDue({
        minimumIntervalMs: 60_000,
        timeoutMs: 1_000,
      });
      expect(automatic).toEqual({ checked: 1, verified: 1, expired: 0, failed: 0 });
      expect(liveChecks).toBe(2);

      currentTime = new Date("2026-09-01T00:09:00.000Z");
      liveFailure = "upstream accidentally returned secret-token-value";
      const failedAutomatic = await service.verifyDue({
        minimumIntervalMs: 60_000,
        timeoutMs: 1_000,
      });
      expect(failedAutomatic).toEqual({ checked: 1, verified: 0, expired: 0, failed: 1 });
      const failedStatus = service.list({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
      })[0]?.lastVerification;
      expect(failedStatus?.reason).toBe("crypto_evidence_verification_failed");
      expect(JSON.stringify(failedStatus)).not.toContain("secret-token-value");

      const destroyed = await store.destroyKey({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
        coworkerId: "coworker_private",
        evidenceId: published.id,
        expectedRevision: published.revision,
        now: currentTime,
      });
      expect(destroyed.state).toBe("key_destroyed");
      expect(service.list({
        workspaceId: "workspace_evidence",
        ownerId: "owner_private",
      })[0]?.lastVerification).toBeNull();
      await expect(service.verify({
        workspaceId: "workspace_evidence",
        ownerId: "attacker",
        evidenceId: published.id,
        signal: new AbortController().signal,
      })).rejects.toThrow("crypto_evidence_not_found");
    } finally {
      state.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
