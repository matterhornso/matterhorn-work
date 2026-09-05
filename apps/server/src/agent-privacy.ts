import { randomBytes, randomUUID } from "node:crypto";
import type {
  MatterhornAgentDataLabel,
  MatterhornAgentPrivacyConsentResponse,
  MatterhornAgentPrivacyMode,
  MatterhornAgentPrivacyPart,
  MatterhornAgentPrivacyPreflightResponse,
} from "@matterhorn-work/types/guarded-agent-runtime";
import { resolveModelProviderPrivacyPolicy } from "./provider-privacy.js";
import { equalDigest, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import {
  isRegisteredVenicePrivateModel,
  VENICE_PROVIDER_ID,
} from "./venice-provider.js";

const CONSENT_TTL_MS = 5 * 60 * 1_000;
const MAX_TRACKED_CHALLENGES = 2_000;

const SECRET_PATTERNS: ReadonlyArray<{ category: string; pattern: RegExp }> = [
  { category: "seed_phrase", pattern: /\b(?:seed|recovery|mnemonic)\s+phrase\s*[:=]/i },
  { category: "private_key", pattern: /\b(?:private[_\s-]?key|secret[_\s-]?key)\s*[:=]/i },
  { category: "api_credential", pattern: /\b(?:api[_\s-]?key|access[_\s-]?token|bearer)\s*[:=]?\s*(?:sk-|[a-z0-9_-]{20,})/i },
  { category: "wallet_export", pattern: /\b(?:keystore|wallet[_\s-]?export)\b[\s\S]{0,80}\b(?:password|ciphertext|crypto)\b/i },
  { category: "raw_signature", pattern: /\b(?:raw[_\s-]?signature|signed[_\s-]?transaction)\s*[:=]\s*0x[a-f0-9]{64,}/i },
  { category: "private_key", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/i },
  { category: "api_credential", pattern: /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{16,}\b|\bsk-[a-z0-9_-]{20,}\b/i },
  { category: "cloud_credential", pattern: /\bAKIA[A-Z0-9]{16}\b|\bgh[ps]_[A-Za-z0-9]{20,}\b/ },
  { category: "session_credential", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

const SECRET_ATTACHMENT_NAME = /(?:^|[/\\])(?:\.env(?:\.[^/\\]+)?|id_(?:rsa|ed25519)|keystore|wallet[-_ ]?export|seed|mnemonic)(?:$|[. _-])/i;

const WALLET_ADDRESS_PATTERN = /\b(?:0x[a-fA-F0-9]{40,64}|[1-9A-HJ-NP-Za-km-z]{47,64})\b/;
const TRANSACTION_PATTERN = /\b(?:send|transfer|stake|unstake|buy|sell|swap|bridge|place|modify|cancel|close)\b[\s\S]{0,80}\b(?:tao|sui|usdc|position|order|market|wallet|address|recipient|amount)\b/i;

export type PrivacyInput = {
  workspaceId: string;
  sessionId: string;
  parts: MatterhornAgentPrivacyPart[];
  providerId: string;
  providerName?: string;
  modelId: string;
  agentId?: string | null;
  attachmentIds?: string[];
  memoryIds?: string[];
  privacyMode?: MatterhornAgentPrivacyMode;
  /**
   * Server-computed hash of the exact tool, coworker, and connected-app
   * authority that will accompany this request. Clients cannot provide this
   * value directly; it makes one-request consent invalid when authority
   * changes without putting the authority document in provider context.
   */
  authorizationContextHash?: string;
  /** Server-verified, content-free proof of the request's edge jurisdiction. */
  jurisdiction?: { evidenceHash: string };
};

type ChallengeRecord = {
  id: string;
  workspaceId: string;
  sessionId: string;
  requestHash: string;
  categories: string[];
  expiresAtMs: number;
  confirmed: boolean;
};

type ConsentRecord = {
  tokenHash: string;
  workspaceId: string;
  sessionId: string;
  requestHash: string;
  categories: string[];
  expiresAtMs: number;
  consumed: boolean;
};

function challengeMatches(
  challenge: ChallengeRecord | null | undefined,
  input: {
    requestHash: string;
    workspaceId: string;
    sessionId: string;
    nowMs: number;
  },
): challenge is ChallengeRecord {
  return Boolean(
    challenge
    && !challenge.confirmed
    && challenge.expiresAtMs > input.nowMs
    && challenge.workspaceId === input.workspaceId
    && challenge.sessionId === input.sessionId
    && equalDigest(challenge.requestHash, input.requestHash),
  );
}

export type MatterhornPrivacyEvaluation = {
  response: MatterhornAgentPrivacyPreflightResponse;
  consentUsed: boolean;
};

function normalizedIds(ids: string[] | undefined): string[] {
  if (!ids) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function requestedMode(value: MatterhornAgentPrivacyMode | undefined): MatterhornAgentPrivacyMode {
  return value === "private_workspace" || value === "transaction" ? value : "public_research";
}

function modeRank(mode: MatterhornAgentPrivacyMode): number {
  if (mode === "transaction") return 2;
  if (mode === "private_workspace") return 1;
  return 0;
}

function maxMode(left: MatterhornAgentPrivacyMode, right: MatterhornAgentPrivacyMode): MatterhornAgentPrivacyMode {
  return modeRank(left) >= modeRank(right) ? left : right;
}

function classify(input: PrivacyInput): {
  labels: MatterhornAgentDataLabel[];
  categories: string[];
  redactionCount: number;
  effectiveMode: MatterhornAgentPrivacyMode;
} {
  const labels = new Set<MatterhornAgentDataLabel>(["public"]);
  const categories = new Set<string>();
  let redactionCount = 0;
  let effectiveMode = requestedMode(input.privacyMode);
  const text = input.parts.map((part) => `${part.name ?? ""}\n${part.text ?? ""}`).join("\n");
  const intentText = input.parts
    .filter((part) => part.source !== "system" && part.source !== "tool")
    .map((part) => `${part.name ?? ""}\n${part.text ?? ""}`)
    .join("\n");

  for (const part of input.parts) {
    if (!part.label || part.label === "public") continue;
    labels.add(part.label);
    if (part.label === "workspace_private") {
      effectiveMode = maxMode(effectiveMode, "private_workspace");
      if (part.type === "agent_instructions") {
        categories.add("workspace_agent_instructions");
      }
    } else if (part.label === "wallet_private") {
      effectiveMode = "transaction";
    } else if (part.label === "secret") {
      categories.add("secret_context");
      redactionCount += 1;
    } else if (part.label === "untrusted_external") {
      categories.add("external_tool_data");
    }
  }

  for (const entry of SECRET_PATTERNS) {
    if (!entry.pattern.test(text)) continue;
    labels.add("secret");
    categories.add(entry.category);
    redactionCount += 1;
  }

  const hasAttachment = normalizedIds(input.attachmentIds).length > 0 || input.parts.some((part) => (
    part.source === "attachment" || part.type === "file" || part.type === "attachment"
  ));
  if (hasAttachment) {
    labels.add("workspace_private");
    categories.add("workspace_attachment");
    effectiveMode = maxMode(effectiveMode, "private_workspace");
  }
  for (const part of input.parts) {
    if (part.name && SECRET_ATTACHMENT_NAME.test(part.name)) {
      labels.add("secret");
      categories.add("secret_attachment");
      redactionCount += 1;
    }
  }

  if (normalizedIds(input.memoryIds).length > 0 || input.parts.some((part) => part.source === "memory")) {
    labels.add("workspace_private");
    categories.add("selected_memory");
    effectiveMode = maxMode(effectiveMode, "private_workspace");
  }

  if (input.parts.some((part) => part.source === "wallet") || (WALLET_ADDRESS_PATTERN.test(intentText) && TRANSACTION_PATTERN.test(intentText))) {
    labels.add("wallet_private");
    categories.add("linked_wallet_context");
    effectiveMode = maxMode(effectiveMode, "transaction");
  }

  if (TRANSACTION_PATTERN.test(intentText) || requestedMode(input.privacyMode) === "transaction") {
    labels.add("wallet_private");
    categories.add("transaction_intent");
    effectiveMode = "transaction";
  }

  if (input.parts.some((part) => part.source === "tool")) {
    labels.add("untrusted_external");
    categories.add("external_tool_data");
  }

  if (labels.has("secret")) effectiveMode = "transaction";
  return {
    labels: [...labels].sort(),
    categories: [...categories].sort(),
    redactionCount,
    effectiveMode,
  };
}

export function agentPrivacyRequestHash(input: PrivacyInput): string {
  return sha256({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    providerId: input.providerId,
    modelId: input.modelId,
    agentId: input.agentId?.trim() || null,
    attachmentIds: normalizedIds(input.attachmentIds),
    memoryIds: normalizedIds(input.memoryIds),
    privacyMode: requestedMode(input.privacyMode),
    authorizationContextHash: input.authorizationContextHash?.trim() || null,
    jurisdictionEvidenceHash: input.jurisdiction?.evidenceHash?.trim() || null,
    parts: input.parts.map((part) => ({
      type: part.type,
      text: part.contentHash ? null : part.text ?? null,
      name: part.name ?? null,
      mime: part.mime ?? null,
      source: part.source ?? "composer",
      label: part.label ?? "public",
      contentHash: part.contentHash ?? null,
      sizeBytes: part.sizeBytes ?? null,
      version: part.version ?? null,
    })),
  });
}

export class MatterhornPrivacyFirewall {
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly consents = new Map<string, ConsentRecord>();

  constructor(private readonly stateStore?: MatterhornGuardedRuntimeStateStore) {}

  preflight(input: PrivacyInput, options: { issueChallenge?: boolean; now?: Date } = {}): MatterhornPrivacyEvaluation {
    const now = options.now ?? new Date();
    this.cleanup(now.getTime());
    const requestHash = agentPrivacyRequestHash(input);
    const classified = classify(input);
    const policy = resolveModelProviderPrivacyPolicy(
      input.providerId,
      input.modelId,
      input.providerName,
      process.env,
      now,
    );
    const dataLeavesMatterhorn = policy.status !== "local_processing";
    const providerVerified = policy.status === "local_processing" || policy.status === "verified_no_training";
    const invalidVeniceModel =
      input.providerId.trim().toLowerCase() === VENICE_PROVIDER_ID &&
      !isRegisteredVenicePrivateModel(input.modelId, now);
    let decision: MatterhornAgentPrivacyPreflightResponse["decision"] = "allow";
    let reason = classified.effectiveMode === "public_research"
      ? "Public research can use the disclosed provider without private workspace context."
      : "The selected provider is approved for this private context.";

    if (invalidVeniceModel) {
      decision = "blocked";
      reason = "Matterhorn could not verify this model in Venice's current private-model catalog. Choose an available private model and try again.";
    } else if (classified.labels.includes("secret")) {
      decision = "blocked";
      reason = "Matterhorn blocked secret material before any provider or runtime dispatch. Remove the secret and try again.";
    } else if (classified.effectiveMode !== "public_research" && !providerVerified) {
      decision = "consent_required";
      reason = "This exact request includes private context and the selected provider is not verified for no-training and retention terms.";
    }

    let challenge: MatterhornAgentPrivacyPreflightResponse["challenge"];
    if (decision === "consent_required" && options.issueChallenge !== false) {
      const id = `privacy_challenge_${randomUUID()}`;
      const expiresAtMs = now.getTime() + CONSENT_TTL_MS;
      const record: ChallengeRecord = {
        id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        requestHash,
        categories: classified.categories,
        expiresAtMs,
        confirmed: false,
      };
      this.challenges.set(id, record);
      this.stateStore?.put({
        kind: "privacy_challenge",
        key: id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        value: record,
        expiresAtMs,
        nowMs: now.getTime(),
      });
      challenge = { id, expiresAt: new Date(expiresAtMs).toISOString(), singleUse: true };
    }

    return {
      response: {
        version: "matterhorn.agent-privacy-preflight.v1",
        requestHash,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        requestedMode: requestedMode(input.privacyMode),
        effectiveMode: classified.effectiveMode,
        decision,
        provider: {
          id: policy.providerId,
          name: policy.providerName,
          modelId: input.modelId,
          privacyStatus: policy.status,
          trainingUse: policy.trainingUse,
          retentionDays: policy.retentionDays,
          policyUrl: policy.policyUrl,
          dataLeavesMatterhorn,
        },
        detectedData: {
          labels: classified.labels,
          categories: classified.categories,
          redactionCount: classified.redactionCount,
        },
        ...(challenge ? { challenge } : {}),
        reason,
      },
      consentUsed: false,
    };
  }

  confirm(input: {
    challengeId: string;
    requestHash: string;
    workspaceId: string;
    sessionId: string;
    now?: Date;
  }): MatterhornAgentPrivacyConsentResponse {
    const nowMs = (input.now ?? new Date()).getTime();
    this.cleanup(nowMs);
    const convertChallenge = (challenge: ChallengeRecord | null | undefined) => {
      if (!challengeMatches(challenge, {
        requestHash: input.requestHash,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        nowMs,
      })) throw new Error("privacy_consent_challenge_invalid");
      challenge.confirmed = true;
      const token = randomBytes(32).toString("base64url");
      const tokenHash = sha256(token);
      const consent: ConsentRecord = {
        tokenHash,
        workspaceId: challenge.workspaceId,
        sessionId: challenge.sessionId,
        requestHash: challenge.requestHash,
        categories: challenge.categories,
        expiresAtMs: challenge.expiresAtMs,
        consumed: false,
      };
      return { challenge, consent, token };
    };
    const stateStore = this.stateStore;
    const converted = stateStore
      ? stateStore.transaction(() => {
          const challenge = stateStore.take<ChallengeRecord>("privacy_challenge", input.challengeId, nowMs);
          const result = convertChallenge(challenge);
          const stored = stateStore.putIfAbsent({
            kind: "privacy_consent",
            key: result.consent.tokenHash,
            workspaceId: result.challenge.workspaceId,
            sessionId: result.challenge.sessionId,
            value: result.consent,
            expiresAtMs: result.challenge.expiresAtMs,
            nowMs,
          });
          if (!stored) throw new Error("privacy_consent_token_collision");
          return result;
        })
      : convertChallenge(this.challenges.get(input.challengeId));
    this.challenges.delete(input.challengeId);
    const { challenge, consent, token } = converted;
    const tokenHash = consent.tokenHash;
    this.consents.set(tokenHash, consent);
    return {
      version: "matterhorn.agent-privacy-preflight.v1",
      consentToken: token,
      expiresAt: new Date(challenge.expiresAtMs).toISOString(),
      singleUse: true,
      requestHash: challenge.requestHash,
    };
  }

  consumeConsent(input: {
    token: string;
    requestHash: string;
    workspaceId: string;
    sessionId: string;
    now?: Date;
  }): boolean {
    const nowMs = (input.now ?? new Date()).getTime();
    this.cleanup(nowMs);
    const tokenHash = sha256(input.token);
    const candidate = this.stateStore
      ? this.stateStore.get<ConsentRecord>("privacy_consent", tokenHash, nowMs)
      : this.consents.get(tokenHash);
    if (
      !candidate
      || candidate.consumed
      || candidate.expiresAtMs <= nowMs
      || candidate.workspaceId !== input.workspaceId
      || candidate.sessionId !== input.sessionId
      || !equalDigest(candidate.requestHash, input.requestHash)
    ) return false;
    const record = this.stateStore
      ? this.stateStore.take<ConsentRecord>("privacy_consent", tokenHash, nowMs)
      : candidate;
    this.consents.delete(tokenHash);
    if (
      !record
      || record.consumed
      || record.expiresAtMs <= nowMs
      || record.workspaceId !== input.workspaceId
      || record.sessionId !== input.sessionId
      || !equalDigest(record.requestHash, input.requestHash)
    ) return false;
    record.consumed = true;
    return true;
  }

  validateConsent(input: {
    token: string;
    requestHash: string;
    workspaceId: string;
    sessionId: string;
    now?: Date;
  }): boolean {
    const nowMs = (input.now ?? new Date()).getTime();
    this.cleanup(nowMs);
    const tokenHash = sha256(input.token);
    const candidate = this.stateStore
      ? this.stateStore.get<ConsentRecord>("privacy_consent", tokenHash, nowMs)
      : this.consents.get(tokenHash);
    return Boolean(
      candidate
      && !candidate.consumed
      && candidate.expiresAtMs > nowMs
      && candidate.workspaceId === input.workspaceId
      && candidate.sessionId === input.sessionId
      && equalDigest(candidate.requestHash, input.requestHash),
    );
  }

  purgeWorkspace(workspaceId: string): { challenges: number; consents: number } {
    let challenges = 0;
    let consents = 0;
    for (const [id, challenge] of this.challenges) {
      if (challenge.workspaceId !== workspaceId) continue;
      this.challenges.delete(id);
      challenges += 1;
    }
    for (const [tokenHash, consent] of this.consents) {
      if (consent.workspaceId !== workspaceId) continue;
      this.consents.delete(tokenHash);
      consents += 1;
    }
    if (this.stateStore) {
      const persistedChallenges = this.stateStore.list<ChallengeRecord>("privacy_challenge", { workspaceId }).length;
      const persistedConsents = this.stateStore.list<ConsentRecord>("privacy_consent", { workspaceId }).length;
      this.stateStore.purgeWorkspace(
        workspaceId,
        ["privacy_challenge", "privacy_consent"],
        { includeConsumedCapabilities: false },
      );
      challenges = Math.max(challenges, persistedChallenges);
      consents = Math.max(consents, persistedConsents);
    }
    return { challenges, consents };
  }

  private cleanup(nowMs: number): void {
    this.stateStore?.deleteExpired(nowMs);
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAtMs <= nowMs || challenge.confirmed) this.challenges.delete(id);
    }
    for (const [tokenHash, consent] of this.consents) {
      if (consent.expiresAtMs <= nowMs || consent.consumed) this.consents.delete(tokenHash);
    }
    if (this.challenges.size <= MAX_TRACKED_CHALLENGES) return;
    const oldest = [...this.challenges.values()].sort((left, right) => left.expiresAtMs - right.expiresAtMs);
    for (const challenge of oldest.slice(0, this.challenges.size - MAX_TRACKED_CHALLENGES)) {
      this.challenges.delete(challenge.id);
    }
  }
}

export function normalizePrivacyParts(parts: unknown[]): MatterhornAgentPrivacyPart[] {
  return parts.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return { type: "unknown" };
    const record = part as Record<string, unknown>;
    const source = record.source === "system" || record.source === "attachment" || record.source === "memory" || record.source === "wallet" || record.source === "tool"
      ? record.source
      : "composer";
    const label = record.label === "workspace_private" || record.label === "wallet_private" || record.label === "secret" || record.label === "untrusted_external"
      ? record.label
      : "public";
    return {
      type: typeof record.type === "string" ? record.type.slice(0, 80) : "unknown",
      ...(typeof record.text === "string" ? { text: record.text } : {}),
      ...(typeof record.name === "string" ? { name: record.name.slice(0, 256) } : {}),
      ...(typeof record.mime === "string" ? { mime: record.mime.slice(0, 160) } : {}),
      source,
      label,
      ...(typeof record.contentHash === "string" ? { contentHash: record.contentHash.slice(0, 128) } : {}),
      ...(typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes)
        ? { sizeBytes: Math.max(0, Math.floor(record.sizeBytes)) }
        : {}),
      ...(typeof record.version === "string" ? { version: record.version.slice(0, 256) } : {}),
    };
  });
}
