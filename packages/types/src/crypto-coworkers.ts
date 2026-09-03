export const MATTERHORN_CRYPTO_APP_MANIFEST_VERSION = "matterhorn.crypto-app-manifest.v1";
export const MATTERHORN_CRYPTO_APP_CONNECTION_VERSION = "matterhorn.crypto-app-connection.v1";
export const MATTERHORN_CRYPTO_APP_WALLET_CHALLENGE_VERSION = "matterhorn.crypto-app-wallet-challenge.v1";
export const MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION = "matterhorn.crypto-app-oauth-flow.v1";
export const MATTERHORN_CRYPTO_APP_RESULT_VERSION = "matterhorn.crypto-app-result.v1";
export const MATTERHORN_CRYPTO_APP_CATALOG_VERSION = "matterhorn.crypto-app-catalog.v1";
export const MATTERHORN_COWORKER_PROFILE_VERSION = "matterhorn.coworker-profile.v1";
export const MATTERHORN_COWORKER_WORKING_STATE_VERSION = "matterhorn.coworker-working-state.v1";
export const MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION = "matterhorn.coworker-resource-scope.v1";
export const MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION =
  "matterhorn.coworker-resource-recommendation.v1";
export const MATTERHORN_COWORKER_WATCH_VERSION = "matterhorn.coworker-watch.v1";
export const MATTERHORN_COWORKER_INBOX_ITEM_VERSION = "matterhorn.coworker-inbox-item.v1";
export const MATTERHORN_CRYPTO_INTENT_VERSION = "matterhorn.crypto-intent.v1";
export const MATTERHORN_POLICY_DECISION_VERSION = "matterhorn.policy-decision.v1";
export const MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION = "matterhorn.crypto-public-receipt.v1";
export const MATTERHORN_EVIDENCE_BUNDLE_VERSION = "matterhorn.evidence-bundle.v1";
export const MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION = "matterhorn.encrypted-evidence-envelope.v1";
export const MATTERHORN_WALRUS_CIPHERTEXT_VERSION = "matterhorn.walrus-ciphertext.v1";
export const MATTERHORN_WALRUS_PROOF_VERSION = "matterhorn.walrus-proof.v1";

export type MatterhornCryptoAppActionAccess = "read" | "watch" | "prepare" | "simulate";
export type MatterhornCryptoAppActionRisk = "informational" | "private_data" | "financial_low" | "financial_high";
export type MatterhornCryptoAppTransportKind = "mcp_http" | "openapi" | "rpc" | "matterhorn_sdk";
export type MatterhornCryptoAppNetworkEnvironment = "testnet" | "mainnet";

export type MatterhornCryptoAppOAuth = {
  type: "oauth2";
  authorizationServer: string;
  resource: string;
  audience: string;
  scopes: string[];
};

export type MatterhornCryptoAppAuthentication = MatterhornCryptoAppOAuth | {
  type: "api_key_vault" | "wallet_connection" | "none";
  scopes: string[];
};

export type MatterhornCryptoAppAction = {
  id: string;
  title: string;
  description: string;
  access: MatterhornCryptoAppActionAccess;
  risk: MatterhornCryptoAppActionRisk;
  inputSchema: Record<string, unknown>;
  outputProjectionSchema: Record<string, unknown>;
  requiredScopes: string[];
  requiresFreshness: boolean;
  freshnessMaxAgeMs: number | null;
  timeoutMs: number;
  simulationRequired: boolean;
  /** Financial submission is always completed by the connected wallet UI. */
  walletSubmissionOnly: true;
  /** This invariant prevents an adapter from advertising model-controlled submission. */
  agentMaySubmit: false;
};

export type MatterhornCryptoAppManifest = {
  version: typeof MATTERHORN_CRYPTO_APP_MANIFEST_VERSION;
  appId: string;
  displayName: string;
  description: string;
  manifestRevision: string;
  publisher: {
    id: string;
    keyId: string;
    algorithm: "ed25519";
    signature: string;
  };
  transport: {
    kind: MatterhornCryptoAppTransportKind;
    endpoint: string;
  };
  authentication: MatterhornCryptoAppAuthentication;
  networks: Array<{
    protocol: string;
    chainId: string;
    environment: MatterhornCryptoAppNetworkEnvironment;
  }>;
  actions: MatterhornCryptoAppAction[];
  support: {
    privacyPolicyUrl: string;
    securityContact: string;
    statusUrl: string | null;
  };
};

export type MatterhornCryptoAppConnectionState = "active" | "paused" | "revoked";

export type MatterhornCryptoAppConnectionCredential =
  | { type: "oauth2" | "api_key_vault"; secretReference: string }
  | { type: "wallet_connection"; walletConnectionId: string }
  | { type: "none" };

/** Internal tenant record. Account-facing views must omit opaque references. */
export type MatterhornCryptoAppConnection = {
  version: typeof MATTERHORN_CRYPTO_APP_CONNECTION_VERSION;
  id: string;
  workspaceId: string;
  appId: string;
  manifestRevision: string;
  state: MatterhornCryptoAppConnectionState;
  grantedActionIds: string[];
  grantedScopes: string[];
  grantedNetworks: string[];
  credential: MatterhornCryptoAppConnectionCredential;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MatterhornCryptoAppConnectionView = Omit<MatterhornCryptoAppConnection, "credential" | "createdBy"> & {
  credential: {
    type: MatterhornCryptoAppConnectionCredential["type"];
    connected: boolean;
  };
  availability: "available" | "certification_unavailable";
};

export type MatterhornCryptoAppWalletFamily = "evm" | "sui";

/**
 * A short-lived message that proves control of one connected wallet. Signing
 * this message never authorizes a transaction, token approval, or submission.
 */
export type MatterhornCryptoAppWalletChallenge = {
  version: typeof MATTERHORN_CRYPTO_APP_WALLET_CHALLENGE_VERSION;
  challengeId: string;
  walletFamily: MatterhornCryptoAppWalletFamily;
  message: string;
  expiresAt: string;
  notice: "proves_wallet_control_only";
};

export type MatterhornCryptoAppWalletChallengeRequest = {
  appId: string;
  grantedActionIds: string[];
  grantedScopes: string[];
  grantedNetworks: string[];
  walletFamily: MatterhornCryptoAppWalletFamily;
  walletAddress: string;
};

export type MatterhornCryptoAppWalletChallengeConfirmation = {
  walletAddress: string;
  signature: string;
};

export type MatterhornCryptoAppOAuthAuthorizationRequest = {
  appId: string;
  grantedActionIds: string[];
  grantedScopes: string[];
  grantedNetworks: string[];
};

export type MatterhornCryptoAppOAuthAuthorization = {
  version: typeof MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION;
  flowId: string;
  authorizationUrl: string;
  expiresAt: string;
  notice: "connects_selected_app_only";
};

export type MatterhornCryptoAppOAuthFlowStatus = {
  version: typeof MATTERHORN_CRYPTO_APP_OAUTH_FLOW_VERSION;
  flowId: string;
  status: "pending" | "connected" | "failed" | "expired";
  connectionId: string | null;
  error: "authorization_denied" | "connection_failed" | null;
  expiresAt: string;
};

export type MatterhornCryptoAppCatalogActionView = {
  id: string;
  title: string;
  description: string;
  access: MatterhornCryptoAppActionAccess;
  risk: MatterhornCryptoAppActionRisk;
  requiredScopes: string[];
  requiresFreshness: boolean;
  freshnessMaxAgeMs: number | null;
  timeoutMs: number;
  simulationRequired: boolean;
  walletSubmissionOnly: true;
  agentMaySubmit: false;
};

export type MatterhornCryptoAppCatalogSummary = {
  version: typeof MATTERHORN_CRYPTO_APP_CATALOG_VERSION;
  appId: string;
  displayName: string;
  description: string;
  manifestRevision: string;
  manifestHash: string;
  certification: {
    state: "certified_testnet" | "certified_mainnet";
    reportHash: string;
    runtimeReportHash: string;
    policyVersion: string;
    updatedAt: string;
  };
  authentication: {
    type: MatterhornCryptoAppAuthentication["type"];
    scopes: string[];
    connectionRequired: boolean;
  };
  networks: Array<{
    protocol: string;
    chainId: string;
    environment: MatterhornCryptoAppNetworkEnvironment;
  }>;
  actions: MatterhornCryptoAppCatalogActionView[];
  support: {
    privacyPolicyUrl: string;
    statusUrl: string | null;
  };
};

export type MatterhornCryptoAppCatalogDetail = MatterhornCryptoAppCatalogSummary & {
  actionSchemas: Array<{
    actionId: string;
    inputSchema: Record<string, unknown>;
    outputProjectionSchema: Record<string, unknown>;
  }>;
};

export type MatterhornCryptoAppResult = {
  version: typeof MATTERHORN_CRYPTO_APP_RESULT_VERSION;
  app: {
    id: string;
    manifestRevision: string;
    connectionId: string;
  };
  action: {
    id: string;
    access: MatterhornCryptoAppActionAccess;
    network: string;
  };
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  observation: {
    source: string;
    observedAt: string | null;
    blockOrVersion: string | null;
    ageMs: number | null;
    freshnessMaxAgeMs: number | null;
  };
  provenance: {
    trust: "untrusted_external";
    sanitization: "typed_projection" | "quarantined";
    evidenceReference: string;
  };
  metering: {
    costMicros: number;
    reservationId: string;
  };
  result: unknown;
};

export type MatterhornCoworkerState = "active" | "paused" | "revoked";
export type MatterhornCoworkerAuthority = "read" | "watch" | "prepare" | "write_note";
export type MatterhornCoworkerTemplateId =
  | "market_analyst"
  | "risk_monitor"
  | "transaction_coordinator"
  | "treasury_coworker";

export type MatterhornCoworkerProfile = {
  version: typeof MATTERHORN_COWORKER_PROFILE_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
  revision: number;
  policyVersion: string;
  name: string;
  role: string;
  mission: string;
  state: MatterhornCoworkerState;
  allowedAppIds: string[];
  allowedActionIds: string[];
  allowedNetworks: string[];
  allowedAssets: string[];
  automaticAuthorities: MatterhornCoworkerAuthority[];
  limits: {
    perActionUsd: number;
    dailyUsd: number;
    weeklyUsd: number;
    maxSlippageBps: number;
    maxLeverage: number;
    minimumReserveUsd: number;
    maxActiveWatches: number;
    maxReadCallsPerRun: number;
    maxPrepareCallsPerFamily: number;
  };
  privacy: {
    allowedDataLabels: Array<"public" | "workspace_private" | "wallet_private" | "untrusted_external">;
    allowUnverifiedProviderConsent: boolean;
  };
  escalation: {
    privateDataRequiresDisclosure: true;
    transactionRequiresWalletReview: true;
    walletSubmission: "connected_wallet_only";
  };
  createdAt: string;
  updatedAt: string;
};

export type MatterhornCoworkerWorkingState = {
  version: typeof MATTERHORN_COWORKER_WORKING_STATE_VERSION;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  revision: number;
  profileRevision: number;
  decisions: Array<{
    id: string;
    summary: string;
    status: "active" | "superseded";
    evidenceReferenceIds: string[];
    decidedAt: string;
  }>;
  positions: Array<{
    id: string;
    appId: string;
    network: string;
    asset: string;
    side: "long" | "short" | "neutral" | "unknown";
    size: string | null;
    evidenceReferenceId: string;
    observedAt: string;
  }>;
  unresolvedRisks: Array<{
    id: string;
    severity: "low" | "medium" | "high" | "critical";
    summary: string;
    evidenceReferenceIds: string[];
    openedAt: string;
  }>;
  pendingActions: Array<{
    id: string;
    intentHash: string;
    status: "needs_context" | "wallet_review" | "expired" | "cancelled";
    expiresAt: string;
  }>;
  evidenceReferences: Array<{
    id: string;
    appId: string;
    actionId: string;
    referenceHash: string;
    freshness: "fresh" | "stale" | "unknown";
    observedAt: string;
  }>;
  approvedMemoryIds: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * A closed, user-approved resource boundary for one coworker. The scope stores
 * only immutable identifiers, revisions, and hashes. It never stores file or
 * Memory content, credentials, wallet secrets, signatures, or submission
 * authority.
 */
export type MatterhornCoworkerResourceScope = {
  version: typeof MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  revision: number;
  profileRevision: number;
  agentFiles: Array<{
    id: string;
    revision: number;
    contentSha256: string;
    sizeBytes: number;
  }>;
  memories: Array<{
    id: string;
    version: string;
    contentHash: string;
  }>;
  connections: Array<{
    id: string;
    appId: string;
    manifestRevision: string;
    actionIds: string[];
    networks: string[];
  }>;
  privacy: {
    mode: "private_workspace";
    unverifiedProviderConsent: false;
  };
  scopeHash: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A server-generated, advisory-only sandbox proposal. It contains resource
 * identity and display metadata, never file or Memory content, credentials,
 * wallet material, or transaction authority. The server recomputes the
 * recommendation before accepting it, and the user must explicitly save it.
 */
export type MatterhornCoworkerResourceRecommendation = {
  version: typeof MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION;
  workspaceId: string;
  coworkerId: string;
  profileRevision: number;
  expectedScopeRevision: number;
  agentFiles: Array<{
    id: string;
    revision: number;
    name: string;
    reason: "assigned_to_this_coworker";
  }>;
  memories: Array<{
    id: string;
    version: string;
    title: string;
    matchedTags: string[];
    reason: "matches_approved_topics";
  }>;
  connections: Array<{
    id: string;
    appId: string;
    manifestRevision: string;
    actionIds: string[];
    networks: string[];
    reason: "matches_approved_app";
  }>;
  approval: {
    required: true;
    automaticGrant: false;
    walletSubmission: "connected_wallet_only";
  };
  recommendationHash: string;
  generatedAt: string;
};

export type MatterhornCoworkerWatchState = "active" | "paused";

export type MatterhornCoworkerWatch = {
  version: typeof MATTERHORN_COWORKER_WATCH_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  revision: number;
  profileRevision: number;
  state: MatterhornCoworkerWatchState;
  pauseReason: "user_paused" | "coworker_paused" | "profile_changed" | "app_disconnected" | null;
  name: string;
  appId: string;
  actionId: string;
  network: string;
  /**
   * Exact user-approved app connection used by this schedule. Older local
   * records may omit the binding; those records remain readable but must fail
   * closed before a scheduled adapter call.
   */
  connectionBinding?: {
    connectionId: string;
    manifestRevision: string;
  };
  parameters: Record<string, string | number | boolean | null>;
  schedule: {
    intervalMs: number;
    nextCheckAt: string;
    lastCheckedAt: string | null;
    maxChecksPerDay: number;
    dayBucket: string;
    checksToday: number;
    lastResultHash: string | null;
    lastConditionValues: Record<string, string | null>;
  };
  budgets: {
    maxReadCallsPerCheck: number;
    maxModelTokensPerCheck: number;
    maxCostMicrosPerCheck: number;
  };
  conditions: Array<{
    id: string;
    metric: string;
    operator: "gt" | "gte" | "lt" | "lte" | "eq" | "changed";
    value: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type MatterhornCoworkerWatchCreateInput = Pick<
  MatterhornCoworkerWatch,
  "profileRevision" | "name" | "appId" | "actionId" | "network" | "parameters" | "budgets" | "conditions"
> & {
  connectionId: string;
  schedule: Pick<MatterhornCoworkerWatch["schedule"], "intervalMs" | "maxChecksPerDay">;
};

export type MatterhornCoworkerInboxItem = {
  version: typeof MATTERHORN_COWORKER_INBOX_ITEM_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
  coworkerId: string;
  profileRevision: number;
  watchId: string | null;
  state: "unread" | "read" | "dismissed";
  kind: "alert" | "question" | "notice";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  reasonCodes: string[];
  source: {
    appId: string;
    actionId: string;
    evidenceReferenceHash: string;
    freshness: "fresh" | "stale" | "unknown";
    observedAt: string;
  } | null;
  budgetImpact: {
    readCallsConsumed: number;
    modelTokensConsumed: number;
    costMicros: number;
  };
  nextSafeAction: {
    kind: "review" | "open_chat" | "pause_watch" | "none";
    label: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type MatterhornCryptoIntent = {
  version: typeof MATTERHORN_CRYPTO_INTENT_VERSION;
  id: string;
  runId: string;
  coworkerId: string;
  workspaceId: string;
  appId: string;
  connectionId: string;
  actionId: string;
  protocol: string;
  network: string;
  signer: string | null;
  operation: string;
  asset: string | null;
  amount: string | null;
  recipient: string | null;
  slippageBps: number | null;
  canonicalArguments: Record<string, unknown>;
  authorizedArgumentsHash: string;
  canonicalArgumentsHash: string;
  policyHash: string;
  simulation: {
    reference: string;
    blockOrVersion: string | null;
    simulatedAt: string;
    validUntil: string;
  };
  intentHash: string;
  capabilityClass: "wallet_review_only";
  preparedAt: string;
  expiresAt: string;
};

export type MatterhornPolicyDecision = {
  version: typeof MATTERHORN_POLICY_DECISION_VERSION;
  runId: string;
  intentHash: string;
  decision: "allow_prepare" | "wallet_review_required" | "deny";
  reasonCodes: string[];
  evaluatedPolicyHashes: string[];
  evaluatedAt: string;
  limits: Array<{
    name: string;
    configured: string;
    observed: string;
    passed: boolean;
  }>;
};

export type MatterhornCryptoPublicReceipt = {
  version: typeof MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION;
  intentHash: string;
  protocol: "sui" | "hyperliquid" | "bittensor" | "polymarket";
  network: string;
  status: "submitted" | "confirmed" | "failed";
  publicId: string;
  transactionHash: string | null;
  blockHash: string | null;
  observedAt: string;
  verification: {
    kind: "wallet_reported_public_metadata" | "public_chain";
    chainVerified: boolean;
  };
  evidenceHash: string;
};

export type MatterhornWalrusProof = {
  version: typeof MATTERHORN_WALRUS_PROOF_VERSION;
  network: "testnet" | "mainnet";
  blobId: string;
  suiObjectId: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
  quiltPatchId: string | null;
  merkleRoot: string;
  merkleProof: string[];
  suiTransactionDigest: string | null;
  renewalTransactionDigest?: string;
  renewedAt?: string;
  deletionTransactionDigest?: string;
  deletedAt?: string;
};

export const MATTERHORN_EVIDENCE_VERIFICATION_VERSION =
  "matterhorn.evidence-verification.v1" as const;

export type MatterhornEvidenceVerificationStatus = {
  status: "verified" | "sealed_local" | "key_destroyed" | "deleted" | "expired" | "failed";
  verifiedAt: string;
  checks: {
    tenantScope: true;
    ciphertextHash: boolean;
    merkleInclusion: boolean;
    suiCertification: boolean;
    walrusReadback: boolean;
  };
  currentEpoch: number | null;
  reason: string | null;
};

/**
 * Account-facing, shareable verification packet for encrypted coworker
 * evidence. It intentionally excludes tenant identifiers, prompts, key
 * references, wrapped keys, signatures, wallet addresses, and ciphertext.
 */
export type MatterhornEvidenceVerificationPacket = {
  version: typeof MATTERHORN_EVIDENCE_VERIFICATION_VERSION;
  evidenceId: string;
  state: "sealed" | "published" | "key_destroyed";
  revision: number;
  ciphertextSha256: string;
  merkleLeaf: string;
  createdAt: string;
  updatedAt: string;
  retention: {
    deletable: boolean;
    expiresAt: string | null;
    keyAvailable: boolean;
  };
  /** True when the Walrus Blob object was transferred to a user wallet. */
  walletLifecycleReady: boolean;
  publication: MatterhornWalrusProof | null;
  /** Last server-side check of this exact evidence revision. */
  lastVerification: MatterhornEvidenceVerificationStatus | null;
};

export type MatterhornEvidenceVerificationResult = {
  version: typeof MATTERHORN_EVIDENCE_VERIFICATION_VERSION;
  evidence: MatterhornEvidenceVerificationPacket;
  verification: MatterhornEvidenceVerificationStatus;
};

export type MatterhornEvidenceVerificationListResponse = {
  mode: "off" | "testnet";
  available: boolean;
  publicationAvailable: boolean;
  renewalAvailable: boolean;
  deletionAvailable: boolean;
  items: MatterhornEvidenceVerificationPacket[];
};

export type MatterhornEvidencePublicationResponse = {
  item: MatterhornEvidenceVerificationPacket;
  disclosure: {
    network: "testnet";
    stored: "encrypted_bytes_only";
    ownership: "connected_wallet_only";
    publicBytesMayRemainAfterDeletion: true;
    deletionDestroysRecoveryKey: true;
  };
};

export type MatterhornEvidenceRecoveryKeyDeletionResponse = {
  item: MatterhornEvidenceVerificationPacket;
  deletion: {
    recoveryKeyDestroyed: true;
    contentRecoverable: false;
    publicCiphertextMayRemain: boolean;
  };
};

export const MATTERHORN_CRYPTO_EVIDENCE_WALRUS_RENEWAL_VERSION =
  "matterhorn.crypto-evidence-walrus-renewal.v1" as const;

export type MatterhornCryptoEvidenceWalrusRenewalPreview = {
  version: typeof MATTERHORN_CRYPTO_EVIDENCE_WALRUS_RENEWAL_VERSION;
  intentId: string;
  intentHash: string;
  evidenceId: string;
  evidenceRevision: number;
  network: "testnet";
  signer: string;
  blobId: string;
  suiObjectId: string;
  currentEpoch: number;
  previousValidUntilEpoch: number;
  extensionEpochs: number;
  targetValidUntilEpoch: number;
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
  expiresAt: string;
  walletAuthority: "connected_wallet_only";
};

export type MatterhornCryptoEvidenceWalrusRenewalPrepareResponse = {
  preview: MatterhornCryptoEvidenceWalrusRenewalPreview;
  disclosure: {
    network: "testnet";
    paymentAsset: "WAL";
    signingAndSubmission: "connected_wallet_only";
    agentAuthority: "none";
  };
};

export type MatterhornCryptoEvidenceWalrusRenewalConfirmResponse = {
  item: MatterhornEvidenceVerificationPacket;
  verification: MatterhornEvidenceVerificationStatus;
};

export const MATTERHORN_CRYPTO_EVIDENCE_WALRUS_DELETION_VERSION =
  "matterhorn.crypto-evidence-walrus-deletion.v1" as const;

export type MatterhornCryptoEvidenceWalrusDeletionPreview = {
  version: typeof MATTERHORN_CRYPTO_EVIDENCE_WALRUS_DELETION_VERSION;
  intentId: string;
  intentHash: string;
  evidenceId: string;
  evidenceRevision: number;
  network: "testnet";
  signer: string;
  blobId: string;
  suiObjectId: string;
  ciphertextSha256: string;
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
  expiresAt: string;
  walletAuthority: "connected_wallet_only";
};

export type MatterhornCryptoEvidenceWalrusDeletionPrepareResponse = {
  preview: MatterhornCryptoEvidenceWalrusDeletionPreview;
  disclosure: {
    network: "testnet";
    walletAction: "delete_walrus_blob";
    signingAndSubmission: "connected_wallet_only";
    agentAuthority: "none";
    recoveryKeyDestroyedAfterConfirmation: true;
    publicTransactionMayRemain: true;
  };
};

export type MatterhornCryptoEvidenceWalrusDeletionConfirmResponse = {
  item: MatterhornEvidenceVerificationPacket;
  verification: MatterhornEvidenceVerificationStatus;
  deletion: {
    walrusDeletionConfirmed: true;
    recoveryKeyDestroyed: true;
    contentRecoverable: false;
    publicTransactionMayRemain: true;
  };
};

export const MATTERHORN_AGENT_FILE_VERSION = "matterhorn.agent-file.v1";

/**
 * Provider-neutral, pre-storage description of one user-selected file. Files
 * remain data only: they cannot declare tools, connectors, permissions, wallet
 * authority, or executable behavior.
 */
export type MatterhornAgentFileDescriptor = {
  version: typeof MATTERHORN_AGENT_FILE_VERSION;
  name: string;
  kind: "text" | "table" | "json";
  mimeType: "text/plain" | "text/markdown" | "text/csv" | "application/json";
  sizeBytes: number;
  contentSha256: string;
  dataLabel: "workspace_private";
  access: {
    coworkerIds: string[];
    readOnly: true;
  };
  retention: {
    expiresAt: string | null;
    deletable: true;
  };
  security: {
    scan: "passed";
    executable: false;
    walletAuthority: "none";
  };
};

export type MatterhornAgentFileScanResult = {
  decision: "allow" | "blocked";
  descriptor: MatterhornAgentFileDescriptor | null;
  issues: string[];
};

export type MatterhornAgentFileContextProjection = {
  file: MatterhornAgentFileDescriptor;
  text: string;
  truncated: boolean;
  originalCharacters: number;
};

export const MATTERHORN_STORED_AGENT_FILE_VERSION = "matterhorn.stored-agent-file.v1";
export const MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION =
  "matterhorn.agent-file-walrus-publication.v1";

export type MatterhornAgentFileWalrusPublication = {
  version: typeof MATTERHORN_AGENT_FILE_WALRUS_PUBLICATION_VERSION;
  network: "testnet";
  blobId: string;
  suiObjectId: string;
  ciphertextSha256: string;
  certifiedEpoch: number;
  validUntilEpoch: number;
  suiTransactionDigest: string | null;
  renewalTransactionDigest?: string;
  renewedAt?: string;
  publishedAt: string;
  verifiedAt: string;
};

export type MatterhornWalrusStorageLifecycle = {
  status: "healthy" | "renewal_due" | "expired";
  remainingEpochs: number;
  renewBeforeEpoch: number;
  renewalAuthority: "wallet_or_infrastructure_only";
};

export type MatterhornAgentFileWalrusVerification = {
  verified: true;
  network: "testnet";
  blobId: string;
  suiObjectId: string;
  ciphertextSha256: string;
  certifiedEpoch: number;
  currentEpoch: number;
  validUntilEpoch: number;
  verifiedAt: string;
  lifecycle: MatterhornWalrusStorageLifecycle;
};

export const MATTERHORN_AGENT_FILE_WALRUS_RENEWAL_VERSION =
  "matterhorn.agent-file-walrus-renewal.v1";

export type MatterhornAgentFileWalrusRenewalPreview = {
  version: typeof MATTERHORN_AGENT_FILE_WALRUS_RENEWAL_VERSION;
  intentId: string;
  intentHash: string;
  fileId: string;
  fileRevision: number;
  network: "testnet";
  signer: string;
  blobId: string;
  suiObjectId: string;
  currentEpoch: number;
  previousValidUntilEpoch: number;
  extensionEpochs: number;
  targetValidUntilEpoch: number;
  transactionBytesBase64: string;
  transactionDigest: string;
  simulationReference: string;
  simulatedAt: string;
  expiresAt: string;
  walletAuthority: "connected_wallet_only";
};

export type MatterhornAgentFileWalrusRenewalPrepareResponse = {
  preview: MatterhornAgentFileWalrusRenewalPreview;
  disclosure: {
    network: "testnet";
    paymentAsset: "WAL";
    signingAndSubmission: "connected_wallet_only";
    agentAuthority: "none";
  };
};

export type MatterhornAgentFileWalrusRenewalConfirmResponse = {
  item: MatterhornStoredAgentFile;
  verification: MatterhornAgentFileWalrusVerification;
};

export type MatterhornStoredAgentFile = {
  version: typeof MATTERHORN_STORED_AGENT_FILE_VERSION;
  id: string;
  revision: number;
  file: MatterhornAgentFileDescriptor;
  publication: MatterhornAgentFileWalrusPublication | null;
  createdAt: string;
  updatedAt: string;
};

export type MatterhornAgentFileListResponse = {
  mode: "off" | "encrypted";
  available: boolean;
  cloudBackup: {
    available: boolean;
    network: "testnet" | null;
    renewalAvailable: boolean;
  };
  items: MatterhornStoredAgentFile[];
};

export type MatterhornEvidenceBundle = {
  version: typeof MATTERHORN_EVIDENCE_BUNDLE_VERSION;
  id: string;
  workspaceIdHash: string;
  runIdHash: string;
  coworkerIdHash: string;
  createdAt: string;
  retention: {
    contentClass: "security_receipt" | "encrypted_user_evidence";
    deletable: boolean;
    expiresAt: string | null;
  };
  encryption: {
    algorithm: "aes-256-gcm" | "xchacha20-poly1305";
    keyReference: string;
    recipientKeyIds: string[];
  };
  receipt: {
    status: "success" | "partial" | "cancelled" | "error";
    providerId: string;
    modelId: string;
    privacyMode: "public_research" | "private_workspace" | "transaction";
    consent: "not_required" | "single_request";
    dataCategoryHashes: string[];
    redactionCount: number;
    policyHash: string;
    toolOutcomeHashes: string[];
    evidenceReferenceHashes: string[];
    reviewedIntentHashes: string[];
    publicChainReceiptHashes: string[];
    inputTokens: number;
    outputTokens: number;
    responseDurationMs: number;
  };
};

export type MatterhornEncryptedEvidenceEnvelope = {
  version: typeof MATTERHORN_ENCRYPTED_EVIDENCE_ENVELOPE_VERSION;
  algorithm: "aes-256-gcm";
  keyReference: string;
  payloadHash: string;
  ciphertextHash: string;
  merkleLeaf: string;
  iv: string;
  authenticationTag: string;
  ciphertext: string;
};

/** Public Walrus payload. Key references and plaintext hashes stay tenant-local. */
export type MatterhornWalrusCiphertext = {
  version: typeof MATTERHORN_WALRUS_CIPHERTEXT_VERSION;
  algorithm: "aes-256-gcm";
  iv: string;
  authenticationTag: string;
  ciphertext: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function canonicalPublicHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const canonicalRootWithoutSlash = parsed.pathname === "/"
      && !parsed.search
      && !parsed.hash
      ? parsed.origin
      : null;
    return (parsed.href === value || canonicalRootWithoutSlash === value)
      && parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      && (!parsed.port || parsed.port === "443")
      && Boolean(hostname)
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local")
      && !hostname.endsWith(".internal")
      && !hostname.endsWith(".home.arpa")
      && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
      && !hostname.includes(":");
  } catch {
    return false;
  }
}

const SAFE_ACTION_ACCESS: readonly string[] = ["read", "watch", "prepare", "simulate"];
const SAFE_ACTION_RISK: readonly string[] = ["informational", "private_data", "financial_low", "financial_high"];
const SAFE_TRANSPORTS: readonly string[] = ["mcp_http", "openapi", "rpc", "matterhorn_sdk"];
const SAFE_AUTH_TYPES: readonly string[] = ["oauth2", "api_key_vault", "wallet_connection", "none"];
const MANIFEST_KEYS: readonly string[] = [
  "version",
  "appId",
  "displayName",
  "description",
  "manifestRevision",
  "publisher",
  "transport",
  "authentication",
  "networks",
  "actions",
  "support",
];
const PUBLISHER_KEYS: readonly string[] = ["id", "keyId", "algorithm", "signature"];
const TRANSPORT_KEYS: readonly string[] = ["kind", "endpoint"];
const AUTHENTICATION_KEYS: readonly string[] = ["type", "scopes"];
const OAUTH_AUTHENTICATION_KEYS: readonly string[] = [
  "type",
  "authorizationServer",
  "resource",
  "audience",
  "scopes",
];
const NETWORK_KEYS: readonly string[] = ["protocol", "chainId", "environment"];
const SUPPORT_KEYS: readonly string[] = ["privacyPolicyUrl", "securityContact", "statusUrl"];
const ACTION_KEYS: readonly string[] = [
  "id",
  "title",
  "description",
  "access",
  "risk",
  "inputSchema",
  "outputProjectionSchema",
  "requiredScopes",
  "requiresFreshness",
  "freshnessMaxAgeMs",
  "timeoutMs",
  "simulationRequired",
  "walletSubmissionOnly",
  "agentMaySubmit",
];
const FORBIDDEN_ACTION_AUTHORITY_TOKENS = new Set([
  "sign",
  "signed",
  "signing",
  "submit",
  "submitted",
  "submission",
  "relay",
  "relayed",
  "broadcast",
  "broadcasted",
]);
const PREPARATION_ACTION_TOKENS = new Set(["draft", "prepare", "preview", "quote", "simulate", "simulation"]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,159}$/;
const SAFE_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,159}$/;
const SAFE_AUDIENCE = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,511}$/;
const SAFE_SECURITY_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "accountid",
  "attachment",
  "authorization",
  "prompt",
  "rawprompt",
  "response",
  "rawresponse",
  "message",
  "systemprompt",
  "email",
  "privatekey",
  "seedphrase",
  "signature",
  "signedpayload",
  "walletaddress",
  "walletsignature",
  "walletexport",
  "workspaceid",
  "runid",
  "coworkerid",
  "capabilitytoken",
  "rawtooloutput",
]);

function hasForbiddenActionAuthority(actionId: string): boolean {
  const tokens = actionId.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => FORBIDDEN_ACTION_AUTHORITY_TOKENS.has(token)
    || /^(?:submit|relay|broadcast)(?:transaction|order|message|payload|tx|call)$/.test(token)
    || /^(?:sign|signed|signing)(?:transaction|order|message|payload|typeddata|bytes|tx)$/.test(token))) {
    return true;
  }
  const hasPreparationBoundary = tokens.some((token) => PREPARATION_ACTION_TOKENS.has(token));
  if (hasPreparationBoundary) return false;
  return tokens.some((token, index) => (
    ["send", "execute", "place", "cancel"].includes(token)
    && ["transaction", "order"].includes(tokens[index + 1] ?? "")
  ));
}

export function validateMatterhornCryptoAppManifest(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["manifest_not_object"];
  if (!hasOnlyKeys(value, MANIFEST_KEYS)) issues.push("manifest_unknown_field");
  if (value.version !== MATTERHORN_CRYPTO_APP_MANIFEST_VERSION) issues.push("manifest_version_invalid");
  if (!isNonEmptyString(value.appId) || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value.appId)) issues.push("app_id_invalid");
  if (!isNonEmptyString(value.displayName) || value.displayName.length > 120 || CONTROL_CHARACTER.test(value.displayName)) issues.push("display_name_required");
  if (!isNonEmptyString(value.description) || value.description.length > 2_000 || CONTROL_CHARACTER.test(value.description)) issues.push("description_required");
  if (!isNonEmptyString(value.manifestRevision) || !SAFE_IDENTIFIER.test(value.manifestRevision)) issues.push("manifest_revision_required");

  if (!isRecord(value.publisher)) issues.push("publisher_required");
  else {
    if (!hasOnlyKeys(value.publisher, PUBLISHER_KEYS)) issues.push("publisher_unknown_field");
    if (!isNonEmptyString(value.publisher.id) || !SAFE_IDENTIFIER.test(value.publisher.id)) issues.push("publisher_id_required");
    if (!isNonEmptyString(value.publisher.keyId) || !SAFE_IDENTIFIER.test(value.publisher.keyId)) issues.push("publisher_key_id_required");
    if (value.publisher.algorithm !== "ed25519") issues.push("publisher_algorithm_invalid");
    if (!isNonEmptyString(value.publisher.signature)
      || value.publisher.signature.length > 1_024
      || CONTROL_CHARACTER.test(value.publisher.signature)
      || /PRIVATE KEY|seed phrase|mnemonic/i.test(value.publisher.signature)) issues.push("publisher_signature_required");
  }

  if (!isRecord(value.transport)) issues.push("transport_required");
  else {
    if (!hasOnlyKeys(value.transport, TRANSPORT_KEYS)) issues.push("transport_unknown_field");
    if (!isNonEmptyString(value.transport.kind) || !SAFE_TRANSPORTS.includes(value.transport.kind)) issues.push("transport_kind_invalid");
    if (!canonicalPublicHttpsUrl(value.transport.endpoint)) issues.push("transport_https_required");
  }

  if (!isRecord(value.authentication)) issues.push("authentication_required");
  else {
    const authenticationKeys = value.authentication.type === "oauth2"
      ? OAUTH_AUTHENTICATION_KEYS
      : AUTHENTICATION_KEYS;
    if (!hasOnlyKeys(value.authentication, authenticationKeys)) issues.push("authentication_unknown_field");
    if (!isNonEmptyString(value.authentication.type) || !SAFE_AUTH_TYPES.includes(value.authentication.type)) issues.push("authentication_type_invalid");
    if (!isStringArray(value.authentication.scopes)
      || value.authentication.scopes.length > 64
      || new Set(value.authentication.scopes).size !== value.authentication.scopes.length
      || value.authentication.scopes.some((scope) => scope !== scope.trim() || !SAFE_SCOPE.test(scope))) issues.push("authentication_scopes_invalid");
    if (value.authentication.type === "oauth2") {
      if (!canonicalPublicHttpsUrl(value.authentication.authorizationServer)) issues.push("oauth_authorization_server_required");
      if (!canonicalPublicHttpsUrl(value.authentication.resource)) issues.push("oauth_resource_required");
      if (!isNonEmptyString(value.authentication.audience)
        || value.authentication.audience !== value.authentication.audience.trim()
        || !SAFE_AUDIENCE.test(value.authentication.audience)) issues.push("oauth_audience_required");
    }
  }

  if (!Array.isArray(value.networks) || value.networks.length === 0 || value.networks.length > 32) issues.push("networks_required");
  else {
    for (const network of value.networks) {
      if (!isRecord(network)
        || !hasOnlyKeys(network, NETWORK_KEYS)
        || !isNonEmptyString(network.protocol)
        || !SAFE_IDENTIFIER.test(network.protocol)
        || !isNonEmptyString(network.chainId)
        || !SAFE_IDENTIFIER.test(network.chainId)
        || (network.environment !== "testnet" && network.environment !== "mainnet")) {
        issues.push("network_invalid");
      }
    }
  }

  const actionIds = new Set<string>();
  if (!Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 128) issues.push("actions_required");
  else {
    for (const action of value.actions) {
      if (!isRecord(action)) {
        issues.push("action_invalid");
        continue;
      }
      if (!hasOnlyKeys(action, ACTION_KEYS)) issues.push("action_unknown_field");
      if (!isNonEmptyString(action.id) || !/^[a-z0-9][a-z0-9_]{2,127}$/.test(action.id)) issues.push("action_id_invalid");
      else {
        if (actionIds.has(action.id)) issues.push("action_id_duplicate");
        actionIds.add(action.id);
        if (hasForbiddenActionAuthority(action.id)) issues.push("action_submit_authority_forbidden");
      }
      if (!isNonEmptyString(action.title) || action.title.length > 160 || CONTROL_CHARACTER.test(action.title)) issues.push("action_title_required");
      if (!isNonEmptyString(action.description) || action.description.length > 2_000 || CONTROL_CHARACTER.test(action.description)) issues.push("action_description_required");
      if (!isNonEmptyString(action.access) || !SAFE_ACTION_ACCESS.includes(action.access)) issues.push("action_access_invalid");
      if (!isNonEmptyString(action.risk) || !SAFE_ACTION_RISK.includes(action.risk)) issues.push("action_risk_invalid");
      if (!isRecord(action.inputSchema)) issues.push("action_input_schema_invalid");
      if (!isRecord(action.outputProjectionSchema)) issues.push("action_output_schema_invalid");
      if (!isStringArray(action.requiredScopes)
        || action.requiredScopes.length > 64
        || new Set(action.requiredScopes).size !== action.requiredScopes.length
        || action.requiredScopes.some((scope) => scope !== scope.trim() || !SAFE_SCOPE.test(scope))) issues.push("action_scopes_invalid");
      if (typeof action.requiresFreshness !== "boolean") issues.push("action_freshness_invalid");
      if ((action.requiresFreshness === true
        && (!Number.isSafeInteger(action.freshnessMaxAgeMs) || Number(action.freshnessMaxAgeMs) <= 0))
        || (action.requiresFreshness === false && action.freshnessMaxAgeMs !== null)) {
        issues.push("action_freshness_age_invalid");
      }
      if (!Number.isSafeInteger(action.timeoutMs) || Number(action.timeoutMs) < 1_000 || Number(action.timeoutMs) > 60_000) {
        issues.push("action_timeout_invalid");
      }
      if (typeof action.simulationRequired !== "boolean") issues.push("action_simulation_flag_invalid");
      if ((action.access === "prepare" || action.access === "simulate") && action.simulationRequired !== true) issues.push("financial_simulation_required");
      if (action.walletSubmissionOnly !== true) issues.push("wallet_submission_only_required");
      if (action.agentMaySubmit !== false) issues.push("agent_submit_forbidden");
    }
  }

  if (!isRecord(value.support)) issues.push("support_required");
  else {
    if (!hasOnlyKeys(value.support, SUPPORT_KEYS)) issues.push("support_unknown_field");
    if (!canonicalPublicHttpsUrl(value.support.privacyPolicyUrl)) issues.push("privacy_policy_url_invalid");
    if (!isNonEmptyString(value.support.securityContact)
      || value.support.securityContact.length > 320
      || value.support.securityContact !== value.support.securityContact.trim()
      || CONTROL_CHARACTER.test(value.support.securityContact)
      || (!SAFE_SECURITY_EMAIL.test(value.support.securityContact)
        && !canonicalPublicHttpsUrl(value.support.securityContact))) issues.push("security_contact_required");
    if (value.support.statusUrl !== null
      && !canonicalPublicHttpsUrl(value.support.statusUrl)) issues.push("status_url_invalid");
  }

  return [...new Set(issues)];
}

export function validateMatterhornCoworkerProfile(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_not_object"];
  if (value.version !== MATTERHORN_COWORKER_PROFILE_VERSION) issues.push("coworker_version_invalid");
  const profileKeys = [
    "version", "id", "workspaceId", "ownerId", "revision", "policyVersion", "name", "role", "mission",
    "state", "allowedAppIds", "allowedActionIds", "allowedNetworks", "allowedAssets", "automaticAuthorities",
    "limits", "privacy", "escalation", "createdAt", "updatedAt",
  ];
  if (!hasOnlyKeys(value, profileKeys)) issues.push("coworker_unknown_field");
  for (const key of ["id", "workspaceId", "ownerId", "policyVersion", "name", "role", "mission", "createdAt", "updatedAt"]) {
    if (!isNonEmptyString(value[key])) issues.push(`coworker_${key}_required`);
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) issues.push("coworker_revision_invalid");
  if (typeof value.name === "string" && value.name.length > 80) issues.push("coworker_name_invalid");
  if (typeof value.role === "string" && value.role.length > 80) issues.push("coworker_role_invalid");
  if (typeof value.mission === "string" && value.mission.length > 2_000) issues.push("coworker_mission_invalid");
  if (typeof value.policyVersion === "string" && !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(value.policyVersion)) issues.push("coworker_policy_version_invalid");
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof value[key] === "string" && !Number.isFinite(Date.parse(value[key] as string))) issues.push(`coworker_${key}_invalid`);
  }
  if (value.state !== "active" && value.state !== "paused" && value.state !== "revoked") issues.push("coworker_state_invalid");
  for (const key of ["allowedAppIds", "allowedActionIds", "allowedNetworks", "allowedAssets", "automaticAuthorities"]) {
    if (!isStringArray(value[key])
      || (value[key] as string[]).length > 64
      || new Set(value[key] as string[]).size !== (value[key] as string[]).length
      || (value[key] as string[]).some((item) => item.length > 160)) issues.push(`coworker_${key}_invalid`);
  }
  if (Array.isArray(value.automaticAuthorities)) {
    const safeAuthorities: readonly string[] = ["read", "watch", "prepare", "write_note"];
    if (value.automaticAuthorities.some((authority) => !isNonEmptyString(authority) || !safeAuthorities.includes(authority))) issues.push("coworker_authority_forbidden");
  }
  const limitKeys = ["perActionUsd", "dailyUsd", "weeklyUsd", "maxSlippageBps", "maxLeverage", "minimumReserveUsd", "maxActiveWatches", "maxReadCallsPerRun", "maxPrepareCallsPerFamily"];
  if (!isRecord(value.limits) || !hasOnlyKeys(value.limits, limitKeys)) issues.push("coworker_limits_required");
  else {
    const maxima: Record<string, number> = {
      perActionUsd: 1_000_000_000,
      dailyUsd: 10_000_000_000,
      weeklyUsd: 10_000_000_000,
      maxSlippageBps: 10_000,
      maxLeverage: 100,
      minimumReserveUsd: 10_000_000_000,
      maxActiveWatches: 100,
      maxReadCallsPerRun: 12,
      maxPrepareCallsPerFamily: 2,
    };
    for (const key of limitKeys) {
      const limit = value.limits[key];
      if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0 || limit > maxima[key]!) issues.push(`coworker_limit_${key}_invalid`);
    }
    for (const key of ["maxSlippageBps", "maxActiveWatches", "maxReadCallsPerRun", "maxPrepareCallsPerFamily"]) {
      if (!Number.isSafeInteger(value.limits[key])) issues.push(`coworker_limit_${key}_invalid`);
    }
  }
  const privacyLabels = ["public", "workspace_private", "wallet_private", "untrusted_external"];
  if (!isRecord(value.privacy)
    || !hasOnlyKeys(value.privacy, ["allowedDataLabels", "allowUnverifiedProviderConsent"])
    || !isStringArray(value.privacy.allowedDataLabels)
    || value.privacy.allowedDataLabels.some((label) => !privacyLabels.includes(label))
    || new Set(value.privacy.allowedDataLabels).size !== value.privacy.allowedDataLabels.length
    || typeof value.privacy.allowUnverifiedProviderConsent !== "boolean") issues.push("coworker_privacy_invalid");
  if (!isRecord(value.escalation)
    || !hasOnlyKeys(value.escalation, ["privateDataRequiresDisclosure", "transactionRequiresWalletReview", "walletSubmission"])
    || value.escalation.privateDataRequiresDisclosure !== true
    || value.escalation.transactionRequiresWalletReview !== true
    || value.escalation.walletSubmission !== "connected_wallet_only") {
    issues.push("coworker_wallet_boundary_invalid");
  }
  return [...new Set(issues)];
}

export function validateMatterhornCoworkerWorkingState(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_working_state_not_object"];
  const topLevelKeys = [
    "version", "workspaceId", "ownerId", "coworkerId", "revision", "profileRevision",
    "decisions", "positions", "unresolvedRisks", "pendingActions", "evidenceReferences",
    "approvedMemoryIds", "createdAt", "updatedAt",
  ];
  if (!hasOnlyKeys(value, topLevelKeys)) issues.push("coworker_working_state_unknown_field");
  if (value.version !== MATTERHORN_COWORKER_WORKING_STATE_VERSION) issues.push("coworker_working_state_version_invalid");
  for (const key of ["workspaceId", "ownerId", "coworkerId"]) {
    if (!isNonEmptyString(value[key]) || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(value[key] as string)) {
      issues.push(`coworker_working_state_${key}_invalid`);
    }
  }
  for (const key of ["revision", "profileRevision"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) issues.push(`coworker_working_state_${key}_invalid`);
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (!isNonEmptyString(value[key]) || !Number.isFinite(Date.parse(value[key] as string))) {
      issues.push(`coworker_working_state_${key}_invalid`);
    }
  }

  const validText = (text: unknown, max: number) => isNonEmptyString(text)
    && text.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 160)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validDate = (date: unknown) => typeof date === "string"
    && isNonEmptyString(date)
    && Number.isFinite(Date.parse(date));
  const validHash = (hash: unknown) => typeof hash === "string" && /^(?:sha256:)?[a-f0-9]{64}$/i.test(hash);
  const validReferenceIds = (ids: unknown) => isStringArray(ids)
    && ids.length <= 16
    && new Set(ids).size === ids.length
    && ids.every(validId);
  const validateList = (
    key: string,
    max: number,
    validate: (item: Record<string, unknown>) => boolean,
  ): Record<string, unknown>[] => {
    const list = value[key];
    if (!Array.isArray(list) || list.length > max || list.some((item) => !isRecord(item) || !validate(item))) {
      issues.push(`coworker_working_state_${key}_invalid`);
      return [];
    }
    const ids = list.map((item) => (item as Record<string, unknown>).id);
    if (new Set(ids).size !== ids.length) issues.push(`coworker_working_state_${key}_duplicate`);
    return list as Record<string, unknown>[];
  };

  const evidence = validateList("evidenceReferences", 64, (item) => hasOnlyKeys(item, [
    "id", "appId", "actionId", "referenceHash", "freshness", "observedAt",
  ])
    && validId(item.id)
    && validId(item.appId)
    && validId(item.actionId)
    && validHash(item.referenceHash)
    && ["fresh", "stale", "unknown"].includes(String(item.freshness))
    && validDate(item.observedAt));
  const evidenceIds = new Set(evidence.map((item) => String(item.id)));
  validateList("decisions", 24, (item) => hasOnlyKeys(item, [
    "id", "summary", "status", "evidenceReferenceIds", "decidedAt",
  ])
    && validId(item.id)
    && validText(item.summary, 500)
    && ["active", "superseded"].includes(String(item.status))
    && validReferenceIds(item.evidenceReferenceIds)
    && (item.evidenceReferenceIds as string[]).every((id) => evidenceIds.has(id))
    && validDate(item.decidedAt));
  validateList("positions", 32, (item) => hasOnlyKeys(item, [
    "id", "appId", "network", "asset", "side", "size", "evidenceReferenceId", "observedAt",
  ])
    && validId(item.id)
    && validId(item.appId)
    && validText(item.network, 160)
    && validText(item.asset, 128)
    && ["long", "short", "neutral", "unknown"].includes(String(item.side))
    && (item.size === null || validText(item.size, 64))
    && validId(item.evidenceReferenceId)
    && evidenceIds.has(String(item.evidenceReferenceId))
    && validDate(item.observedAt));
  validateList("unresolvedRisks", 24, (item) => hasOnlyKeys(item, [
    "id", "severity", "summary", "evidenceReferenceIds", "openedAt",
  ])
    && validId(item.id)
    && ["low", "medium", "high", "critical"].includes(String(item.severity))
    && validText(item.summary, 500)
    && validReferenceIds(item.evidenceReferenceIds)
    && (item.evidenceReferenceIds as string[]).every((id) => evidenceIds.has(id))
    && validDate(item.openedAt));
  validateList("pendingActions", 16, (item) => hasOnlyKeys(item, ["id", "intentHash", "status", "expiresAt"])
    && validId(item.id)
    && validHash(item.intentHash)
    && ["needs_context", "wallet_review", "expired", "cancelled"].includes(String(item.status))
    && validDate(item.expiresAt));

  if (!isStringArray(value.approvedMemoryIds)
    || value.approvedMemoryIds.length > 32
    || new Set(value.approvedMemoryIds).size !== value.approvedMemoryIds.length
    || value.approvedMemoryIds.some((id) => !validId(id))) {
    issues.push("coworker_working_state_approvedMemoryIds_invalid");
  }
  return [...new Set(issues)];
}

export function validateMatterhornCoworkerResourceScope(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_resource_scope_not_object"];
  const topLevelKeys = [
    "version", "workspaceId", "ownerId", "coworkerId", "revision", "profileRevision",
    "agentFiles", "memories", "connections", "privacy", "scopeHash", "createdAt", "updatedAt",
  ];
  if (!hasOnlyKeys(value, topLevelKeys)) issues.push("coworker_resource_scope_unknown_field");
  if (value.version !== MATTERHORN_COWORKER_RESOURCE_SCOPE_VERSION) {
    issues.push("coworker_resource_scope_version_invalid");
  }
  const validText = (text: unknown, max: number) => isNonEmptyString(text)
    && text.length <= max
    && !/[\u0000-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 256)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validHash = (hash: unknown) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
  const validDate = (date: unknown) => typeof date === "string" && Number.isFinite(Date.parse(date));
  for (const key of ["workspaceId", "ownerId", "coworkerId"]) {
    if (!validId(value[key])) issues.push(`coworker_resource_scope_${key}_invalid`);
  }
  for (const key of ["revision", "profileRevision"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) {
      issues.push(`coworker_resource_scope_${key}_invalid`);
    }
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (!validDate(value[key])) issues.push(`coworker_resource_scope_${key}_invalid`);
  }
  if (!validHash(value.scopeHash)) issues.push("coworker_resource_scope_hash_invalid");
  if (!isRecord(value.privacy)
    || !hasOnlyKeys(value.privacy, ["mode", "unverifiedProviderConsent"])
    || value.privacy.mode !== "private_workspace"
    || value.privacy.unverifiedProviderConsent !== false) {
    issues.push("coworker_resource_scope_privacy_invalid");
  }

  const agentFiles = value.agentFiles;
  if (!Array.isArray(agentFiles) || agentFiles.length > 8 || agentFiles.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "revision", "contentSha256", "sizeBytes"])
    || !validId(item.id)
    || !Number.isSafeInteger(item.revision)
    || Number(item.revision) < 1
    || !validHash(item.contentSha256)
    || !Number.isSafeInteger(item.sizeBytes)
    || Number(item.sizeBytes) < 1
    || Number(item.sizeBytes) > 10 * 1_024 * 1_024
  ))) {
    issues.push("coworker_resource_scope_agent_files_invalid");
  } else if (new Set(agentFiles.map((item) => String(item.id))).size !== agentFiles.length) {
    issues.push("coworker_resource_scope_agent_files_duplicate");
  }

  const memories = value.memories;
  if (!Array.isArray(memories) || memories.length > 8 || memories.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "version", "contentHash"])
    || !validId(item.id)
    || !validText(item.version, 160)
    || !validHash(item.contentHash)
  ))) {
    issues.push("coworker_resource_scope_memories_invalid");
  } else if (new Set(memories.map((item) => String(item.id))).size !== memories.length) {
    issues.push("coworker_resource_scope_memories_duplicate");
  }

  const connections = value.connections;
  if (!Array.isArray(connections) || connections.length > 8 || connections.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "appId", "manifestRevision", "actionIds", "networks"])
    || !validId(item.id)
    || !validId(item.appId)
    || !validText(item.manifestRevision, 160)
    || !isStringArray(item.actionIds)
    || item.actionIds.length < 1
    || item.actionIds.length > 64
    || new Set(item.actionIds).size !== item.actionIds.length
    || item.actionIds.some((id) => !validId(id))
    || !isStringArray(item.networks)
    || item.networks.length < 1
    || item.networks.length > 32
    || new Set(item.networks).size !== item.networks.length
    || item.networks.some((network) => !validText(network, 160))
  ))) {
    issues.push("coworker_resource_scope_connections_invalid");
  } else if (new Set(connections.map((item) => String(item.id))).size !== connections.length) {
    issues.push("coworker_resource_scope_connections_duplicate");
  }
  return [...new Set(issues)];
}

export function validateMatterhornCoworkerResourceRecommendation(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_resource_recommendation_not_object"];
  if (!hasOnlyKeys(value, [
    "version",
    "workspaceId",
    "coworkerId",
    "profileRevision",
    "expectedScopeRevision",
    "agentFiles",
    "memories",
    "connections",
    "approval",
    "recommendationHash",
    "generatedAt",
  ])) issues.push("coworker_resource_recommendation_unknown_field");
  if (value.version !== MATTERHORN_COWORKER_RESOURCE_RECOMMENDATION_VERSION) {
    issues.push("coworker_resource_recommendation_version_invalid");
  }
  const validText = (text: unknown, maximum: number) => isNonEmptyString(text)
    && text.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 256)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validStringList = (candidate: unknown, maximum: number) => isStringArray(candidate)
    && candidate.length > 0
    && candidate.length <= maximum
    && new Set(candidate).size === candidate.length
    && candidate.every((item) => validText(item, 256));
  if (!validId(value.workspaceId)) issues.push("coworker_resource_recommendation_workspace_invalid");
  if (!validId(value.coworkerId)) issues.push("coworker_resource_recommendation_coworker_invalid");
  if (!Number.isSafeInteger(value.profileRevision) || Number(value.profileRevision) < 1) {
    issues.push("coworker_resource_recommendation_profile_revision_invalid");
  }
  if (!Number.isSafeInteger(value.expectedScopeRevision) || Number(value.expectedScopeRevision) < 0) {
    issues.push("coworker_resource_recommendation_scope_revision_invalid");
  }
  if (typeof value.recommendationHash !== "string" || !/^[a-f0-9]{64}$/.test(value.recommendationHash)) {
    issues.push("coworker_resource_recommendation_hash_invalid");
  }
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) {
    issues.push("coworker_resource_recommendation_generated_at_invalid");
  }
  if (!isRecord(value.approval)
    || !hasOnlyKeys(value.approval, ["required", "automaticGrant", "walletSubmission"])
    || value.approval.required !== true
    || value.approval.automaticGrant !== false
    || value.approval.walletSubmission !== "connected_wallet_only") {
    issues.push("coworker_resource_recommendation_approval_invalid");
  }

  const agentFiles = value.agentFiles;
  if (!Array.isArray(agentFiles) || agentFiles.length > 8 || agentFiles.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "revision", "name", "reason"])
    || !validId(item.id)
    || !Number.isSafeInteger(item.revision)
    || Number(item.revision) < 1
    || !validText(item.name, 256)
    || item.reason !== "assigned_to_this_coworker"
  ))) {
    issues.push("coworker_resource_recommendation_agent_files_invalid");
  } else if (new Set(agentFiles.map((item) => String(item.id))).size !== agentFiles.length) {
    issues.push("coworker_resource_recommendation_agent_files_duplicate");
  }

  const memories = value.memories;
  if (!Array.isArray(memories) || memories.length > 8 || memories.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "version", "title", "matchedTags", "reason"])
    || !validId(item.id)
    || !validText(item.version, 160)
    || !validText(item.title, 256)
    || !validStringList(item.matchedTags, 16)
    || item.reason !== "matches_approved_topics"
  ))) {
    issues.push("coworker_resource_recommendation_memories_invalid");
  } else if (new Set(memories.map((item) => String(item.id))).size !== memories.length) {
    issues.push("coworker_resource_recommendation_memories_duplicate");
  }

  const connections = value.connections;
  if (!Array.isArray(connections) || connections.length > 8 || connections.some((item) => (
    !isRecord(item)
    || !hasOnlyKeys(item, ["id", "appId", "manifestRevision", "actionIds", "networks", "reason"])
    || !validId(item.id)
    || !validId(item.appId)
    || !validText(item.manifestRevision, 160)
    || !validStringList(item.actionIds, 64)
    || !validStringList(item.networks, 32)
    || item.reason !== "matches_approved_app"
  ))) {
    issues.push("coworker_resource_recommendation_connections_invalid");
  } else if (new Set(connections.map((item) => String(item.id))).size !== connections.length) {
    issues.push("coworker_resource_recommendation_connections_duplicate");
  }
  return [...new Set(issues)];
}

export function validateMatterhornCoworkerWatch(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_watch_not_object"];
  const topLevelKeys = [
    "version", "id", "workspaceId", "ownerId", "coworkerId", "revision", "profileRevision",
    "state", "pauseReason", "name", "appId", "actionId", "network", "connectionBinding", "parameters", "schedule",
    "budgets", "conditions", "createdAt", "updatedAt",
  ];
  if (!hasOnlyKeys(value, topLevelKeys)) issues.push("coworker_watch_unknown_field");
  if (value.version !== MATTERHORN_COWORKER_WATCH_VERSION) issues.push("coworker_watch_version_invalid");
  const validText = (text: unknown, max: number) => isNonEmptyString(text)
    && text.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 160)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validDate = (date: unknown) => typeof date === "string"
    && isNonEmptyString(date)
    && Number.isFinite(Date.parse(date));
  for (const key of ["id", "workspaceId", "ownerId", "coworkerId", "appId", "actionId"]) {
    if (!validId(value[key])) issues.push(`coworker_watch_${key}_invalid`);
  }
  if (!validText(value.name, 120)) issues.push("coworker_watch_name_invalid");
  if (!validText(value.network, 160)) issues.push("coworker_watch_network_invalid");
  if (value.connectionBinding !== undefined && (
    !isRecord(value.connectionBinding)
    || !hasOnlyKeys(value.connectionBinding, ["connectionId", "manifestRevision"])
    || !validId(value.connectionBinding.connectionId)
    || !validText(value.connectionBinding.manifestRevision, 160)
  )) {
    issues.push("coworker_watch_connection_binding_invalid");
  }
  for (const key of ["revision", "profileRevision"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) issues.push(`coworker_watch_${key}_invalid`);
  }
  if (value.state !== "active" && value.state !== "paused") issues.push("coworker_watch_state_invalid");
  const pauseReasons = ["user_paused", "coworker_paused", "profile_changed", "app_disconnected"];
  if (value.pauseReason !== null && !pauseReasons.includes(String(value.pauseReason))) issues.push("coworker_watch_pause_reason_invalid");
  if ((value.state === "active" && value.pauseReason !== null) || (value.state === "paused" && value.pauseReason === null)) {
    issues.push("coworker_watch_pause_state_invalid");
  }
  if (!isRecord(value.parameters)
    || Object.keys(value.parameters).length > 24
    || Object.entries(value.parameters).some(([key, item]) => !validId(key)
      || (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")
      || (typeof item === "string" && !validText(item, 500))
      || (typeof item === "number" && !Number.isFinite(item)))) {
    issues.push("coworker_watch_parameters_invalid");
  }
  if (!isRecord(value.schedule)
    || !hasOnlyKeys(value.schedule, [
      "intervalMs", "nextCheckAt", "lastCheckedAt", "maxChecksPerDay", "dayBucket", "checksToday",
      "lastResultHash", "lastConditionValues",
    ])
    || !Number.isSafeInteger(value.schedule.intervalMs)
    || (value.schedule.intervalMs as number) < 60_000
    || (value.schedule.intervalMs as number) > 7 * 24 * 60 * 60_000
    || !validDate(value.schedule.nextCheckAt)
    || (value.schedule.lastCheckedAt !== null && !validDate(value.schedule.lastCheckedAt))
    || !Number.isSafeInteger(value.schedule.maxChecksPerDay)
    || (value.schedule.maxChecksPerDay as number) < 1
    || (value.schedule.maxChecksPerDay as number) > 1_440
    || (value.schedule.maxChecksPerDay as number) > Math.ceil(86_400_000 / (value.schedule.intervalMs as number))
    || typeof value.schedule.dayBucket !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.schedule.dayBucket)
    || !Number.isSafeInteger(value.schedule.checksToday)
    || (value.schedule.checksToday as number) < 0
    || (value.schedule.checksToday as number) > (value.schedule.maxChecksPerDay as number)
    || (value.schedule.lastResultHash !== null
      && (typeof value.schedule.lastResultHash !== "string" || !/^[a-f0-9]{64}$/.test(value.schedule.lastResultHash)))
    || !isRecord(value.schedule.lastConditionValues)
    || Object.keys(value.schedule.lastConditionValues).length > 8
    || Object.entries(value.schedule.lastConditionValues).some(([key, item]) => !validId(key)
      || (item !== null && !validText(item, 160)))) {
    issues.push("coworker_watch_schedule_invalid");
  }
  if (!isRecord(value.budgets)
    || !hasOnlyKeys(value.budgets, ["maxReadCallsPerCheck", "maxModelTokensPerCheck", "maxCostMicrosPerCheck"])
    || !Number.isSafeInteger(value.budgets.maxReadCallsPerCheck)
    || (value.budgets.maxReadCallsPerCheck as number) < 1
    || (value.budgets.maxReadCallsPerCheck as number) > 3
    || !Number.isSafeInteger(value.budgets.maxModelTokensPerCheck)
    || (value.budgets.maxModelTokensPerCheck as number) < 0
    || (value.budgets.maxModelTokensPerCheck as number) > 4_000
    || !Number.isSafeInteger(value.budgets.maxCostMicrosPerCheck)
    || (value.budgets.maxCostMicrosPerCheck as number) < 0
    || (value.budgets.maxCostMicrosPerCheck as number) > 1_000_000_000) {
    issues.push("coworker_watch_budgets_invalid");
  }
  if (!Array.isArray(value.conditions)
    || value.conditions.length < 1
    || value.conditions.length > 8
    || value.conditions.some((condition) => !isRecord(condition)
      || !hasOnlyKeys(condition, ["id", "metric", "operator", "value"])
      || !validId(condition.id)
      || !validText(condition.metric, 160)
      || !["gt", "gte", "lt", "lte", "eq", "changed"].includes(String(condition.operator))
      || (condition.value !== null && !validText(condition.value, 160))
      || (condition.operator === "changed" && condition.value !== null)
      || (condition.operator !== "changed" && condition.value === null)
      || (condition.metric === "matterhorn_result_hash"
        && (condition.operator !== "changed" || condition.value !== null)))) {
    issues.push("coworker_watch_conditions_invalid");
  } else if (new Set(value.conditions.map((condition) => (condition as Record<string, unknown>).id)).size !== value.conditions.length) {
    issues.push("coworker_watch_conditions_duplicate");
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (!validDate(value[key])) issues.push(`coworker_watch_${key}_invalid`);
  }
  return [...new Set(issues)];
}

export function validateMatterhornCoworkerInboxItem(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_inbox_item_not_object"];
  const topLevelKeys = [
    "version", "id", "workspaceId", "ownerId", "coworkerId", "profileRevision", "watchId", "state", "kind",
    "severity", "title", "summary", "reasonCodes", "source", "budgetImpact", "nextSafeAction",
    "createdAt", "updatedAt",
  ];
  if (!hasOnlyKeys(value, topLevelKeys)) issues.push("coworker_inbox_item_unknown_field");
  if (value.version !== MATTERHORN_COWORKER_INBOX_ITEM_VERSION) issues.push("coworker_inbox_item_version_invalid");
  const validText = (text: unknown, max: number) => isNonEmptyString(text)
    && text.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 160)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validDate = (date: unknown) => typeof date === "string"
    && isNonEmptyString(date)
    && Number.isFinite(Date.parse(date));
  const validHash = (hash: unknown) => typeof hash === "string" && /^(?:sha256:)?[a-f0-9]{64}$/i.test(hash);
  for (const key of ["id", "workspaceId", "ownerId", "coworkerId"]) {
    if (!validId(value[key])) issues.push(`coworker_inbox_item_${key}_invalid`);
  }
  if (!Number.isSafeInteger(value.profileRevision) || (value.profileRevision as number) < 1) {
    issues.push("coworker_inbox_item_profileRevision_invalid");
  }
  if (value.watchId !== null && !validId(value.watchId)) issues.push("coworker_inbox_item_watchId_invalid");
  if (!["unread", "read", "dismissed"].includes(String(value.state))) issues.push("coworker_inbox_item_state_invalid");
  if (!["alert", "question", "notice"].includes(String(value.kind))) issues.push("coworker_inbox_item_kind_invalid");
  if (!["info", "low", "medium", "high", "critical"].includes(String(value.severity))) issues.push("coworker_inbox_item_severity_invalid");
  if (!validText(value.title, 160)) issues.push("coworker_inbox_item_title_invalid");
  if (!validText(value.summary, 1_000)) issues.push("coworker_inbox_item_summary_invalid");
  if (!isStringArray(value.reasonCodes)
    || value.reasonCodes.length < 1
    || value.reasonCodes.length > 16
    || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || value.reasonCodes.some((reason) => !validId(reason))) issues.push("coworker_inbox_item_reason_codes_invalid");
  if (value.source !== null) {
    if (!isRecord(value.source)
      || !hasOnlyKeys(value.source, ["appId", "actionId", "evidenceReferenceHash", "freshness", "observedAt"])
      || !validId(value.source.appId)
      || !validId(value.source.actionId)
      || !validHash(value.source.evidenceReferenceHash)
      || !["fresh", "stale", "unknown"].includes(String(value.source.freshness))
      || !validDate(value.source.observedAt)) issues.push("coworker_inbox_item_source_invalid");
  } else if (value.kind === "alert") {
    issues.push("coworker_inbox_item_alert_source_required");
  }
  if (!isRecord(value.budgetImpact)
    || !hasOnlyKeys(value.budgetImpact, ["readCallsConsumed", "modelTokensConsumed", "costMicros"])
    || !Number.isSafeInteger(value.budgetImpact.readCallsConsumed)
    || (value.budgetImpact.readCallsConsumed as number) < 0
    || (value.budgetImpact.readCallsConsumed as number) > 3
    || !Number.isSafeInteger(value.budgetImpact.modelTokensConsumed)
    || (value.budgetImpact.modelTokensConsumed as number) < 0
    || (value.budgetImpact.modelTokensConsumed as number) > 4_000
    || !Number.isSafeInteger(value.budgetImpact.costMicros)
    || (value.budgetImpact.costMicros as number) < 0
    || (value.budgetImpact.costMicros as number) > 1_000_000_000) {
    issues.push("coworker_inbox_item_budget_invalid");
  }
  if (!isRecord(value.nextSafeAction)
    || !hasOnlyKeys(value.nextSafeAction, ["kind", "label"])
    || !["review", "open_chat", "pause_watch", "none"].includes(String(value.nextSafeAction.kind))
    || !validText(value.nextSafeAction.label, 160)) issues.push("coworker_inbox_item_next_action_invalid");
  for (const key of ["createdAt", "updatedAt"]) {
    if (!validDate(value[key])) issues.push(`coworker_inbox_item_${key}_invalid`);
  }
  return [...new Set(issues)];
}

const FORBIDDEN_CRYPTO_INTENT_ARGUMENT_KEYS = new Set([
  "apikey",
  "authorization",
  "capabilitytoken",
  "credential",
  "mnemonic",
  "password",
  "privatekey",
  "rawsignature",
  "seedphrase",
  "signature",
  "walletexport",
]);

function validCryptoIntentArguments(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (budget.nodes > 256 || depth > 6) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    return value.length <= 1_024 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 32 && value.every((item) => validCryptoIntentArguments(item, depth + 1, budget));
  }
  if (!isRecord(value) || Object.keys(value).length > 32) return false;
  return Object.entries(value).every(([key, nested]) => {
    const normalizedKey = key.replace(/[^a-z]/gi, "").toLowerCase();
    return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)
      && !FORBIDDEN_CRYPTO_INTENT_ARGUMENT_KEYS.has(normalizedKey)
      && validCryptoIntentArguments(nested, depth + 1, budget);
  });
}

export function validateMatterhornCryptoIntent(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["crypto_intent_not_object"];
  const topLevelKeys = [
    "version", "id", "runId", "coworkerId", "workspaceId", "appId", "connectionId", "actionId", "protocol",
    "network", "signer", "operation", "asset", "amount", "recipient", "slippageBps",
    "canonicalArguments", "authorizedArgumentsHash", "canonicalArgumentsHash", "policyHash", "simulation", "intentHash",
    "capabilityClass", "preparedAt", "expiresAt",
  ];
  if (!hasOnlyKeys(value, topLevelKeys)) issues.push("crypto_intent_unknown_field");
  if (value.version !== MATTERHORN_CRYPTO_INTENT_VERSION) issues.push("crypto_intent_version_invalid");
  const validText = (text: unknown, max: number) => isNonEmptyString(text)
    && text.length <= max
    && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const validId = (id: unknown) => typeof id === "string"
    && validText(id, 256)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(id);
  const validHash = (hash: unknown) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
  const validDate = (date: unknown) => typeof date === "string" && Number.isFinite(Date.parse(date));
  for (const key of ["id", "runId", "coworkerId", "workspaceId", "appId", "connectionId", "actionId"]) {
    if (!validId(value[key])) issues.push(`crypto_intent_${key}_invalid`);
  }
  for (const key of ["protocol", "network", "operation"]) {
    if (!validText(value[key], 160)) issues.push(`crypto_intent_${key}_invalid`);
  }
  for (const key of ["signer", "asset", "amount", "recipient"]) {
    if (value[key] !== null && !validText(value[key], key === "recipient" ? 512 : 256)) {
      issues.push(`crypto_intent_${key}_invalid`);
    }
  }
  if (value.slippageBps !== null
    && (!Number.isSafeInteger(value.slippageBps) || (value.slippageBps as number) < 0 || (value.slippageBps as number) > 10_000)) {
    issues.push("crypto_intent_slippage_invalid");
  }
  if (!isRecord(value.canonicalArguments)
    || !validCryptoIntentArguments(value.canonicalArguments)
    || JSON.stringify(value.canonicalArguments).length > 64 * 1_024) {
    issues.push("crypto_intent_arguments_invalid");
  }
  for (const key of ["authorizedArgumentsHash", "canonicalArgumentsHash", "policyHash", "intentHash"]) {
    if (!validHash(value[key])) issues.push(`crypto_intent_${key}_invalid`);
  }
  if (!isRecord(value.simulation)
    || !hasOnlyKeys(value.simulation, ["reference", "blockOrVersion", "simulatedAt", "validUntil"])
    || !validText(value.simulation.reference, 256)
    || (value.simulation.blockOrVersion !== null && !validText(value.simulation.blockOrVersion, 256))
    || !validDate(value.simulation.simulatedAt)
    || !validDate(value.simulation.validUntil)) {
    issues.push("crypto_intent_simulation_invalid");
  }
  if (value.capabilityClass !== "wallet_review_only") issues.push("crypto_intent_capability_invalid");
  if (!validDate(value.preparedAt) || !validDate(value.expiresAt)) issues.push("crypto_intent_dates_invalid");
  if (isRecord(value.simulation)
    && validDate(value.simulation.simulatedAt)
    && validDate(value.simulation.validUntil)
    && validDate(value.preparedAt)
    && validDate(value.expiresAt)) {
    const simulatedAt = Date.parse(value.simulation.simulatedAt as string);
    const validUntil = Date.parse(value.simulation.validUntil as string);
    const preparedAt = Date.parse(value.preparedAt as string);
    const expiresAt = Date.parse(value.expiresAt as string);
    if (simulatedAt > preparedAt || preparedAt >= expiresAt || validUntil <= simulatedAt || validUntil > expiresAt) {
      issues.push("crypto_intent_time_order_invalid");
    }
  }
  return [...new Set(issues)];
}

export function validateMatterhornPolicyDecision(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["policy_decision_not_object"];
  if (!hasOnlyKeys(value, [
    "version",
    "runId",
    "intentHash",
    "decision",
    "reasonCodes",
    "evaluatedPolicyHashes",
    "evaluatedAt",
    "limits",
  ])) issues.push("policy_decision_unknown_field");
  if (value.version !== MATTERHORN_POLICY_DECISION_VERSION) issues.push("policy_decision_version_invalid");
  if (!isNonEmptyString(value.runId) || value.runId.length > 256) issues.push("policy_decision_run_invalid");
  if (typeof value.intentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.intentHash)) {
    issues.push("policy_decision_intent_hash_invalid");
  }
  if (value.decision !== "allow_prepare"
    && value.decision !== "wallet_review_required"
    && value.decision !== "deny") {
    issues.push("policy_decision_outcome_invalid");
  }
  if (!isStringArray(value.reasonCodes)
    || value.reasonCodes.length < 1
    || value.reasonCodes.length > 64
    || value.reasonCodes.some((reason) => reason.length > 128 || !/^[a-z][a-z0-9_]*$/.test(reason))) {
    issues.push("policy_decision_reasons_invalid");
  }
  if (!Array.isArray(value.evaluatedPolicyHashes)
    || value.evaluatedPolicyHashes.length < 1
    || value.evaluatedPolicyHashes.length > 16
    || value.evaluatedPolicyHashes.some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
    issues.push("policy_decision_hashes_invalid");
  }
  if (typeof value.evaluatedAt !== "string" || !Number.isFinite(Date.parse(value.evaluatedAt))) {
    issues.push("policy_decision_time_invalid");
  }
  if (!Array.isArray(value.limits) || value.limits.length > 32) {
    issues.push("policy_decision_limits_invalid");
  } else {
    for (const limit of value.limits) {
      if (!isRecord(limit)
        || !hasOnlyKeys(limit, ["name", "configured", "observed", "passed"])
        || !isNonEmptyString(limit.name)
        || limit.name.length > 128
        || !/^[a-z][a-z0-9_]*$/.test(limit.name)
        || !isNonEmptyString(limit.configured)
        || limit.configured.length > 128
        || !isNonEmptyString(limit.observed)
        || limit.observed.length > 128
        || typeof limit.passed !== "boolean") {
        issues.push("policy_decision_limits_invalid");
        break;
      }
    }
  }
  if (value.decision === "wallet_review_required") {
    const reasonsAllow = Array.isArray(value.reasonCodes)
      && value.reasonCodes.length === 1
      && value.reasonCodes[0] === "wallet_review_required";
    const limitsAllow = Array.isArray(value.limits)
      && value.limits.every((limit) => isRecord(limit) && limit.passed === true);
    if (!reasonsAllow || !limitsAllow) issues.push("policy_decision_allow_inconsistent");
  }
  if (value.decision === "allow_prepare"
    && Array.isArray(value.reasonCodes)
    && (value.reasonCodes.length !== 1 || value.reasonCodes[0] !== "allow_prepare")) {
    issues.push("policy_decision_allow_inconsistent");
  }
  return [...new Set(issues)];
}

export function validateMatterhornCryptoPublicReceipt(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["crypto_public_receipt_not_object"];
  if (!hasOnlyKeys(value, [
    "version",
    "intentHash",
    "protocol",
    "network",
    "status",
    "publicId",
    "transactionHash",
    "blockHash",
    "observedAt",
    "verification",
    "evidenceHash",
  ])) issues.push("crypto_public_receipt_unknown_field");
  if (value.version !== MATTERHORN_CRYPTO_PUBLIC_RECEIPT_VERSION) {
    issues.push("crypto_public_receipt_version_invalid");
  }
  const publicText = (text: unknown, maximum: number) => typeof text === "string"
    && text.trim().length > 0
    && text.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(text);
  const hash = (candidate: unknown) => typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
  if (!hash(value.intentHash)) issues.push("crypto_public_receipt_intent_hash_invalid");
  if (!hash(value.evidenceHash)) issues.push("crypto_public_receipt_evidence_hash_invalid");
  if (!["sui", "hyperliquid", "bittensor", "polymarket"].includes(String(value.protocol))) {
    issues.push("crypto_public_receipt_protocol_invalid");
  }
  if (!publicText(value.network, 160)) issues.push("crypto_public_receipt_network_invalid");
  if (!["submitted", "confirmed", "failed"].includes(String(value.status))) {
    issues.push("crypto_public_receipt_status_invalid");
  }
  if (!publicText(value.publicId, 256)) issues.push("crypto_public_receipt_public_id_invalid");
  for (const key of ["transactionHash", "blockHash"]) {
    if (value[key] !== null && !publicText(value[key], 256)) {
      issues.push(`crypto_public_receipt_${key}_invalid`);
    }
  }
  if (typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))) {
    issues.push("crypto_public_receipt_observed_at_invalid");
  }
  if (!isRecord(value.verification)
    || !hasOnlyKeys(value.verification, ["kind", "chainVerified"])
    || !["wallet_reported_public_metadata", "public_chain"].includes(String(value.verification.kind))
    || typeof value.verification.chainVerified !== "boolean"
    || (value.verification.kind === "public_chain") !== value.verification.chainVerified
    || (value.status === "confirmed" && !value.verification.chainVerified)) {
    issues.push("crypto_public_receipt_verification_invalid");
  }
  return [...new Set(issues)];
}

function collectForbiddenEvidenceKeys(value: unknown, issues: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenEvidenceKeys(item, issues);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(key.replace(/[^a-z]/gi, "").toLowerCase())) issues.push("evidence_forbidden_content_field");
    collectForbiddenEvidenceKeys(nested, issues);
  }
}

export function validateMatterhornEvidenceBundle(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["evidence_not_object"];
  collectForbiddenEvidenceKeys(value, issues);
  if (!hasOnlyKeys(value, [
    "version",
    "id",
    "workspaceIdHash",
    "runIdHash",
    "coworkerIdHash",
    "createdAt",
    "retention",
    "encryption",
    "receipt",
  ])) issues.push("evidence_unknown_field");
  if (value.version !== MATTERHORN_EVIDENCE_BUNDLE_VERSION) issues.push("evidence_version_invalid");
  const hash = (candidate: unknown) => typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
  const publicText = (text: unknown, maximum: number) => typeof text === "string"
    && text.trim().length > 0
    && text.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(text);
  const hashArray = (candidate: unknown, maximum: number) => Array.isArray(candidate)
    && candidate.length <= maximum
    && candidate.every(hash)
    && new Set(candidate).size === candidate.length;
  const wholeNumber = (candidate: unknown, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(candidate)
    && Number(candidate) >= 0
    && Number(candidate) <= maximum;
  if (!publicText(value.id, 160) || !/^evidence_[a-zA-Z0-9_-]+$/.test(String(value.id))) {
    issues.push("evidence_id_invalid");
  }
  for (const key of ["workspaceIdHash", "runIdHash", "coworkerIdHash"]) {
    if (!hash(value[key])) issues.push(`evidence_${key}_invalid`);
  }
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    issues.push("evidence_created_at_invalid");
  }
  if (!isRecord(value.retention)
    || !hasOnlyKeys(value.retention, ["contentClass", "deletable", "expiresAt"])
    || (value.retention.contentClass !== "security_receipt" && value.retention.contentClass !== "encrypted_user_evidence")
    || typeof value.retention.deletable !== "boolean"
    || (value.retention.expiresAt !== null
      && (typeof value.retention.expiresAt !== "string" || !Number.isFinite(Date.parse(value.retention.expiresAt))))) {
    issues.push("evidence_retention_invalid");
  } else if ((value.retention.contentClass === "encrypted_user_evidence" && value.retention.deletable !== true)
    || (typeof value.retention.expiresAt === "string"
      && Number.isFinite(Date.parse(value.createdAt as string))
      && Date.parse(value.retention.expiresAt) <= Date.parse(value.createdAt as string))) {
    issues.push("evidence_retention_invalid");
  }
  if (!isRecord(value.encryption)
    || !hasOnlyKeys(value.encryption, ["algorithm", "keyReference", "recipientKeyIds"])
    || (value.encryption.algorithm !== "aes-256-gcm" && value.encryption.algorithm !== "xchacha20-poly1305")
    || !publicText(value.encryption.keyReference, 512)
    || !Array.isArray(value.encryption.recipientKeyIds)
    || value.encryption.recipientKeyIds.length < 1
    || value.encryption.recipientKeyIds.length > 32
    || !value.encryption.recipientKeyIds.every((id) => publicText(id, 256))
    || new Set(value.encryption.recipientKeyIds).size !== value.encryption.recipientKeyIds.length) {
    issues.push("evidence_encryption_required");
  }
  if (!isRecord(value.receipt)
    || !hasOnlyKeys(value.receipt, [
      "status",
      "providerId",
      "modelId",
      "privacyMode",
      "consent",
      "dataCategoryHashes",
      "redactionCount",
      "policyHash",
      "toolOutcomeHashes",
      "evidenceReferenceHashes",
      "reviewedIntentHashes",
      "publicChainReceiptHashes",
      "inputTokens",
      "outputTokens",
      "responseDurationMs",
    ])
    || !["success", "partial", "cancelled", "error"].includes(String(value.receipt.status))
    || !publicText(value.receipt.providerId, 256)
    || !publicText(value.receipt.modelId, 256)
    || !["public_research", "private_workspace", "transaction"].includes(String(value.receipt.privacyMode))
    || !["not_required", "single_request"].includes(String(value.receipt.consent))
    || !hashArray(value.receipt.dataCategoryHashes, 32)
    || !wholeNumber(value.receipt.redactionCount, 100_000)
    || !hash(value.receipt.policyHash)
    || !hashArray(value.receipt.toolOutcomeHashes, 100)
    || !hashArray(value.receipt.evidenceReferenceHashes, 100)
    || !hashArray(value.receipt.reviewedIntentHashes, 20)
    || !hashArray(value.receipt.publicChainReceiptHashes, 20)
    || !wholeNumber(value.receipt.inputTokens, 100_000_000)
    || !wholeNumber(value.receipt.outputTokens, 100_000_000)
    || !wholeNumber(value.receipt.responseDurationMs, 86_400_000)) {
    issues.push("evidence_receipt_invalid");
  }
  return [...new Set(issues)];
}

export function validateMatterhornWalrusProof(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["walrus_proof_not_object"];
  if (!hasOnlyKeys(value, [
    "version",
    "network",
    "blobId",
    "suiObjectId",
    "certifiedEpoch",
    "validUntilEpoch",
    "quiltPatchId",
    "merkleRoot",
    "merkleProof",
    "suiTransactionDigest",
    "renewalTransactionDigest",
    "renewedAt",
    "deletionTransactionDigest",
    "deletedAt",
  ])) issues.push("walrus_proof_unknown_field");
  const publicText = (text: unknown, maximum: number) => typeof text === "string"
    && text.trim().length > 0
    && text.length <= maximum
    && !/[\u0000-\u001F\u007F]/.test(text);
  const hash = (candidate: unknown) => typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate);
  const epoch = (candidate: unknown) => Number.isSafeInteger(candidate) && Number(candidate) >= 0;
  if (value.version !== MATTERHORN_WALRUS_PROOF_VERSION) issues.push("walrus_proof_version_invalid");
  if (!["testnet", "mainnet"].includes(String(value.network))) issues.push("walrus_proof_network_invalid");
  if (!publicText(value.blobId, 512)) issues.push("walrus_proof_blob_id_invalid");
  if (!publicText(value.suiObjectId, 256)) issues.push("walrus_proof_sui_object_id_invalid");
  if (!epoch(value.certifiedEpoch)
    || !epoch(value.validUntilEpoch)
    || Number(value.validUntilEpoch) <= Number(value.certifiedEpoch)) {
    issues.push("walrus_proof_epoch_invalid");
  }
  if (value.quiltPatchId !== null && !publicText(value.quiltPatchId, 512)) {
    issues.push("walrus_proof_quilt_patch_id_invalid");
  }
  if (!hash(value.merkleRoot)) issues.push("walrus_proof_merkle_root_invalid");
  if (!Array.isArray(value.merkleProof)
    || value.merkleProof.length > 64
    || value.merkleProof.some((item) => !hash(item))) {
    issues.push("walrus_proof_merkle_path_invalid");
  }
  if (value.suiTransactionDigest !== null && !publicText(value.suiTransactionDigest, 256)) {
    issues.push("walrus_proof_sui_transaction_digest_invalid");
  }
  const hasRenewalDigest = value.renewalTransactionDigest !== undefined;
  const hasRenewedAt = value.renewedAt !== undefined;
  if (hasRenewalDigest !== hasRenewedAt
    || (hasRenewalDigest && !publicText(value.renewalTransactionDigest, 256))
    || (hasRenewedAt && (typeof value.renewedAt !== "string"
      || !Number.isFinite(Date.parse(value.renewedAt))))) {
    issues.push("walrus_proof_renewal_invalid");
  }
  const hasDeletionDigest = value.deletionTransactionDigest !== undefined;
  const hasDeletedAt = value.deletedAt !== undefined;
  if (hasDeletionDigest !== hasDeletedAt
    || (hasDeletionDigest && !publicText(value.deletionTransactionDigest, 256))
    || (hasDeletedAt && (typeof value.deletedAt !== "string"
      || !Number.isFinite(Date.parse(value.deletedAt))))) {
    issues.push("walrus_proof_deletion_invalid");
  }
  return [...new Set(issues)];
}
