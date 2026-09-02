import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_COWORKER_PROFILE_VERSION,
  type MatterhornCoworkerProfile,
} from "@matterhorn-work/types/crypto-coworkers";

import { compileCoworkerResourceRecommendation } from "./coworker-resource-recommendation.js";

function profile(
  privacyLabels: MatterhornCoworkerProfile["privacy"]["allowedDataLabels"] = [
    "public",
    "workspace_private",
    "untrusted_external",
  ],
): MatterhornCoworkerProfile {
  return {
    version: MATTERHORN_COWORKER_PROFILE_VERSION,
    id: "coworker_sui_guard",
    workspaceId: "ws_alpha",
    ownerId: "account_alpha",
    revision: 3,
    policyVersion: "coworker-policy-1",
    name: "Sui Guard",
    role: "crypto_operator",
    mission: "Research Sui and prepare exact wallet-reviewed actions.",
    state: "active",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read", "sui_transfer_prepare"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI", "USDC"],
    automaticAuthorities: ["read", "watch", "prepare", "write_note"],
    limits: {
      perActionUsd: 100,
      dailyUsd: 250,
      weeklyUsd: 1_000,
      maxSlippageBps: 100,
      maxLeverage: 1,
      minimumReserveUsd: 50,
      maxActiveWatches: 10,
      maxReadCallsPerRun: 12,
      maxPrepareCallsPerFamily: 1,
    },
    privacy: {
      allowedDataLabels: privacyLabels,
      allowUnverifiedProviderConsent: false,
    },
    escalation: {
      privateDataRequiresDisclosure: true,
      transactionRequiresWalletReview: true,
      walletSubmission: "connected_wallet_only",
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function compile(overrides: Partial<Parameters<typeof compileCoworkerResourceRecommendation>[0]> = {}) {
  return compileCoworkerResourceRecommendation({
    workspaceId: "ws_alpha",
    ownerId: "account_alpha",
    profile: profile(),
    expectedScopeRevision: 0,
    files: [{
      id: "afile_assigned",
      revision: 2,
      name: "sui-policy.md",
      contentSha256: "a".repeat(64),
      sizeBytes: 1_024,
      coworkerIds: ["coworker_sui_guard"],
    }, {
      id: "afile_other_coworker",
      revision: 1,
      name: "private-plan.md",
      contentSha256: "b".repeat(64),
      sizeBytes: 2_048,
      coworkerIds: ["coworker_other"],
    }],
    memories: [{
      id: "mem_sui_risk",
      version: "2026-09-01T00:00:00.000Z",
      title: "Sui risk limits",
      contentHash: "c".repeat(64),
      tags: ["SUI", "risk"],
      canUseInChat: true,
      sensitivity: "private",
    }, {
      id: "mem_secret",
      version: "2026-09-01T00:00:00.000Z",
      title: "Never disclose",
      contentHash: "d".repeat(64),
      tags: ["sui"],
      canUseInChat: true,
      sensitivity: "forbidden_secret",
    }, {
      id: "mem_unrelated",
      version: "2026-09-01T00:00:00.000Z",
      title: "Unrelated notes",
      contentHash: "e".repeat(64),
      tags: ["marketing"],
      canUseInChat: true,
      sensitivity: "private",
    }],
    connections: [{
      id: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      state: "active",
      availability: "available",
      grantedActionIds: ["sui_account_read", "sui_transfer_prepare", "sui_submit"],
      grantedNetworks: ["sui:testnet", "sui:mainnet"],
    }, {
      id: "cxc_paused",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      state: "paused",
      availability: "available",
      grantedActionIds: ["sui_account_read"],
      grantedNetworks: ["sui:testnet"],
    }, {
      id: "cxc_wrong_app",
      appId: "matterhorn.hyperliquid-testnet",
      manifestRevision: "1.0.0",
      state: "active",
      availability: "available",
      grantedActionIds: ["sui_account_read"],
      grantedNetworks: ["sui:testnet"],
    }],
    now: new Date("2026-09-03T00:00:00.000Z"),
    ...overrides,
  });
}

describe("coworker resource recommendation compiler", () => {
  test("suggests only tenant-approved, assigned, content-free resources", () => {
    const recommendation = compile();

    expect(recommendation.agentFiles).toEqual([{
      id: "afile_assigned",
      revision: 2,
      name: "sui-policy.md",
      reason: "assigned_to_this_coworker",
    }]);
    expect(recommendation.memories).toEqual([{
      id: "mem_sui_risk",
      version: "2026-09-01T00:00:00.000Z",
      title: "Sui risk limits",
      matchedTags: ["sui"],
      reason: "matches_approved_topics",
    }]);
    expect(recommendation.connections).toEqual([{
      id: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionIds: ["sui_account_read", "sui_transfer_prepare"],
      networks: ["sui:testnet"],
      reason: "matches_approved_app",
    }]);
    expect(recommendation.approval).toEqual({
      required: true,
      automaticGrant: false,
      walletSubmission: "connected_wallet_only",
    });
    expect(JSON.stringify(recommendation)).not.toContain("contentHash");
    expect(JSON.stringify(recommendation)).not.toContain("contentSha256");
    expect(JSON.stringify(recommendation)).not.toContain("sui_submit");
  });

  test("does not suggest private resources to a public-only coworker", () => {
    const recommendation = compile({ profile: profile(["public", "untrusted_external"]) });

    expect(recommendation.agentFiles).toEqual([]);
    expect(recommendation.memories).toEqual([]);
    expect(recommendation.connections.map((connection) => connection.id)).toEqual(["cxc_sui"]);
  });

  test("binds the recommendation hash to resource and scope revisions", () => {
    const baseline = compile();
    const changedFile = compile({
      files: [{
        id: "afile_assigned",
        revision: 2,
        name: "sui-policy.md",
        contentSha256: "f".repeat(64),
        sizeBytes: 1_024,
        coworkerIds: ["coworker_sui_guard"],
      }],
    });
    const changedScope = compile({ expectedScopeRevision: 1 });
    const changedMemory = compile({
      memories: [{
        id: "mem_sui_risk",
        version: "2026-09-02T00:00:00.000Z",
        title: "Sui risk limits",
        contentHash: "9".repeat(64),
        tags: ["sui"],
        canUseInChat: true,
        sensitivity: "private",
      }],
    });
    const changedConnection = compile({
      connections: [{
        id: "cxc_sui",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.1",
        state: "active",
        availability: "available",
        grantedActionIds: ["sui_account_read", "sui_transfer_prepare"],
        grantedNetworks: ["sui:testnet"],
      }],
    });

    expect(changedFile.recommendationHash).not.toBe(baseline.recommendationHash);
    expect(changedScope.recommendationHash).not.toBe(baseline.recommendationHash);
    expect(changedMemory.recommendationHash).not.toBe(baseline.recommendationHash);
    expect(changedConnection.recommendationHash).not.toBe(baseline.recommendationHash);
  });
});
