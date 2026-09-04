import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";
import { afterEach, describe, expect, test } from "bun:test";

import type { MatterhornSuiTransactionStatusVerifier } from "./agent-file-walrus-renewal.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  MatterhornCryptoEvidenceWalrusDeletionService,
  type MatterhornWalrusDeletionTransactionBuilder,
} from "./crypto-evidence-walrus-deletion.js";
import {
  matterhornWalrusOwnerAddressHash,
  type MatterhornWalrusCertification,
} from "./crypto-evidence-walrus-publisher.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const roots: string[] = [];
const SIGNER = normalizeSuiAddress("0x1");

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function receipt(): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "receipt_deletion",
    runId: "run_deletion",
    workspaceId: "workspace_alpha",
    sessionId: "session_deletion",
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
      mode: "public_research",
      dataCategories: ["public"],
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

async function transactionFixture() {
  const transaction = new Transaction();
  transaction.setSender(SIGNER);
  transaction.setGasOwner(SIGNER);
  transaction.setGasPrice(1);
  transaction.setGasBudget(1);
  transaction.setGasPayment([]);
  transaction.setExpiration({ Epoch: 20 });
  const bytes = await transaction.build();
  return {
    transactionBytesBase64: Buffer.from(bytes).toString("base64"),
    transactionDigest: TransactionDataBuilder.getDigestFromBytes(bytes),
    simulationReference: sha256({ test: "crypto-evidence-walrus-deletion-simulation" }),
    simulatedAt: "2026-09-02T00:00:00.000Z",
  };
}

async function fixture(input: {
  deletable?: boolean;
  currentEpoch?: number;
  onBuild?: () => void | Promise<void>;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-evidence-deletion-"));
  roots.push(root);
  const statePath = join(root, "state.db");
  const state = new MatterhornGuardedRuntimeStateStore(statePath);
  const key = Buffer.alloc(32, 7);
  let destroyFails = false;
  let destroyCalls = 0;
  const keyManager: MatterhornEvidenceKeyManager = {
    createDataKey: async ({ recipientKeyIds }) => ({
      plaintextKey: Buffer.from(key),
      keyReference: "kms:test:evidence-deletion",
      wrappedKey: Buffer.from("wrapped-evidence-deletion").toString("base64"),
      keyContext: "a".repeat(64),
      recipientKeyIds,
    }),
    decryptDataKey: async () => Buffer.from(key),
    destroyKey: async () => {
      destroyCalls += 1;
      if (destroyFails) throw new Error("kms_unavailable");
    },
  };
  const sealed = await sealMatterhornRunEvidence({
    receipt: receipt(),
    coworkerId: "coworker_alpha",
    recipientKeyIds: ["recipient_alpha"],
    keyManager,
    now: new Date("2026-09-01T23:00:00.000Z"),
    correlationSalt: Buffer.alloc(32, 8),
    idEntropy: Buffer.alloc(24, 9),
  });
  const store = new MatterhornCryptoEvidenceStore(state, keyManager);
  const created = store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    runId: "run_deletion",
    coworkerId: "coworker_alpha",
    sealed,
    now: new Date("2026-09-01T23:00:00.000Z"),
  });
  const publication = store.beginWalrusPublication({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    coworkerId: "coworker_alpha",
    evidenceId: created.id,
    expectedRevision: created.revision,
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  const published = store.attachVerifiedWalrusProof({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    coworkerId: "coworker_alpha",
    evidenceId: created.id,
    expectedRevision: created.revision,
    claimId: publication.claimId,
    proof: {
      version: "matterhorn.walrus-proof.v1",
      network: "testnet",
      blobId: "test-blob-id",
      suiObjectId: "0x1234",
      certifiedEpoch: 10,
      validUntilEpoch: 15,
      quiltPatchId: null,
      merkleRoot: created.index.merkleLeaf,
      merkleProof: [],
      suiTransactionDigest: null,
    },
    walrusOwnerAddressHash: matterhornWalrusOwnerAddressHash(SIGNER),
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  let transactionStatus: "confirmed" | "failed" = "confirmed";
  let buildCalls = 0;
  const built = await transactionFixture();
  const buildTransaction: MatterhornWalrusDeletionTransactionBuilder = async (request) => {
    buildCalls += 1;
    expect(request).toMatchObject({
      network: "sui:testnet",
      signer: SIGNER,
      blobObjectId: "0x1234",
    });
    await input.onBuild?.();
    return built;
  };
  const verifyTransaction: MatterhornSuiTransactionStatusVerifier = async (request) => ({
    digest: request.digest,
    signer: request.signer,
    status: transactionStatus,
    observedAt: "2026-09-02T00:01:00.000Z",
  });
  const verifyCertification = async (): Promise<MatterhornWalrusCertification> => ({
    network: "testnet",
    blobId: "test-blob-id",
    suiObjectId: "0x1234",
    certifiedEpoch: 10,
    currentEpoch: input.currentEpoch ?? 13,
    validUntilEpoch: 15,
    deletable: input.deletable ?? true,
    ownerAddress: SIGNER,
    suiTransactionDigest: null,
  });
  const service = new MatterhornCryptoEvidenceWalrusDeletionService(
    store,
    state,
    buildTransaction,
    verifyTransaction,
    verifyCertification,
  );
  return {
    state,
    statePath,
    keyManager,
    store,
    published,
    service,
    built,
    buildTransaction,
    verifyTransaction,
    verifyCertification,
    buildCalls: () => buildCalls,
    destroyCalls: () => destroyCalls,
    setDestroyFails: (value: boolean) => { destroyFails = value; },
    setTransactionStatus: (value: "confirmed" | "failed") => { transactionStatus = value; },
  };
}

async function prepare(value: Awaited<ReturnType<typeof fixture>>) {
  return value.service.prepare({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    evidenceId: value.published.id,
    expectedRevision: value.published.revision,
    signer: "0x1",
    signal: new AbortController().signal,
    now: new Date("2026-09-02T00:00:00.000Z"),
  });
}

describe("Walrus encrypted evidence deletion airlock", () => {
  test("serializes deletion preparation across SQLite connections and protects replacement claims", async () => {
    let releaseBuild!: () => void;
    let buildStarted!: () => void;
    const buildGate = new Promise<void>((resolve) => { releaseBuild = resolve; });
    const started = new Promise<void>((resolve) => { buildStarted = resolve; });
    const value = await fixture({
      onBuild: async () => {
        buildStarted();
        await buildGate;
      },
    });
    const secondState = new MatterhornGuardedRuntimeStateStore(value.statePath);
    try {
      const secondStore = new MatterhornCryptoEvidenceStore(secondState, value.keyManager);
      const secondService = new MatterhornCryptoEvidenceWalrusDeletionService(
        secondStore,
        secondState,
        value.buildTransaction,
        value.verifyTransaction,
        value.verifyCertification,
      );
      const request = {
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      };
      const firstPrepare = value.service.prepare(request);
      await started;
      await expect(secondService.prepare(request)).rejects.toThrow(
        "crypto_evidence_walrus_deletion_in_progress",
      );
      expect(() => secondStore.beginWalrusRenewal({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: request.now,
      })).toThrow("crypto_evidence_operation_in_progress");
      await expect(secondStore.destroyKey({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: request.now,
      })).rejects.toThrow("crypto_evidence_operation_in_progress");
      expect(value.buildCalls()).toBe(1);
      releaseBuild();
      const prepared = await firstPrepare;
      await expect(secondService.prepare(request)).resolves.toEqual(prepared);
      expect(value.buildCalls()).toBe(1);

      const firstClaim = value.store.beginWalrusDeletion({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-02T00:06:00.000Z"),
      });
      const replacement = secondStore.beginWalrusDeletion({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-02T00:12:00.000Z"),
      });
      expect(value.store.endWalrusDeletion({
        workspaceId: request.workspaceId,
        evidenceId: request.evidenceId,
        claimId: firstClaim.claimId,
        now: new Date("2026-09-02T00:12:00.000Z"),
      })).toBe(false);
      expect(secondStore.hasWalrusDeletionClaim({
        workspaceId: request.workspaceId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        claimId: replacement.claimId,
        now: new Date("2026-09-02T00:12:00.000Z"),
      })).toBe(true);
    } finally {
      releaseBuild?.();
      secondState.close();
      value.state.close();
    }
  });

  test("prepares one exact transaction and destroys the copy and key once after wallet confirmation", async () => {
    const value = await fixture();
    try {
      await expect(value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: "0x2",
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_wallet_owner_required");
      const prepared = await prepare(value);
      expect(prepared).toMatchObject({
        preview: {
          evidenceId: value.published.id,
          evidenceRevision: 2,
          signer: SIGNER,
          blobId: "test-blob-id",
          suiObjectId: "0x1234",
          transactionDigest: value.built.transactionDigest,
          walletAuthority: "connected_wallet_only",
        },
        disclosure: {
          walletAction: "delete_walrus_blob",
          signingAndSubmission: "connected_wallet_only",
          agentAuthority: "none",
          recoveryKeyDestroyedAfterConfirmation: true,
          publicTransactionMayRemain: true,
        },
      });
      const confirmed = await value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:00.000Z"),
      });
      expect(confirmed).toMatchObject({
        item: {
          revision: 3,
          state: "key_destroyed",
          retention: { keyAvailable: false },
          publication: {
            deletionTransactionDigest: prepared.preview.transactionDigest,
            deletedAt: "2026-09-02T00:01:00.000Z",
          },
          lastVerification: { status: "deleted" },
        },
        verification: { status: "deleted", reason: "wallet_walrus_deletion_verified" },
        deletion: {
          walrusDeletionConfirmed: true,
          recoveryKeyDestroyed: true,
          contentRecoverable: false,
          publicTransactionMayRemain: true,
        },
      });
      expect(value.destroyCalls()).toBe(1);
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:01.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_deletion_expired_or_replayed");
      expect(value.destroyCalls()).toBe(1);
    } finally {
      value.state.close();
    }
  });

  test("rejects tenant substitution, mutation, failed transactions, expiry, and non-deletable blobs", async () => {
    const value = await fixture();
    try {
      const prepared = await prepare(value);
      await expect(value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_beta",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:01.000Z"),
      })).rejects.toThrow("crypto_evidence_not_found");
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: "0".repeat(64),
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_deletion_intent_mismatch");
      value.setTransactionStatus("failed");
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_deletion_transaction_failed");
      expect(value.destroyCalls()).toBe(0);
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:06:00.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_deletion_expired_or_replayed");
    } finally {
      value.state.close();
    }

    const nonDeletable = await fixture({ deletable: false });
    try {
      await expect(prepare(nonDeletable)).rejects.toThrow("crypto_evidence_walrus_not_deletable");
    } finally {
      nonDeletable.state.close();
    }
  });

  test("keeps the exact intent retryable when key destruction fails and rejects stale revisions", async () => {
    const value = await fixture();
    try {
      const prepared = await prepare(value);
      value.setDestroyFails(true);
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      })).rejects.toThrow("kms_unavailable");
      expect(value.state.get(
        "crypto_evidence_deletion_intent",
        value.published.id,
        Date.parse("2026-09-02T00:01:00.000Z"),
      )).not.toBeNull();
      expect(value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      })?.revision).toBe(2);
      value.setDestroyFails(false);
      await value.store.rotateKey({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        now: new Date("2026-09-02T00:01:30.000Z"),
      }).catch(() => undefined);
      const current = value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      });
      if (!current) throw new Error("test_evidence_missing");
      if (current.revision === value.published.revision) {
        value.state.put({
          kind: "crypto_evidence_record",
          key: current.id,
          workspaceId: current.workspaceId,
          value: { ...current, revision: current.revision + 1 },
          nowMs: Date.parse("2026-09-02T00:01:30.000Z"),
        });
      }
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).rejects.toThrow("crypto_evidence_revision_conflict");
      expect(value.state.get(
        "crypto_evidence_deletion_intent",
        value.published.id,
        Date.parse("2026-09-02T00:02:00.000Z"),
      )).not.toBeNull();
    } finally {
      value.state.close();
    }
  });
});
