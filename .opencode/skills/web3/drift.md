# Drift Protocol

## What this skill does
Drift Protocol is a decentralized derivatives exchange on Solana offering perpetual futures, spot trading, and borrow/lend markets. This skill teaches an AI agent how to place orders, manage positions, and interact with the Drift SDK/API.

## Supported chains
- Solana

## Contract addresses
Drift Protocol does not use EVM contracts. Interaction is through the Drift SDK (`@drift-labs/sdk`) and Solana program accounts:
- Drift Protocol Program ID: `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH`
- Drift Vaults Program: `vAuLTsyrvSfZRB1UD8H9DkYzH3C3Q8NZa1b7mJYqKBF`
- Drift API base URL: `https://dlob.drift.trade`

## Common operations
### Opening a Perpetual Position
1. Use the Drift SDK to construct a `MarketOrderParams` or `LimitOrderParams` object. Set the `marketIndex` (which market to trade), `direction` (`long` or `short`), `baseAssetAmount`, and `price` (for limit orders).
2. Calculate required collateral using the market's initial margin fraction. Query this from the `PerpMarketConfig` for the target market index.
3. Check the user's Drift account health via `getUserAccountPublic(userAccountPubkey)` to ensure sufficient free collateral for the position size.
4. Call `placePerpOrder(params)` via the SDK which returns a Solana transaction. Present the order details (size, direction, leverage, liquidation price) to the user.
5. Submit the transaction via `wallet_sendTransaction` on Solana. Warn the user about perp-specific risks: funding rates, liquidation risk, and the importance of stop-losses.

### Spot Trading
1. List available spot markets via `getSpotMarketAccounts()` to identify the market index for the desired pair.
2. Construct `placeSpotOrder` with `marketIndex`, `direction`, `baseAssetAmount`, and `orderType`.
3. For market orders, the order fills immediately at the best available price. For limit orders, specify the `price` field and `orderType.limit`.
4. Submit via `wallet_sendTransaction`. Spot trades on Drift settle against the user's spot balances, not their perp collateral — ensure the user has deposited the required token.

### Borrow / Lend
1. To lend, first deposit tokens into the Drift spot market via `deposit(amount, spotMarketIndex)`. Lenders earn yield from borrower interest.
2. To borrow, the user must have sufficient collateral deposited. Use `getSpotMarketAccount(spotMarketIndex)` to check the `borrowRate` and maximum borrow capacity.
3. Call `withdraw(amount, spotMarketIndex)` to borrow — if the withdrawal exceeds the user's deposited balance, it automatically creates a borrow position.
4. Repay by calling `deposit(amount, spotMarketIndex)` with the borrowed token to reduce the borrow balance.
5. Always monitor borrow utilization via `spotMarket.depositTokenTotal / spotMarket.borrowTokenTotal` to warn the user about approaching rate kinks.

### Managing Positions
1. Query all open positions via `getUserAccountPublic(userAccountPubkey)` — the response includes `perpPositions` and `spotPositions` arrays.
2. For each perp position, display: unrealized PnL, entry price, mark price, leverage, liquidation price, and funding payments.
3. To close a position, submit a market order in the opposite direction for the full position size.
4. To modify margin, call `modifyPerpCollateral(delta, perpMarketIndex)` to add or remove collateral. Adding collateral lowers leverage and liquidation price; removing increases both.
5. To update a stop-loss or take-profit, use `updatePerpTriggerOrder` with the `triggerPrice` and `triggerCondition` (above or below).

### Funding Rates and Market Data
1. Query current funding rates via `getPerpMarketAccount(marketIndex)` — the `lastFundingRate` and `lastFundingRateTs` fields indicate the current rate and settlement timing.
2. Funding payments are exchanged every hour on Drift. Long positions pay funding when the rate is positive; shorts receive it (and vice versa).
3. Fetch orderbook depth from the Drift DLOB API at `https://dlob.drift.trade/v2/l2?market=<marketName>` for orderbook visualization.
4. Display the current oracle price (`amm.lastOraclePrice`) alongside the mark price (`amm.lastMarkPrice`) to show any premium or discount.
