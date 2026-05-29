# Lido

## What this skill does
Lido is the leading liquid staking protocol allowing users to stake ETH and receive stETH, a liquid staking token that accrues staking rewards and can be used across DeFi. This skill teaches an AI agent how to stake and unstake ETH, manage stETH/wstETH positions, and integrate Lido's tokens into DeFi workflows.

## Supported chains
- Ethereum

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum | stETH | 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 |
| Ethereum | wstETH | 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0 |
| Ethereum | WithdrawalQueue | 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1 |
| Ethereum | Lido DAO (Governance) | 0x2e59A20f205bB85a89C53f1936454680651E618e |
| Ethereum | stETH Oracle | 0x442af784A788A5bd6F42A01Ebe9F287a871243fb |

## Common operations
### Staking ETH
1. The simplest way to stake is by sending ETH directly to the stETH contract's `submit()` function with a referral address (use `0x0000000000000000000000000000000000000000` for no referral). The user receives stETH 1:1 minus any validator entry queue delay.
2. Alternatively, encode the `submit(referral)` function call on the stETH contract, attaching the desired ETH value in the transaction. No approval is needed since native ETH is used.
3. Submit via `wallet_sendTransaction`. The transaction value specifies the amount of ETH to stake. Confirm the returned stETH balance after the transaction.
4. Check the current staking APR via the Lido API at `https://eth-api.lido.fi/v1/protocol/steth/apr/sma` for a simple moving average APR. Present this to the user before staking.
5. The amount of stETH received may be slightly less than the ETH sent if the protocol has a negative rebase due to validator penalties — though this is extremely rare.

### Wrapping to wstETH
1. stETH uses a rebasing mechanism where balances increase automatically. wstETH is a non-rebasing wrapper that tracks stETH value through a changing exchange rate rather than changing balances.
2. To wrap stETH to wstETH, encode `wrap(amount)` on the wstETH contract. First approve the wstETH contract to spend the user's stETH.
3. To unwrap wstETH back to stETH, encode `unwrap(amount)` on the wstETH contract.
4. Query the current stETH/wstETH exchange rate via `getStETHByWstETH(1000000000000000000)` to get how much stETH 1 wstETH represents. Use `stEthPerToken()` or `tokensPerStEth()` for precise conversions.
5. Always recommend wstETH for DeFi integrations (lending pools, yield aggregators) since most protocols expect non-rebasing tokens. stETH is better for simple holding since balances grow automatically.

### Unstaking / Withdrawing
1. stETH can be swapped to ETH on any DEX (e.g., Curve stETH/ETH pool, Uniswap, 1inch) for instant exits. This is the fastest method but may have slippage.
2. For native unstaking (1:1), use the WithdrawalQueue. Encode `requestWithdrawals(amounts, owner)` where `amounts` is an array of requested withdrawal amounts and `owner` is the recipient.
3. The WithdrawalQueue processes requests in order as validators exit the Beacon Chain. The exit queue length varies with network conditions — check current queue length and estimated wait time via `https://eth-api.lido.fi/v1/protocol/steth/withdrawals/queue`.
4. To claim completed withdrawals, encode `claimWithdrawals(requestIds)` on the WithdrawalQueue. Each request ID corresponds to a previously submitted withdrawal request.
5. Check claimable status via `getWithdrawalStatus(requestIds)` on the WithdrawalQueue. Only claim when the status returns `0` (ready to claim). Status `1` means the request is still pending in the queue.

### Integrating stETH in DeFi
1. Use stETH as collateral on Aave V3/V4 — supply stETH (not wstETH for Aave V3) and borrow against it. Monitor the LTV and liquidation threshold for stETH collateral.
2. Provide liquidity to the Curve stETH/ETH pool for additional yield plus swap fees. This is a concentrated liquidity strategy with low impermanent loss risk since stETH and ETH are highly correlated.
3. Restake stETH on EigenLayer for additional yield (see the EigenLayer skill for restaking operations).
4. Use stETH in Pendle to split into PT and YT for fixed or leveraged yield (see the Pendle skill).
5. Check the current Lido APR vs. restaked APR vs. DeFi yield to help the user decide the optimal strategy for their stETH.
