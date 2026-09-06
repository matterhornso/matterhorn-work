import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  MatterhornCryptoAppOperationalPolicyError,
  MatterhornCryptoAppOperationalPolicyStore,
} from "./crypto-app-operational-policy.js";

const INTEGRITY_SECRET = "operational-policy-test-integrity-secret-at-least-32-bytes";

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
      integritySecret: INTEGRITY_SECRET,
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

  test("records zero-cost public cache calls without consuming upstream cost quota", () => {
    let sequence = 0;
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      integritySecret: INTEGRITY_SECRET,
      dailyWorkspaceLimitMicros: 1_000,
      maxCallCostMicros: 1_000,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => `operational_${++sequence}`,
    });
    const upstream = store.reserve(reservation("call_upstream"));
    store.reconcile({ reservationId: upstream.reservationId, outcome: "success", actualCostMicros: 1_000 });

    const cached = store.reserve({
      ...reservation("call_cached"),
      reservationClass: "public_block_cache",
    });
    expect(cached.reservedCostMicros).toBe(0);
    expect(store.reconcile({
      reservationId: cached.reservationId,
      outcome: "success",
      actualCostMicros: 0,
    })).toEqual({ reservedCostMicros: 0, overCallLimit: false });
    expect(store.usage("ws_a")).toEqual({ actualCostMicros: 1_000, pendingReservedCostMicros: 0 });
    expect(store.developerUsage({
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      windowDays: 1,
    }).totals).toMatchObject({ calls: 2, succeeded: 2, actualCostMicros: 1_000 });
    expect(() => store.reconcile({
      reservationId: cached.reservationId,
      outcome: "success",
      actualCostMicros: 1,
    })).toThrow("crypto_app_operational_reservation_unavailable");
    store.close();
  });

  test("serializes quota reservations across store instances", () => {
    const databasePath = path();
    const options = {
      integritySecret: INTEGRITY_SECRET,
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
      integritySecret: INTEGRITY_SECRET,
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
      integritySecret: INTEGRITY_SECRET,
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
      integritySecret: INTEGRITY_SECRET,
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

  test("reports only bounded app-revision aggregates without tenant or request identifiers", () => {
    let nowMs = Date.parse("2026-09-01T12:00:00.000Z");
    let sequence = 0;
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date(nowMs),
      reservationTtlMs: 60_000,
      id: () => `operational_${++sequence}`,
    });
    const first = store.reserve({ ...reservation("call_a", "private_workspace_a"), actionId: "read_markets" });
    nowMs += 100;
    store.reconcile({ reservationId: first.reservationId, outcome: "success", actualCostMicros: 100 });
    const second = store.reserve({ ...reservation("call_b", "private_workspace_b"), actionId: "read_markets" });
    nowMs += 300;
    store.reconcile({ reservationId: second.reservationId, outcome: "error", actualCostMicros: 300 });
    const ignored = store.reserve({
      ...reservation("call_other", "private_workspace_a"),
      appId: "different.app",
    });
    store.reconcile({ reservationId: ignored.reservationId, outcome: "success", actualCostMicros: 900 });

    nowMs = Date.parse("2026-09-02T00:00:00.000Z");
    store.reserve({ ...reservation("call_abandoned", "private_workspace_c"), actionId: "prepare_transfer" });
    nowMs += 60_001;
    store.reserve({ ...reservation("call_pending", "private_workspace_d"), actionId: "prepare_transfer" });

    const report = store.developerUsage({
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      windowDays: 2,
    });
    expect(report).toMatchObject({
      version: "matterhorn.crypto-app-developer-usage.v1",
      costUnit: "micro_usd",
      fromDay: "2026-09-01",
      throughDay: "2026-09-02",
      budgetPolicy: {
        scope: "per_workspace",
        dailyToolCostLimitMicros: 10_000_000,
        perCallToolCostLimitMicros: 1_000_000,
        walletTransactionLimitsIncluded: false,
      },
      totals: {
        calls: 4,
        succeeded: 1,
        failed: 1,
        timedOut: 0,
        pending: 1,
        abandoned: 1,
        actualCostMicros: 400,
        pendingReservedCostMicros: 1_000_000,
        averageLatencyMs: 200,
        maximumLatencyMs: 300,
      },
      privacy: {
        aggregateOnly: true,
        tenantIdentifiersIncluded: false,
        requestContentIncluded: false,
        walletDataIncluded: false,
      },
    });
    expect(report.byDay).toHaveLength(2);
    expect(report.byAction).toEqual([
      expect.objectContaining({ actionId: "read_markets", calls: 2, succeeded: 1, failed: 1 }),
      expect.objectContaining({ actionId: "prepare_transfer", calls: 2, pending: 1, abandoned: 1 }),
    ]);
    expect(store.developerUsage({
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      windowDays: 1,
    }).totals.calls).toBe(2);
    expect(JSON.stringify(report)).not.toMatch(/private_workspace|connection|reservation|run_|call_/);
    expect(() => store.developerUsage({
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      windowDays: 31,
    })).toThrow("crypto_app_usage_window_invalid");
    store.close();
  });

  test("returns a zeroed usage report for an unused revision", () => {
    const store = new MatterhornCryptoAppOperationalPolicyStore(path(), {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(store.developerUsage({ appId: "unused.app", manifestRevision: "1", windowDays: 7 }))
      .toMatchObject({
        fromDay: "2026-08-27",
        throughDay: "2026-09-02",
        totals: { calls: 0, actualCostMicros: 0, averageLatencyMs: null },
        byDay: [],
        byAction: [],
      });
    store.close();
  });

  test("rejects invalid policy configuration before opening the database", () => {
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(path(), {
      integritySecret: INTEGRITY_SECRET,
      dailyWorkspaceLimitMicros: 0,
    })).toThrow(MatterhornCryptoAppOperationalPolicyError);
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(path()))
      .toThrow("crypto_app_operational_integrity_secret_invalid");
  });

  test("rejects restored quota and circuit authority mutation", () => {
    const usagePath = path();
    const usageStore = new MatterhornCryptoAppOperationalPolicyStore(usagePath, {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => "operational_tamper",
    });
    usageStore.reserve(reservation("call_tamper"));
    usageStore.close();
    const usageEditor = new Database(usagePath);
    usageEditor.query(`
      UPDATE crypto_app_usage_reservations SET reserved_cost_micros = 0
      WHERE reservation_id = 'operational_tamper'
    `).run();
    usageEditor.close();
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(usagePath, {
      integritySecret: INTEGRITY_SECRET,
    })).toThrow("crypto_app_policy_state_corrupt");

    const circuitPath = path();
    const circuitStore = new MatterhornCryptoAppOperationalPolicyStore(circuitPath, {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    circuitStore.recordFailure({ workspaceId: "ws_a", circuitKey: "test-circuit" });
    circuitStore.close();
    const circuitEditor = new Database(circuitPath);
    circuitEditor.query(`
      UPDATE crypto_app_circuits SET consecutive_failures = 99
      WHERE workspace_id = 'ws_a' AND circuit_key = 'test-circuit'
    `).run();
    circuitEditor.close();
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(circuitPath, {
      integritySecret: INTEGRITY_SECRET,
    })).toThrow("crypto_app_policy_state_corrupt");
  });

  test("rejects the wrong operational authority key after restart", () => {
    const databasePath = path();
    const first = new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    first.recordFailure({ workspaceId: "ws_a", circuitKey: "test-circuit" });
    first.close();
    expect(() => new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      integritySecret: "different-operational-integrity-secret-at-least-32-bytes",
    })).toThrow("crypto_app_policy_state_corrupt");
  });

  test("migrates structurally valid legacy operational rows exactly once", () => {
    const databasePath = path();
    const first = new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => "operational_legacy",
    });
    first.reserve(reservation("call_legacy"));
    first.recordFailure({ workspaceId: "ws_a", circuitKey: "legacy-circuit" });
    first.close();

    const legacy = new Database(databasePath);
    legacy.exec(`
      DROP TRIGGER crypto_app_usage_authority_seal_insert;
      DROP TRIGGER crypto_app_usage_authority_seal_update;
      DROP TRIGGER crypto_app_circuit_authority_seal_insert;
      DROP TRIGGER crypto_app_circuit_authority_seal_update;
      ALTER TABLE crypto_app_usage_reservations DROP COLUMN authority_seal;
      ALTER TABLE crypto_app_circuits DROP COLUMN authority_seal;
    `);
    legacy.close();

    const migrated = new MatterhornCryptoAppOperationalPolicyStore(databasePath, {
      integritySecret: INTEGRITY_SECRET,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    expect(migrated.usage("ws_a")).toEqual({
      actualCostMicros: 0,
      pendingReservedCostMicros: 1_000_000,
    });
    expect(migrated.circuitOpen({ workspaceId: "ws_a", circuitKey: "legacy-circuit" })).toBe(false);
    migrated.close();
  });
});
