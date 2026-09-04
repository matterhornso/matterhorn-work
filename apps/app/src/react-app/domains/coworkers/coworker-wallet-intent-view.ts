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

type BittensorWalletNetwork = "finney" | "test" | "local";

function normalizeBittensorNetwork(value: string): BittensorWalletNetwork | null {
  const normalized = value.trim().toLowerCase().replace(/^bittensor:/, "");
  if (normalized === "finney" || normalized === "test" || normalized === "local") return normalized;
  return null;
}

export function bittensorWalletNetworkMatches(
  reviewedNetwork: string,
  walletNetwork: BittensorWalletNetwork,
): boolean {
  return normalizeBittensorNetwork(reviewedNetwork) === walletNetwork;
}

export function coworkerWalletReviewUnavailableReason(
  item: MatterhornCoworkerWalletIntentView,
): string | null {
  const protocol = item.reviewedAction?.protocol ?? item.intent?.protocol;
  const network = item.reviewedAction?.network ?? item.intent?.network;
  if (protocol !== "bittensor" || !network || bittensorWalletNetworkMatches(network, "finney")) return null;
  const requestedNetwork = normalizeBittensorNetwork(network);
  const requestedLabel = requestedNetwork === "test"
    ? "Testnet"
    : requestedNetwork === "local"
      ? "a local Bittensor network"
      : "an unsupported Bittensor network";
  return `This intent targets ${requestedLabel}, but this wallet build can only sign Finney. Matterhorn will not switch networks or send it.`;
}

export function canCancelCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return CANCELLABLE_STATES.has(item.state);
}

export function canOpenCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return (item.state === "wallet_review" || item.state === "wallet_approved")
    && coworkerWalletReviewUnavailableReason(item) === null;
}

export function isActiveCoworkerWalletIntent(
  item: MatterhornCoworkerWalletIntentView,
): boolean {
  return !TERMINAL_STATES.has(item.state);
}

export function coworkerWalletIntentStatus(
  item: MatterhornCoworkerWalletIntentView,
): string {
  if (coworkerWalletReviewUnavailableReason(item)) return "Wallet network unavailable";
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
