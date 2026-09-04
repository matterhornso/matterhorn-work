import { describe, expect, test } from "bun:test";

import type {
  MatterhornCoworkerProfile,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";

import {
  compileCertifiedCryptoIntent,
  cryptoIntentToReviewedActionHandoffV2,
} from "./crypto-transaction-coordinator.js";
import {
  coworkerTransactionPolicyLayer,
  evaluateMatterhornCryptoIntentPolicy,
  resolveMatterhornTransactionPolicy,
  type MatterhornTransactionExecutionFacts,
  type MatterhornTransactionPolicyLayer,
  type MatterhornTransactionPolicyLayers,
  type MatterhornTransactionPolicyScope,
} from "./crypto-transaction-policy.js";

const NOW = new Date("2026-09-01T12:00:01.000Z");
const SENDER = `0x${"1".repeat(64)}`;
const RECIPIENT = `0x${"2".repeat(64)}`;

type LayerChanges = Omit<Partial<MatterhornTransactionPolicyLayer>, "limits"> & {
  limits?: Partial<MatterhornTransactionPolicyLayer["limits"]>;
};

function layer(
  scope: MatterhornTransactionPolicyScope,
  changes: LayerChanges = {},
): MatterhornTransactionPolicyLayer {
  const limits: MatterhornTransactionPolicyLayer["limits"] = {
    perActionUsd: 100,
    dailyUsd: 500,
    weeklyUsd: 2_000,
    maxSlippageBps: 100,
    maxLeverage: 3,
    minimumReserveUsd: 25,
    maxTransactionsPerHour: 5,
    maxTransactionsPerDay: 20,
  };
  return {
    scope,
    id: `${scope}_policy`,
    subjectId: `${scope}_subject`,
    revision: "1",
    state: "active",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_transfer_preview"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    allowedRecipients: [RECIPIENT],
    deniedRecipients: [],
    blockedRegions: [],
    allowPrepare: true,
    walletSubmissionOnly: true,
    expiresAt: "2026-09-01T12:01:00.000Z",
    ...changes,
    limits: { ...limits, ...changes.limits },
  };
}

function layers(changes: Partial<MatterhornTransactionPolicyLayers> = {}): MatterhornTransactionPolicyLayers {
  return {
    platform: layer("platform"),
    organization: null,
    user: layer("user"),
    coworker: layer("coworker", { limits: { perActionUsd: 50 } }),
    app: layer("app"),
    run: layer("run"),
    capability: layer("capability"),
    ...changes,
  };
}

function certifiedSuiResult(): MatterhornCryptoAppResult {
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

function facts(changes: Partial<MatterhornTransactionExecutionFacts> = {}): MatterhornTransactionExecutionFacts {
  return {
    workspaceId: "ws_alpha",
    runId: "run_sui_prepare",
    coworkerId: "cw_transaction_coordinator",
    notionalUsd: 25,
    dailySpendUsdBefore: 50,
    weeklySpendUsdBefore: 100,
    projectedReserveUsd: 75,
    leverage: null,
    transactionsLastHour: 1,
    transactionsToday: 3,
    regionCode: "ch",
    complianceAllowed: true,
    capability: {
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_transfer_preview",
      access: "prepare",
      useState: "consumed_once",
      expiresAt: "2026-09-01T12:00:10.000Z",
    },
    ...changes,
  };
}

function intentFor(policyHash: string) {
  return compileCertifiedCryptoIntent({
    workspaceId: "ws_alpha",
    runId: "run_sui_prepare",
    coworkerId: "cw_transaction_coordinator",
    policyHash,
    canonicalRequestArguments: {
      sender: SENDER,
      recipient: RECIPIENT,
      amountSui: "1.25",
    },
    result: certifiedSuiResult(),
    now: NOW,
  });
}

describe("deterministic crypto transaction policy", () => {
  test("intersects every policy scope before permitting wallet review", () => {
    const resolved = resolveMatterhornTransactionPolicy(layers({
      user: layer("user", { limits: { perActionUsd: 75, minimumReserveUsd: 50 } }),
    }), NOW);
    expect(resolved.limits).toMatchObject({ perActionUsd: 50, minimumReserveUsd: 50 });
    expect(resolved.evaluatedPolicyHashes).toHaveLength(7);
    const intent = intentFor(resolved.policyHash);
    const decision = evaluateMatterhornCryptoIntentPolicy({ intent, policy: resolved, facts: facts(), now: NOW });
    expect(decision).toMatchObject({
      decision: "wallet_review_required",
      reasonCodes: ["wallet_review_required"],
      runId: intent.runId,
      intentHash: intent.intentHash,
    });
    expect(decision.limits.every((limit) => limit.passed)).toBe(true);
    expect(cryptoIntentToReviewedActionHandoffV2(intent, decision).capabilityClass)
      .toBe("wallet_review_only");
  });

  test("denies recipient, region, value, reserve and velocity violations together", () => {
    const resolved = resolveMatterhornTransactionPolicy(layers({
      platform: layer("platform", {
        deniedRecipients: [RECIPIENT],
        blockedRegions: ["US"],
        limits: {
          perActionUsd: 10,
          dailyUsd: 60,
          weeklyUsd: 110,
          minimumReserveUsd: 100,
          maxTransactionsPerHour: 1,
          maxTransactionsPerDay: 3,
        },
      }),
    }), NOW);
    const intent = intentFor(resolved.policyHash);
    const decision = evaluateMatterhornCryptoIntentPolicy({
      intent,
      policy: resolved,
      facts: facts({ regionCode: "us" }),
      now: NOW,
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "policy_recipient_denied",
      "policy_region_denied",
      "policy_per_action_usd_exceeded",
      "policy_daily_usd_exceeded",
      "policy_weekly_usd_exceeded",
      "policy_minimum_reserve_usd_exceeded",
      "policy_max_transactions_per_hour_exceeded",
      "policy_max_transactions_per_day_exceeded",
    ]));
    expect(() => cryptoIntentToReviewedActionHandoffV2(intent, decision))
      .toThrow("crypto_intent_policy_denied");
  });

  test("fails closed for policy hash, tenant/run and single-use capability mismatches", () => {
    const resolved = resolveMatterhornTransactionPolicy(layers(), NOW);
    const intent = intentFor("f".repeat(64));
    const decision = evaluateMatterhornCryptoIntentPolicy({
      intent,
      policy: resolved,
      facts: facts({
        workspaceId: "ws_other",
        capability: {
          ...facts().capability,
          runId: "run_other",
          expiresAt: "2026-09-01T12:00:00.000Z",
        },
      }),
      now: NOW,
    });
    expect(decision.decision).toBe("deny");
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "policy_hash_mismatch",
      "policy_tenant_or_run_mismatch",
      "policy_capability_binding_mismatch",
      "policy_capability_unavailable",
    ]));

    const correctlyBoundIntent = intentFor(resolved.policyHash);
    const tamperedPolicy = structuredClone(resolved);
    tamperedPolicy.limits.perActionUsd = 1_000_000;
    const tamperedDecision = evaluateMatterhornCryptoIntentPolicy({
      intent: correctlyBoundIntent,
      policy: tamperedPolicy,
      facts: facts(),
      now: NOW,
    });
    expect(tamperedDecision.decision).toBe("deny");
    expect(tamperedDecision.reasonCodes).toContain("policy_integrity_invalid");
  });

  test("derives the coworker layer without weakening inactive or prepare-disabled profiles", () => {
    const profile: MatterhornCoworkerProfile = {
      version: "matterhorn.coworker-profile.v1",
      id: "cw_policy",
      workspaceId: "ws_alpha",
      ownerId: "account_alpha",
      revision: 2,
      policyVersion: "policy.v2",
      name: "Treasury monitor",
      role: "Treasury analyst",
      mission: "Prepare bounded Sui transfers after review.",
      state: "paused",
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_transfer_preview"],
      allowedNetworks: ["sui:testnet"],
      allowedAssets: ["SUI"],
      automaticAuthorities: ["read"],
      limits: {
        perActionUsd: 50,
        dailyUsd: 100,
        weeklyUsd: 500,
        maxSlippageBps: 100,
        maxLeverage: 2,
        minimumReserveUsd: 25,
        maxActiveWatches: 3,
        maxReadCallsPerRun: 8,
        maxPrepareCallsPerFamily: 1,
      },
      privacy: {
        allowedDataLabels: ["public", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
      },
      escalation: {
        privateDataRequiresDisclosure: true,
        transactionRequiresWalletReview: true,
        walletSubmission: "connected_wallet_only",
      },
      createdAt: "2026-09-01T11:00:00.000Z",
      updatedAt: "2026-09-01T11:30:00.000Z",
    };
    expect(coworkerTransactionPolicyLayer(profile)).toMatchObject({
      scope: "coworker",
      state: "deny",
      allowPrepare: false,
      walletSubmissionOnly: true,
    });
  });
});
