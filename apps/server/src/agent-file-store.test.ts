import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  MatterhornAgentFileStore,
  MatterhornAgentFileStoreError,
  type MatterhornAgentFileRecord,
} from "./agent-file-store.js";
import type {
  MatterhornEvidenceDataKeyLease,
  MatterhornEvidenceKeyManager,
} from "./crypto-evidence-sealer.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import {
  MatterhornGuardedRuntimeStateStore,
  type GuardedRuntimeStateKind,
} from "./guarded-runtime-state-store.js";

const encoder = new TextEncoder();

class TestKeyManager implements MatterhornEvidenceKeyManager {
  readonly keys = new Map<string, Buffer>();
  destroyed: string[] = [];

  async createDataKey(input: {
    workspaceId: string;
    runId: string;
    recipientKeyIds: string[];
  }): Promise<MatterhornEvidenceDataKeyLease> {
    const reference = `test-key-${input.runId}`;
    const key = randomBytes(32);
    this.keys.set(reference, Buffer.from(key));
    return {
      plaintextKey: key,
      keyReference: reference,
      wrappedKey: Buffer.from(reference).toString("base64"),
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

class FailingClaimDeleteStateStore extends MatterhornGuardedRuntimeStateStore {
  failNextOperationClaimDelete = false;

  override delete(kind: GuardedRuntimeStateKind, key: string): boolean {
    if (kind === "agent_file_operation_claim" && this.failNextOperationClaimDelete) {
      this.failNextOperationClaimDelete = false;
      return false;
    }
    return super.delete(kind, key);
  }
}

function uploadRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "portfolio.md",
    mimeType: "text/markdown",
    coworkerIds: ["risk_monitor"],
    expiresAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

async function withStore(
  run: (input: {
    store: MatterhornAgentFileStore;
    state: MatterhornGuardedRuntimeStateStore;
    keys: TestKeyManager;
    authority: MatterhornDurableStateAuthority;
  }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-files-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
  const keys = new TestKeyManager();
  const authority = testDurableStateAuthority();
  try {
    await run({
      store: new MatterhornAgentFileStore(state, keys, null, authority),
      state,
      keys,
      authority,
    });
  } finally {
    authority.close();
    state.close();
    rmSync(root, { recursive: true, force: true });
  }
}

describe("encrypted Agent Files store", () => {
  test("encrypts bytes, lists metadata only, and compiles context for the exact coworker", async () => {
    await withStore(async ({ store, state }) => {
      const secretText = "Target allocation: 20% TAO. Review each Friday.";
      const created = await store.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest(),
        bytes: encoder.encode(secretText),
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      expect(created).toMatchObject({
        revision: 1,
        file: {
          dataLabel: "workspace_private",
          access: { coworkerIds: ["risk_monitor"], readOnly: true },
          security: { walletAuthority: "none", executable: false },
        },
      });
      const persisted = state.get<MatterhornAgentFileRecord>("agent_file_record", created.id);
      expect(persisted).not.toBeNull();
      expect(JSON.stringify(persisted)).not.toContain(secretText);
      expect(store.list({ workspaceId: "ws_alpha", ownerId: "owner_alpha" })).toEqual([created]);
      const context = await store.readContext({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        coworkerId: "risk_monitor",
        fileId: created.id,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      expect(context.part.text).toContain("Target allocation: 20% TAO");
      expect(context.part.label).toBe("workspace_private");
      const recovered = await store.recover({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      try {
        expect(recovered.item).toEqual(created);
        expect(recovered.bytes.toString("utf8")).toBe(secretText);
      } finally {
        recovered.bytes.fill(0);
      }
    });
  });

  test("blocks secret material before creating a data key", async () => {
    await withStore(async ({ store, keys }) => {
      await expect(store.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest(),
        bytes: encoder.encode("private key: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      })).rejects.toMatchObject({
        code: "agent_file_blocked",
        issues: expect.arrayContaining(["agent_file_secret_content_blocked"]),
      });
      expect(keys.keys.size).toBe(0);
    });
  });

  test("fails closed across owner, workspace, coworker, expiry, and ciphertext tampering", async () => {
    await withStore(async ({ store, state }) => {
      const created = await store.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest(),
        bytes: encoder.encode("Read-only portfolio context."),
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      expect(() => store.get({
        workspaceId: "ws_alpha",
        ownerId: "owner_beta",
        fileId: created.id,
      })).toThrow("agent_file_not_found");
      await expect(store.recover({
        workspaceId: "ws_alpha",
        ownerId: "owner_beta",
        fileId: created.id,
        expectedRevision: created.revision,
      })).rejects.toMatchObject({ code: "agent_file_not_found" });
      await expect(store.recover({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision + 1,
      })).rejects.toMatchObject({ code: "agent_file_revision_conflict" });
      await expect(store.recover({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: new Date("2026-10-01T00:00:00.000Z"),
      })).rejects.toMatchObject({ code: "agent_file_expired" });
      expect(store.list({ workspaceId: "ws_beta", ownerId: "owner_alpha" })).toEqual([]);
      await expect(store.readContext({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        coworkerId: "market_analyst",
        fileId: created.id,
      })).rejects.toMatchObject({ code: "agent_file_access_denied" });
      expect(store.get({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        now: new Date("2026-10-01T00:00:00.000Z"),
      })).toBeNull();

      const persisted = state.getRecord<{
        version: string;
        value: MatterhornAgentFileRecord;
        authoritySeal: string;
      }>("agent_file_record", created.id);
      if (!persisted) throw new Error("test record missing");
      const replacement = persisted.value.value.envelope.ciphertext[0] === "A" ? "B" : "A";
      const tampered: MatterhornAgentFileRecord = {
        ...persisted.value.value,
        envelope: {
          ...persisted.value.value.envelope,
          ciphertext: `${replacement}${persisted.value.value.envelope.ciphertext.slice(1)}`,
        },
      };
      state.put({
        kind: "agent_file_record",
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        value: { ...persisted.value, value: tampered },
        nowMs: persisted.updatedAtMs,
      });
      await expect(store.readContext({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        coworkerId: "risk_monitor",
        fileId: created.id,
        now: new Date("2026-09-02T00:00:00.000Z"),
      })).rejects.toMatchObject({ code: "agent_file_state_integrity_invalid" });

      const mutations: MatterhornAgentFileRecord[] = [
        { ...persisted.value.value, revision: persisted.value.value.revision + 1 },
        {
          ...persisted.value.value,
          ownerId: "owner_substituted",
        },
        {
          ...persisted.value.value,
          file: {
            ...persisted.value.value.file,
            access: {
              ...persisted.value.value.file.access,
              coworkerIds: ["attacker_coworker"],
            },
          },
        },
        {
          ...persisted.value.value,
          key: { ...persisted.value.value.key, wrappedKey: "mutated-wrapped-key" },
        },
      ];
      for (const mutation of mutations) {
        state.put({
          kind: "agent_file_record",
          key: persisted.key,
          workspaceId: persisted.workspaceId,
          value: { ...persisted.value, value: mutation },
          nowMs: persisted.updatedAtMs,
        });
        expect(() => store.get({
          workspaceId: "ws_alpha",
          ownerId: "owner_alpha",
          fileId: created.id,
          now: new Date("2026-09-02T00:00:00.000Z"),
        })).toThrow("agent_file_state_integrity_invalid");
      }

      state.put({
        kind: "agent_file_record",
        key: persisted.key,
        workspaceId: "ws_transplanted",
        value: persisted.value,
        nowMs: persisted.updatedAtMs,
      });
      expect(() => store.get({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        now: new Date("2026-09-02T00:00:00.000Z"),
      })).toThrow("agent_file_state_integrity_invalid");

      state.put({
        kind: "agent_file_record",
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        value: persisted.value.value,
        nowMs: persisted.updatedAtMs,
      });
      expect(() => store.get({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        now: new Date("2026-09-02T00:00:00.000Z"),
      })).toThrow("agent_file_state_integrity_invalid");

      state.put({
        kind: "agent_file_record",
        key: persisted.key,
        workspaceId: persisted.workspaceId,
        value: persisted.value,
        nowMs: persisted.updatedAtMs,
      });
      const wrongAuthority = testDurableStateAuthority(
        "different-agent-file-authority-secret-at-least-32-bytes",
      );
      try {
        const wrongKeyStore = new MatterhornAgentFileStore(state, new TestKeyManager(), null, wrongAuthority);
        expect(() => wrongKeyStore.get({
          workspaceId: "ws_alpha",
          ownerId: "owner_alpha",
          fileId: created.id,
          now: new Date("2026-09-02T00:00:00.000Z"),
        })).toThrow("agent_file_state_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
    });
  });

  test("deletes exact records, rejects stale revisions, and purges a workspace only", async () => {
    await withStore(async ({ store, keys }) => {
      const first = await store.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest({ expiresAt: null }),
        bytes: encoder.encode("Alpha context."),
      });
      const second = await store.create({
        workspaceId: "ws_beta",
        ownerId: "owner_beta",
        request: uploadRequest({ expiresAt: null }),
        bytes: encoder.encode("Beta context."),
      });
      await expect(store.delete({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: first.id,
        expectedRevision: 2,
      })).rejects.toBeInstanceOf(MatterhornAgentFileStoreError);
      expect(store.get({ workspaceId: "ws_alpha", ownerId: "owner_alpha", fileId: first.id })).not.toBeNull();
      await store.delete({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: first.id,
        expectedRevision: 1,
      });
      expect(store.get({ workspaceId: "ws_alpha", ownerId: "owner_alpha", fileId: first.id })).toBeNull();
      expect(keys.destroyed).toHaveLength(1);
      expect(await store.destroyWorkspace({ workspaceId: "ws_alpha" })).toEqual({
        checked: 0,
        destroyed: 0,
        failures: [],
      });
      expect(store.get({ workspaceId: "ws_beta", ownerId: "owner_beta", fileId: second.id })).not.toBeNull();
    });
  });

  test("serializes Walrus publication across SQLite connections and protects replacement claims", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-file-publication-claim-"));
    const databasePath = join(root, "state.db");
    const stateA = new MatterhornGuardedRuntimeStateStore(databasePath);
    const stateB = new MatterhornGuardedRuntimeStateStore(databasePath);
    const keys = new TestKeyManager();
    const storeA = new MatterhornAgentFileStore(stateA, keys, null, testDurableStateAuthority());
    const storeB = new MatterhornAgentFileStore(stateB, keys, null, testDurableStateAuthority());
    try {
      const created = await storeA.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest({ expiresAt: null }),
        bytes: encoder.encode("Crash-safe encrypted cloud copy."),
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      const firstNow = new Date("2026-09-02T00:01:00.000Z");
      const first = storeA.beginWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      });
      const claimRow = stateA.listRecords<unknown>("agent_file_operation_claim", {
        workspaceId: "ws_alpha",
        nowMs: firstNow.getTime(),
      })[0];
      if (!claimRow) throw new Error("test operation claim missing");
      const wrongAuthority = testDurableStateAuthority(
        "wrong-agent-file-operation-authority-key-000000000000000000",
      );
      try {
        const wrongStore = new MatterhornAgentFileStore(stateB, keys, null, wrongAuthority);
        expect(() => wrongStore.endWalrusPublication({
          workspaceId: "ws_alpha",
          fileId: created.id,
          claimId: first.claimId,
          now: firstNow,
        })).toThrow("agent_file_operation_claim_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
      for (const mutation of ["tenant", "payload", "updated_at"] as const) {
        stateA.put({
          kind: claimRow.kind,
          key: claimRow.key,
          workspaceId: mutation === "tenant" ? "ws_transplanted" : claimRow.workspaceId,
          sessionId: claimRow.sessionId,
          value: mutation === "payload" ? { legacy: true } : claimRow.value,
          expiresAtMs: claimRow.expiresAtMs,
          nowMs: mutation === "updated_at" ? claimRow.updatedAtMs + 1 : claimRow.updatedAtMs,
        });
        expect(() => storeB.endWalrusPublication({
          workspaceId: "ws_alpha",
          fileId: created.id,
          claimId: first.claimId,
          now: firstNow,
        })).toThrow("agent_file_operation_claim_integrity_invalid");
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
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      })).toThrow("agent_file_walrus_publication_in_progress");
      await expect(storeB.delete({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: firstNow,
      })).rejects.toThrow("agent_file_walrus_publication_in_progress");

      const replacementNow = new Date("2026-09-02T00:06:01.000Z");
      const replacement = storeB.beginWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      });
      expect(storeA.endWalrusPublication({
        workspaceId: "ws_alpha",
        fileId: created.id,
        claimId: first.claimId,
        now: replacementNow,
      })).toBe(false);
      expect(() => storeA.attachWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        claimId: first.claimId,
        publication: {
          version: "matterhorn.agent-file-walrus-publication.v1",
          network: "testnet",
          blobId: "stale-worker-blob",
          suiObjectId: "0x1234",
          ciphertextSha256: first.ciphertextSha256,
          certifiedEpoch: 1,
          validUntilEpoch: 6,
          suiTransactionDigest: null,
          publishedAt: replacementNow.toISOString(),
          verifiedAt: replacementNow.toISOString(),
        },
        now: replacementNow,
      })).toThrow("agent_file_walrus_publication_claim_invalid");
      expect(() => storeA.beginWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      })).toThrow("agent_file_walrus_publication_in_progress");
      expect(storeB.endWalrusPublication({
        workspaceId: "ws_alpha",
        fileId: created.id,
        claimId: replacement.claimId,
        now: replacementNow,
      })).toBe(true);

      first.bytes.fill(0);
      replacement.bytes.fill(0);
      await storeA.delete({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: replacementNow,
      });
      expect(storeA.get({ workspaceId: "ws_alpha", ownerId: "owner_alpha", fileId: created.id })).toBeNull();

      const deleting = await storeA.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest({ name: "deleting.md", expiresAt: null }),
        bytes: encoder.encode("Deletion owns the external-operation boundary."),
        now: new Date("2026-09-02T00:07:00.000Z"),
      });
      let unblockDestruction!: () => void;
      let destructionStarted!: () => void;
      const destructionGate = new Promise<void>((resolve) => { unblockDestruction = resolve; });
      const started = new Promise<void>((resolve) => { destructionStarted = resolve; });
      const destroyKey = keys.destroyKey.bind(keys);
      keys.destroyKey = async (input) => {
        destructionStarted();
        await destructionGate;
        await destroyKey(input);
      };
      const deletePromise = storeA.delete({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: deleting.id,
        expectedRevision: deleting.revision,
        now: new Date("2026-09-02T00:08:00.000Z"),
      });
      await started;
      expect(() => storeB.beginWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: deleting.id,
        expectedRevision: deleting.revision,
        now: new Date("2026-09-02T00:08:00.000Z"),
      })).toThrow("agent_file_operation_in_progress");
      unblockDestruction();
      await deletePromise;
      expect(storeB.get({ workspaceId: "ws_alpha", ownerId: "owner_alpha", fileId: deleting.id })).toBeNull();
    } finally {
      stateB.close();
      stateA.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rolls back a Walrus renewal if its single-use claim cannot be consumed", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-file-renewal-atomic-"));
    const state = new FailingClaimDeleteStateStore(join(root, "state.db"));
    const keys = new TestKeyManager();
    const store = new MatterhornAgentFileStore(state, keys, null, testDurableStateAuthority());
    try {
      const created = await store.create({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        request: uploadRequest({ expiresAt: null }),
        bytes: encoder.encode("Atomic encrypted cloud renewal."),
        now: new Date("2026-09-02T00:00:00.000Z"),
      });
      const publicationCandidate = store.beginWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        now: new Date("2026-09-02T00:01:00.000Z"),
      });
      const published = store.attachWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: created.id,
        expectedRevision: created.revision,
        claimId: publicationCandidate.claimId,
        publication: {
          version: "matterhorn.agent-file-walrus-publication.v1",
          network: "testnet",
          blobId: "atomic-renewal-blob",
          suiObjectId: "0x1234",
          ciphertextSha256: publicationCandidate.ciphertextSha256,
          certifiedEpoch: 10,
          validUntilEpoch: 15,
          suiTransactionDigest: null,
          publishedAt: "2026-09-02T00:01:00.000Z",
          verifiedAt: "2026-09-02T00:01:00.000Z",
        },
        now: new Date("2026-09-02T00:01:00.000Z"),
      });
      publicationCandidate.bytes.fill(0);
      const renewalCandidate = store.beginWalrusRenewal({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: published.id,
        expectedRevision: published.revision,
        now: new Date("2026-09-02T00:02:00.000Z"),
      });
      const renewal = {
        ...published.publication!,
        validUntilEpoch: 20,
        renewalTransactionDigest: "renewal-digest",
        renewedAt: "2026-09-02T00:02:00.000Z",
        verifiedAt: "2026-09-02T00:02:00.000Z",
      };

      state.failNextOperationClaimDelete = true;
      expect(() => store.renewWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: published.id,
        expectedRevision: published.revision,
        expectedBlobId: published.publication!.blobId,
        expectedSuiObjectId: published.publication!.suiObjectId,
        expectedCiphertextSha256: published.publication!.ciphertextSha256,
        expectedPreviousValidUntilEpoch: published.publication!.validUntilEpoch,
        claimId: renewalCandidate.claimId,
        publication: renewal,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).toThrow("agent_file_walrus_renewal_claim_invalid");

      expect(store.get({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: published.id,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).toEqual(published);
      expect(store.hasWalrusRenewalClaim({
        workspaceId: "ws_alpha",
        fileId: published.id,
        expectedRevision: published.revision,
        claimId: renewalCandidate.claimId,
        now: new Date("2026-09-02T00:02:00.000Z"),
      })).toBe(true);

      const renewed = store.renewWalrusPublication({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        fileId: published.id,
        expectedRevision: published.revision,
        expectedBlobId: published.publication!.blobId,
        expectedSuiObjectId: published.publication!.suiObjectId,
        expectedCiphertextSha256: published.publication!.ciphertextSha256,
        expectedPreviousValidUntilEpoch: published.publication!.validUntilEpoch,
        claimId: renewalCandidate.claimId,
        publication: renewal,
        now: new Date("2026-09-02T00:02:00.000Z"),
      });
      expect(renewed).toMatchObject({ revision: published.revision + 1, publication: renewal });
      renewalCandidate.bytes.fill(0);
    } finally {
      state.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
