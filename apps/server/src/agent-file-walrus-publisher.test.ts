import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { MatterhornAgentFileStore } from "./agent-file-store.js";
import { MatterhornAgentFileWalrusPublisher } from "./agent-file-walrus-publisher.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import type {
  MatterhornEvidenceDataKeyLease,
  MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import type {
  MatterhornWalrusCertification,
  MatterhornWalrusEvidenceTransport,
} from "./crypto-evidence-walrus-publisher.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const encoder = new TextEncoder();

class TestKeyManager implements MatterhornEvidenceKeyManager {
  readonly keys = new Map<string, Buffer>();
  readonly destroyed: string[] = [];

  async createDataKey(input: {
    runId: string;
    recipientKeyIds: string[];
  }): Promise<MatterhornEvidenceDataKeyLease> {
    const keyReference = `walrus-file-key-${input.runId}`;
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
    this.destroyed.push(input.keyReference);
  }
}

function certification(overrides: Partial<MatterhornWalrusCertification> = {}): MatterhornWalrusCertification {
  return {
    network: "testnet",
    blobId: "blob-agent-file-1",
    suiObjectId: "0x1234",
    certifiedEpoch: 10,
    currentEpoch: 11,
    validUntilEpoch: 15,
    deletable: true,
    suiTransactionDigest: "testnet-file-storage-transaction",
    ...overrides,
  };
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-file-walrus-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
  const keys = new TestKeyManager();
  const store = new MatterhornAgentFileStore(state, keys, null, testDurableStateAuthority());
  const item = await store.create({
    workspaceId: "workspace_alpha",
    ownerId: "owner_alpha",
    request: {
      name: "private-portfolio.md",
      mimeType: "text/markdown",
      coworkerIds: ["risk_monitor"],
      expiresAt: null,
    },
    bytes: encoder.encode("Private target allocation: 20% TAO."),
    now: new Date("2026-09-02T00:00:00.000Z"),
  });
  return { root, state, keys, store, item };
}

describe("Agent File Walrus backup", () => {
  test("publishes ciphertext only, verifies Sui certification and exact readback", async () => {
    const value = await fixture();
    try {
      let publicBytes = Buffer.alloc(0);
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async (input) => {
          publicBytes = Buffer.from(input.bytes);
          expect(input.storageEpochs).toBe(5);
          return { blobId: "blob-agent-file-1", suiObjectId: "0x1234", declaredEndEpoch: 15 };
        },
        readByObjectId: async () => Buffer.from(publicBytes),
      };
      const publisher = new MatterhornAgentFileWalrusPublisher(
        value.store,
        transport,
        async () => certification(),
        5,
        () => new Date("2026-09-02T00:01:00.000Z"),
      );
      const published = await publisher.publish({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:01:00.000Z"),
      });
      expect(published.revision).toBe(2);
      expect(published.publication).toMatchObject({
        network: "testnet",
        blobId: "blob-agent-file-1",
        suiObjectId: "0x1234",
        validUntilEpoch: 15,
      });
      const publicPayload = publicBytes.toString("utf8");
      expect(publicPayload).toContain("matterhorn.walrus-ciphertext.v1");
      for (const forbidden of [
        "Private target allocation",
        "private-portfolio.md",
        "workspace_alpha",
        "owner_alpha",
        "risk_monitor",
        "walrus-file-key",
      ]) expect(publicPayload).not.toContain(forbidden);
      await expect(publisher.verify({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        signal: new AbortController().signal,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).resolves.toMatchObject({
        verified: true,
        network: "testnet",
        currentEpoch: 11,
        lifecycle: { status: "healthy", remainingEpochs: 4 },
      });
      await expect(publisher.verify({
        workspaceId: "workspace_alpha",
        ownerId: "owner_beta",
        fileId: value.item.id,
        signal: new AbortController().signal,
      })).rejects.toThrow("agent_file_not_found");
    } finally {
      value.state.close();
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test("warns before expiry and fails closed after expiry", async () => {
    const value = await fixture();
    try {
      let uploaded = Buffer.alloc(0);
      let currentEpoch = 13;
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async ({ bytes }) => {
          uploaded = Buffer.from(bytes);
          return { blobId: "blob-agent-file-1", suiObjectId: "0x1234", declaredEndEpoch: 15 };
        },
        readByObjectId: async () => Buffer.from(uploaded),
      };
      const publisher = new MatterhornAgentFileWalrusPublisher(
        value.store,
        transport,
        async () => certification({ currentEpoch }),
      );
      const published = await publisher.publish({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
        signal: new AbortController().signal,
      });
      await expect(publisher.verify({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        signal: new AbortController().signal,
      })).resolves.toMatchObject({
        lifecycle: { status: "renewal_due", remainingEpochs: 2 },
      });

      currentEpoch = 15;
      await expect(publisher.verify({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: published.id,
        signal: new AbortController().signal,
      })).rejects.toThrow("agent_file_walrus_certification_expired");
    } finally {
      value.state.close();
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test("fails closed on revision, certification, readback, replay, and abort", async () => {
    for (const failure of ["certification", "readback"] as const) {
      const value = await fixture();
      try {
        let uploaded = Buffer.alloc(0);
        const transport: MatterhornWalrusEvidenceTransport = {
          publish: async ({ bytes }) => {
            uploaded = Buffer.from(bytes);
            return { blobId: "blob-agent-file-1", suiObjectId: "0x1234", declaredEndEpoch: 15 };
          },
          readByObjectId: async () => failure === "readback"
            ? Buffer.from("wrong encrypted bytes")
            : Buffer.from(uploaded),
        };
        const publisher = new MatterhornAgentFileWalrusPublisher(
          value.store,
          transport,
          async () => failure === "certification"
            ? certification({ blobId: "wrong-blob" })
            : certification(),
        );
        await expect(publisher.publish({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          fileId: value.item.id,
          expectedRevision: value.item.revision,
          signal: new AbortController().signal,
        })).rejects.toThrow(failure === "certification"
          ? "agent_file_walrus_certification_invalid"
          : "agent_file_walrus_readback_mismatch");
        expect(value.store.get({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          fileId: value.item.id,
        })?.publication).toBeNull();
      } finally {
        value.state.close();
        rmSync(value.root, { recursive: true, force: true });
      }
    }

    const value = await fixture();
    try {
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async ({ bytes }) => ({
          blobId: "blob-agent-file-1",
          suiObjectId: "0x1234",
          declaredEndEpoch: 15,
        }),
        readByObjectId: async () => value.store.publicationCandidate({
          workspaceId: "workspace_alpha",
          ownerId: "owner_alpha",
          fileId: value.item.id,
        }).bytes,
      };
      const publisher = new MatterhornAgentFileWalrusPublisher(
        value.store,
        transport,
        async () => certification(),
      );
      await expect(publisher.publish({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision + 1,
        signal: new AbortController().signal,
      })).rejects.toThrow("agent_file_revision_conflict");
      const aborted = new AbortController();
      aborted.abort();
      await expect(publisher.publish({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
        signal: aborted.signal,
      })).rejects.toThrow("agent_file_walrus_aborted");
    } finally {
      value.state.close();
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test("serializes publication so one file cannot be uploaded twice concurrently", async () => {
    const value = await fixture();
    try {
      let uploaded = Buffer.alloc(0);
      let releaseUpload: () => void = () => undefined;
      let signalEntered: () => void = () => undefined;
      const entered = new Promise<void>((resolve) => {
        signalEntered = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      let publishCalls = 0;
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async ({ bytes }) => {
          publishCalls += 1;
          uploaded = Buffer.from(bytes);
          signalEntered();
          await release;
          return { blobId: "blob-agent-file-1", suiObjectId: "0x1234", declaredEndEpoch: 15 };
        },
        readByObjectId: async () => Buffer.from(uploaded),
      };
      const publisher = new MatterhornAgentFileWalrusPublisher(
        value.store,
        transport,
        async () => certification(),
      );
      const request = {
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
        signal: new AbortController().signal,
      };
      const first = publisher.publish(request);
      await entered;
      await expect(publisher.publish(request)).rejects.toThrow("agent_file_walrus_publication_in_progress");
      await expect(value.store.delete({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
      })).rejects.toThrow("agent_file_walrus_publication_in_progress");
      expect(value.keys.keys.size).toBe(1);
      expect(publishCalls).toBe(1);
      releaseUpload();
      await expect(first).resolves.toMatchObject({ revision: 2 });
    } finally {
      value.state.close();
      rmSync(value.root, { recursive: true, force: true });
    }
  });

  test("rejects a publication whose claim expires during external verification", async () => {
    const value = await fixture();
    try {
      let uploaded = Buffer.alloc(0);
      const transport: MatterhornWalrusEvidenceTransport = {
        publish: async ({ bytes }) => {
          uploaded = Buffer.from(bytes);
          return { blobId: "blob-agent-file-1", suiObjectId: "0x1234", declaredEndEpoch: 15 };
        },
        readByObjectId: async () => Buffer.from(uploaded),
      };
      const times = [
        new Date("2026-09-02T00:00:00.000Z"),
        new Date("2026-09-02T00:05:01.000Z"),
        new Date("2026-09-02T00:05:01.000Z"),
      ];
      const publisher = new MatterhornAgentFileWalrusPublisher(
        value.store,
        transport,
        async () => certification(),
        5,
        () => times.shift() ?? new Date("2026-09-02T00:05:01.000Z"),
      );
      await expect(publisher.publish({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
        expectedRevision: value.item.revision,
        signal: new AbortController().signal,
      })).rejects.toThrow("agent_file_walrus_publication_claim_invalid");
      expect(value.store.get({
        workspaceId: "workspace_alpha",
        ownerId: "owner_alpha",
        fileId: value.item.id,
      })?.publication).toBeNull();
    } finally {
      value.state.close();
      rmSync(value.root, { recursive: true, force: true });
    }
  });
});
