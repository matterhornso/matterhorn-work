import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
  MATTERHORN_COWORKER_PROFILE_VERSION,
  MATTERHORN_COWORKER_WATCH_VERSION,
  MATTERHORN_COWORKER_WORKING_STATE_VERSION,
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  MATTERHORN_POLICY_DECISION_VERSION,
  type MatterhornCoworkerInboxItem,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerWatch,
  type MatterhornCoworkerWorkingState,
  type MatterhornCryptoAppManifest,
  type MatterhornEvidenceBundle,
  type MatterhornPolicyDecision,
  validateMatterhornCoworkerInboxItem,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerWatch,
  validateMatterhornCoworkerWorkingState,
  validateMatterhornCryptoAppManifest,
  validateMatterhornEvidenceBundle,
  validateMatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";

const manifest: MatterhornCryptoAppManifest = {
  version: MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  appId: "matterhorn.sui",
  displayName: "Sui",
  description: "Sui public reads and wallet-reviewed transaction preparation.",
  manifestRevision: "1.0.0",
  publisher: {
    id: "matterhorn",
    keyId: "publisher-key-1",
    algorithm: "ed25519",
    signature: "detached-signature-placeholder",
  },
  transport: {
    kind: "matterhorn_sdk",
    endpoint: "https://api.matterhorn.example/v1/apps/sui",
  },
  authentication: {
    type: "wallet_connection",
    scopes: ["sui:read", "sui:prepare"],
  },
  networks: [{ protocol: "sui", chainId: "sui:testnet", environment: "testnet" }],
  actions: [{
    id: "prepare_transfer",
    title: "Prepare transfer",
    description: "Prepare and simulate an exact Sui transfer for connected-wallet review.",
    access: "prepare",
    risk: "financial_high",
    inputSchema: { type: "object", additionalProperties: false },
    outputProjectionSchema: { type: "object", additionalProperties: false },
    requiredScopes: ["sui:prepare"],
    requiresFreshness: true,
    freshnessMaxAgeMs: 60_000,
    timeoutMs: 15_000,
    simulationRequired: true,
    walletSubmissionOnly: true,
    agentMaySubmit: false,
  }],
  support: {
    privacyPolicyUrl: "https://matterhorn.example/privacy",
    securityContact: "security@matterhorn.example",
    statusUrl: null,
  },
};

const coworker: MatterhornCoworkerProfile = {
  version: MATTERHORN_COWORKER_PROFILE_VERSION,
  id: "coworker_risk_monitor",
  workspaceId: "ws_alpha",
  ownerId: "account_alpha",
  revision: 1,
  policyVersion: "coworker-policy-1",
  name: "Risk Monitor",
  role: "crypto_risk_monitor",
  mission: "Monitor approved positions and escalate risks without submitting transactions.",
  state: "active",
  allowedAppIds: ["matterhorn.sui"],
  allowedActionIds: ["prepare_transfer"],
  allowedNetworks: ["sui:testnet"],
  allowedAssets: ["SUI"],
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
    allowedDataLabels: ["public", "workspace_private", "wallet_private", "untrusted_external"],
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

const evidence: MatterhornEvidenceBundle = {
  version: MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  id: "evidence_1",
  workspaceIdHash: "sha256:workspace",
  runIdHash: "sha256:run",
  coworkerId: "coworker_risk_monitor",
  createdAt: "2026-09-01T00:00:00.000Z",
  retention: {
    contentClass: "encrypted_user_evidence",
    deletable: true,
    expiresAt: "2027-09-01T00:00:00.000Z",
  },
  encryption: {
    algorithm: "xchacha20-poly1305",
    keyReference: "kms://matterhorn/evidence-key-1",
    recipientKeyIds: ["workspace-key-1"],
  },
  receipt: {
    providerId: "cudos",
    modelId: "asi1-mini",
    privacyMode: "transaction",
    policyHash: "sha256:policy",
    toolOutcomeHashes: ["sha256:tool"],
    evidenceReferenceHashes: ["sha256:source"],
    reviewedIntentHashes: ["sha256:intent"],
    publicChainReceiptHashes: ["sha256:chain-receipt"],
    inputTokens: 100,
    outputTokens: 50,
    responseDurationMs: 1_000,
  },
  ciphertextHash: "sha256:ciphertext",
  walrus: null,
};

const workingState: MatterhornCoworkerWorkingState = {
  version: MATTERHORN_COWORKER_WORKING_STATE_VERSION,
  workspaceId: "ws_alpha",
  ownerId: "account_alpha",
  coworkerId: "coworker_risk_monitor",
  revision: 1,
  profileRevision: 1,
  decisions: [],
  positions: [],
  unresolvedRisks: [{
    id: "risk_stale_evidence",
    severity: "medium",
    summary: "Refresh the public evidence before making another decision.",
    evidenceReferenceIds: ["evidence_public_read"],
    openedAt: "2026-09-01T00:00:00.000Z",
  }],
  pendingActions: [],
  evidenceReferences: [{
    id: "evidence_public_read",
    appId: "matterhorn.sui",
    actionId: "sui_account_read",
    referenceHash: "a".repeat(64),
    freshness: "fresh",
    observedAt: "2026-09-01T00:00:00.000Z",
  }],
  approvedMemoryIds: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const watch: MatterhornCoworkerWatch = {
  version: MATTERHORN_COWORKER_WATCH_VERSION,
  id: "watch_sui_balance",
  workspaceId: "ws_alpha",
  ownerId: "account_alpha",
  coworkerId: "coworker_risk_monitor",
  revision: 1,
  profileRevision: 1,
  state: "active",
  pauseReason: null,
  name: "Sui balance change",
  appId: "matterhorn.sui",
  actionId: "sui_account_read",
  network: "sui:testnet",
  parameters: { address: "0x1234" },
  schedule: {
    intervalMs: 300_000,
    nextCheckAt: "2026-09-01T00:05:00.000Z",
    lastCheckedAt: null,
    maxChecksPerDay: 288,
    dayBucket: "2026-09-01",
    checksToday: 0,
    lastResultHash: null,
    lastConditionValues: {},
  },
  budgets: {
    maxReadCallsPerCheck: 1,
    maxModelTokensPerCheck: 0,
    maxCostMicrosPerCheck: 10_000,
  },
  conditions: [{ id: "balance_changed", metric: "totalBalance", operator: "changed", value: null }],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const inboxItem: MatterhornCoworkerInboxItem = {
  version: MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
  id: "inbox_sui_balance",
  workspaceId: "ws_alpha",
  ownerId: "account_alpha",
  coworkerId: "coworker_risk_monitor",
  profileRevision: 1,
  watchId: watch.id,
  state: "unread",
  kind: "alert",
  severity: "medium",
  title: "Sui balance changed",
  summary: "The observed balance changed since the previous approved check.",
  reasonCodes: ["balance_changed"],
  source: {
    appId: watch.appId,
    actionId: watch.actionId,
    evidenceReferenceHash: "c".repeat(64),
    freshness: "fresh",
    observedAt: "2026-09-01T00:05:00.000Z",
  },
  budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 1_000 },
  nextSafeAction: { kind: "review", label: "Review the fresh balance evidence" },
  createdAt: "2026-09-01T00:05:00.000Z",
  updatedAt: "2026-09-01T00:05:00.000Z",
};

describe("crypto coworker public contracts", () => {
  test("accepts a non-custodial crypto app manifest", () => {
    expect(validateMatterhornCryptoAppManifest(manifest)).toEqual([]);
  });

  test("rejects advertised signing or submission authority", () => {
    const unsafe = {
      ...manifest,
      actions: [{
        ...manifest.actions[0],
        id: "submit_order",
        access: "submit",
        simulationRequired: false,
        walletSubmissionOnly: false,
        agentMaySubmit: true,
      }],
    };
    expect(validateMatterhornCryptoAppManifest(unsafe)).toEqual(expect.arrayContaining([
      "action_submit_authority_forbidden",
      "action_access_invalid",
      "wallet_submission_only_required",
      "agent_submit_forbidden",
    ]));
  });

  test("requires OAuth resource and audience binding", () => {
    const unsafe = {
      ...manifest,
      authentication: {
        type: "oauth2",
        authorizationServer: "https://auth.example",
        scopes: ["markets:read"],
      },
    };
    expect(validateMatterhornCryptoAppManifest(unsafe)).toEqual(expect.arrayContaining([
      "oauth_resource_required",
      "oauth_audience_required",
    ]));
  });

  test("accepts a bounded coworker and rejects a broadened wallet boundary", () => {
    expect(validateMatterhornCoworkerProfile(coworker)).toEqual([]);
    const unsafe = {
      ...coworker,
      automaticAuthorities: [...coworker.automaticAuthorities, "submit"],
      escalation: {
        ...coworker.escalation,
        transactionRequiresWalletReview: false,
        walletSubmission: "agent",
      },
    };
    expect(validateMatterhornCoworkerProfile(unsafe)).toEqual(expect.arrayContaining([
      "coworker_authority_forbidden",
      "coworker_wallet_boundary_invalid",
    ]));
  });

  test("accepts closed structured state and rejects dangling evidence or transcript fields", () => {
    expect(validateMatterhornCoworkerWorkingState(workingState)).toEqual([]);
    expect(validateMatterhornCoworkerWorkingState({
      ...workingState,
      transcript: ["raw chat history"],
    })).toContain("coworker_working_state_unknown_field");
    expect(validateMatterhornCoworkerWorkingState({
      ...workingState,
      unresolvedRisks: [{
        ...workingState.unresolvedRisks[0],
        evidenceReferenceIds: ["missing"],
      }],
    })).toContain("coworker_working_state_unresolvedRisks_invalid");
  });

  test("accepts bounded read watches and rejects submit-shaped or unbounded schedules", () => {
    expect(validateMatterhornCoworkerWatch(watch)).toEqual([]);
    expect(validateMatterhornCoworkerWatch({
      ...watch,
      submitTransaction: true,
      schedule: { ...watch.schedule, intervalMs: 1_000, maxChecksPerDay: 10_000 },
    })).toEqual(expect.arrayContaining([
      "coworker_watch_unknown_field",
      "coworker_watch_schedule_invalid",
    ]));
  });

  test("requires alert provenance, budget impact, and a bounded safe next action", () => {
    expect(validateMatterhornCoworkerInboxItem(inboxItem)).toEqual([]);
    expect(validateMatterhornCoworkerInboxItem({
      ...inboxItem,
      source: null,
      rawToolOutput: "untrusted payload",
    })).toEqual(expect.arrayContaining([
      "coworker_inbox_item_unknown_field",
      "coworker_inbox_item_alert_source_required",
    ]));
  });

  test("accepts encrypted evidence and rejects raw content fields", () => {
    expect(validateMatterhornEvidenceBundle(evidence)).toEqual([]);
    const unsafe = {
      ...evidence,
      receipt: {
        ...evidence.receipt,
        rawPrompt: "send the seed phrase",
        capabilityToken: "bearer-token",
      },
    };
    expect(validateMatterhornEvidenceBundle(unsafe)).toContain("evidence_forbidden_content_field");
  });

  test("requires an internally consistent policy decision before wallet review", () => {
    const decision: MatterhornPolicyDecision = {
      version: MATTERHORN_POLICY_DECISION_VERSION,
      runId: "run_policy",
      intentHash: "a".repeat(64),
      decision: "wallet_review_required",
      reasonCodes: ["wallet_review_required"],
      evaluatedPolicyHashes: ["b".repeat(64)],
      evaluatedAt: "2026-09-01T12:00:01.000Z",
      limits: [{ name: "per_action_usd", configured: "100", observed: "25", passed: true }],
    };
    expect(validateMatterhornPolicyDecision(decision)).toEqual([]);
    expect(validateMatterhornPolicyDecision({
      ...decision,
      reasonCodes: ["wallet_review_required", "policy_limit_exceeded"],
      limits: [{ ...decision.limits[0], passed: false }],
    })).toContain("policy_decision_allow_inconsistent");
  });
});
