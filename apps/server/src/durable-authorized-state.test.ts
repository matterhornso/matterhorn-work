import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import { testDurableStateAuthority } from "./durable-state-authority.test-support.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(secret?: string) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-authorized-state-"));
  roots.push(root);
  const store = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
  const authority = testDurableStateAuthority(secret);
  const state = new MatterhornDurableAuthorizedState(
    store,
    authority,
    "crypto_evidence_renewal_intent",
    "test_intent_integrity_invalid",
  );
  return { store, authority, state };
}

describe("durable authorized state", () => {
  test("round-trips and atomically consumes an exact authenticated row", () => {
    const value = fixture();
    try {
      expect(value.state.putIfAbsent({
        key: "evidence_1",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 1 },
        expiresAtMs: 2_000,
        nowMs: 1_000,
      })).toBe(true);
      expect(value.state.get<{ ownerId: string; revision: number }>("evidence_1", 1_500))
        .toEqual({ ownerId: "owner_a", revision: 1 });
      expect(value.state.getRecord<{ ownerId: string; revision: number }>("evidence_1", 1_500))
        .toEqual(expect.objectContaining({
          kind: "crypto_evidence_renewal_intent",
          key: "evidence_1",
          workspaceId: "workspace_a",
          value: { ownerId: "owner_a", revision: 1 },
        }));
      expect(value.state.takeRecord<{ ownerId: string; revision: number }>("evidence_1", 1_500))
        .toEqual(expect.objectContaining({ value: { ownerId: "owner_a", revision: 1 } }));
      expect(value.state.take("evidence_1", 1_500)).toBeNull();
    } finally {
      value.authority.close();
      value.store.close();
    }
  });

  test("authenticates replacement writes and every listed row", () => {
    const value = fixture();
    try {
      value.state.put({
        key: "evidence_1",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 1 },
        expiresAtMs: 2_000,
        nowMs: 1_000,
      });
      value.state.put({
        key: "evidence_1",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 2 },
        expiresAtMs: 2_500,
        nowMs: 1_500,
      });
      value.state.put({
        key: "evidence_2",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 1 },
        expiresAtMs: 2_500,
        nowMs: 1_500,
      });
      expect(value.state.list<{ ownerId: string; revision: number }>({
        workspaceId: "workspace_a",
        nowMs: 2_000,
      })).toEqual([
        { ownerId: "owner_a", revision: 2 },
        { ownerId: "owner_a", revision: 1 },
      ]);
      expect(value.state.listRecords<{ ownerId: string; revision: number }>({
        workspaceId: "workspace_a",
        nowMs: 2_000,
      }).map((record) => [record.key, record.value.revision])).toEqual([
        ["evidence_1", 2],
        ["evidence_2", 1],
      ]);

      value.store.put({
        kind: "crypto_evidence_renewal_intent",
        key: "legacy",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 1 },
        expiresAtMs: 2_500,
        nowMs: 1_500,
      });
      expect(() => value.state.list({ workspaceId: "workspace_a", nowMs: 2_000 }))
        .toThrow("test_intent_integrity_invalid");
    } finally {
      value.authority.close();
      value.store.close();
    }
  });

  test("rejects raw legacy state, tenant transplantation, row mutation, and a wrong key", () => {
    const value = fixture();
    try {
      value.store.put({
        kind: "crypto_evidence_renewal_intent",
        key: "legacy",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a" },
        expiresAtMs: 2_000,
        nowMs: 1_000,
      });
      expect(() => value.state.get("legacy", 1_500)).toThrow("test_intent_integrity_invalid");

      expect(value.state.putIfAbsent({
        key: "sealed",
        workspaceId: "workspace_a",
        value: { ownerId: "owner_a", revision: 1 },
        expiresAtMs: 2_000,
        nowMs: 1_000,
      })).toBe(true);
      const sealed = value.store.getRecord<unknown>("crypto_evidence_renewal_intent", "sealed", 1_500)!;
      value.store.put({
        kind: sealed.kind,
        key: sealed.key,
        workspaceId: "workspace_b",
        sessionId: sealed.sessionId,
        value: sealed.value,
        expiresAtMs: sealed.expiresAtMs,
        nowMs: sealed.updatedAtMs,
      });
      expect(() => value.state.get("sealed", 1_500)).toThrow("test_intent_integrity_invalid");

      value.store.put({
        kind: sealed.kind,
        key: sealed.key,
        workspaceId: sealed.workspaceId,
        sessionId: sealed.sessionId,
        value: { corrupted: true },
        expiresAtMs: sealed.expiresAtMs,
        nowMs: sealed.updatedAtMs,
      });
      expect(() => value.state.get("sealed", 1_500)).toThrow("test_intent_integrity_invalid");

      value.store.put({
        kind: sealed.kind,
        key: sealed.key,
        workspaceId: sealed.workspaceId,
        sessionId: sealed.sessionId,
        value: sealed.value,
        expiresAtMs: sealed.expiresAtMs,
        nowMs: sealed.updatedAtMs,
      });
      const wrongAuthority = testDurableStateAuthority("wrong-authority-key-that-is-at-least-thirty-two-bytes");
      try {
        const wrong = new MatterhornDurableAuthorizedState(
          value.store,
          wrongAuthority,
          "crypto_evidence_renewal_intent",
          "test_intent_integrity_invalid",
        );
        expect(() => wrong.get("sealed", 1_500)).toThrow("test_intent_integrity_invalid");
      } finally {
        wrongAuthority.close();
      }
    } finally {
      value.authority.close();
      value.store.close();
    }
  });
});
