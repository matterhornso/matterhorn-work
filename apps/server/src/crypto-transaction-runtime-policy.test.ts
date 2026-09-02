import { describe, expect, test } from "bun:test";

import type {
  MatterhornCryptoAppResult,
  MatterhornCryptoIntent,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornWalletSafetyPolicy } from "@matterhorn-work/types/wallet-safety-policy";

import type { MatterhornPendingCryptoIntent } from "./crypto-pending-intent-store.js";
import {
  buildMatterhornRuntimeTransactionPolicyLayers,
  resolveMatterhornRuntimeTransactionFacts,
} from "./crypto-transaction-runtime-policy.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");

function walletPolicy(): MatterhornWalletSafetyPolicy {
  return {
    version: "matterhorn.wallet.safety-policy.v1",
    maxPerTransactionUSD: 50,
    maxDailySpendUSD: 100,
    mainnetEnabled: false,
    maxSlippageBps: 100,
    preferredNetwork: 84532,
    updatedAt: "2026-09-01T11:00:00.000Z",
  };
}

function hyperliquidResult(overrides: Record<string, unknown> = {}): MatterhornCryptoAppResult {
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: {
      id: "matterhorn.hyperliquid-testnet",
      manifestRevision: "1.1.0",
      connectionId: "cxc_hyperliquid",
    },
    action: {
      id: "hyperliquid_preview_order",
      access: "prepare",
      network: "hyperliquid:testnet",
    },
    timing: {
      startedAt: "2026-09-01T11:59:59.900Z",
      completedAt: "2026-09-01T11:59:59.990Z",
      durationMs: 90,
    },
    observation: {
      source: "hyperliquid.testnet",
      observedAt: "2026-09-01T11:59:59.950Z",
      blockOrVersion: "sha256:test",
      ageMs: 40,
      freshnessMaxAgeMs: 5_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"a".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_hl" },
    result: {
      size: "0.01",
      limitPrice: "3000",
      notionalUsd: "30",
      accountValueUsd: "100",
      marginUsedUsd: "10",
      projectedReserveUsd: "60",
      effectiveLeverage: "2",
      reduceOnly: false,
      ...overrides,
    },
  };
}

function intent(app: "sui" | "hyperliquid" = "hyperliquid"): MatterhornCryptoIntent {
  const hyperliquid = app === "hyperliquid";
  return {
    version: "matterhorn.crypto-intent.v1",
    id: "cintent_test",
    intentHash: "a".repeat(64),
    runId: "run_policy",
    coworkerId: "cw_policy",
    workspaceId: "ws_policy",
    appId: hyperliquid ? "matterhorn.hyperliquid-testnet" : "matterhorn.sui-testnet",
    connectionId: hyperliquid ? "cxc_hyperliquid" : "cxc_sui",
    actionId: hyperliquid ? "hyperliquid_preview_order" : "sui_transfer_preview",
    protocol: app,
    network: hyperliquid ? "hyperliquid:testnet" : "sui:testnet",
    signer: "0x1234",
    operation: hyperliquid ? "place_order" : "transfer_sui",
    asset: hyperliquid ? "ETH" : "SUI",
    amount: "0.01",
    recipient: null,
    slippageBps: hyperliquid ? 50 : null,
    canonicalArguments: {},
    authorizedArgumentsHash: "b".repeat(64),
    canonicalArgumentsHash: "c".repeat(64),
    policyHash: "d".repeat(64),
    simulation: {
      reference: "simulation",
      blockOrVersion: "block",
      simulatedAt: "2026-09-01T11:59:59.950Z",
      validUntil: "2026-09-01T12:00:30.000Z",
    },
    capabilityClass: "wallet_review_only",
    preparedAt: "2026-09-01T11:59:59.990Z",
    expiresAt: "2026-09-01T12:00:30.000Z",
  };
}

function priorIntent(input: {
  createdAt: string;
  notionalUsd: number;
  state?: MatterhornPendingCryptoIntent["state"];
}): MatterhornPendingCryptoIntent {
  return {
    state: input.state ?? "wallet_review",
    createdAt: input.createdAt,
    policyDecision: {
      limits: [{
        name: "per_action_usd",
        configured: "50",
        observed: String(input.notionalUsd),
        passed: true,
      }],
    },
  } as MatterhornPendingCryptoIntent;
}

describe("production transaction runtime policy", () => {
  test("builds exact server-owned layers and denies unsupported or mainnet actions", () => {
    const layers = buildMatterhornRuntimeTransactionPolicyLayers({
      workspaceId: "ws_policy",
      ownerId: "account_policy",
      organizationId: null,
      appId: "matterhorn.sui-testnet",
      actionId: "sui_transfer_preview",
      network: "sui:testnet",
      runId: "run_policy",
      callId: "call_policy",
      walletPolicy: walletPolicy(),
      now: NOW,
    });
    expect(layers.platform).toMatchObject({
      state: "active",
      walletSubmissionOnly: true,
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_transfer_preview"],
      allowedNetworks: ["sui:testnet"],
    });
    expect(layers.user.limits).toMatchObject({
      perActionUsd: 50,
      dailyUsd: 100,
      maxSlippageBps: 100,
    });
    expect(layers.run.expiresAt).toBe("2026-09-01T12:05:00.000Z");
    expect(layers.capability.expiresAt).toBe("2026-09-01T12:01:00.000Z");

    for (const candidate of [
      { appId: "malicious.app", actionId: "submit", network: "sui:testnet" },
      { appId: "matterhorn.sui-testnet", actionId: "sui_transfer_preview", network: "sui:mainnet" },
    ]) {
      expect(buildMatterhornRuntimeTransactionPolicyLayers({
        workspaceId: "ws_policy",
        ownerId: "account_policy",
        organizationId: null,
        ...candidate,
        runId: "run_policy",
        callId: "call_policy",
        walletPolicy: walletPolicy(),
        now: NOW,
      }).platform.state).toBe("deny");
    }
  });

  test("derives Hyperliquid facts only when adapter economics reconcile exactly", () => {
    const facts = resolveMatterhornRuntimeTransactionFacts({
      adapterResult: hyperliquidResult(),
      intent: intent(),
      existingIntents: [
        priorIntent({ createdAt: "2026-09-01T11:30:00.000Z", notionalUsd: 20 }),
        priorIntent({ createdAt: "2026-08-31T00:00:00.000Z", notionalUsd: 40 }),
        priorIntent({ createdAt: "2026-09-01T11:45:00.000Z", notionalUsd: 999, state: "cancelled" }),
      ],
      now: NOW,
    });
    expect(facts).toEqual({
      notionalUsd: 30,
      dailySpendUsdBefore: 20,
      weeklySpendUsdBefore: 60,
      projectedReserveUsd: 60,
      leverage: 2,
      transactionsLastHour: 1,
      transactionsToday: 1,
      regionCode: null,
      complianceAllowed: true,
    });

    const contradictory = resolveMatterhornRuntimeTransactionFacts({
      adapterResult: hyperliquidResult({ notionalUsd: "31" }),
      intent: intent(),
      existingIntents: [],
      now: NOW,
    });
    expect(contradictory).toMatchObject({
      notionalUsd: null,
      projectedReserveUsd: null,
      leverage: null,
    });
  });

  test("treats Sui testnet value as zero without inventing a reserve fact", () => {
    const result = hyperliquidResult();
    const facts = resolveMatterhornRuntimeTransactionFacts({
      adapterResult: {
        ...result,
        app: { id: "matterhorn.sui-testnet", manifestRevision: "1.0.0", connectionId: "cxc_sui" },
        action: { id: "sui_transfer_preview", access: "prepare", network: "sui:testnet" },
        result: { amountSui: "1" },
      },
      intent: intent("sui"),
      existingIntents: [],
      now: NOW,
    });
    expect(facts).toMatchObject({
      notionalUsd: 0,
      projectedReserveUsd: null,
      leverage: null,
      complianceAllowed: true,
    });
  });
});
