export const MATTERHORN_MEMORY_SCOPES = [
  "user",
  "workspace",
  "project",
  "session",
] as const;
export type MatterhornMemoryScope = (typeof MATTERHORN_MEMORY_SCOPES)[number];

export const MATTERHORN_MEMORY_KINDS = [
  "user_preference",
  "project_fact",
  "protocol_address",
  "watchlist",
  "receipt",
  "workflow_artifact",
  "decision",
  "client_profile",
  "connector_preference",
  "mcp_tool_preference",
] as const;
export type MatterhornMemoryKind = (typeof MATTERHORN_MEMORY_KINDS)[number];

export const MATTERHORN_MEMORY_SOURCES = [
  "user_confirmed",
  "chat_capture",
  "workflow_output",
  "receipt_import",
  "watch_event",
  "connector_metadata",
  "manual_entry",
] as const;
export type MatterhornMemorySource = (typeof MATTERHORN_MEMORY_SOURCES)[number];

export const MATTERHORN_MEMORY_SENSITIVITIES = [
  "public",
  "private",
  "restricted",
  "forbidden_secret",
] as const;
export type MatterhornMemorySensitivity = (typeof MATTERHORN_MEMORY_SENSITIVITIES)[number];

export interface MatterhornMemoryLink {
  rel: string;
  href: string;
  title?: string;
}

export interface MatterhornMemoryProvenance {
  source: MatterhornMemorySource;
  sourceId?: string;
  capturedAt: string;
  capturedBy: "user" | "agent" | "connector" | "workflow" | "system";
  confidence: number;
  reasonRemembered: string;
}

export interface MatterhornMemoryRecord {
  id: string;
  kind: MatterhornMemoryKind;
  scope: MatterhornMemoryScope;
  title: string;
  summary: string;
  body: Record<string, unknown>;
  tags: string[];
  links: MatterhornMemoryLink[];
  provenance: MatterhornMemoryProvenance;
  sensitivity: MatterhornMemorySensitivity;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  canUseInChat: boolean;
  canExport: boolean;
  canDelete: boolean;
}

export interface MatterhornMemoryRedactionResult {
  recordId: string;
  redacted: boolean;
  reason: string;
  redactedFields?: string[];
}

export interface MatterhornMemorySafetyPolicy {
  canHoldPrivateKeys: false;
  canHoldSeedPhrases: false;
  canHoldApiSecrets: false;
  canHoldRawSignatures: false;
  canHoldSignedPayloads: false;
  canHoldWalletExports: false;
  canHoldBearerTokens: false;
  canHoldExchangeSecrets: false;
  requiresUserConfirmationForMedical: true;
  marketLiveSubmissionEnabled: false;
  bittensorCustodialEnabled: false;
  wellnessOptInRequired: true;
}

export const DEFAULT_MATTERHORN_MEMORY_SAFETY_POLICY: MatterhornMemorySafetyPolicy = {
  canHoldPrivateKeys: false,
  canHoldSeedPhrases: false,
  canHoldApiSecrets: false,
  canHoldRawSignatures: false,
  canHoldSignedPayloads: false,
  canHoldWalletExports: false,
  canHoldBearerTokens: false,
  canHoldExchangeSecrets: false,
  requiresUserConfirmationForMedical: true,
  marketLiveSubmissionEnabled: false,
  bittensorCustodialEnabled: false,
  wellnessOptInRequired: true,
};

export const FORBIDDEN_MEMORY_SECRET_FIELD_NAMES = [
  "seedPhrase",
  "seed_phrase",
  "privateKey",
  "private_key",
  "mnemonic",
  "apiSecret",
  "api_secret",
  "rawSignature",
  "raw_signature",
  "signedPayload",
  "signed_payload",
  "signedOrder",
  "signed_order",
  "walletExport",
  "wallet_export",
  "secretKey",
  "secret_key",
  "bearerToken",
  "bearer_token",
  "exchangeSecret",
  "exchange_secret",
];

export const FORBIDDEN_MEMORY_SECRET_PATTERNS = [
  /seed\s*phrase/i,
  /private\s*key/i,
  /mnemonic/i,
  /api\s*secret/i,
  /raw\s*signature/i,
  /signed\s*(payload|order|action)/i,
  /wallet\s*export/i,
  /bearer\s*token/i,
  /exchange\s*secret/i,
  /\bsk-[a-zA-Z0-9]{20,}\b/i,
  /\b[A-Za-z0-9_]+_(API_KEY|SECRET)\s*=/i,
];

function deepStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(deepStringify).join(" ");
  if (typeof value === "object") {
    return (
      Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => `${key} ${deepStringify(val)}`)
        .join(" ") + " "
    );
  }
  return "";
}

export function findForbiddenMemorySecretFields(body: Record<string, unknown>): string[] {
  const found: string[] = [];
  function scan(obj: Record<string, unknown>, prefix = "body") {
    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}.${key}`;
      const keyLower = key.toLowerCase();
      if (FORBIDDEN_MEMORY_SECRET_FIELD_NAMES.some((forbidden) => keyLower === forbidden.toLowerCase())) {
        found.push(path);
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        scan(value as Record<string, unknown>, path);
      }
    }
  }
  scan(body);
  return found;
}

export function containsForbiddenMemorySecretMaterial(value: unknown): boolean {
  const haystack = deepStringify(value);
  return FORBIDDEN_MEMORY_SECRET_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function isForbiddenMemorySecretBody(body: Record<string, unknown>): boolean {
  return (
    findForbiddenMemorySecretFields(body).length > 0 || containsForbiddenMemorySecretMaterial(body)
  );
}

export interface MatterhornMemoryValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateMemoryRecord(record: MatterhornMemoryRecord): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (!record.id || typeof record.id !== "string") {
    errors.push("id is required and must be a string");
  }
  if (!MATTERHORN_MEMORY_KINDS.includes(record.kind as MatterhornMemoryKind)) {
    errors.push(`kind must be one of ${MATTERHORN_MEMORY_KINDS.join(", ")}`);
  }
  if (!MATTERHORN_MEMORY_SCOPES.includes(record.scope as MatterhornMemoryScope)) {
    errors.push(`scope must be one of ${MATTERHORN_MEMORY_SCOPES.join(", ")}`);
  }
  if (!record.title || typeof record.title !== "string") {
    errors.push("title is required and must be a string");
  }
  if (typeof record.summary !== "string") {
    errors.push("summary must be a string");
  }
  if (!record.body || typeof record.body !== "object" || Array.isArray(record.body)) {
    errors.push("body is required and must be an object");
  }
  if (!Array.isArray(record.tags)) {
    errors.push("tags must be an array");
  }
  if (!Array.isArray(record.links)) {
    errors.push("links must be an array");
  }
  if (!record.provenance || typeof record.provenance !== "object") {
    errors.push("provenance is required");
  } else {
    if (!MATTERHORN_MEMORY_SOURCES.includes(record.provenance.source as MatterhornMemorySource)) {
      errors.push(`provenance.source must be one of ${MATTERHORN_MEMORY_SOURCES.join(", ")}`);
    }
    if (typeof record.provenance.confidence !== "number") {
      errors.push("provenance.confidence must be a number");
    }
    if (!record.provenance.reasonRemembered || typeof record.provenance.reasonRemembered !== "string") {
      errors.push("provenance.reasonRemembered is required");
    }
  }
  if (!MATTERHORN_MEMORY_SENSITIVITIES.includes(record.sensitivity as MatterhornMemorySensitivity)) {
    errors.push(`sensitivity must be one of ${MATTERHORN_MEMORY_SENSITIVITIES.join(", ")}`);
  }

  if (isForbiddenMemorySecretBody(record.body)) {
    errors.push("body contains forbidden secret material");
  }

  return { ok: errors.length === 0, errors };
}

export function redactForbiddenMemorySecrets(
  record: MatterhornMemoryRecord,
): MatterhornMemoryRedactionResult {
  if (isForbiddenMemorySecretBody(record.body)) {
    return {
      recordId: record.id,
      redacted: true,
      reason: "Record body contains forbidden secret material and cannot be remembered.",
      redactedFields: findForbiddenMemorySecretFields(record.body),
    };
  }
  return {
    recordId: record.id,
    redacted: false,
    reason: "No forbidden secret material detected.",
  };
}

export function isBittensorMemoryRecord(record: MatterhornMemoryRecord): boolean {
  return record.kind === "protocol_address" && record.tags.map((t) => t.toLowerCase()).includes("bittensor");
}

export function validateBittensorMemoryIsNonCustodial(
  record: MatterhornMemoryRecord,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];
  if (!isBittensorMemoryRecord(record)) {
    return { ok: true, errors };
  }

  const allowedKeys = ["ss58Address", "coldkey", "hotkey", "netuid", "subnetName", "validatorName"];
  for (const key of Object.keys(record.body)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`Bittensor memory body contains unexpected key: ${key}`);
    }
  }

  if (containsForbiddenMemorySecretMaterial(record.body)) {
    errors.push("Bittensor memory must not contain seed phrases, private keys, mnemonics, or wallet exports");
  }

  return { ok: errors.length === 0, errors };
}

export function validateMarketMemoryDoesNotEnableLiveSubmission(
  record: MatterhornMemoryRecord,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];
  const tags = record.tags.map((t) => t.toLowerCase());
  const isMarket =
    tags.includes("hyperliquid") ||
    tags.includes("polymarket") ||
    record.title.toLowerCase().includes("hyperliquid") ||
    record.title.toLowerCase().includes("polymarket");
  if (!isMarket) {
    return { ok: true, errors };
  }

  const haystack = deepStringify(record.body).toLowerCase();
  for (const forbidden of ["livesubmissionenabled", "cansubmit", "signorder", "submitorder"]) {
    if (haystack.includes(forbidden)) {
      errors.push(`Market memory body must not enable live submission: ${forbidden}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateWellnessMemoryIsEducationalAndOptIn(
  record: MatterhornMemoryRecord,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];
  const tags = record.tags.map((t) => t.toLowerCase());
  const isWellness = tags.includes("wellness") || tags.includes("health") || tags.includes("clinical");
  if (!isWellness) {
    return { ok: true, errors };
  }

  if (tags.includes("clinical") && record.provenance.source !== "user_confirmed") {
    errors.push("Clinical/wellness memory requires user_confirmed provenance source");
  }

  const bodyText = deepStringify(record.body).toLowerCase();
  const medicalTerms = ["diagnosis", "treatment plan", "prescription", "guaranteed outcome"];
  if (medicalTerms.some((term) => bodyText.includes(term))) {
    if (record.provenance.source !== "user_confirmed") {
      errors.push("Medical/clinical memory requires explicit user_confirmed provenance");
    }
    if (!tags.includes("opt-in")) {
      errors.push("Medical/clinical memory must be tagged opt-in");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemorySafety(record: MatterhornMemoryRecord): MatterhornMemoryValidationResult {
  const validators = [
    validateMemoryRecord,
    validateBittensorMemoryIsNonCustodial,
    validateMarketMemoryDoesNotEnableLiveSubmission,
    validateWellnessMemoryIsEducationalAndOptIn,
  ];
  const errors: string[] = [];
  for (const validate of validators) {
    const result = validate(record);
    errors.push(...result.errors);
  }
  return { ok: errors.length === 0, errors };
}

export interface MatterhornMemoryStore {
  version: "matterhorn.memory.store.v1";
  records: MatterhornMemoryRecord[];
  policy: MatterhornMemorySafetyPolicy;
}

export const MATTERHORN_MEMORY_CONTEXT_PACKET_VERSION = "matterhorn.memory.context-packet.v1";

export interface MatterhornMemoryContextPacket {
  version: "matterhorn.memory.context-packet.v1";
  taskId?: string;
  sessionId?: string;
  workspaceId?: string;
  query: string;
  records: MatterhornMemoryRecord[];
  omittedRecords: number;
  safetySummary: string;
  visibleToUser: true;
  generatedAt: string;
}

export const MATTERHORN_MEMORY_SUGGESTION_VERSION = "matterhorn.memory.suggestion.v1";

export const MATTERHORN_MEMORY_SUGGESTION_USER_ACTIONS = [
  "confirm",
  "edit",
  "dismiss",
] as const;
export type MatterhornMemorySuggestionUserAction =
  (typeof MATTERHORN_MEMORY_SUGGESTION_USER_ACTIONS)[number];

export const MATTERHORN_MEMORY_SUGGESTION_USE_CASES = [
  "bittensor_wallet_label",
  "bittensor_subnet_watch_preference",
  "bittensor_validator_watch_preference",
  "bittensor_receipt_context",
  "hyperliquid_watched_market",
  "polymarket_watched_market",
  "wellness_client_preference",
  "wellness_program_format_preference",
  "wellness_offer_builder_preference",
  "mcp_tool_preference",
  "workflow_artifact_preference",
] as const;
export type MatterhornMemorySuggestionUseCase =
  (typeof MATTERHORN_MEMORY_SUGGESTION_USE_CASES)[number];

export interface MatterhornMemorySuggestion {
  version: "matterhorn.memory.suggestion.v1";
  id: string;
  proposedRecord: MatterhornMemoryRecord;
  reason: string;
  source: MatterhornMemorySource;
  confidence: number;
  desk: MatterhornMemoryDesk;
  useCase: MatterhornMemorySuggestionUseCase;
  userAction: MatterhornMemorySuggestionUserAction;
  expiresAt?: string;
  captureMode: "user_confirmed_only";
  canAutoCapture: false;
  requiresExplicitConsent: true;
  forbiddenIfSecretDetected: true;
  policyDecision?: "approve" | "reject" | "review";
  policyWarnings?: string[];
}

export const MATTERHORN_MEMORY_USE_POLICY_DEFAULTS = {
  hiddenMemoryAllowed: false,
  userVisibleMemoryChipsRequired: true,
  autoCaptureAllowed: false,
  secretCaptureAllowed: false,
  wellnessClinicalCaptureRequiresExplicitConsent: true,
  marketSubmissionMemoryAllowed: false,
} as const;

export interface MatterhornMemoryUsePolicy {
  hiddenMemoryAllowed: false;
  userVisibleMemoryChipsRequired: true;
  autoCaptureAllowed: false;
  secretCaptureAllowed: false;
  wellnessClinicalCaptureRequiresExplicitConsent: true;
  marketSubmissionMemoryAllowed: false;
}

export const DEFAULT_MATTERHORN_MEMORY_USE_POLICY: MatterhornMemoryUsePolicy = {
  hiddenMemoryAllowed: false,
  userVisibleMemoryChipsRequired: true,
  autoCaptureAllowed: false,
  secretCaptureAllowed: false,
  wellnessClinicalCaptureRequiresExplicitConsent: true,
  marketSubmissionMemoryAllowed: false,
};

export const MATTERHORN_MEMORY_EXPORT_MANIFEST_VERSION = "matterhorn.memory.export-manifest.v1";

export interface MatterhornMemoryExportManifest {
  version: "matterhorn.memory.export-manifest.v1";
  exportedAt: string;
  recordCount: number;
  sha256: string;
  includesSecrets: false;
  includesRawSignatures: false;
  includesSignedPayloads: false;
  includesWalletExports: false;
}

export function validateMemoryContextPacket(
  packet: MatterhornMemoryContextPacket,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (packet.version !== MATTERHORN_MEMORY_CONTEXT_PACKET_VERSION) {
    errors.push(`context packet version must be ${MATTERHORN_MEMORY_CONTEXT_PACKET_VERSION}`);
  }

  if (typeof packet.query !== "string" || packet.query.length === 0) {
    errors.push("context packet query must be a non-empty string");
  }

  if (!Array.isArray(packet.records)) {
    errors.push("context packet records must be an array");
  } else {
    for (const record of packet.records) {
      const result = validateMemorySafety(record);
      if (!result.ok) {
        errors.push(`context packet contains unsafe record ${record.id}: ${result.errors.join("; ")}`);
      }
    }
  }

  if (typeof packet.omittedRecords !== "number" || packet.omittedRecords < 0) {
    errors.push("context packet omittedRecords must be a non-negative number");
  }

  if (typeof packet.safetySummary !== "string" || packet.safetySummary.length === 0) {
    errors.push("context packet safetySummary must be a non-empty string");
  }

  if (packet.visibleToUser !== true) {
    errors.push("context packet must be visible to user (visibleToUser: true)");
  }

  if (typeof packet.generatedAt !== "string" || packet.generatedAt.length === 0) {
    errors.push("context packet generatedAt must be a non-empty string");
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemorySuggestion(
  suggestion: MatterhornMemorySuggestion,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (suggestion.version !== MATTERHORN_MEMORY_SUGGESTION_VERSION) {
    errors.push(`suggestion version must be ${MATTERHORN_MEMORY_SUGGESTION_VERSION}`);
  }

  if (!suggestion.id || typeof suggestion.id !== "string") {
    errors.push("suggestion id is required and must be a string");
  }

  if (!suggestion.reason || typeof suggestion.reason !== "string") {
    errors.push("suggestion reason is required and must be a string");
  }

  if (!MATTERHORN_MEMORY_SOURCES.includes(suggestion.source as MatterhornMemorySource)) {
    errors.push(`suggestion source must be one of ${MATTERHORN_MEMORY_SOURCES.join(", ")}`);
  }

  if (typeof suggestion.confidence !== "number" || suggestion.confidence < 0 || suggestion.confidence > 1) {
    errors.push("suggestion confidence must be a number between 0 and 1");
  }

  if (!MATTERHORN_MEMORY_DESKS.includes(suggestion.desk as MatterhornMemoryDesk)) {
    errors.push(`suggestion desk must be one of ${MATTERHORN_MEMORY_DESKS.join(", ")}`);
  }

  if (!MATTERHORN_MEMORY_SUGGESTION_USE_CASES.includes(suggestion.useCase as MatterhornMemorySuggestionUseCase)) {
    errors.push(`suggestion useCase must be one of ${MATTERHORN_MEMORY_SUGGESTION_USE_CASES.join(", ")}`);
  }

  if (!MATTERHORN_MEMORY_SUGGESTION_USER_ACTIONS.includes(suggestion.userAction as MatterhornMemorySuggestionUserAction)) {
    errors.push(`suggestion userAction must be one of ${MATTERHORN_MEMORY_SUGGESTION_USER_ACTIONS.join(", ")}`);
  }

  if (suggestion.captureMode !== "user_confirmed_only") {
    errors.push("suggestion captureMode must be user_confirmed_only");
  }

  if (suggestion.canAutoCapture !== false) {
    errors.push("suggestion canAutoCapture must be false");
  }

  if (suggestion.requiresExplicitConsent !== true) {
    errors.push("suggestion requiresExplicitConsent must be true");
  }

  if (suggestion.forbiddenIfSecretDetected !== true) {
    errors.push("suggestion forbiddenIfSecretDetected must be true");
  }

  if (suggestion.policyDecision && !["approve", "reject", "review"].includes(suggestion.policyDecision)) {
    errors.push("suggestion policyDecision must be one of approve, reject, review");
  }

  if (suggestion.policyWarnings && !Array.isArray(suggestion.policyWarnings)) {
    errors.push("suggestion policyWarnings must be an array");
  }

  const recordResult = validateMemorySafety(suggestion.proposedRecord);
  if (!recordResult.ok) {
    errors.push(`suggested record is unsafe: ${recordResult.errors.join("; ")}`);
  }

  if (isForbiddenMemorySecretBody(suggestion.proposedRecord.body)) {
    errors.push("suggested record body contains forbidden secret material");
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemorySuggestionAgainstDeskPolicy(
  suggestion: MatterhornMemorySuggestion,
  matrix: Record<MatterhornMemoryDesk, MatterhornMemoryDeskPolicy> = MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  const suggestionResult = validateMemorySuggestion(suggestion);
  errors.push(...suggestionResult.errors);

  const deskResult = validateMemoryRecordAgainstDeskPolicy(suggestion.proposedRecord, suggestion.desk, matrix);
  errors.push(...deskResult.errors);

  const deskPolicy = matrix[suggestion.desk];
  if (deskPolicy && !deskPolicy.allowedKinds.includes(suggestion.proposedRecord.kind)) {
    errors.push(`useCase ${suggestion.useCase} targets desk ${suggestion.desk} but kind ${suggestion.proposedRecord.kind} is not allowed`);
  }

  return { ok: errors.length === 0, errors };
}

export function sanitizeMemorySuggestionForDisplay(
  suggestion: MatterhornMemorySuggestion,
): MatterhornMemorySuggestion {
  if (!isForbiddenMemorySecretBody(suggestion.proposedRecord.body)) {
    return suggestion;
  }

  const redactedBody: Record<string, unknown> = {
    __redacted: true,
    reason: "Forbidden secret material was detected and removed before display.",
    redactedFields: findForbiddenMemorySecretFields(suggestion.proposedRecord.body),
  };

  return {
    ...suggestion,
    proposedRecord: {
      ...suggestion.proposedRecord,
      body: redactedBody,
      summary: "[Redacted] suggestion contains forbidden secret material.",
    },
    policyDecision: "reject",
    policyWarnings: [
      ...(suggestion.policyWarnings ?? []),
      "Display sanitizer removed forbidden secret-shaped material.",
    ],
  };
}

export function canMemorySuggestionBecomeSavedMemory(
  suggestion: MatterhornMemorySuggestion,
): boolean {
  if (suggestion.userAction !== "confirm" && suggestion.userAction !== "edit") {
    return false;
  }
  if (suggestion.canAutoCapture !== false) {
    return false;
  }
  if (suggestion.requiresExplicitConsent !== true) {
    return false;
  }
  if (suggestion.forbiddenIfSecretDetected !== true) {
    return false;
  }
  if (!validateMemorySafety(suggestion.proposedRecord).ok) {
    return false;
  }
  if (isForbiddenMemorySecretBody(suggestion.proposedRecord.body)) {
    return false;
  }
  if (suggestion.policyDecision === "reject") {
    return false;
  }
  return true;
}

function makeBaseMemorySuggestion(
  id: string,
  proposedRecord: MatterhornMemoryRecord,
  reason: string,
  source: MatterhornMemorySource,
  desk: MatterhornMemoryDesk,
  useCase: MatterhornMemorySuggestionUseCase,
  overrides: Partial<MatterhornMemorySuggestion> = {},
): MatterhornMemorySuggestion {
  return {
    version: MATTERHORN_MEMORY_SUGGESTION_VERSION,
    id,
    proposedRecord,
    reason,
    source,
    confidence: 0.9,
    desk,
    useCase,
    userAction: "confirm",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    ...overrides,
  };
}

export function createWellnessMemorySuggestion(
  useCase:
    | "wellness_client_preference"
    | "wellness_program_format_preference"
    | "wellness_offer_builder_preference"
    | "workflow_artifact_preference",
  id: string,
  title: string,
  body: Record<string, unknown>,
  reason: string,
  overrides: Partial<MatterhornMemorySuggestion> = {},
): MatterhornMemorySuggestion {
  const record: MatterhornMemoryRecord = {
    id: `rec-${id}`,
    kind: useCase === "workflow_artifact_preference" ? "workflow_artifact" : "user_preference",
    scope: "user",
    title,
    summary: reason,
    body,
    tags: ["wellness", "opt-in"],
    links: [],
    provenance: {
      source: "chat_capture",
      capturedAt: new Date().toISOString(),
      capturedBy: "agent",
      confidence: 0.9,
      reasonRemembered: reason,
    },
    sensitivity: "restricted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canUseInChat: true,
    canExport: false,
    canDelete: true,
  };

  return makeBaseMemorySuggestion(
    id,
    record,
    reason,
    "chat_capture",
    "wellness",
    useCase,
    overrides,
  );
}

export function createBittensorMemorySuggestion(
  useCase:
    | "bittensor_wallet_label"
    | "bittensor_subnet_watch_preference"
    | "bittensor_validator_watch_preference"
    | "bittensor_receipt_context",
  id: string,
  title: string,
  body: Record<string, unknown>,
  reason: string,
  overrides: Partial<MatterhornMemorySuggestion> = {},
): MatterhornMemorySuggestion {
  const kind: MatterhornMemoryKind =
    useCase === "bittensor_receipt_context" ? "receipt" : "protocol_address";

  const record: MatterhornMemoryRecord = {
    id: `rec-${id}`,
    kind,
    scope: "user",
    title,
    summary: reason,
    body,
    tags: ["bittensor"],
    links: [],
    provenance: {
      source: "chat_capture",
      capturedAt: new Date().toISOString(),
      capturedBy: "agent",
      confidence: 0.9,
      reasonRemembered: reason,
    },
    sensitivity: "public",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canUseInChat: true,
    canExport: true,
    canDelete: true,
  };

  return makeBaseMemorySuggestion(
    id,
    record,
    reason,
    "chat_capture",
    "bittensor",
    useCase,
    overrides,
  );
}

export function validateMemoryUsePolicy(
  policy: MatterhornMemoryUsePolicy,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (policy.hiddenMemoryAllowed !== false) {
    errors.push("use policy hiddenMemoryAllowed must be false");
  }

  if (policy.userVisibleMemoryChipsRequired !== true) {
    errors.push("use policy userVisibleMemoryChipsRequired must be true");
  }

  if (policy.autoCaptureAllowed !== false) {
    errors.push("use policy autoCaptureAllowed must be false");
  }

  if (policy.secretCaptureAllowed !== false) {
    errors.push("use policy secretCaptureAllowed must be false");
  }

  if (policy.wellnessClinicalCaptureRequiresExplicitConsent !== true) {
    errors.push("use policy wellnessClinicalCaptureRequiresExplicitConsent must be true");
  }

  if (policy.marketSubmissionMemoryAllowed !== false) {
    errors.push("use policy marketSubmissionMemoryAllowed must be false");
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemoryExportManifest(
  manifest: MatterhornMemoryExportManifest,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (manifest.version !== MATTERHORN_MEMORY_EXPORT_MANIFEST_VERSION) {
    errors.push(`export manifest version must be ${MATTERHORN_MEMORY_EXPORT_MANIFEST_VERSION}`);
  }

  if (typeof manifest.exportedAt !== "string" || manifest.exportedAt.length === 0) {
    errors.push("export manifest exportedAt must be a non-empty string");
  }

  if (typeof manifest.recordCount !== "number" || manifest.recordCount < 0) {
    errors.push("export manifest recordCount must be a non-negative number");
  }

  if (typeof manifest.sha256 !== "string" || manifest.sha256.length === 0) {
    errors.push("export manifest sha256 must be a non-empty string");
  }

  if (manifest.includesSecrets !== false) {
    errors.push("export manifest must not include secrets (includesSecrets: false)");
  }

  if (manifest.includesRawSignatures !== false) {
    errors.push("export manifest must not include raw signatures (includesRawSignatures: false)");
  }

  if (manifest.includesSignedPayloads !== false) {
    errors.push("export manifest must not include signed payloads (includesSignedPayloads: false)");
  }

  if (manifest.includesWalletExports !== false) {
    errors.push("export manifest must not include wallet exports (includesWalletExports: false)");
  }

  return { ok: errors.length === 0, errors };
}

export const MATTERHORN_MEMORY_DESKS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "decentralized_services",
  "generic_workspace",
] as const;
export type MatterhornMemoryDesk = (typeof MATTERHORN_MEMORY_DESKS)[number];

export interface MatterhornMemoryDeskPolicy {
  desk: MatterhornMemoryDesk;
  allowedKinds: MatterhornMemoryKind[];
  defaultSensitivity: MatterhornMemorySensitivity;
  canUseInChat: boolean;
  canExport: boolean;
  canSendToMcpApi: boolean;
  forbiddenCases: string[];
}

export const MATTERHORN_MEMORY_DESK_POLICY_MATRIX: Record<
  MatterhornMemoryDesk,
  MatterhornMemoryDeskPolicy
> = {
  bittensor: {
    desk: "bittensor",
    allowedKinds: ["protocol_address", "watchlist", "user_preference", "decision", "receipt"],
    defaultSensitivity: "public",
    canUseInChat: true,
    canExport: true,
    canSendToMcpApi: true,
    forbiddenCases: [
      "private keys",
      "seed phrases",
      "mnemonics",
      "raw signatures",
      "signed payloads",
      "wallet exports",
      "custodial key material",
    ],
  },
  hyperliquid: {
    desk: "hyperliquid",
    allowedKinds: ["watchlist", "user_preference", "decision", "receipt"],
    defaultSensitivity: "public",
    canUseInChat: true,
    canExport: false,
    canSendToMcpApi: false,
    forbiddenCases: [
      "API secrets",
      "private keys",
      "raw signatures",
      "signed payloads",
      "live submission flags",
      "wallet exports",
    ],
  },
  polymarket: {
    desk: "polymarket",
    allowedKinds: ["watchlist", "user_preference", "decision", "receipt"],
    defaultSensitivity: "public",
    canUseInChat: true,
    canExport: false,
    canSendToMcpApi: false,
    forbiddenCases: [
      "API secrets",
      "private keys",
      "raw signatures",
      "signed payloads",
      "live submission flags",
      "wallet exports",
    ],
  },
  wellness: {
    desk: "wellness",
    allowedKinds: ["user_preference", "client_profile", "decision", "workflow_artifact"],
    defaultSensitivity: "restricted",
    canUseInChat: true,
    canExport: false,
    canSendToMcpApi: false,
    forbiddenCases: [
      "clinical records",
      "diagnosis",
      "treatment plans",
      "prescriptions",
      "guaranteed outcomes",
      "medical records without explicit opt-in",
      "auto-capture",
    ],
  },
  decentralized_services: {
    desk: "decentralized_services",
    allowedKinds: ["project_fact", "user_preference", "connector_preference", "decision", "receipt"],
    defaultSensitivity: "private",
    canUseInChat: true,
    canExport: false,
    canSendToMcpApi: false,
    forbiddenCases: [
      "API secrets",
      "private keys",
      "raw signatures",
      "signed payloads",
      "wallet exports",
    ],
  },
  generic_workspace: {
    desk: "generic_workspace",
    allowedKinds: ["user_preference", "project_fact", "workflow_artifact", "decision"],
    defaultSensitivity: "private",
    canUseInChat: true,
    canExport: false,
    canSendToMcpApi: false,
    forbiddenCases: [
      "protocol wallet data",
      "private keys",
      "seed phrases",
      "medical/clinical records",
      "API secrets",
      "raw signatures",
      "signed payloads",
    ],
  },
};

export function detectMemoryDeskFromRecord(record: MatterhornMemoryRecord): MatterhornMemoryDesk {
  const tags = record.tags.map((t) => t.toLowerCase());
  if (tags.includes("bittensor")) return "bittensor";
  if (tags.includes("hyperliquid")) return "hyperliquid";
  if (tags.includes("polymarket")) return "polymarket";
  if (tags.includes("wellness") || tags.includes("health") || tags.includes("clinical")) {
    return "wellness";
  }
  if (tags.includes("decentralized_services") || tags.includes("decentralized service")) {
    return "decentralized_services";
  }
  return "generic_workspace";
}

export function validateMemoryDeskPolicy(
  policy: MatterhornMemoryDeskPolicy,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (!MATTERHORN_MEMORY_DESKS.includes(policy.desk as MatterhornMemoryDesk)) {
    errors.push(`desk must be one of ${MATTERHORN_MEMORY_DESKS.join(", ")}`);
  }

  if (!Array.isArray(policy.allowedKinds) || policy.allowedKinds.length === 0) {
    errors.push("allowedKinds must be a non-empty array");
  } else {
    for (const kind of policy.allowedKinds) {
      if (!MATTERHORN_MEMORY_KINDS.includes(kind as MatterhornMemoryKind)) {
        errors.push(`allowedKinds contains invalid kind: ${kind}`);
      }
    }
  }

  if (!MATTERHORN_MEMORY_SENSITIVITIES.includes(policy.defaultSensitivity as MatterhornMemorySensitivity)) {
    errors.push(`defaultSensitivity must be one of ${MATTERHORN_MEMORY_SENSITIVITIES.join(", ")}`);
  }

  if (typeof policy.canUseInChat !== "boolean") {
    errors.push("canUseInChat must be a boolean");
  }

  if (typeof policy.canExport !== "boolean") {
    errors.push("canExport must be a boolean");
  }

  if (typeof policy.canSendToMcpApi !== "boolean") {
    errors.push("canSendToMcpApi must be a boolean");
  }

  if (!Array.isArray(policy.forbiddenCases) || policy.forbiddenCases.length === 0) {
    errors.push("forbiddenCases must be a non-empty array");
  }

  return { ok: errors.length === 0, errors };
}

export function validateMemoryRecordAgainstDeskPolicy(
  record: MatterhornMemoryRecord,
  desk: MatterhornMemoryDesk,
  matrix: Record<MatterhornMemoryDesk, MatterhornMemoryDeskPolicy> = MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];
  const policy = matrix[desk];

  if (!policy) {
    errors.push(`no policy defined for desk ${desk}`);
    return { ok: false, errors };
  }

  if (!policy.allowedKinds.includes(record.kind)) {
    errors.push(`kind ${record.kind} is not allowed for desk ${desk}`);
  }

  // Desk-specific forbidden secret checks reuse existing validators.
  const bittensorResult = validateBittensorMemoryIsNonCustodial(record);
  if (desk === "bittensor" && !bittensorResult.ok) {
    errors.push(...bittensorResult.errors);
  }

  const marketResult = validateMarketMemoryDoesNotEnableLiveSubmission(record);
  if ((desk === "hyperliquid" || desk === "polymarket") && !marketResult.ok) {
    errors.push(...marketResult.errors);
  }

  const wellnessResult = validateWellnessMemoryIsEducationalAndOptIn(record);
  if (desk === "wellness" && !wellnessResult.ok) {
    errors.push(...wellnessResult.errors);
  }

  if (desk === "generic_workspace") {
    const forbiddenTags = ["bittensor", "hyperliquid", "polymarket", "wellness", "clinical", "wallet"];
    if (record.tags.some((tag) => forbiddenTags.includes(tag.toLowerCase()))) {
      errors.push(
        "generic_workspace memory must not silently include protocol, wallet, or medical data",
      );
    }
  }

  // Sensitivity should not be less restrictive than the desk default, except public desks.
  const sensitivityRank: Record<MatterhornMemorySensitivity, number> = {
    public: 0,
    private: 1,
    restricted: 2,
    forbidden_secret: 3,
  };
  if (sensitivityRank[record.sensitivity] < sensitivityRank[policy.defaultSensitivity]) {
    errors.push(
      `sensitivity ${record.sensitivity} is less restrictive than desk ${desk} default ${policy.defaultSensitivity}`,
    );
  }

  return { ok: errors.length === 0, errors };
}
