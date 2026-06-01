# Matterhorn Work: Remaining Build Plan (Revised)

> **Use cases (in order):** (1) Hyperliquid trading strategies / market making, (2) Polymarket prediction market bots
> **Approach:** Agent blueprints inside Matterhorn Work. Not "separate features" — these are the agent skills that run inside the workspace.
> **Status:** ~15-20% complete. Wallet shell exists. Agent is blind to both Hyperliquid and Polymarket.
> **Source material:** `CLAUDE.md`, `scripts/verify-crypto.sh`, Matterhorn-Agent blueprints (`~/matterhorn/Matterhorn-Agent/src/data/blueprints.ts`, `mcpSkills.ts`)

---

## What Has Already Been Built (Verified)

| Item | Status | Evidence |
|------|--------|----------|
| **OpenWork fork → Matterhorn rebrand** | ✅ Complete | All branding replaced |
| **wagmi + viem in `apps/app`** | ✅ Complete | `package.json` has `wagmi:^3.6.15`, `viem:^2.50.4` |
| **Base + Base Sepolia chain config** | ✅ Complete | `infra/wagmi-config.ts` has both chains |
| **Wallet domain (React)** | ✅ Complete | `WalletConnect.tsx`, `WalletPanel.tsx`, `TransactionApproval.tsx`, wallet store with tx history |
| **Session wallet context injection** | ✅ Complete | `SessionContextProvider.tsx` injects address/chain into agent prompt as text |
| **Transaction broadcast pipeline** | ✅ Complete | `TransactionApproval.tsx` → wagmi → receipt UI |
| **Wallet MCP (stub)** | ✅ Skeleton | `packages/matterhorn-work-wallet-mcp/` — 4 tools exist but only return UI prompts. No actual reads. |
| **UI-MCP** | ✅ Complete | Real bridge to OpenWork desktop |
| **24 Web3 skill markdown files** | ✅ Skeletons | `.opencode/skills/web3/*.md` — markdown descriptions, not executable |
| **CLAUDE.md + verify-crypto.sh** | ✅ Complete | Build plan + test script ready |
| **16 Agent blueprints** | ✅ Exists in source | `blueprints.ts` has hyperliquid-mm, prediction-trader, etc. Need to port into app |
| **24 MCP skill definitions** | ✅ Exists in source | `mcpSkills.ts` has hyperliquid, polymarket, etc. Need to port into app |

---

## What Is NOT Built (The Gap)

**The agent cannot do the two things it's supposed to do:**

### Use Case 1: Hyperliquid Trading Strategies
- ✅ Hyperliquid skill markdown exists (`.opencode/skills/web3/`) — but it's just a text description
- ❌ No actual Hyperliquid API client
- ❌ No tools to: fetch orderbook, place orders, manage positions, check perps funding rates
- ❌ Agent cannot say "ETH perp is overfunded, should I short?" and then do it
- ❌ No structured execution: agent can reason, but cannot build a Hyperliquid transaction

### Use Case 2: Polymarket Prediction Market Bots
- ✅ Polymarket skill markdown exists
- ❌ Gamma API client exists in my deleted file only — not in the actual build
- ❌ **Polymarket execution is centralized orderbook.** No smart contract to call. Agent can research markets but cannot actually "place a bet" without Polymarket's internal API (which requires KYC/approval).
- ❌ No tools to research market probabilities from on-chain + social signals

### Cross-Cutting Gaps
- ❌ **Agent is blind.** Cannot read chain state. Cannot call CoinGecko. Cannot check balances. Cannot reason from actual data.
- ❌ **No MCP tools for research.** The 24 skill files are markdown spec sheets. The agent reads them as text but has no callable tools.
- ❌ **Server-side chain client missing.** `SessionContextProvider.tsx` builds a context string. The agent reads it but cannot act on it.

---

## Subsystem 1: Server-Side Chain Client (P0)

**Goal:** Agent can read the chain. Check balances. Read contract state. Know what wallet is connected.

### 1.1 viem PublicClient in Server
- **Where:** `apps/server/src/infra/viem-client.ts`
- **What:** `createPublicClient({ chain: base, transport: http() })` — reads only
- **Why:** Agent needs real data, not prompt strings
- **Effort:** 1-2 days
- **Tasks:**
  - Install `viem` in `apps/server/package.json` (if not already)
  - Create `viem-client.ts` with Base + Base Sepolia `PublicClient` factories
  - Read RPC URL from env var or public endpoint
  - Add read-only helper: `getBalance(address)`, `readContract({...})`

### 1.2 Token Registry (Port from matterhorn-lite)
- **Where:** `apps/app/src/react-app/infra/contracts.ts` (already exists per verify-crypto.sh)
- **What:** USDC addresses, ERC-20 ABI, WETH, common tokens
- **Source:** Port constants from `~/matterhorn/matterhorn-lite/lib/wagmi.ts`
- **Already verified:** `verify-crypto.sh` passes USDC address + decimals checks
- **Effort:** 0.5 day (porting)

### 1.3 MCP Tools for Reads
- **Where:** `packages/matterhorn-work-wallet-mcp/index.mjs` (needs upgrade from stub)
- **What:** Add real RPC calls to existing stub tools:
  - `wallet_getBalance` → call `eth_getBalance` + `balanceOf` for USDC
  - `wallet_readContract` → new tool, calls arbitrary contract reads (e.g., `latestRoundData` on Chainlink, `slot0` on Uniswap V3)
- **Effort:** 2-3 days
- **Why:** The agent must read before it acts. Cannot propose a trade without knowing balances.

---

## Subsystem 2: Crypto Research MCP Server (P0)

**Goal:** Agent can look up prices, funding rates, yields, and market data.

### 2.1 CoinGecko Integration
- **What:** `crypto_search`, `crypto_price`, `crypto_trending`
- **Where:** New MCP server or inline function tools in `apps/server/`
- **Free tier:** 10-30 calls/min — sufficient for one user
- **Effort:** 1-2 days

### 2.2 DeFiLlama Integration (Yield + TVL)
- **What:** `/pools` for Base yield, `/yields` for protocol comparison
- **Why:** Agent needs to know "where's the best yield?" before suggesting deposits
- **Effort:** 1 day

### 2.3 Hyperliquid API Client (P0 — Use Case 1)
- **What:**
  - `hyperliquid_getMarkets` → list tradable perp markets
  - `hyperliquid_getFundingRates` → current funding rates by market
  - `hyperliquid_getOrderbook` → bids/asks for a market
  - `hyperliquid_getPositions` → user's open positions
  - `hyperliquid_placeOrder` → build a signed order (requires Arbitrum L1 key signature)
- **API:** Hyperliquid has a public API. No API key needed for reads. Writes require L1 signature.
- **Effort:** 3-5 days (the signing mechanism for Hyperliquid orders is non-trivial — it's not a simple ETH transfer)
- **Challenge:** Hyperliquid uses its own order format signed with an Arbitrum L1 key. The agent needs to know how to sign with the user's wallet. This is NOT a standard EVM transaction.

### 2.4 Polymarket Gamma API (P0 — Use Case 2)
- **What:**
  - `polymarket_search` → find markets by keyword
  - `polymarket_getOdds` → current YES/NO prices per market
  - `polymarket_getMarketDetails` → volume, liquidity, end date, description
- **API:** Gamma API is public. No key needed for reads.
- **Execution reality:** Polymarket is a **custodial orderbook** (not a DEX). The agent can:
  - ✅ Research markets, prices, probabilities
  - ❌ Cannot autonomously place a bet (requires Polymarket account, KYC, USDC deposit to their custody)
- **Therefore:** For the wedge, agent researches and **suggests** manual action. Full execution requires Polymarket's broker API (requires whitelisting).
- **Effort:** 1-2 days (research only)

---

## Subsystem 3: Transaction Building + Execution (P0)

### 3.1 Swap Routing (1inch)
- **What:** `crypto_buildSwap`: params = chainId, from, to, amount, slippage → returns raw TX
- **Where:** Same as research (MCP or inline)
- **API key needed:** Yes. `ONEINCH_API_KEY` env var.
- **Effort:** 2-3 days

### 3.2 Transaction Simulation
- **What:** Before showing Approve button, simulate the TX. Show estimated output + gas. If it reverts, warn user.
- **Where:** `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx` (extend)
- **Effort:** 2-3 days

### 3.3 Hyperliquid Order Building (P0 — Unique Challenge)
- **What:** Hyperliquid orders are NOT standard EVM transactions. The workflow is:
  1. User signs an L1 action (Arbitrum) → this authorizes Hyperliquid's L2
  2. Order is placed via API + L2 signature
  3. Settlement happens on Hyperliquid's own chain
- **Approach:** For the wedge, agent can research funding rates and suggest "go long ETH" but cannot execute on Hyperliquid without building a custom signing flow.
- **Alternative:** Hyperliquid has a bridge where you deposit from Arbitrum. The agent could build an Arbitrum deposit transaction (standard EVM), which the user approves. But the perp trading itself is off-chain in Hyperliquid's system.
- **Hard truth:** Full autonomous Hyperliquid trading is far more complex than a DEX swap. It requires:
  - Understanding Hyperliquid's order format (not standard ABI)
  - L1 + L2 signatures
  - Orderbook API integration (not smart contract calls)
- **Effort for research:** 1-2 days
- **Effort for full execution:** 2-3 weeks (post-wedge)

---

## Subsystem 4: Agent Blueprints + Marketplace (P0 scaffold, P2 real)

**Current state:** `blueprints.ts` and `mcpSkills.ts` exist in the Matterhorn-Agent source. Need to port into Matterhorn Work.

### 4.1 Port Blueprints into App
- **Where:** `apps/app/src/react-app/domains/settings/data/agent-blueprints.ts`
- **What:** Port all 16 blueprints from `~/matterhorn/Matterhorn-Agent/src/data/blueprints.ts`
- **Include:** hyperliquid-mm, prediction-trader, yield-hunter, mev-sentinel, etc.
- **Effort:** 1-2 days

### 4.2 Port MCP Skills into App
- **Where:** `apps/app/src/react-app/domains/settings/data/mcp-skills.ts`
- **What:** Port all 24 skills from `~/matterhorn/Matterhorn-Agent/src/data/mcpSkills.ts`
- **Include:** hyperliquid, polymarket, coingecko, chainlink, uniswap-v5, aave-v3, etc.
- **Effort:** 1-2 days

### 4.3 Marketplace UI
- **Where:** `apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx`
- **Current:** `verify-crypto.sh` mentions this file but it may be empty
- **What:** Browse blueprints, filter by category (trading, defi, analytics), hire an agent (in-memory for now)
- **Effort:** 3-5 days

---

## Subsystem 5: System Prompt Engineering (P0)

**Current:** Wallet context is a plain string. Agent ignores it.

### 5.1 Structured System Prompt
- **Where:** `apps/app/src/react-app/shell/session-route.tsx` or `apps/opencode-router/`
- **What:** Replace the plain text injection with a structured prompt that tells the agent:
  - "These are your tools: [list]"
  - "When the user asks about trading, follow this flow: check balances → research market → compare options → propose action → wait for approval"
  - "Always reason out loud before proposing a transaction"
- **Effort:** 3-5 days (iterative — requires live testing)

### 5.2 Prompt Variants by Use Case
- **Trading mode:** "You are a quantitative trading analyst..."
- **DeFi mode:** "You are a yield optimization strategist..."
- **Prediction mode:** "You are a probabilistic forecaster..."
- **Effort:** 2-3 days

---

## Subsystem 6: Security (P1 — Do Before Mainnet)

- Max transaction spend limits
- Protocol whitelist (no random contracts)
- Testnet default (Base Sepolia)
- Audit trail
- **Effort:** 5-7 days

---

## Total Revised Effort Estimate

| Subsystem | Effort | Priority | Notes |
|-----------|--------|----------|-------|
| 1. Server-Side Chain Client | 3-5 days | P0 | Balance reading is foundational |
| 2. Crypto Research Tools | 2-3 days | P0 | CoinGecko + DeFiLlama |
| 3. Swap Execution (1inch) | 3-5 days | P0 | Standard DEX routing |
| 3b. **Hyperliquid Research** | 2-3 days | P0 | Funding rates, orderbook, positions |
| 3c. **Hyperliquid Execution** | 2-3 weeks | P2 | Complex signing, not a standard swap |
| 3d. **Polymarket Research** | 1-2 days | P0 | Market search + odds |
| 4. Port Blueprints + Skills | 2-3 days | P0 | Copy from source, wire into UI |
| 5. System Prompt Engineering | 5-8 days | P0 | Iterative, critical for usability |
| 6. Security | 5-7 days | P1 | Before mainnet |
| 7. Marketplace UI | 3-5 days | P2 | After core loop works |
| **Total (P0 only)** | **4-5 weeks** | | Ship "agent researches + proposes" for both use cases |
| **Total (P0 + Hyperliquid exec)** | **7-8 weeks** | | Ship full Hyperliquid trading |
| **Total (full vision)** | **3 months** | | Every blueprint works |

---

## Use Case 1: Hyperliquid (The Hard One)

**What works today:** Nothing.
**What the agent can do after P0:**
- "Show me ETH perp funding rate" → calls Hyperliquid API → returns "ETH is paying 0.003% every 8 hours to longs, meaning shorts are expensive to hold"
- "What are the top funding rate opportunities?" → ranks all markets by rate → proposes a trade
- "I want to short ETH perp" → researches → proposes → **user manually goes to Hyperliquid** (until execution is built)

**What works after P2:**
- "Short ETH perp with $500" → agent builds Hyperliquid order → user approves L1 signature → order placed → position confirmed

## Use Case 2: Polymarket (The Impossible One to Fully Automate)

**What works today:** Nothing.
**What works after P0:**
- "Show me crypto prediction markets" → calls Gamma API → returns "Will BTC be above $100K by end of year? YES 67%, NO 33%, volume $12M"
- "What's the best value bet today?" → agent compares odds vs. probability estimates → proposes a market
- **User manually places bet on polymarket.com**

**Why Polymarket execution is not a reasonable P0:**
- USDC must be deposited to Polymarket's custody (Gnosis Safe on Polygon)
- KYC/account required
- No public smart contract for placing bets — it's a centralized orderbook
- Full execution requires Polymarket's private broker API (requires approval/whitelisting)
- The 30% "agent wallets" on Polymarket are run by teams with direct API access, not via an MCP tool

**The wedge:** Research + recommendation only. For Polymarket, the agent is a research assistant, not a trader. This is still valuable for use case 2.

---

## Updated Bottom Line

The two use cases have wildly different execution difficulty:

- **Hyperliquid:** Hard but possible. Requires custom order signing (not standard EVM). Research is easy; execution is complex.
- **Polymarket:** Easy to research; impossible to execute autonomously without Polymarket's private API.

**P0 should be:**
1. Agent can research **both** use cases (Hyperliquid funding rates, Polymarket odds)
2. Agent can propose actions with one-click approval for on-chain execution (swap via 1inch)
3. Agent blueprints are ported and visible in the UI
4. Hyperliquid execution is researched and scoped, built in P2
5. Polymarket remains research-only (but the research is genuinely useful)

**This is not "building the whole project." It's building a research + recommendation engine with optional execution for on-chain actions only.** Hyperliquid and Polymarket are inputs to the agent's strategy. The actual perp trade and prediction bet may require the user to use the native platform — but the agent did the analysis.

That is still "Cowork for Web3." The cowork is the agent sitting next to you, crunching data and proposing moves. You still click "approve."
