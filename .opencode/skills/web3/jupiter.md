# Jupiter

## What this skill does
Jupiter is Solana's leading DEX aggregator providing token swaps, limit orders, dollar-cost averaging (DCA), and perpetuals trading. This skill teaches an AI agent how to interact with the Jupiter HTTP API to fetch quotes, construct swap transactions, and manage advanced order types.

## Supported chains
- Solana

## Contract addresses
Jupiter does not use EVM smart contracts. All interaction is through the Jupiter HTTP API:
- Base URL: `https://quote-api.jup.ag/v6`
- Swap API: `https://quote-api.jup.ag/v6/quote`
- Swap Instructions: `https://quote-api.jup.ag/v6/swap-instructions`
- Limit Order API: `https://jup.ag/api/limit/v1`
- DCA API: `https://jup.ag/api/dca/v1`

## Common operations
### Swap
1. Fetch a quote from the Jupiter API by sending a GET request to `/quote` with parameters: `inputMint`, `outputMint`, `amount` (in lamports or smallest token unit), and `slippageBps` (e.g., `50` for 0.5%).
2. Optionally pass `restrictIntermediateTokens=true` to limit routing through known tokens, and `onlyDirectRoutes=false` to allow multi-hop swaps.
3. Examine the returned `routePlan` to understand the routing path and the `outAmount` for the expected output. The `priceImpactPct` field indicates market impact.
4. To construct the swap transaction, POST the quote response to `/swap` with the user's wallet public key (`userPublicKey`) and optional `wrapAndUnwrapSol` and `dynamicComputeUnitLimit` parameters.
5. The response contains a `swapTransaction` — a base64-encoded Solana transaction. Submit this via `wallet_sendTransaction` on the Solana network, requesting the user's signature first.
6. Gas considerations — Jupiter automatically handles compute unit estimation. The API response includes `prioritizationFeeLamports` which covers Solana priority fees. Always present the fee estimate to the user before submission.

### Limit Orders
1. POST to the Jupiter Limit Order API (`/createOrder`) with the order parameters: `maker` (user wallet), `inputMint`, `outputMint`, `inputAmount`, `outputAmount` (the desired minimum output), and `expiredAt` (Unix timestamp for order expiry).
2. The API returns a transaction that creates the limit order on-chain via the Jupiter Limit Order program. Orders are executed by keepers when market price meets the limit.
3. To check order status, query `/orders` with the user's wallet address to list all active, filled, and cancelled orders.
4. To cancel, POST to `/cancelOrder` with the `orderPubkey` and `maker` address.

### Dollar-Cost Averaging (DCA)
1. POST to `/createDca` with parameters: `user`, `inputMint`, `outputMint`, `totalAmount` (total to spend across all periods), `dcaInterval` (in seconds between buys), `numberOfOrders`, and `createdAt` (start time).
2. DCAs are executed by keepers at the specified intervals. The user needs to fund the DCA account with the total input amount upfront.
3. Query active DCAs via `/dcas` with the user's wallet address.
4. To stop a DCA, POST to `/closeDca` with the DCA account address to withdraw remaining funds.

### Token List and Routing
1. Fetch the complete token list from `https://cache.jup.ag/tokens` to resolve token symbols to mint addresses.
2. For accurate pricing, use `/price` endpoint with comma-separated token IDs (using Coingecko IDs) to get USD prices.
3. When constructing swaps, always verify the token mint address against the token list to prevent sending to incorrect token contracts.
