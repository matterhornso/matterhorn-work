export const MATTERHORN_MODEL_USAGE_VERSION = "matterhorn.model-usage.v1" as const;

export type MatterhornModelUsageEnforcement = "off" | "monitor" | "hard";

export type MatterhornModelUsagePeriod = {
  usedTokens: number;
  reservedTokens: number;
  chargedTokens: number;
  limit: number | null;
  remainingTokens: number | null;
  resetsAt: string;
};

export type MatterhornModelUsageBreakdown = {
  providerId: string;
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  rawTokens: number;
  chargedTokens: number;
  providerCostUsd: number;
};

export type MatterhornModelUsageStatus = {
  version: typeof MATTERHORN_MODEL_USAGE_VERSION;
  enforcement: MatterhornModelUsageEnforcement;
  enabled: boolean;
  canStartRequest: boolean;
  blockReason: "daily_limit" | "monthly_limit" | "global_daily_limit" | "global_monthly_limit" | null;
  reservationTokens: number;
  daily: MatterhornModelUsagePeriod;
  monthly: MatterhornModelUsagePeriod;
  platformAvailable: boolean;
  pendingRequests: number;
  models: MatterhornModelUsageBreakdown[];
  updatedAt: string;
};

export type MatterhornModelUsageStatusResponse = {
  status: MatterhornModelUsageStatus;
};

export type MatterhornModelUsageReconcileRequest = {
  sessionId: string;
};

export type MatterhornModelUsageReconcileResponse = {
  reconciled: number;
  status: MatterhornModelUsageStatus;
};
