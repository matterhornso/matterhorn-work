# Uniswap V5

## What this skill does
Uniswap V5 is a decentralized exchange (DEX) enabling token swaps, liquidity provision, and concentrated liquidity position management. This skill teaches an AI agent how to encode and submit swap, add/remove liquidity, and position management transactions.

## Supported chains
- Ethereum
- Base
- Arbitrum
- Optimism

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Universal Router | 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD |
| Base | Router | 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24 |
| Ethereum | Universal Router | 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD |
| Arbitrum | Universal Router | 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD |
| Optimism | Universal Router | 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD |

## Common operations
### Swap
1. Determine the input token, output token, and amount using the user's wallet address via `eth_getBalance` or `eth_call` on the token contract for balance and allowance.
2. Encode the swap using the Universal Router's `execute` function with the appropriate command bytes (`0x00` for V2-style swap, `0x08` for V3-style exact input single, `0x09` for V3-style exact output single). Use the `InputTokenOptions` and `OutputTokenOptions` ABI encoding to build the command parameters.
3. Gas considerations — always get user approval first. Quote the swap through the Quoter contract to estimate `amountOutMin` and apply a 0.5%–1% slippage buffer.
4. Submit via `wallet_sendTransaction` with the encoded calldata targeting the Universal Router. Remind the user that the token must have sufficient allowance for the router address.

### Provide Liquidity
1. Determine the token pair, fee tier, and price range for the concentrated liquidity position.
2. Encode the mint/burn commands (`0x0c` for add liquidity, `0x0d` for remove liquidity) via the Universal Router's `execute` function, passing encoded parameters for token amounts, fee tier, tick lower, tick upper, and deadlines.
3. Check existing position via `positions(tokenId)` on the Position Manager contract to determine whether to mint a new position or increase an existing one.
4. Submit via `wallet_sendTransaction`. Remind the user that both tokens must have sufficient allowances for the router and that the position exposes them to impermanent loss.

### Position Management
1. Query all positions for a wallet using `tokenOfOwnerByIndex` on the Position Manager contract to enumerate token IDs.
2. For a given position, call `positions(tokenId)` to read liquidity, fee growth, tokens owed, tick range, and pool address.
3. To collect fees, encode the `collect` action (`0x0e`) via the Universal Router with the token IDs and recipient address.
4. To migrate or re-allocate, remove liquidity, then add liquidity at the new price range. Consider batching via `multicall` to execute both steps atomically.
5. Always present the user with current position value, uncollected fees, and the gas cost before submitting any transaction.
