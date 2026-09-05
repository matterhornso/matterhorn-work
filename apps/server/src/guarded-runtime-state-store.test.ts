import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

describe("durable guarded runtime state", () => {
  test("commits or rolls back multi-record security mutations atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-guarded-transaction-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
    state.transaction(() => {
      state.put({ kind: "crypto_evidence_record", key: "kept", workspaceId: "ws_a", value: { state: "kept" } });
    });
    expect(state.get<{ state: string }>("crypto_evidence_record", "kept")).toEqual({ state: "kept" });
    expect(() => state.transaction(() => {
      state.put({ kind: "crypto_evidence_record", key: "rolled_back", workspaceId: "ws_a", value: { state: "bad" } });
      throw new Error("stop");
    })).toThrow("stop");
    expect(state.get("crypto_evidence_record", "rolled_back")).toBeNull();
    expect(() => state.transaction(() => Promise.resolve("unsafe")))
      .toThrow("guarded_runtime_async_transaction_forbidden");
    state.close();
  });

  test("persists tenant-scoped state across store restarts", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-guarded-state-"));
    const path = join(root, "state.db");
    const first = new MatterhornGuardedRuntimeStateStore(path);
    first.put({
      kind: "privacy_challenge",
      key: "challenge_1",
      workspaceId: "ws_a",
      sessionId: "ses_a",
      value: { requestHash: "hash_a" },
      expiresAtMs: Date.now() + 60_000,
    });
    first.close();

    const second = new MatterhornGuardedRuntimeStateStore(path);
    expect(second.get<{ requestHash: string }>("privacy_challenge", "challenge_1")).toEqual({ requestHash: "hash_a" });
    expect(second.list("privacy_challenge", { workspaceId: "ws_b" })).toEqual([]);
    second.close();
  });

  test("atomically rejects capability replay across store instances", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-guarded-replay-"));
    const path = join(root, "state.db");
    const first = new MatterhornGuardedRuntimeStateStore(path);
    const second = new MatterhornGuardedRuntimeStateStore(path);
    const input = {
      jti: "cap_1",
      runId: "run_1",
      callId: "call_1",
      workspaceId: "ws_a",
      sessionId: "ses_a",
      claims: { jti: "cap_1" },
      consumedAtMs: Date.now(),
      expiresAtMs: Date.now() + 60_000,
    };
    expect(first.consumeCapability(input)).toBe(true);
    expect(second.consumeCapability(input)).toBe(false);
    first.close();
    second.close();
  });

  test("permits only one consumed capability per guarded run call", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-guarded-call-replay-"));
    const path = join(root, "state.db");
    const state = new MatterhornGuardedRuntimeStateStore(path);
    const base = {
      runId: "run_1",
      callId: "call_1",
      workspaceId: "ws_a",
      sessionId: "ses_a",
      consumedAtMs: Date.now(),
      expiresAtMs: Date.now() + 60_000,
    };
    expect(state.consumeCapability({ ...base, jti: "cap_1", claims: { jti: "cap_1" } })).toBe(true);
    expect(state.consumeCapability({ ...base, jti: "cap_2", claims: { jti: "cap_2" } })).toBe(false);
    state.close();
  });
});
