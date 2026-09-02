import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { sealMatterhornRunEvidence } from "./crypto-evidence-sealer.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  createPinnedWalrusEvidenceTransport,
  MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE,
  MatterhornTestnetWalrusEvidencePublisher,
  type MatterhornWalrusCertification,
  type MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

function receipt(): MatterhornAgentRunReceipt {
  return {
    version: "matterhorn.agent-run-receipt.v1",
    id: "receipt_walrus",
    runId: "run_walrus",
    workspaceId: "workspace_walrus",
    sessionId: "session_walrus",
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
      redactionCount: 1,
      consent: "not_required",
      dataLeavesMatterhorn: false,
    },
    usage: {
      inputTokens: 3,
      outputTokens: 2,
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

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "matterhorn-walrus-evidence-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
  const key = Buffer.alloc(32, 17);
  const keyManager: MatterhornEvidenceKeyManager = {
    createDataKey: async ({ recipientKeyIds }) => ({
      plaintextKey: Buffer.from(key),
      keyReference: "kms://private-key-reference",
      wrappedKey: Buffer.from("wrapped-private-key").toString("base64"),
      keyContext: "c".repeat(64),
      recipientKeyIds,
    }),
    decryptDataKey: async () => Buffer.from(key),
    destroyKey: async () => {},
  };
  const sealed = await sealMatterhornRunEvidence({
    receipt: receipt(),
    coworkerId: "coworker_walrus",
    recipientKeyIds: ["recipient_private"],
    keyManager,
    now: new Date("2026-09-01T00:01:00.000Z"),
    correlationSalt: Buffer.alloc(32, 18),
    idEntropy: Buffer.alloc(24, 19),
  });
  const store = new MatterhornCryptoEvidenceStore(state, keyManager);
  const record = store.create({
    workspaceId: "workspace_walrus",
    ownerId: "owner_walrus",
    runId: "run_walrus",
    coworkerId: "coworker_walrus",
    sealed,
  });
  return { directory, state, store, record };
}

function certification(overrides: Partial<MatterhornWalrusCertification> = {}): MatterhornWalrusCertification {
  return {
    network: "testnet",
    blobId: "blob-testnet-1",
    suiObjectId: "0x1234",
    certifiedEpoch: 100,
    currentEpoch: 101,
    validUntilEpoch: 110,
    deletable: true,
    suiTransactionDigest: "testnet-transaction-digest",
    ...overrides,
  };
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("testnet Walrus evidence publisher", () => {
  test("publishes only public ciphertext, verifies certification and exact readback, then attaches proof", async () => {
    const value = await fixture();
    try {
      let publishedBytes = Buffer.alloc(0);
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async (input) => {
          publishedBytes = Buffer.from(input.bytes);
          expect(input.storageEpochs).toBe(5);
          return { blobId: "blob-testnet-1", suiObjectId: "0x1234", declaredEndEpoch: 110 };
        },
        readByObjectId: async ({ suiObjectId }) => {
          expect(suiObjectId).toBe("0x1234");
          return Buffer.from(publishedBytes);
        },
      };
      const publisher = new MatterhornTestnetWalrusEvidencePublisher(
        value.store,
        transport,
        async () => certification(),
      );
      const published = await publisher.publish({
        workspaceId: "workspace_walrus",
        ownerId: "owner_walrus",
        coworkerId: "coworker_walrus",
        evidenceId: value.record.id,
        expectedRevision: value.record.revision,
        signal: new AbortController().signal,
      });
      expect(published.state).toBe("published");
      expect(published.walrusProof).toMatchObject({
        network: "testnet",
        blobId: "blob-testnet-1",
        suiObjectId: "0x1234",
        validUntilEpoch: 110,
        merkleRoot: value.record.index.merkleLeaf,
      });
      const publicPayload = publishedBytes.toString("utf8");
      expect(publicPayload).toContain("matterhorn.walrus-ciphertext.v1");
      expect(publicPayload).not.toContain("kms://private-key-reference");
      expect(publicPayload).not.toContain("wrapped-private-key");
      expect(publicPayload).not.toContain("recipient_private");
      expect(publicPayload).not.toContain("owner_walrus");
      expect(publicPayload).not.toContain("workspace_walrus");
      await expect(publisher.verify({
        workspaceId: "workspace_walrus",
        ownerId: "owner_walrus",
        evidenceId: value.record.id,
        signal: new AbortController().signal,
      })).resolves.toEqual({ certification: certification() });
      await expect(publisher.verify({
        workspaceId: "workspace_walrus",
        ownerId: "attacker_owner",
        evidenceId: value.record.id,
        signal: new AbortController().signal,
      })).rejects.toThrow("crypto_evidence_not_found");
    } finally {
      value.state.close();
      await rm(value.directory, { recursive: true, force: true });
    }
  });

  test("fails closed before proof attachment for wrong certification or readback bytes", async () => {
    for (const mode of ["wrong_certification", "wrong_readback"] as const) {
      const value = await fixture();
      try {
        let uploaded = Buffer.alloc(0);
        const transport: MatterhornWalrusEvidenceTransport = {
          publish: async ({ bytes }) => {
            uploaded = Buffer.from(bytes);
            return { blobId: "blob-testnet-1", suiObjectId: "0x1234", declaredEndEpoch: 110 };
          },
          readByObjectId: async () => mode === "wrong_readback" ? Buffer.from("tampered") : uploaded,
        };
        const publisher = new MatterhornTestnetWalrusEvidencePublisher(
          value.store,
          transport,
          async () => certification(mode === "wrong_certification" ? { blobId: "attacker-blob" } : {}),
        );
        await expect(publisher.publish({
          workspaceId: "workspace_walrus",
          ownerId: "owner_walrus",
          coworkerId: "coworker_walrus",
          evidenceId: value.record.id,
          expectedRevision: value.record.revision,
          signal: new AbortController().signal,
        })).rejects.toThrow(mode === "wrong_certification"
          ? "crypto_evidence_walrus_certification_invalid"
          : "crypto_evidence_walrus_readback_mismatch");
        expect(value.store.get({
          workspaceId: "workspace_walrus",
          ownerId: "owner_walrus",
          evidenceId: value.record.id,
        })?.state).toBe("sealed");
      } finally {
        value.state.close();
        await rm(value.directory, { recursive: true, force: true });
      }
    }
  });

  test("requires authenticated HTTPS endpoints and fixes method, path, headers and epochs", async () => {
    expect(() => createPinnedWalrusEvidenceTransport({
      publisherUrl: "http://publisher.example.test",
      aggregatorUrl: "https://aggregator.example.test",
      bearerToken: "secret",
    })).toThrow("crypto_evidence_walrus_publisher_invalid");
    expect(() => createPinnedWalrusEvidenceTransport({
      publisherUrl: "https://publisher.example.test",
      aggregatorUrl: "https://aggregator.example.test",
      bearerToken: "",
    })).toThrow("crypto_evidence_walrus_auth_required");

    const requests: Array<Record<string, unknown>> = [];
    const body = Buffer.from("ciphertext-only");
    const transport = createPinnedWalrusEvidenceTransport({
      publisherUrl: "https://publisher.example.test/base",
      aggregatorUrl: "https://aggregator.example.test/root",
      bearerToken: "server-only-token",
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      requestBytes: async (input) => {
        requests.push(input as unknown as Record<string, unknown>);
        if (input.method === "PUT") {
          return {
            bytes: Buffer.from(JSON.stringify({
              newlyCreated: {
                blobObject: { id: "0x1234", blobId: "blob-testnet-1", storage: { endEpoch: 110 } },
              },
            })),
            connectedAddress: "93.184.216.34",
            requestBytes: input.body?.byteLength ?? 0,
            responseBytes: 1,
            headers: new Headers({ "content-type": "application/json" }),
          };
        }
        return {
          bytes: body,
          connectedAddress: "93.184.216.34",
          requestBytes: 0,
          responseBytes: body.length,
          headers: new Headers({ "content-type": MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE }),
        };
      },
    });
    const upload = await transport.publish({
      bytes: body,
      ciphertextHash: hash(body),
      storageEpochs: 5,
      signal: new AbortController().signal,
    });
    expect(upload).toEqual({ blobId: "blob-testnet-1", suiObjectId: "0x1234", declaredEndEpoch: 110 });
    await expect(transport.publish({
      bytes: body,
      ciphertextHash: hash(body),
      storageEpochs: 6,
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_evidence_walrus_epochs_override_forbidden");
    expect(await transport.readByObjectId({
      suiObjectId: "0x1234",
      signal: new AbortController().signal,
    })).toEqual(body);
    expect(requests).toHaveLength(2);
    expect((requests[0]?.endpoint as URL).href).toBe("https://publisher.example.test/base/v1/blobs?epochs=5");
    expect(requests[0]).toMatchObject({
      method: "PUT",
      headers: {
        accept: "application/json",
        authorization: "Bearer server-only-token",
        "content-type": MATTERHORN_WALRUS_EVIDENCE_CONTENT_TYPE,
      },
    });
    expect((requests[1]?.endpoint as URL).href).toBe(
      "https://aggregator.example.test/root/v1/blobs/by-object-id/0x1234?strict_consistency_check=true",
    );
  });

  test("rejects duplicate responses that omit the exact Sui object binding", async () => {
    const transport = createPinnedWalrusEvidenceTransport({
      publisherUrl: "https://publisher.example.test",
      aggregatorUrl: "https://aggregator.example.test",
      bearerToken: "secret",
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      requestBytes: async () => ({
        bytes: Buffer.from(JSON.stringify({ alreadyCertified: { blobId: "blob-testnet-1", endEpoch: 110 } })),
        connectedAddress: "93.184.216.34",
        requestBytes: 1,
        responseBytes: 1,
        headers: new Headers({ "content-type": "application/json" }),
      }),
    });
    const bytes = Buffer.from("ciphertext-only");
    await expect(transport.publish({
      bytes,
      ciphertextHash: hash(bytes),
      storageEpochs: 5,
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_evidence_walrus_object_binding_missing");
  });
});
