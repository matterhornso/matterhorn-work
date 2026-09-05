import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MatterhornCoworkerProfile,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornAgentCapabilityBroker } from "./agent-capability.js";
import { cryptoAppEvidenceIdentity } from "./crypto-app-evidence-identity.js";
import { MatterhornPendingCryptoIntentStore } from "./crypto-pending-intent-store.js";
import { firstPartyCryptoAppProxyTool } from "./first-party-crypto-apps.js";
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
const BITTENSOR_SENDER = `5${"C".repeat(47)}`;
const BITTENSOR_HOTKEY = `5${"E".repeat(47)}`;
const stateStores: MatterhornGuardedRuntimeStateStore[] = [];

afterEach(() => {
  for (const store of stateStores.splice(0)) store.close();
});

function pendingStore(now: () => Date = () => NOW): MatterhornPendingCryptoIntentStore {
  return pendingStoreWithState(now).pendingIntents;
}

function pendingStoreWithState(now: () => Date = () => NOW): {
  pendingIntents: MatterhornPendingCryptoIntentStore;
  state: MatterhornGuardedRuntimeStateStore;
} {
  const directory = mkdtempSync(join(tmpdir(), "matterhorn-pending-intent-"));
  const state = new MatterhornGuardedRuntimeStateStore(join(directory, "state.db"));
  stateStores.push(state);
  return {
    pendingIntents: new MatterhornPendingCryptoIntentStore(state, now),
    state,
  };
}

function failNextPendingIntentPut(state: MatterhornGuardedRuntimeStateStore): () => void {
  const originalPut = state.put.bind(state);
  let armed = true;
  Object.defineProperty(state, "put", {
    configurable: true,
    value: (input: Parameters<MatterhornGuardedRuntimeStateStore["put"]>[0]) => {
      if (armed && input.kind === "crypto_pending_intent") {
        armed = false;
        throw new Error("injected_pending_intent_write_failure");
      }
      return originalPut(input);
    },
  });
  return () => {
    Object.defineProperty(state, "put", { configurable: true, value: originalPut });
  };
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

function certifyResult(candidate: MatterhornCryptoAppResult): MatterhornCryptoAppResult {
  Object.assign(candidate.provenance, cryptoAppEvidenceIdentity({
    appId: candidate.app.id,
    manifestRevision: candidate.app.manifestRevision,
    connectionId: candidate.app.connectionId,
    actionId: candidate.action.id,
    access: candidate.action.access,
    network: candidate.action.network,
    result: candidate.result,
    observation: candidate.observation,
  }));
  return candidate;
}

function adapterResult(): MatterhornCryptoAppResult {
  return certifyResult({
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
  });
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

function bittensorRequest(): MatterhornCryptoTransactionRequest {
  const appId = "matterhorn.bittensor-testnet";
  const actionId = "bittensor_prepare_stake";
  const network = "bittensor:test";
  const ownerId = "account_alpha";
  const runId = "run_bittensor";
  const callId = "call_bittensor";
  const layer = (scope: MatterhornTransactionPolicyScope, subjectId: string): MatterhornTransactionPolicyLayer => ({
    ...policyLayer(scope, subjectId),
    allowedAppIds: [appId],
    allowedActionIds: [actionId],
    allowedNetworks: [network],
    allowedAssets: ["TAO"],
    allowedRecipients: [BITTENSOR_HOTKEY],
  });
  return {
    workspaceId: "ws_alpha",
    organizationId: null,
    ownerId,
    sessionId: "ses_bittensor",
    runId,
    callId,
    appId,
    connectionId: "cxc_bittensor",
    actionId,
    network,
    arguments: {
      sender: BITTENSOR_SENDER,
      hotkey: BITTENSOR_HOTKEY,
      netuid: 14,
      amountTao: "0.1",
    },
    coworker: {
      ...coworker(),
      id: "cw_bittensor",
      name: "Bittensor treasury coworker",
      role: "Bittensor staking analyst",
      mission: "Prepare bounded Bittensor testnet actions for wallet review.",
      allowedAppIds: [appId],
      allowedActionIds: [actionId],
      allowedNetworks: [network],
      allowedAssets: ["TAO"],
    },
    policyLayers: {
      platform: layer("platform", "matterhorn"),
      organization: null,
      user: layer("user", ownerId),
      app: layer("app", appId),
      run: layer("run", runId),
      capability: layer("capability", callId),
    },
  };
}

function bittensorAdapterResult(): MatterhornCryptoAppResult {
  return certifyResult({
    ...adapterResult(),
    app: {
      id: "matterhorn.bittensor-testnet",
      manifestRevision: "1.1.0",
      connectionId: "cxc_bittensor",
    },
    action: {
      id: "bittensor_prepare_stake",
      access: "prepare",
      network: "bittensor:test",
    },
    observation: {
      source: "Bittensor testnet pinned SDK simulation",
      observedAt: "2026-09-01T12:00:00.000Z",
      blockOrVersion: "123456",
      ageMs: 20,
      freshnessMaxAgeMs: 10_000,
    },
    result: {
      preparedActionId: "bt_preview_service",
      network: "bittensor:test",
      action: "stake",
      sender: BITTENSOR_SENDER,
      destination: null,
      hotkey: BITTENSOR_HOTKEY,
      netuid: 14,
      amountTao: "0.1",
      availableTao: "10",
      currentStakeTao: "2",
      expectedAlpha: "0.19",
      networkFeeTao: "0.0001",
      swapFeeTao: "0.00005",
      slippageBps: 25,
      block: 123456,
      simulationReference: `sha256:${"9".repeat(64)}`,
      expiresAt: "2026-09-01T12:00:15.000Z",
    },
  });
}

function brokerWithConsumedCapability(input: MatterhornCryptoTransactionRequest): MatterhornAgentCapabilityBroker {
  const proxyToolName = firstPartyCryptoAppProxyTool(input.appId, input.actionId);
  if (!proxyToolName) throw new Error("missing_test_proxy_tool");
  const agentId = input.appId === "matterhorn.bittensor-testnet" ? "matterhorn-bittensor" : "matterhorn-sui";
  const manifestRevision = input.appId === "matterhorn.bittensor-testnet" ? "1.1.0" : "1.0.0";
  const broker = new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64));
  broker.setCoworkerResolver(() => true);
  broker.createRunGrant({
    runId: input.runId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    agentId,
    executionMode: "work",
    requestToolProfiles: [{ "*": false, [`matterhorn-work_${proxyToolName}`]: true }],
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
        connectionId: input.connectionId,
        appId: input.appId,
        manifestRevision,
        actionId: input.actionId,
        network: input.network,
        proxyToolName,
        access: "prepare",
      }],
      allowedDataLabels: ["public", "wallet_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 1,
      maxPrepareCallsPerFamily: 1,
    },
    now: NOW,
  });
  const args = input.consumedCapability?.arguments ?? {
    appId: input.appId,
    manifestRevision,
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
    agentId,
    toolName: proxyToolName,
    args,
    now: NOW,
  });
  broker.consume({
    token: capability.token,
    toolName: proxyToolName,
    args,
    now: NOW,
  });
  return broker;
}

describe("guarded crypto transaction service", () => {
  test("keeps a certified Bittensor stake preview tenant-bound and connected-wallet-only", async () => {
    const input = bittensorRequest();
    const pendingIntents = pendingStore();
    let routerCalls = 0;
    const service = new MatterhornCryptoTransactionService({
      router: {
        execute: async (adapterRequest) => {
          routerCalls += 1;
          expect(adapterRequest).toMatchObject({
            workspaceId: "ws_alpha",
            sessionId: "ses_bittensor",
            runId: "run_bittensor",
            callId: "call_bittensor",
            actionId: "bittensor_prepare_stake",
            network: "bittensor:test",
            arguments: input.arguments,
          });
          return bittensorAdapterResult();
        },
      },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
      resolveTrustedFacts: async () => ({
        notionalUsd: 10,
        dailySpendUsdBefore: 0,
        weeklySpendUsdBefore: 0,
        projectedReserveUsd: 100,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 0,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const result = await service.prepare(input);
    expect(routerCalls).toBe(1);
    expect(result.reviewedAction).toMatchObject({
      protocol: "bittensor",
      network: "bittensor:test",
      operation: "stake",
      signer: BITTENSOR_SENDER,
      recipient: BITTENSOR_HOTKEY,
      amount: "0.1",
      asset: "TAO",
      slippage: "25bps",
      capabilityClass: "wallet_review_only",
    });
    expect(result.pendingIntent).toMatchObject({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_bittensor",
      state: "wallet_review",
    });
    const pendingId = result.pendingIntent?.id ?? "missing";
    expect(pendingIntents.get("ws_alpha", "account_other", "cw_bittensor", pendingId)).toBeNull();
    expect(pendingIntents.get("ws_other", "account_alpha", "cw_bittensor", pendingId)).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/signed|signature|submit|broadcast|privateKey/i);
  });

  test("accepts an exact already-consumed interactive capability without issuing hidden authority", async () => {
    const rawArguments = {
      network: "testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
    };
    const input: MatterhornCryptoTransactionRequest = {
      ...request(),
      consumedCapability: {
        coworkerId: "cw_sui",
        toolName: "matterhorn_sui_preview_transfer",
        arguments: rawArguments,
      },
    };
    const routed: unknown[] = [];
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async (adapterRequest) => {
        routed.push(adapterRequest);
        return adapterResult();
      } },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents: pendingStore(),
      recordReviewedAction: async () => undefined,
      resolveTrustedFacts: async () => ({
        notionalUsd: 0,
        dailySpendUsdBefore: 0,
        weeklySpendUsdBefore: 0,
        projectedReserveUsd: 100,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 0,
        regionCode: null,
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const result = await service.prepare(input);
    expect(result.policyDecision.decision).toBe("wallet_review_required");
    expect(routed).toEqual([expect.objectContaining({
      arguments: input.arguments,
      consumedCapability: input.consumedCapability,
    })]);
  });

  test("emits a reviewed wallet action only after certified execution, capability proof and policy", async () => {
    const input = request();
    let routerCalls = 0;
    const recordedActions: Array<Record<string, string>> = [];
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => { routerCalls += 1; return adapterResult(); } },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async (action) => { recordedActions.push(action); },
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
    const reviewedAction = result.reviewedAction;
    if (!reviewedAction) throw new Error("expected_reviewed_action");
    expect(recordedActions).toEqual([{
      workspaceId: "ws_alpha",
      runId: reviewedAction.runId,
      intentHash: reviewedAction.intentHash,
      policyHash: reviewedAction.policyHash,
      simulationReference: reviewedAction.simulation.reference,
    }]);
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
    expect(pendingIntents.listForOwner("ws_alpha", "account_alpha")).toHaveLength(1);
    expect(pendingIntents.listForOwner("ws_alpha", "account_other")).toEqual([]);
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

  test("rejects proof-less, malformed, or mutated certified results before wallet intent compilation", async () => {
    const mutations: Array<(candidate: MatterhornCryptoAppResult) => void> = [
      (candidate) => {
        delete candidate.provenance.projectionHash;
        delete candidate.provenance.observationHash;
      },
      (candidate) => { candidate.provenance.observationHash = "malformed"; },
      (candidate) => { candidate.app.id = "matterhorn.other"; },
      (candidate) => { candidate.app.manifestRevision = "1.0.1"; },
      (candidate) => { candidate.app.connectionId = "cxc_other_tenant"; },
      (candidate) => { candidate.action.id = "sui_other_preview"; },
      (candidate) => { candidate.action.access = "read"; },
      (candidate) => { candidate.action.network = "sui:mainnet"; },
      (candidate) => { candidate.observation.source = "other source"; },
      (candidate) => { candidate.observation.blockOrVersion = "checkpoint:101"; },
      (candidate) => { (candidate.result as { amountSui: string }).amountSui = "2.5"; },
    ];
    for (const mutate of mutations) {
      const input = request();
      const pendingIntents = pendingStore();
      let recordedActions = 0;
      const service = new MatterhornCryptoTransactionService({
        router: {
          execute: async () => {
            const candidate = adapterResult();
            mutate(candidate);
            return candidate;
          },
        },
        capabilities: brokerWithConsumedCapability(input),
        pendingIntents,
        recordReviewedAction: async () => { recordedActions += 1; },
        resolveTrustedFacts: async () => { throw new Error("facts_must_not_run"); },
        now: () => NOW,
      });
      try {
        await service.prepare(input);
        throw new Error("expected_evidence_denial");
      } catch (error) {
        expect(error).toBeInstanceOf(MatterhornCryptoTransactionError);
        if (!(error instanceof MatterhornCryptoTransactionError)) throw error;
        expect(error.code).toBe("transaction_evidence_invalid");
      }
      expect(recordedActions).toBe(0);
      expect(pendingIntents.list("ws_alpha", "account_alpha", "cw_sui")).toEqual([]);
    }
  });

  test("cancels only wallet reviews bound to the disconnected app connection", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
      resolveTrustedFacts: async () => ({
        notionalUsd: 25,
        dailySpendUsdBefore: 0,
        weeklySpendUsdBefore: 0,
        projectedReserveUsd: 75,
        leverage: null,
        transactionsLastHour: 0,
        transactionsToday: 0,
        regionCode: "ch",
        complianceAllowed: true,
      }),
      now: () => NOW,
    });
    const prepared = await service.prepare(input);
    const pendingId = prepared.pendingIntent?.id ?? "missing";

    expect(pendingIntents.invalidateConnection({
      workspaceId: "ws_other",
      connectionId: "cxc_sui",
    })).toBe(0);
    expect(pendingIntents.invalidateConnection({
      workspaceId: "ws_alpha",
      connectionId: "cxc_other",
    })).toBe(0);
    expect(pendingIntents.invalidateConnection({
      workspaceId: "ws_alpha",
      connectionId: "cxc_sui",
    })).toBe(1);
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", pendingId))
      .toMatchObject({ revision: 2, state: "cancelled" });
    expect(pendingIntents.invalidateConnection({
      workspaceId: "ws_alpha",
      connectionId: "cxc_sui",
    })).toBe(0);
  });

  test("denies static policy before calling the certified adapter", async () => {
    const input = request(false);
    let routerCalls = 0;
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => { routerCalls += 1; return adapterResult(); } },
      capabilities: new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64)),
      pendingIntents: pendingStore(),
      recordReviewedAction: async () => undefined,
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

  test("cancels a prepared wallet review when its guarded run receipt cannot be recorded", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => { throw new Error("receipt storage unavailable"); },
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
    await expect(service.prepare(input)).rejects.toThrow("transaction_receipt_record_failed");
    expect(pendingIntents.list("ws_alpha", "account_alpha", "cw_sui"))
      .toEqual([expect.objectContaining({ state: "cancelled", revision: 2 })]);
  });

  test("never emits a wallet action without the exact consumed capability proof", async () => {
    const input = request();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: new MatterhornAgentCapabilityBroker("enforce", undefined, () => "s".repeat(64)),
      pendingIntents: pendingStore(),
      recordReviewedAction: async () => undefined,
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
      recordReviewedAction: async () => undefined,
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
          : certifyResult({
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
            });
      },
    };
    const service = new MatterhornCryptoTransactionService({
      router,
      capabilities: brokerWithConsumedCapability(initialRequest),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
      recordReviewedAction: async () => undefined,
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
      recordReviewedAction: async () => undefined,
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
      recordReviewedAction: async () => undefined,
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

  test("durably expires a stale wallet review before rejecting receipt reconciliation", async () => {
    let clock = NOW;
    const { pendingIntents, state } = pendingStoreWithState(() => clock);
    const input = request();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    clock = new Date("2026-09-01T12:00:16.000Z");
    const digest = "3".repeat(44);

    expect(() => pendingIntents.reconcileWalletReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: 1,
      status: "submitted",
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    })).toThrow("pending_crypto_intent_expired");

    expect(state.list<{ id: string; state: string; revision: number }>(
      "crypto_pending_intent",
      { workspaceId: "ws_alpha", nowMs: clock.getTime() },
    )).toContainEqual(expect.objectContaining({ id, state: "expired", revision: 2 }));
  });

  test("reconciles only exact wallet-reported Sui metadata without claiming chain verification", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    const digest = "3".repeat(44);
    const receiptInput = {
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: 1,
      status: "submitted" as const,
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    };
    const reconciled = pendingIntents.reconcileWalletReceipt(receiptInput);
    expect(reconciled).toMatchObject({
      revision: 2,
      state: "submitted",
      receipt: {
        intentHash: prepared.intent.intentHash,
        protocol: "sui",
        network: "sui:testnet",
        status: "submitted",
        publicId: digest,
        transactionHash: digest,
        blockHash: null,
        verification: {
          kind: "wallet_reported_public_metadata",
          chainVerified: false,
        },
      },
    });
    expect(reconciled.receipt?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pendingIntents.reconcileWalletReceipt(receiptInput)).toEqual(reconciled);
    expect(pendingIntents.get("ws_alpha", "account_other", "cw_sui", id)).toBeNull();
  });

  test("promotes a wallet-reported Sui digest only after exact public-chain verification", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    const digest = "3".repeat(44);
    const submitted = pendingIntents.reconcileWalletReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: 1,
      status: "submitted",
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    });
    const confirmed = pendingIntents.reconcileVerifiedSuiReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: submitted.revision,
      verification: {
        network: "sui:testnet",
        digest,
        status: "confirmed",
        signer: SENDER,
        recipient: RECIPIENT,
        amountMist: "1250000000",
        epoch: "912",
        source: "sui.grpc",
        observedAt: "2026-09-01T12:00:01.000Z",
      },
    });
    expect(confirmed).toMatchObject({
      revision: 3,
      state: "confirmed",
      receipt: {
        status: "confirmed",
        publicId: digest,
        transactionHash: digest,
        blockHash: null,
        verification: { kind: "public_chain", chainVerified: true },
      },
    });
    expect(confirmed.receipt?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rejects forged Sui chain verification and preserves the submitted receipt", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    const digest = "3".repeat(44);
    const submitted = pendingIntents.reconcileWalletReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: 1,
      status: "submitted",
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    });
    expect(() => pendingIntents.reconcileVerifiedSuiReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: submitted.revision,
      verification: {
        network: "sui:testnet",
        digest,
        status: "confirmed",
        signer: SENDER,
        recipient: `0x${"f".repeat(64)}`,
        amountMist: "1250000000",
        epoch: "912",
        source: "sui.grpc",
        observedAt: "2026-09-01T12:00:01.000Z",
      },
    })).toThrow("pending_crypto_receipt_chain_verification_mismatch");
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id)).toEqual(submitted);
  });

  test("rejects wallet receipt mutation and preserves the pending review", async () => {
    const input = request();
    const pendingIntents = pendingStore();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    expect(() => pendingIntents.reconcileWalletReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: 1,
      status: "submitted",
      publicId: "3".repeat(44),
      transactionHash: "4".repeat(44),
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    })).toThrow("pending_crypto_receipt_terms_mismatch");
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id))
      .toMatchObject({ state: "wallet_review", revision: 1, receipt: null });
  });

  test("rolls back wallet-intent transitions and receipt reconciliation when replacement persistence fails", async () => {
    const input = request();
    const { pendingIntents, state } = pendingStoreWithState();
    const service = new MatterhornCryptoTransactionService({
      router: { execute: async () => adapterResult() },
      capabilities: brokerWithConsumedCapability(input),
      pendingIntents,
      recordReviewedAction: async () => undefined,
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
    const prepared = await service.prepare(input);
    const id = prepared.pendingIntent?.id ?? "missing";
    const original = pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id);
    if (!original) throw new Error("expected_pending_intent");

    let restorePut = failNextPendingIntentPut(state);
    expect(() => pendingIntents.transition({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: original.revision,
      nextState: "cancelled",
    })).toThrow("injected_pending_intent_write_failure");
    restorePut();
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id)).toEqual(original);

    const digest = "3".repeat(44);
    const receiptInput = {
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: original.revision,
      status: "submitted" as const,
      publicId: digest,
      transactionHash: digest,
      blockHash: null,
      network: "sui:testnet",
      signer: SENDER,
      operation: prepared.intent.operation,
      authorizedArgumentsHash: prepared.intent.authorizedArgumentsHash,
    };
    restorePut = failNextPendingIntentPut(state);
    expect(() => pendingIntents.reconcileWalletReceipt(receiptInput))
      .toThrow("injected_pending_intent_write_failure");
    restorePut();
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id)).toEqual(original);

    const submitted = pendingIntents.reconcileWalletReceipt(receiptInput);
    restorePut = failNextPendingIntentPut(state);
    expect(() => pendingIntents.reconcileVerifiedSuiReceipt({
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      coworkerId: "cw_sui",
      id,
      expectedRevision: submitted.revision,
      verification: {
        network: "sui:testnet",
        digest,
        status: "confirmed",
        signer: SENDER,
        recipient: RECIPIENT,
        amountMist: "1250000000",
        epoch: "912",
        source: "sui.grpc",
        observedAt: "2026-09-01T12:00:01.000Z",
      },
    })).toThrow("injected_pending_intent_write_failure");
    restorePut();
    expect(pendingIntents.get("ws_alpha", "account_alpha", "cw_sui", id)).toEqual(submitted);
  });
});
