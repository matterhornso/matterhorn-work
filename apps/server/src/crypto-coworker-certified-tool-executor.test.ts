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
import { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import type { ManagedMcpToolAuthorization } from "./managed-opencode-mcp.js";
import type { WorkspaceInfo } from "./types.js";

const NOW = new Date("2026-09-01T12:00:01.000Z");
const SENDER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;
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

function profile(protocol: "sui" | "hyperliquid", overrides: Partial<MatterhornCoworkerProfile> = {}): MatterhornCoworkerProfile {
  const sui = protocol === "sui";
  return {
    version: "matterhorn.coworker-profile.v1",
    id: sui ? "cw_sui" : "cw_hl",
    workspaceId: "ws_crypto",
    ownerId: "account_a",
    revision: 1,
    policyVersion: "coworker-policy-1",
    name: sui ? "Sui coworker" : "Hyperliquid coworker",
    role: "wallet_reviewer",
    mission: "Prepare exact terms for connected-wallet review.",
    state: "active",
    allowedAppIds: [sui ? "matterhorn.sui-testnet" : "matterhorn.hyperliquid-testnet"],
    allowedActionIds: [sui ? "sui_transfer_preview" : "hyperliquid_preview_order"],
    allowedNetworks: [sui ? "sui:testnet" : "hyperliquid:testnet"],
    allowedAssets: [sui ? "SUI" : "ETH"],
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

async function authorization(input: {
  guardedRuntime: MatterhornGuardedAgentRuntime;
  profile: MatterhornCoworkerProfile;
  toolName: string;
  rawArguments: Record<string, unknown>;
  manifestRevision: string;
  connectionId: string;
  agentId: string;
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
        access: "prepare",
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
  return {
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
  };
}

function hyperliquidResult(): MatterhornCryptoAppResult {
  return {
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
  };
}

describe("certified coworker tool executor", () => {
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
      pendingIntent: { state: "wallet_review", revision: 1 },
    });
    expect(JSON.stringify(result)).not.toMatch(/private.?key|signature|submitAuthority/i);
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
      intentHash: result.reviewedAction.intentHash,
      policyHash: result.reviewedAction.policyHash,
    })]);
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
