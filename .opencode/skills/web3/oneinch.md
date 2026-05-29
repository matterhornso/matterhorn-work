# 1inch

## What this skill does
1inch is a DEX aggregation protocol that routes swaps across 12+ EVM chains and hundreds of liquidity sources to find the best price. This skill teaches an AI agent how to fetch quotes, construct optimal swap transactions, and use 1inch's advanced aggregation features.

## Supported chains
- Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Gnosis, Avalanche, Fantom, zkSync Era, Linea, Scroll, and more (12+ EVM chains)

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |
| Ethereum | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |
| Arbitrum | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |
| Optimism | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |
| Polygon | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |
| BNB Chain | Aggregation Router | 0x1111111254EEB25477B68fb85Ed929f73A960582 |

## Common operations
### Swap via the 1inch API (Recommended)
1. The 1inch Aggregation API is the simplest way to execute swaps. Base URL: `https://api.1inch.dev/swap/v6.0/<chainId>`. An API key is required (register at portal.1inch.dev).
2. Fetch a quote via GET `/quote` with parameters: `src` (input token address), `dst` (output token address), `amount` (in wei), `from` (user wallet), `slippage` (in percent, e.g., `0.5` for 0.5%), and optional `includeGas=true` to get gas estimates.
3. The quote response includes `toAmount` (expected output), `estimatedGas`, route details, and a list of exchanges used. Present the expected output, minimum received (with slippage), and the route summary to the user.
4. To build the swap transaction, call GET `/swap` with the same parameters plus the `from` address. The response contains a `tx` object with `to`, `data`, `value`, `gas`, and `gasPrice` — ready to submit.
5. Before submitting, check the user's token allowance for the 1inch router via the `/approve/allowance` endpoint. If allowance is insufficient, call `/approve/transaction` to build an approval tx. Submit the approval first, then the swap.
6. Submit the swap transaction via `wallet_sendTransaction` using the `tx` object directly. The `value` field should be set to the transaction value (non-zero only when swapping from native ETH).

### On-Chain Aggregation Router
1. For direct on-chain interaction without the API, encode a call to `swap(executor, desc, permit, data)` on the Aggregation Router.
2. The `desc` struct contains: `srcToken`, `dstToken`, `srcReceiver`, `dstReceiver`, `amount`, `minReturnAmount`, `flags`. Set `flags` to `0x00` for a basic swap.
3. The `data` field contains the execution path encoded as a sequence of swap steps across different exchanges. This is typically constructed via the SDK or API, not manually.
4. For native ETH swaps, use `unoswap` variants (`unoswapTo`, `unoswapToWithPermit`) which are gas-optimized for single-pool routes.
5. Submit via `wallet_sendTransaction` targeting the Aggregation Router. Always test small amounts first when using custom-encoded swap data.

### Multi-Swap (Complex Routing)
1. For tokens without direct pools, 1inch may route through intermediate tokens. The API response's `protocols` array shows the full route including all hops.
2. Enable split routing (splitting the order across multiple exchanges) by setting `disableEstimate=false` — this is default and generally yields better prices.
3. Use `complexityLevel` parameter (0-3) to control routing depth. Level 3 enables maximum routing complexity including multi-hop paths. Higher complexity may have higher gas costs.
4. Review the route before approving. Routes that go through multiple unknown intermediate tokens may carry smart-contract risk. The API provides a `protocols` breakdown showing each exchange and percentage of the trade.

### Limit Orders
1. 1inch supports limit orders via a separate contract and API. Use `https://api.1inch.dev/limit-order/v4.0/<chainId>`.
2. To place a limit order, POST to the limit order API with: `makerAsset`, `takerAsset`, `makingAmount`, `takingAmount`, `maker` (user wallet), `deadline`, and signature.
3. Limit orders are filled by takers who match the price. The order stays open until filled, cancelled, or the deadline passes.
4. Query active limit orders via GET `/orders?maker=<walletAddress>`. Cancel via DELETE `/order/<orderHash>`.
5. Unlike market swaps, limit orders require a one-time approval for the limit order contract and the order is executed trustlessly when the price is met.

### Gas Optimization
1. Use the `/swap` endpoint's `tx.gas` for the swap gas estimate. Add 20% as a safety buffer for base fee volatility.
2. For frequent traders, consider using the 1inch Fusion mode (if available on the chain), which batches orders like CoW Protocol for gas-less execution.
3. Check if `approve` is needed via `/approve/allowance` before every swap to avoid wasted gas on unnecessary approvals.
4. When approving, use `uint256.max` (infinite approval) to avoid repeated approval transactions, but warn the user about the security implications — only do this for trusted router contracts.
5. The `/quote` endpoint returns `gas` estimation based on the current route. Route complexity directly impacts gas — a simple Uniswap V3 route may cost 100k gas while a complex multi-hop route could be 300k+.
