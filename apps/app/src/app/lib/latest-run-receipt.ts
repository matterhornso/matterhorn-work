import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

// The receipts API returns newest first. Never put a previous run's cancellation
// or usage below the current response while its own receipt is still settling.
export function latestFinalRunReceipt<T extends Pick<MatterhornAgentRunReceipt, "status">>(
  receipts: readonly T[] | undefined,
): T | null {
  const latest = receipts?.[0];
  return latest && latest.status !== "pending" ? latest : null;
}
