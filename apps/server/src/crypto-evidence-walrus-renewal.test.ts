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
import type { MatterhornWalrusCertification } from "./crypto-evidence-walrus-publisher.js";
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

async function fixture(input: { currentEpoch?: number; validUntilEpoch?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-evidence-renewal-"));
  roots.push(root);
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
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
  const store = new MatterhornCryptoEvidenceStore(state, keyManager);
  const created = store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    runId: "run_renewal",
    coworkerId: "coworker_alpha",
    sealed,
    now: new Date("2026-09-01T23:00:00.000Z"),
  });
  const published = store.attachVerifiedWalrusProof({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    coworkerId: "coworker_alpha",
    evidenceId: created.id,
    expectedRevision: created.revision,
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
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  let validUntilEpoch = input.validUntilEpoch ?? 15;
  let transactionStatus: "confirmed" | "failed" = "confirmed";
  const built = await transactionFixture();
  const buildTransaction: MatterhornWalrusRenewalTransactionBuilder = async (request) => {
    expect(request).toMatchObject({
      network: "sui:testnet",
      signer: SIGNER,
      blobObjectId: "0x1234",
      extensionEpochs: 5,
    });
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
    suiTransactionDigest: null,
  });
  const service = new MatterhornCryptoEvidenceWalrusRenewalService(
    store,
    state,
    buildTransaction,
    verifyTransaction,
    verifyCertification,
    5,
  );
  return {
    state,
    store,
    published,
    service,
    built,
    setValidUntilEpoch: (value: number) => { validUntilEpoch = value; },
    setTransactionStatus: (value: "confirmed" | "failed") => { transactionStatus = value; },
  };
}

describe("Walrus encrypted evidence renewal airlock", () => {
  test("prepares one exact transaction and atomically finalizes it once after wallet confirmation", async () => {
    const value = await fixture();
    try {
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
      const proof = value.published.walrusProof;
      if (!proof) throw new Error("test_walrus_proof_missing");
      value.store.renewVerifiedWalrusProof({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: value.published.revision,
        expectedBlobId: proof.blobId,
        expectedSuiObjectId: proof.suiObjectId,
        expectedCiphertextSha256: value.published.index.ciphertextHash,
        expectedPreviousValidUntilEpoch: proof.validUntilEpoch,
        proof: {
          ...proof,
          validUntilEpoch: 16,
          renewalTransactionDigest: "concurrent-renewal-digest",
          renewedAt: "2026-09-02T00:00:30.000Z",
        },
        now: new Date("2026-09-02T00:00:30.000Z"),
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
      await value.store.destroyKey({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        evidenceId: value.published.id,
        expectedRevision: current.revision,
      });
      expect(value.state.get(
        "crypto_evidence_renewal_intent",
        value.published.id,
        Date.parse("2026-09-02T00:02:00.000Z"),
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
