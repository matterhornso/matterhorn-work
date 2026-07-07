import type {
  MatterhornMemoryDesk,
  MatterhornMemoryDeskPolicy,
  MatterhornMemoryRecord,
  MatterhornMemorySensitivity,
} from "@matterhorn-work/types";
import {
  containsForbiddenMemorySecretMaterial,
  detectMemoryDeskFromRecord,
  findForbiddenMemorySecretFields,
  MATTERHORN_MEMORY_DESK_POLICY_MATRIX,
  validateMemoryRecordAgainstDeskPolicy,
} from "@matterhorn-work/types";

const SENSITIVITY_RANK: Record<MatterhornMemorySensitivity, number> = {
  public: 0,
  private: 1,
  restricted: 2,
  forbidden_secret: 3,
};

const DESK_LABELS: Record<MatterhornMemoryDesk, string> = {
  bittensor: "Bittensor",
  hyperliquid: "Hyperliquid",
  polymarket: "Polymarket",
  sui: "Sui",
  wellness: "Longevity",
  decentralized_services: "Future services",
  generic_workspace: "Workspace",
};

export type MatterhornMemoryPolicyDecision = {
  desk: MatterhornMemoryDesk;
  deskLabel: string;
  policy: MatterhornMemoryDeskPolicy;
  canUseInChat: boolean;
  canExport: boolean;
  canSendToMcpApi: boolean;
  blockedReasons: string[];
  warnings: string[];
};

export function getMatterhornMemoryDeskLabel(desk: MatterhornMemoryDesk) {
  return DESK_LABELS[desk] ?? "Workspace";
}

export function getMatterhornMemoryPolicyDecision(
  record: MatterhornMemoryRecord,
): MatterhornMemoryPolicyDecision {
  const desk = detectMemoryDeskFromRecord(record);
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const policyValidation = validateMemoryRecordAgainstDeskPolicy(record, desk);
  const forbiddenFields = findForbiddenMemorySecretFields(record.body);

  if (!policyValidation.ok) {
    blockedReasons.push(...policyValidation.errors);
  }
  if (forbiddenFields.length > 0) {
    blockedReasons.push(`Contains forbidden memory fields: ${forbiddenFields.join(", ")}`);
  }
  if (containsForbiddenMemorySecretMaterial(record.body)) {
    blockedReasons.push("Contains forbidden secret-shaped material.");
  }
  if (record.sensitivity === "forbidden_secret") {
    blockedReasons.push("Forbidden-secret records cannot be used.");
  }
  if (!record.canUseInChat) {
    warnings.push("This record disabled chat use.");
  }
  if (!record.canExport) {
    warnings.push("This record disabled export.");
  }
  if (!policy.canUseInChat) {
    blockedReasons.push(`${getMatterhornMemoryDeskLabel(desk)} policy blocks chat use.`);
  }
  if (!policy.canExport) {
    warnings.push(`${getMatterhornMemoryDeskLabel(desk)} policy blocks export.`);
  }
  if (!policy.canSendToMcpApi) {
    warnings.push(`${getMatterhornMemoryDeskLabel(desk)} policy blocks MCP/API sharing.`);
  }

  const baseAllowed = blockedReasons.length === 0;
  return {
    desk,
    deskLabel: getMatterhornMemoryDeskLabel(desk),
    policy,
    canUseInChat: baseAllowed && record.canUseInChat && policy.canUseInChat,
    canExport: baseAllowed && record.canExport && policy.canExport,
    canSendToMcpApi: baseAllowed && policy.canSendToMcpApi,
    blockedReasons,
    warnings,
  };
}

export function applyMatterhornMemoryDeskPolicyDefaults(
  record: MatterhornMemoryRecord,
): MatterhornMemoryRecord {
  const desk = detectMemoryDeskFromRecord(record);
  const policy = MATTERHORN_MEMORY_DESK_POLICY_MATRIX[desk];
  const sensitivity =
    SENSITIVITY_RANK[record.sensitivity] < SENSITIVITY_RANK[policy.defaultSensitivity]
      ? policy.defaultSensitivity
      : record.sensitivity;

  return {
    ...record,
    sensitivity,
    canUseInChat: record.canUseInChat && policy.canUseInChat,
    canExport: record.canExport && policy.canExport && sensitivity !== "restricted",
  };
}
