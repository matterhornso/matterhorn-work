import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";
import { afterEach, describe, expect, test } from "bun:test";

import type {
  MatterhornSuiTransactionStatusVerifier,
  MatterhornWalrusRenewalTransactionBuilder,
} from "./agent-file-walrus-renewal.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import { MatterhornCryptoEvidenceWalrusRenewalService } from "./crypto-evidence-walrus-renewal.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
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
    id: "receipt_renewal",
    runId: "run_renewal",
    workspaceId: "workspace_alpha",
    sessionId: "session_renewal",
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
    simulationReference: sha256({ test: "crypto-evidence-walrus-renewal-simulation" }),
    simulatedAt: "2026-09-02T00:00:00.000Z",
  };
}

async function fixture(input: {
  currentEpoch?: number;
  validUntilEpoch?: number;
  onBuild?: () => void | Promise<void>;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-evidence-renewal-"));
  roots.push(root);
  const statePath = join(root, "state.db");
  const state = new MatterhornGuardedRuntimeStateStore(statePath);
  const key = Buffer.alloc(32, 7);
  const keyManager: MatterhornEvidenceKeyManager = {
    createDataKey: async ({ recipientKeyIds }) => ({
      plaintextKey: Buffer.from(key),
      keyReference: "kms:test:evidence-renewal",
      wrappedKey: Buffer.from("wrapped-evidence-renewal").toString("base64"),
      keyContext: "a".repeat(64),
      recipientKeyIds,
    }),
    decryptDataKey: async () => Buffer.from(key),
    destroyKey: async () => undefined,
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
  const authority = testDurableStateAuthority();
  const store = new MatterhornCryptoEvidenceStore(state, keyManager, {}, null, authority);
  const created = store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    runId: "run_renewal",
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
      validUntilEpoch: input.validUntilEpoch ?? 15,
      quiltPatchId: null,
      merkleRoot: created.index.merkleLeaf,
      merkleProof: [],
      suiTransactionDigest: null,
    },
    walrusOwnerAddressHash: matterhornWalrusOwnerAddressHash(SIGNER),
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  let validUntilEpoch = input.validUntilEpoch ?? 15;
  let transactionStatus: "confirmed" | "failed" = "confirmed";
  let buildCalls = 0;
  const built = await transactionFixture();
  const buildTransaction: MatterhornWalrusRenewalTransactionBuilder = async (request) => {
    buildCalls += 1;
    expect(request).toMatchObject({
      network: "sui:testnet",
      signer: SIGNER,
      blobObjectId: "0x1234",
      extensionEpochs: 5,
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
    validUntilEpoch,
    deletable: true,
    ownerAddress: SIGNER,
    suiTransactionDigest: null,
  });
  const service = new MatterhornCryptoEvidenceWalrusRenewalService(
    store,
    state,
    authority,
    buildTransaction,
    verifyTransaction,
    verifyCertification,
    5,
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
    authority,
    buildCalls: () => buildCalls,
    setValidUntilEpoch: (value: number) => { validUntilEpoch = value; },
    setTransactionStatus: (value: "confirmed" | "failed") => { transactionStatus = value; },
  };
}

describe("Walrus encrypted evidence renewal airlock", () => {
  test("serializes renewal preparation across SQLite connections and protects replacement claims", async () => {
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
      const secondStore = new MatterhornCryptoEvidenceStore(secondState, value.keyManager, {}, null, testDurableStateAuthority());
      const secondService = new MatterhornCryptoEvidenceWalrusRenewalService(
        secondStore,
        secondState,
        testDurableStateAuthority(),
        value.buildTransaction,
        value.verifyTransaction,
        value.verifyCertification,
        5,
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
        "crypto_evidence_walrus_renewal_in_progress",
      );
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

      const firstClaim = value.store.beginWalrusRenewal({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-02T00:06:00.000Z"),
      });
      const replacement = secondStore.beginWalrusRenewal({
        workspaceId: request.workspaceId,
        ownerId: request.ownerId,
        evidenceId: request.evidenceId,
        expectedRevision: request.expectedRevision,
        now: new Date("2026-09-02T00:12:00.000Z"),
      });
      expect(value.store.endWalrusRenewal({
        workspaceId: request.workspaceId,
        evidenceId: request.evidenceId,
        claimId: firstClaim.claimId,
        now: new Date("2026-09-02T00:12:00.000Z"),
      })).toBe(false);
      expect(secondStore.hasWalrusRenewalClaim({
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

  test("prepares one exact transaction and atomically finalizes it once after wallet confirmation", async () => {
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
      const prepared = await value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: "0x1",
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      expect(prepared).toMatchObject({
        preview: {
          evidenceId: value.published.id,
          evidenceRevision: 2,
          signer: SIGNER,
          currentEpoch: 13,
          previousValidUntilEpoch: 15,
          extensionEpochs: 5,
          targetValidUntilEpoch: 20,
          transactionDigest: value.built.transactionDigest,
          walletAuthority: "connected_wallet_only",
        },
        disclosure: {
          paymentAsset: "WAL",
          signingAndSubmission: "connected_wallet_only",
          agentAuthority: "none",
        },
      });
      expect(prepared.preview.intentHash).toMatch(/^[a-f0-9]{64}$/);
      const originalIntent = value.state.getRecord<unknown>(
        "crypto_evidence_renewal_intent",
        value.published.id,
        new Date("2026-09-02T00:01:00.000Z").getTime(),
      )!;

      value.setValidUntilEpoch(20);
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
          publication: {
            validUntilEpoch: 20,
            renewalTransactionDigest: prepared.preview.transactionDigest,
            renewedAt: "2026-09-02T00:01:00.000Z",
          },
          lastVerification: { status: "verified", currentEpoch: 13 },
        },
        verification: { status: "verified", currentEpoch: 13 },
      });
      expect(value.store.listAccessAudit({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      }).at(-1)?.action).toBe("renew_proof");
      const nextClaim = value.store.beginWalrusRenewal({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: confirmed.item.revision,
        now: new Date("2026-09-02T00:02:00.000Z"),
      });
      expect(value.store.endWalrusRenewal({
        workspaceId: "workspace_alpha",
        evidenceId: value.published.id,
        claimId: nextClaim.claimId,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).toBe(true);
      value.state.put({
        kind: originalIntent.kind,
        key: originalIntent.key,
        workspaceId: originalIntent.workspaceId,
        sessionId: originalIntent.sessionId,
        value: originalIntent.value,
        expiresAtMs: originalIntent.expiresAtMs,
        nowMs: originalIntent.updatedAtMs,
      });
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:01.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_renewal_expired_or_replayed");
    } finally {
      value.state.close();
    }
  });

  test("rejects mutated and unsealed restored renewal intents before wallet verification", async () => {
    for (const mutation of ["seal", "legacy"] as const) {
      const value = await fixture();
      try {
        const prepared = await value.service.prepare({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          evidenceId: value.published.id,
          expectedRevision: value.published.revision,
          signer: SIGNER,
          signal: new AbortController().signal,
          now: new Date("2026-09-02T00:00:00.000Z"),
        });
        const row = value.state.getRecord<Record<string, unknown>>(
          "crypto_evidence_renewal_intent",
          value.published.id,
          new Date("2026-09-02T00:01:00.000Z").getTime(),
        )!;
        value.state.put({
          kind: row.kind,
          key: row.key,
          workspaceId: row.workspaceId,
          sessionId: row.sessionId,
          value: mutation === "seal" ? { ...row.value, authoritySeal: "A".repeat(43) } : { restored: true },
          expiresAtMs: row.expiresAtMs,
          nowMs: row.updatedAtMs,
        });
        await expect(value.service.confirm({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          evidenceId: value.published.id,
          intentId: prepared.preview.intentId,
          intentHash: prepared.preview.intentHash,
          transactionDigest: prepared.preview.transactionDigest,
          signal: new AbortController().signal,
          now: new Date("2026-09-02T00:01:00.000Z"),
        })).rejects.toThrow("crypto_evidence_walrus_renewal_intent_integrity_invalid");
      } finally {
        value.state.close();
      }
    }
  });

  test("rejects tenant substitution, intent mutation, failed transactions, and expired intents", async () => {
    const value = await fixture();
    try {
      const prepared = await value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
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
      })).rejects.toThrow("crypto_evidence_walrus_renewal_intent_mismatch");
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
      })).rejects.toThrow("crypto_evidence_walrus_renewal_transaction_failed");
      expect(value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      })?.revision).toBe(2);
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:06:00.000Z"),
      })).rejects.toThrow("crypto_evidence_walrus_renewal_expired_or_replayed");
    } finally {
      value.state.close();
    }
  });

  test("rolls back intent consumption after a concurrent evidence revision and clears it on key deletion", async () => {
    const value = await fixture();
    try {
      const prepared = await value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      const stored = value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      });
      if (!stored) throw new Error("test_evidence_missing");
      const updatedAtMs = Date.parse("2026-09-02T00:00:30.000Z");
      const next = {
        ...stored,
        revision: stored.revision + 1,
        updatedAt: new Date(updatedAtMs).toISOString(),
      };
      value.state.put({
        kind: "crypto_evidence_record",
        key: stored.id,
        workspaceId: stored.workspaceId,
        value: value.authority.seal({
          kind: "crypto_evidence_record",
          key: next.id,
          workspaceId: next.workspaceId,
          sessionId: null,
          expiresAtMs: null,
          updatedAtMs,
          value: next,
        }),
        nowMs: updatedAtMs,
      });
      value.setValidUntilEpoch(20);
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
        "crypto_evidence_renewal_intent",
        value.published.id,
        Date.parse("2026-09-02T00:02:00.000Z"),
      )).not.toBeNull();
      const current = value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
      });
      if (!current) throw new Error("test_evidence_missing");
      await expect(value.store.destroyKey({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: current.revision,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).rejects.toThrow("crypto_evidence_operation_in_progress");
      expect(value.state.get(
        "crypto_evidence_renewal_intent",
        value.published.id,
        Date.parse("2026-09-02T00:02:00.000Z"),
      )).not.toBeNull();
      await value.store.destroyKey({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: current.revision,
        now: new Date("2026-09-02T00:06:00.000Z"),
      });
      expect(value.state.get(
        "crypto_evidence_renewal_intent",
        value.published.id,
        Date.parse("2026-09-02T00:06:00.000Z"),
      )).toBeNull();
    } finally {
      value.state.close();
    }
  });

  test("does not prepare before the renewal window or after storage expiry", async () => {
    for (const scenario of [
      { currentEpoch: 11, expected: "crypto_evidence_walrus_renewal_not_due" },
      { currentEpoch: 15, expected: "crypto_evidence_walrus_certification_expired" },
    ]) {
      const value = await fixture({ currentEpoch: scenario.currentEpoch });
      try {
        await expect(value.service.prepare({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          evidenceId: value.published.id,
          expectedRevision: value.published.revision,
          signer: SIGNER,
          signal: new AbortController().signal,
          now: new Date("2026-09-02T00:00:00.000Z"),
        })).rejects.toThrow(scenario.expected);
      } finally {
        value.state.close();
      }
    }
  });
});
