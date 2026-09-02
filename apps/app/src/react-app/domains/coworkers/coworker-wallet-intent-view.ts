import type { MatterhornCoworkerWalletIntentView } from "../../../app/lib/matterhorn-server";

const CANCELLABLE_STATES = new Set<MatterhornCoworkerWalletIntentView["state"]>(
  ["wallet_review", "refreshing", "regeneration_required", "wallet_approved"],
);

const TERMINAL_STATES = new Set<MatterhornCoworkerWalletIntentView["state"]>([
  "cancelled",
  "expired",
  "confirmed",
  "failed",
]);

export function canCancelCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return CANCELLABLE_STATES.has(item.state);
}

export function canOpenCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return item.state === "wallet_review" || item.state === "wallet_approved";
}

export function isActiveCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return !TERMINAL_STATES.has(item.state);
}

export function coworkerWalletIntentStatus(
  item: MatterhornCoworkerWalletIntentView,
): string {
  if (item.state === "wallet_review") return "Ready for wallet review";
  if (item.state === "refreshing") return "Refreshing terms";
  if (item.state === "regeneration_required") return "Fresh preview required";
  if (item.state === "wallet_approved") return "Approved in wallet";
  if (item.state === "submitted") return "Sent by wallet";
  if (item.state === "confirmed") {
    return item.receipt?.verification.chainVerified
      ? "Verified on chain"
      : "Confirmed";
  }
  if (item.state === "failed") return "Failed";
  if (item.state === "expired") return "Expired";
  return "Cancelled";
}

export function coworkerWalletReceiptStatus(
  item: MatterhornCoworkerWalletIntentView,
): string | null {
  if (!item.receipt) return null;
  if (item.receipt.verification.chainVerified)
    return "Verified against the public chain";
  return "Wallet-reported result; not independently verified";
}

export function sortCoworkerWalletIntents(
  items: readonly MatterhornCoworkerWalletIntentView[],
): MatterhornCoworkerWalletIntentView[] {
  return [...items].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}
