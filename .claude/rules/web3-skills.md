# Feature 4: Web3 Skill Pack

**Priority:** P1 — depends on Features 1 + 2 + 3

## Goal

24 MCP skills that teach the agent how to interact with DeFi protocols. Each skill is a markdown file in `.opencode/skills/web3/`. The agent discovers and invokes them when the user asks for DeFi actions.

## Dependencies

- Feature 3 (TX Pipeline) — skills need the wallet MCP to execute transactions

## Skill Format

Each skill is a self-contained markdown file:

```markdown
# <Protocol Name>

## What this skill does
[One sentence about the protocol and what the agent can do with it]

## Supported chains
- [Chain 1]
- [Chain 2]

## Contract addresses (per chain)
| Chain | Contract | Address |
|-------|----------|---------|
| Base | Router | 0x... |
| Arbitrum | Router | 0x... |

## Common operations
### Swap
1. [Steps to execute a swap]
2. [How to encode the function call]
3. [Gas considerations]

### Stake/Supply
1. [Steps]
2. [Encoding]

### Bridge
1. [Steps]
2. [Destination chain details]
```

## Task 4.1: Create 24 Web3 skill files

Based on the skill definitions from Matterhorn-Agent's `mcpSkills.ts`, create these files under `.opencode/skills/web3/`:

1. `uniswap-v5.md` — Swap, provide liquidity, manage positions on Uniswap V5. Chains: Ethereum, Base, Arbitrum, Optimism.
2. `aave-v4.md` — Supply, borrow, repay on Aave V4. Unified liquidity, soft liquidations. Chains: Ethereum, Base, Arbitrum, Optimism, Monad.
3. `jupiter.md` — Token swaps, limit orders, DCA on Solana via Jupiter.
4. `drift.md` — Perpetual trading, spot, borrow/lend on Solana via Drift.
5. `polymarket.md` — Prediction market trading: buy/sell shares, check odds. Chain: Polygon.
6. `eigenlayer.md` — Restaking: deposit LSTs, delegate to operators, manage restaked positions. Chain: Ethereum.
7. `pendle.md` — Yield tokenization: trade Principal Tokens (PT) and Yield Tokens (YT). Chains: Ethereum, Arbitrum.
8. `lido.md` — Liquid staking: stake ETH, get stETH, unstake. Chain: Ethereum.
9. `cow-protocol.md` — Intent-based DEX aggregation with MEV protection. Chains: Ethereum, Gnosis, Arbitrum.
10. `oneinch.md` — DEX aggregation for best swap routes across 12+ chains.
11. `chainlink.md` — Oracle data feeds: read price feeds, trigger conditions. Chains: All major EVM chains.
12. `the-graph.md` — Index and query blockchain data via subgraphs.
13. `arweave.md` — Permanent decentralized storage: upload and retrieve data.
14. `livepeer.md` — Decentralized video transcoding and streaming.
15. `helium.md` — DePIN wireless network: check coverage, manage hotspots.
16. `render.md` — DePIN GPU compute: rent GPU power, check availability.
17. `filecoin.md` — Decentralized storage: store and retrieve data, check deals.
18. `akash.md` — DePIN cloud compute: deploy containers, check provider pricing.
19. `debridge.md` — Cross-chain bridge: transfer assets across chains. 15+ chains supported.
20. `rbf-protocol.md` — Recurring billing protocol: set up recurring payments. Chain: Base.
21. `neon-treasury.md` — Treasury management: manage DAO treasuries, automate disbursements.
22. `cover-agent.md` — Insurance coverage: buy/sell coverage, check claim status.
23. `escrow3.md` — Smart escrow: create escrow agreements, release funds on conditions. Chain: Base.
24. `x402.md` — On-chain payment protocol: pay-per-call API access. Chain: Base.

For each skill, include at minimum:
- One sentence description
- List of supported chains
- 2-3 common operations with steps
- Key contract addresses (use well-known deployed addresses; mark unknown ones with `0x...` placeholder)
- Any special encoding requirements

## Task 4.2: Create skill index

**Create `.opencode/skills/web3/INDEX.md`:**

A catalog the agent can load to discover what's available:

```markdown
# Web3 Skill Catalog

## DeFi
- [Uniswap V5](uniswap-v5.md) — Swap, LP, position management
- [Jupiter](jupiter.md) — Solana swaps, limit orders, DCA
- [1inch](oneinch.md) — Multi-chain DEX aggregation
- [Cow Protocol](cow-protocol.md) — Intent-based swaps, MEV protection
- [Pendle](pendle.md) — Yield tokenization
- [Aave V4](aave-v4.md) — Lending and borrowing

## Derivatives & Trading
- [Drift](drift.md) — Perpetuals, spot, borrow/lend (Solana)
- [Polymarket](polymarket.md) — Prediction markets (Polygon)

## Staking & Restaking
- [Lido](lido.md) — Liquid staking (Ethereum)
- [EigenLayer](eigenlayer.md) — Restaking (Ethereum)

## Infrastructure & Data
- [Chainlink](chainlink.md) — Oracle price feeds
- [The Graph](the-graph.md) — Blockchain data indexing

## DePIN
- [Akash](akash.md) — Cloud compute
- [Helium](helium.md) — Wireless network
- [Render](render.md) — GPU compute
- [Livepeer](livepeer.md) — Video transcoding
- [Filecoin](filecoin.md) — Storage
- [Arweave](arweave.md) — Permanent storage

## Payments & Infrastructure
- [RBF Protocol](rbf-protocol.md) — Recurring billing (Base)
- [x402](x402.md) — Pay-per-call API access (Base)
- [Neon Treasury](neon-treasury.md) — Treasury management
- [CoverAgent](cover-agent.md) — Insurance coverage
- [Escrow3](escrow3.md) — Smart escrow (Base)

## Bridges
- [deBridge](debridge.md) — Cross-chain asset transfers
```

## Task 4.3: Test skill discovery

Ask the agent: "What Web3 skills do you have available?" — it should list skills from `.opencode/skills/web3/`.

Ask: "Find the best stablecoin yield on Arbitrum" — agent should load Aave and/or Pendle skills and propose a yield strategy.

## Task 4.4: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/web3-skills
git add .opencode/skills/web3/
git commit -m "feat: 24 Web3 skill pack — DeFi, DePIN, payments, staking"
git push origin feat/web3-skills
```
