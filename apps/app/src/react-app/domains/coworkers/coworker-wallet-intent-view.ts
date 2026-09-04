import type {
  MatterhornCoworkerWalletIntentView,
  MatterhornCoworkerWalletReceiptInput,
} from "../../../app/lib/matterhorn-server";

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

type PolymarketCoworkerReceiptContext = {
  protocol: string;
  network: string;
  signer: string | null;
  operation: string;
  expectedRevision: number;
  authorizedArgumentsHash: string;
};

type PolymarketWalletResult = {
  status: string;
  orderId: string | null;
  transactionHashes: string[];
  tradeIds: string[];
  submittedAt: string;
};

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

function isPolygonMainnet(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "polygon"
    || normalized === "polygon:137"
    || normalized === "polymarket:polygon"
    || normalized === "polymarket:137";
}

export function polymarketCoworkerWalletMismatchReason(
  context: PolymarketCoworkerReceiptContext,
  wallet: { chainId: number | null; address: string | null; operation: "buy" | "sell" | "cancel" },
): string | null {
  if (context.protocol !== "polymarket" || !isPolygonMainnet(context.network)) {
    return "This wallet result does not match a protected Polygon Polymarket review.";
  }
  if (wallet.chainId !== 137) {
    return "Switch the connected wallet to Polygon before continuing.";
  }
  if (context.operation !== wallet.operation) {
    return "The selected action no longer matches the coworker's protected review. Open a fresh wallet review.";
  }
  if (context.signer && context.signer.toLowerCase() !== wallet.address?.toLowerCase()) {
    return "Connect the wallet named in the coworker's protected review before continuing.";
  }
  return null;
}

export function polymarketCoworkerWalletReceiptInput(
  context: PolymarketCoworkerReceiptContext,
  receipt: PolymarketWalletResult,
): MatterhornCoworkerWalletReceiptInput {
  const transactionHash = receipt.transactionHashes.find((value) => value.trim())?.trim() ?? null;
  const tradeId = receipt.tradeIds.find((value) => value.trim())?.trim() ?? null;
  const orderId = receipt.orderId?.trim() || null;
  const publicId = transactionHash
    ?? tradeId
    ?? (orderId && orderId.length <= 192 ? orderId : null)
    ?? `polymarket-${context.operation}:${receipt.submittedAt}`;
  return {
    expectedRevision: context.expectedRevision,
    status: "submitted",
    publicId,
    transactionHash,
    blockHash: null,
    network: context.network,
    signer: context.signer,
    operation: context.operation,
    authorizedArgumentsHash: context.authorizedArgumentsHash,
  };
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
