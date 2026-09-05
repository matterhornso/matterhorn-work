import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  MatterhornAgentCapabilityClaims,
  MatterhornAgentDataLabel,
  MatterhornAgentJurisdictionPolicyContext,
  MatterhornAgentPrivacyMode,
  MatterhornAgentPrivacyPart,
  MatterhornAgentPrivacyPreflightResponse,
  MatterhornAgentRunReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";
import type { MatterhornExecutionMode } from "@matterhorn-work/types/execution-mode";
import type { ManagedMcpToolCallMetric } from "./managed-opencode-mcp.js";
import type { GuardedRuntimeObservationMetric } from "./operational-metrics.js";
import {
  MATTERHORN_CAPABILITY_CALL_ARGUMENT,
  MatterhornAgentCapabilityBroker,
  type MatterhornCoworkerRunBinding,
  capabilityArgsHash,
  guardedCapabilityEnforcementActive,
  stripCapabilityArgument,
} from "./agent-capability.js";
import { MatterhornPrivacyFirewall } from "./agent-privacy.js";
import { MatterhornAgentRunReceiptStore } from "./agent-run-receipts.js";
import {
  MatterhornGuardedCryptoAppAuthorization,
  type MatterhornCryptoAppCapabilityBinding,
} from "./crypto-app-guarded-authorization.js";
import type { MatterhornEvidenceKeyManager } from "./crypto-evidence-sealer.js";
import type { MatterhornWalrusCertificationVerifier } from "./crypto-evidence-walrus-publisher.js";
import { MatterhornAgentFileStore } from "./agent-file-store.js";
import {
  MatterhornAgentFileWalrusRenewalService,
  type MatterhornSuiTransactionStatusVerifier,
  type MatterhornWalrusRenewalTransactionBuilder,
} from "./agent-file-walrus-renewal.js";
import { MatterhornCryptoEvidenceStore } from "./crypto-evidence-store.js";
import {
  MatterhornCryptoEvidenceWalrusDeletionService,
  type MatterhornWalrusDeletionTransactionBuilder,
} from "./crypto-evidence-walrus-deletion.js";
import { MatterhornCryptoEvidenceWalrusRenewalService } from "./crypto-evidence-walrus-renewal.js";
import {
  MatterhornCryptoEvidenceSuiAnchorService,
  type MatterhornSuiEvidenceAnchorTransactionBuilder,
  type MatterhornSuiEvidenceAnchorTransactionVerifier,
} from "./crypto-evidence-sui-anchor.js";
import { MatterhornPendingCryptoIntentStore } from "./crypto-pending-intent-store.js";
import type { MatterhornFinalizedCoworkerRun } from "./crypto-evidence-finalizer.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { canonicalJson, equalDigest, sha256 } from "./guarded-runtime-crypto.js";
import {
  MatterhornGuardedRuntimeStateStore,
  type GuardedRuntimeStateKind,
  type GuardedRuntimeStateRecord,
} from "./guarded-runtime-state-store.js";
import type { MatterhornTrustedJurisdiction } from "./trusted-jurisdiction.js";
import { evaluatePolymarketOpenPositionJurisdiction } from "./polymarket-jurisdiction-policy.js";
import type {
  MatterhornRecoveryErasureLedger,
  MatterhornRecoveryErasureReconciliation,
} from "./recovery-erasure-ledger.js";

export class GuardedRuntimeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type GuardedPromptInput = {
  workspaceId: string;
  sessionId: string;
  parts: MatterhornAgentPrivacyPart[];
  providerId: string;
  providerName?: string;
  modelId: string;
  agentId?: string;
  attachmentIds?: string[];
  /** Selected encrypted Agent Files. Included separately for content-free receipt counts. */
  agentFileIds?: string[];
  memoryIds?: string[];
  /** Server-derived, content-free context compiler measurements. */
  contextOptimization?: MatterhornAgentRunReceipt["contextOptimization"];
  privacyMode?: MatterhornAgentPrivacyMode;
  privacyConsentToken?: string;
  executionMode: MatterhornExecutionMode;
  requestToolProfiles?: readonly Record<string, boolean>[];
  coworker?: MatterhornCoworkerRunBinding;
  authorizationContextHash?: string;
  /** Trusted edge policy context. This is never added to provider messages. */
  jurisdiction?: MatterhornTrustedJurisdiction;
};

export type GuardedPromptAcceptance = {
  runId: string;
  preflight: MatterhornAgentPrivacyPreflightResponse;
  consentUsed: boolean;
};

export type GuardedPromptAuthorization = {
  preflight: MatterhornAgentPrivacyPreflightResponse;
  consentRequired: boolean;
};

export type GuardedProviderSystemContext = {
  /**
   * Exact, already-classified sections that the trusted OpenCode plugin may
   * send as provider system context. The runtime keeps these bytes in memory
   * only for the lifetime of the active run.
   */
  sections: readonly string[];
  purpose: "message" | "compaction";
};

const PROVIDER_SYSTEM_MAX_SECTIONS = 16;
const PROVIDER_SYSTEM_MAX_BYTES = 256 * 1_024;
const PROVIDER_MESSAGES_MAX_COUNT = 2_048;
const PROVIDER_MESSAGES_MAX_BYTES = 16 * 1_024 * 1_024;
const PROVIDER_MESSAGES_VALIDATION_TTL_MS = 30_000;
const SESSION_PRIVACY_FLOOR_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const SESSION_PRIVACY_FLOOR_ENVELOPE_VERSION = "matterhorn.session-privacy-floor-envelope.v1";
const SESSION_PRIVACY_FLOOR_AUTHORITY_DOMAIN = "matterhorn.session-privacy-floor.authority.v1";
const SESSION_PRIVACY_FLOOR_AUTHORITY_SALT = Buffer.from("matterhorn.session-privacy-floor.key.v1", "utf8");
const SESSION_PRIVACY_FLOOR_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const SESSION_PRIVACY_FLOOR_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const FINALIZED_RUN_ENVELOPE_VERSION = "matterhorn.finalized-coworker-run-envelope.v1";
const FINALIZED_RUN_AUTHORITY_DOMAIN = "matterhorn.finalized-coworker-run.authority.v1";
const FINALIZED_RUN_AUTHORITY_SALT = Buffer.from("matterhorn.finalized-coworker-run.key.v1", "utf8");
const FINALIZED_RUN_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const FINALIZED_RUN_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GUARDED_RUN_AUTHORITY_TTL_MS = 6 * 60 * 60 * 1_000;
const GUARDED_STAGED_CALL_TTL_MS = 60_000;
const GUARDED_RECEIPT_INDEX_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

type GuardedRunState = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  jurisdictionEvidenceHash: string | null;
  jurisdictionPolicyHash: string | null;
};

type GuardedMessageBindingState = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  messageId: string;
};

type GuardedStagedCapabilityState = {
  callId: string;
  runId: string;
  workspaceId: string;
  sessionId: string;
  claims: MatterhornAgentCapabilityClaims;
  token: string;
  expiresAtMs: number;
};

type GuardedPersistedStagedCapabilityState = Omit<GuardedStagedCapabilityState, "token">;

type GuardedRolloutBypassState = {
  callId: string;
  runId: string;
  workspaceId: string;
  sessionId: string;
  agentId: string | null;
  toolName: string;
  argsHash: string;
  reason: string;
  issuedMode: "shadow" | "enforce";
  expiresAtMs: number;
};

type GuardedReceiptIndexState = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  receiptId: string;
  status: MatterhornAgentRunReceipt["status"];
  recordHash: string;
  completedAt: string | null;
};

type GuardedSessionPrivacyFloor = {
  workspaceId: string;
  sessionId: string;
  mode: MatterhornAgentPrivacyMode;
  updatedAt: string;
};

type GuardedSessionPrivacyFloorEnvelope = {
  version: typeof SESSION_PRIVACY_FLOOR_ENVELOPE_VERSION;
  floor: GuardedSessionPrivacyFloor;
  authoritySeal: string;
};

type GuardedFinalizedCoworkerRunEnvelope = {
  version: typeof FINALIZED_RUN_ENVELOPE_VERSION;
  finalizedRun: MatterhornFinalizedCoworkerRun;
  authoritySeal: string;
};

function sessionPrivacyFloorAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < SESSION_PRIVACY_FLOOR_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new Error("session_privacy_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    SESSION_PRIVACY_FLOOR_AUTHORITY_SALT,
    SESSION_PRIVACY_FLOOR_AUTHORITY_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function exactGuardedObjectKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function sessionPrivacyFloorAuthorityValue(input: {
  key: string;
  workspaceId: string;
  sessionId: string | null;
  expiresAtMs: number | null;
  updatedAtMs: number;
  floor: GuardedSessionPrivacyFloor;
}) {
  return {
    domain: SESSION_PRIVACY_FLOOR_AUTHORITY_DOMAIN,
    kind: "session_privacy_floor",
    ...input,
  };
}

function sealSessionPrivacyFloorAuthority(value: unknown, key: Buffer): string {
  return createHmac("sha256", key).update(canonicalJson(value), "utf8").digest("base64url");
}

function sessionPrivacyFloorAuthoritySealValid(value: unknown, seal: string, key: Buffer): boolean {
  if (!SESSION_PRIVACY_FLOOR_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const expected = Buffer.from(sealSessionPrivacyFloorAuthority(value, key), "base64url");
  const actual = Buffer.from(seal, "base64url");
  try {
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  } finally {
    expected.fill(0);
    actual.fill(0);
  }
}

function assertSessionPrivacyFloorState(
  state: GuardedRuntimeStateRecord<unknown> | null,
  key: string,
  authorityKey: Buffer,
): GuardedSessionPrivacyFloor | null {
  if (!state) return null;
  const value = state.value;
  if (!exactGuardedObjectKeys(value, ["version", "floor", "authoritySeal"])
    || value.version !== SESSION_PRIVACY_FLOOR_ENVELOPE_VERSION
    || typeof value.authoritySeal !== "string"
    || !exactGuardedObjectKeys(value.floor, ["workspaceId", "sessionId", "mode", "updatedAt"])) {
    throw new Error("session_privacy_state_invalid");
  }
  const floor = value.floor as GuardedSessionPrivacyFloor;
  const updatedAtMs = Date.parse(floor.updatedAt);
  if (state.kind !== "session_privacy_floor"
    || state.key !== key
    || !guardedRunIdentifier(floor.workspaceId)
    || !guardedRunIdentifier(floor.sessionId)
    || floor.sessionId !== key
    || (floor.mode !== "public_research"
      && floor.mode !== "private_workspace"
      && floor.mode !== "transaction")
    || !Number.isSafeInteger(updatedAtMs)
    || new Date(updatedAtMs).toISOString() !== floor.updatedAt
    || state.workspaceId !== floor.workspaceId
    || state.sessionId !== floor.sessionId
    || state.updatedAtMs !== updatedAtMs
    || state.expiresAtMs !== updatedAtMs + SESSION_PRIVACY_FLOOR_RETENTION_MS) {
    throw new Error("session_privacy_state_invalid");
  }
  const authorityValue = sessionPrivacyFloorAuthorityValue({
    key: state.key,
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    expiresAtMs: state.expiresAtMs,
    updatedAtMs: state.updatedAtMs,
    floor,
  });
  if (!sessionPrivacyFloorAuthoritySealValid(
    authorityValue,
    value.authoritySeal,
    authorityKey,
  )) {
    throw new Error("session_privacy_state_invalid");
  }
  return structuredClone(floor);
}

function finalizedRunAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < FINALIZED_RUN_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new Error("crypto_evidence_finalization_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    FINALIZED_RUN_AUTHORITY_SALT,
    FINALIZED_RUN_AUTHORITY_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function finalizedRunAuthorityValue(input: {
  key: string;
  workspaceId: string;
  sessionId: string | null;
  expiresAtMs: number | null;
  updatedAtMs: number;
  finalizedRun: MatterhornFinalizedCoworkerRun;
}) {
  return {
    domain: FINALIZED_RUN_AUTHORITY_DOMAIN,
    kind: "crypto_evidence_finalization",
    ...input,
  };
}

function sealFinalizedRunAuthority(value: unknown, key: Buffer): string {
  return createHmac("sha256", key).update(canonicalJson(value), "utf8").digest("base64url");
}

function finalizedRunAuthoritySealValid(value: unknown, seal: string, key: Buffer): boolean {
  if (!FINALIZED_RUN_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const expected = Buffer.from(sealFinalizedRunAuthority(value, key), "base64url");
  const actual = Buffer.from(seal, "base64url");
  try {
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  } finally {
    expected.fill(0);
    actual.fill(0);
  }
}

const GUARDED_RUN_ID = /^(?:agent_run(?:_off)?|coworker_run)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function guardedRunStateHasExactKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = [
    "jurisdictionEvidenceHash",
    "jurisdictionPolicyHash",
    "runId",
    "sessionId",
    "workspaceId",
  ];
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function guardedRunIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && value.trim() === value;
}

function guardedRunHashOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function assertGuardedRunState(
  state: GuardedRuntimeStateRecord<GuardedRunState> | null,
  kind: "active_agent_run" | "agent_run_scope",
  key: string,
  nowMs: number,
): GuardedRunState | null {
  if (!state) return null;
  const value = state.value;
  if (!guardedRunStateHasExactKeys(value)) {
    throw new Error("guarded_run_state_invalid");
  }
  const keyMatches = kind === "active_agent_run"
    ? value.sessionId === key
    : value.runId === key;
  if (
    state.kind !== kind
    || state.key !== key
    || !GUARDED_RUN_ID.test(value.runId)
    || !guardedRunIdentifier(value.workspaceId)
    || !guardedRunIdentifier(value.sessionId)
    || !guardedRunHashOrNull(value.jurisdictionEvidenceHash)
    || !guardedRunHashOrNull(value.jurisdictionPolicyHash)
    || !keyMatches
    || state.workspaceId !== value.workspaceId
    || state.sessionId !== value.sessionId
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || !Number.isSafeInteger(state.expiresAtMs)
    || (state.expiresAtMs as number) <= nowMs
    || (state.expiresAtMs as number) - state.updatedAtMs > GUARDED_RUN_AUTHORITY_TTL_MS
  ) {
    throw new Error("guarded_run_state_invalid");
  }
  return value as GuardedRunState;
}

function guardedMessageBindingHasExactKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = ["messageId", "runId", "sessionId", "workspaceId"];
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function guardedMessageIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function assertGuardedMessageBindingState(
  state: GuardedRuntimeStateRecord<unknown> | null,
  kind: "user_message_binding" | "assistant_message_binding",
  messageId: string,
  nowMs: number,
): GuardedMessageBindingState | null {
  if (!state) return null;
  const value = state.value;
  if (!guardedMessageBindingHasExactKeys(value)) {
    throw new Error("guarded_message_binding_state_invalid");
  }
  if (
    state.kind !== kind
    || state.key !== messageId
    || !guardedRunIdentifier(value.runId)
    || !GUARDED_RUN_ID.test(value.runId)
    || !guardedRunIdentifier(value.workspaceId)
    || !guardedRunIdentifier(value.sessionId)
    || !guardedMessageIdentifier(value.messageId)
    || value.messageId !== messageId
    || state.workspaceId !== value.workspaceId
    || state.sessionId !== value.sessionId
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || !Number.isSafeInteger(state.expiresAtMs)
    || (state.expiresAtMs as number) <= nowMs
    || (state.expiresAtMs as number) - state.updatedAtMs > GUARDED_RUN_AUTHORITY_TTL_MS
  ) {
    throw new Error("guarded_message_binding_state_invalid");
  }
  return value as GuardedMessageBindingState;
}

function guardedPersistedStagedCapabilityHasExactKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = ["callId", "claims", "expiresAtMs", "runId", "sessionId", "workspaceId"];
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function assertGuardedPersistedStagedCapabilityState(
  state: GuardedRuntimeStateRecord<unknown> | null,
  callId: string,
  nowMs: number,
): GuardedPersistedStagedCapabilityState | null {
  if (!state) return null;
  const value = state.value;
  if (!guardedPersistedStagedCapabilityHasExactKeys(value)
    || !value.claims
    || typeof value.claims !== "object"
    || Array.isArray(value.claims)) {
    throw new Error("guarded_staged_capability_state_invalid");
  }
  const claims = value.claims as Record<string, unknown>;
  if (
    state.kind !== "staged_capability"
    || state.key !== callId
    || !guardedRunIdentifier(value.callId)
    || value.callId !== callId
    || !guardedRunIdentifier(value.runId)
    || !GUARDED_RUN_ID.test(value.runId)
    || !guardedRunIdentifier(value.workspaceId)
    || !guardedRunIdentifier(value.sessionId)
    || !Number.isSafeInteger(value.expiresAtMs)
    || claims.callId !== value.callId
    || claims.runId !== value.runId
    || claims.workspaceId !== value.workspaceId
    || claims.sessionId !== value.sessionId
    || typeof claims.expiresAt !== "string"
    || Date.parse(claims.expiresAt) !== value.expiresAtMs
    || state.workspaceId !== value.workspaceId
    || state.sessionId !== value.sessionId
    || state.expiresAtMs !== value.expiresAtMs
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || (state.expiresAtMs as number) <= nowMs
    || (state.expiresAtMs as number) - state.updatedAtMs > GUARDED_STAGED_CALL_TTL_MS
  ) {
    throw new Error("guarded_staged_capability_state_invalid");
  }
  return value as GuardedPersistedStagedCapabilityState;
}

function guardedRolloutBypassHasExactKeys(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = [
    "agentId",
    "argsHash",
    "callId",
    "expiresAtMs",
    "issuedMode",
    "reason",
    "runId",
    "sessionId",
    "toolName",
    "workspaceId",
  ];
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function assertGuardedRolloutBypassState(
  state: GuardedRuntimeStateRecord<unknown> | null,
  callId: string,
  nowMs: number,
): GuardedRolloutBypassState | null {
  if (!state) return null;
  const value = state.value;
  if (!guardedRolloutBypassHasExactKeys(value)) {
    throw new Error("guarded_rollout_bypass_state_invalid");
  }
  const issuedMode = value.issuedMode;
  const reason = value.reason;
  if (
    state.kind !== "rollout_bypass"
    || state.key !== callId
    || !guardedRunIdentifier(value.callId)
    || value.callId !== callId
    || !guardedRunIdentifier(value.runId)
    || (issuedMode === "enforce" && !GUARDED_RUN_ID.test(value.runId))
    || !guardedRunIdentifier(value.workspaceId)
    || !guardedRunIdentifier(value.sessionId)
    || !(value.agentId === null || guardedRunIdentifier(value.agentId))
    || !guardedRunIdentifier(value.toolName)
    || typeof value.argsHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.argsHash)
    || typeof reason !== "string"
    || !(reason === "capability_denied" || GUARDED_OBSERVATION_REASONS.has(reason))
    || (issuedMode !== "shadow" && issuedMode !== "enforce")
    || (issuedMode === "enforce" && reason !== "rollout_not_enforced")
    || !Number.isSafeInteger(value.expiresAtMs)
    || state.workspaceId !== value.workspaceId
    || state.sessionId !== value.sessionId
    || state.expiresAtMs !== value.expiresAtMs
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || (state.expiresAtMs as number) <= nowMs
    || (state.expiresAtMs as number) - state.updatedAtMs > GUARDED_STAGED_CALL_TTL_MS
  ) {
    throw new Error("guarded_rollout_bypass_state_invalid");
  }
  return value as GuardedRolloutBypassState;
}

function assertGuardedReceiptIndexState(
  state: GuardedRuntimeStateRecord<unknown> | null,
  runId: string,
  nowMs: number,
): GuardedReceiptIndexState | null {
  if (!state) return null;
  const value = state.value;
  if (!exactGuardedObjectKeys(value, [
    "completedAt",
    "receiptId",
    "recordHash",
    "runId",
    "sessionId",
    "status",
    "workspaceId",
  ])) {
    throw new Error("agent_run_receipt_index_invalid");
  }
  const completedAtMs = value.completedAt === null ? null : Date.parse(String(value.completedAt));
  if (
    state.kind !== "receipt_index"
    || state.key !== runId
    || value.runId !== runId
    || !GUARDED_RUN_ID.test(runId)
    || !guardedRunIdentifier(value.workspaceId)
    || !guardedRunIdentifier(value.sessionId)
    || value.receiptId !== `run_receipt_${runId.replace(/[^a-zA-Z0-9_-]/g, "_")}`
    || (value.status !== "pending"
      && value.status !== "success"
      && value.status !== "partial"
      && value.status !== "cancelled"
      && value.status !== "error")
    || typeof value.recordHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.recordHash)
    || !(value.completedAt === null
      || (typeof value.completedAt === "string"
        && Number.isSafeInteger(completedAtMs)
        && new Date(completedAtMs as number).toISOString() === value.completedAt))
    || (value.status === "pending") !== (value.completedAt === null)
    || state.workspaceId !== value.workspaceId
    || state.sessionId !== value.sessionId
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || !Number.isSafeInteger(state.expiresAtMs)
    || (state.expiresAtMs as number) <= nowMs
    || (state.expiresAtMs as number) - state.updatedAtMs > GUARDED_RECEIPT_INDEX_RETENTION_MS
  ) {
    throw new Error("agent_run_receipt_index_invalid");
  }
  return value as GuardedReceiptIndexState;
}

function privacyModeRank(mode: MatterhornAgentPrivacyMode): number {
  if (mode === "transaction") return 2;
  if (mode === "private_workspace") return 1;
  return 0;
}

function sessionHistoryLabel(
  mode: MatterhornAgentPrivacyMode,
): Extract<MatterhornAgentDataLabel, "public" | "workspace_private" | "wallet_private"> {
  if (mode === "transaction") return "wallet_private";
  if (mode === "private_workspace") return "workspace_private";
  return "public";
}

function normalizeProviderSystemContext(
  context: GuardedProviderSystemContext | undefined,
  privacyParts: readonly MatterhornAgentPrivacyPart[],
): { system: string; systemHash: string; purpose: GuardedProviderSystemContext["purpose"] } | null {
  if (!context) return null;
  if (
    !Array.isArray(context.sections)
    || context.sections.length === 0
    || context.sections.length > PROVIDER_SYSTEM_MAX_SECTIONS
    || (context.purpose !== "message" && context.purpose !== "compaction")
  ) {
    throw new GuardedRuntimeError(
      400,
      "agent_provider_system_invalid",
      "The provider system context is invalid.",
    );
  }
  const sections = context.sections.filter((section) => typeof section === "string" && section.length > 0);
  if (sections.length !== context.sections.length) {
    throw new GuardedRuntimeError(
      400,
      "agent_provider_system_invalid",
      "The provider system context is invalid.",
    );
  }
  const system = sections.join("\n");
  if (Buffer.byteLength(system, "utf8") > PROVIDER_SYSTEM_MAX_BYTES) {
    throw new GuardedRuntimeError(
      413,
      "agent_provider_system_too_large",
      "The provider system context is too large to verify safely.",
    );
  }
  for (const section of sections) {
    const sectionHash = sha256(section);
    const classified = privacyParts.some((part) => (
      typeof part.contentHash === "string" && equalDigest(part.contentHash, sectionHash)
    ));
    if (!classified) {
      throw new GuardedRuntimeError(
        409,
        "agent_provider_system_unclassified",
        "Provider system context changed after privacy review.",
      );
    }
  }
  const systemHash = sha256(system);
  const manifestBound = privacyParts.some((part) => (
    part.type === "provider_system_manifest"
    && typeof part.contentHash === "string"
    && equalDigest(part.contentHash, systemHash)
    && part.version === `matterhorn.provider-system.${context.purpose}.v1`
  ));
  if (!manifestBound) {
    throw new GuardedRuntimeError(
      409,
      "agent_provider_system_unbound",
      "Provider system context order changed after privacy review.",
    );
  }
  return { system, systemHash, purpose: context.purpose };
}

function normalizeRuntimeProviderMessages(
  messages: unknown,
  expectedSessionId: string,
): {
  inspectionText: string;
  userIntentText: string;
  hasAttachment: boolean;
  hasToolOutput: boolean;
  messagesHash: string;
} {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > PROVIDER_MESSAGES_MAX_COUNT) {
    throw new GuardedRuntimeError(
      400,
      "agent_provider_messages_invalid",
      "The final provider messages are invalid.",
    );
  }
  const userIntentParts: unknown[] = [];
  let hasAttachment = false;
  let hasToolOutput = false;
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new GuardedRuntimeError(400, "agent_provider_messages_invalid", "The final provider messages are invalid.");
    }
    const info = Reflect.get(message, "info");
    const parts = Reflect.get(message, "parts");
    const sessionId = info && typeof info === "object" && !Array.isArray(info)
      ? Reflect.get(info, "sessionID")
      : null;
    if (sessionId !== expectedSessionId || !Array.isArray(parts)) {
      throw new GuardedRuntimeError(
        409,
        "agent_provider_messages_scope_mismatch",
        "The final provider messages are not bound to this chat.",
      );
    }
    const role = Reflect.get(info, "role");
    for (const part of parts) {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        throw new GuardedRuntimeError(
          400,
          "agent_provider_messages_invalid",
          "The final provider messages are invalid.",
        );
      }
      const type = Reflect.get(part, "type");
      if (typeof type !== "string" || !type.trim()) {
        throw new GuardedRuntimeError(
          400,
          "agent_provider_messages_invalid",
          "The final provider messages are invalid.",
        );
      }
      if (role === "user") userIntentParts.push(part);
      if (type === "file" || type === "attachment") hasAttachment = true;
      if (type === "tool") hasToolOutput = true;
    }
  }
  let inspectionText = "";
  let userIntentText = "";
  try {
    inspectionText = JSON.stringify(messages);
    userIntentText = JSON.stringify(userIntentParts);
  } catch {
    throw new GuardedRuntimeError(400, "agent_provider_messages_invalid", "The final provider messages are invalid.");
  }
  if (!inspectionText || Buffer.byteLength(inspectionText, "utf8") > PROVIDER_MESSAGES_MAX_BYTES) {
    throw new GuardedRuntimeError(
      413,
      "agent_provider_messages_too_large",
      "The final provider messages are too large to verify safely.",
    );
  }
  return {
    inspectionText,
    userIntentText,
    hasAttachment,
    hasToolOutput,
    messagesHash: sha256(inspectionText),
  };
}

function selectedContextCounts(input: GuardedPromptInput): NonNullable<MatterhornAgentRunReceipt["context"]> {
  const coworkerFiles = new Set((input.agentFileIds ?? []).map((id) => id.trim()).filter(Boolean));
  const chatFiles = new Set(
    (input.attachmentIds ?? [])
      .map((id) => id.trim())
      .filter((id) => Boolean(id) && !coworkerFiles.has(id)),
  );
  const savedMemories = new Set((input.memoryIds ?? []).map((id) => id.trim()).filter(Boolean));
  return {
    chatFiles: chatFiles.size,
    coworkerFiles: coworkerFiles.size,
    savedMemories: savedMemories.size,
  };
}

export type DeterministicCoworkerRunInput = {
  workspaceId: string;
  sessionId: string;
  agentId?: string;
  coworker: MatterhornCoworkerRunBinding;
  requestToolProfiles: readonly Record<string, boolean>[];
  maxReadCalls: number;
};

const GUARDED_OBSERVATION_REASONS = new Set([
  "capability_agent_mismatch",
  "capability_argument_mutation",
  "capability_call_reissued",
  "capability_coworker_app_binding_required",
  "capability_coworker_authority_denied",
  "capability_coworker_connection_resolution_required",
  "capability_coworker_inactive",
  "capability_coworker_mismatch",
  "capability_coworker_scope_mismatch",
  "capability_expired",
  "capability_invalid_signature",
  "capability_prepare_budget_exhausted",
  "capability_prepare_family_already_completed",
  "capability_prepare_family_resolution_required",
  "capability_prepare_requires_work_mode",
  "capability_read_budget_exhausted",
  "capability_replayed",
  "capability_run_or_tool_not_found",
  "capability_scope_mismatch",
  "capability_signing_secret_missing",
  "capability_tool_not_in_run_grant",
  "capability_wrong_desk",
  "capability_wrong_tool",
  "guarded_rollout_bypass_state_invalid",
  "guarded_run_state_invalid",
  "guarded_staged_capability_state_invalid",
  "missing_call_id",
  "policy_allowed",
  "rollout_not_enforced",
  "unknown_or_replayed_call_id",
]);
const EVIDENCE_FINALIZATION_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

function assertFinalizedCoworkerRunState(
  state: GuardedRuntimeStateRecord<unknown>,
  authorityKey: Buffer,
  nowMs: number,
): MatterhornFinalizedCoworkerRun {
  const value = state.value;
  if (!exactGuardedObjectKeys(value, ["version", "finalizedRun", "authoritySeal"])
    || value.version !== FINALIZED_RUN_ENVELOPE_VERSION
    || typeof value.authoritySeal !== "string"
    || !exactGuardedObjectKeys(value.finalizedRun, ["receipt", "coworker"])) {
    throw new Error("crypto_evidence_finalization_state_invalid");
  }
  const finalizedRun = value.finalizedRun as MatterhornFinalizedCoworkerRun;
  const { receipt, coworker } = finalizedRun;
  const completedAtMs = Date.parse(receipt?.completedAt ?? "");
  if (state.kind !== "crypto_evidence_finalization"
    || !receipt
    || !coworker
    || receipt.version !== "matterhorn.agent-run-receipt.v1"
    || !GUARDED_RUN_ID.test(receipt.runId)
    || state.key !== receipt.runId
    || !guardedRunIdentifier(receipt.id)
    || !guardedRunIdentifier(receipt.workspaceId)
    || !guardedRunIdentifier(receipt.sessionId)
    || receipt.status === "pending"
    || !Number.isSafeInteger(completedAtMs)
    || new Date(completedAtMs).toISOString() !== receipt.completedAt
    || typeof receipt.integrity?.recordHash !== "string"
    || !/^[a-f0-9]{64}$/.test(receipt.integrity.recordHash)
    || !guardedRunIdentifier(coworker.id)
    || !guardedRunIdentifier(coworker.ownerId)
    || coworker.workspaceId !== receipt.workspaceId
    || !Number.isSafeInteger(coworker.revision)
    || coworker.revision < 1
    || state.workspaceId !== receipt.workspaceId
    || state.sessionId !== receipt.sessionId
    || !Number.isSafeInteger(state.updatedAtMs)
    || state.updatedAtMs > nowMs
    || state.expiresAtMs !== state.updatedAtMs + EVIDENCE_FINALIZATION_RETENTION_MS
    || (state.expiresAtMs as number) <= nowMs) {
    throw new Error("crypto_evidence_finalization_state_invalid");
  }
  const authorityValue = finalizedRunAuthorityValue({
    key: state.key,
    workspaceId: state.workspaceId,
    sessionId: state.sessionId,
    expiresAtMs: state.expiresAtMs,
    updatedAtMs: state.updatedAtMs,
    finalizedRun,
  });
  if (!finalizedRunAuthoritySealValid(authorityValue, value.authoritySeal, authorityKey)) {
    throw new Error("crypto_evidence_finalization_state_invalid");
  }
  return structuredClone(finalizedRun);
}

function coworkerDisallowedDataLabels(
  input: Pick<GuardedPromptInput, "coworker">,
  response: MatterhornAgentPrivacyPreflightResponse,
): string[] {
  if (!input.coworker) return [];
  const allowed = new Set(input.coworker.allowedDataLabels);
  return response.detectedData.labels.filter((label) => label !== "secret" && !allowed.has(label));
}

function guardedObservationReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return GUARDED_OBSERVATION_REASONS.has(message) ? message : "capability_denied";
}

export class MatterhornGuardedAgentRuntime {
  readonly privacy: MatterhornPrivacyFirewall;
  readonly capabilities: MatterhornAgentCapabilityBroker;
  readonly receipts: MatterhornAgentRunReceiptStore;
  readonly pendingCryptoIntents: MatterhornPendingCryptoIntentStore;
  private readonly stagedCapabilities = new Map<string, GuardedStagedCapabilityState>();
  private readonly rolloutBypassCallIds = new Map<string, GuardedRolloutBypassState>();
  private readonly observations = new Map<string, GuardedRuntimeObservationMetric>();
  private readonly sessionPrivacyFloorAuthorityKey: Buffer | null;
  private readonly finalizedRunAuthorityKey: Buffer | null;
  private readonly durableStateAuthority: MatterhornDurableStateAuthority | null;
  private readonly providerSystemByRunId = new Map<string, {
    workspaceId: string;
    sessionId: string;
    providerId: string;
    modelId: string;
    purpose: GuardedProviderSystemContext["purpose"];
    system: string;
    systemHash: string;
    effectiveMode: MatterhornAgentPrivacyMode;
    provider: MatterhornAgentPrivacyPreflightResponse["provider"];
    validatedMessagesHash?: string;
    validatedMessagesAtMs?: number;
    expiresAtMs: number;
  }>();
  private finalizedRunHandler: ((input: MatterhornFinalizedCoworkerRun) => Promise<void>) | null = null;

  constructor(private readonly stateStore = new MatterhornGuardedRuntimeStateStore()) {
    const integritySecret = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET?.trim() ?? "";
    this.sessionPrivacyFloorAuthorityKey = integritySecret.length > 0
      ? sessionPrivacyFloorAuthorityKey(integritySecret)
      : null;
    this.finalizedRunAuthorityKey = integritySecret.length > 0
      ? finalizedRunAuthorityKey(integritySecret)
      : null;
    this.durableStateAuthority = integritySecret.length > 0
      ? new MatterhornDurableStateAuthority(integritySecret)
      : null;
    this.privacy = new MatterhornPrivacyFirewall(
      stateStore,
      this.durableStateAuthority ?? undefined,
    );
    this.capabilities = new MatterhornAgentCapabilityBroker(undefined, stateStore);
    this.receipts = new MatterhornAgentRunReceiptStore(
      stateStore,
      this.durableStateAuthority ?? undefined,
    );
    this.pendingCryptoIntents = new MatterhornPendingCryptoIntentStore(stateStore);
  }

  private authorizedState(
    kind: GuardedRuntimeStateKind,
    invalidCode: string,
  ): MatterhornDurableAuthorizedState {
    if (!this.durableStateAuthority) {
      throw new GuardedRuntimeError(
        503,
        "durable_state_integrity_unavailable",
        "Matterhorn cannot safely restore this agent operation.",
      );
    }
    return new MatterhornDurableAuthorizedState(
      this.stateStore,
      this.durableStateAuthority,
      kind,
      invalidCode,
    );
  }

  ready(): boolean {
    return this.capabilities.ready();
  }

  sessionPrivacyStateReady(): boolean {
    return Boolean(this.sessionPrivacyFloorAuthorityKey);
  }

  authenticateRuntime(runtimeSecret: string): void {
    this.assertRuntimeSecret(runtimeSecret);
  }

  createCryptoAppAuthorization(options: {
    bindings?: MatterhornCryptoAppCapabilityBinding[];
    resolveBinding?: ConstructorParameters<typeof MatterhornGuardedCryptoAppAuthorization>[0]["resolveBinding"];
    runtimeSecret?: () => string;
    now?: () => Date;
  }): MatterhornGuardedCryptoAppAuthorization {
    if (!this.durableStateAuthority) {
      throw new GuardedRuntimeError(
        503,
        "durable_state_integrity_unavailable",
        "Matterhorn cannot safely authorize this Crypto App operation.",
      );
    }
    return new MatterhornGuardedCryptoAppAuthorization({
      runtime: this,
      stateStore: this.stateStore,
      stateAuthority: this.durableStateAuthority,
      ...options,
    });
  }

  createCryptoEvidenceStore(
    keyManager: MatterhornEvidenceKeyManager,
    options: { allowMainnet?: boolean } = {},
    erasureLedger: MatterhornRecoveryErasureLedger | null = null,
  ): MatterhornCryptoEvidenceStore {
    if (!this.durableStateAuthority) throw new Error("crypto_evidence_state_integrity_unavailable");
    return new MatterhornCryptoEvidenceStore(
      this.stateStore,
      keyManager,
      options,
      erasureLedger,
      this.durableStateAuthority,
    );
  }

  createAgentFileStore(
    keyManager: MatterhornEvidenceKeyManager,
    erasureLedger: MatterhornRecoveryErasureLedger | null = null,
  ): MatterhornAgentFileStore {
    if (!this.durableStateAuthority) throw new Error("agent_file_state_integrity_unavailable");
    return new MatterhornAgentFileStore(
      this.stateStore,
      keyManager,
      erasureLedger,
      this.durableStateAuthority,
    );
  }

  reconcileRecoveryErasures(
    erasureLedger: MatterhornRecoveryErasureLedger,
  ): MatterhornRecoveryErasureReconciliation {
    if (!this.durableStateAuthority) throw new Error("durable_state_integrity_unavailable");
    return erasureLedger.reconcile(this.stateStore, this.durableStateAuthority);
  }

  createAgentFileWalrusRenewalService(input: {
    store: MatterhornAgentFileStore;
    buildTransaction: MatterhornWalrusRenewalTransactionBuilder;
    verifyTransaction: MatterhornSuiTransactionStatusVerifier;
    verifyCertification: MatterhornWalrusCertificationVerifier;
    extensionEpochs: number;
  }): MatterhornAgentFileWalrusRenewalService {
    if (!this.durableStateAuthority) throw new Error("durable_state_integrity_unavailable");
    return new MatterhornAgentFileWalrusRenewalService(
      input.store,
      this.stateStore,
      this.durableStateAuthority,
      input.buildTransaction,
      input.verifyTransaction,
      input.verifyCertification,
      input.extensionEpochs,
    );
  }

  createCryptoEvidenceWalrusRenewalService(input: {
    store: MatterhornCryptoEvidenceStore;
    buildTransaction: MatterhornWalrusRenewalTransactionBuilder;
    verifyTransaction: MatterhornSuiTransactionStatusVerifier;
    verifyCertification: MatterhornWalrusCertificationVerifier;
    extensionEpochs: number;
  }): MatterhornCryptoEvidenceWalrusRenewalService {
    if (!this.durableStateAuthority) throw new Error("durable_state_integrity_unavailable");
    return new MatterhornCryptoEvidenceWalrusRenewalService(
      input.store,
      this.stateStore,
      this.durableStateAuthority,
      input.buildTransaction,
      input.verifyTransaction,
      input.verifyCertification,
      input.extensionEpochs,
    );
  }

  createCryptoEvidenceWalrusDeletionService(input: {
    store: MatterhornCryptoEvidenceStore;
    buildTransaction: MatterhornWalrusDeletionTransactionBuilder;
    verifyTransaction: MatterhornSuiTransactionStatusVerifier;
    verifyCertification: MatterhornWalrusCertificationVerifier;
  }): MatterhornCryptoEvidenceWalrusDeletionService {
    if (!this.durableStateAuthority) throw new Error("durable_state_integrity_unavailable");
    return new MatterhornCryptoEvidenceWalrusDeletionService(
      input.store,
      this.stateStore,
      this.durableStateAuthority,
      input.buildTransaction,
      input.verifyTransaction,
      input.verifyCertification,
    );
  }

  createCryptoEvidenceSuiAnchorService(input: {
    store: MatterhornCryptoEvidenceStore;
    packageId: string;
    buildTransaction: MatterhornSuiEvidenceAnchorTransactionBuilder;
    verifyTransaction: MatterhornSuiEvidenceAnchorTransactionVerifier;
    verifyCertification: MatterhornWalrusCertificationVerifier;
  }): MatterhornCryptoEvidenceSuiAnchorService {
    if (!this.durableStateAuthority) throw new Error("durable_state_integrity_unavailable");
    return new MatterhornCryptoEvidenceSuiAnchorService(
      input.store,
      this.stateStore,
      this.durableStateAuthority,
      input.packageId,
      input.buildTransaction,
      input.verifyTransaction,
      input.verifyCertification,
    );
  }

  hasCryptoEvidence(workspaceId?: string): boolean {
    return this.stateStore.list("crypto_evidence_record", workspaceId ? { workspaceId } : {}).length > 0;
  }

  hasAgentFiles(workspaceId?: string): boolean {
    return this.stateStore.list("agent_file_record", workspaceId ? { workspaceId } : {}).length > 0;
  }

  async startDeterministicCoworkerRun(
    input: DeterministicCoworkerRunInput,
  ): Promise<{ runId: string; sessionId: string }> {
    if (this.capabilities.mode !== "enforce" || !this.ready()) {
      throw new GuardedRuntimeError(
        503,
        "coworker_guarded_runtime_enforcement_required",
        "Scheduled coworker checks require guarded runtime enforcement.",
      );
    }
    if (!Number.isSafeInteger(input.maxReadCalls) || input.maxReadCalls < 1 || input.maxReadCalls > 12) {
      throw new GuardedRuntimeError(400, "coworker_run_budget_invalid", "The coworker read budget is invalid.");
    }
    const previousRunId = this.activeRun(input.sessionId);
    if (previousRunId) await this.finishRun(previousRunId, "cancelled");
    const runId = `coworker_run_${randomUUID()}`;
    const coworker = {
      ...structuredClone(input.coworker),
      maxReadCallsPerRun: Math.min(input.coworker.maxReadCallsPerRun, input.maxReadCalls),
      maxPrepareCallsPerFamily: 0,
      automaticAuthorities: input.coworker.automaticAuthorities.filter((authority) => authority !== "prepare"),
      actionBindings: input.coworker.actionBindings.filter((binding) => binding.access === "read"),
    };
    const expiresAtMs = Date.now() + 10 * 60_000;
    this.establishRunSecurityState({
      runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      agentId: input.agentId ?? "matterhorn",
      executionMode: "work",
      requestToolProfiles: input.requestToolProfiles,
      coworker,
      expiresAtMs,
    });
    try {
      await this.receipts.start({
        runId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        preflight: {
          version: "matterhorn.agent-privacy-preflight.v1",
          requestHash: sha256({
            kind: "deterministic_coworker_check",
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            coworkerId: coworker.id,
            coworkerRevision: coworker.revision,
            toolProfiles: input.requestToolProfiles,
          }),
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          requestedMode: "public_research",
          effectiveMode: "public_research",
          decision: "allow",
          provider: {
            id: "matterhorn-deterministic-runtime",
            name: "Matterhorn deterministic runtime",
            modelId: "none",
            privacyStatus: "local_processing",
            trainingUse: "none",
            retentionDays: 0,
            policyUrl: null,
            dataLeavesMatterhorn: false,
          },
          detectedData: {
            labels: ["public", "untrusted_external"],
            categories: ["scheduled_crypto_watch"],
            redactionCount: 0,
          },
          reason: "This bounded watch is evaluated deterministically without a model provider.",
        },
        consentUsed: false,
        toolCallBudget: { reads: coworker.maxReadCallsPerRun, preparesPerFamily: 0, submits: 0 },
      });
    } catch (error) {
      this.revokeRun(runId);
      try {
        await this.receipts.complete({ runId, status: "error" });
      } catch {
        // Preserve the receipt startup failure after revoking all authority.
      }
      throw error;
    }
    return { runId, sessionId: input.sessionId };
  }

  preflight(input: Omit<GuardedPromptInput, "executionMode" | "requestToolProfiles" | "privacyConsentToken">): MatterhornAgentPrivacyPreflightResponse {
    const evaluation = this.privacy.preflight(input, { issueChallenge: false });
    const disallowedLabels = coworkerDisallowedDataLabels(input, evaluation.response);
    if (disallowedLabels.length > 0) {
      return {
        ...evaluation.response,
        decision: "blocked",
        challenge: undefined,
        reason: `This coworker is not allowed to receive ${disallowedLabels.join(", ")} context.`,
      };
    }
    if (evaluation.response.decision === "consent_required" && input.coworker?.allowUnverifiedProviderConsent === false) {
      return {
        ...evaluation.response,
        decision: "blocked",
        reason: "This coworker is configured to use only local or privacy-verified model providers for private context.",
      };
    }
    return evaluation.response.decision === "consent_required"
      ? this.privacy.preflight(input).response
      : evaluation.response;
  }

  confirmConsent(input: {
    challengeId: string;
    requestHash: string;
    workspaceId: string;
    sessionId: string;
  }) {
    try {
      return this.privacy.confirm(input);
    } catch {
      throw new GuardedRuntimeError(
        409,
        "privacy_consent_challenge_invalid",
        "This privacy consent request expired or no longer matches the exact prompt. Run privacy preflight again.",
      );
    }
  }

  async acceptPrompt(input: GuardedPromptInput): Promise<GuardedPromptAcceptance> {
    return this.startAuthorizedPrompt(input, this.authorizePrompt(input));
  }

  authorizePrompt(input: GuardedPromptInput): GuardedPromptAuthorization {
    let evaluation = this.privacy.preflight(input, { issueChallenge: false });
    if (evaluation.response.decision === "blocked") {
      throw new GuardedRuntimeError(
        422,
        "agent_privacy_blocked",
        evaluation.response.reason,
        evaluation.response,
      );
    }
    const disallowedLabels = coworkerDisallowedDataLabels(input, evaluation.response);
    if (disallowedLabels.length > 0) {
      throw new GuardedRuntimeError(
        403,
        "coworker_data_policy_denied",
        `This coworker is not allowed to receive ${disallowedLabels.join(", ")} context.`,
        { ...evaluation.response, decision: "blocked" },
      );
    }
    if (evaluation.response.decision === "consent_required") {
      if (input.coworker?.allowUnverifiedProviderConsent === false) {
        throw new GuardedRuntimeError(
          403,
          "coworker_provider_not_allowed",
          "This coworker is configured to use only local or privacy-verified model providers for private context.",
          { ...evaluation.response, decision: "blocked" },
        );
      }
      const token = input.privacyConsentToken?.trim() ?? "";
      const consentValid = Boolean(token) && this.privacy.validateConsent({
        token,
        requestHash: evaluation.response.requestHash,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
      });
      if (!consentValid) {
        evaluation = this.privacy.preflight(input);
        throw new GuardedRuntimeError(
          409,
          "agent_privacy_consent_required",
          evaluation.response.reason,
          evaluation.response,
        );
      }
    }
    return {
      preflight: evaluation.response,
      consentRequired: evaluation.response.decision === "consent_required",
    };
  }

  async startAuthorizedPrompt(
    input: GuardedPromptInput,
    authorization: GuardedPromptAuthorization,
    providerSystem?: GuardedProviderSystemContext,
  ): Promise<GuardedPromptAcceptance> {
    const normalizedProviderSystem = normalizeProviderSystemContext(providerSystem, input.parts);
    const current = this.privacy.preflight(input, { issueChallenge: false }).response;
    if (!equalDigest(current.requestHash, authorization.preflight.requestHash)) {
      throw new GuardedRuntimeError(
        409,
        "agent_privacy_request_changed",
        "The prompt changed after privacy authorization. Run privacy preflight again.",
        current,
      );
    }
    const authorizedProvider = authorization.preflight.provider;
    const currentProvider = current.provider;
    if (
      current.decision !== authorization.preflight.decision
      || currentProvider.privacyStatus !== authorizedProvider.privacyStatus
      || currentProvider.trainingUse !== authorizedProvider.trainingUse
      || currentProvider.retentionDays !== authorizedProvider.retentionDays
      || currentProvider.policyUrl !== authorizedProvider.policyUrl
      || currentProvider.dataLeavesMatterhorn !== authorizedProvider.dataLeavesMatterhorn
    ) {
      throw new GuardedRuntimeError(
        409,
        "agent_privacy_policy_changed",
        "The provider privacy policy changed after authorization. Run privacy preflight again.",
        current,
      );
    }
    const consentUsed = authorization.consentRequired && this.privacy.consumeConsent({
      token: input.privacyConsentToken?.trim() ?? "",
      requestHash: current.requestHash,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    if (authorization.consentRequired && !consentUsed) {
      throw new GuardedRuntimeError(
        409,
        "agent_privacy_consent_required",
        current.reason,
        current,
      );
    }

    // Privacy and receipts are account-facing dispatch boundaries, not
    // guarded-tool rollout flags. `off` disables per-tool capabilities only;
    // every accepted provider request still receives an exact run id and a
    // minimal security/usage receipt.
    const previousRunId = this.activeRun(input.sessionId);
    if (previousRunId) await this.finishRun(previousRunId, "cancelled");
    const runId = `${this.capabilities.mode === "off" ? "agent_run_off" : "agent_run"}_${randomUUID()}`;
    const expiresAtMs = Date.now() + GUARDED_RUN_AUTHORITY_TTL_MS;
    const polymarketJurisdiction = evaluatePolymarketOpenPositionJurisdiction(input.jurisdiction ?? null);
    const jurisdictionPolicy: MatterhornAgentJurisdictionPolicyContext | undefined = input.jurisdiction
      && polymarketJurisdiction.validUntil
      ? {
          evidenceHash: input.jurisdiction.evidenceHash,
          policyVersion: polymarketJurisdiction.policyVersion,
          policyHash: polymarketJurisdiction.policyHash,
          decisionHash: polymarketJurisdiction.decisionHash,
          validUntil: polymarketJurisdiction.validUntil,
          polymarketOpenPositionAllowed: polymarketJurisdiction.canOpenPosition,
        }
      : undefined;
    this.establishRunSecurityState({
      runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      executionMode: input.executionMode,
      requestToolProfiles: input.requestToolProfiles,
      coworker: input.coworker,
      jurisdictionEvidenceHash: input.jurisdiction?.evidenceHash,
      jurisdictionPolicy,
      expiresAtMs,
    });
    if (normalizedProviderSystem) {
      this.providerSystemByRunId.set(runId, {
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        ...normalizedProviderSystem,
        effectiveMode: current.effectiveMode,
        provider: structuredClone(current.provider),
        expiresAtMs,
      });
    }
    try {
      await this.receipts.start({
        runId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        preflight: current,
        consentUsed,
        memoryReadIds: input.memoryIds,
        context: selectedContextCounts(input),
        contextOptimization: input.contextOptimization,
      });
      this.raiseSessionPrivacyFloor({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        mode: current.effectiveMode,
      });
    } catch (error) {
      this.revokeRun(runId);
      try {
        await this.receipts.complete({ runId, status: "error" });
      } catch {
        // Preserve the receipt startup failure after revoking all authority.
      }
      throw error;
    }
    return { runId, preflight: current, consentUsed };
  }

  bindUserMessage(input: { runId: string; sessionId: string; messageId: string }): void {
    if (!guardedMessageIdentifier(input.messageId)) {
      throw new GuardedRuntimeError(400, "agent_run_message_id_invalid", "The user message identifier is invalid.");
    }
    const activeRunId = this.activeRun(input.sessionId);
    if (activeRunId !== input.runId) {
      throw new GuardedRuntimeError(409, "agent_run_not_active", "The message no longer belongs to the active guarded run.");
    }
    const scope = this.runScope(input.runId);
    if (!scope || scope.sessionId !== input.sessionId) {
      throw new GuardedRuntimeError(409, "agent_run_not_active", "The message no longer belongs to the active guarded run.");
    }
    const nowMs = Date.now();
    const stored = this.authorizedState(
      "user_message_binding",
      "guarded_message_binding_state_invalid",
    ).putIfAbsent({
      key: input.messageId,
      workspaceId: scope.workspaceId,
      sessionId: input.sessionId,
      value: {
        runId: input.runId,
        workspaceId: scope.workspaceId,
        sessionId: input.sessionId,
        messageId: input.messageId,
      } satisfies GuardedMessageBindingState,
      expiresAtMs: nowMs + GUARDED_RUN_AUTHORITY_TTL_MS,
      nowMs,
    });
    if (!stored) {
      throw new GuardedRuntimeError(409, "agent_run_message_already_bound", "The user message is already bound to another Matterhorn run.");
    }
  }

  resolveRuntimeProviderSystem(input: {
    runtimeSecret: string;
    workspaceId: string;
    sessionId: string;
    providerId: string;
    modelId: string;
    purpose: GuardedProviderSystemContext["purpose"];
  }): { runId: string; system: string[]; systemHash: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    const runId = this.activeRun(input.sessionId);
    const context = runId ? this.providerSystemByRunId.get(runId) : undefined;
    const scope = runId ? this.runScope(runId) : null;
    const nowMs = Date.now();
    if (
      !runId
      || !context
      || !scope
      || context.expiresAtMs <= Date.now()
      || context.workspaceId !== input.workspaceId
      || scope.workspaceId !== input.workspaceId
      || scope.sessionId !== input.sessionId
      || context.sessionId !== input.sessionId
      || context.providerId !== input.providerId
      || context.modelId !== input.modelId
      || context.purpose !== input.purpose
      || !context.validatedMessagesHash
      || !context.validatedMessagesAtMs
      || context.validatedMessagesAtMs + PROVIDER_MESSAGES_VALIDATION_TTL_MS <= nowMs
    ) {
      throw new GuardedRuntimeError(
        409,
        "agent_provider_system_not_bound",
        "Provider system context is not bound to this active Matterhorn run.",
      );
    }
    // One final-message validation authorizes one immediate provider attempt.
    // Tool continuations and retries must pass through the final-message hook
    // again, so stale or mutated messages cannot reuse this release.
    delete context.validatedMessagesHash;
    delete context.validatedMessagesAtMs;
    return { runId, system: [context.system], systemHash: context.systemHash };
  }

  validateRuntimeProviderMessages(input: {
    runtimeSecret: string;
    workspaceId: string;
    sessionId: string;
    messages: unknown;
  }): { accepted: true; runId: string; messagesHash: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    const runId = this.activeRun(input.sessionId);
    const context = runId ? this.providerSystemByRunId.get(runId) : undefined;
    const scope = runId ? this.runScope(runId) : null;
    if (
      !runId
      || !context
      || !scope
      || context.expiresAtMs <= Date.now()
      || context.workspaceId !== input.workspaceId
      || context.sessionId !== input.sessionId
      || scope.workspaceId !== input.workspaceId
      || scope.sessionId !== input.sessionId
    ) {
      throw new GuardedRuntimeError(
        409,
        "agent_provider_messages_not_bound",
        "Final provider messages are not bound to this active Matterhorn run.",
      );
    }
    const normalized = normalizeRuntimeProviderMessages(input.messages, input.sessionId);
    const privacyParts: MatterhornAgentPrivacyPart[] = [{
      type: "final_provider_messages",
      text: normalized.inspectionText,
      source: "system",
      label: sessionHistoryLabel(context.effectiveMode),
    }];
    if (normalized.userIntentText && normalized.userIntentText !== "[]") {
      privacyParts.push({
        type: "final_provider_user_intent",
        text: normalized.userIntentText,
        source: "composer",
        label: sessionHistoryLabel(context.effectiveMode),
      });
    }
    if (normalized.hasAttachment) {
      privacyParts.push({
        type: "attachment",
        source: "attachment",
        label: "workspace_private",
      });
    }
    if (normalized.hasToolOutput) {
      privacyParts.push({
        type: "final_provider_tool_output",
        source: "tool",
        label: "untrusted_external",
      });
    }
    const evaluation = this.privacy.preflight({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      parts: privacyParts,
      providerId: context.providerId,
      providerName: context.provider.name,
      modelId: context.modelId,
      privacyMode: context.effectiveMode,
    }, { issueChallenge: false }).response;
    if (evaluation.decision === "blocked") {
      throw new GuardedRuntimeError(
        422,
        "agent_provider_messages_blocked",
        "Matterhorn blocked sensitive material added after privacy review.",
      );
    }
    if (privacyModeRank(evaluation.effectiveMode) > privacyModeRank(context.effectiveMode)) {
      throw new GuardedRuntimeError(
        409,
        "agent_provider_messages_privacy_changed",
        "The final provider messages became more sensitive after privacy review.",
      );
    }
    const expectedProvider = context.provider;
    const currentProvider = evaluation.provider;
    if (
      currentProvider.id !== expectedProvider.id
      || currentProvider.modelId !== expectedProvider.modelId
      || currentProvider.privacyStatus !== expectedProvider.privacyStatus
      || currentProvider.trainingUse !== expectedProvider.trainingUse
      || currentProvider.retentionDays !== expectedProvider.retentionDays
      || currentProvider.policyUrl !== expectedProvider.policyUrl
      || currentProvider.dataLeavesMatterhorn !== expectedProvider.dataLeavesMatterhorn
    ) {
      throw new GuardedRuntimeError(
        409,
        "agent_privacy_policy_changed",
        "The provider privacy policy changed after authorization. Run privacy preflight again.",
      );
    }
    context.validatedMessagesHash = normalized.messagesHash;
    context.validatedMessagesAtMs = Date.now();
    return { accepted: true, runId, messagesHash: normalized.messagesHash };
  }

  resolveSessionHistoryLabel(input: {
    workspaceId: string;
    sessionId: string;
    hasStoredHistory: boolean;
  }): Extract<MatterhornAgentDataLabel, "public" | "workspace_private" | "wallet_private"> {
    const floor = this.readSessionPrivacyFloor(input.sessionId);
    if (!floor) {
      // Existing sessions created before this boundary have no trustworthy
      // disclosure record. Treat their history as private instead of guessing.
      return input.hasStoredHistory ? "workspace_private" : "public";
    }
    if (floor.workspaceId !== input.workspaceId || floor.sessionId !== input.sessionId) {
      throw new GuardedRuntimeError(
        409,
        "session_privacy_state_invalid",
        "Matterhorn could not verify this chat's privacy history.",
      );
    }
    return sessionHistoryLabel(floor.mode);
  }

  purgeSessionPrivacyState(input: { workspaceId: string; sessionId: string }): void {
    try {
      this.stateStore.transaction(() => {
        const stored = this.stateStore.takeRecord<unknown>(
          "session_privacy_floor",
          input.sessionId,
          0,
        );
        if (!stored) return;
        const floor = this.sessionPrivacyFloorFromStored(stored, input.sessionId);
        if (floor.workspaceId !== input.workspaceId || floor.sessionId !== input.sessionId) {
          throw new GuardedRuntimeError(
            409,
            "session_privacy_state_invalid",
            "Matterhorn could not verify this chat's privacy history.",
          );
        }
      });
    } catch (error) {
      if (error instanceof GuardedRuntimeError) throw error;
      throw new GuardedRuntimeError(
        409,
        "session_privacy_state_invalid",
        "Matterhorn could not verify this chat's privacy history.",
      );
    }
  }

  bindRuntimeMessage(input: {
    runtimeSecret: string;
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
  }): { runId: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    if (!guardedMessageIdentifier(input.userMessageId)
      || !guardedMessageIdentifier(input.assistantMessageId)) {
      throw new GuardedRuntimeError(400, "agent_run_message_id_invalid", "The runtime message identifier is invalid.");
    }
    const nowMs = Date.now();
    const userBindingState = this.authorizedState(
      "user_message_binding",
      "guarded_message_binding_state_invalid",
    );
    const assistantBindingState = this.authorizedState(
      "assistant_message_binding",
      "guarded_message_binding_state_invalid",
    );
    const bound = this.stateStore.transaction(() => {
      const candidate = assertGuardedMessageBindingState(
        userBindingState.takeRecord<unknown>(input.userMessageId, nowMs),
        "user_message_binding",
        input.userMessageId,
        nowMs,
      );
      if (!candidate || candidate.sessionId !== input.sessionId) {
        throw new GuardedRuntimeError(409, "agent_run_message_not_bound", "The assistant message is not bound to an accepted Matterhorn run.");
      }
      const active = this.activeRunState(input.sessionId, nowMs);
      const scope = this.runScopeState(candidate.runId, nowMs);
      if (!active
        || active.runId !== candidate.runId
        || !scope
        || scope.sessionId !== input.sessionId) {
        throw new GuardedRuntimeError(409, "agent_run_not_active", "The message no longer belongs to an active guarded run.");
      }
      if (scope.workspaceId !== candidate.workspaceId) {
        throw new Error("guarded_message_binding_state_invalid");
      }
      const stored = assistantBindingState.putIfAbsent({
        key: input.assistantMessageId,
        workspaceId: scope.workspaceId,
        sessionId: input.sessionId,
        value: { ...candidate, messageId: input.assistantMessageId } satisfies GuardedMessageBindingState,
        expiresAtMs: nowMs + GUARDED_RUN_AUTHORITY_TTL_MS,
        nowMs,
      });
      if (!stored) {
        throw new GuardedRuntimeError(409, "agent_run_message_already_bound", "The assistant message is already bound to another Matterhorn run.");
      }
      return candidate;
    });
    return { runId: bound.runId };
  }

  stageRuntimeTool(input: {
    runtimeSecret: string;
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    agentId?: string;
    toolName: string;
    args: Record<string, unknown>;
  }): { accepted: true; callId: string; expiresAt: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    this.cleanupStagedCapabilities();
    const runId = input.runId.trim();
    const toolName = input.toolName.replace(/^matterhorn-work_/, "").trim();
    const argsHash = capabilityArgsHash(input.args);
    try {
      this.assertRunDispatchReady({
        runId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
      });
      if (this.capabilities.mode === "enforce" && !guardedCapabilityEnforcementActive({
        toolName: input.toolName,
        agentId: input.agentId,
      })) {
        const expiresAtMs = Date.now() + GUARDED_STAGED_CALL_TTL_MS;
        this.rolloutBypassCallIds.set(input.callId, {
          callId: input.callId,
          expiresAtMs,
          reason: "rollout_not_enforced",
          runId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          agentId: input.agentId?.trim() || null,
          toolName,
          argsHash,
          issuedMode: "enforce",
        });
        this.persistRolloutBypass(input.callId);
        this.observe("issue", "bypassed", "rollout_not_enforced");
        return { accepted: true, callId: input.callId, expiresAt: new Date(expiresAtMs).toISOString() };
      }
      const capability = this.capabilities.issue(input);
      const expiresAtMs = Date.parse(capability.claims.expiresAt);
      this.stagedCapabilities.set(capability.claims.callId, {
        callId: capability.claims.callId,
        claims: capability.claims,
        token: capability.token,
        expiresAtMs,
        runId: capability.claims.runId,
        workspaceId: capability.claims.workspaceId,
        sessionId: capability.claims.sessionId,
      });
      this.persistStagedCapability(capability.claims.callId);
      this.observe("issue", this.capabilities.mode === "shadow" ? "would_allow" : "allowed", "policy_allowed");
      return { accepted: true, callId: capability.claims.callId, expiresAt: capability.claims.expiresAt };
    } catch (error) {
      const reason = guardedObservationReason(error);
      if (this.capabilities.mode === "shadow") {
        const expiresAtMs = Date.now() + GUARDED_STAGED_CALL_TTL_MS;
        this.rolloutBypassCallIds.set(input.callId, {
          callId: input.callId,
          expiresAtMs,
          reason,
          runId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          agentId: input.agentId?.trim() || null,
          toolName,
          argsHash,
          issuedMode: "shadow",
        });
        this.persistRolloutBypass(input.callId);
        this.observe("issue", "would_deny", reason);
        return { accepted: true, callId: input.callId, expiresAt: new Date(expiresAtMs).toISOString() };
      }
      this.observe("issue", "denied", reason);
      throw error;
    }
  }

  authorizeMcpTool(input: {
    toolName: string;
    args: Record<string, unknown>;
  }): {
    args: Record<string, unknown>;
    runId: string | null;
    callId: string | null;
    workspaceId: string | null;
    sessionId: string | null;
    coworker: MatterhornAgentCapabilityClaims["coworker"] | null;
    jurisdictionPolicy: MatterhornAgentCapabilityClaims["jurisdictionPolicy"] | null;
  } {
    this.cleanupStagedCapabilities();
    const callIdValue = input.args[MATTERHORN_CAPABILITY_CALL_ARGUMENT];
    const callId = typeof callIdValue === "string" ? callIdValue.trim() : "";
    const args = stripCapabilityArgument(input.args);
    if (this.capabilities.mode === "off") {
      return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
    }
    let bypass: GuardedRolloutBypassState | undefined;
    if (callId) {
      try {
        const persisted = this.authorizedState(
          "rollout_bypass",
          "guarded_rollout_bypass_state_invalid",
        ).takeRecord<unknown>(callId, Date.now());
        bypass = persisted
          ? assertGuardedRolloutBypassState(persisted, callId, Date.now()) ?? undefined
          : this.rolloutBypassCallIds.get(callId);
      } catch {
        this.rolloutBypassCallIds.delete(callId);
        this.observe(
          "consume",
          this.capabilities.mode === "shadow" ? "would_deny" : "denied",
          "guarded_rollout_bypass_state_invalid",
        );
        if (this.capabilities.mode === "enforce") {
          throw new GuardedRuntimeError(
            403,
            "agent_capability_denied",
            "Matterhorn rejected an invalid persisted rollout authorization.",
          );
        }
        return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
      }
    }
    if (callId && bypass) {
      this.rolloutBypassCallIds.delete(callId);
      const exactTool = input.toolName.replace(/^matterhorn-work_/, "").trim() === bypass.toolName;
      const exactArgs = equalDigest(capabilityArgsHash(args), bypass.argsHash);
      if (!exactTool || !exactArgs) {
        this.observe("consume", this.capabilities.mode === "shadow" ? "would_deny" : "denied", "capability_argument_mutation");
        if (this.capabilities.mode === "enforce") {
          throw new GuardedRuntimeError(
            403,
            "agent_capability_denied",
            "Matterhorn rejected a staged rollout call that no longer matches its exact tool and arguments.",
          );
        }
        return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
      }
      const modeMatches = bypass.issuedMode === this.capabilities.mode;
      const currentRolloutAllowsBypass = this.capabilities.mode === "shadow"
        ? bypass.issuedMode === "shadow"
        : bypass.issuedMode === "enforce"
          && bypass.reason === "rollout_not_enforced"
          && !guardedCapabilityEnforcementActive({
            toolName: input.toolName,
            agentId: bypass.agentId ?? undefined,
          });
      if (!modeMatches || !currentRolloutAllowsBypass) {
        this.observe(
          "consume",
          this.capabilities.mode === "shadow" ? "would_deny" : "denied",
          "guarded_rollout_bypass_state_invalid",
        );
        if (this.capabilities.mode === "enforce") {
          throw new GuardedRuntimeError(
            403,
            "agent_capability_denied",
            "Matterhorn rejected rollout authority that no longer matches the active enforcement policy.",
          );
        }
        return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
      }
      if (this.capabilities.mode === "enforce") {
        try {
          this.assertRunDispatchReady({
            runId: bypass.runId,
            workspaceId: bypass.workspaceId,
            sessionId: bypass.sessionId,
          });
        } catch {
          this.observe("consume", "denied", "guarded_rollout_bypass_state_invalid");
          throw new GuardedRuntimeError(
            403,
            "agent_capability_denied",
            "Matterhorn rejected rollout authority for an inactive or mismatched run.",
          );
        }
      }
      this.observe("consume", "bypassed", bypass.reason);
      return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
    }
    if (this.capabilities.mode === "enforce" && !callId && !guardedCapabilityEnforcementActive({
      toolName: input.toolName,
    })) {
      this.observe("consume", "bypassed", "rollout_not_enforced");
      return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
    }
    if (!callId && this.capabilities.mode === "shadow") {
      this.observe("consume", "would_deny", "missing_call_id");
      return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
    }
    if (!callId) {
      this.observe("consume", "denied", "missing_call_id");
      throw new GuardedRuntimeError(403, "agent_capability_required", "This crypto tool call did not include a Matterhorn run capability.");
    }
    let staged: GuardedStagedCapabilityState | undefined;
    try {
      const nowMs = Date.now();
      const persisted = this.authorizedState(
        "staged_capability",
        "guarded_staged_capability_state_invalid",
      ).takeRecord<unknown>(callId, nowMs);
      if (persisted) {
        const restored = assertGuardedPersistedStagedCapabilityState(persisted, callId, nowMs);
        staged = restored
          ? {
            ...restored,
            token: this.capabilities.restoreStagedToken(restored.claims, new Date(nowMs)),
          }
          : undefined;
      } else {
        staged = this.stagedCapabilities.get(callId);
      }
    } catch {
      this.stagedCapabilities.delete(callId);
      this.observe(
        "consume",
        this.capabilities.mode === "shadow" ? "would_deny" : "denied",
        "guarded_staged_capability_state_invalid",
      );
      if (this.capabilities.mode === "enforce") {
        throw new GuardedRuntimeError(
          403,
          "agent_capability_denied",
          "Matterhorn rejected an invalid persisted tool capability.",
        );
      }
      return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
    }
    this.stagedCapabilities.delete(callId);
    if (!staged) {
      if (this.capabilities.mode === "shadow") {
        this.observe("consume", "would_deny", "unknown_or_replayed_call_id");
        return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
      }
      this.observe("consume", "denied", "unknown_or_replayed_call_id");
      throw new GuardedRuntimeError(403, "agent_capability_denied", "Matterhorn rejected an unknown, expired, or replayed tool call.");
    }
    try {
      const claims = this.capabilities.consume({ token: staged.token, toolName: input.toolName, args });
      if (staged.callId !== claims.callId
        || staged.runId !== claims.runId
        || staged.workspaceId !== claims.workspaceId
        || staged.sessionId !== claims.sessionId
        || staged.expiresAtMs !== Date.parse(claims.expiresAt)) {
        throw new Error("guarded_staged_capability_state_invalid");
      }
      this.observe("consume", this.capabilities.mode === "shadow" ? "would_allow" : "allowed", "policy_allowed");
      return {
        args,
        runId: claims.runId,
        callId: claims.callId,
        workspaceId: claims.workspaceId,
        sessionId: claims.sessionId,
        coworker: claims.coworker ?? null,
        jurisdictionPolicy: claims.jurisdictionPolicy ?? null,
      };
    } catch (error) {
      const reason = guardedObservationReason(error);
      if (this.capabilities.mode === "shadow") {
        this.observe("consume", "would_deny", reason);
        return { args, runId: null, callId: null, workspaceId: null, sessionId: null, coworker: null, jurisdictionPolicy: null };
      }
      this.observe("consume", "denied", reason);
      throw new GuardedRuntimeError(
        403,
        "agent_capability_denied",
        error instanceof Error ? error.message : "Matterhorn rejected the crypto tool capability.",
      );
    }
  }

  async recordMcpTool(input: {
    runId: string | null;
    callId: string | null;
    metric: ManagedMcpToolCallMetric;
    receiptToolName?: string;
    source?: string | null;
    freshness?: string | null;
    evidence?: MatterhornAgentRunReceipt["tools"][number]["evidence"];
  }): Promise<void> {
    if (!input.runId) return;
    if (!input.callId) throw new GuardedRuntimeError(409, "agent_tool_outcome_not_bound", "The tool result is missing its exact guarded call binding.");
    const scope = this.runScope(input.runId);
    if (!scope) throw new GuardedRuntimeError(409, "agent_run_not_active", "The tool result no longer belongs to an active guarded run.");
    await this.receipts.get(scope.workspaceId, input.runId);
    this.capabilities.recordToolOutcome(
      input.runId,
      input.callId,
      input.metric.tool,
      input.metric.outcome,
      input.metric.reviewedAction?.protocol,
    );
    await this.receipts.recordTool({
      runId: input.runId,
      tool: {
        name: input.receiptToolName?.trim() || input.metric.tool,
        access: input.metric.access === "prepare" ? "prepare" : "read",
        outcome: input.metric.outcome,
        latencyMs: input.metric.durationMs,
        source: input.source ?? input.metric.source ?? null,
        freshness: input.freshness ?? input.metric.freshness ?? null,
        trust: "untrusted_external",
        ...(input.evidence ? { evidence: structuredClone(input.evidence) } : {}),
      },
      capabilityDecisions: this.capabilities.decisionsForRun(input.runId),
    });
    if (input.metric.reviewedAction) {
      await this.receipts.addReviewedAction({
        runId: input.runId,
        intentHash: input.metric.reviewedAction.intentHash,
        policyHash: input.metric.reviewedAction.policyHash,
        simulationReference: input.metric.reviewedAction.simulation.reference,
      });
    }
  }

  async completeRun(input: {
    runtimeSecret: string;
    runId: string;
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">;
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>;
  }): Promise<void> {
    this.assertRuntimeSecret(input.runtimeSecret);
    await this.finishRun(input.runId, input.status, input.usage);
  }

  async failRun(runId: string, status: "cancelled" | "error" = "error"): Promise<void> {
    await this.finishRun(runId, status);
  }

  /**
   * Completes a run dispatched by a trusted Matterhorn server route rather
   * than by the OpenCode runtime plugin. This is intentionally not exposed as
   * an HTTP capability: it lets first-party gateways such as safe session
   * compaction produce the same content-free receipt and revoke the same run
   * authority as an ordinary model response.
   */
  async completeTrustedGatewayRun(
    runId: string,
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending"> = "success",
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>,
  ): Promise<void> {
    await this.finishRun(runId, status, usage);
  }

  runtimeSecretFingerprint(): string | null {
    const secret = process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim();
    return secret ? sha256(secret).slice(0, 12) : null;
  }

  setCoworkerResolver(resolver: ((binding: MatterhornCoworkerRunBinding) => boolean) | null): void {
    this.capabilities.setCoworkerResolver(resolver);
  }

  setFinalizedRunHandler(
    handler: ((input: MatterhornFinalizedCoworkerRun) => Promise<void>) | null,
  ): void {
    this.finalizedRunHandler = handler;
  }

  async retryPendingFinalizedRuns(limit = 50): Promise<{ checked: number; sealed: number; failed: number }> {
    if (!this.finalizedRunHandler) return { checked: 0, sealed: 0, failed: 0 };
    const nowMs = Date.now();
    let pending: MatterhornFinalizedCoworkerRun[];
    try {
      pending = this.stateStore.listRecords<unknown>("crypto_evidence_finalization", { nowMs })
        .map((record) => assertFinalizedCoworkerRunState(
          record,
          this.requireFinalizedRunAuthorityKey(),
          nowMs,
        ))
        .slice(0, Math.max(1, Math.min(limit, 200)));
    } catch (error) {
      if (error instanceof GuardedRuntimeError) throw error;
      throw new GuardedRuntimeError(
        409,
        "crypto_evidence_finalization_state_invalid",
        "Matterhorn could not verify pending encrypted evidence.",
      );
    }
    let sealed = 0;
    let failed = 0;
    for (const finalizedRun of pending) {
      try {
        await this.finalizedRunHandler(finalizedRun);
        this.stateStore.delete("crypto_evidence_finalization", finalizedRun.receipt.runId);
        sealed += 1;
      } catch {
        failed += 1;
      }
    }
    return { checked: pending.length, sealed, failed };
  }

  invalidateCoworker(input: { workspaceId: string; ownerId: string; coworkerId: string }): number {
    const runIds = this.capabilities.runIdsForCoworker(input);
    for (const runId of runIds) this.revokeRun(runId);
    const pendingIntents = this.pendingCryptoIntents.invalidateCoworker(input);
    return runIds.length + pendingIntents;
  }

  invalidateConnection(input: { workspaceId: string; connectionId: string }): number {
    const runIds = this.capabilities.runIdsForConnection(input);
    for (const runId of runIds) this.revokeRun(runId);
    const pendingIntents = this.pendingCryptoIntents.invalidateConnection(input);
    return runIds.length + pendingIntents;
  }

  observationSnapshot(): GuardedRuntimeObservationMetric[] {
    return [...this.observations.values()].map((observation) => ({ ...observation }));
  }

  purgeWorkspace(workspaceId: string) {
    const privacy = this.privacy.purgeWorkspace(workspaceId);
    const capabilities = this.capabilities.purgeWorkspace(workspaceId);
    for (const callId of capabilities.callIds) this.stagedCapabilities.delete(callId);
    this.stateStore.purgeWorkspace(
      workspaceId,
      ["active_agent_run", "agent_run_scope", "session_privacy_floor", "staged_capability", "rollout_bypass", "user_message_binding", "assistant_message_binding", "crypto_app_reservation", "crypto_app_consumed_dispatch", "crypto_pending_intent", "crypto_evidence_publication_claim", "crypto_evidence_operation_claim", "crypto_evidence_finalization", "crypto_evidence_renewal_intent", "crypto_evidence_deletion_intent"],
      { includeConsumedCapabilities: false },
    );
    return {
      privacy,
      capabilities: {
        runs: capabilities.runIds.length,
        consumed: capabilities.consumed,
      },
    };
  }

  private assertRuntimeSecret(supplied: string): void {
    const expected = process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim() ?? "";
    if (expected.length < 32 || !supplied || !equalDigest(sha256(expected), sha256(supplied))) {
      throw new GuardedRuntimeError(401, "agent_runtime_unauthorized", "The guarded runtime credential is missing or invalid.");
    }
  }

  private raiseSessionPrivacyFloor(input: {
    workspaceId: string;
    sessionId: string;
    mode: MatterhornAgentPrivacyMode;
  }): void {
    this.stateStore.transaction(() => {
      const existing = this.readSessionPrivacyFloor(input.sessionId);
      if (existing && (existing.workspaceId !== input.workspaceId || existing.sessionId !== input.sessionId)) {
        throw new GuardedRuntimeError(
          409,
          "session_privacy_state_invalid",
          "Matterhorn could not verify this chat's privacy history.",
        );
      }
      const mode = existing && privacyModeRank(existing.mode) >= privacyModeRank(input.mode)
        ? existing.mode
        : input.mode;
      const nowMs = Date.now();
      const floor: GuardedSessionPrivacyFloor = {
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        mode,
        updatedAt: new Date(nowMs).toISOString(),
      };
      const expiresAtMs = nowMs + SESSION_PRIVACY_FLOOR_RETENTION_MS;
      const authorityValue = sessionPrivacyFloorAuthorityValue({
        key: input.sessionId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        expiresAtMs,
        updatedAtMs: nowMs,
        floor,
      });
      const envelope: GuardedSessionPrivacyFloorEnvelope = {
        version: SESSION_PRIVACY_FLOOR_ENVELOPE_VERSION,
        floor,
        authoritySeal: sealSessionPrivacyFloorAuthority(
          authorityValue,
          this.requireSessionPrivacyFloorAuthorityKey(),
        ),
      };
      this.stateStore.put({
        kind: "session_privacy_floor",
        key: input.sessionId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        value: envelope,
        expiresAtMs,
        nowMs,
      });
    });
  }

  private requireSessionPrivacyFloorAuthorityKey(): Buffer {
    if (!this.sessionPrivacyFloorAuthorityKey) {
      throw new GuardedRuntimeError(
        503,
        "session_privacy_integrity_unavailable",
        "Matterhorn cannot safely persist this chat's privacy history.",
      );
    }
    return this.sessionPrivacyFloorAuthorityKey;
  }

  private requireFinalizedRunAuthorityKey(): Buffer {
    if (!this.finalizedRunAuthorityKey) {
      throw new GuardedRuntimeError(
        503,
        "crypto_evidence_finalization_integrity_unavailable",
        "Matterhorn cannot safely persist pending encrypted evidence.",
      );
    }
    return this.finalizedRunAuthorityKey;
  }

  private sessionPrivacyFloorFromStored(
    stored: GuardedRuntimeStateRecord<unknown>,
    sessionId: string,
  ): GuardedSessionPrivacyFloor {
    try {
      const floor = assertSessionPrivacyFloorState(
        stored,
        sessionId,
        this.requireSessionPrivacyFloorAuthorityKey(),
      );
      if (!floor) throw new Error("session_privacy_state_invalid");
      return floor;
    } catch (error) {
      if (error instanceof GuardedRuntimeError) throw error;
      throw new GuardedRuntimeError(
        409,
        "session_privacy_state_invalid",
        "Matterhorn could not verify this chat's privacy history.",
      );
    }
  }

  private readSessionPrivacyFloor(sessionId: string): GuardedSessionPrivacyFloor | null {
    try {
      const stored = this.stateStore.getRecord<unknown>("session_privacy_floor", sessionId);
      return stored ? this.sessionPrivacyFloorFromStored(stored, sessionId) : null;
    } catch (error) {
      if (error instanceof GuardedRuntimeError) throw error;
      throw new GuardedRuntimeError(
        409,
        "session_privacy_state_invalid",
        "Matterhorn could not verify this chat's privacy history.",
      );
    }
  }

  private cleanupStagedCapabilities(nowMs = Date.now()): void {
    this.stateStore.deleteExpired(nowMs);
    for (const [runId, context] of this.providerSystemByRunId) {
      if (context.expiresAtMs <= nowMs) this.providerSystemByRunId.delete(runId);
    }
    for (const [callId, staged] of this.stagedCapabilities) {
      if (staged.expiresAtMs <= nowMs) this.stagedCapabilities.delete(callId);
    }
    for (const [callId, bypass] of this.rolloutBypassCallIds) {
      if (bypass.expiresAtMs <= nowMs) this.rolloutBypassCallIds.delete(callId);
    }
  }

  private revokeRun(runId: string): void {
    this.capabilities.closeRun(runId);
    this.providerSystemByRunId.delete(runId);
    const scope = this.runScope(runId);
    if (scope) {
      const active = this.activeRunState(scope.sessionId);
      if (active?.runId === runId) this.stateStore.delete("active_agent_run", scope.sessionId);
    }
    for (const [callId, staged] of this.stagedCapabilities) {
      if (staged.runId === runId) this.stagedCapabilities.delete(callId);
    }
    for (const [callId, bypass] of this.rolloutBypassCallIds) {
      if (bypass.runId === runId) this.rolloutBypassCallIds.delete(callId);
    }
    this.deletePersistedRunState(runId, scope?.workspaceId);
    this.stateStore.delete("agent_run_scope", runId);
  }

  close(): void {
    this.sessionPrivacyFloorAuthorityKey?.fill(0);
    this.finalizedRunAuthorityKey?.fill(0);
    this.capabilities.close();
    this.durableStateAuthority?.close();
    this.stateStore.close();
  }

  private establishRunSecurityState(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    agentId?: string;
    executionMode: MatterhornExecutionMode;
    requestToolProfiles?: readonly Record<string, boolean>[];
    coworker?: MatterhornCoworkerRunBinding;
    jurisdictionEvidenceHash?: string;
    jurisdictionPolicy?: MatterhornAgentJurisdictionPolicyContext;
    expiresAtMs: number;
  }): void {
    this.stateStore.deleteExpired();
    const nowMs = Date.now();
    const activeRunState = this.authorizedState("active_agent_run", "guarded_run_state_invalid");
    const runScopeState = this.authorizedState("agent_run_scope", "guarded_run_state_invalid");
    try {
      this.stateStore.transaction(() => {
        const activeStored = activeRunState.putIfAbsent({
          key: input.sessionId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          value: {
            runId: input.runId,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            jurisdictionEvidenceHash: input.jurisdictionEvidenceHash ?? null,
            jurisdictionPolicyHash: input.jurisdictionPolicy?.decisionHash ?? null,
          },
          expiresAtMs: input.expiresAtMs,
          nowMs,
        });
        if (!activeStored) throw new Error("agent_run_active_state_conflict");
        const scopeStored = runScopeState.putIfAbsent({
          key: input.runId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          value: {
            runId: input.runId,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            jurisdictionEvidenceHash: input.jurisdictionEvidenceHash ?? null,
            jurisdictionPolicyHash: input.jurisdictionPolicy?.decisionHash ?? null,
          },
          expiresAtMs: input.expiresAtMs,
          nowMs,
        });
        if (!scopeStored) throw new Error("agent_run_scope_state_conflict");
        if (this.capabilities.mode !== "off") {
          this.capabilities.createRunGrant({
            runId: input.runId,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            agentId: input.agentId,
            executionMode: input.executionMode,
            requestToolProfiles: input.requestToolProfiles,
            coworker: input.coworker,
            jurisdictionEvidenceHash: input.jurisdictionEvidenceHash,
            jurisdictionPolicy: input.jurisdictionPolicy,
            expiresAtMs: input.expiresAtMs,
          });
        }
      });
    } catch (error) {
      this.capabilities.closeRun(input.runId);
      const active = this.activeRunState(input.sessionId);
      if (active?.runId === input.runId) this.stateStore.delete("active_agent_run", input.sessionId);
      this.stateStore.delete("agent_run_scope", input.runId);
      throw error;
    }
  }

  private persistStagedCapability(callId: string): void {
    const staged = this.stagedCapabilities.get(callId);
    if (!staged) return;
    const { token: _token, ...persisted } = staged;
    this.authorizedState(
      "staged_capability",
      "guarded_staged_capability_state_invalid",
    ).put({
      key: callId,
      workspaceId: staged.workspaceId,
      sessionId: staged.sessionId,
      value: persisted satisfies GuardedPersistedStagedCapabilityState,
      expiresAtMs: staged.expiresAtMs,
      nowMs: Date.now(),
    });
  }

  private assertRunDispatchReady(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
  }): void {
    const nowMs = Date.now();
    const active = this.activeRunState(input.sessionId, nowMs);
    const scope = this.runScopeState(input.runId, nowMs);
    const receipt = assertGuardedReceiptIndexState(
      this.authorizedState(
        "receipt_index",
        "agent_run_receipt_index_invalid",
      ).getRecord<unknown>(input.runId, nowMs),
      input.runId,
      nowMs,
    );
    if (!active || active.runId !== input.runId || !scope || scope.runId !== input.runId || !receipt
      || receipt.runId !== input.runId || receipt.status !== "pending") {
      throw new Error("capability_run_or_tool_not_found");
    }
    if (active.workspaceId !== input.workspaceId
      || active.sessionId !== input.sessionId
      || scope.workspaceId !== input.workspaceId
      || scope.sessionId !== input.sessionId
      || receipt.workspaceId !== input.workspaceId
      || receipt.sessionId !== input.sessionId) {
      throw new Error("capability_scope_mismatch");
    }
  }

  private persistRolloutBypass(callId: string): void {
    const bypass = this.rolloutBypassCallIds.get(callId);
    if (!bypass) return;
    this.authorizedState(
      "rollout_bypass",
      "guarded_rollout_bypass_state_invalid",
    ).put({
      key: callId,
      workspaceId: bypass.workspaceId,
      sessionId: bypass.sessionId,
      value: bypass,
      expiresAtMs: bypass.expiresAtMs,
      nowMs: Date.now(),
    });
  }

  private deletePersistedRunState(runId: string, workspaceId?: string): void {
    for (const [kind, invalidCode] of [
      ["staged_capability", "guarded_staged_capability_state_invalid"],
      ["rollout_bypass", "guarded_rollout_bypass_state_invalid"],
      ["user_message_binding", "guarded_message_binding_state_invalid"],
      ["assistant_message_binding", "guarded_message_binding_state_invalid"],
    ] as const) {
      const state = this.authorizedState(kind, invalidCode);
      for (const record of state.listRecords<{ runId: string }>({ workspaceId })) {
        if (record.value.runId === runId) state.delete(record.key);
      }
    }
    for (const [kind, invalidCode] of [
      ["crypto_app_reservation", "crypto_app_persisted_reservation_invalid"],
      ["crypto_app_consumed_dispatch", "crypto_app_persisted_dispatch_invalid"],
    ] as const) {
      const state = this.authorizedState(kind, invalidCode);
      for (const entry of state.list<{
        runId: string;
        callId?: string;
        messageId?: string;
        reservationId?: string;
      }>({ workspaceId })) {
        if (entry.runId !== runId) continue;
        const key = entry.reservationId ?? entry.callId ?? entry.messageId;
        if (key) state.delete(key);
      }
    }
  }

  private async finishRun(
    runId: string,
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">,
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>,
  ): Promise<void> {
    const scope = this.runScope(runId);
    const coworker = this.capabilities.coworkerForRun(runId);
    if (scope) await this.receipts.get(scope.workspaceId, runId);
    const capabilityDecisions = this.capabilities.decisionsForRun(runId);
    try {
      await this.receipts.complete({ runId, status, usage, capabilityDecisions });
      if (scope && coworker) {
        const receipt = await this.receipts.get(scope.workspaceId, runId);
        if (receipt) {
          const finalizedRun = { receipt, coworker };
          const nowMs = Date.now();
          const expiresAtMs = nowMs + EVIDENCE_FINALIZATION_RETENTION_MS;
          const authorityValue = finalizedRunAuthorityValue({
            key: runId,
            workspaceId: scope.workspaceId,
            sessionId: scope.sessionId,
            expiresAtMs,
            updatedAtMs: nowMs,
            finalizedRun,
          });
          const envelope: GuardedFinalizedCoworkerRunEnvelope = {
            version: FINALIZED_RUN_ENVELOPE_VERSION,
            finalizedRun,
            authoritySeal: sealFinalizedRunAuthority(
              authorityValue,
              this.requireFinalizedRunAuthorityKey(),
            ),
          };
          this.stateStore.put({
            kind: "crypto_evidence_finalization",
            key: runId,
            workspaceId: scope.workspaceId,
            sessionId: scope.sessionId,
            value: envelope,
            expiresAtMs,
            nowMs,
          });
          if (this.finalizedRunHandler) {
            try {
              await this.finalizedRunHandler(finalizedRun);
              this.stateStore.delete("crypto_evidence_finalization", runId);
            } catch {
              // The content-free finalized receipt remains queued for retry.
            }
          }
        }
      }
    } finally {
      this.revokeRun(runId);
    }
  }

  private activeRun(sessionId: string): string | null {
    return this.activeRunState(sessionId)?.runId ?? null;
  }

  private runScope(runId: string): { workspaceId: string; sessionId: string } | null {
    const scope = this.runScopeState(runId);
    return scope ? { workspaceId: scope.workspaceId, sessionId: scope.sessionId } : null;
  }

  private activeRunState(sessionId: string, nowMs = Date.now()): GuardedRunState | null {
    return assertGuardedRunState(
      this.authorizedState(
        "active_agent_run",
        "guarded_run_state_invalid",
      ).getRecord<GuardedRunState>(sessionId, nowMs),
      "active_agent_run",
      sessionId,
      nowMs,
    );
  }

  private runScopeState(runId: string, nowMs = Date.now()): GuardedRunState | null {
    return assertGuardedRunState(
      this.authorizedState(
        "agent_run_scope",
        "guarded_run_state_invalid",
      ).getRecord<GuardedRunState>(runId, nowMs),
      "agent_run_scope",
      runId,
      nowMs,
    );
  }

  private observe(
    stage: GuardedRuntimeObservationMetric["stage"],
    decision: GuardedRuntimeObservationMetric["decision"],
    reason: string,
  ): void {
    if (this.capabilities.mode === "off") return;
    const mode = this.capabilities.mode;
    const boundedReason = GUARDED_OBSERVATION_REASONS.has(reason) ? reason : "capability_denied";
    const key = `${mode}\u0000${stage}\u0000${decision}\u0000${boundedReason}`;
    const current = this.observations.get(key);
    if (current) current.count += 1;
    else this.observations.set(key, { mode, stage, decision, reason: boundedReason, count: 1 });
  }
}
