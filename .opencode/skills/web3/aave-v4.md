# Aave V4

## What this skill does
Aave V4 is a decentralized lending protocol enabling users to supply assets to earn yield, borrow against collateral, and repay loans. This skill teaches an AI agent how to construct supply, borrow, repay, and collateral management transactions.

## Supported chains
- Ethereum
- Base
- Arbitrum
- Optimism

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Pool | 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 |
| Ethereum | Pool | 0x87870Bca3F3fD6335C3F4ce8392D693826fE9f4A |
| Arbitrum | Pool | 0x794a61358D6845594F94dc1DB02A252b5b4814aD |
| Optimism | Pool | 0x794a61358D6845594F94dc1DB02A252b5b4814aD |

## Common operations
### Supply
1. Verify the user's wallet holds the asset and the asset is listed on Aave V4 by querying `getReserveData(asset)` on the Pool contract. Confirm the reserve is active and not frozen.
2. Check the user's current allowance for the Pool contract via `allowance(user, poolAddress)` on the underlying token.
3. If allowance is insufficient, prompt the user to approve the Pool contract. Encode and submit the ERC-20 `approve` call first.
4. Encode `supply(asset, amount, onBehalfOf, referralCode)` where `onBehalfOf` is typically the user's address and `referralCode` is 0 unless a referral is intended.
5. Submit via `wallet_sendTransaction` targeting the Pool contract. Inform the user they will receive aTokens in return, representing their supplied position plus accrued yield.

### Borrow
1. Query the user's current collateral health via `getUserAccountData(user)` on the Pool contract. Parse `totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`, `currentLiquidationThreshold`, `ltv`, and `healthFactor`.
2. Confirm the target asset is available for borrowing using `getReserveData(asset)` — check `isActive`, `borrowingEnabled`, and `availableLiquidity`.
3. Encode `borrow(asset, amount, interestRateMode, referralCode, onBehalfOf)` where `interestRateMode` is `1` for stable or `2` for variable (variable is typically recommended unless the user wants rate predictability).
4. Warn the user of the health factor impact before submitting. Use the formula: `newHealthFactor = (totalCollateralBase * ltv) / (totalDebtBase + borrowAmountInBase)`.
5. Submit via `wallet_sendTransaction` targeting the Pool contract. Remind the user that if the health factor drops below 1.0, their position becomes eligible for liquidation.

### Repay
1. Query current debt via `getUserReserveData(asset, user)` on the Pool contract to retrieve `currentVariableDebt` and `currentStableDebt`.
2. Check allowance for the underlying asset (or aToken if using collateral) against the Pool contract.
3. Encode `repay(asset, amount, interestRateMode, onBehalfOf)` where `interestRateMode` is `1` for stable debt or `2` for variable debt. Pass `type(uint256).max` for `amount` to repay the full balance.
4. Submit via `wallet_sendTransaction` targeting the Pool contract. Confirm the resulting health factor improvement.

### Withdraw
1. Query the user's supplied balance via `getUserReserveData(asset, user)` and confirm withdrawal would not cause a liquidation by checking `getUserAccountData(user)` with the reduced collateral amount.
2. Encode `withdraw(asset, amount, to)` where `to` is the recipient address.
3. Submit via `wallet_sendTransaction` targeting the Pool contract.

### Rate Switching
1. For users with stable debt, switching to variable (or vice versa) uses `swapBorrowRateMode(asset, interestRateMode)`.
2. Query current market rates via `getReserveData(asset)` — compare `currentStableBorrowRate` and `currentVariableBorrowRate` to determine if a switch is cost-effective.
3. Submit via `wallet_sendTransaction` targeting the Pool contract.
