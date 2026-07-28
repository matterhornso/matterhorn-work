import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { countAuditEntries } from "./audit.js";
import {
  isBillingUsageTimestampInPeriod,
  type BillingUsagePeriod,
} from "./billing.js";

export interface GeneratedMediaUsageWorkspace {
  id: string;
  path: string;
}

export function billingPeriodEpochRange(period: BillingUsagePeriod): {
  startAtMs?: number;
  endBeforeMs?: number;
} {
  const startAtMs = Date.parse(period.currentPeriodStart);
  const endBeforeMs = period.currentPeriodEnd ? Date.parse(period.currentPeriodEnd) : Number.NaN;
  return {
    ...(Number.isFinite(startAtMs) ? { startAtMs } : {}),
    ...(Number.isFinite(endBeforeMs) ? { endBeforeMs } : {}),
  };
}

export async function countDurableGeneratedImageUsage(
  workspace: GeneratedMediaUsageWorkspace,
  images: readonly MatterhornGeneratedImage[],
  period: BillingUsagePeriod,
): Promise<number> {
  const artifactUsage = images.filter((image) => (
    isBillingUsageTimestampInPeriod(image.createdAt, period)
  )).length;
  const auditUsage = await countAuditEntries(workspace.path, workspace.id, {
    actions: ["workspace.image.generated"],
    ...billingPeriodEpochRange(period),
  });
  return Math.max(artifactUsage, auditUsage);
}
