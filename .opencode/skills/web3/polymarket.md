# Polymarket

## What this skill does
Polymarket is the world's largest prediction market platform where users trade outcome shares on real-world events using the Conditional Tokens Framework (CTF) on Polygon. This skill teaches an AI agent how to fetch market data, buy and sell outcome tokens, and manage positions.

## Supported chains
- Polygon

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Polygon | CTF Exchange | 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E |
| Polygon | Conditional Tokens | 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 |
| Polygon | USDC.e | 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 |

## Common operations
### Fetching Markets
1. Query the Polymarket API at `https://clob.polymarket.com/markets` to list available markets. Filter by `active=true`, `closed=false` to show tradeable markets.
2. For a specific market, fetch details from `https://clob.polymarket.com/markets/<marketId>` which returns the question, description, outcomes, end date, and current prices.
3. Use the Gamma Markets API (`https://gamma-api.polymarket.com`) for enhanced market metadata, including news links, resolution sources, and volume stats.
4. Present market information to the user: the question, the two outcomes, current buy/sell prices for each outcome, 24h volume, and time remaining until resolution.

### Buying Outcome Tokens
1. Use the CLOB (Central Limit Order Book) API at `https://clob.polymarket.com` to place orders. First, fetch the orderbook for the target token: GET `/orderbook?token_id=<tokenId>`.
2. To buy at market price, construct a `POST /order` request with: `tokenID` (the outcome token ID), `price` (between 0 and 1, e.g., `0.55` for $0.55), `size` (in dollars, minimum $5), `side` (`BUY`), and `orderType` (`FOK` for fill-or-kill, or `GTC` for good-til-cancelled).
3. Authenticate with the user's signature — the Polymarket CLOB requires EIP-712 typed data signatures. Construct the `POST /order` or `POST /order/book` endpoint call with the signed order.
4. If using the CTF directly via on-chain interaction, encode a `buy(conditionId, collateralAmount, outcomeIndex, minOutcomeTokens)` call on the CTF Exchange contract. The `collateralAmount` is in USDC.e (6 decimals), and `minOutcomeTokens` provides slippage protection.
5. Submit via `wallet_sendTransaction` targeting the CTF Exchange contract on Polygon. Always present the total cost including fees before submission.

### Selling / Redeeming Outcome Tokens
1. To sell before market resolution, submit a `SELL` order via the CLOB API at `POST /order` with the user's signed EIP-712 order data. The price is between 0 and 1.
2. Alternatively, use the CTF `sell(conditionId, collateralAmount, outcomeIndex, minReturn)` function on-chain to sell tokens back to the exchange for USDC.
3. After resolution, winning tokens can be redeemed 1:1 for USDC. Encode `redeemPositions(collateralToken, parentCollectionId, conditionId, indexSets)` on the CTF contract.
4. Check if a market has resolved via `https://clob.polymarket.com/markets/<marketId>` — the `resolved` flag and `outcome` field indicate resolution status.
5. For redemption, verify the user holds the correct winning outcome tokens via `balanceOf(user, positionId)` on the Conditional Tokens contract.

### Portfolio Management
1. Query the user's positions via `https://data-api.polymarket.com/positions?user=<walletAddress>` to get all held outcome tokens with current market values.
2. Calculate total portfolio value by summing the value of each position at current market prices.
3. Check orders via GET `/orders?owner=<walletAddress>` on the CLOB API to list open, filled, and cancelled orders.
4. Cancel an open order via DELETE `/order/<orderId>` or POST `/orders/cancel` with the list of order IDs.
5. Display unrealized PnL per position and total, plus the payout profile if all scenarios were to resolve at current prices.
