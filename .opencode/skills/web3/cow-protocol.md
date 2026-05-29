# CoW Protocol

## What this skill does
CoW Protocol is an intent-based DEX aggregator that batches orders for optimal execution with MEV protection, enabling users to trade through solvers that compete to fill orders at the best price. This skill teaches an AI agent how to submit intent-based orders, track execution, and use CoW Protocol's unique features.

## Supported chains
- Ethereum
- Gnosis
- Arbitrum
- Base

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum | GPv2Settlement | 0x9008D19f58AAbD9eD0D60971565AA8510560ab41 |
| Gnosis | GPv2Settlement | 0x9008D19f58AAbD9eD0D60971565AA8510560ab41 |
| Arbitrum | GPv2Settlement | 0x9008D19f58AAbD9eD0D60971565AA8510560ab41 |
| Base | GPv2Settlement | 0x9008D19f58AAbD9eD0D60971565AA8510560ab41 |
| Ethereum | ComposableCoW | 0xFDAFc8dCE0F5C5c7e2C0e7e5d7fE44B5e5b5e5b5 |

## Common operations
### Submitting a Market Order
1. CoW Protocol uses an off-chain orderbook. Orders are submitted as signed EIP-712 messages (not on-chain transactions), and solvers compete to execute them in settlement batches.
2. Construct the order data structure with: `sellToken`, `buyToken`, `receiver` (user's wallet), `sellAmount`, `buyAmount` (minimum output), `validTo` (expiry timestamp, typically 1 hour), `appData` (order metadata — use `0x0000000000000000000000000000000000000000000000000000000000000000` for simple orders), `feeAmount`, `kind` (`sell` or `buy`), `partiallyFillable` (false for standard orders), `sellTokenBalance` (`erc20`), `buyTokenBalance` (`erc20`).
3. Fetch the fee quote from `https://api.cow.fi/<chain>/api/v1/quote` with a POST request containing the order parameters. The response includes the `feeAmount` to include and the estimated `buyAmount`.
4. The user signs the EIP-712 order data using `wallet_signTypedData` with the CoW Protocol order domain. The domain includes `name: "Gnosis Protocol"`, `version: "v2"`, `chainId`, and `verifyingContract` (the GPv2Settlement address).
5. POST the signed order to `https://api.cow.fi/<chain>/api/v1/orders` with the full order and signature. The API returns an order UID for tracking.
6. No on-chain transaction is submitted by the user — solvers handle execution. The user must have sufficient balance and allowance for the settlement contract at the time of execution.

### Tracking Order Status
1. Query order status via `https://api.cow.fi/<chain>/api/v1/orders/<orderUid>` to get the current state: `presignaturePending`, `open`, `fulfilled`, `cancelled`, or `expired`.
2. When status is `open`, solvers are actively working to include the order in the next settlement batch. Execution typically happens within 1-2 minutes but can vary.
3. When `fulfilled`, the API returns the execution details including the actual `executedBuyAmount`, `executedSellAmount`, `executedFeeAmount`, and the settlement transaction hash.
4. Monitor multiple orders at once via `https://api.cow.fi/<chain>/api/v1/orders?owner=<walletAddress>` to list all recent orders for the wallet.
5. Orders automatically expire at the `validTo` timestamp. If not executed by then, the user can resubmit with an extended expiry.

### Cancelling an Order
1. CoW Protocol supports off-chain cancellation (recommended) and on-chain cancellation.
2. For off-chain cancellation, POST the signed EIP-712 cancellation payload to `https://api.cow.fi/<chain>/api/v1/orders/<orderUid>/cancel`. This is free and immediate.
3. For on-chain cancellation, encode `invalidateOrder(orderUid)` on the GPv2Settlement contract. This is a fallback that costs gas but guarantees cancellation even if the off-chain API is unresponsive.
4. Note: If an order is already included in a pending settlement batch, cancellation may not prevent execution. Cancel early if needed.
5. Partially fillable orders can be cancelled to stop further fills while retaining already-filled portions.

### Advanced: TWAP Orders and Conditional Orders
1. CoW Protocol supports TWAP (Time-Weighted Average Price) orders via ComposableCoW. Define `numberOfParts`, `startTime`, and `intervalBetweenParts` to split a large order into smaller pieces over time.
2. TWAP orders help minimize price impact and are less visible to MEV searchers. POST the conditional order configuration to the CoW Protocol API.
3. Conditional orders (good-after-time, stop-loss) can also be created via ComposableCoW, which executes the trade only when certain time or price conditions are met.
4. CoW Hooks allow embedding pre- or post-trade actions (e.g., bridging input from another chain, depositing output into a vault). Hook interactions are encoded as calldata to be executed atomically with the swap.

### Understanding MEV Protection
1. CoW Protocol batches multiple orders together and uses a batch auction mechanism, making it difficult for MEV searchers to sandwich individual trades.
2. Coincidence of Wants (CoW) occurs when two opposing orders in the same batch can be matched directly without going through AMMs, saving on swap fees and eliminating slippage entirely.
3. Solvers compete to find the best execution path across on-chain AMMs and CoW matches. The solvers pay gas, not the user — the fee is included in the limit price.
4. Surplus is the difference between the user's limit price and the actual execution price — any surplus beyond the solver's costs is returned to the user, meaning execution can be better than the signed limit price.
