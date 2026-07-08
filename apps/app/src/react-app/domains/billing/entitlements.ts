import {
  matterhornPlanEntitlementLimit,
  type MatterhornBillingPlanId,
  type MatterhornEntitlementKey,
} from "@matterhorn-work/types/billing";

export type MatterhornEntitlementCheck =
  | { allowed: true; limit: number | null; used: number }
  | { allowed: false; limit: number | null; reason: "plan_missing" | "limit_reached" | "not_included" };

export function checkEntitlement(
  planId: MatterhornBillingPlanId | null | undefined,
  key: MatterhornEntitlementKey,
  used: number,
): MatterhornEntitlementCheck {
  if (!planId) {
    return { allowed: false, limit: 0, reason: "plan_missing" };
  }
  const limit = matterhornPlanEntitlementLimit(planId, key);
  if (limit === null) {
    return { allowed: true, limit: null, used };
  }
  if (limit === 0) {
    return { allowed: false, limit: 0, reason: "not_included" };
  }
  if (used >= limit) {
    return { allowed: false, limit, reason: "limit_reached" };
  }
  return { allowed: true, limit, used };
}

export function isEntitlementAllowed(
  planId: MatterhornBillingPlanId | null | undefined,
  key: MatterhornEntitlementKey,
  used: number,
): boolean {
  return checkEntitlement(planId, key, used).allowed;
}

export function formatEntitlementLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : `${limit}`;
}

export function formatEntitlementUsage(used: number, limit: number | null): string {
  if (limit === null) {
    return `${used} used`;
  }
  if (limit === 0) {
    return used > 0 ? `${used} used` : "Not included";
  }
  return `${used} / ${limit} used`;
}

export function formatEntitlementReset(resetsAt?: string | null): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Resets ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export type EntitlementUsageStatus = {
  label: string;
  tone: "warning" | "error";
} | null;

export function entitlementUsageStatus(used: number, limit: number | null): EntitlementUsageStatus {
  if (limit === null) return null;
  if (limit === 0) {
    return used > 0 ? { label: "Upgrade required", tone: "warning" } : null;
  }
  if (used >= limit) {
    return { label: "Limit reached", tone: "error" };
  }
  if (limit <= 5 && used === limit - 1) {
    return { label: "Almost at limit", tone: "warning" };
  }
  if (limit > 5 && used / limit >= 0.8) {
    return { label: "Almost at limit", tone: "warning" };
  }
  return null;
}
