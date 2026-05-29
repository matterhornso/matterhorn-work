# RBF Protocol

## What this skill does
RBF Protocol enables automated recurring billing and subscription payments on Base using smart contract-based payment streams, allowing businesses and services to charge users on a recurring schedule with crypto. This skill teaches an AI agent how to set up recurring payments, manage subscriptions, and handle payment failures.

## Supported chains
- Base

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | RBF Router | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.rbf.finance) |
| Base | Subscription Manager | 0x0000000000000000000000000000000000000000 (placeholder — verify latest on docs.rbf.finance) |
| Base | USDC (base form) | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |

## Common operations
### Setting Up a Recurring Payment
1. RBF uses a subscription-based model where a payer authorizes a recurring payment to a merchant/payee. The subscription is represented as an on-chain commitment with payment parameters.
2. Encode the subscription creation using the RBF Router's `createSubscription` function. Parameters include:
   - `payee`: The merchant/service wallet address receiving payments
   - `token`: The ERC-20 token for payment (typically USDC on Base)
   - `amountPerPeriod`: The payment amount in the token's smallest unit (e.g., $10 USDC = 10000000 wei for 6-decimal USDC)
   - `periodDuration`: Time between payments in seconds (e.g., 2592000 for monthly, 604800 for weekly)
   - `maxPeriods`: Maximum number of periods (use `type(uint256).max` for indefinite)
   - `cancelableByPayer`: Boolean to allow the payer to cancel unilaterally
   - `cancelableByPayee`: Boolean to allow the merchant to cancel (useful for failed payments)
3. Before creating the subscription, the user must approve the RBF Router contract to spend the payment token for at least the first payment. For gas efficiency, approve `type(uint256).max`.
4. Submit via `wallet_sendTransaction` targeting the RBF Router contract. The subscription ID is returned in the event logs (`SubscriptionCreated` event with `subscriptionId` field).
5. Present the total commitment to the user: "Setting up a $10/month USDC subscription will create an on-chain commitment. You can cancel at any time. The first payment of $10 will be deducted upon creation."

### Executing Recurring Payments
1. RBF uses a pull-based model. The payee (or a keeper/relayer) calls `executePayment(subscriptionId)` on the Router contract to trigger the next payment deduction.
2. Payments can only be executed once per period. The contract enforces that the elapsed time since the last payment >= `periodDuration`. Early execution reverts.
3. The payment execution function transfers `amountPerPeriod` of the token from the payer's wallet to the payee. If the payer has insufficient balance, the payment reverts — the payee must retry after the payer tops up.
4. For automated execution, payees typically run a keeper bot that monitors all active subscriptions and calls `executePayment` at each period boundary. The keeper pays gas and may be compensated by a small fee from the payment amount.
5. Track payments via the `PaymentExecuted(subscriptionId, period, amount, timestamp)` event emitted on each successful execution.

### Managing Subscriptions
1. Query an active subscription by calling `getSubscription(subscriptionId)` on the Router. Returns: `payer`, `payee`, `token`, `amountPerPeriod`, `periodDuration`, `maxPeriods`, `periodsPaid`, `lastPaymentTimestamp`, `active`, and cancellation flags.
2. To cancel as a payer, call `cancelSubscription(subscriptionId)` if `cancelableByPayer` was set to true during creation. The subscription is marked inactive and no further payments can be executed.
3. To cancel as a payee, call `cancelSubscription(subscriptionId)` if `cancelableByPayee` was set to true. This is useful if a user stops paying — the payee can close the subscription to stop attempting payment executions.
4. View all subscriptions for a wallet by querying the `SubscriptionCreated` and `SubscriptionCancelled` events from the Router contract, filtering by the wallet address as payer or payee.
5. For paused subscriptions (e.g., payer wants to temporarily stop), cancel the old subscription and create a new one when ready to resume. There is no native pause/resume functionality — this is by design to keep the contract logic simple and secure.

### Handling Failed Payments
1. Payment failure occurs when `executePayment` is called but the payer's token balance is insufficient. The transaction reverts with an "insufficient balance" error. The payee learns this from the failed transaction.
2. After a failed payment, the subscription remains active. The payee should retry when the payer replenishes their balance. Failed payments do not accumulate — only one payment is due at a time.
3. For business logic, the payee should handle the case where a payer has missed one or more payments. Options include:
   - Grace period: retry daily for X days before taking action
   - Service suspension: cancel the subscription and revoke access until the user re-subscribes
   - Off-chain dunning: send a reminder to the user to top up their wallet
4. The `periodsPaid` counter only increments on successful payments. Compare expected periods (based on elapsed time) vs `periodsPaid` to determine how many payments were missed.
5. Advise users to maintain a sufficient balance. For monthly subscriptions, recommend keeping at least 3x the payment amount to avoid failed payments during market volatility if paying in a non-stablecoin token.

### Token Allowance Strategy
1. RBF deducts directly from the payer's wallet (not from a deposit escrow). Each `executePayment` call transfers `amountPerPeriod` from payer to payee.
2. For this to work, the payer must maintain a sufficient token allowance (`allowance(payer, routerAddress)`) at all times. If the allowance is exhausted, payments will fail.
3. Best practices for allowance:
   - Approve a large amount (or `type(uint256).max`) for USDC/stablecoin payments where the risk is limited to the payment amount
   - For volatile token payments, approve a smaller amount and top up the allowance periodically
   - Monitor allowance via `allowance(payer, routerAddress)` and alert the user when it drops below a threshold
4. The payee does not need to maintain any allowance — they only receive tokens.
5. Gas for `executePayment` is paid by whoever calls the function (usually the payee's keeper bot). The payer does not pay gas for recurring payment execution after the initial subscription creation.
