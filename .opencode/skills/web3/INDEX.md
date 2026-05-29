# Web3 Skills Index

A catalog of MCP skills for AI agents to interact with DeFi protocols, DePIN networks, and crypto infrastructure.

---

## DeFi (Decentralized Finance)

### DEX & Swaps
- [**Uniswap V5**](./uniswap-v5.md) -- Decentralized exchange for token swaps, liquidity provision, and concentrated liquidity position management across Ethereum, Base, Arbitrum, and Optimism.
- [**Jupiter**](./jupiter.md) -- Solana's leading DEX aggregator for token swaps, limit orders, and dollar-cost averaging (DCA).
- [**1inch**](./oneinch.md) -- DEX aggregation protocol routing swaps across 12+ EVM chains through hundreds of liquidity sources for optimal pricing.
- [**CoW Protocol**](./cow-protocol.md) -- Intent-based DEX aggregation with batch auctions and MEV protection, executing orders through solver competition.

### Lending & Borrowing
- [**Aave V4**](./aave-v4.md) -- Decentralized lending protocol for supplying assets to earn yield, borrowing against collateral, and managing loan positions.

### Yield & Liquid Staking
- [**Lido**](./lido.md) -- Leading liquid staking protocol for staking ETH and receiving stETH, a yield-bearing liquid token usable across DeFi.
- [**Pendle**](./pendle.md) -- Yield tokenization protocol splitting yield-bearing assets into Principal Tokens (PT) and Yield Tokens (YT) for fixed and leveraged yield exposure.

---

## Derivatives & Trading

- [**Drift Protocol**](./drift.md) -- Solana-based decentralized derivatives exchange offering perpetual futures, spot trading, and borrow/lend markets.
- [**Polymarket**](./polymarket.md) -- World's largest prediction market platform where users trade outcome shares on real-world events using the Conditional Tokens Framework on Polygon.

---

## Staking & Restaking

- [**EigenLayer**](./eigenlayer.md) -- Ethereum restaking protocol enabling users to deposit LSTs to secure additional networks (AVSs) and earn additional yield.

---

## Infrastructure & Data

### Oracles & Data
- [**Chainlink**](./chainlink.md) -- Decentralized oracle network providing price feeds, verifiable randomness (VRF), and cross-chain interoperability (CCIP) across all major EVM chains.
- [**The Graph**](./the-graph.md) -- Decentralized indexing protocol for querying blockchain data through subgraphs using GraphQL across 40+ networks.

### Storage
- [**Arweave**](./arweave.md) -- Permanent decentralized storage network where data is stored forever with a single upfront payment using the AR token.
- [**Filecoin**](./filecoin.md) -- Decentralized storage marketplace with cryptographic proofs ensuring data integrity and verifiable storage deals.

### Cross-Chain
- [**deBridge**](./debridge.md) -- Cross-chain bridge enabling fast token transfers and arbitrary message passing across 15+ EVM chains and Solana.

---

## DePIN (Decentralized Physical Infrastructure Networks)

### Compute
- [**Render Network**](./render.md) -- DePIN for GPU compute, connecting GPU node operators with users needing rendering and AI inference power.
- [**Akash Network**](./akash.md) -- DePIN for cloud compute providing a decentralized marketplace for container deployments via reverse auction at significantly lower costs.

### Connectivity
- [**Helium**](./helium.md) -- DePIN for wireless connectivity deploying community-owned hotspot networks for IoT (LoRaWAN) and 5G mobile coverage.
- [**Livepeer**](./livepeer.md) -- Decentralized video transcoding network distributing transcoding tasks across a network of node operators for cost-effective streaming.

---

## Payments & Infrastructure

### Payments
- [**USDC Transfer**](./usdc-transfer.md) -- Send USDC to any address on Base or Base Sepolia using ERC-20 transfer transactions that require user approval in the wallet panel.
- [**x402 Payments**](./x402.md) -- HTTP-native micropayment protocol enabling pay-per-call API access with automatic USDC settlement on Base using HTTP 402 Payment Required.
- [**RBF Protocol**](./rbf-protocol.md) -- Automated recurring billing and subscription payments on Base using smart contract-based payment streams.

### Treasury & Insurance
- [**Neon Treasury**](./neon-treasury.md) -- DAO treasury management infrastructure for automated disbursements, multi-signature controls, and treasury operations.
- [**CoverAgent**](./cover-agent.md) -- On-chain insurance coverage for autonomous AI agents, protecting against smart contract exploits, operational failures, and key compromise losses.
- [**Escrow3**](./escrow3.md) -- Smart escrow agreements on Base enabling trustless deposits, conditional release, and dispute resolution for peer-to-peer transactions.

---

## Quick Reference by Chain

| Chain | Protocols |
|-------|-----------|
| **Ethereum** | Uniswap V5, Aave V4, Lido, Pendle, EigenLayer, Chainlink, CoW Protocol, 1inch, deBridge, Livepeer, Render, Neon Treasury, CoverAgent |
| **Base** | Uniswap V5, Aave V4, Pendle, Chainlink, CoW Protocol, 1inch, deBridge, RBF Protocol, Neon Treasury, CoverAgent, Escrow3, x402 |
| **Arbitrum** | Uniswap V5, Aave V4, Pendle, Chainlink, CoW Protocol, 1inch, deBridge, Livepeer |
| **Optimism** | Uniswap V5, Aave V4, Chainlink, CoW Protocol, 1inch, deBridge |
| **Polygon** | Polymarket, 1inch, deBridge, Chainlink |
| **Solana** | Jupiter, Drift, Helium, deBridge, Render |
| **Gnosis** | CoW Protocol, 1inch, Chainlink |
| **Filecoin** | Filecoin |
| **Arweave** | Arweave |
| **Akash** | Akash Network |
