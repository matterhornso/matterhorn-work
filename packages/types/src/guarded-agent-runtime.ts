export const MATTERHORN_AGENT_PRIVACY_PREFLIGHT_VERSION = "matterhorn.agent-privacy-preflight.v1" as const;
export const MATTERHORN_AGENT_CAPABILITY_VERSION = "matterhorn.agent-capability.v1" as const;
export const MATTERHORN_AGENT_RUN_RECEIPT_VERSION = "matterhorn.agent-run-receipt.v1" as const;

export type MatterhornGuardedRuntimeMode = "off" | "shadow" | "enforce";

export type MatterhornAgentPrivacyMode =
  | "public_research"
  | "private_workspace"
  | "transaction";

export type MatterhornAgentDataLabel =
  | "public"
  | "workspace_private"
  | "wallet_private"
  | "secret"
  | "untrusted_external";

export type MatterhornAgentPrivacyDecision =
  | "allow"
  | "consent_required"
  | "blocked";

export type MatterhornAgentPrivacyPart = {
  type: string;
  text?: string;
  name?: string;
  filename?: string;
  mime?: string;
  /** Inline data URL or authorized workspace-local file URL. Remote URLs are rejected. */
  url?: string;
  source?: "composer" | "system" | "attachment" | "memory" | "wallet" | "tool";
  label?: MatterhornAgentDataLabel;
  /** Server-computed digest of attachment bytes or versioned private context. */
  contentHash?: string;
  sizeBytes?: number;
  version?: string;
};

/** Account-facing message input. Privacy labels and content digests are server-owned. */
export type MatterhornAgentMessagePart = {
  type: string;
  text?: string;
  name?: string;
  filename?: string;
  mime?: string;
  url?: string;
};

export type MatterhornAgentPrivacyPreflightRequest = {
  version?: typeof MATTERHORN_AGENT_PRIVACY_PREFLIGHT_VERSION;
  parts: MatterhornAgentMessagePart[];
  model: { providerId: string; modelId: string };
  agentId?: string | null;
  coworkerId?: string | null;
  attachmentIds?: string[];
  /** Server-owned encrypted files selected for this exact coworker request. */
  agentFileIds?: string[];
  memoryIds?: string[];
  privacyMode?: MatterhornAgentPrivacyMode;
  executionMode?: "discuss" | "plan" | "work";
  requestToolProfiles?: Array<Record<string, boolean>>;
};

export type MatterhornAgentMessageRequest = MatterhornAgentPrivacyPreflightRequest & {
  privacyConsentToken?: string;
  variant?: string;
  reasoningEffort?: string;
  messageID?: string;
  noReply?: boolean;
};

export type MatterhornAgentMessageResponse = {
  ok: true;
  accepted: true;
  sessionId: string;
  runId: string;
  privacy: {
    requestHash: string;
    decision: MatterhornAgentPrivacyDecision;
    consentUsed: boolean;
  };
  coworker?: {
    id: string;
    name: string;
    revision: number;
    policyVersion: string;
  };
};

export type MatterhornAgentPrivacyPreflightResponse = {
  version: typeof MATTERHORN_AGENT_PRIVACY_PREFLIGHT_VERSION;
  requestHash: string;
  workspaceId: string;
  sessionId: string;
  requestedMode: MatterhornAgentPrivacyMode;
  effectiveMode: MatterhornAgentPrivacyMode;
  decision: MatterhornAgentPrivacyDecision;
  provider: {
    id: string;
    name: string;
    modelId: string;
    privacyStatus: "verified_no_training" | "local_processing" | "opt_in_training" | "unverified";
    trainingUse: "none" | "opt_in_only" | "unknown";
    retentionDays: number | null;
    policyUrl: string | null;
    dataLeavesMatterhorn: boolean;
  };
  detectedData: {
    labels: MatterhornAgentDataLabel[];
    categories: string[];
    redactionCount: number;
  };
  challenge?: {
    id: string;
    expiresAt: string;
    singleUse: true;
  };
  reason: string;
};

export type MatterhornAgentPrivacyConsentConfirmation = {
  challengeId: string;
  requestHash: string;
};

export type MatterhornAgentPrivacyConsentResponse = {
  version: typeof MATTERHORN_AGENT_PRIVACY_PREFLIGHT_VERSION;
  consentToken: string;
  expiresAt: string;
  singleUse: true;
  requestHash: string;
};

export type MatterhornAgentCapabilityAccess = "read" | "prepare";

export type MatterhornAgentCapabilityClaims = {
  version: typeof MATTERHORN_AGENT_CAPABILITY_VERSION;
  jti: string;
  runId: string;
  workspaceId: string;
  sessionId: string;
  callId: string;
  agentId: string;
  deskId: string;
  toolName: string;
  access: MatterhornAgentCapabilityAccess;
  argsHash: string;
  issuedAt: string;
  expiresAt: string;
  policyVersion: string;
  registryVersion: string;
  coworker?: {
    id: string;
    ownerId: string;
    revision: number;
    policyVersion: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    network: string;
  };
};

export type MatterhornAgentCapabilityToken = {
  version: typeof MATTERHORN_AGENT_CAPABILITY_VERSION;
  token: string;
  claims: MatterhornAgentCapabilityClaims;
};

export type MatterhornAgentCapabilityDecision = {
  toolName: string;
  access: MatterhornAgentCapabilityAccess;
  decision: "issued" | "allowed" | "denied";
  reason: string;
  callId: string;
  decidedAt: string;
  latencyMs: number;
};

export type MatterhornAgentToolReceipt = {
  name: string;
  access: MatterhornAgentCapabilityAccess;
  outcome: "success" | "error" | "timeout" | "denied";
  latencyMs: number;
  source: string | null;
  freshness: string | null;
  trust: "trusted_runtime" | "untrusted_external";
};

export type MatterhornAgentRunReceipt = {
  version: typeof MATTERHORN_AGENT_RUN_RECEIPT_VERSION;
  id: string;
  runId: string;
  workspaceId: string;
  sessionId: string;
  status: "pending" | "success" | "partial" | "cancelled" | "error";
  startedAt: string;
  completedAt: string | null;
  responseDurationMs: number | null;
  provider: {
    id: string;
    name: string;
    modelId: string;
    privacyStatus: "verified_no_training" | "local_processing" | "opt_in_training" | "unverified";
    trainingUse: "none" | "opt_in_only" | "unknown";
    retentionDays: number | null;
    policyUrl: string | null;
  };
  privacy: {
    /**
     * Digest of the complete privacy-preflight request, including the exact
     * compiled provider context. Legacy v1 receipts may omit this field.
     */
    requestHash?: string;
    mode: MatterhornAgentPrivacyMode;
    dataCategories: string[];
    redactionCount: number;
    consent: "not_required" | "single_request";
    dataLeavesMatterhorn: boolean;
  };
  /**
   * Content-free counts of the user-selected context compiled for this run.
   * Legacy v1 receipts may omit this field.
   */
  context?: {
    chatFiles: number;
    coworkerFiles: number;
    savedMemories: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCostUsd: number;
    toolCallBudget: { reads: number; preparesPerFamily: number; submits: 0 };
  };
  tools: MatterhornAgentToolReceipt[];
  memory: {
    readIds: string[];
    writtenIds: string[];
  };
  capabilities: MatterhornAgentCapabilityDecision[];
  reviewedActions: Array<{
    intentHash: string;
    policyHash: string;
    simulationReference: string;
    publicReceipt: string | null;
  }>;
  integrity: {
    previousHash: string | null;
    recordHash: string;
  };
};

export type MatterhornAgentRunReceiptListResponse = {
  items: MatterhornAgentRunReceipt[];
  retention: { windowDays: 365; purgeSupported: true };
};
