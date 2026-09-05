import { createHmac, randomUUID } from "node:crypto";
import type {
  MatterhornAgentCapabilityClaims,
  MatterhornAgentCapabilityDecision,
  MatterhornAgentJurisdictionPolicyContext,
  MatterhornAgentCapabilityToken,
  MatterhornGuardedRuntimeMode,
} from "@matterhorn-work/types/guarded-agent-runtime";
import {
  getMatterhornCryptoTool,
  MATTERHORN_CRYPTO_ACTION_REGISTRY,
} from "@matterhorn-work/types/crypto-action-registry";
import { getMatterhornDeskAgentById } from "@matterhorn-work/types/desk-agents";
import type { MatterhornExecutionMode } from "@matterhorn-work/types/execution-mode";
import type { MatterhornCoworkerProfile } from "@matterhorn-work/types/crypto-coworkers";
import { canonicalJson, equalDigest, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import {
  MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH,
  MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION,
} from "./polymarket-jurisdiction-policy.js";

export const MATTERHORN_CAPABILITY_ARGUMENT = "_matterhornCapability";
export const MATTERHORN_CAPABILITY_CALL_ARGUMENT = "_matterhornCallId";
export const MATTERHORN_CAPABILITY_POLICY_VERSION = "matterhorn.capability-policy.v1";
export const MATTERHORN_CRYPTO_REGISTRY_VERSION = "matterhorn.crypto-action-registry.v1";
const CAPABILITY_TTL_MS = 60_000;
const MAX_READ_CALLS = 12;
const MAX_PREPARE_ATTEMPTS_PER_FAMILY = 2;
const GUARDED_CRYPTO_DESKS = new Set(["bittensor", "hyperliquid", "polymarket", "sui"]);
const MAX_CAPABILITY_TOKEN_BYTES = 16_384;
const MAX_RUN_STATE_ITEMS = 128;
const CLOCK_SKEW_MS = 5_000;
const CAPABILITY_CLAIM_KEYS = new Set([
  "version", "jti", "runId", "workspaceId", "sessionId", "callId", "agentId", "deskId",
  "toolName", "access", "argsHash", "issuedAt", "expiresAt", "policyVersion", "registryVersion",
  "jurisdictionEvidenceHash", "jurisdictionPolicy", "coworker",
]);
const STORED_RUN_GRANT_KEYS = new Set([
  "runId", "workspaceId", "sessionId", "agentId", "deskId", "executionMode", "coworker",
  "allowedTools", "maxReadCalls", "maxPrepareAttemptsPerFamily", "readIssues", "prepareAttempts",
  "successfulPrepareFamilies", "issuedPrepareFamilies", "issuedCallIds", "jurisdictionEvidenceHash",
  "jurisdictionPolicy", "expiresAtMs", "decisions",
]);

type RunGrant = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  agentId: string;
  deskId: string;
  executionMode: MatterhornExecutionMode;
  coworker: MatterhornCoworkerRunBinding | null;
  allowedTools: Set<string>;
  maxReadCalls: number;
  maxPrepareAttemptsPerFamily: number;
  readIssues: number;
  prepareAttempts: Map<string, number>;
  successfulPrepareFamilies: Set<string>;
  issuedPrepareFamilies: Map<string, string>;
  issuedCallIds: Set<string>;
  jurisdictionEvidenceHash: string | null;
  jurisdictionPolicy: MatterhornAgentJurisdictionPolicyContext | null;
  expiresAtMs: number;
};

export type MatterhornCoworkerRunBinding = Pick<
  MatterhornCoworkerProfile,
  | "id"
  | "workspaceId"
  | "ownerId"
  | "revision"
  | "policyVersion"
  | "allowedAppIds"
  | "allowedActionIds"
  | "allowedNetworks"
  | "automaticAuthorities"
> & Pick<MatterhornCoworkerProfile["limits"], "maxReadCallsPerRun" | "maxPrepareCallsPerFamily"> & {
  actionBindings: Array<{
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    network: string;
    proxyToolName: string;
    access: "read" | "prepare";
  }>;
  allowedDataLabels: MatterhornCoworkerProfile["privacy"]["allowedDataLabels"];
  allowUnverifiedProviderConsent: boolean;
};

type ConsumedCapability = {
  claims: MatterhornAgentCapabilityClaims;
  consumedAtMs: number;
};

export type MatterhornConsumedToolProof = {
  access: "read" | "prepare";
  argsHash: string;
  expiresAt: string;
  reconciliationExpiresAt: string;
  coworker: MatterhornAgentCapabilityClaims["coworker"] | null;
  jurisdictionPolicy: MatterhornAgentJurisdictionPolicyContext | null;
};

type StoredRunGrant = Omit<RunGrant,
  "allowedTools" | "prepareAttempts" | "successfulPrepareFamilies" | "issuedPrepareFamilies" | "issuedCallIds"
> & {
  coworker?: MatterhornCoworkerRunBinding | null;
  maxReadCalls?: number;
  maxPrepareAttemptsPerFamily?: number;
  allowedTools: string[];
  prepareAttempts: Array<[string, number]>;
  successfulPrepareFamilies: string[];
  issuedPrepareFamilies: Array<[string, string]>;
  issuedCallIds: string[];
  decisions: MatterhornAgentCapabilityDecision[];
};

function serializeGrant(grant: RunGrant, decisions: MatterhornAgentCapabilityDecision[]): StoredRunGrant {
  return {
    ...grant,
    allowedTools: [...grant.allowedTools],
    prepareAttempts: [...grant.prepareAttempts],
    successfulPrepareFamilies: [...grant.successfulPrepareFamilies],
    issuedPrepareFamilies: [...grant.issuedPrepareFamilies],
    issuedCallIds: [...grant.issuedCallIds],
    decisions,
  };
}

function deserializeGrant(stored: StoredRunGrant): RunGrant {
  return {
    ...stored,
    coworker: stored.coworker ?? null,
    maxReadCalls: stored.maxReadCalls ?? MAX_READ_CALLS,
    maxPrepareAttemptsPerFamily: stored.maxPrepareAttemptsPerFamily ?? MAX_PREPARE_ATTEMPTS_PER_FAMILY,
    allowedTools: new Set(stored.allowedTools),
    prepareAttempts: new Map(stored.prepareAttempts),
    successfulPrepareFamilies: new Set(stored.successfulPrepareFamilies),
    issuedPrepareFamilies: new Map(stored.issuedPrepareFamilies),
    issuedCallIds: new Set(stored.issuedCallIds),
    jurisdictionEvidenceHash: stored.jurisdictionEvidenceHash ?? null,
    jurisdictionPolicy: stored.jurisdictionPolicy ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedId(value: unknown, max = 256): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= max
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value);
}

function isBoundedStringArray(value: unknown, maxItems = MAX_RUN_STATE_ITEMS): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isBoundedId(item, 256))
    && new Set(value).size === value.length;
}

function isBoundedPairArray(value: unknown, maxValue: number): value is Array<[string, number]> {
  return Array.isArray(value)
    && value.length <= MAX_RUN_STATE_ITEMS
    && value.every((entry) => Array.isArray(entry)
      && entry.length === 2
      && isBoundedId(entry[0], 256)
      && Number.isSafeInteger(entry[1])
      && entry[1] >= 0
      && entry[1] <= maxValue)
    && new Set(value.map((entry) => entry[0])).size === value.length;
}

function isBoundedStringPairArray(value: unknown): value is Array<[string, string]> {
  return Array.isArray(value)
    && value.length <= MAX_RUN_STATE_ITEMS
    && value.every((entry) => Array.isArray(entry)
      && entry.length === 2
      && isBoundedId(entry[0], 256)
      && isBoundedId(entry[1], 256))
    && new Set(value.map((entry) => entry[0])).size === value.length;
}

function guardedMode(value = process.env.MATTERHORN_GUARDED_RUNTIME_MODE): MatterhornGuardedRuntimeMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "shadow" || normalized === "enforce") return normalized;
  return "off";
}

export function matterhornGuardedRuntimeMode(): MatterhornGuardedRuntimeMode {
  return guardedMode();
}

export type MatterhornGuardedRuntimeEnforcementAccess = "prepare" | "all";

export type MatterhornGuardedRuntimeRollout = {
  access: MatterhornGuardedRuntimeEnforcementAccess;
  desks: ReadonlySet<string> | null;
  valid: boolean;
};

/**
 * Server-only rollout selectors. An empty desk list means every crypto desk.
 * Invalid configuration deliberately resolves to full enforcement and makes
 * readiness fail, so a typo can never create an authorization bypass.
 */
export function matterhornGuardedRuntimeRollout(
  accessValue = process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS,
  desksValue = process.env.MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS,
): MatterhornGuardedRuntimeRollout {
  const normalizedAccess = accessValue?.trim().toLowerCase() || "all";
  const accessValid = normalizedAccess === "prepare" || normalizedAccess === "all";
  const requestedDesks = (desksValue ?? "")
    .split(",")
    .map((desk) => desk.trim().toLowerCase())
    .filter(Boolean);
  const desksValid = requestedDesks.every((desk) => GUARDED_CRYPTO_DESKS.has(desk));
  return {
    access: accessValid ? normalizedAccess : "all",
    desks: requestedDesks.length && desksValid ? new Set(requestedDesks) : null,
    valid: accessValid && desksValid,
  };
}

export function guardedCapabilityEnforcementActive(input: {
  toolName: string;
  agentId?: string;
  rollout?: MatterhornGuardedRuntimeRollout;
}): boolean {
  const definition = getMatterhornCryptoTool(normalizedToolName(input.toolName));
  if (!definition) return true;
  const rollout = input.rollout ?? matterhornGuardedRuntimeRollout();
  if (!rollout.valid) return true;
  if (rollout.access === "prepare" && definition.access !== "prepare") return false;
  if (!rollout.desks) return true;
  const agentDesk = input.agentId?.trim()
    ? getMatterhornDeskAgentById(input.agentId.trim())?.deskId
    : undefined;
  if (agentDesk && agentDesk !== "blank") return rollout.desks.has(agentDesk);
  return definition.deskIds.some((deskId) => rollout.desks?.has(deskId));
}

export function stripCapabilityArgument(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => (
    key !== MATTERHORN_CAPABILITY_ARGUMENT && key !== MATTERHORN_CAPABILITY_CALL_ARGUMENT
  )));
}

export function capabilityArgsHash(args: Record<string, unknown>): string {
  return sha256(stripCapabilityArgument(args));
}

function normalizedToolName(value: string): string {
  return value.replace(/^matterhorn-work_/, "").trim();
}

function prepareFamily(toolName: string, actionIds: readonly string[]): string {
  const prefix = actionIds[0]?.split("_")[0];
  return prefix || toolName;
}

function requestedPrepareFamily(
  toolName: string,
  actionIds: readonly string[],
  args: Record<string, unknown>,
): string {
  if (toolName !== "matterhorn_crypto_chat") return prepareFamily(toolName, actionIds);
  const requestedVenue = typeof args.venue === "string" ? args.venue.trim().toLowerCase() : "";
  if (requestedVenue === "bittensor" || requestedVenue === "hyperliquid" || requestedVenue === "polymarket" || requestedVenue === "sui") {
    return requestedVenue;
  }
  const message = typeof args.message === "string" ? args.message.toLowerCase() : "";
  if (/\b(?:bittensor|tao|subnet|validator|hotkey|coldkey)\b/.test(message)) return "bittensor";
  if (/\b(?:hyperliquid|perp|perpetual|funding|reduce.only)\b/.test(message)) return "hyperliquid";
  if (/\b(?:polymarket|prediction market|outcome|market id)\b/.test(message)) return "polymarket";
  if (/\b(?:sui|move object|coin type)\b/.test(message)) return "sui";
  return "crypto_auto";
}

function deskForAgent(agentId: string, toolDeskIds: readonly string[]): string {
  return getMatterhornDeskAgentById(agentId)?.deskId ?? toolDeskIds[0] ?? "crypto";
}

function allowedToolsForRun(input: {
  agentId: string;
  requestToolProfiles?: readonly Record<string, boolean>[];
}): Set<string> {
  const agent = getMatterhornDeskAgentById(input.agentId);
  const managedGlobalPolicy = new Set(
    MATTERHORN_CRYPTO_ACTION_REGISTRY.map((tool) => normalizedToolName(tool.name)),
  );
  const selectedDeskPolicy = input.agentId === "matterhorn"
    ? managedGlobalPolicy
    : agent
      ? new Set(agent.toolPolicy.work.map(normalizedToolName))
      : new Set<string>();
  let allowed = new Set([...managedGlobalPolicy].filter((name) => selectedDeskPolicy.has(name)));
  for (const profile of input.requestToolProfiles ?? []) {
    const explicitlyAllowed = Object.entries(profile)
      .filter(([name, value]) => name !== "*" && value)
      .map(([name]) => normalizedToolName(name));
    const explicitlyDenied = new Set(Object.entries(profile)
      .filter(([name, value]) => name !== "*" && !value)
      .map(([name]) => normalizedToolName(name)));
    if (profile["*"] === false) {
      const narrowed = new Set(explicitlyAllowed);
      allowed = new Set([...allowed].filter((name) => narrowed.has(name)));
    }
    allowed = new Set([...allowed].filter((name) => !explicitlyDenied.has(name)));
  }
  return allowed;
}

function validCoworkerBinding(binding: MatterhornCoworkerRunBinding, workspaceId: string): boolean {
  if (!isRecord(binding) || !hasOnlyKeys(binding, new Set([
    "id", "workspaceId", "ownerId", "revision", "policyVersion", "allowedAppIds", "allowedActionIds",
    "allowedNetworks", "automaticAuthorities", "actionBindings", "allowedDataLabels",
    "allowUnverifiedProviderConsent", "maxReadCallsPerRun", "maxPrepareCallsPerFamily",
  ]))) return false;
  const arrays = [
    binding.allowedAppIds,
    binding.allowedActionIds,
    binding.allowedNetworks,
    binding.automaticAuthorities,
    binding.allowedDataLabels,
  ];
  return binding.workspaceId === workspaceId
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(binding.id)
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(binding.ownerId)
    && Number.isSafeInteger(binding.revision)
    && binding.revision >= 1
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/.test(binding.policyVersion)
    && arrays.every((values) => Array.isArray(values)
      && values.length <= 64
      && values.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 160)
      && new Set(values).size === values.length)
    && Array.isArray(binding.actionBindings)
    && binding.actionBindings.length <= 64
    && binding.actionBindings.every((item) => item
      && typeof item === "object"
      && !Array.isArray(item)
      && Object.keys(item).length === 7
      && Object.keys(item).every((key) => [
        "connectionId", "appId", "manifestRevision", "actionId", "network", "proxyToolName", "access",
      ].includes(key))
      && typeof item.connectionId === "string"
      && item.connectionId.trim().length > 0
      && item.connectionId.length <= 256
      && typeof item.appId === "string"
      && binding.allowedAppIds.includes(item.appId)
      && typeof item.manifestRevision === "string"
      && item.manifestRevision.trim().length > 0
      && item.manifestRevision.length <= 128
      && typeof item.actionId === "string"
      && binding.allowedActionIds.includes(item.actionId)
      && typeof item.network === "string"
      && binding.allowedNetworks.includes(item.network)
      && typeof item.proxyToolName === "string"
      && getMatterhornCryptoTool(item.proxyToolName)?.access === item.access
      && (item.access === "read" || item.access === "prepare"))
    && new Set(binding.actionBindings.map((item) => (
      `${item.connectionId}\u0000${item.appId}\u0000${item.manifestRevision}\u0000${item.actionId}\u0000${item.network}\u0000${normalizedToolName(item.proxyToolName)}`
    ))).size
      === binding.actionBindings.length
    && typeof binding.allowUnverifiedProviderConsent === "boolean"
    && binding.allowedDataLabels.every((label) => ["public", "workspace_private", "wallet_private", "untrusted_external"].includes(label))
    && binding.automaticAuthorities.every((authority) => ["read", "watch", "prepare", "write_note"].includes(authority))
    && Number.isSafeInteger(binding.maxReadCallsPerRun)
    && binding.maxReadCallsPerRun >= 0
    && binding.maxReadCallsPerRun <= MAX_READ_CALLS
    && Number.isSafeInteger(binding.maxPrepareCallsPerFamily)
    && binding.maxPrepareCallsPerFamily >= 0
    && binding.maxPrepareCallsPerFamily <= MAX_PREPARE_ATTEMPTS_PER_FAMILY;
}

function validJurisdictionPolicyContext(
  value: unknown,
  jurisdictionEvidenceHash: string | null,
): value is MatterhornAgentJurisdictionPolicyContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return Object.keys(context).length === 6
    && Object.keys(context).every((key) => [
      "evidenceHash",
      "policyVersion",
      "policyHash",
      "decisionHash",
      "validUntil",
      "polymarketOpenPositionAllowed",
    ].includes(key))
    && typeof context.evidenceHash === "string"
    && context.evidenceHash === jurisdictionEvidenceHash
    && /^[a-f0-9]{64}$/.test(context.evidenceHash)
    && context.policyVersion === MATTERHORN_POLYMARKET_JURISDICTION_POLICY_VERSION
    && context.policyHash === MATTERHORN_POLYMARKET_JURISDICTION_POLICY_HASH
    && typeof context.decisionHash === "string"
    && /^[a-f0-9]{64}$/.test(context.decisionHash)
    && typeof context.validUntil === "string"
    && Number.isFinite(Date.parse(context.validUntil))
    && typeof context.polymarketOpenPositionAllowed === "boolean";
}

function validCapabilityCoworkerClaims(value: unknown): value is NonNullable<MatterhornAgentCapabilityClaims["coworker"]> {
  if (!isRecord(value) || !hasOnlyKeys(value, new Set([
    "id", "ownerId", "revision", "policyVersion", "connectionId", "appId", "manifestRevision", "actionId", "network",
  ]))) return false;
  return isBoundedId(value.id)
    && isBoundedId(value.ownerId)
    && Number.isSafeInteger(value.revision)
    && (value.revision as number) >= 1
    && isBoundedId(value.policyVersion, 128)
    && isBoundedId(value.connectionId)
    && isBoundedId(value.appId)
    && isBoundedId(value.manifestRevision, 128)
    && isBoundedId(value.actionId, 160)
    && isBoundedId(value.network, 160);
}

function validCapabilityClaims(value: unknown, nowMs: number): value is MatterhornAgentCapabilityClaims {
  if (!isRecord(value) || !hasOnlyKeys(value, CAPABILITY_CLAIM_KEYS)) return false;
  const issuedAtMs = typeof value.issuedAt === "string" ? Date.parse(value.issuedAt) : Number.NaN;
  const expiresAtMs = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : Number.NaN;
  const definition = typeof value.toolName === "string" ? getMatterhornCryptoTool(value.toolName) : undefined;
  const jurisdictionEvidenceHash = typeof value.jurisdictionEvidenceHash === "string"
    && /^[a-f0-9]{64}$/.test(value.jurisdictionEvidenceHash)
    ? value.jurisdictionEvidenceHash
    : value.jurisdictionEvidenceHash === undefined ? null : undefined;
  return value.version === "matterhorn.agent-capability.v1"
    && isBoundedId(value.jti)
    && isBoundedId(value.runId)
    && isBoundedId(value.workspaceId)
    && isBoundedId(value.sessionId)
    && isBoundedId(value.callId)
    && isBoundedId(value.agentId)
    && isBoundedId(value.deskId, 160)
    && isBoundedId(value.toolName)
    && normalizedToolName(value.toolName) === value.toolName
    && Boolean(definition)
    && (value.access === "read" || value.access === "prepare")
    && definition?.access === value.access
    && typeof value.argsHash === "string"
    && /^[a-f0-9]{64}$/.test(value.argsHash)
    && Number.isFinite(issuedAtMs)
    && Number.isFinite(expiresAtMs)
    && new Date(issuedAtMs).toISOString() === value.issuedAt
    && new Date(expiresAtMs).toISOString() === value.expiresAt
    && issuedAtMs <= nowMs + CLOCK_SKEW_MS
    && expiresAtMs > issuedAtMs
    && expiresAtMs - issuedAtMs <= CAPABILITY_TTL_MS
    && value.policyVersion === MATTERHORN_CAPABILITY_POLICY_VERSION
    && value.registryVersion === MATTERHORN_CRYPTO_REGISTRY_VERSION
    && jurisdictionEvidenceHash !== undefined
    && (value.jurisdictionPolicy === undefined
      || validJurisdictionPolicyContext(value.jurisdictionPolicy, jurisdictionEvidenceHash))
    && (value.coworker === undefined || validCapabilityCoworkerClaims(value.coworker));
}

function validCapabilityDecision(value: unknown): value is MatterhornAgentCapabilityDecision {
  if (!isRecord(value) || !hasOnlyKeys(value, new Set([
    "toolName", "access", "decision", "reason", "callId", "decidedAt", "latencyMs",
  ]))) return false;
  const decidedAtMs = typeof value.decidedAt === "string" ? Date.parse(value.decidedAt) : Number.NaN;
  const latencyMs = typeof value.latencyMs === "number" ? value.latencyMs : Number.NaN;
  return isBoundedId(value.toolName)
    && normalizedToolName(value.toolName) === value.toolName
    && Boolean(getMatterhornCryptoTool(value.toolName))
    && (value.access === "read" || value.access === "prepare")
    && (value.decision === "issued" || value.decision === "allowed" || value.decision === "denied")
    && typeof value.reason === "string"
    && value.reason.length > 0
    && value.reason.length <= 160
    && isBoundedId(value.callId)
    && Number.isFinite(decidedAtMs)
    && new Date(decidedAtMs).toISOString() === value.decidedAt
    && Number.isSafeInteger(latencyMs)
    && latencyMs >= 0
    && latencyMs <= 3_600_000;
}

function restoreStoredRunGrant(value: unknown, nowMs: number): RunGrant | null {
  if (!isRecord(value) || !hasOnlyKeys(value, STORED_RUN_GRANT_KEYS)) return null;
  const stored = value as unknown as StoredRunGrant;
  const maxReadCalls = stored.maxReadCalls ?? MAX_READ_CALLS;
  const maxPrepareAttemptsPerFamily = stored.maxPrepareAttemptsPerFamily ?? MAX_PREPARE_ATTEMPTS_PER_FAMILY;
  if (!isBoundedId(stored.runId)
    || !isBoundedId(stored.workspaceId)
    || !isBoundedId(stored.sessionId)
    || !isBoundedId(stored.agentId)
    || !isBoundedId(stored.deskId, 160)
    || !["discuss", "plan", "work"].includes(stored.executionMode)
    || !Number.isSafeInteger(stored.expiresAtMs)
    || stored.expiresAtMs <= nowMs
    || stored.expiresAtMs > nowMs + 6 * 60 * 60 * 1_000
    || !Number.isSafeInteger(maxReadCalls)
    || maxReadCalls < 0
    || maxReadCalls > MAX_READ_CALLS
    || !Number.isSafeInteger(maxPrepareAttemptsPerFamily)
    || maxPrepareAttemptsPerFamily < 0
    || maxPrepareAttemptsPerFamily > MAX_PREPARE_ATTEMPTS_PER_FAMILY
    || !Number.isSafeInteger(stored.readIssues)
    || stored.readIssues < 0
    || stored.readIssues > maxReadCalls
    || !isBoundedStringArray(stored.allowedTools)
    || !isBoundedPairArray(stored.prepareAttempts, maxPrepareAttemptsPerFamily)
    || !isBoundedStringArray(stored.successfulPrepareFamilies)
    || !isBoundedStringPairArray(stored.issuedPrepareFamilies)
    || !isBoundedStringArray(stored.issuedCallIds)
    || !Array.isArray(stored.decisions)
    || stored.decisions.length > 100
    || !stored.decisions.every(validCapabilityDecision)) return null;
  const coworker = stored.coworker ?? null;
  if (coworker && !validCoworkerBinding(coworker, stored.workspaceId)) return null;
  const jurisdictionEvidenceHash = stored.jurisdictionEvidenceHash ?? null;
  if (jurisdictionEvidenceHash !== null && !/^[a-f0-9]{64}$/.test(jurisdictionEvidenceHash)) return null;
  const jurisdictionPolicy = stored.jurisdictionPolicy ?? null;
  if (jurisdictionPolicy && !validJurisdictionPolicyContext(jurisdictionPolicy, jurisdictionEvidenceHash)) return null;
  const baseline = allowedToolsForRun({ agentId: stored.agentId });
  if (stored.allowedTools.some((toolName) => {
    const definition = getMatterhornCryptoTool(toolName);
    return !definition
      || normalizedToolName(toolName) !== toolName
      || !baseline.has(toolName)
      || (stored.executionMode !== "work" && definition.access === "prepare")
      || (coworker && !coworker.actionBindings.some((binding) => normalizedToolName(binding.proxyToolName) === toolName));
  })) return null;
  const firstTool = stored.allowedTools.map((name) => getMatterhornCryptoTool(name)).find(Boolean);
  if (stored.deskId !== deskForAgent(stored.agentId, firstTool?.deskIds ?? [])) return null;
  if (coworker && (maxReadCalls !== coworker.maxReadCallsPerRun
    || maxPrepareAttemptsPerFamily !== coworker.maxPrepareCallsPerFamily)) return null;
  const issuedCallIds = new Set(stored.issuedCallIds);
  if (stored.issuedPrepareFamilies.some(([callId]) => !issuedCallIds.has(callId))) return null;
  return deserializeGrant(stored);
}

function signingSecret(): string {
  const value = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET?.trim() ?? "";
  return value.length >= 32 ? value : "";
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function encodeClaims(claims: MatterhornAgentCapabilityClaims, secret: string): string {
  const payload = Buffer.from(canonicalJson(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function decodeClaims(token: string, secret: string, nowMs = Date.now()): MatterhornAgentCapabilityClaims | null {
  if (Buffer.byteLength(token, "utf8") > MAX_CAPABILITY_TOKEN_BYTES) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra || !equalDigest(signature(payload, secret), suppliedSignature)) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return validCapabilityClaims(decoded, nowMs) ? decoded : null;
  } catch {
    return null;
  }
}

export class MatterhornAgentCapabilityBroker {
  private readonly grants = new Map<string, RunGrant>();
  private readonly activeRunBySession = new Map<string, string>();
  private readonly consumed = new Map<string, ConsumedCapability>();
  private readonly consumedByCallId = new Map<string, MatterhornAgentCapabilityClaims>();
  private readonly decisions = new Map<string, MatterhornAgentCapabilityDecision[]>();
  private readonly stateAuthority: MatterhornDurableStateAuthority | null;
  private readonly runGrantState: MatterhornDurableAuthorizedState | null;
  private coworkerResolver: ((binding: MatterhornCoworkerRunBinding) => boolean) | null = null;

  readonly mode: MatterhornGuardedRuntimeMode;

  constructor(
    mode = matterhornGuardedRuntimeMode(),
    private readonly stateStore?: MatterhornGuardedRuntimeStateStore,
    private readonly resolveSigningSecret: () => string = signingSecret,
  ) {
    this.mode = mode;
    const stateSecret = stateStore ? resolveSigningSecret() : "";
    this.stateAuthority = stateStore && stateSecret
      ? new MatterhornDurableStateAuthority(stateSecret)
      : null;
    this.runGrantState = stateStore && this.stateAuthority
      ? new MatterhornDurableAuthorizedState(
        stateStore,
        this.stateAuthority,
        "run_grant",
        "capability_persisted_grant_invalid",
      )
      : null;
    if (!stateStore || this.mode === "off" || !this.stateAuthority || !this.runGrantState) return;
    const nowMs = Date.now();
    for (const stored of this.requireRunGrantState().list<unknown>({ nowMs })) {
      const grant = restoreStoredRunGrant(stored, nowMs);
      if (!grant || this.grants.has(grant.runId) || this.activeRunBySession.has(grant.sessionId)) {
        throw new Error("capability_persisted_grant_invalid");
      }
      this.grants.set(grant.runId, grant);
      this.activeRunBySession.set(grant.sessionId, grant.runId);
      const decisions = (stored as StoredRunGrant).decisions;
      if (decisions.length) this.decisions.set(grant.runId, decisions.slice(-100));
    }
    for (const record of stateStore.listConsumedCapabilityRecords<unknown>(nowMs)) {
      const claims = this.requireStateAuthority().open<MatterhornAgentCapabilityClaims>({
        kind: "consumed_capability",
        key: record.jti,
        workspaceId: record.workspaceId,
        sessionId: record.sessionId,
        value: record.claims,
        expiresAtMs: record.expiresAtMs,
        updatedAtMs: record.consumedAtMs,
      }, "capability_persisted_consumption_invalid");
      const expiresAtMs = isRecord(claims) && typeof claims.expiresAt === "string" ? Date.parse(claims.expiresAt) : Number.NaN;
      const validationNowMs = Number.isFinite(expiresAtMs)
        ? Math.min(nowMs, expiresAtMs - 1)
        : nowMs;
      if (!claims
        || !validCapabilityClaims(claims, validationNowMs)
        || record.jti !== claims.jti
        || record.runId !== claims.runId
        || record.callId !== claims.callId
        || record.workspaceId !== claims.workspaceId
        || record.sessionId !== claims.sessionId
        || !Number.isSafeInteger(record.consumedAtMs)
        || record.consumedAtMs < Date.parse(claims.issuedAt) - CLOCK_SKEW_MS
        || record.consumedAtMs > expiresAtMs
        || record.expiresAtMs !== expiresAtMs + CAPABILITY_TTL_MS) {
        throw new Error("capability_persisted_consumption_invalid");
      }
      this.consumed.set(claims.jti, { claims, consumedAtMs: record.consumedAtMs });
      this.consumedByCallId.set(claims.callId, claims);
    }
  }

  private requireStateAuthority(): MatterhornDurableStateAuthority {
    if (!this.stateAuthority) throw new Error("capability_state_integrity_unavailable");
    return this.stateAuthority;
  }

  private requireRunGrantState(): MatterhornDurableAuthorizedState {
    if (!this.runGrantState) throw new Error("capability_state_integrity_unavailable");
    return this.runGrantState;
  }

  ready(): boolean {
    return this.mode === "off" || Boolean(
      matterhornGuardedRuntimeRollout().valid
      && this.resolveSigningSecret()
      && (process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim().length ?? 0) >= 32,
    );
  }

  setCoworkerResolver(resolver: ((binding: MatterhornCoworkerRunBinding) => boolean) | null): void {
    this.coworkerResolver = resolver;
  }

  createRunGrant(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    agentId?: string;
    executionMode: MatterhornExecutionMode;
    requestToolProfiles?: readonly Record<string, boolean>[];
    coworker?: MatterhornCoworkerRunBinding;
    jurisdictionEvidenceHash?: string;
    jurisdictionPolicy?: MatterhornAgentJurisdictionPolicyContext;
    expiresAtMs?: number;
    now?: Date;
  }): void {
    const nowMs = (input.now ?? new Date()).getTime();
    this.cleanup(nowMs);
    const maximumExpiresAtMs = nowMs + 6 * 60 * 60 * 1_000;
    const expiresAtMs = input.expiresAtMs ?? maximumExpiresAtMs;
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs > maximumExpiresAtMs) {
      throw new Error("capability_run_expiry_invalid");
    }
    if (this.grants.has(input.runId)) {
      throw new Error("capability_run_already_exists");
    }
    if (this.activeRunBySession.has(input.sessionId)) {
      throw new Error("capability_session_already_active");
    }
    const agentId = input.agentId?.trim() || "matterhorn";
    if (input.coworker && !validCoworkerBinding(input.coworker, input.workspaceId)) {
      throw new Error("capability_coworker_binding_invalid");
    }
    const jurisdictionEvidenceHash = input.jurisdictionEvidenceHash?.trim() || null;
    if (jurisdictionEvidenceHash && !/^[a-f0-9]{64}$/.test(jurisdictionEvidenceHash)) {
      throw new Error("capability_jurisdiction_binding_invalid");
    }
    const jurisdictionPolicy = input.jurisdictionPolicy ? structuredClone(input.jurisdictionPolicy) : null;
    if (jurisdictionPolicy && !validJurisdictionPolicyContext(jurisdictionPolicy, jurisdictionEvidenceHash)) {
      throw new Error("capability_jurisdiction_policy_invalid");
    }
    let allowedTools = allowedToolsForRun({ agentId, requestToolProfiles: input.requestToolProfiles });
    if (input.coworker) {
      const coworkerTools = new Set(input.coworker.actionBindings.map((binding) => normalizedToolName(binding.proxyToolName)));
      allowedTools = new Set([...allowedTools].filter((toolName) => coworkerTools.has(toolName)));
    }
    const firstTool = [...allowedTools]
      .map((name) => getMatterhornCryptoTool(name))
      .find(Boolean);
    const grant: RunGrant = {
      runId: input.runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      agentId,
      deskId: deskForAgent(agentId, firstTool?.deskIds ?? []),
      executionMode: input.executionMode,
      coworker: input.coworker ? structuredClone(input.coworker) : null,
      allowedTools,
      maxReadCalls: input.coworker?.maxReadCallsPerRun ?? MAX_READ_CALLS,
      maxPrepareAttemptsPerFamily: input.coworker?.maxPrepareCallsPerFamily ?? MAX_PREPARE_ATTEMPTS_PER_FAMILY,
      readIssues: 0,
      prepareAttempts: new Map(),
      successfulPrepareFamilies: new Set(),
      issuedPrepareFamilies: new Map(),
      issuedCallIds: new Set(),
      jurisdictionEvidenceHash,
      jurisdictionPolicy,
      expiresAtMs,
    };
    this.persistGrant(grant, nowMs);
    this.grants.set(input.runId, grant);
    this.activeRunBySession.set(input.sessionId, input.runId);
  }

  issue(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    agentId?: string;
    toolName: string;
    args: Record<string, unknown>;
    now?: Date;
  }): MatterhornAgentCapabilityToken {
    const startedAt = Date.now();
    const now = input.now ?? new Date();
    this.cleanup(now.getTime());
    const runId = input.runId.trim();
    const grant = runId ? this.grants.get(runId) : undefined;
    const toolName = normalizedToolName(input.toolName);
    const definition = getMatterhornCryptoTool(toolName);
    const deny = (reason: string): never => {
      if (runId) this.recordDecision(runId, {
        toolName,
        access: definition?.access ?? "read",
        decision: "denied",
        reason,
        callId: input.callId,
        decidedAt: new Date().toISOString(),
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      throw new Error(reason);
    };

    if (!grant || !definition) return deny("capability_run_or_tool_not_found");
    if (grant.workspaceId !== input.workspaceId || grant.sessionId !== input.sessionId) deny("capability_scope_mismatch");
    if ((input.agentId?.trim() || grant.agentId) !== grant.agentId) deny("capability_agent_mismatch");
    if (grant.issuedCallIds.has(input.callId)) deny("capability_call_reissued");
    if (!grant.allowedTools.has(toolName)) deny("capability_tool_not_in_run_grant");
    const coworkerActionBinding = this.assertCoworkerGrant(grant, toolName, definition.access, input.args, deny);
    if (definition.deskIds.length && grant.deskId !== "blank" && grant.agentId !== "matterhorn" && !definition.deskIds.some((deskId) => deskId === grant.deskId)) {
      deny("capability_wrong_desk");
    }
    if (definition.access === "prepare" && grant.executionMode !== "work") deny("capability_prepare_requires_work_mode");
    const polymarketPrepare = definition.access === "prepare"
      && definition.deskIds.some((deskId) => deskId === "polymarket");
    if (polymarketPrepare && (
      !grant.jurisdictionPolicy
      || grant.jurisdictionPolicy.polymarketOpenPositionAllowed !== true
      || Date.parse(grant.jurisdictionPolicy.validUntil) <= now.getTime()
    )) deny("capability_polymarket_jurisdiction_denied");
    if (definition.access === "read") {
      if (grant.readIssues >= grant.maxReadCalls) deny("capability_read_budget_exhausted");
      grant.readIssues += 1;
    } else {
      const family = requestedPrepareFamily(toolName, definition.actionIds, input.args);
      if (family === "crypto_auto" && grant.successfulPrepareFamilies.size > 0) {
        deny("capability_prepare_family_resolution_required");
      }
      if (grant.successfulPrepareFamilies.has(family)) deny("capability_prepare_family_already_completed");
      const attempts = grant.prepareAttempts.get(family) ?? 0;
      if (attempts >= grant.maxPrepareAttemptsPerFamily) deny("capability_prepare_budget_exhausted");
      grant.prepareAttempts.set(family, attempts + 1);
      grant.issuedPrepareFamilies.set(input.callId, family);
    }

    const secret = this.resolveSigningSecret();
    if (!secret) deny("capability_signing_secret_missing");
    grant.issuedCallIds.add(input.callId);
    const expiresAt = new Date(Math.min(
      now.getTime() + CAPABILITY_TTL_MS,
      polymarketPrepare && grant.jurisdictionPolicy
        ? Date.parse(grant.jurisdictionPolicy.validUntil)
        : Number.POSITIVE_INFINITY,
    ));
    const claims: MatterhornAgentCapabilityClaims = {
      version: "matterhorn.agent-capability.v1",
      jti: `cap_${randomUUID()}`,
      runId: grant.runId,
      workspaceId: grant.workspaceId,
      sessionId: grant.sessionId,
      callId: input.callId,
      agentId: grant.agentId,
      deskId: grant.deskId,
      toolName,
      access: definition.access,
      argsHash: capabilityArgsHash(input.args),
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      policyVersion: MATTERHORN_CAPABILITY_POLICY_VERSION,
      registryVersion: MATTERHORN_CRYPTO_REGISTRY_VERSION,
      ...(grant.jurisdictionEvidenceHash
        ? { jurisdictionEvidenceHash: grant.jurisdictionEvidenceHash }
        : {}),
      ...(grant.jurisdictionPolicy
        ? { jurisdictionPolicy: structuredClone(grant.jurisdictionPolicy) }
        : {}),
      ...(grant.coworker ? {
        coworker: {
          id: grant.coworker.id,
          ownerId: grant.coworker.ownerId,
          revision: grant.coworker.revision,
          policyVersion: grant.coworker.policyVersion,
          connectionId: coworkerActionBinding!.connectionId,
          appId: coworkerActionBinding!.appId,
          manifestRevision: coworkerActionBinding!.manifestRevision,
          actionId: coworkerActionBinding!.actionId,
          network: coworkerActionBinding!.network,
        },
      } : {}),
    };
    this.recordDecision(grant.runId, {
      toolName,
      access: definition.access,
      decision: "issued",
      reason: "run_grant_and_per_call_policy_allowed",
      callId: input.callId,
      decidedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Date.now() - startedAt),
    });
    this.persistGrant(grant);
    return { version: "matterhorn.agent-capability.v1", token: encodeClaims(claims, secret), claims };
  }

  consume(input: {
    token: string;
    toolName: string;
    args: Record<string, unknown>;
    now?: Date;
  }): MatterhornAgentCapabilityClaims {
    const startedAt = Date.now();
    const nowMs = (input.now ?? new Date()).getTime();
    this.cleanup(nowMs);
    const secret = this.resolveSigningSecret();
    const claims = secret ? decodeClaims(input.token, secret, nowMs) : null;
    const toolName = normalizedToolName(input.toolName);
    const deny = (reason: string): never => {
      if (claims?.runId) this.recordDecision(claims.runId, {
        toolName,
        access: claims.access,
        decision: "denied",
        reason,
        callId: claims.callId,
        decidedAt: new Date().toISOString(),
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
      throw new Error(reason);
    };
    if (!claims) return deny("capability_invalid_signature");
    if (Date.parse(claims.expiresAt) <= nowMs) deny("capability_expired");
    if (this.consumed.has(claims.jti)) deny("capability_replayed");
    if (claims.toolName !== toolName) deny("capability_wrong_tool");
    if (!equalDigest(claims.argsHash, capabilityArgsHash(input.args))) deny("capability_argument_mutation");
    const grant = this.grants.get(claims.runId);
    if (!grant) return deny("capability_scope_mismatch");
    if (grant.workspaceId !== claims.workspaceId || grant.sessionId !== claims.sessionId) deny("capability_scope_mismatch");
    if ((grant.jurisdictionEvidenceHash ?? null) !== (claims.jurisdictionEvidenceHash ?? null)) {
      deny("capability_jurisdiction_mismatch");
    }
    if (canonicalJson(grant.jurisdictionPolicy) !== canonicalJson(claims.jurisdictionPolicy ?? null)) {
      deny("capability_jurisdiction_policy_mismatch");
    }
    if (grant.coworker) {
      if (!claims.coworker
        || claims.coworker.id !== grant.coworker.id
        || claims.coworker.ownerId !== grant.coworker.ownerId
        || claims.coworker.revision !== grant.coworker.revision
        || claims.coworker.policyVersion !== grant.coworker.policyVersion) deny("capability_coworker_mismatch");
      const currentBinding = grant.coworker.actionBindings.find((binding) => (
        binding.connectionId === claims.coworker?.connectionId
        && binding.appId === claims.coworker?.appId
        && binding.manifestRevision === claims.coworker?.manifestRevision
        && binding.actionId === claims.coworker?.actionId
        && binding.network === claims.coworker?.network
        && normalizedToolName(binding.proxyToolName) === claims.toolName
        && binding.access === claims.access
      ));
      if (!currentBinding) deny("capability_coworker_mismatch");
      if (!this.coworkerResolver?.(grant.coworker)) deny("capability_coworker_inactive");
    } else if (claims.coworker) deny("capability_coworker_mismatch");
    if (this.stateStore) {
      const expiresAtMs = Date.parse(claims.expiresAt) + CAPABILITY_TTL_MS;
      const sealedClaims = this.requireStateAuthority().seal({
        kind: "consumed_capability",
        key: claims.jti,
        workspaceId: claims.workspaceId,
        sessionId: claims.sessionId,
        expiresAtMs,
        updatedAtMs: nowMs,
        value: claims,
      });
      if (!this.stateStore.consumeCapability({
        jti: claims.jti,
        runId: claims.runId,
        callId: claims.callId,
        workspaceId: claims.workspaceId,
        sessionId: claims.sessionId,
        claims: sealedClaims,
        consumedAtMs: nowMs,
        expiresAtMs,
      })) deny("capability_replayed");
    }
    this.consumed.set(claims.jti, { claims, consumedAtMs: nowMs });
    this.consumedByCallId.set(claims.callId, claims);
    this.recordDecision(claims.runId, {
      toolName,
      access: claims.access,
      decision: "allowed",
      reason: "single_use_capability_consumed",
      callId: claims.callId,
      decidedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Date.now() - startedAt),
    });
    return claims;
  }

  recordToolOutcome(
    runId: string,
    callId: string,
    toolName: string,
    outcome: "success" | "error" | "timeout",
    resolvedPrepareFamily?: string | null,
  ): void {
    const grant = this.grants.get(runId);
    const definition = getMatterhornCryptoTool(normalizedToolName(toolName));
    const consumed = this.consumedByCallId.get(callId);
    if (
      !grant
      || !consumed
      || consumed.runId !== runId
      || consumed.callId !== callId
      || consumed.toolName !== normalizedToolName(toolName)
    ) {
      throw new Error("capability_tool_outcome_not_bound");
    }
    if (outcome !== "success" || definition?.access !== "prepare") return;
    const actualFamily = resolvedPrepareFamily?.trim().toLowerCase();
    const family = actualFamily || grant.issuedPrepareFamilies.get(callId) || prepareFamily(definition.name, definition.actionIds);
    grant.successfulPrepareFamilies.add(family);
    this.persistGrant(grant);
  }

  decisionsForRun(runId: string): MatterhornAgentCapabilityDecision[] {
    return [...(this.decisions.get(runId) ?? [])];
  }

  consumedCapabilityProof(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    coworkerId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    network: string;
    toolName: string;
    args: Record<string, unknown>;
    now?: Date;
  }): {
    access: "read" | "prepare";
    expiresAt: string;
    jurisdictionPolicy: MatterhornAgentJurisdictionPolicyContext | null;
  } | null {
    const proof = this.consumedToolProof({
      runId: input.runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      callId: input.callId,
      toolName: input.toolName,
      args: input.args,
      now: input.now,
    });
    if (!proof
      || proof.coworker?.id !== input.coworkerId
      || proof.coworker.connectionId !== input.connectionId
      || proof.coworker.appId !== input.appId
      || proof.coworker.manifestRevision !== input.manifestRevision
      || proof.coworker.actionId !== input.actionId
      || proof.coworker.network !== input.network) return null;
    return {
      access: proof.access,
      expiresAt: proof.expiresAt,
      jurisdictionPolicy: proof.jurisdictionPolicy,
    };
  }

  consumedToolProof(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    toolName: string;
    args?: Record<string, unknown>;
    now?: Date;
  }): MatterhornConsumedToolProof | null {
    const claims = this.consumedByCallId.get(input.callId);
    if (!claims
      || claims.runId !== input.runId
      || claims.workspaceId !== input.workspaceId
      || claims.sessionId !== input.sessionId
      || claims.callId !== input.callId
      || claims.toolName !== normalizedToolName(input.toolName)
      || (input.args !== undefined && !equalDigest(claims.argsHash, capabilityArgsHash(input.args)))) return null;
    const reconciliationExpiresAtMs = Date.parse(claims.expiresAt) + CAPABILITY_TTL_MS;
    if (reconciliationExpiresAtMs <= (input.now ?? new Date()).getTime()) return null;
    return {
      access: claims.access,
      argsHash: claims.argsHash,
      expiresAt: claims.expiresAt,
      reconciliationExpiresAt: new Date(reconciliationExpiresAtMs).toISOString(),
      coworker: claims.coworker ? structuredClone(claims.coworker) : null,
      jurisdictionPolicy: claims.jurisdictionPolicy ? structuredClone(claims.jurisdictionPolicy) : null,
    };
  }

  sealConsumedToolContext(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    toolName: string;
    context: unknown;
    now?: Date;
  }): { proof: MatterhornConsumedToolProof; seal: string } | null {
    const proof = this.consumedToolProof(input);
    const claims = this.consumedByCallId.get(input.callId);
    const secret = this.resolveSigningSecret();
    if (!proof || !claims || !secret) return null;
    return {
      proof,
      seal: signature(canonicalJson({
        version: "matterhorn.consumed-tool-context.v1",
        jti: claims.jti,
        runId: claims.runId,
        workspaceId: claims.workspaceId,
        sessionId: claims.sessionId,
        callId: claims.callId,
        toolName: claims.toolName,
        access: claims.access,
        argsHash: claims.argsHash,
        expiresAt: claims.expiresAt,
        reconciliationExpiresAt: proof.reconciliationExpiresAt,
        contextHash: sha256(input.context),
      }), secret),
    };
  }

  verifyConsumedToolContext(input: {
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    toolName: string;
    context: unknown;
    seal: string;
    now?: Date;
  }): MatterhornConsumedToolProof | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.seal)) return null;
    const sealed = this.sealConsumedToolContext(input);
    if (!sealed || !equalDigest(sealed.seal, input.seal)) return null;
    return sealed.proof;
  }

  activeRun(sessionId: string): string | null {
    return this.activeRunBySession.get(sessionId) ?? null;
  }

  scopeForRun(runId: string): { workspaceId: string; sessionId: string } | null {
    const grant = this.grants.get(runId);
    return grant ? { workspaceId: grant.workspaceId, sessionId: grant.sessionId } : null;
  }

  coworkerForRun(runId: string): MatterhornCoworkerRunBinding | null {
    const coworker = this.grants.get(runId)?.coworker;
    return coworker ? structuredClone(coworker) : null;
  }

  runIdsForCoworker(input: { workspaceId: string; ownerId: string; coworkerId: string }): string[] {
    return [...this.grants.values()]
      .filter((grant) => grant.workspaceId === input.workspaceId
        && grant.coworker?.ownerId === input.ownerId
        && grant.coworker.id === input.coworkerId)
      .map((grant) => grant.runId);
  }

  runIdsForConnection(input: { workspaceId: string; connectionId: string }): string[] {
    return [...this.grants.values()]
      .filter((grant) => grant.workspaceId === input.workspaceId
        && grant.coworker?.actionBindings.some((binding) => binding.connectionId === input.connectionId))
      .map((grant) => grant.runId);
  }

  closeRun(runId: string): { callIds: string[] } {
    const grant = this.grants.get(runId);
    if (!grant) return { callIds: [] };
    this.grants.delete(runId);
    this.runGrantState?.delete(runId);
    this.decisions.delete(runId);
    if (this.activeRunBySession.get(grant.sessionId) === runId) {
      this.activeRunBySession.delete(grant.sessionId);
    }
    for (const [jti, entry] of this.consumed) {
      if (entry.claims.runId === runId) {
        this.consumed.delete(jti);
        this.consumedByCallId.delete(entry.claims.callId);
      }
    }
    return { callIds: [...grant.issuedCallIds] };
  }

  purgeWorkspace(workspaceId: string): { runIds: string[]; callIds: string[]; consumed: number } {
    const runIds: string[] = [];
    const callIds: string[] = [];
    for (const [runId, grant] of this.grants) {
      if (grant.workspaceId !== workspaceId) continue;
      runIds.push(runId);
      callIds.push(...grant.issuedCallIds);
      this.grants.delete(runId);
      this.decisions.delete(runId);
      if (this.activeRunBySession.get(grant.sessionId) === runId) {
        this.activeRunBySession.delete(grant.sessionId);
      }
    }
    let consumed = 0;
    for (const [jti, entry] of this.consumed) {
      if (entry.claims.workspaceId !== workspaceId) continue;
      this.consumed.delete(jti);
      this.consumedByCallId.delete(entry.claims.callId);
      consumed += 1;
    }
    this.stateStore?.purgeWorkspace(workspaceId, ["run_grant"], { includeConsumedCapabilities: true });
    return { runIds, callIds, consumed };
  }

  private recordDecision(runId: string, decision: MatterhornAgentCapabilityDecision): void {
    const current = this.decisions.get(runId) ?? [];
    current.push(decision);
    this.decisions.set(runId, current.slice(-100));
    const grant = this.grants.get(runId);
    if (grant) this.persistGrant(grant);
  }

  private assertCoworkerGrant(
    grant: RunGrant,
    toolName: string,
    access: "read" | "prepare",
    args: Record<string, unknown>,
    deny: (reason: string) => never,
  ): MatterhornCoworkerRunBinding["actionBindings"][number] | null {
    const coworker = grant.coworker;
    if (!coworker) return null;
    if (!this.coworkerResolver?.(coworker)) deny("capability_coworker_inactive");
    const hasInternalBindingEnvelope = [
      "appId", "actionId", "access", "connectionId", "manifestRevision", "canonicalArgumentsHash",
    ].some((field) => Object.prototype.hasOwnProperty.call(args, field));
    const requestedNetwork = typeof args.network === "string" ? args.network.trim().toLowerCase() : "";
    const candidates = coworker.actionBindings.filter((binding) => (
      normalizedToolName(binding.proxyToolName) === toolName
      && binding.access === access
      && (!requestedNetwork
        || binding.network.toLowerCase() === requestedNetwork
        || binding.network.toLowerCase().endsWith(`:${requestedNetwork}`))
      && (!hasInternalBindingEnvelope || (
        args.connectionId === binding.connectionId
        && args.appId === binding.appId
        && args.manifestRevision === binding.manifestRevision
        && args.actionId === binding.actionId
        && (args.access === "read" || args.access === "watch" ? access === "read" : args.access === "prepare" || args.access === "simulate" ? access === "prepare" : false)
        && typeof args.canonicalArgumentsHash === "string"
        && /^[a-f0-9]{64}$/.test(args.canonicalArgumentsHash)
      ))
    ));
    if (candidates.length !== 1) deny("capability_coworker_connection_resolution_required");
    const [toolBinding] = candidates;
    if (!toolBinding
      || !coworker.allowedAppIds.includes(toolBinding.appId)
      || !coworker.allowedActionIds.includes(toolBinding.actionId)
      || !coworker.allowedNetworks.includes(toolBinding.network)) deny("capability_coworker_scope_mismatch");
    const authority = access === "prepare" ? "prepare" : "read";
    if (!coworker.automaticAuthorities.includes(authority)
      && !(authority === "read" && coworker.automaticAuthorities.includes("watch"))) {
      deny("capability_coworker_authority_denied");
    }
    return toolBinding;
  }

  private persistGrant(grant: RunGrant, nowMs = Date.now()): void {
    if (!this.stateStore) return;
    const updatedAtMs = Math.min(nowMs, grant.expiresAtMs - 1);
    this.requireRunGrantState().put({
      key: grant.runId,
      workspaceId: grant.workspaceId,
      sessionId: grant.sessionId,
      value: serializeGrant(grant, this.decisions.get(grant.runId) ?? []),
      expiresAtMs: grant.expiresAtMs,
      nowMs: updatedAtMs,
    });
  }

  private cleanup(nowMs: number): void {
    for (const [runId, grant] of this.grants) {
      if (grant.expiresAtMs > nowMs) continue;
      this.grants.delete(runId);
      this.runGrantState?.delete(runId);
      if (this.activeRunBySession.get(grant.sessionId) === runId) this.activeRunBySession.delete(grant.sessionId);
      this.decisions.delete(runId);
    }
    for (const [jti, consumed] of this.consumed) {
      if (Date.parse(consumed.claims.expiresAt) + CAPABILITY_TTL_MS <= nowMs) {
        this.consumed.delete(jti);
        this.consumedByCallId.delete(consumed.claims.callId);
      }
    }
    this.stateStore?.deleteExpired(nowMs);
  }

  close(): void {
    this.stateAuthority?.close();
  }
}
