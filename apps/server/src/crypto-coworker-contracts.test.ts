import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_COWORKER_PROFILE_VERSION,
  MATTERHORN_CRYPTO_APP_MANIFEST_VERSION,
  MATTERHORN_EVIDENCE_BUNDLE_VERSION,
  type MatterhornCoworkerProfile,
  type MatterhornCryptoAppManifest,
  type MatterhornEvidenceBundle,
  validateMatterhornCoworkerProfile,
  validateMatterhornCryptoAppManifest,
  validateMatterhornEvidenceBundle,
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
});
