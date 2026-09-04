import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_COWORKER_INBOX_ITEM_VERSION,
  MATTERHORN_COWORKER_PROFILE_VERSION,
  MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION,
  MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION,
  MATTERHORN_COWORKER_WATCH_VERSION,
  MATTERHORN_COWORKER_WORKING_STATE_VERSION,
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  MATTERHORN_CRYPTO_APP_OPENAPI_PROFILE_VERSION,
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  MATTERHORN_POLICY_DECISION_VERSION,
  MATTERHORN_WALRUS_PROOF_VERSION,
  MATTERHORN_SUI_EVIDENCE_ANCHOR_VERSION,
  type MatterhornCoworkerInboxItem,
  type MatterhornCoworkerProfile,
  type MatterhornCoworkerResourceRecommendation,
  type MatterhornCoworkerResourceScope,
  type MatterhornCoworkerWatch,
  type MatterhornCoworkerWorkingState,
  type MatterhornCryptoAppManifest,
  type MatterhornEvidenceBundle,
  type MatterhornPolicyDecision,
  type MatterhornWalrusProof,
  type MatterhornSuiEvidenceAnchor,
  validateMatterhornCoworkerInboxItem,
  validateMatterhornCoworkerProfile,
  validateMatterhornCoworkerResourceRecommendation,
  validateMatterhornCoworkerResourceScope,
  validateMatterhornCoworkerWatch,
  validateMatterhornCoworkerWorkingState,
  validateMatterhornCryptoAppManifest,
  validateMatterhornEvidenceBundle,
  validateMatterhornPolicyDecision,
  validateMatterhornWalrusProof,
  validateMatterhornSuiEvidenceAnchor,
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
  workspaceIdHash: "a".repeat(64),
  runIdHash: "b".repeat(64),
  coworkerIdHash: "c".repeat(64),
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
    status: "success",
    providerId: "cudos",
    modelId: "asi1-mini",
    privacyMode: "transaction",
    consent: "single_request",
    dataCategoryHashes: ["d".repeat(64)],
    redactionCount: 1,
    policyHash: "e".repeat(64),
    toolOutcomeHashes: ["f".repeat(64)],
    evidenceReferenceHashes: ["1".repeat(64)],
    reviewedIntentHashes: ["2".repeat(64)],
    publicChainReceiptHashes: ["3".repeat(64)],
    inputTokens: 100,
    outputTokens: 50,
    responseDurationMs: 1_000,
  },
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

const resourceScope: MatterhornCoworkerResourceScope = {
  version: MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION,
  workspaceId: "ws_alpha",
  ownerId: "account_alpha",
  coworkerId: "coworker_risk_monitor",
  revision: 1,
  profileRevision: 1,
  agentFiles: [{
    id: "afile_market_policy",
    revision: 2,
    contentSha256: "4".repeat(64),
    sizeBytes: 1_024,
  }],
  memories: [{
    id: "mem_risk_policy",
    version: "2026-09-01T00:00:00.000Z",
    contentHash: "5".repeat(64),
  }],
  connections: [{
    id: "cxc_sui",
    appId: "matterhorn.sui",
    manifestRevision: "1.0.0",
    actionIds: ["prepare_transfer"],
    networks: ["sui:testnet"],
  }],
  privacy: {
    mode: "private_workspace",
    unverifiedProviderConsent: false,
  },
  scopeHash: "6".repeat(64),
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const resourceRecommendation: MatterhornCoworkerResourceRecommendation = {
  version: MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION,
  workspaceId: "ws_alpha",
  coworkerId: "coworker_risk_monitor",
  profileRevision: 1,
  expectedScopeRevision: 0,
  agentFiles: [{
    id: "afile_market_policy",
    revision: 2,
    name: "market-policy.md",
    reason: "assigned_to_this_coworker",
  }],
  memories: [{
    id: "mem_risk_policy",
    version: "2026-09-01T00:00:00.000Z",
    title: "Sui risk policy",
    matchedTags: ["sui"],
    reason: "matches_approved_topics",
  }],
  connections: [{
    id: "cxc_sui",
    appId: "matterhorn.sui",
    manifestRevision: "1.0.0",
    actionIds: ["prepare_transfer"],
    networks: ["sui:testnet"],
    reason: "matches_approved_app",
  }],
  approval: {
    required: true,
    automaticGrant: false,
    walletSubmission: "connected_wallet_only",
  },
  recommendationHash: "7".repeat(64),
  generatedAt: "2026-09-01T00:00:00.000Z",
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
  connectionBinding: { connectionId: "cxc_sui", manifestRevision: "1.0.0" },
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

  test("binds every profiled OpenAPI action to one exact signed POST path", () => {
    const profiled = structuredClone(manifest);
    profiled.transport = {
      kind: "openapi",
      endpoint: "https://api.matterhorn.example",
      profile: MATTERHORN_CRYPTO_APP_OPENAPI_PROFILE_VERSION,
      operations: [{ actionId: "prepare_transfer", method: "POST", path: "/v1/sui/prepare-transfer" }],
    };
    expect(validateMatterhornCryptoAppManifest(profiled)).toEqual([]);

    const invalidTransports = [
      { ...profiled.transport, endpoint: "https://api.matterhorn.example/base" },
      { ...profiled.transport, operations: [] },
      { ...profiled.transport, operations: [{ actionId: "prepare_other", method: "POST", path: "/v1/sui/prepare-transfer" }] },
      { ...profiled.transport, operations: [{ actionId: "prepare_transfer", method: "GET", path: "/v1/sui/prepare-transfer" }] },
      { ...profiled.transport, operations: [{ actionId: "prepare_transfer", method: "POST", path: "/v1/../submit" }] },
      { ...profiled.transport, operations: [{ actionId: "prepare_transfer", method: "POST", path: "/v1/read?then=submit" }] },
      { ...profiled.transport, operations: [
        { actionId: "prepare_transfer", method: "POST", path: "/v1/sui/prepare-transfer" },
        { actionId: "prepare_transfer", method: "POST", path: "/v1/sui/prepare-again" },
      ] },
    ];
    const expected = [
      "openapi_endpoint_origin_required",
      "openapi_operations_invalid",
      "openapi_operation_coverage_invalid",
      "openapi_operation_invalid",
      "openapi_operation_invalid",
      "openapi_operation_invalid",
      "openapi_operation_duplicate",
    ];
    invalidTransports.forEach((transport, index) => {
      expect(validateMatterhornCryptoAppManifest({ ...profiled, transport })).toContain(expected[index]);
    });
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

  test("rejects hidden manifest authority outside every closed object", () => {
    const unsafe = structuredClone(manifest) as unknown as Record<string, unknown>;
    unsafe.submitTransaction = true;
    unsafe.publisher = { ...(unsafe.publisher as Record<string, unknown>), privateKeyRef: "vault://hidden" };
    unsafe.transport = { ...(unsafe.transport as Record<string, unknown>), fallbackEndpoint: "https://attacker.example/" };
    unsafe.authentication = { ...(unsafe.authentication as Record<string, unknown>), adminScope: true };
    unsafe.networks = [{ ...(unsafe.networks as Record<string, unknown>[])[0], submitRpc: "https://attacker.example/" }];
    unsafe.support = { ...(unsafe.support as Record<string, unknown>), operatorToken: "hidden" };

    expect(validateMatterhornCryptoAppManifest(unsafe)).toEqual(expect.arrayContaining([
      "manifest_unknown_field",
      "publisher_unknown_field",
      "transport_unknown_field",
      "authentication_unknown_field",
      "network_invalid",
      "support_unknown_field",
    ]));
  });

  test("requires canonical public OAuth bindings and bounded unique scopes", () => {
    const valid = {
      ...structuredClone(manifest),
      authentication: {
        type: "oauth2",
        authorizationServer: "https://auth.example",
        resource: "https://api.example",
        audience: "matterhorn:testnet",
        scopes: ["markets:read"],
      },
    };
    expect(validateMatterhornCryptoAppManifest(valid)).toEqual([]);

    const unsafeBindings = [
      { ...valid.authentication, authorizationServer: "https://localhost/" },
      { ...valid.authentication, authorizationServer: "https://auth.example/?tenant=other" },
      { ...valid.authentication, resource: "https://169.254.169.254/" },
      { ...valid.authentication, resource: "https://api.example/#other" },
      { ...valid.authentication, audience: "matterhorn testnet" },
      { ...valid.authentication, scopes: ["markets:read", "markets:read"] },
      { ...valid.authentication, scopes: ["markets:read admin"] },
    ];
    const expectedIssues = [
      "oauth_authorization_server_required",
      "oauth_authorization_server_required",
      "oauth_resource_required",
      "oauth_resource_required",
      "oauth_audience_required",
      "authentication_scopes_invalid",
      "authentication_scopes_invalid",
    ];
    unsafeBindings.forEach((authentication, index) => {
      expect(validateMatterhornCryptoAppManifest({ ...valid, authentication }))
        .toContain(expectedIssues[index]);
    });
  });

  test("requires canonical public transport and support destinations", () => {
    const valid = structuredClone(manifest);
    valid.transport.endpoint = "https://gateway.matterhorn.example";
    valid.support.securityContact = "https://matterhorn.example/security";
    expect(validateMatterhornCryptoAppManifest(valid)).toEqual([]);

    const unsafe = [
      { field: "transport", value: "https://user:password@gateway.matterhorn.example/v1", issue: "transport_https_required" },
      { field: "transport", value: "https://127.0.0.1/v1", issue: "transport_https_required" },
      { field: "transport", value: "https://gateway.matterhorn.example/v1?method=submit", issue: "transport_https_required" },
      { field: "transport", value: "https://gateway.matterhorn.example/safe/../v1", issue: "transport_https_required" },
      { field: "privacy", value: "https://localhost/privacy", issue: "privacy_policy_url_invalid" },
      { field: "status", value: "https://status.matterhorn.example/ok#admin", issue: "status_url_invalid" },
      { field: "contact", value: "security contact", issue: "security_contact_required" },
      { field: "contact", value: "https://169.254.169.254/security", issue: "security_contact_required" },
    ] as const;

    for (const item of unsafe) {
      const candidate = structuredClone(manifest);
      if (item.field === "transport") candidate.transport.endpoint = item.value;
      if (item.field === "privacy") candidate.support.privacyPolicyUrl = item.value;
      if (item.field === "status") candidate.support.statusUrl = item.value;
      if (item.field === "contact") candidate.support.securityContact = item.value;
      expect(validateMatterhornCryptoAppManifest(candidate)).toContain(item.issue);
    }
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

  test("accepts a closed coworker resource scope and rejects content or privacy broadening", () => {
    expect(validateMatterhornCoworkerResourceScope(resourceScope)).toEqual([]);
    expect(validateMatterhornCoworkerResourceScope({
      ...resourceScope,
      rawFileContent: "wallet export",
    })).toContain("coworker_resource_scope_unknown_field");
    expect(validateMatterhornCoworkerResourceScope({
      ...resourceScope,
      privacy: { ...resourceScope.privacy, unverifiedProviderConsent: true },
    })).toContain("coworker_resource_scope_privacy_invalid");
    expect(validateMatterhornCoworkerResourceScope({
      ...resourceScope,
      agentFiles: [resourceScope.agentFiles[0], resourceScope.agentFiles[0]],
    })).toContain("coworker_resource_scope_agent_files_duplicate");
  });

  test("keeps resource recommendations advisory, bounded, and content-free", () => {
    expect(validateMatterhornCoworkerResourceRecommendation(resourceRecommendation)).toEqual([]);
    expect(validateMatterhornCoworkerResourceRecommendation({
      ...resourceRecommendation,
      rawMemoryContent: "private portfolio instructions",
      approval: { ...resourceRecommendation.approval, automaticGrant: true },
    })).toEqual(expect.arrayContaining([
      "coworker_resource_recommendation_unknown_field",
      "coworker_resource_recommendation_approval_invalid",
    ]));
    expect(validateMatterhornCoworkerResourceRecommendation({
      ...resourceRecommendation,
      connections: [resourceRecommendation.connections[0], resourceRecommendation.connections[0]],
    })).toContain("coworker_resource_recommendation_connections_duplicate");
  });

  test("accepts bounded read watches and rejects submit-shaped or unbounded schedules", () => {
    expect(validateMatterhornCoworkerWatch(watch)).toEqual([]);
    const legacyWatch = structuredClone(watch);
    delete legacyWatch.connectionBinding;
    expect(validateMatterhornCoworkerWatch(legacyWatch)).toEqual([]);
    expect(validateMatterhornCoworkerWatch({
      ...watch,
      connectionBinding: { connectionId: "not a valid id", manifestRevision: "" },
    })).toContain("coworker_watch_connection_binding_invalid");
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

  test("keeps Walrus proof metadata separate from the encrypted evidence payload", () => {
    const proof: MatterhornWalrusProof = {
      version: MATTERHORN_WALRUS_PROOF_VERSION,
      network: "testnet",
      blobId: "walrus-blob-public-id",
      suiObjectId: "0x1234",
      certifiedEpoch: 10,
      validUntilEpoch: 20,
      quiltPatchId: null,
      merkleRoot: "4".repeat(64),
      merkleProof: ["5".repeat(64)],
      suiTransactionDigest: null,
    };
    expect(validateMatterhornWalrusProof(proof)).toEqual([]);
    expect(validateMatterhornWalrusProof({
      ...proof,
      validUntilEpoch: 25,
      renewalTransactionDigest: "renewal-public-digest",
      renewedAt: "2026-09-02T00:01:00.000Z",
    })).toEqual([]);
    expect(validateMatterhornWalrusProof({
      ...proof,
      renewalTransactionDigest: "renewal-public-digest",
    })).toContain("walrus_proof_renewal_invalid");
    expect(validateMatterhornWalrusProof({
      ...proof,
      deletionTransactionDigest: "deletion-public-digest",
      deletedAt: "2026-09-02T00:02:00.000Z",
    })).toEqual([]);
    expect(validateMatterhornWalrusProof({
      ...proof,
      deletionTransactionDigest: "deletion-public-digest",
    })).toContain("walrus_proof_deletion_invalid");
    expect(validateMatterhornEvidenceBundle({ ...evidence, walrus: proof })).toContain("evidence_unknown_field");
    expect(validateMatterhornWalrusProof({ ...proof, signer: "wallet-private" })).toContain("walrus_proof_unknown_field");
  });

  test("accepts only bounded non-content immutable Sui evidence anchors", () => {
    const anchor: MatterhornSuiEvidenceAnchor = {
      version: MATTERHORN_SUI_EVIDENCE_ANCHOR_VERSION,
      network: "testnet",
      packageId: `0x${"1".repeat(64)}`,
      objectId: `0x${"2".repeat(64)}`,
      transactionDigest: "4".repeat(44),
      batchId: "3".repeat(64),
      merkleRoot: "4".repeat(64),
      walrusObjectId: `0x${"5".repeat(64)}`,
      certifiedEpoch: 10,
      validUntilEpoch: 20,
      anchoredAt: "2026-09-02T00:00:00.000Z",
    };
    expect(validateMatterhornSuiEvidenceAnchor(anchor)).toEqual([]);
    expect(validateMatterhornSuiEvidenceAnchor({
      ...anchor,
      workspaceId: "ws_private",
      prompt: "private prompt",
      signer: `0x${"6".repeat(64)}`,
    })).toContain("sui_evidence_anchor_unknown_field");
    expect(validateMatterhornSuiEvidenceAnchor({
      ...anchor,
      network: "mainnet",
      validUntilEpoch: 64,
    })).toEqual(expect.arrayContaining([
      "sui_evidence_anchor_network_invalid",
      "sui_evidence_anchor_epoch_invalid",
    ]));
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
