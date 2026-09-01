export const MATTERHORN_CRYPTO_APP_MANIFEST_VERSION = "matterhorn.crypto-app-manifest.v1";
export const MATTERHORN_CRYPTO_APP_CONNECTION_VERSION = "matterhorn.crypto-app-connection.v1";
export const MATTERHORN_CRYPTO_APP_RESULT_VERSION = "matterhorn.crypto-app-result.v1";
export const MATTERHORN_CRYPTO_APP_CATALOG_VERSION = "matterhorn.crypto-app-catalog.v1";
export const MATTERHORN_COWORKER_PROFILE_VERSION = "matterhorn.coworker-profile.v1";
export const MATTERHORN_COWORKER_WORKING_STATE_VERSION = "matterhorn.coworker-working-state.v1";
export const MATTERHORN_COWORKER_WATCH_VERSION = "matterhorn.coworker-watch.v1";
export const MATTERHORN_COWORKER_INBOX_ITEM_VERSION = "matterhorn.coworker-inbox-item.v1";
export const MATTERHORN_CRYPTO_INTENT_VERSION = "matterhorn.crypto-intent.v1";
export const MATTERHORN_POLICY_DECISION_VERSION = "matterhorn.policy-decision.v1";
export const MATTERHORN_EVIDENCE_BUNDLE_VERSION = "matterhorn.evidence-bundle.v1";
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
};

export type MatterhornEvidenceBundle = {
  version: typeof MATTERHORN_EVIDENCE_BUNDLE_VERSION;
  id: string;
  workspaceIdHash: string;
  runIdHash: string;
  coworkerId: string;
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
    providerId: string;
    modelId: string;
    privacyMode: "public_research" | "private_workspace" | "transaction";
    policyHash: string;
    toolOutcomeHashes: string[];
    evidenceReferenceHashes: string[];
    reviewedIntentHashes: string[];
    publicChainReceiptHashes: string[];
    inputTokens: number;
    outputTokens: number;
    responseDurationMs: number;
  };
  ciphertextHash: string;
  walrus: MatterhornWalrusProof | null;
};

export type MatterhornEncryptedEvidenceEnvelope = {
  version: "matterhorn.encrypted-evidence-envelope.v1";
  algorithm: "aes-256-gcm";
  keyReference: string;
  payloadHash: string;
  ciphertextHash: string;
  merkleLeaf: string;
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

const SAFE_ACTION_ACCESS: readonly string[] = ["read", "watch", "prepare", "simulate"];
const SAFE_ACTION_RISK: readonly string[] = ["informational", "private_data", "financial_low", "financial_high"];
const SAFE_TRANSPORTS: readonly string[] = ["mcp_http", "openapi", "rpc", "matterhorn_sdk"];
const SAFE_AUTH_TYPES: readonly string[] = ["oauth2", "api_key_vault", "wallet_connection", "none"];
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
const FORBIDDEN_ACTION_AUTHORITY = /(^|_)(sign|submit|relay|broadcast)(_|$)/i;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "prompt",
  "rawprompt",
  "privatekey",
  "seedphrase",
  "walletsignature",
  "walletexport",
  "capabilitytoken",
  "rawtooloutput",
]);

export function validateMatterhornCryptoAppManifest(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["manifest_not_object"];
  if (value.version !== MATTERHORN_CRYPTO_APP_MANIFEST_VERSION) issues.push("manifest_version_invalid");
  if (!isNonEmptyString(value.appId) || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value.appId)) issues.push("app_id_invalid");
  if (!isNonEmptyString(value.displayName)) issues.push("display_name_required");
  if (!isNonEmptyString(value.description)) issues.push("description_required");
  if (!isNonEmptyString(value.manifestRevision)) issues.push("manifest_revision_required");

  if (!isRecord(value.publisher)) issues.push("publisher_required");
  else {
    if (!isNonEmptyString(value.publisher.id)) issues.push("publisher_id_required");
    if (!isNonEmptyString(value.publisher.keyId)) issues.push("publisher_key_id_required");
    if (value.publisher.algorithm !== "ed25519") issues.push("publisher_algorithm_invalid");
    if (!isNonEmptyString(value.publisher.signature)) issues.push("publisher_signature_required");
  }

  if (!isRecord(value.transport)) issues.push("transport_required");
  else {
    if (!isNonEmptyString(value.transport.kind) || !SAFE_TRANSPORTS.includes(value.transport.kind)) issues.push("transport_kind_invalid");
    if (!isNonEmptyString(value.transport.endpoint) || !/^https:\/\//.test(value.transport.endpoint)) issues.push("transport_https_required");
  }

  if (!isRecord(value.authentication)) issues.push("authentication_required");
  else {
    if (!isNonEmptyString(value.authentication.type) || !SAFE_AUTH_TYPES.includes(value.authentication.type)) issues.push("authentication_type_invalid");
    if (!isStringArray(value.authentication.scopes)) issues.push("authentication_scopes_invalid");
    if (value.authentication.type === "oauth2") {
      if (!isNonEmptyString(value.authentication.authorizationServer)) issues.push("oauth_authorization_server_required");
      if (!isNonEmptyString(value.authentication.resource)) issues.push("oauth_resource_required");
      if (!isNonEmptyString(value.authentication.audience)) issues.push("oauth_audience_required");
    }
  }

  if (!Array.isArray(value.networks) || value.networks.length === 0) issues.push("networks_required");
  else {
    for (const network of value.networks) {
      if (!isRecord(network)
        || !isNonEmptyString(network.protocol)
        || !isNonEmptyString(network.chainId)
        || (network.environment !== "testnet" && network.environment !== "mainnet")) {
        issues.push("network_invalid");
      }
    }
  }

  const actionIds = new Set<string>();
  if (!Array.isArray(value.actions) || value.actions.length === 0) issues.push("actions_required");
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
        if (FORBIDDEN_ACTION_AUTHORITY.test(action.id)) issues.push("action_submit_authority_forbidden");
      }
      if (!isNonEmptyString(action.title)) issues.push("action_title_required");
      if (!isNonEmptyString(action.description)) issues.push("action_description_required");
      if (!isNonEmptyString(action.access) || !SAFE_ACTION_ACCESS.includes(action.access)) issues.push("action_access_invalid");
      if (!isNonEmptyString(action.risk) || !SAFE_ACTION_RISK.includes(action.risk)) issues.push("action_risk_invalid");
      if (!isRecord(action.inputSchema)) issues.push("action_input_schema_invalid");
      if (!isRecord(action.outputProjectionSchema)) issues.push("action_output_schema_invalid");
      if (!isStringArray(action.requiredScopes)) issues.push("action_scopes_invalid");
      if (typeof action.requiresFreshness !== "boolean") issues.push("action_freshness_invalid");
      if (action.freshnessMaxAgeMs !== null && (typeof action.freshnessMaxAgeMs !== "number" || action.freshnessMaxAgeMs <= 0)) issues.push("action_freshness_age_invalid");
      if (typeof action.timeoutMs !== "number" || action.timeoutMs < 1_000 || action.timeoutMs > 60_000) issues.push("action_timeout_invalid");
      if (typeof action.simulationRequired !== "boolean") issues.push("action_simulation_flag_invalid");
      if ((action.access === "prepare" || action.access === "simulate") && action.simulationRequired !== true) issues.push("financial_simulation_required");
      if (action.walletSubmissionOnly !== true) issues.push("wallet_submission_only_required");
      if (action.agentMaySubmit !== false) issues.push("agent_submit_forbidden");
    }
  }

  if (!isRecord(value.support)) issues.push("support_required");
  else {
    if (!isNonEmptyString(value.support.privacyPolicyUrl) || !/^https:\/\//.test(value.support.privacyPolicyUrl)) issues.push("privacy_policy_url_invalid");
    if (!isNonEmptyString(value.support.securityContact)) issues.push("security_contact_required");
    if (value.support.statusUrl !== null && (!isNonEmptyString(value.support.statusUrl) || !/^https:\/\//.test(value.support.statusUrl))) issues.push("status_url_invalid");
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

export function validateMatterhornCoworkerWatch(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ["coworker_watch_not_object"];
  const topLevelKeys = [
    "version", "id", "workspaceId", "ownerId", "coworkerId", "revision", "profileRevision",
    "state", "pauseReason", "name", "appId", "actionId", "network", "parameters", "schedule",
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
      || (condition.operator !== "changed" && condition.value === null))) {
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
    "version", "id", "runId", "coworkerId", "workspaceId", "appId", "actionId", "protocol",
    "network", "signer", "operation", "asset", "amount", "recipient", "slippageBps",
    "canonicalArguments", "canonicalArgumentsHash", "policyHash", "simulation", "intentHash",
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
  for (const key of ["id", "runId", "coworkerId", "workspaceId", "appId", "actionId"]) {
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
  for (const key of ["canonicalArgumentsHash", "policyHash", "intentHash"]) {
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
  if (value.version !== MATTERHORN_EVIDENCE_BUNDLE_VERSION) issues.push("evidence_version_invalid");
  for (const key of ["id", "workspaceIdHash", "runIdHash", "coworkerId", "createdAt", "ciphertextHash"]) {
    if (!isNonEmptyString(value[key])) issues.push(`evidence_${key}_required`);
  }
  if (!isRecord(value.retention)
    || (value.retention.contentClass !== "security_receipt" && value.retention.contentClass !== "encrypted_user_evidence")
    || typeof value.retention.deletable !== "boolean"
    || (value.retention.expiresAt !== null && !isNonEmptyString(value.retention.expiresAt))) {
    issues.push("evidence_retention_invalid");
  }
  if (!isRecord(value.encryption)
    || (value.encryption.algorithm !== "aes-256-gcm" && value.encryption.algorithm !== "xchacha20-poly1305")
    || !isNonEmptyString(value.encryption.keyReference)
    || !isStringArray(value.encryption.recipientKeyIds)) {
    issues.push("evidence_encryption_required");
  }
  if (!isRecord(value.receipt)) issues.push("evidence_receipt_required");
  if (value.walrus !== null && !isRecord(value.walrus)) issues.push("evidence_walrus_proof_invalid");
  return [...new Set(issues)];
}
