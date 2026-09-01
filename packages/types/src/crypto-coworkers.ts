export const MATTERHORN_CRYPTO_APP_MANIFEST_VERSION = "matterhorn.crypto-app-manifest.v1";
export const MATTERHORN_CRYPTO_APP_CONNECTION_VERSION = "matterhorn.crypto-app-connection.v1";
export const MATTERHORN_COWORKER_PROFILE_VERSION = "matterhorn.coworker-profile.v1";
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

export type MatterhornCryptoAppConnectionView = Omit<MatterhornCryptoAppConnection, "credential"> & {
  credential: {
    type: MatterhornCryptoAppConnectionCredential["type"];
    connected: boolean;
  };
  availability: "available" | "certification_unavailable";
};

export type MatterhornCoworkerState = "active" | "paused" | "revoked";
export type MatterhornCoworkerAuthority = "read" | "watch" | "prepare" | "write_note";

export type MatterhornCoworkerProfile = {
  version: typeof MATTERHORN_COWORKER_PROFILE_VERSION;
  id: string;
  workspaceId: string;
  ownerId: string;
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
  for (const key of ["id", "workspaceId", "ownerId", "name", "role", "mission", "createdAt", "updatedAt"]) {
    if (!isNonEmptyString(value[key])) issues.push(`coworker_${key}_required`);
  }
  if (value.state !== "active" && value.state !== "paused" && value.state !== "revoked") issues.push("coworker_state_invalid");
  for (const key of ["allowedAppIds", "allowedActionIds", "allowedNetworks", "allowedAssets", "automaticAuthorities"]) {
    if (!isStringArray(value[key])) issues.push(`coworker_${key}_invalid`);
  }
  if (Array.isArray(value.automaticAuthorities)) {
    const safeAuthorities: readonly string[] = ["read", "watch", "prepare", "write_note"];
    if (value.automaticAuthorities.some((authority) => !isNonEmptyString(authority) || !safeAuthorities.includes(authority))) issues.push("coworker_authority_forbidden");
  }
  if (!isRecord(value.limits)) issues.push("coworker_limits_required");
  else {
    for (const key of ["perActionUsd", "dailyUsd", "weeklyUsd", "maxSlippageBps", "maxLeverage", "minimumReserveUsd", "maxActiveWatches", "maxReadCallsPerRun", "maxPrepareCallsPerFamily"]) {
      if (typeof value.limits[key] !== "number" || value.limits[key] < 0) issues.push(`coworker_limit_${key}_invalid`);
    }
  }
  if (!isRecord(value.privacy) || !isStringArray(value.privacy.allowedDataLabels) || typeof value.privacy.allowUnverifiedProviderConsent !== "boolean") issues.push("coworker_privacy_invalid");
  if (!isRecord(value.escalation)
    || value.escalation.privateDataRequiresDisclosure !== true
    || value.escalation.transactionRequiresWalletReview !== true
    || value.escalation.walletSubmission !== "connected_wallet_only") {
    issues.push("coworker_wallet_boundary_invalid");
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
