import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type {
  MatterhornCryptoAppConnectionView,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppRuntimeServices } from "./crypto-app-runtime.js";
import { createGuardedCoworkerWatchExecutor } from "./crypto-coworker-guarded-watch-executor.js";
import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import { MatterhornCoworkers } from "./crypto-coworkers.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function connection(): MatterhornCryptoAppConnectionView {
  return {
    version: "matterhorn.crypto-app-connection.v1",
    id: "cxc_sui",
    workspaceId: "ws_alpha",
    appId: "matterhorn.sui-testnet",
    manifestRevision: "1.0.0",
    state: "active",
    grantedActionIds: ["sui_account_read"],
    grantedScopes: [],
    grantedNetworks: ["sui:testnet"],
    credential: { type: "none", connected: true },
    availability: "available",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  };
}

function result(): MatterhornCryptoAppResult {
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.sui-testnet", manifestRevision: "1.0.0", connectionId: "cxc_sui" },
    action: { id: "sui_account_read", access: "read", network: "sui:testnet" },
    timing: {
      startedAt: "2026-09-01T12:05:00.000Z",
      completedAt: "2026-09-01T12:05:00.020Z",
      durationMs: 20,
    },
    observation: {
      source: "Sui testnet gRPC",
      observedAt: "2026-09-01T12:05:00.000Z",
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
    result: { balanceAtomic: "10" },
  };
}

describe("guarded coworker watch executor", () => {
  test("binds one certified Sui read to one model-free guarded run", async () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-watch-executor-"));
    roots.push(root);
    const store = new MatterhornCoworkerStore(join(root, "coworkers.db"));
    const coworkers = new MatterhornCoworkers({
      store,
      policyVersion: "coworker-policy-1",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      id: () => "cw_sui",
      watchId: () => "cwatch_sui",
    });
    const profile = coworkers.create("ws_alpha", "account_alpha", {
      name: "Sui Watcher",
      role: "risk_monitor",
      mission: "Watch approved Sui evidence without preparing or submitting transactions.",
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
        maxActiveWatches: 1,
        maxReadCallsPerRun: 1,
        maxPrepareCallsPerFamily: 0,
      },
      privacy: { allowedDataLabels: ["public", "untrusted_external"], allowUnverifiedProviderConsent: false },
    });
    const watch = coworkers.createWatch("ws_alpha", "account_alpha", profile.id, {
      profileRevision: profile.revision,
      name: "Sui balance",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      network: "sui:testnet",
      parameters: { address: "0x1234" },
      schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
      budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
      conditions: [{ id: "balance_changed", metric: "balanceAtomic", operator: "changed", value: null }],
    });

    const started: unknown[] = [];
    const completed: unknown[] = [];
    const routed: unknown[] = [];
    const guardedRuntime = {
      capabilities: { mode: "enforce" },
      ready: () => true,
      startDeterministicCoworkerRun: async (input: unknown) => {
        started.push(input);
        return { runId: "run_watch_sui" };
      },
      completeRun: async (input: unknown) => {
        completed.push(input);
      },
    } as unknown as MatterhornGuardedAgentRuntime;
    const cryptoApps = {
      mode: "enforce",
      ready: true,
      catalog: { listConnections: () => [connection()] },
      operator: null,
      router: {
        execute: async (input: unknown) => {
          routed.push(input);
          return result();
        },
      },
      purgeWorkspace: () => ({ connections: 0, usage: 0, circuits: 0 }),
      close: () => undefined,
    } as unknown as MatterhornCryptoAppRuntimeServices;

    try {
      const execute = createGuardedCoworkerWatchExecutor({
        coworkers,
        cryptoApps,
        guardedRuntime,
        runtimeSecret: () => "runtime-secret",
        id: () => "nonce",
      });
      expect(await execute(watch)).toEqual(result());
      expect(started).toEqual([expect.objectContaining({
        workspaceId: "ws_alpha",
        sessionId: "cw_watch_cwatch_sui_nonce",
        maxReadCalls: 1,
        requestToolProfiles: [{ "*": false, matterhorn_sui_get_balance: true }],
        coworker: expect.objectContaining({
          automaticAuthorities: ["read"],
          maxReadCallsPerRun: 1,
          maxPrepareCallsPerFamily: 0,
          actionBindings: [{
            appId: "matterhorn.sui-testnet",
            actionId: "sui_account_read",
            proxyToolName: "matterhorn_sui_get_balance",
            access: "read",
          }],
        }),
      })]);
      expect(routed).toEqual([{
        workspaceId: "ws_alpha",
        sessionId: "cw_watch_cwatch_sui_nonce",
        runId: "run_watch_sui",
        callId: "cw_call_nonce",
        connectionId: "cxc_sui",
        actionId: "sui_account_read",
        network: "sui:testnet",
        arguments: { address: "0x1234" },
      }]);
      expect(completed).toEqual([expect.objectContaining({
        runtimeSecret: "runtime-secret",
        runId: "run_watch_sui",
        status: "success",
        usage: expect.objectContaining({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
      })]);
    } finally {
      store.close();
    }
  });
});
