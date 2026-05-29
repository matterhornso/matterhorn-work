# deBridge

## What this skill does
deBridge is a cross-chain bridge enabling fast token transfers and arbitrary message passing across 15+ EVM chains and Solana with fixed-fee pricing and near-instant finality. This skill teaches an AI agent how to bridge tokens cross-chain, track transfers, and use deBridge's interoperability infrastructure.

## Supported chains
- Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Fantom, Gnosis, Linea, Scroll, zkSync Era, Solana, and 3+ more (15+ total)

## Contract addresses
| Chain | Contract | Address |
|-------|----------|---------|
| Ethereum | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| Base | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| Arbitrum | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| Optimism | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| Polygon | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| BNB Chain | deBridgeGate | 0x43dE2d77BF8027e25dBD179B2610A5A5B4dC38A6 |
| Solana | deBridge Program | debridge-program (Solana program address) |

deBridge API: `https://api.dln.trade` for the DLN (deBridge Liquidity Network) trading API.

## Common operations
### Bridging Tokens
1. Use the deBridge API to generate a cross-chain transaction. The API handles routing through the deBridge network of validators and optional DLN for instant settlement.
2. Query available routes and fees: `https://api.debridge.finance/api/estimation` with the source chain, destination chain, token address, and amount. The response includes the estimated output amount, fee, and estimated time.
3. For EVM-to-EVM transfers, the high-level flow is:
   a. Approve the deBridgeGate contract to spend the source token.
   b. Encode `send(smartContractId, tokenAddress, receiver, amount, chainIdTo)` where `smartContractId` is the token's registered bridge ID and `chainIdTo` is the destination chain ID (e.g., 1 for Ethereum, 8453 for Base, 42161 for Arbitrum).
   c. Submit the transaction via `wallet_sendTransaction` on the source chain.
4. For Solana-to-EVM transfers, the deBridge Solana program handles the transfer. Use the deBridge SDK/wallet interface to sign the Solana transaction, which emits a message picked up by the deBridge validators and relayed to the destination EVM chain.
5. Present the complete cost to the user: "Bridging 100 USDC from Ethereum to Base will cost approximately $2.50 in gas + 0.04% deBridge fee ($0.04). You will receive approximately 99.96 USDC on Base in 1-3 minutes."

### Tracking Cross-Chain Transfers
1. Each deBridge transfer has a `submissionId` returned after the `send` transaction is confirmed. Track it via the deBridge Explorer at `https://explorer.debridge.finance` or the API.
2. Query transfer status: `https://api.debridge.finance/api/status/<submissionId>` returns the current state: `pending` (awaiting validator confirmation), `confirmed` (validators signed off), `claiming` (relayer is executing on destination), `claimed` (completed), or `failed`.
3. deBridge uses an off-chain group of validators (elected by the DAO) who sign cross-chain messages. Typically 8/12 validators must sign before a message is relayed to the destination chain.
4. If the destination claim fails (e.g., due to gas issues or receiver contract reverting), the transfer can be manually claimed or rescued by calling `claim(submissionId)` on the destination deBridgeGate.
5. The relayer (a bot that submits signed messages to the destination chain) handles gas on the destination side. The user does not need to submit a destination transaction for standard transfers.

### Using DLN (deBridge Liquidity Network)
1. DLN provides instant cross-chain swaps within seconds by using a network of market makers who pre-fund liquidity on each chain. This eliminates validator confirmation latency.
2. To use DLN, call the DLN API at `https://api.dln.trade/v1.0/quote` with the source chain, destination chain, token addresses, and amount. DLN returns multiple quotes from competing market makers.
3. DLN quotes are typically more expensive for the taker (wider spread) but are instant. Standard deBridge (non-DLN) is cheaper but takes 1-3 minutes for validator consensus.
4. DLN is ideal for: (a) time-sensitive operations (arbitrage, liquidation rescue), (b) small amounts where instant settlement outweighs fee savings, (c) chains with fast validator rounds (Base, Arbitrum).
5. Standard deBridge is better for: (a) large transfers where saving 0.1-0.5% matters, (b) non-urgent transfers, (c) transfers to chains with slower finality where the validator round time dominates anyway.

### Multi-Chain Message Passing (deBridge Framework)
1. deBridge supports sending arbitrary calldata between chains (not just token transfers). This enables cross-chain function calls — e.g., "bridge USDC and deposit into Aave on the destination chain in one transaction."
2. Encode a `sendMessage` call on the source deBridgeGate: specify the `targetContract` (destination contract address), `data` (calldata to execute), and the destination chain ID. Optionally include token transfer in the same message.
3. On the destination chain, the receiver contract must implement the `deBridgeReceiver` interface with a `receiveMessage` function that processes the cross-chain calldata.
4. deBridge charges a per-message protocol fee (fixed USD amount, adjustable by governance) in addition to gas costs and token transfer fees. Query the current protocol fee via the API.
5. This feature enables use cases like: cross-chain governance (vote on Arbitrum DAO from Ethereum), cross-chain yield strategies (auto-compound across chains), and cross-chain NFT actions (buy on Ethereum, automatically bridge to Polygon for gaming).

### Gas and Fee Estimation
1. deBridge protocol fee: a fixed fee per transfer, charged in the source chain's native token (ETH, MATIC, BNB, etc.) or stablecoins depending on the configuration. Query via the API `https://api.debridge.finance/api/protocolFee`.
2. Source chain gas: the user pays gas for the `send` transaction on the source chain. This is a standard EVM transaction fee (variable based on network congestion).
3. Validator fees: deBridge validators charge a small percentage (typically 0.04%) as compensation. This is deducted from the bridged amount.
4. Destination gas: covered by the deBridge relayer infrastructure. The user does not pay destination gas for standard transfers. If a manual claim is needed (rare), the user would pay destination gas.
5. DLN fees: no validator fee, but the market maker spread (typically 0.05-0.2%) is the effective cost. Present both options to the user with time and cost comparisons.

### Solana Integration
1. deBridge supports Solana as both a source and destination chain, making it one of the few bridges connecting Solana to the EVM ecosystem.
2. Solana-side interactions go through the deBridge Solana program, not the EVM deBridgeGate. Use the deBridge web app or SDK to construct Solana transactions for bridging.
3. When bridging from Solana to EVM, the user signs a Solana transaction that transfers tokens to the deBridge program. The validators observe this on Solana and relay the signed message to the EVM destination chain.
4. When bridging from EVM to Solana, the standard EVM `send` method is used. The deBridge relayer submits the Solana transaction on the destination side, minting wrapped tokens or releasing from the program's reserves.
5. Solana bridging typically takes 2-5 minutes due to Solana's faster block times (400ms) and the validator round trip. Always confirm the Solana token's wrapped address on the destination EVM chain to avoid incorrect token contracts.
