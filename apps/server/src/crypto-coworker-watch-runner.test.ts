import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppResult } from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import { MatterhornCoworkerWatchRunner } from "./crypto-coworker-watch-runner.js";
import { MatterhornCoworkers, type MatterhornCoworkerCreateInput } from "./crypto-coworkers.js";

const roots: string[] = [];

function profileInput(): MatterhornCoworkerCreateInput {
  return {
    name: "Sui Watcher",
    role: "risk_monitor",
    mission: "Watch approved Sui evidence and alert without preparing or submitting transactions.",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read", "watch"],
    limits: {
      perActionUsd: 0,
      dailyUsd: 0,
      weeklyUsd: 0,
      maxSlippageBps: 0,
      maxLeverage: 1,
      minimumReserveUsd: 0,
      maxActiveWatches: 2,
      maxReadCallsPerRun: 1,
      maxPrepareCallsPerFamily: 0,
    },
    privacy: {
      allowedDataLabels: ["public", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
  };
}

function result(balance: string, now: Date): MatterhornCryptoAppResult {
  const completedAt = now.toISOString();
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: {
      id: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
    },
    action: { id: "sui_account_read", access: "read", network: "sui:testnet" },
    timing: { startedAt: completedAt, completedAt, durationMs: 20 },
    observation: {
      source: "Sui testnet gRPC",
      observedAt: completedAt,
      blockOrVersion: "123",
      ageMs: 0,
      freshnessMaxAgeMs: 30_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"a".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_sui" },
    result: { balanceAtomic: balance, observedAt: completedAt },
  };
}

function fixture(condition: {
  id: string;
  metric: string;
  operator: "changed";
  value: null;
} = { id: "balance_changed", metric: "balanceAtomic", operator: "changed", value: null }) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-watch-runner-"));
  roots.push(root);
  const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
  let now = new Date("2026-09-01T12:00:00.000Z");
  const coworkers = new MatterhornCoworkers({
    store,
    policyVersion: "coworker-policy-1",
    now: () => now,
    id: () => "cw_sui_watcher",
    watchId: () => "cwatch_sui_balance",
    inboxItemId: () => `cinbox_${now.getTime()}`,
  });
  const profile = coworkers.create("ws_alpha", "account_alpha", profileInput());
  coworkers.setResourceScope("ws_alpha", "account_alpha", profile.id, {
    expectedRevision: 0,
    profileRevision: profile.revision,
    agentFiles: [],
    memories: [],
    connections: [{
      id: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionIds: ["sui_account_read"],
      networks: ["sui:testnet"],
    }],
  });
  const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, {
    profileRevision: profile.revision,
    connectionId: "cxc_sui",
    name: "Sui balance",
    appId: "matterhorn.sui-testnet",
    actionId: "sui_account_read",
    network: "sui:testnet",
    parameters: { address: "0x1234" },
    schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
    budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
    conditions: [condition],
  });
  return {
    store,
    coworkers,
    profile,
    watch,
    now: () => now,
    advance: (value: string) => { now = new Date(value); },
  };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("crypto coworker watch runner", () => {
  test("claims once, establishes a baseline, then alerts only when a typed metric changes", async () => {
    const setup = fixture();
    let balance = "10";
    const runner = new MatterhornCoworkerWatchRunner({
      coworkers: setup.coworkers,
      now: setup.now,
      execute: async () => result(balance, setup.now()),
    });
    try {
      setup.advance("2026-09-01T12:05:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 1, alerted: 0, failed: 0 });
      expect(await runner.tick()).toEqual({ claimed: 0, completed: 0, alerted: 0, failed: 0 });
      expect(setup.coworkers.listInbox({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        coworkerId: setup.profile.id,
      })).toEqual([]);

      balance = "11";
      setup.advance("2026-09-01T12:10:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 1, alerted: 1, failed: 0 });
      expect(setup.coworkers.listInbox({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        coworkerId: setup.profile.id,
      })[0]).toMatchObject({
        kind: "alert",
        reasonCodes: ["balance_changed"],
        budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 0 },
      });
      expect(setup.coworkers.getWatch("ws_alpha", "account_alpha", setup.profile.id, setup.watch.id)?.schedule)
        .toMatchObject({ checksToday: 2, lastConditionValues: { balance_changed: "11" } });
    } finally {
      setup.store.close();
    }
  });

  test("ignores observation timestamps when watching for any typed result change", async () => {
    const setup = fixture({
      id: "result_changed",
      metric: "matterhorn_result_hash",
      operator: "changed",
      value: null,
    });
    let balance = "10";
    const runner = new MatterhornCoworkerWatchRunner({
      coworkers: setup.coworkers,
      now: setup.now,
      execute: async () => result(balance, setup.now()),
    });
    try {
      setup.advance("2026-09-01T12:05:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 1, alerted: 0, failed: 0 });
      setup.advance("2026-09-01T12:10:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 1, alerted: 0, failed: 0 });
      balance = "11";
      setup.advance("2026-09-01T12:15:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 1, alerted: 1, failed: 0 });
      expect(setup.coworkers.listInbox({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        coworkerId: setup.profile.id,
      })[0]?.reasonCodes).toEqual(["result_changed"]);
    } finally {
      setup.store.close();
    }
  });

  test("drops a late result when the coworker is paused during execution", async () => {
    const setup = fixture();
    const runner = new MatterhornCoworkerWatchRunner({
      coworkers: setup.coworkers,
      now: setup.now,
      execute: async () => {
        setup.coworkers.transition(
          "ws_alpha",
          "account_alpha",
          setup.profile.id,
          "paused",
          setup.profile.revision,
        );
        return result("10", setup.now());
      },
    });
    try {
      setup.advance("2026-09-01T12:05:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 0, alerted: 0, failed: 0 });
      expect(setup.coworkers.listInbox({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        coworkerId: setup.profile.id,
      })).toEqual([]);
      expect(setup.coworkers.getWatch("ws_alpha", "account_alpha", setup.profile.id, setup.watch.id))
        .toMatchObject({ state: "paused", pauseReason: "coworker_paused" });
    } finally {
      setup.store.close();
    }
  });

  test("turns an opaque executor failure into a bounded notice without leaking its message", async () => {
    const setup = fixture();
    const runner = new MatterhornCoworkerWatchRunner({
      coworkers: setup.coworkers,
      now: setup.now,
      execute: async () => { throw new Error("private key leaked by upstream"); },
    });
    try {
      setup.advance("2026-09-01T12:05:00.000Z");
      expect(await runner.tick()).toEqual({ claimed: 1, completed: 0, alerted: 0, failed: 1 });
      const item = setup.coworkers.listInbox({
        workspaceId: "ws_alpha",
        ownerId: "account_alpha",
        coworkerId: setup.profile.id,
      })[0];
      expect(item).toMatchObject({ kind: "notice", reasonCodes: ["watch_execution_failed"] });
      expect(JSON.stringify(item)).not.toContain("private key leaked by upstream");
    } finally {
      setup.store.close();
    }
  });
});
