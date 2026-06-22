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
];

export const FORBIDDEN_MEMORY_SECRET_PATTERNS = [
  /seed\s*phrase/i,
  /private\s*key/i,
  /mnemonic/i,
  /api\s*secret/i,
  /raw\s*signature/i,
  /signed\s*(payload|order|action)/i,
  /wallet\s*export/i,
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
  if (bodyText.includes("diagnosis") || bodyText.includes("treatment plan") || bodyText.includes("prescription")) {
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
