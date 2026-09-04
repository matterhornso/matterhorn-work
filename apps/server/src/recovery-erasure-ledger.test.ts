import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  MatterhornAgentFileStore,
  type MatterhornAgentFileRecord,
} from "./agent-file-store.js";
import {
  MatterhornCryptoEvidenceStore,
  type MatterhornCryptoEvidenceRecord,
} from "./crypto-evidence-store.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import {
  MatterhornRecoveryErasureLedger,
  MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION,
} from "./recovery-erasure-ledger.js";

const SECRET = "test-only-erasure-ledger-secret-with-32-bytes";

function evidenceRecord(input: {
  id: string;
  workspaceId: string;
  ownerId: string;
  wrappedKey: string;
  keyContext: string;
}): MatterhornCryptoEvidenceRecord {
  return {
    version: "matterhorn.crypto-evidence-record.v1",
    id: input.id,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    runId: `run_${input.id}`,
    coworkerId: "risk_monitor",
    revision: 1,
    state: "sealed",
    envelope: {
      version: "matterhorn.encrypted-evidence-envelope.v1",
      algorithm: "aes-256-gcm",
      iv: "placeholder",
      authenticationTag: "placeholder",
      ciphertext: "placeholder",
      payloadHash: "9".repeat(64),
      ciphertextHash: "a".repeat(64),
      merkleLeaf: "b".repeat(64),
      keyReference: "kms-key",
    },
    key: {
      keyReference: "kms-key",
      keyReferenceHash: "c".repeat(64),
      wrappedKey: input.wrappedKey,
      keyContext: input.keyContext,
      recipientKeyIds: ["recipient"],
    },
    index: {
      evidenceId: input.id,
      workspaceIdHash: "d".repeat(64),
      runIdHash: "e".repeat(64),
      coworkerIdHash: "f".repeat(64),
      ciphertextHash: "a".repeat(64),
      merkleLeaf: "b".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      deletable: true,
    },
    walrusProof: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function agentFileRecord(input: {
  id: string;
  workspaceId: string;
  ownerId: string;
  wrappedKey: string;
  keyContext: string;
}): MatterhornAgentFileRecord {
  return {
    version: "matterhorn.stored-agent-file.v1",
    id: input.id,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    revision: 1,
    file: {
      version: "matterhorn.agent-file.v1",
      name: "private.md",
      kind: "text",
      mimeType: "text/markdown",
      sizeBytes: 7,
      contentSha256: "1".repeat(64),
      dataLabel: "workspace_private",
      access: { coworkerIds: ["risk_monitor"], readOnly: true },
      retention: { expiresAt: null, deletable: true },
      security: { scan: "passed", walletAuthority: "none", executable: false },
    },
    publication: null,
    envelope: {
      version: "matterhorn.agent-file-envelope.v1",
      algorithm: "aes-256-gcm",
      iv: "placeholder",
      authenticationTag: "placeholder",
      ciphertext: "placeholder",
      ciphertextSha256: "2".repeat(64),
    },
    key: {
      keyReference: "kms-key",
      wrappedKey: input.wrappedKey,
      keyContext: input.keyContext,
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function withLedger(run: (input: {
  root: string;
  state: MatterhornGuardedRuntimeStateStore;
  ledger: MatterhornRecoveryErasureLedger;
  ledgerPath: string;
}) => void): void {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-erasure-ledger-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(root, "guarded-runtime", "state.db"));
  const ledgerPath = join(root, "outside-rollback", "ledger.db");
  const ledger = new MatterhornRecoveryErasureLedger({ path: ledgerPath, signingSecret: SECRET });
  try {
    run({ root, state, ledger, ledgerPath });
  } finally {
    ledger.close();
    state.close();
    rmSync(root, { recursive: true, force: true });
  }
}

describe("recovery erasure ledger", () => {
  test("reconciles stale Evidence and Agent File recovery material without tenant identifiers", () => {
    withLedger(({ state, ledger, ledgerPath }) => {
      const evidence = evidenceRecord({
        id: "evidence_private_alpha",
        workspaceId: "workspace-private-alpha",
        ownerId: "owner-private-alpha",
        wrappedKey: "wrapped-evidence-alpha",
        keyContext: "context-evidence-alpha",
      });
      const file = agentFileRecord({
        id: "agent_file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workspaceId: "workspace-private-alpha",
        ownerId: "owner-private-alpha",
        wrappedKey: "wrapped-agent-file-alpha",
        keyContext: "context-agent-file-alpha",
      });
      const unaffected = evidenceRecord({
        id: "evidence_private_beta",
        workspaceId: "workspace-private-beta",
        ownerId: "owner-private-beta",
        wrappedKey: "wrapped-evidence-beta",
        keyContext: "context-evidence-beta",
      });
      state.put({ kind: "crypto_evidence_record", key: evidence.id, workspaceId: evidence.workspaceId, value: evidence });
      state.put({ kind: "agent_file_record", key: file.id, workspaceId: file.workspaceId, value: file });
      state.put({ kind: "agent_file_renewal_intent", key: file.id, workspaceId: file.workspaceId, value: { secret: "pending" } });
      state.put({ kind: "crypto_evidence_record", key: unaffected.id, workspaceId: unaffected.workspaceId, value: unaffected });

      const destroyedAt = new Date("2026-09-05T12:00:00.000Z");
      const evidenceEvent = ledger.record({
        materialKind: "crypto_evidence",
        wrappedKey: evidence.key.wrappedKey!,
        keyContext: evidence.key.keyContext!,
        now: destroyedAt,
      });
      const fileEvent = ledger.record({
        materialKind: "agent_file",
        wrappedKey: file.key.wrappedKey,
        keyContext: file.key.keyContext,
        now: destroyedAt,
      });
      expect(evidenceEvent.created).toBe(true);
      expect(fileEvent.created).toBe(true);
      expect(evidenceEvent.event).toMatchObject({
        version: MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION,
        sequence: 1,
        materialKind: "crypto_evidence",
      });
      expect(JSON.stringify([evidenceEvent, fileEvent])).not.toContain("workspace-private");
      expect(JSON.stringify([evidenceEvent, fileEvent])).not.toContain("owner-private");
      expect(JSON.stringify([evidenceEvent, fileEvent])).not.toContain("wrapped-");

      const reconciled = ledger.reconcile(state);
      expect(reconciled).toMatchObject({
        checkedEvidence: 2,
        checkedAgentFiles: 1,
        evidenceKeysDestroyed: 1,
        agentFilesDeleted: 1,
        ledger: { count: 2 },
      });
      const erased = state.get<MatterhornCryptoEvidenceRecord>("crypto_evidence_record", evidence.id);
      expect(erased).toMatchObject({
        state: "key_destroyed",
        revision: 2,
        envelope: null,
        key: { keyReference: null, wrappedKey: null, keyContext: null, recipientKeyIds: [] },
        updatedAt: destroyedAt.toISOString(),
      });
      expect(state.get("agent_file_record", file.id)).toBeNull();
      expect(state.get("agent_file_renewal_intent", file.id)).toBeNull();
      expect(state.get<MatterhornCryptoEvidenceRecord>("crypto_evidence_record", unaffected.id)).toEqual(unaffected);
      expect(ledger.reconcile(state)).toMatchObject({ evidenceKeysDestroyed: 0, agentFilesDeleted: 0 });

      const ledgerBytes = readFileSync(ledgerPath);
      expect(ledgerBytes.includes(Buffer.from("workspace-private"))).toBe(false);
      expect(ledgerBytes.includes(Buffer.from("owner-private"))).toBe(false);
      expect(ledgerBytes.includes(Buffer.from("wrapped-evidence"))).toBe(false);
      expect(ledgerBytes.includes(Buffer.from(file.id))).toBe(false);
    });
  });

  test("is idempotent and binds erasure markers to one material class", () => {
    withLedger(({ ledger }) => {
      const input = { wrappedKey: "same-wrapped-key", keyContext: "same-context" };
      const first = ledger.record({ materialKind: "crypto_evidence", ...input });
      const replay = ledger.record({ materialKind: "crypto_evidence", ...input });
      const otherClass = ledger.record({ materialKind: "agent_file", ...input });
      expect(first.created).toBe(true);
      expect(replay.created).toBe(false);
      expect(replay.event).toEqual(first.event);
      expect(otherClass.created).toBe(true);
      expect(otherClass.event.materialTag).not.toBe(first.event.materialTag);
      expect(ledger.verify()).toMatchObject({ count: 2, headHash: otherClass.event.recordHash });
    });
  });

  test("blocks stale recovery material immediately before startup reconciliation", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-erasure-ledger-live-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
    const ledger = new MatterhornRecoveryErasureLedger({
      path: join(root, "ledger.db"),
      signingSecret: SECRET,
    });
    let decryptCalls = 0;
    const keys: MatterhornEvidenceKeyManager = {
      createDataKey: async () => { throw new Error("unused"); },
      decryptDataKey: async () => {
        decryptCalls += 1;
        return Buffer.alloc(32);
      },
      destroyKey: async () => undefined,
    };
    try {
      const evidence = evidenceRecord({
        id: "evidence_stale_live",
        workspaceId: "ws_live",
        ownerId: "owner_live",
        wrappedKey: "wrapped-live-evidence",
        keyContext: "context-live-evidence",
      });
      const file = agentFileRecord({
        id: "agent_file_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        workspaceId: "ws_live",
        ownerId: "owner_live",
        wrappedKey: "wrapped-live-file",
        keyContext: "context-live-file",
      });
      state.put({ kind: "crypto_evidence_record", key: evidence.id, workspaceId: evidence.workspaceId, value: evidence });
      state.put({ kind: "agent_file_record", key: file.id, workspaceId: file.workspaceId, value: file });
      ledger.record({
        materialKind: "crypto_evidence",
        wrappedKey: evidence.key.wrappedKey!,
        keyContext: evidence.key.keyContext!,
      });
      ledger.record({
        materialKind: "agent_file",
        wrappedKey: file.key.wrappedKey,
        keyContext: file.key.keyContext,
      });

      const evidenceStore = new MatterhornCryptoEvidenceStore(state, keys, {}, ledger);
      await expect(evidenceStore.decrypt({
        workspaceId: evidence.workspaceId,
        ownerId: evidence.ownerId,
        coworkerId: evidence.coworkerId,
        evidenceId: evidence.id,
      })).rejects.toThrow("crypto_evidence_key_destroyed");
      const fileStore = new MatterhornAgentFileStore(state, keys, ledger);
      expect(fileStore.list({ workspaceId: file.workspaceId, ownerId: file.ownerId })).toEqual([]);
      expect(fileStore.get({ workspaceId: file.workspaceId, ownerId: file.ownerId, fileId: file.id })).toBeNull();
      expect(decryptCalls).toBe(0);
    } finally {
      ledger.close();
      state.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails closed on a modified authenticated chain", () => {
    withLedger(({ ledger, ledgerPath }) => {
      ledger.record({
        materialKind: "crypto_evidence",
        wrappedKey: "wrapped-key",
        keyContext: "key-context",
      });
      const database = new Database(ledgerPath);
      database.prepare("UPDATE recovery_erasures SET signature = ? WHERE sequence = 1").run("0".repeat(64));
      database.close();
      expect(() => ledger.verify()).toThrow("recovery_erasure_ledger_corrupt");
    });
  });
});
