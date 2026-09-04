export const COWORKER_QUERY_PREFIX = "coworker-control";

export function coworkerListQueryKey(workspaceId: string) {
  return [COWORKER_QUERY_PREFIX, workspaceId, "list"] as const;
}

export function boundedCoworkerUnreadCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return 0;
  return Math.min(value, 100);
}

export function coworkerUnreadBadgeLabel(value: unknown): string | null {
  const count = boundedCoworkerUnreadCount(value);
  if (count === 0) return null;
  return count >= 100 ? "99+" : String(count);
}

export function coworkerUnreadStatusLabel(value: unknown): string {
  const count = boundedCoworkerUnreadCount(value);
  if (count === 0) return "No new coworker updates";
  if (count === 1) return "1 new coworker update";
  if (count >= 100) return "More than 99 new coworker updates";
  return `${count} new coworker updates`;
}
