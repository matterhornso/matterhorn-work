# Matterhorn Work — Feature Roadmap + Bundle Optimization Plan

> Compiled from deep web research (competitive landscape, emerging standards, user pain points) + bundle audit findings.

---

## Bundle Audit Summary

| Metric | Current | Target | Grade |
|--------|---------|--------|-------|
| Total JS raw | **13.85 MB** | < 2 MB | 🔴 F |
| Initial gzipped | **~1.23 MB** | < 400 KB | 🔴 F |
| JS chunks | **308** | < 50 | 🔴 F |
| Largest chunk | 3.7 MB | < 500 KB | 🔴 F |

**Root cause:** `shiki` imports `bundledLanguages` → 308 grammar files (~10-11 MB raw, ~3 MB gzipped)

**Quick win:** Fix Shiki imports → drops to ~3-4 MB total, ~500 KB initial (grade F → B)

---

## Feature Matrix (25 Features)

### 🔴 P0 — Must Have (Small/Medium Effort, High Impact)

| # | Feature | Source | Effort | Why It Matters |
|---|---------|--------|--------|----------------|
| 1 | **Token Approval Manager** (revoke.cash API) | User pain point | Small | #1 exploit vector after phishing; agents need to clean up old approvals |
| 2 | **Transaction Calldata Decoder** (4byte.directory) | User pain point | Small | "Swap 100 USDC for WETH" > raw hex; builds trust |
| 3 | **ENS Name Resolution** | UX best practice | Small | Human-friendly addresses; reduces copy-paste errors |
| 4 | **Real-Time Gas Estimator** (Blocknative/Etherscan) | User pain point | Small | Users need USD cost before signing; agents optimize timing |
| 5 | **One-Click Multi-Step DeFi Batching** (Permit2 + multicall) | User pain point | Medium | Eliminate "approve → swap → deposit" UX friction |
| 6 | **Portfolio Tracker** (DeBank API) | User pain point | Medium | Full exposure view enables smarter agent decisions |
| 7 | **RainbowKit-Grade Wallet UX** | RainbowKit | Small | First-time users judge by connection flow; reduces drop-off |
| 8 | **MEV-Protected Batch Auction Routing** (CoW Protocol) | CoW Protocol | Medium | Agents are vulnerable to MEV; batch auctions protect users |
| 9 | **Gasless Intent-Based Orders** (UniswapX / Permit2) | UniswapX | Medium | Agents don't need ETH for gas; Dutch auction fillers compete |
| 10 | **Embedded Wallet Policy Engine** (Privy patterns) | Privy | Medium | Programmable spending limits, authorized contracts, co-signers |
| 11 | **Shiki Bundle Fix** | Audit finding | Small | 70% bundle size reduction; critical for performance |
| 12 | **Manual Chunks + Vite Config** | Audit finding | Small | Better caching, clearer attribution |
| 13 | **Lazy-Load Wallet Provider** | Audit finding | Small | wagmi/viem off initial chunk |

### 🟡 P1 — Should Have (Medium/Large Effort, Strategic)

| # | Feature | Source | Effort | Why It Matters |
|---|---------|--------|--------|----------------|
| 14 | **Price Alert + Automated Triggers** (DexScreener API) | MCP tool opp | Small | Converts workspace from reactive to proactive |
| 15 | **Wallet Event Monitor** (Alchemy Webhooks) | MCP tool opp | Medium | Proactive alerts for transfers, liquidations, approvals |
| 16 | **ERC-7710 Smart Contract Delegation** | Emerging standard | Medium | Long-lived, policy-bound agent permissions without repeated signing |
| 17 | **Fiat Onramp/Offramp Widget** (MoonPay/Stripe) | User pain point | Small | Non-crypto users can fund wallets with debit card |
| 18 | **Jupiter Solana Integration** | Jupiter | Medium | Expand beyond EVM to Solana DeFi |
| 19 | **Cross-Chain Bridging Abstraction** (Across/Stargate) | User pain point | Large | Agent handles bridge selection; user sees unified ETA + fee |
| 20 | **Permissionless Copy-Trading Vaults** | Drift Protocol | Large | Publish agent strategies; others deposit to follow |

### 🟢 P2 — Nice to Have (Large Effort or Niche)

| # | Feature | Source | Effort | Why It Matters |
|---|---------|--------|--------|----------------|
| 21 | **Zodiac Role-Based Execution Policies** | Gnosis Guild | Large | Granular agent control: time delays, spending limits, function-level ACL |
| 22 | **Cross-Chain Intents (ERC-7683)** | Emerging standard | Large | Protocol-agnostic cross-chain orders |
| 23 | **Social Signal Integration** (Farcaster Frames) | Farcaster | Medium | Trading signals from Web3 social graphs |
| 24 | **Automated Tax Transaction Tagging** | User pain point | Medium | Year-round compliance; export CSV |
| 25 | **On-Chain Reputation (EAS / WorldID)** | Emerging standard | Large | Verified builder reputation for marketplace |

---

## Implementation Phases

### Phase 1: Bundle Fix + P0 Quick Wins (Week 1)
**Goal:** Fix performance crisis + add 5 small features.

| Task | File(s) | Effort |
|------|---------|--------|
| Fix Shiki imports (whitelist 15 languages) | `markdown.tsx` | 2 hrs |
| Add `manualChunks` to Vite | `vite.config.ts` | 1 hr |
| Lazy-load wallet provider | `providers.tsx` | 2 hrs |
| Token Approval Manager | `wallet-store.ts`, `WalletPanel.tsx` | 4 hrs |
| ENS Resolution | `WalletPanel.tsx`, `TransactionApproval.tsx` | 3 hrs |
| Calldata Decoder | `TransactionApproval.tsx` | 3 hrs |
| Gas Estimator | `wallet-store.ts`, `TransactionApproval.tsx` | 3 hrs |

**Deliverable:** Bundle drops to ~3-4 MB, 6 new security/UX features.

---

### Phase 2: Core Agentic Capabilities (Weeks 2-3)
**Goal:** Multi-step batching, portfolio tracking, MEV protection, gasless intents.

| Task | File(s) | Effort |
|------|---------|--------|
| Multi-Step DeFi Batching (Permit2 + multicall) | `swap-builder.ts`, `TransactionApproval.tsx` | 3 days |
| Portfolio Tracker (DeBank API) | `WalletPanel.tsx` | 2 days |
| MEV-Protected Routing (CoW Protocol) | `swap-builder.ts` | 2 days |
| Gasless Intent Orders (UniswapX) | `swap-builder.ts`, MCP | 2 days |
| Embedded Wallet Policies | `wallet-store.ts` | 2 days |
| RainbowKit UX polish | `WalletConnect.tsx` | 1 day |

**Deliverable:** Agent can execute complex DeFi flows with one click, full portfolio view, MEV protection.

---

### Phase 3: Proactive + Cross-Chain (Weeks 4-5)
**Goal:** Price alerts, event monitoring, cross-chain bridging, Solana support.

| Task | File(s) | Effort |
|------|---------|--------|
| Price Alert + Triggers (DexScreener) | `wallet-store.ts`, MCP | 2 days |
| Wallet Event Monitor (Alchemy) | `wallet-store.ts`, MCP | 2 days |
| Fiat Onramp Widget | `WalletPanel.tsx` | 1 day |
| Cross-Chain Bridging (Across/Stargate) | `swap-builder.ts`, MCP | 3 days |
| Jupiter Solana Integration | `swap-builder.ts`, MCP | 2 days |
| ERC-7710 Delegation | `wallet-store.ts`, MCP | 2 days |

**Deliverable:** Agent is proactive (alerts, triggers), cross-chain capable, multi-ecosystem.

---

### Phase 4: Marketplace + Advanced (Weeks 6-8)
**Goal:** Copy-trading vaults, social signals, tax, reputation.

| Task | File(s) | Effort |
|------|---------|--------|
| Copy-Trading Vaults | `marketplace-store.ts`, smart contracts | 1 week |
| Social Signal Integration (Farcaster) | MCP server | 3 days |
| Tax Transaction Tagging | `wallet-store.ts` | 2 days |
| Zodiac Policies | `wallet-store.ts`, smart contracts | 1 week |
| On-Chain Reputation (EAS) | `marketplace-store.ts` | 3 days |

---

## Top 5 Immediate Actions (This Week)

1. **Fix Shiki bundle** — 70% size reduction, single file change
2. **Add Token Approval Manager** — highest security ROI
3. **Add Calldata Decoder** — highest trust/transparency ROI
4. **Add ENS Resolution** — essential human-friendly UX
5. **Add Gas Estimator** — required for any automated execution

---

## Verification Checklist Per Phase

- [ ] `pnpm typecheck` passes (app + server)
- [ ] `pnpm build` passes (app + server)
- [ ] `verify-crypto.sh` passes (48/48)
- [ ] `e2e-crypto-test.ts` passes (20/20)
- [ ] Bundle size measured and documented
- [ ] New features have test coverage
- [ ] Security audit log updated

---

*Document generated: 2025-06-03*
*Sources: Competitive analysis (CoW, UniswapX, Drift, Jupiter, Privy, RainbowKit), emerging standards (ERC-7710, ERC-7683, ERC-7856), user pain points, MCP tooling landscape, bundle audit findings.*
