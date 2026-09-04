import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Transaction, TransactionDataBuilder } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { afterEach, describe, expect, test } from "bun:test";

import { MatterhornAgentFileStore } from "./agent-file-store.js";
import {
  MatterhornAgentFileWalrusRenewalService,
  type MatterhornSuiTransactionStatusVerifier,
  type MatterhornWalrusRenewalTransactionBuilder,
} from "./agent-file-walrus-renewal.js";
import type {
  MatterhornEvidenceDataKeyLease,
  MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import type { MatterhornWalrusCertification } from "./crypto-evidence-walrus-publisher.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const roots: string[] = [];
const SIGNER = normalizeSuiAddress("0x1");
const encoder = new TextEncoder();

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

class TestKeyManager implements MatterhornEvidenceKeyManager {
  readonly keys = new Map<string, Buffer>();

  async createDataKey(input: { runId: string; recipientKeyIds: string[] }): Promise<MatterhornEvidenceDataKeyLease> {
    const keyReference = `renewal-key-${input.runId}`;
    const plaintextKey = randomBytes(32);
    this.keys.set(keyReference, Buffer.from(plaintextKey));
    return {
      plaintextKey,
      keyReference,
      wrappedKey: Buffer.from(keyReference).toString("base64"),
      keyContext: randomBytes(32).toString("hex"),
      recipientKeyIds: [...input.recipientKeyIds],
    };
  }

  async decryptDataKey(input: { keyReference: string }): Promise<Buffer> {
    const key = this.keys.get(input.keyReference);
    if (!key) throw new Error("test_key_missing");
    return Buffer.from(key);
  }

  async destroyKey(input: { keyReference: string }): Promise<void> {
    this.keys.delete(input.keyReference);
  }
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
    simulationReference: sha256({ test: "walrus-renewal-simulation" }),
    simulatedAt: "2026-09-02T00:00:00.000Z",
  };
}

async function fixture(input: { currentEpoch?: number; validUntilEpoch?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-walrus-renewal-"));
  roots.push(root);
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
  const keys = new TestKeyManager();
  const store = new MatterhornAgentFileStore(state, keys);
  const item = await store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    request: {
      name: "policy.md",
      mimeType: "text/markdown",
      coworkerIds: ["coworker_alpha"],
      expiresAt: null,
    },
    bytes: encoder.encode("Private portfolio policy."),
    now: new Date("2026-09-01T23:00:00.000Z"),
  });
  const candidate = store.beginWalrusPublication({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    fileId: item.id,
    expectedRevision: item.revision,
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  const published = store.attachWalrusPublication({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    fileId: item.id,
    expectedRevision: item.revision,
    claimId: candidate.claimId,
    publication: {
      version: "matterhorn.agent-file-walrus-publication.v1",
      network: "testnet",
      blobId: "test-blob-id",
      suiObjectId: "0x1234",
      ciphertextSha256: candidate.ciphertextSha256,
      certifiedEpoch: 10,
      validUntilEpoch: input.validUntilEpoch ?? 15,
      suiTransactionDigest: null,
      publishedAt: "2026-09-01T23:01:00.000Z",
      verifiedAt: "2026-09-01T23:01:00.000Z",
    },
    now: new Date("2026-09-01T23:01:00.000Z"),
  });
  candidate.bytes.fill(0);
  let validUntilEpoch = input.validUntilEpoch ?? 15;
  let transactionStatus: "confirmed" | "failed" = "confirmed";
  const built = await transactionFixture();
  const buildTransaction: MatterhornWalrusRenewalTransactionBuilder = async (request) => {
    expect(request.network).toBe("sui:testnet");
    expect(request.signer).toBe(SIGNER);
    expect(request.blobObjectId).toBe("0x1234");
    expect(request.extensionEpochs).toBe(5);
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
  const service = new MatterhornAgentFileWalrusRenewalService(
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

describe("Walrus Agent File renewal airlock", () => {
  test("prepares one exact transaction and finalizes it once after connected-wallet confirmation", async () => {
    const value = await fixture();
    try {
      const prepared = await value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        expectedRevision: value.published.revision,
        signer: "0x1",
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      expect(prepared).toMatchObject({
        preview: {
          fileRevision: 2,
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
        fileId: value.published.id,
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
        },
        verification: {
          validUntilEpoch: 20,
          lifecycle: { status: "healthy", remainingEpochs: 7 },
        },
      });
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:01.000Z"),
      })).rejects.toThrow("agent_file_walrus_renewal_expired_or_replayed");
    } finally {
      value.state.close();
    }
  });

  test("rejects cross-tenant access, mutation, failed transactions, and expired intents", async () => {
    const value = await fixture();
    try {
      const prepared = await value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      await expect(value.service.prepare({
        workspaceId: "workspace_alpha",
        ownerId: "owner_beta",
        fileId: value.published.id,
        expectedRevision: value.published.revision,
        signer: SIGNER,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:00:01.000Z"),
      })).rejects.toThrow("agent_file_not_found");
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: "0".repeat(64),
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      })).rejects.toThrow("agent_file_walrus_renewal_intent_mismatch");
      value.setTransactionStatus("failed");
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      })).rejects.toThrow("agent_file_walrus_renewal_transaction_failed");
      expect(value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
      })?.revision).toBe(2);
      await expect(value.service.confirm({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.published.id,
        intentId: prepared.preview.intentId,
        intentHash: prepared.preview.intentHash,
        transactionDigest: prepared.preview.transactionDigest,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:06:00.000Z"),
      })).rejects.toThrow("agent_file_walrus_renewal_expired_or_replayed");
    } finally {
      value.state.close();
    }
  });

  test("does not prepare renewal before the notice window or after expiry", async () => {
    for (const state of [
      { currentEpoch: 11, expected: "agent_file_walrus_renewal_not_due" },
      { currentEpoch: 15, expected: "agent_file_walrus_certification_expired" },
    ]) {
      const value = await fixture({ currentEpoch: state.currentEpoch });
      try {
        await expect(value.service.prepare({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          fileId: value.published.id,
          expectedRevision: value.published.revision,
          signer: SIGNER,
          signal: new AbortController().signal,
          now: new Date("2026-09-02T00:00:00.000Z"),
        })).rejects.toThrow(state.expected);
      } finally {
        value.state.close();
      }
    }
  });
});
