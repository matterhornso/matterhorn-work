import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  MatterhornCryptoAppOperationalPolicyError,
  MatterhornCryptoAppOperationalPolicyStore,
} from "./crypto-app-operational-policy.js";

function reservation(callId: string, workspaceId = "ws_a") {
  return {
    workspaceId,
    connectionId: "cxc_sui",
    appId: "matterhorn.sui-testnet",
    manifestRevision: "1.0.0",
    actionId: "sui_transfer_preview",
    runId: `run_${callId}`,
    callId,
  };
}

function path(): string {
  return join(mkdtempSync(join(tmpdir(), "matterhorn-crypto-app-policy-")), "operational.db");
}

describe("durable crypto app operational policy", () => {
  test("atomically reserves daily quota and reconciles actual cost", () => {
    let sequence = 0;
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      dailyWorkspaceLimitMicros: 2_000,
      maxCallCostMicros: 1_000,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => `operational_${++sequence}`,
    });
    const first = store.reserve(reservation("call_1"));
    const second = store.reserve(reservation("call_2"));
    expect(store.usage("ws_a")).toEqual({ actualCostMicros: 0, pendingReservedCostMicros: 2_000 });
    expect(() => store.reserve(reservation("call_3"))).toThrow("crypto_app_daily_quota_exceeded");
    expect(store.reconcile({
      reservationId: first.reservationId,
      outcome: "success",
      actualCostMicros: 100,
    })).toEqual({ reservedCostMicros: 1_000, overCallLimit: false });
    expect(() => store.reserve(reservation("call_3"))).toThrow("crypto_app_daily_quota_exceeded");
    store.reconcile({ reservationId: second.reservationId, outcome: "error", actualCostMicros: 100 });
    const third = store.reserve(reservation("call_3"));
    expect(store.usage("ws_a")).toEqual({ actualCostMicros: 200, pendingReservedCostMicros: 1_000 });
    expect(store.reconcile({
      reservationId: third.reservationId,
      outcome: "success",
      actualCostMicros: 1_001,
    })).toEqual({ reservedCostMicros: 1_000, overCallLimit: true });
    expect(() => store.reconcile({
      reservationId: third.reservationId,
      outcome: "success",
      actualCostMicros: 1_001,
    })).toThrow("crypto_app_operational_reservation_unavailable");
    expect(() => store.reserve(reservation("call_1"))).toThrow("crypto_app_operational_replay");
    store.close();
  });

  test("serializes quota reservations across store instances", () => {
    const databasePath = path();
    const options = {
      dailyWorkspaceLimitMicros: 1_000,
      maxCallCostMicros: 1_000,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    };
    const first = new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      ...options,
      id: () => "operational_a",
    });
    const second = new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      ...options,
      id: () => "operational_b",
    });
    first.reserve(reservation("call_a"));
    expect(() => second.reserve(reservation("call_b"))).toThrow("crypto_app_daily_quota_exceeded");
    first.close();
    second.close();
  });

  test("expires abandoned reservations without reusing their call identity", () => {
    let nowMs = Date.parse("2026-09-01T12:00:00.000Z");
    let sequence = 0;
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      dailyWorkspaceLimitMicros: 1_000,
      maxCallCostMicros: 1_000,
      reservationTtlMs: 1_000,
      now: () => new Date(nowMs),
      id: () => `operational_${++sequence}`,
    });
    store.reserve(reservation("call_abandoned"));
    nowMs += 1_001;
    store.reserve(reservation("call_new"));
    expect(store.usage("ws_a")).toEqual({ actualCostMicros: 0, pendingReservedCostMicros: 1_000 });
    expect(() => store.reserve(reservation("call_abandoned"))).toThrow("crypto_app_operational_replay");
    store.close();
  });

  test("persists tenant-scoped circuit state across restarts and clears after cooldown", () => {
    const databasePath = path();
    let nowMs = Date.parse("2026-09-01T12:00:00.000Z");
    const options = {
      circuitFailureThreshold: 2,
      circuitCooldownMs: 5_000,
      now: () => new Date(nowMs),
    };
    const first = new MatterhornCryptoAppOperationalPolicyStore(databasePath, options);
    first.recordFailure({ workspaceId: "ws_a", circuitKey: "sui-preview" });
    expect(first.circuitOpen({ workspaceId: "ws_a", circuitKey: "sui-preview" })).toBe(false);
    first.close();

    const second = new MatterhornCryptoAppOperationalPolicyStore(databasePath, options);
    second.recordFailure({ workspaceId: "ws_a", circuitKey: "sui-preview" });
    expect(second.circuitOpen({ workspaceId: "ws_a", circuitKey: "sui-preview" })).toBe(true);
    expect(second.circuitOpen({ workspaceId: "ws_b", circuitKey: "sui-preview" })).toBe(false);
    nowMs += 5_001;
    expect(second.circuitOpen({ workspaceId: "ws_a", circuitKey: "sui-preview" })).toBe(false);
    second.recordFailure({ workspaceId: "ws_a", circuitKey: "sui-preview" });
    second.recordSuccess({ workspaceId: "ws_a", circuitKey: "sui-preview" });
    expect(second.circuitOpen({ workspaceId: "ws_a", circuitKey: "sui-preview" })).toBe(false);
    second.close();
  });

  test("purges usage and circuits for only the selected workspace", () => {
    let sequence = 0;
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => `operational_${++sequence}`,
    });
    store.reserve(reservation("call_a", "ws_a"));
    store.reserve(reservation("call_b", "ws_b"));
    store.recordFailure({ workspaceId: "ws_a", circuitKey: "circuit_a" });
    store.recordFailure({ workspaceId: "ws_b", circuitKey: "circuit_b" });
    expect(store.purgeWorkspace("ws_a")).toEqual({ usage: 1, circuits: 1 });
    expect(store.usage("ws_a")).toEqual({ actualCostMicros: 0, pendingReservedCostMicros: 0 });
    expect(store.usage("ws_b")).toEqual({ actualCostMicros: 0, pendingReservedCostMicros: 1_000_000 });
    expect(store.circuitOpen({ workspaceId: "ws_b", circuitKey: "circuit_b" })).toBe(false);
    store.close();
  });

  test("rejects invalid policy configuration before opening the database", () => {
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(path(), {
      dailyWorkspaceLimitMicros: 0,
    })).toThrow(MatterhornCryptoAppOperationalPolicyError);
  });
});
