import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  MatterhornCoworkerProfile,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  createMatterhornCertifiedCoworkerToolExecutor,
} from "./crypto-coworker-certified-tool-executor.js";
import { cryptoAppEvidenceIdentity } from "./crypto-app-evidence-identity.js";
import { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import type { ManagedMcpToolAuthorization } from "./managed-opencode-mcp.js";
import type { WorkspaceInfo } from "./types.js";

const NOW = new Date("2026-09-01T12:00:01.000Z");
const SENDER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;
const BITTENSOR_SENDER = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
const BITTENSOR_DESTINATION = "5DAAnrj7VHTz5qL3S9cV3mKf2x5jXz2XGvGYuWQfJj9GzVQd";
const BITTENSOR_HOTKEY = "5FHneW46xGXgs5mUiveU4sbTyGBzmtoW4h4KYxqsdXw4nq8Z";
const roots: string[] = [];
const runtimes: MatterhornGuardedAgentRuntime[] = [];
const priorMode = process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
const priorSecret = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
const priorDataDir = process.env.MATTERHORN_WORK_DATA_DIR;

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (priorMode === undefined) delete process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
  else process.env.MATTERHORN_GUARDED_RUNTIME_MODE = priorMode;
  if (priorSecret === undefined) delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
  else process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = priorSecret;
  if (priorDataDir === undefined) delete process.env.MATTERHORN_WORK_DATA_DIR;
  else process.env.MATTERHORN_WORK_DATA_DIR = priorDataDir;
});

function runtime(): MatterhornGuardedAgentRuntime {
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "c".repeat(64);
  const root = mkdtempSync(join(tmpdir(), "matterhorn-certified-tool-"));
  roots.push(root);
  process.env.MATTERHORN_WORK_DATA_DIR = root;
  const instance = new MatterhornGuardedAgentRuntime(
    new MatterhornGuardedRuntimeStateStore(join(root, "guarded.db")),
  );
  runtimes.push(instance);
  instance.setCoworkerResolver(() => true);
  return instance;
}

function profile(protocol: "sui" | "hyperliquid" | "bittensor", overrides: Partial<MatterhornCoworkerProfile> = {}): MatterhornCoworkerProfile {
  const sui = protocol === "sui";
  const bittensor = protocol === "bittensor";
  const appId = sui
    ? "matterhorn.sui-testnet"
    : bittensor ? "matterhorn.bittensor-testnet" : "matterhorn.hyperliquid-testnet";
  const actionId = sui
    ? "sui_transfer_preview"
    : bittensor ? "bittensor_prepare_transfer" : "hyperliquid_preview_order";
  const network = sui ? "sui:testnet" : bittensor ? "bittensor:test" : "hyperliquid:testnet";
  return {
    version: "matterhorn.coworker-profile.v1",
    id: sui ? "cw_sui" : bittensor ? "cw_bittensor" : "cw_hl",
    workspaceId: "ws_crypto",
    ownerId: "account_a",
    revision: 1,
    policyVersion: "coworker-policy-1",
    name: sui ? "Sui coworker" : bittensor ? "Bittensor coworker" : "Hyperliquid coworker",
    role: "wallet_reviewer",
    mission: "Prepare exact terms for connected-wallet review.",
    state: "active",
    allowedAppIds: [appId],
    allowedActionIds: [actionId],
    allowedNetworks: [network],
    allowedAssets: [sui ? "SUI" : bittensor ? "TAO" : "ETH"],
    automaticAuthorities: ["read", "prepare"],
    limits: {
      perActionUsd: 50,
      dailyUsd: 100,
      weeklyUsd: 500,
      maxSlippageBps: 100,
      maxLeverage: 3,
      minimumReserveUsd: 0,
      maxActiveWatches: 0,
      maxReadCallsPerRun: 4,
      maxPrepareCallsPerFamily: 1,
    },
    privacy: {
      allowedDataLabels: ["public", "wallet_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
    escalation: {
      privateDataRequiresDisclosure: true,
      transactionRequiresWalletReview: true,
      walletSubmission: "connected_wallet_only",
    },
    createdAt: "2026-09-01T11:00:00.000Z",
    updatedAt: "2026-09-01T11:00:00.000Z",
    ...overrides,
  };
}

function workspace(root: string): WorkspaceInfo {
  return {
    id: "ws_crypto",
    name: "Crypto workspace",
    path: root,
    preset: "default",
    workspaceType: "local",
  };
}

function certifyResult(result: MatterhornCryptoAppResult): MatterhornCryptoAppResult {
  const identity = cryptoAppEvidenceIdentity({
    appId: result.app.id,
    manifestRevision: result.app.manifestRevision,
    connectionId: result.app.connectionId,
    actionId: result.action.id,
    access: result.action.access,
    network: result.action.network,
    result: result.result,
    observation: result.observation,
  });
  return {
    ...result,
    provenance: {
      ...result.provenance,
      projectionHash: identity.projectionHash,
      observationHash: identity.observationHash,
    },
  };
}

async function authorization(input: {
  guardedRuntime: MatterhornGuardedAgentRuntime;
  profile: MatterhornCoworkerProfile;
  toolName: string;
  rawArguments: Record<string, unknown>;
  manifestRevision: string;
  connectionId: string;
  agentId: string;
  access?: "read" | "prepare";
}): Promise<ManagedMcpToolAuthorization> {
  const runId = `run_${input.profile.id}`;
  const sessionId = `ses_${input.profile.id}`;
  const callId = `call_${input.profile.id}`;
  input.guardedRuntime.capabilities.createRunGrant({
    runId,
    workspaceId: input.profile.workspaceId,
    sessionId,
    agentId: input.agentId,
    executionMode: "work",
    requestToolProfiles: [{ "*": false, [input.toolName]: true }],
    coworker: {
      id: input.profile.id,
      workspaceId: input.profile.workspaceId,
      ownerId: input.profile.ownerId,
      revision: input.profile.revision,
      policyVersion: input.profile.policyVersion,
      allowedAppIds: input.profile.allowedAppIds,
      allowedActionIds: input.profile.allowedActionIds,
      allowedNetworks: input.profile.allowedNetworks,
      automaticAuthorities: input.profile.automaticAuthorities,
      actionBindings: [{
        connectionId: input.connectionId,
        appId: input.profile.allowedAppIds[0]!,
        manifestRevision: input.manifestRevision,
        actionId: input.profile.allowedActionIds[0]!,
        network: input.profile.allowedNetworks[0]!,
        proxyToolName: input.toolName,
        access: input.access ?? "prepare",
      }],
      allowedDataLabels: input.profile.privacy.allowedDataLabels,
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: input.profile.limits.maxReadCallsPerRun,
      maxPrepareCallsPerFamily: input.profile.limits.maxPrepareCallsPerFamily,
    },
    now: NOW,
  });
  await input.guardedRuntime.receipts.start({
    runId,
    workspaceId: input.profile.workspaceId,
    sessionId,
    consentUsed: false,
    preflight: {
      version: "matterhorn.agent-privacy-preflight.v1",
      requestHash: "a".repeat(64),
      workspaceId: input.profile.workspaceId,
      sessionId,
      requestedMode: "transaction",
      effectiveMode: "transaction",
      decision: "allow",
      provider: {
        id: "matterhorn-deterministic-runtime",
        name: "Matterhorn deterministic runtime",
        modelId: "none",
        privacyStatus: "local_processing",
        trainingUse: "none",
        retentionDays: 0,
        policyUrl: null,
        dataLeavesMatterhorn: false,
      },
      detectedData: {
        labels: ["wallet_private"],
        categories: ["transaction_intent"],
        redactionCount: 0,
      },
      reason: "Local transaction parsing before connected-wallet review.",
    },
    now: NOW,
  });
  const issued = input.guardedRuntime.capabilities.issue({
    runId,
    workspaceId: input.profile.workspaceId,
    sessionId,
    callId,
    agentId: input.agentId,
    toolName: input.toolName,
    args: input.rawArguments,
    now: NOW,
  });
  const claims = input.guardedRuntime.capabilities.consume({
    token: issued.token,
    toolName: input.toolName,
    args: input.rawArguments,
    now: NOW,
  });
  return {
    args: input.rawArguments,
    runId,
    callId,
    workspaceId: input.profile.workspaceId,
    sessionId,
    coworker: claims.coworker,
  };
}

function suiResult(): MatterhornCryptoAppResult {
  return certifyResult({
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.sui-testnet", manifestRevision: "1.0.0", connectionId: "cxc_sui" },
    action: { id: "sui_transfer_preview", access: "prepare", network: "sui:testnet" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.500Z",
      durationMs: 500,
    },
    observation: {
      source: "sui.grpc",
      observedAt: "2026-09-01T12:00:00.250Z",
      blockOrVersion: "checkpoint:100",
      ageMs: 250,
      freshnessMaxAgeMs: 15_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"b".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_sui" },
    result: {
      preparedActionId: "sui_preview_1",
      network: "sui:testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
      estimatedGasMist: "1000",
      simulationReference: `sha256:${"c".repeat(64)}`,
      expiresAt: "2026-09-01T12:00:30.000Z",
    },
  });
}

function suiReadResult(): MatterhornCryptoAppResult {
  return certifyResult({
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.sui-testnet", manifestRevision: "1.0.0", connectionId: "cxc_sui" },
    action: { id: "sui_account_read", access: "read", network: "sui:testnet" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.050Z",
      durationMs: 50,
    },
    observation: {
      source: "sui.grpc",
      observedAt: "2026-09-01T12:00:00.025Z",
      blockOrVersion: "checkpoint:100",
      ageMs: 25,
      freshnessMaxAgeMs: 15_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"a".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_sui_read" },
    result: {
      address: SENDER,
      balanceAtomic: "1000000000",
      coinType: "0x2::sui::SUI",
    },
  });
}

function hyperliquidResult(): MatterhornCryptoAppResult {
  return certifyResult({
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.hyperliquid-testnet", manifestRevision: "1.1.0", connectionId: "cxc_hl" },
    action: { id: "hyperliquid_preview_order", access: "prepare", network: "hyperliquid:testnet" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.500Z",
      durationMs: 500,
    },
    observation: {
      source: "hyperliquid.testnet",
      observedAt: "2026-09-01T12:00:00.250Z",
      blockOrVersion: "meta:100",
      ageMs: 250,
      freshnessMaxAgeMs: 5_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"d".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_hl" },
    result: {
      preparedActionId: "hl_preview_1",
      network: "hyperliquid:testnet",
      address: `0x${"3".repeat(40)}`,
      asset: "ETH",
      side: "buy",
      size: "0.01",
      orderType: "limit",
      limitPrice: "3000",
      reduceOnly: false,
      maxSlippageBps: 50,
      notionalUsd: "30",
      accountValueUsd: "100",
      marginUsedUsd: "10",
      projectedReserveUsd: "60",
      effectiveLeverage: "2",
      simulationReference: `sha256:${"e".repeat(64)}`,
      expiresAt: "2026-09-01T12:00:30.000Z",
    },
  });
}

function bittensorResult(
  actionId: "bittensor_prepare_transfer" | "bittensor_prepare_stake" | "bittensor_prepare_unstake",
): MatterhornCryptoAppResult {
  const action = actionId === "bittensor_prepare_transfer"
    ? "transfer"
    : actionId === "bittensor_prepare_stake" ? "stake" : "unstake";
  const transfer = action === "transfer";
  return certifyResult({
    version: "matterhorn.crypto-app-result.v1",
    app: { id: "matterhorn.bittensor-testnet", manifestRevision: "1.1.0", connectionId: "cxc_bittensor" },
    action: { id: actionId, access: "prepare", network: "bittensor:test" },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.500Z",
      durationMs: 500,
    },
    observation: {
      source: "Bittensor testnet pinned SDK simulation",
      observedAt: "2026-09-01T12:00:00.250Z",
      blockOrVersion: "1234567",
      ageMs: 250,
      freshnessMaxAgeMs: 10_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"f".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: `reservation_${action}` },
    result: {
      preparedActionId: `bt_preview_${action}`,
      network: "bittensor:test",
      action,
      sender: BITTENSOR_SENDER,
      destination: transfer ? BITTENSOR_DESTINATION : null,
      hotkey: transfer ? null : BITTENSOR_HOTKEY,
      netuid: transfer ? null : 14,
      amountTao: "0.1",
      availableTao: "10",
      currentStakeTao: transfer ? null : "2",
      expectedAlpha: transfer ? null : "0.19",
      networkFeeTao: "0.0001",
      swapFeeTao: transfer ? null : "0.00005",
      slippageBps: transfer ? null : 25,
      block: 1_234_567,
      simulationReference: `sha256:${"9".repeat(64)}`,
      expiresAt: "2026-09-01T12:00:15.250Z",
    },
  });
}

describe("certified coworker tool executor", () => {
  test("returns a direct certified read only when its exact evidence proof verifies", async () => {
    const guardedRuntime = runtime();
    const coworker = profile("sui", {
      id: "cw_sui_read",
      role: "market_analyst",
      allowedActionIds: ["sui_account_read"],
      automaticAuthorities: ["read"],
      limits: {
        ...profile("sui").limits,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const rawArguments = { address: SENDER };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_sui_get_balance",
      rawArguments,
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      agentId: "matterhorn-sui",
      access: "read",
    });
    const routed: unknown[] = [];
    const expected = suiReadResult();
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async (request) => { routed.push(request); return expected; } },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => workspace(roots.at(-1)!),
      now: () => NOW,
    });

    const modelResult = await execute({
      toolName: "matterhorn_sui_get_balance",
      args: rawArguments,
      authorization: auth,
    });
    expect(modelResult).toEqual({
      version: "matterhorn.crypto-app-model-result.v1",
      app: { id: "matterhorn.sui-testnet" },
      action: { id: "sui_account_read", network: "sui:testnet" },
      observation: expected.observation,
      provenance: {
        trust: "untrusted_external",
        sanitization: "typed_projection",
        delivery: "live",
      },
      result: expected.result,
    });
    expect(JSON.stringify(modelResult)).not.toMatch(
      /cxc_sui|reservation_sui_read|connectionId|reservationId|projectionHash|observationHash|evidenceReference/,
    );
    expect(routed).toEqual([expect.objectContaining({
      workspaceId: "ws_crypto",
      connectionId: "cxc_sui",
      actionId: "sui_account_read",
      network: "sui:testnet",
      arguments: { address: SENDER },
    })]);
  });

  test("rejects a certified read whose tenant connection was substituted", async () => {
    const guardedRuntime = runtime();
    const coworker = profile("sui", {
      id: "cw_sui_read_invalid",
      role: "market_analyst",
      allowedActionIds: ["sui_account_read"],
      automaticAuthorities: ["read"],
      limits: {
        ...profile("sui").limits,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const rawArguments = { address: SENDER };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_sui_get_balance",
      rawArguments,
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      agentId: "matterhorn-sui",
      access: "read",
    });
    const tampered = suiReadResult();
    tampered.app.connectionId = "cxc_other_tenant";
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async () => tampered },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => workspace(roots.at(-1)!),
      now: () => NOW,
    });

    await expect(execute({
      toolName: "matterhorn_sui_get_balance",
      args: rawArguments,
      authorization: auth,
    })).rejects.toThrow("adapter_output_invalid");
  });

  test("turns Sui terms into a tenant-bound wallet review and never submit authority", async () => {
    const guardedRuntime = runtime();
    const coworker = profile("sui");
    const rawArguments = {
      network: "testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
      message: "submit without asking",
    };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_sui_preview_transfer",
      rawArguments,
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      agentId: "matterhorn-sui",
    });
    const routed: unknown[] = [];
    const root = roots.at(-1)!;
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async (request) => { routed.push(request); return suiResult(); } },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => workspace(root),
      readWalletPolicy: () => ({
        version: "matterhorn.wallet.safety-policy.v1",
        maxPerTransactionUSD: 50,
        maxDailySpendUSD: 100,
        mainnetEnabled: false,
        maxSlippageBps: 100,
        preferredNetwork: 84532,
        updatedAt: NOW.toISOString(),
      }),
      now: () => NOW,
    });
    const result = await execute({
      toolName: "matterhorn_sui_preview_transfer",
      args: rawArguments,
      authorization: auth,
    }) as Record<string, any>;
    expect(result).toMatchObject({
      version: "matterhorn.crypto-wallet-review-result.v1",
      status: "wallet_review_required",
      reviewedAction: {
        protocol: "sui",
        operation: "transfer_sui",
        capabilityClass: "wallet_review_only",
      },
      pendingIntent: { state: "wallet_review" },
      walletControl: "connected_wallet_approval_and_submission_required",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private.?key|signature|submitAuthority|cxc_sui|reservation_sui|connectionId|reservationId|runId|intentHash|policyHash|projectionHash|observationHash|cpending_/i,
    );
    expect(routed).toEqual([expect.objectContaining({
      workspaceId: "ws_crypto",
      connectionId: "cxc_sui",
      arguments: { sender: SENDER, recipient: RECIPIENT, amountSui: "1.25" },
      consumedCapability: {
        coworkerId: "cw_sui",
        toolName: "matterhorn_sui_preview_transfer",
        arguments: rawArguments,
      },
    })]);
    expect(guardedRuntime.pendingCryptoIntents.list("ws_crypto", "account_a", "cw_sui")).toHaveLength(1);
    expect(guardedRuntime.pendingCryptoIntents.list("ws_crypto", "account_b", "cw_sui")).toEqual([]);
    const receipt = await guardedRuntime.receipts.get("ws_crypto", String(auth.runId));
    expect(receipt?.reviewedActions).toEqual([expect.objectContaining({
      intentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      policyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
    expect(JSON.stringify(result)).not.toContain(receipt?.reviewedActions[0]?.intentHash ?? "missing");
  });

  test("normalizes and policy-checks Hyperliquid economics before wallet review", async () => {
    const guardedRuntime = runtime();
    const coworker = profile("hyperliquid");
    const rawArguments = {
      network: "testnet",
      address: `0x${"3".repeat(40)}`,
      asset: "eth",
      side: "long",
      size: "0.01",
      orderType: "limit",
      price: "3000",
      reduceOnly: false,
      slippageTolerance: "0.5",
    };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_hyperliquid_preview_order",
      rawArguments,
      manifestRevision: "1.1.0",
      connectionId: "cxc_hl",
      agentId: "matterhorn-hyperliquid",
    });
    const routed: any[] = [];
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async (request) => { routed.push(request); return hyperliquidResult(); } },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => workspace(roots.at(-1)!),
      readWalletPolicy: () => ({
        version: "matterhorn.wallet.safety-policy.v1",
        maxPerTransactionUSD: 50,
        maxDailySpendUSD: 100,
        mainnetEnabled: false,
        maxSlippageBps: 100,
        preferredNetwork: 84532,
        updatedAt: NOW.toISOString(),
      }),
      now: () => NOW,
    });
    const result = await execute({
      toolName: "matterhorn_hyperliquid_preview_order",
      args: rawArguments,
      authorization: auth,
    }) as Record<string, any>;
    expect(result.status).toBe("wallet_review_required");
    expect(result.policy.limits).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "per_action_usd", observed: "30", passed: true }),
      expect.objectContaining({ name: "max_leverage", observed: "2", passed: true }),
    ]));
    expect(routed[0].arguments).toEqual({
      address: `0x${"3".repeat(40)}`,
      asset: "ETH",
      side: "buy",
      size: "0.01",
      orderType: "limit",
      price: "3000",
      reduceOnly: false,
      maxSlippageBps: 50,
    });
  });

  test("routes every certified Bittensor testnet preparation to wallet review", async () => {
    for (const [index, actionId, action] of [
      [1, "bittensor_prepare_transfer", "transfer"],
      [2, "bittensor_prepare_stake", "stake"],
      [3, "bittensor_prepare_unstake", "unstake"],
    ] as const) {
      const transfer = action === "transfer";
      const coworker = profile("bittensor", {
        id: `cw_bittensor_${index}`,
        allowedActionIds: [actionId],
      });
      const rawArguments = {
        action,
        sender: BITTENSOR_SENDER,
        ...(transfer
          ? { destination: BITTENSOR_DESTINATION }
          : { hotkey: BITTENSOR_HOTKEY, netuid: 14 }),
        amountTao: "0.1",
      };
      const guardedRuntime = runtime();
      const auth = await authorization({
        guardedRuntime,
        profile: coworker,
        toolName: "matterhorn_bittensor_prepare_action",
        rawArguments,
        manifestRevision: "1.1.0",
        connectionId: "cxc_bittensor",
        agentId: "matterhorn-bittensor",
      });
      const routed: any[] = [];
      const execute = createMatterhornCertifiedCoworkerToolExecutor({
        router: { execute: async (request) => { routed.push(request); return bittensorResult(actionId); } },
        coworkers: { get: () => coworker },
        guardedRuntime,
        resolveWorkspace: async () => workspace(roots.at(-1)!),
        readWalletPolicy: () => ({
          version: "matterhorn.wallet.safety-policy.v1",
          maxPerTransactionUSD: 50,
          maxDailySpendUSD: 100,
          mainnetEnabled: false,
          maxSlippageBps: 100,
          preferredNetwork: 84532,
          updatedAt: NOW.toISOString(),
        }),
        now: () => NOW,
      });
      const result = await execute({
        toolName: "matterhorn_bittensor_prepare_action",
        args: rawArguments,
        authorization: auth,
      }) as Record<string, any>;
      expect(result).toMatchObject({
        version: "matterhorn.crypto-wallet-review-result.v1",
        status: "wallet_review_required",
        reviewedAction: {
          protocol: "bittensor",
          network: "bittensor:test",
          operation: action,
          capabilityClass: "wallet_review_only",
        },
        pendingIntent: { state: "wallet_review" },
        walletControl: "connected_wallet_approval_and_submission_required",
      });
      expect(result.policy.limits).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "per_action_usd", observed: "0", passed: true }),
      ]));
      expect(routed).toEqual([expect.objectContaining({
        workspaceId: "ws_crypto",
        connectionId: "cxc_bittensor",
        actionId,
        network: "bittensor:test",
        arguments: transfer
          ? { sender: BITTENSOR_SENDER, destination: BITTENSOR_DESTINATION, amountTao: "0.1" }
          : { sender: BITTENSOR_SENDER, hotkey: BITTENSOR_HOTKEY, netuid: 14, amountTao: "0.1" },
      })]);
      expect(JSON.stringify(result)).not.toMatch(
        /private.?key|signature|submitAuthority|cxc_bittensor|reservation_|connectionId|reservationId|runId|intentHash|policyHash|projectionHash|observationHash|cpending_/i,
      );
    }
  });

  test("returns a policy block without creating a wallet ticket when trusted facts are unavailable", async () => {
    const guardedRuntime = runtime();
    const base = profile("sui");
    const coworker = {
      ...base,
      limits: { ...base.limits, minimumReserveUsd: 1 },
    };
    const rawArguments = {
      network: "testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
    };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_sui_preview_transfer",
      rawArguments,
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      agentId: "matterhorn-sui",
    });
    let calls = 0;
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async () => { calls += 1; return suiResult(); } },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => workspace(roots.at(-1)!),
      readWalletPolicy: () => ({
        version: "matterhorn.wallet.safety-policy.v1",
        maxPerTransactionUSD: 50,
        maxDailySpendUSD: 100,
        mainnetEnabled: false,
        maxSlippageBps: 100,
        preferredNetwork: 84532,
        updatedAt: NOW.toISOString(),
      }),
      now: () => NOW,
    });
    const result = await execute({
      toolName: "matterhorn_sui_preview_transfer",
      args: rawArguments,
      authorization: auth,
    }) as Record<string, any>;
    expect(calls).toBe(1);
    expect(result).toMatchObject({
      status: "blocked",
      blocked: true,
      policy: {
        decision: "deny",
        reasonCodes: ["policy_minimum_reserve_usd_exceeded"],
      },
    });
    expect(result.reviewedAction).toBeUndefined();
    expect(result.pendingIntent).toBeUndefined();
    expect(guardedRuntime.pendingCryptoIntents.list("ws_crypto", "account_a", "cw_sui")).toEqual([]);
  });

  test("fails before adapter execution when tenant or coworker authority changes", async () => {
    const guardedRuntime = runtime();
    const coworker = profile("sui");
    const rawArguments = {
      network: "testnet",
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
    };
    const auth = await authorization({
      guardedRuntime,
      profile: coworker,
      toolName: "matterhorn_sui_preview_transfer",
      rawArguments,
      manifestRevision: "1.0.0",
      connectionId: "cxc_sui",
      agentId: "matterhorn-sui",
    });
    let calls = 0;
    const execute = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async () => { calls += 1; return suiResult(); } },
      coworkers: { get: () => ({ ...coworker, revision: 2 }) },
      guardedRuntime,
      resolveWorkspace: async () => workspace(roots.at(-1)!),
      now: () => NOW,
    });
    await expect(execute({
      toolName: "matterhorn_sui_preview_transfer",
      args: rawArguments,
      authorization: auth,
    })).rejects.toThrow("coworker_transaction_authority_changed");
    expect(calls).toBe(0);

    const wrongWorkspace = createMatterhornCertifiedCoworkerToolExecutor({
      router: { execute: async () => { calls += 1; return suiResult(); } },
      coworkers: { get: () => coworker },
      guardedRuntime,
      resolveWorkspace: async () => ({ ...workspace(roots.at(-1)!), id: "ws_other" }),
      now: () => NOW,
    });
    await expect(wrongWorkspace({
      toolName: "matterhorn_sui_preview_transfer",
      args: rawArguments,
      authorization: auth,
    })).rejects.toThrow("coworker_transaction_workspace_mismatch");
    expect(calls).toBe(0);
  });
});
