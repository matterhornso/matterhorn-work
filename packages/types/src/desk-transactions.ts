// Transaction contracts describe what a user can complete after an agent has
// prepared an action. Agents never sign, approve, or submit these actions.

export const DESK_TRANSACTION_PROTOCOLS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
] as const;
export type DeskTransactionProtocol = (typeof DESK_TRANSACTION_PROTOCOLS)[number];

export const DESK_TRANSACTION_SUPPORT_LEVELS = [
  "connected_wallet",
  "external_signer",
  "external_client",
  "not_supported",
] as const;
export type DeskTransactionSupportLevel = (typeof DESK_TRANSACTION_SUPPORT_LEVELS)[number];

export const DESK_TRANSACTION_SUBMISSION_AUTHORITIES = [
  "matterhorn_after_signature",
  "connected_wallet",
  "external_signer",
  "external_client",
  "none",
] as const;
export type DeskTransactionSubmissionAuthority =
  (typeof DESK_TRANSACTION_SUBMISSION_AUTHORITIES)[number];

export const DESK_TRANSACTION_SIMULATION_POLICIES = [
  "required",
  "when_available",
  "not_available",
] as const;
export type DeskTransactionSimulationPolicy =
  (typeof DESK_TRANSACTION_SIMULATION_POLICIES)[number];

export const DESK_TRANSACTION_LIFECYCLE_STAGES = [
  "draft",
  "quoted",
  "simulated",
  "ready_for_review",
  "wallet_authorization_required",
  "submitted",
  "confirmed",
  "failed",
  "expired",
  "cancelled",
] as const;
export type DeskTransactionLifecycleStage =
  (typeof DESK_TRANSACTION_LIFECYCLE_STAGES)[number];

export const DESK_TRANSACTION_WALLET_KINDS = [
  "evm_wallet",
  "polkadot_extension",
  "sui_wallet",
  "external_signer",
  "external_client",
] as const;
export type DeskTransactionWalletKind = (typeof DESK_TRANSACTION_WALLET_KINDS)[number];

export type DeskTransactionFamily =
  | "bittensor_transfer"
  | "bittensor_stake"
  | "bittensor_unstake"
  | "bittensor_move_stake"
  | "bittensor_swap_stake"
  | "bittensor_transfer_stake"
  | "bittensor_multi_stake"
  | "hyperliquid_order"
  | "hyperliquid_cancel_order"
  | "hyperliquid_modify_order"
  | "hyperliquid_close_position"
  | "hyperliquid_leverage"
  | "hyperliquid_margin"
  | "hyperliquid_transfer"
  | "hyperliquid_withdraw"
  | "hyperliquid_staking"
  | "hyperliquid_vault"
  | "hyperliquid_twap"
  | "polymarket_buy"
  | "polymarket_sell"
  | "polymarket_cancel_order"
  | "polymarket_external_client_order"
  | "polymarket_batch_orders"
  | "polymarket_split_position"
  | "polymarket_merge_position"
  | "polymarket_redeem_position"
  | "sui_transfer"
  | "sui_coin_transfer"
  | "sui_object_transfer"
  | "sui_batch_transaction"
  | "sui_stake"
  | "sui_unstake"
  | "sui_move_call";

export interface DeskActionTransactionContract {
  version: "matterhorn.desk.transaction.contract.v1";
  protocol: DeskTransactionProtocol;
  family: DeskTransactionFamily;
  supportLevel: DeskTransactionSupportLevel;
  submissionAuthority: DeskTransactionSubmissionAuthority;
  userCanComplete: boolean;
  userCanCommitRealFunds: boolean;
  availableInsideMatterhorn: boolean;
  agentCanSignOrSubmit: false;
  reviewRequired: true;
  approvalRequiredEveryTime: true;
  receiptRequired: true;
  simulationPolicy: DeskTransactionSimulationPolicy;
  walletKinds: DeskTransactionWalletKind[];
  networks: string[];
  lifecycle: DeskTransactionLifecycleStage[];
  limitations: string[];
}

type DeskActionTransactionContractInput = Omit<
  DeskActionTransactionContract,
  | "version"
  | "userCanComplete"
  | "userCanCommitRealFunds"
  | "availableInsideMatterhorn"
  | "agentCanSignOrSubmit"
  | "reviewRequired"
  | "approvalRequiredEveryTime"
  | "receiptRequired"
  | "lifecycle"
>;

export function defineDeskTransactionContract(
  input: DeskActionTransactionContractInput,
): DeskActionTransactionContract {
  const availableInsideMatterhorn =
    input.supportLevel === "connected_wallet"
    && (input.submissionAuthority === "matterhorn_after_signature"
      || input.submissionAuthority === "connected_wallet");
  const userCanComplete = input.supportLevel !== "not_supported";

  return {
    version: "matterhorn.desk.transaction.contract.v1",
    ...input,
    userCanComplete,
    userCanCommitRealFunds: userCanComplete,
    availableInsideMatterhorn,
    agentCanSignOrSubmit: false,
    reviewRequired: true,
    approvalRequiredEveryTime: true,
    receiptRequired: true,
    lifecycle: [
      "draft",
      "quoted",
      "simulated",
      "ready_for_review",
      "wallet_authorization_required",
      "submitted",
      "confirmed",
      "failed",
      "expired",
      "cancelled",
    ],
  };
}
