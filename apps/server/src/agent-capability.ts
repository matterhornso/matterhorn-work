import { createHmac, randomUUID } from "node:crypto";
import type {
  MatterhornAgentCapabilityClaims,
  MatterhornAgentCapabilityDecision,
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

export const MATTERHORN_CAPABILITY_ARGUMENT = "_matterhornCapability";
export const MATTERHORN_CAPABILITY_CALL_ARGUMENT = "_matterhornCallId";
export const MATTERHORN_CAPABILITY_POLICY_VERSION = "matterhorn.capability-policy.v1";
export const MATTERHORN_CRYPTO_REGISTRY_VERSION = "matterhorn.crypto-action-registry.v1";
const CAPABILITY_TTL_MS = 60_000;
const MAX_READ_CALLS = 12;
const MAX_PREPARE_ATTEMPTS_PER_FAMILY = 2;
const GUARDED_CRYPTO_DESKS = new Set(["bittensor", "hyperliquid", "polymarket", "sui"]);

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
  };
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

function decodeClaims(token: string, secret: string): MatterhornAgentCapabilityClaims | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra || !equalDigest(signature(payload, secret), suppliedSignature)) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return null;
    const claims = decoded as Record<string, unknown>;
    if (
      claims.version !== "matterhorn.agent-capability.v1"
      || typeof claims.jti !== "string"
      || typeof claims.runId !== "string"
      || typeof claims.workspaceId !== "string"
      || typeof claims.sessionId !== "string"
      || typeof claims.callId !== "string"
      || typeof claims.agentId !== "string"
      || typeof claims.deskId !== "string"
      || typeof claims.toolName !== "string"
      || (claims.access !== "read" && claims.access !== "prepare")
      || typeof claims.argsHash !== "string"
      || typeof claims.issuedAt !== "string"
      || typeof claims.expiresAt !== "string"
      || typeof claims.policyVersion !== "string"
      || typeof claims.registryVersion !== "string"
    ) return null;
    if (claims.coworker !== undefined) {
      if (!claims.coworker || typeof claims.coworker !== "object" || Array.isArray(claims.coworker)) return null;
      const coworker = claims.coworker as Record<string, unknown>;
      if (Object.keys(coworker).some((key) => ![
        "id", "ownerId", "revision", "policyVersion", "connectionId", "appId", "manifestRevision", "actionId", "network",
      ].includes(key))
        || typeof coworker.id !== "string"
        || typeof coworker.ownerId !== "string"
        || !Number.isSafeInteger(coworker.revision)
        || (coworker.revision as number) < 1
        || typeof coworker.policyVersion !== "string"
        || typeof coworker.connectionId !== "string"
        || typeof coworker.appId !== "string"
        || typeof coworker.manifestRevision !== "string"
        || typeof coworker.actionId !== "string"
        || typeof coworker.network !== "string") return null;
    }
    return decoded as MatterhornAgentCapabilityClaims;
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
  private coworkerResolver: ((binding: MatterhornCoworkerRunBinding) => boolean) | null = null;

  readonly mode: MatterhornGuardedRuntimeMode;

  constructor(
    mode = matterhornGuardedRuntimeMode(),
    private readonly stateStore?: MatterhornGuardedRuntimeStateStore,
    private readonly resolveSigningSecret: () => string = signingSecret,
  ) {
    this.mode = mode;
    if (!stateStore) return;
    for (const stored of stateStore.list<StoredRunGrant>("run_grant")) {
      const grant = deserializeGrant(stored);
      this.grants.set(grant.runId, grant);
      this.activeRunBySession.set(grant.sessionId, grant.runId);
      if (stored.decisions.length) this.decisions.set(grant.runId, stored.decisions.slice(-100));
    }
    for (const claims of stateStore.listConsumedCapabilities<MatterhornAgentCapabilityClaims>()) {
      this.consumed.set(claims.jti, { claims, consumedAtMs: Date.parse(claims.issuedAt) });
      this.consumedByCallId.set(claims.callId, claims);
    }
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
    const agentId = input.agentId?.trim() || "matterhorn";
    if (input.coworker && !validCoworkerBinding(input.coworker, input.workspaceId)) {
      throw new Error("capability_coworker_binding_invalid");
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
      expiresAtMs,
    };
    this.persistGrant(grant);
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
    const expiresAt = new Date(now.getTime() + CAPABILITY_TTL_MS);
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
    const claims = secret ? decodeClaims(input.token, secret) : null;
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
    if (this.stateStore && !this.stateStore.consumeCapability({
      jti: claims.jti,
      runId: claims.runId,
      callId: claims.callId,
      workspaceId: claims.workspaceId,
      sessionId: claims.sessionId,
      claims,
      consumedAtMs: nowMs,
      expiresAtMs: Date.parse(claims.expiresAt) + CAPABILITY_TTL_MS,
    })) deny("capability_replayed");
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
  }): { access: "read" | "prepare"; expiresAt: string } | null {
    const claims = this.consumedByCallId.get(input.callId);
    if (!claims
      || claims.runId !== input.runId
      || claims.workspaceId !== input.workspaceId
      || claims.sessionId !== input.sessionId
      || claims.callId !== input.callId
      || claims.coworker?.id !== input.coworkerId
      || claims.coworker.connectionId !== input.connectionId
      || claims.coworker.appId !== input.appId
      || claims.coworker.manifestRevision !== input.manifestRevision
      || claims.coworker.actionId !== input.actionId
      || claims.coworker.network !== input.network
      || claims.toolName !== normalizedToolName(input.toolName)
      || !equalDigest(claims.argsHash, capabilityArgsHash(input.args))) return null;
    return { access: claims.access, expiresAt: claims.expiresAt };
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
    this.stateStore?.delete("run_grant", runId);
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

  private persistGrant(grant: RunGrant): void {
    this.stateStore?.put({
      kind: "run_grant",
      key: grant.runId,
      workspaceId: grant.workspaceId,
      sessionId: grant.sessionId,
      value: serializeGrant(grant, this.decisions.get(grant.runId) ?? []),
      expiresAtMs: grant.expiresAtMs,
    });
  }

  private cleanup(nowMs: number): void {
    for (const [runId, grant] of this.grants) {
      if (grant.expiresAtMs > nowMs) continue;
      this.grants.delete(runId);
      this.stateStore?.delete("run_grant", runId);
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
}
