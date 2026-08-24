import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

describe("durable guarded runtime state", () => {
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
});
