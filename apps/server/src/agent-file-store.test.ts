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
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

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
  }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-agent-files-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
  const keys = new TestKeyManager();
  try {
    await run({ store: new MatterhornAgentFileStore(state, keys), state, keys });
  } finally {
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

      const persisted = state.get<MatterhornAgentFileRecord>("agent_file_record", created.id);
      if (!persisted) throw new Error("test record missing");
      const replacement = persisted.envelope.ciphertext[0] === "A" ? "B" : "A";
      const tampered: MatterhornAgentFileRecord = {
        ...persisted,
        envelope: {
          ...persisted.envelope,
          ciphertext: `${replacement}${persisted.envelope.ciphertext.slice(1)}`,
        },
      };
      state.put({ kind: "agent_file_record", key: tampered.id, workspaceId: tampered.workspaceId, value: tampered });
      await expect(store.readContext({
        workspaceId: "ws_alpha",
        ownerId: "owner_alpha",
        coworkerId: "risk_monitor",
        fileId: created.id,
        now: new Date("2026-09-02T00:00:00.000Z"),
      })).rejects.toMatchObject({ code: "agent_file_envelope_invalid" });
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
});
