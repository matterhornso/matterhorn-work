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
  "user_note",
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

const CRYPTO_SECRET_TEXT_PATTERNS = [
  /-----BEGIN (?:EC |ENCRYPTED |OPENSSH |RSA )?PRIVATE KEY-----/i,
  /\bsuiprivkey1[0-9a-z]{40,}\b/i,
  /\b(?:xprv|tprv|yprv|zprv|uprv|vprv|Yprv|Zprv|Uprv|Vprv)[1-9A-HJ-NP-Za-km-z]{60,}\b/,
  /\b(?:5[1-9A-HJ-NP-Za-km-z]{50}|9[1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51})\b/,
];
const CRYPTO_32_BYTE_TOKEN = /\b(?:0x)?[a-f0-9]{64}\b/gi;
const PUBLIC_CRYPTO_TEXT_CONTEXT = /"?(?:transaction|tx|block|object|receipt|content)?[ _-]*(?:hash|digest|address|account|checksum|sha-?256|public[ _-]?key|transaction[ _-]?signature)"?\s*[:=]\s*["']?\s*$/i;
const PUBLIC_CRYPTO_FIELD = /(?:hash|digest|address|account|checksum|sha256|publickey|transactionsignature)$/;
const MAX_MEMORY_SECRET_SCAN_CONTAINERS = 4_096;
const MAX_MEMORY_SECRET_SCAN_NODES = 16_384;
const MAX_MEMORY_SECRET_SCAN_CHARACTERS = 1_000_000;
const MEMORY_SECRET_SCAN_LIMIT_PATH = "body.__scan_limit_exceeded__";

function isMemoryRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPublicCryptoEvidenceField(fieldName: string | null): boolean {
  if (!fieldName) return false;
  const normalized = fieldName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return PUBLIC_CRYPTO_FIELD.test(normalized);
}

function containsUnlabelledCryptoKey(value: string, fieldName: string | null): boolean {
  if (isPublicCryptoEvidenceField(fieldName)) return false;
  for (const match of value.matchAll(CRYPTO_32_BYTE_TOKEN)) {
    const start = match.index ?? 0;
    const context = value.slice(Math.max(0, start - 80), start);
    if (!PUBLIC_CRYPTO_TEXT_CONTEXT.test(context)) return true;
  }
  return false;
}

function isPrivateJwk(value: Record<string, unknown>): boolean {
  return typeof value.kty === "string" && typeof value.d === "string" && value.d.length > 0;
}

function isEthereumKeyStore(value: Record<string, unknown>): boolean {
  if ((value.version !== 3 && value.version !== "3") || typeof value.address !== "string") return false;
  const crypto = isMemoryRecordValue(value.crypto)
    ? value.crypto
    : isMemoryRecordValue(value.Crypto)
      ? value.Crypto
      : null;
  return Boolean(crypto)
    && typeof crypto?.cipher === "string"
    && typeof crypto.ciphertext === "string"
    && typeof crypto.kdf === "string"
    && typeof crypto.mac === "string";
}

function containsCryptoSecretFormat(value: unknown): boolean {
  const pending: Array<{ value: unknown; fieldName: string | null }> = [{ value, fieldName: null }];
  const seen = new WeakSet<object>();
  let containersInspected = 0;
  let nodesInspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    nodesInspected += 1;
    if (nodesInspected > MAX_MEMORY_SECRET_SCAN_NODES) return true;
    if (typeof current.value === "string") {
      const text = current.value;
      if (CRYPTO_SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return true;
      if (containsUnlabelledCryptoKey(text, current.fieldName)) return true;
      continue;
    }
    if (Array.isArray(current.value)) {
      if (seen.has(current.value)) return true;
      seen.add(current.value);
      containersInspected += 1;
      if (containersInspected > MAX_MEMORY_SECRET_SCAN_CONTAINERS) return true;
      if (pending.length + current.value.length > MAX_MEMORY_SECRET_SCAN_NODES) return true;
      if (current.value.length === 64
        && current.value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
        return true;
      }
      if (current.value.some((entry) => typeof entry === "string" && /^[A-Za-z0-9+/]{44}$/.test(entry))) {
        return true;
      }
      for (const entry of current.value) pending.push({ value: entry, fieldName: null });
      continue;
    }
    if (!isMemoryRecordValue(current.value)) continue;
    if (seen.has(current.value)) return true;
    seen.add(current.value);
    containersInspected += 1;
    if (containersInspected > MAX_MEMORY_SECRET_SCAN_CONTAINERS) return true;
    if (isPrivateJwk(current.value) || isEthereumKeyStore(current.value)) return true;
    const entries = Object.entries(current.value);
    if (pending.length + entries.length > MAX_MEMORY_SECRET_SCAN_NODES) return true;
    for (const [fieldName, entry] of entries) {
      pending.push({ value: entry, fieldName });
    }
  }
  return false;
}

function deepStringify(value: unknown): string {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  const parts: string[] = [];
  let containersInspected = 0;
  let nodesInspected = 0;
  let charactersInspected = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    nodesInspected += 1;
    if (nodesInspected > MAX_MEMORY_SECRET_SCAN_NODES) return MEMORY_SECRET_SCAN_LIMIT_PATH;
    if (current === null || current === undefined) continue;
    if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
      const text = String(current);
      charactersInspected += text.length;
      if (charactersInspected > MAX_MEMORY_SECRET_SCAN_CHARACTERS) return MEMORY_SECRET_SCAN_LIMIT_PATH;
      parts.push(text);
      continue;
    }
    if (typeof current !== "object") continue;
    if (seen.has(current)) return MEMORY_SECRET_SCAN_LIMIT_PATH;
    seen.add(current);
    containersInspected += 1;
    if (containersInspected > MAX_MEMORY_SECRET_SCAN_CONTAINERS) return MEMORY_SECRET_SCAN_LIMIT_PATH;
    if (Array.isArray(current)) {
      if (pending.length + current.length > MAX_MEMORY_SECRET_SCAN_NODES) return MEMORY_SECRET_SCAN_LIMIT_PATH;
      for (let index = current.length - 1; index >= 0; index -= 1) pending.push(current[index]);
      continue;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    if (pending.length + entries.length > MAX_MEMORY_SECRET_SCAN_NODES) return MEMORY_SECRET_SCAN_LIMIT_PATH;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (!entry) continue;
      charactersInspected += entry[0].length;
      if (charactersInspected > MAX_MEMORY_SECRET_SCAN_CHARACTERS) return MEMORY_SECRET_SCAN_LIMIT_PATH;
      parts.push(entry[0]);
      pending.push(entry[1]);
    }
  }
  return parts.join(" ");
}

export function findForbiddenMemorySecretFields(body: Record<string, unknown>): string[] {
  const found: string[] = [];
  const pending: Array<{ value: Record<string, unknown>; prefix: string }> = [{ value: body, prefix: "body" }];
  const seen = new WeakSet<object>();
  let containersInspected = 0;
  let nodesScheduled = 1;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (seen.has(current.value)) return [...found, MEMORY_SECRET_SCAN_LIMIT_PATH];
    seen.add(current.value);
    containersInspected += 1;
    if (containersInspected > MAX_MEMORY_SECRET_SCAN_CONTAINERS) {
      return [...found, MEMORY_SECRET_SCAN_LIMIT_PATH];
    }
    const entries = Object.entries(current.value);
    nodesScheduled += entries.length;
    if (nodesScheduled > MAX_MEMORY_SECRET_SCAN_NODES) {
      return [...found, MEMORY_SECRET_SCAN_LIMIT_PATH];
    }
    for (const [key, entry] of entries) {
      const path = `${current.prefix}.${key}`;
      const keyLower = key.toLowerCase();
      if (FORBIDDEN_MEMORY_SECRET_FIELD_NAMES.some((forbidden) => keyLower === forbidden.toLowerCase())) {
        found.push(path);
      }
      if (isMemoryRecordValue(entry)) pending.push({ value: entry, prefix: path });
    }
  }
  return found;
}

export function containsForbiddenMemorySecretMaterial(value: unknown): boolean {
  if (containsCryptoSecretFormat(value)) return true;
  const haystack = deepStringify(value);
  if (haystack === MEMORY_SECRET_SCAN_LIMIT_PATH) return true;
  return FORBIDDEN_MEMORY_SECRET_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function isForbiddenMemorySecretBody(body: Record<string, unknown>): boolean {
  return (
    findForbiddenMemorySecretFields(body).length > 0 || containsForbiddenMemorySecretMaterial(body)
  );
}

export function containsForbiddenMemoryRecordMaterial(
  record: Pick<MatterhornMemoryRecord, "title" | "summary" | "body">,
): boolean {
  return isForbiddenMemorySecretBody(record.body)
    || containsForbiddenMemorySecretMaterial({
      title: record.title,
      summary: record.summary,
    });
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

  if (containsForbiddenMemoryRecordMaterial(record)) {
    errors.push("record contains forbidden secret material");
  }

  return { ok: errors.length === 0, errors };
}

export function redactForbiddenMemorySecrets(
  record: MatterhornMemoryRecord,
): MatterhornMemoryRedactionResult {
  if (containsForbiddenMemoryRecordMaterial(record)) {
    return {
      recordId: record.id,
      redacted: true,
      reason: "Record contains forbidden secret material and cannot be remembered.",
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
  const isWellness =
    tags.includes("wellness") ||
    tags.includes("longevity") ||
    tags.includes("health") ||
    tags.includes("clinical");
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
  "sui_wallet_label",
  "sui_receipt_context",
  "hyperliquid_watched_market",
  "polymarket_watched_market",
  "wellness_client_preference",
  "wellness_program_format_preference",
  "wellness_offer_builder_preference",
  "mcp_tool_preference",
  "workflow_artifact_preference",
  "project_note",
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

export function sanitizeMemorySuggestionLifecycleForDisplay(
  entry: MatterhornMemorySuggestionLifecycle,
): MatterhornMemorySuggestionLifecycle {
  if (!isForbiddenMemorySecretBody(entry.proposedRecord.body)) {
    return entry;
  }

  const redactedBody: Record<string, unknown> = {
    __redacted: true,
    reason: "Forbidden secret material was detected and removed before display.",
    redactedFields: findForbiddenMemorySecretFields(entry.proposedRecord.body),
  };

  return {
    ...entry,
    proposedRecord: {
      ...entry.proposedRecord,
      body: redactedBody,
      summary: "[Redacted] suggestion contains forbidden secret material.",
    },
    status: "blocked",
    policyWarnings: [
      ...(entry.policyWarnings ?? []),
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
  "sui",
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
  sui: {
    desk: "sui",
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
  if (tags.includes("sui")) return "sui";
  if (tags.includes("wellness") || tags.includes("longevity") || tags.includes("health") || tags.includes("clinical")) {
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
    const forbiddenTags = ["bittensor", "hyperliquid", "polymarket", "sui", "wellness", "longevity", "clinical", "wallet"];
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

export const MATTERHORN_MEMORY_SUGGESTION_STATUSES = [
  "pending",
  "confirmed",
  "edited",
  "dismissed",
  "expired",
  "blocked",
] as const;
export type MatterhornMemorySuggestionStatus =
  (typeof MATTERHORN_MEMORY_SUGGESTION_STATUSES)[number];

export const MATTERHORN_MEMORY_SUGGESTION_ACTIONS = [
  "confirm",
  "edit",
  "dismiss",
  "restore",
  "regenerate",
] as const;
export type MatterhornMemorySuggestionAction =
  (typeof MATTERHORN_MEMORY_SUGGESTION_ACTIONS)[number];

export interface MatterhornMemorySuggestionWhySuggested {
  summary: string;
  sourceLabel: string;
  maxLength: number;
}

export interface MatterhornMemorySuggestionLifecycle {
  suggestionId: string;
  dedupeKey: string;
  source: MatterhornMemorySource;
  kind: MatterhornMemoryKind;
  scope: MatterhornMemoryScope;
  sensitivity: MatterhornMemorySensitivity;
  confidence: number;
  reason: string;
  whySuggested?: MatterhornMemorySuggestionWhySuggested;
  visibleProvenance?: MatterhornMemoryProvenance;
  proposedRecord: MatterhornMemoryRecord;
  createdAt: string;
  expiresAt?: string;
  dismissedUntil?: string;
  dismissalWindowDays: number;
  actorConfirmationRequired: true;
  status: MatterhornMemorySuggestionStatus;
  policyWarnings?: string[];
  localOnly?: boolean;
  nonClinical?: boolean;
}

export interface MatterhornMemorySuggestionConfirmationResult {
  action: MatterhornMemorySuggestionAction;
  suggestionId: string;
  status: MatterhornMemorySuggestionStatus;
  memoryRecordId?: string;
  redaction: boolean;
  blockedReasons: string[];
  provenance: MatterhornMemoryProvenance;
}

export const DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS = 30;

export const DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS = 14;

export const MAX_MEMORY_SUGGESTION_REASON_LENGTH = 240;

export function validateMemorySuggestionLifecycle(
  entry: MatterhornMemorySuggestionLifecycle,
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (!entry.suggestionId || typeof entry.suggestionId !== "string") {
    errors.push("lifecycle suggestionId is required and must be a string");
  }

  if (!entry.dedupeKey || typeof entry.dedupeKey !== "string") {
    errors.push("lifecycle dedupeKey is required and must be a string");
  }

  if (!MATTERHORN_MEMORY_SOURCES.includes(entry.source as MatterhornMemorySource)) {
    errors.push(`lifecycle source must be one of ${MATTERHORN_MEMORY_SOURCES.join(", ")}`);
  }

  if (!MATTERHORN_MEMORY_KINDS.includes(entry.kind as MatterhornMemoryKind)) {
    errors.push(`lifecycle kind must be one of ${MATTERHORN_MEMORY_KINDS.join(", ")}`);
  }

  if (!MATTERHORN_MEMORY_SCOPES.includes(entry.scope as MatterhornMemoryScope)) {
    errors.push(`lifecycle scope must be one of ${MATTERHORN_MEMORY_SCOPES.join(", ")}`);
  }

  if (!MATTERHORN_MEMORY_SENSITIVITIES.includes(entry.sensitivity as MatterhornMemorySensitivity)) {
    errors.push(`lifecycle sensitivity must be one of ${MATTERHORN_MEMORY_SENSITIVITIES.join(", ")}`);
  }

  if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) {
    errors.push("lifecycle confidence must be a number between 0 and 1");
  }

  if (!entry.reason || typeof entry.reason !== "string") {
    errors.push("lifecycle reason is required and must be a string");
  } else if (entry.reason.length > MAX_MEMORY_SUGGESTION_REASON_LENGTH) {
    errors.push(`lifecycle reason must be at most ${MAX_MEMORY_SUGGESTION_REASON_LENGTH} characters`);
  }

  if (entry.whySuggested) {
    if (typeof entry.whySuggested.summary !== "string") {
      errors.push("lifecycle whySuggested.summary must be a string");
    } else if (entry.whySuggested.summary.length > entry.whySuggested.maxLength) {
      errors.push("lifecycle whySuggested.summary exceeds whySuggested.maxLength");
    }
    if (typeof entry.whySuggested.sourceLabel !== "string") {
      errors.push("lifecycle whySuggested.sourceLabel must be a string");
    }
    if (entry.whySuggested.maxLength > MAX_MEMORY_SUGGESTION_REASON_LENGTH) {
      errors.push(`lifecycle whySuggested.maxLength must not exceed ${MAX_MEMORY_SUGGESTION_REASON_LENGTH}`);
    }
  }

  if (!entry.proposedRecord || typeof entry.proposedRecord !== "object") {
    errors.push("lifecycle proposedRecord is required");
  } else {
    const recordResult = validateMemorySafety(entry.proposedRecord);
    if (!recordResult.ok) {
      errors.push(`lifecycle proposedRecord is unsafe: ${recordResult.errors.join("; ")}`);
    }

    const tags = entry.proposedRecord.tags.map((tag) => tag.toLowerCase());
    const isWellnessSuggestion =
      tags.includes("wellness") || tags.includes("health") || tags.includes("clinical");
    if (isWellnessSuggestion) {
      if (entry.localOnly !== true) {
        errors.push("wellness suggestions must be localOnly: true");
      }
      if (entry.nonClinical !== true) {
        errors.push("wellness suggestions must be nonClinical: true");
      }
    }
  }

  if (!entry.createdAt || typeof entry.createdAt !== "string") {
    errors.push("lifecycle createdAt is required and must be a string");
  }

  if (typeof entry.dismissalWindowDays !== "number" || entry.dismissalWindowDays < 0) {
    errors.push("lifecycle dismissalWindowDays must be a non-negative number");
  }

  if (entry.actorConfirmationRequired !== true) {
    errors.push("lifecycle actorConfirmationRequired must be true");
  }

  if (!MATTERHORN_MEMORY_SUGGESTION_STATUSES.includes(entry.status as MatterhornMemorySuggestionStatus)) {
    errors.push(`lifecycle status must be one of ${MATTERHORN_MEMORY_SUGGESTION_STATUSES.join(", ")}`);
  }

  if (entry.status === "dismissed" && !entry.dismissedUntil) {
    errors.push("lifecycle dismissed entries must include dismissedUntil");
  }

  return { ok: errors.length === 0, errors };
}

export function isMemorySuggestionDismissalActive(
  entry: MatterhornMemorySuggestionLifecycle,
  now = new Date().toISOString(),
): boolean {
  if (entry.status !== "dismissed" || !entry.dismissedUntil) return false;
  return entry.dismissedUntil > now;
}

export function computeMemorySuggestionDismissedUntil(
  dismissedAt: string,
  dismissalWindowDays = DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
): string {
  const date = new Date(dismissedAt);
  date.setUTCDate(date.getUTCDate() + dismissalWindowDays);
  return date.toISOString();
}

export function computeMemorySuggestionExpiresAt(
  createdAt: string,
  expirationDays = DEFAULT_MEMORY_SUGGESTION_EXPIRATION_DAYS,
): string {
  const date = new Date(createdAt);
  date.setUTCDate(date.getUTCDate() + expirationDays);
  return date.toISOString();
}

export function isMemorySuggestionTransitionAllowed(
  entry: MatterhornMemorySuggestionLifecycle,
  action: MatterhornMemorySuggestionAction,
  now = new Date().toISOString(),
): MatterhornMemoryValidationResult {
  const errors: string[] = [];

  if (!MATTERHORN_MEMORY_SUGGESTION_ACTIONS.includes(action as MatterhornMemorySuggestionAction)) {
    errors.push(`invalid action ${action}`);
    return { ok: false, errors };
  }

  if (action === "confirm" || action === "edit") {
    if (entry.status !== "pending") {
      errors.push(`cannot ${action} a suggestion that is ${entry.status}`);
    }
  }

  if (action === "dismiss") {
    if (entry.status === "expired" || entry.status === "blocked") {
      errors.push(`cannot dismiss a suggestion that is ${entry.status}`);
    }
  }

  if (action === "restore") {
    if (entry.status !== "dismissed") {
      errors.push(`cannot restore a suggestion that is ${entry.status}`);
    } else if (isMemorySuggestionDismissalActive(entry, now)) {
      errors.push("cannot restore a suggestion while the dismissal window is still active");
    }
  }

  if (action === "regenerate") {
    if (entry.status !== "expired") {
      errors.push(`cannot regenerate a suggestion that is ${entry.status}`);
    }
  }

  if (entry.status === "expired" && action !== "regenerate") {
    errors.push("expired suggestions cannot create memory records");
  }

  return { ok: errors.length === 0, errors };
}

export function applyMemorySuggestionAction(
  entry: MatterhornMemorySuggestionLifecycle,
  action: MatterhornMemorySuggestionAction,
  options: {
    memoryRecordId?: string;
    now?: string;
    dismissalWindowDays?: number;
  } = {},
): MatterhornMemorySuggestionConfirmationResult {
  const now = options.now ?? new Date().toISOString();
  const blockedReasons: string[] = [];
  let redaction = false;
  let status: MatterhornMemorySuggestionStatus = entry.status;
  let memoryRecordId = options.memoryRecordId;

  if (!MATTERHORN_MEMORY_SUGGESTION_ACTIONS.includes(action as MatterhornMemorySuggestionAction)) {
    blockedReasons.push(`invalid action ${action}`);
    status = "blocked";
  }

  const lifecycleResult = validateMemorySuggestionLifecycle(entry);
  if (!lifecycleResult.ok) {
    blockedReasons.push(...lifecycleResult.errors);
    status = "blocked";
  }

  const transitionResult = isMemorySuggestionTransitionAllowed(entry, action, now);
  if (!transitionResult.ok) {
    blockedReasons.push(...transitionResult.errors);
    status = "blocked";
  }

  if (isForbiddenMemorySecretBody(entry.proposedRecord.body)) {
    blockedReasons.push("proposed record contains forbidden secret material");
    redaction = true;
    status = "blocked";
  }

  if (action === "confirm") {
    if (status !== "blocked") {
      status = "confirmed";
      memoryRecordId = memoryRecordId ?? `mem-${entry.suggestionId}`;
    }
  } else if (action === "edit") {
    if (status !== "blocked") {
      status = "edited";
      memoryRecordId = memoryRecordId ?? `mem-edited-${entry.suggestionId}`;
    }
  } else if (action === "dismiss") {
    status = "dismissed";
    memoryRecordId = undefined;
  } else if (action === "restore") {
    if (status !== "blocked") {
      status = "pending";
      memoryRecordId = undefined;
    }
  } else if (action === "regenerate") {
    if (status !== "blocked") {
      status = "pending";
      memoryRecordId = undefined;
    }
  }

  const provenance: MatterhornMemoryProvenance = {
    source: "user_confirmed",
    capturedAt: now,
    capturedBy: "user",
    confidence: entry.confidence,
    reasonRemembered: `Suggestion ${entry.suggestionId} received action ${action}`,
  };

  return {
    action,
    suggestionId: entry.suggestionId,
    status,
    memoryRecordId,
    redaction,
    blockedReasons,
    provenance,
  };
}

export function canMemorySuggestionActionProduceMemoryRecord(
  result: MatterhornMemorySuggestionConfirmationResult,
): boolean {
  return (
    (result.status === "confirmed" || result.status === "edited") &&
    result.redaction === false &&
    result.blockedReasons.length === 0 &&
    typeof result.memoryRecordId === "string"
  );
}

export function createMemorySuggestionLifecycleFixture(
  status: MatterhornMemorySuggestionStatus,
  overrides: Partial<MatterhornMemorySuggestionLifecycle> = {},
): MatterhornMemorySuggestionLifecycle {
  const now = new Date();
  const createdAt = now.toISOString();
  const dismissedUntil =
    status === "dismissed"
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  const expiresAt =
    status === "expired"
      ? new Date(now.getTime() - 1).toISOString()
      : computeMemorySuggestionExpiresAt(createdAt);

  const base: MatterhornMemorySuggestionLifecycle = {
    suggestionId: `sugg-fixture-${status}`,
    dedupeKey: `fixture/${status}/example`,
    source: "chat_capture",
    kind: "user_preference",
    scope: "user",
    sensitivity: "public",
    confidence: 0.9,
    reason: `Example ${status} suggestion fixture`,
    whySuggested: {
      summary: `Example ${status} suggestion fixture`,
      sourceLabel: "Chat context",
      maxLength: MAX_MEMORY_SUGGESTION_REASON_LENGTH,
    },
    visibleProvenance: {
      source: "chat_capture",
      sourceId: "fixture-message-1",
      capturedAt: createdAt,
      capturedBy: "agent",
      confidence: 0.9,
      reasonRemembered: `Fixture for ${status}`,
    },
    proposedRecord: {
      id: `rec-fixture-${status}`,
      kind: "user_preference",
      scope: "user",
      title: "Example public preference",
      summary: "Safe public data only",
      body: { interest: "public example" },
      tags: ["example"],
      links: [],
      provenance: {
        source: "chat_capture",
        capturedAt: createdAt,
        capturedBy: "agent",
        confidence: 0.9,
        reasonRemembered: `Fixture for ${status}`,
      },
      sensitivity: "public",
      createdAt,
      updatedAt: createdAt,
      canUseInChat: true,
      canExport: false,
      canDelete: true,
    },
    createdAt,
    expiresAt,
    dismissedUntil,
    dismissalWindowDays: DEFAULT_MEMORY_SUGGESTION_DISMISSAL_WINDOW_DAYS,
    actorConfirmationRequired: true,
    status,
    localOnly: false,
    nonClinical: true,
    ...overrides,
  };

  return base;
}

export function createWellnessMemorySuggestionLifecycleFixture(
  status: MatterhornMemorySuggestionStatus,
  overrides: Partial<MatterhornMemorySuggestionLifecycle> = {},
): MatterhornMemorySuggestionLifecycle {
  return createMemorySuggestionLifecycleFixture(status, {
    suggestionId: `sugg-wellness-fixture-${status}`,
    dedupeKey: `wellness/fixture/${status}`,
    kind: "user_preference",
    sensitivity: "restricted",
    reason: "Example wellness suggestion fixture",
    localOnly: true,
    nonClinical: true,
    proposedRecord: {
      id: `rec-wellness-fixture-${status}`,
      kind: "user_preference",
      scope: "user",
      title: "Longevity preference",
      summary: "Educational opt-in preference",
      body: { interest: "sleep education" },
      tags: ["wellness", "opt-in"],
      links: [],
      provenance: {
        source: "user_confirmed",
        capturedAt: new Date().toISOString(),
        capturedBy: "user",
        confidence: 1,
        reasonRemembered: "User opted into wellness education",
      },
      sensitivity: "restricted",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      canUseInChat: true,
      canExport: false,
      canDelete: true,
    },
    ...overrides,
  });
}

export function createBittensorMemorySuggestionLifecycleFixture(
  status: MatterhornMemorySuggestionStatus,
  overrides: Partial<MatterhornMemorySuggestionLifecycle> = {},
): MatterhornMemorySuggestionLifecycle {
  return createMemorySuggestionLifecycleFixture(status, {
    suggestionId: `sugg-bittensor-fixture-${status}`,
    dedupeKey: `bittensor/fixture/${status}`,
    kind: "protocol_address",
    sensitivity: "public",
    reason: "Example Bittensor suggestion fixture",
    proposedRecord: {
      id: `rec-bittensor-fixture-${status}`,
      kind: "protocol_address",
      scope: "user",
      title: "TAO wallet label",
      summary: "Public SS58 address label",
      body: { ss58Address: "5abc123...", coldkey: "my-coldkey", hotkey: "5xyz789..." },
      tags: ["bittensor"],
      links: [],
      provenance: {
        source: "user_confirmed",
        capturedAt: new Date().toISOString(),
        capturedBy: "user",
        confidence: 1,
        reasonRemembered: "User labeled a TAO wallet",
      },
      sensitivity: "public",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      canUseInChat: true,
      canExport: true,
      canDelete: true,
    },
    ...overrides,
  });
}

export function createMarketMemorySuggestionLifecycleFixture(
  status: MatterhornMemorySuggestionStatus,
  overrides: Partial<MatterhornMemorySuggestionLifecycle> = {},
): MatterhornMemorySuggestionLifecycle {
  return createMemorySuggestionLifecycleFixture(status, {
    suggestionId: `sugg-market-fixture-${status}`,
    dedupeKey: `market/fixture/${status}`,
    kind: "watchlist",
    sensitivity: "public",
    reason: "Example market watch suggestion fixture",
    proposedRecord: {
      id: `rec-market-fixture-${status}`,
      kind: "watchlist",
      scope: "user",
      title: "BTC watchlist",
      summary: "Track BTC price on Hyperliquid",
      body: { symbol: "BTC", exchange: "hyperliquid" },
      tags: ["hyperliquid", "watchlist"],
      links: [],
      provenance: {
        source: "user_confirmed",
        capturedAt: new Date().toISOString(),
        capturedBy: "user",
        confidence: 1,
        reasonRemembered: "User added BTC to watchlist",
      },
      sensitivity: "public",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      canUseInChat: true,
      canExport: false,
      canDelete: true,
    },
    ...overrides,
  });
}
