import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MatterhornCoworkerProfile,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornAgentCapabilityBroker } from "./agent-capability.js";
import { MatterhornPendingCryptoIntentStore } from "./crypto-pending-intent-store.js";
import {
  MatterhornCryptoTransactionError,
  MatterhornCryptoTransactionService,
  type MatterhornCryptoTransactionRequest,
} from "./crypto-transaction-service.js";
import type {
  MatterhornTransactionPolicyLayer,
  MatterhornTransactionPolicyScope,
} from "./crypto-transaction-policy.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const NOW = new Date("2026-09-01T12:00:01.000Z");
const SENDER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;
const stateStores: MatterhornGuardedRuntimeStateStore[] = [];

afterEach(() => {
  for (const store of stateStores.splice(0)) store.close();
});

function pendingStore(now: () => Date = () => NOW): MatterhornPendingCryptoIntentStore {
  const directory = mkdtempSync(join(tmpdir(), "matterhorn-pending-intent-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
  stateStores.push(state);
  return new MatterhornPendingCryptoIntentStore(state, now);
}

function policyLayer(
  scope: MatterhornTransactionPolicyScope,
  subjectId: string,
  allowPrepare = true,
): MatterhornTransactionPolicyLayer {
  return {
    scope,
    id: `${scope}_policy`,
    subjectId,
    revision: "1",
    state: "active",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_transfer_preview"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    allowedRecipients: [RECIPIENT],
    deniedRecipients: [],
    blockedRegions: [],
    allowPrepare,
    walletSubmissionOnly: true,
    limits: {
      perActionUsd: 50,
      dailyUsd: 100,
      weeklyUsd: 500,
      maxSlippageBps: 100,
      maxLeverage: 2,
      minimumReserveUsd: 25,
      maxTransactionsPerHour: 5,
      maxTransactionsPerDay: 20,
    },
    expiresAt: "2026-09-01T12:01:00.000Z",
  };
}

function coworker(): MatterhornCoworkerProfile {
  return {
    version: "matterhorn.coworker-profile.v1",
    id: "cw_sui",
    workspaceId: "ws_alpha",
    ownerId: "account_alpha",
    revision: 1,
    policyVersion: "coworker-policy.v1",
    name: "Sui treasury coworker",
    role: "Treasury analyst",
    mission: "Prepare bounded Sui transfers for wallet review.",
    state: "active",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_transfer_preview"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read", "prepare"],
    limits: {
      perActionUsd: 50,
      dailyUsd: 100,
      weeklyUsd: 500,
      maxSlippageBps: 100,
      maxLeverage: 2,
      minimumReserveUsd: 25,
      maxActiveWatches: 2,
      maxReadCallsPerRun: 8,
      maxPrepareCallsPerFamily: 1,
    },
    privacy: {
      allowedDataLabels: ["public", "workspace_private", "wallet_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
    escalation: {
      privateDataRequiresDisclosure: true,
      transactionRequiresWalletReview: true,
      walletSubmission: "connected_wallet_only",
    },
    createdAt: "2026-09-01T11:00:00.000Z",
    updatedAt: "2026-09-01T11:00:00.000Z",
  };
}

function adapterResult(): MatterhornCryptoAppResult {
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: {
      id: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
    },
    action: { id: "sui_transfer_preview", access: "prepare", network: "sui:testnet" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.020Z",
      durationMs: 20,
    },
    observation: {
      source: "certified Sui testnet simulation",
      observedAt: "2026-09-01T12:00:00.000Z",
      blockOrVersion: "checkpoint:100",
      ageMs: 20,
      freshnessMaxAgeMs: 15_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"e".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_prepare" },
    result: {
      preparedActionId: "sui_preview_1",
      network: "sui:testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
      estimatedGasMist: "1000",
      simulationReference: `sha256:${"b".repeat(64)}`,
      expiresAt: "2026-09-01T12:00:15.000Z",
    },
  };
}

function request(allowPrepare = true): MatterhornCryptoTransactionRequest {
  return {
    workspaceId: "ws_alpha",
    organizationId: null,
    ownerId: "account_alpha",
    sessionId: "ses_sui",
    runId: "run_sui",
    callId: "call_sui",
    appId: "matterhorn.sui-testnet",
    connectionId: "cxc_sui",
    actionId: "sui_transfer_preview",
    network: "sui:testnet",
    arguments: { sender: SENDER, recipient: RECIPIENT, amountSui: "1.25" },
    coworker: coworker(),
    policyLayers: {
      platform: policyLayer("platform", "matterhorn", allowPrepare),
      organization: null,
      user: policyLayer("user", "account_alpha"),
      app: policyLayer("app", "matterhorn.sui-testnet"),
      run: policyLayer("run", "run_sui"),
      capability: policyLayer("capability", "call_sui"),
    },
  };
}

function regeneratedRequest(): MatterhornCryptoTransactionRequest {
  const current = request();
  return {
    ...current,
    runId: "run_sui_refresh",
    callId: "call_sui_refresh",
    policyLayers: {
      ...current.policyLayers,
      run: policyLayer("run", "run_sui_refresh"),
      capability: policyLayer("capability", "call_sui_refresh"),
    },
  };
}

function brokerWithConsumedCapability(input: MatterhornCryptoTransactionRequest): MatterhornAgentCapabilityBroker {
  const broker = new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64));
  broker.setCoworkerResolver(() => true);
  broker.createRunGrant({
    runId: input.runId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    agentId: "matterhorn-sui",
    executionMode: "work",
    requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_preview_transfer": true }],
    coworker: {
      id: input.coworker.id,
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      revision: input.coworker.revision,
      policyVersion: input.coworker.policyVersion,
      allowedAppIds: [input.appId],
      allowedActionIds: [input.actionId],
      allowedNetworks: [input.network],
      automaticAuthorities: ["prepare"],
      actionBindings: [{
        appId: input.appId,
        actionId: input.actionId,
        proxyToolName: "matterhorn_sui_preview_transfer",
        access: "prepare",
      }],
      allowedDataLabels: ["public", "wallet_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 1,
      maxPrepareCallsPerFamily: 1,
    },
    now: NOW,
  });
  const args = {
    appId: input.appId,
    manifestRevision: "1.0.0",
    connectionId: input.connectionId,
    actionId: input.actionId,
    access: "prepare",
    network: input.network,
    canonicalArgumentsHash: sha256(input.arguments),
  };
  const capability = broker.issue({
    runId: input.runId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    callId: input.callId,
    agentId: "matterhorn-sui",
    toolName: "matterhorn_sui_preview_transfer",
    args,
    now: NOW,
  });
  broker.consume({
    token: capability.token,
    toolName: "matterhorn_sui_preview_transfer",
    args,
    now: NOW,
  });
  return broker;
}

describe("guarded crypto transaction service", () => {
  test("emits a reviewed wallet action only after certified execution, capability proof and policy", async () => {
    const input = request();
    let routerCalls = 0;
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => { routerCalls += 1; return adapterResult(); } },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 10,
        weeklySpendUsdBefore: 20,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 1,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const result = await service.prepare(input);
    expect(routerCalls).toBe(1);
    expect(result.policyDecision.decision).toBe("wallet_review_required");
    expect(result.reviewedAction).toMatchObject({
      capabilityClass: "wallet_review_only",
      protocol: "sui",
      signer: SENDER,
      recipient: RECIPIENT,
    });
    expect(result.pendingIntent).toMatchObject({
      state: "wallet_review",
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      sessionId: "ses_sui",
    });
    expect(pendingIntents.get(
      "ws_alpha",
      "account_alpha",
      "cw_sui",
      result.pendingIntent?.id ?? "missing",
    )?.intent.intentHash).toBe(result.intent.intentHash);
    expect(pendingIntents.get(
      "ws_alpha",
      "account_other",
      "cw_sui",
      result.pendingIntent?.id ?? "missing",
    )).toBeNull();
    const pendingId = result.pendingIntent?.id ?? "missing";
    const refreshing = pendingIntents.transition({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id: pendingId,
      expectedRevision: 1,
      nextState: "refreshing",
    });
    expect(refreshing).toMatchObject({ revision: 2, state: "refreshing" });
    expect(() => pendingIntents.transition({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id: pendingId,
      expectedRevision: 1,
      nextState: "cancelled",
    })).toThrow("pending_crypto_intent_revision_conflict");
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", pendingId))
      .toMatchObject({ revision: 2, state: "refreshing" });
  });

  test("denies static policy before calling the certified adapter", async () => {
    const input = request(false);
    let routerCalls = 0;
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => { routerCalls += 1; return adapterResult(); } },
      capabilities: new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64)),
      pendingIntents: pendingStore(),
      resolveTrustedFacts: async () => {
        throw new Error("facts_must_not_run");
      },
      now: () => NOW,
    });
    try {
      await service.prepare(input);
      throw new Error("expected_policy_denial");
    } catch (error) {
      expect(error).toBeInstanceOf(MatterhornCryptoTransactionError);
      if (!(error instanceof MatterhornCryptoTransactionError)) throw error;
      expect(error.code).toBe("transaction_policy_preflight_denied");
    }
    expect(routerCalls).toBe(0);
  });

  test("never emits a wallet action without the exact consumed capability proof", async () => {
    const input = request();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64)),
      pendingIntents: pendingStore(),
      resolveTrustedFacts: async () => {
        throw new Error("facts_must_not_run");
      },
      now: () => NOW,
    });
    await expect(service.prepare(input)).rejects.toThrow("transaction_capability_proof_missing");
  });

  test("returns a denial receipt but no reviewed action when trusted economic limits fail", async () => {
    const input = request();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents: pendingStore(),
      resolveTrustedFacts: async () => ({
        notionalUsd: 75,
        dailySpendUsdBefore: 75,
        weeklySpendUsdBefore: 450,
        projectedReserveUsd: 10,
        leverage: null,
        transactionsLastHour: 5,
        transactionsToday: 20,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const result = await service.prepare(input);
    expect(result.policyDecision.decision).toBe("deny");
    expect(result.reviewedAction).toBeNull();
    expect(result.pendingIntent).toBeNull();
    expect(result.policyDecision.reasonCodes).toEqual(expect.arrayContaining([
      "policy_per_action_usd_exceeded",
      "policy_daily_usd_exceeded",
      "policy_weekly_usd_exceeded",
      "policy_minimum_reserve_usd_exceeded",
      "policy_max_transactions_per_hour_exceeded",
      "policy_max_transactions_per_day_exceeded",
    ]));
  });

  test("regenerates an unchanged intent through a new guarded run and supersedes the stale review", async () => {
    const initialRequest = request();
    const refreshRequest = regeneratedRequest();
    const pendingIntents = pendingStore();
    let executions = 0;
    const router = {
      execute: async () => {
        executions += 1;
        const result = adapterResult();
        return executions === 1
          ? result
          : {
              ...result,
              observation: {
                ...result.observation,
                blockOrVersion: "checkpoint:101",
              },
              result: {
                preparedActionId: "sui_preview_2",
                network: "sui:testnet",
                sender: SENDER,
                recipient: RECIPIENT,
                amountSui: "1.25",
                estimatedGasMist: "1000",
                simulationReference: `sha256:${"c".repeat(64)}`,
                expiresAt: "2026-09-01T12:00:15.000Z",
              },
            };
      },
    };
    const service = new MatterhornCryptoTransactionService({
      router,
      capabilities: brokerWithConsumedCapability(initialRequest),
      pendingIntents,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 10,
        weeklySpendUsdBefore: 20,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 1,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const initial = await service.prepare(initialRequest);
    const refreshService = new MatterhornCryptoTransactionService({
      router,
      capabilities: brokerWithConsumedCapability(refreshRequest),
      pendingIntents,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 10,
        weeklySpendUsdBefore: 20,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 1,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const regenerated = await refreshService.regenerate({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      pendingIntentId: initial.pendingIntent?.id ?? "missing",
      expectedRevision: 1,
      request: refreshRequest,
    });
    expect(regenerated.supersededIntent).toMatchObject({
      state: "regeneration_required",
      revision: 3,
    });
    expect(regenerated.result.pendingIntent).toMatchObject({
      state: "wallet_review",
      previousIntentHash: initial.intent.intentHash,
    });
    expect(regenerated.result.intent.simulation).toMatchObject({
      reference: `sha256:${"c".repeat(64)}`,
      blockOrVersion: "checkpoint:101",
    });
  });

  test("automatically expires stale wallet reviews and cancels live intents when coworker authority changes", async () => {
    let clock = NOW;
    const pendingIntents = pendingStore(() => clock);
    const input = request();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 10,
        weeklySpendUsdBefore: 20,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 1,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const live = await service.prepare(input);
    expect(pendingIntents.invalidateCoworker({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
    })).toBe(1);
    expect(pendingIntents.get(
      "ws_alpha",
      "account_alpha",
      "cw_sui",
      live.pendingIntent?.id ?? "missing",
    )).toMatchObject({ state: "cancelled", revision: 2 });

    const nextInput = regeneratedRequest();
    const nextService = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(nextInput),
      pendingIntents,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 10,
        weeklySpendUsdBefore: 20,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 1,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const expiring = await nextService.prepare(nextInput);
    clock = new Date("2026-09-01T12:00:16.000Z");
    expect(pendingIntents.get(
      "ws_alpha",
      "account_alpha",
      "cw_sui",
      expiring.pendingIntent?.id ?? "missing",
    )).toMatchObject({ state: "expired", revision: 2 });
  });
});
