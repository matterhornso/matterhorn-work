import type {
  MatterhornCoworkerInboxItem,
  MatterhornCoworkerProfile,
  MatterhornCoworkerWatch,
  MatterhornCoworkerWorkingState,
} from "@matterhorn-work/types/crypto-coworkers";
import { containsForbiddenMemorySecretMaterial } from "@matterhorn-work/types/memory";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function containsForbiddenCoworkerProfileMaterial(
  value: Pick<MatterhornCoworkerProfile, "name" | "role" | "mission">,
): boolean {
  return containsForbiddenMemorySecretMaterial({
    name: value.name,
    role: value.role,
    mission: value.mission,
  });
}

export function containsForbiddenCoworkerWorkingStateMaterial(
  value: MatterhornCoworkerWorkingState | Record<string, unknown>,
): boolean {
  return containsForbiddenMemorySecretMaterial({
    decisions: list(value.decisions).map((decision) => ({ summary: decision.summary })),
    positions: list(value.positions).map((position) => ({
      publicAssetAddress: position.asset,
      size: position.size,
    })),
    unresolvedRisks: list(value.unresolvedRisks).map((risk) => ({ summary: risk.summary })),
  });
}

function normalizedWatchConditionValues(
  value: Pick<MatterhornCoworkerWatch, "conditions"> | Record<string, unknown>,
  conditionValues: unknown,
): Record<string, unknown> | null {
  if (!isRecord(conditionValues)) return conditionValues === null ? null : { value: conditionValues };
  const hashConditions = new Set(list(value.conditions)
    .filter((condition) => condition.metric === "matterhorn_result_hash")
    .map((condition) => String(condition.id)));
  return Object.fromEntries(Object.entries(conditionValues).map(([key, entry]) => [
    hashConditions.has(key) ? `${key}_hash` : key,
    entry,
  ]));
}

export function containsForbiddenCoworkerWatchConditionValues(
  watch: Pick<MatterhornCoworkerWatch, "conditions"> | Record<string, unknown>,
  conditionValues: unknown,
): boolean {
  return containsForbiddenMemorySecretMaterial(normalizedWatchConditionValues(watch, conditionValues));
}

export function containsForbiddenCoworkerWatchMaterial(
  value: MatterhornCoworkerWatch | Record<string, unknown>,
): boolean {
  const schedule = isRecord(value.schedule) ? value.schedule : {};
  return containsForbiddenMemorySecretMaterial({
    name: value.name,
    parameters: value.parameters,
    conditionValues: normalizedWatchConditionValues(value, schedule.lastConditionValues),
  });
}

export function containsForbiddenCoworkerInboxMaterial(
  value: MatterhornCoworkerInboxItem | Record<string, unknown>,
): boolean {
  const nextSafeAction = isRecord(value.nextSafeAction) ? value.nextSafeAction : {};
  return containsForbiddenMemorySecretMaterial({
    title: value.title,
    summary: value.summary,
    nextSafeAction: nextSafeAction.label,
  });
}
