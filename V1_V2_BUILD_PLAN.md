# V1 + V2 Build Plan

> Dense plan. No filler. Exact files. Build order matters.

---

## PRINCIPLE: Server Does Work, UI Approves

All chain reads, API calls, and tx building happen in `apps/server`.
UI only: chat, wallet connect, approve/reject buttons, receipt display.
Agent asks → Server builds → UI shows "Approve" → User clicks → wagmi signs.

---

## V1: Core Engine (Weeks 1–4)

### Phase A: Server Chain Client (Days 1–4)

| File | Purpose |
|------|---------|
| `apps/server/src/infra/chain-client.ts` | `viem` `PublicClient` for Base 8453 + Sepolia 84532. Read-only. |
| `apps/server/src/infra/token-registry.ts` | Static map: `USDC`, `WETH`, `cbETH` addresses + decimals per chain. |
| `apps/server/src/tools/chain-tools.ts` | MCP-style tools: `getBalance(address)`, `readContract({abi,address,fn,args})`. |

**Pattern:** Use `viem` `createPublicClient({ chain: base, transport: http() })`.

```ts
// chain-client.ts
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
export const baseClient = createPublicClient({ chain: base, transport: http() });
```

### Phase B: Research Tools (Days 5–8)

| File | Purpose |
|------|---------|
| `apps/server/src/tools/api-client.ts` | Generic `fetch` wrapper with timeout + rate-limit backoff. |
| `apps/server/src/tools/coingecko.ts` | CoinGecko free tier: `searchCoins(query)`, `getPrices(ids[])`, `trending()`. Cache 15s. |
| `apps/server/src/tools/defillama.ts` | DeFiLlama: `getYields(chain, protocol)`, `getPools(chain)`. Cache 60s. |

**Key:** No key required for free tier used here. >10 calls/min handled by cache.

### Phase C: Swap Builder (Days 9–14)

| File | Purpose |
|------|---------|
| `apps/server/src/tools/swap-builder.ts` | `buildSwap({chainId,from,to,amount,fromAddress,slippage})`. Calls 1inch API. |
| `apps/server/src/tools/transaction-simulation.ts` | `simulateTransaction(rawTx)` → `viem.simulateContract` or `eth_call`. |

**1inch flow:**
```
1. Server calls 1inch `/swap/v6.0/{chainId}/swap` with `disableEstimate: true`
2. Returns { to, data, value, gas }
3. Server formats: { action: "swap", tx: {...}, summary: "Swap 0.5 ETH → ~1,247 USDC" }
4. → UI renders "Approve" button
5. User clicks → wagmi sends tx
```

**Error handling:** 1inch API key missing → agent says "I need a 1inch API key." Insufficient liquidity → agent proposes different route.

### Phase D: Wallet MCP Upgrade (Days 15–18)

Current wallet MCP is a stub. Upgrade to real reads + structured response.

| Tool | Before | After |
|------|--------|-------|
| `wallet_connect` | "check UI" | Real: no-op, UI handles |
| `wallet_getBalance` | "check UI" | Real: `baseClient.getBalance({address})` + `readContract(USDC, balanceOf)` |
| `wallet_readContract` | ❌ Missing | New: { abi, address, fn, args } → returns raw value |
| `wallet_sendTransaction` | Emits stderr | Structured: returns `{ tx, summary, needs_approval: true }` |

**File:** `packages/matterhorn-work-wallet-mcp/index.mjs` (rewrite ~40%)

### Phase E: System Prompt (Days 19–21)

| File | Purpose |
|------|---------|
| `apps/server/src/prompts/crypto-system-prompt.ts` | When session detects crypto keywords, injects: tool list + reasoning rules. |

**Rule set (injected as text):**
```
When the user asks about crypto:
1. Call wallet_getBalance to know what they have.
2. Call coingecko to get current prices.
3. Compare options. Explain your thinking in chat.
4. If proposing a swap, call swap-builder first.
5. If simulation fails, warn user. Do NOT show Approve button.
6. Always wait for user approval before spending money.
```

**Integration point:** `apps/app/src/react-app/shell/session-route.tsx` — append prompt when wallet connected.

### Phase F: End-to-End (Days 22–28)

Build checklist:
- [ ] Agent asks "what should I buy?" → gets balances → gets prices → compares → proposes swap
- [ ] User clicks Approve → tx signs → receipt shown → balances update
- [ ] Agent asks "where's the best yield?" → DefiLlama → proposes Aave/Morpho
- [ ] Agent asks "trending coins?" → CoinGecko → returns list
- [ ] All error paths handled: no balance, no API key, rate limit, simulation fail

### V1 Deliverable

Agent is no longer blind. It can research, reason, and execute (with approval).

---

## V2: Hyperliquid + Polymarket (Weeks 5–8)

### Hyperliquid (Weeks 5–7)

**Reality:** Hyperliquid is a perp DEX on its own L1. Not EVM. Orders require Arbitrum L1 signatures for L2 settlement.

#### Phase V2-A: Research Layer (Days 1–3)

| File | Purpose |
|------|---------|
| `apps/server/src/tools/hyperliquid-research.ts` | Public API wrapper. No key needed for reads. |

**Tools:**
- `hl_getMarkets()` → perp symbols, status, max leverage
- `hl_getFundingRates(symbol)` → 8-hour funding, annualized
- `hl_getOrderbook(symbol)` → bids/asks depth
- `hl_getPositions(user)` → open positions, notional, entry price, unrealized PnL
- `hl_getAccountSummary(user)` → margin, available balance, account value

**Key endpoint:** `https://api.hyperliquid.xyz/info` (POST, JSON-RPC style)

#### Phase V2-B: Execution Layer (Days 4–10)

**Hard part:** Signing.

Hyperliquid uses dual-signature:
1. **L1 key** (Arbitrum) — proves ownership of the user account
2. **L2 signature** — signs the actual order on Hyperliquid's chain

**Flow:**
```
Agent proposes: "Short ETH perp, $500 notional, 5x leverage"
Server calls hl_buildOrder({ ... }) → gets unsigned order JSON
Server calls hl_signOrder({ ... }) → needs user's private key
PROBLEM: The agent's MCP server does NOT have the private key.
```

**Solution: Agent initiates, user signs.**

| Component | Flow |
|-----------|------|
| Server | Builds order JSON. Displays: "Short ETH-PERP, $500 @ $3,420, 5x leverage." |
| UI `TransactionApproval.tsx` | New variant: shows order JSON + "Sign with Wallet" button |
| wagmi | Signs a redemption message (L1 proof) via `signMessage` |
| Server | Sends signed order to Hyperliquid API |
| Server | Confirms: position opened or rejected |

**File additions:**
- `apps/server/src/tools/hyperliquid-execution.ts` — `buildOrder`, `submitOrder`
- `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx` — add `HL_ORDER` approval variant
- `packages/matterhorn-work-wallet-mcp/index.mjs` — add `wallet_signMessage` support for L1 proofs

**Why this is 2–3 weeks:** Signing is custom. Hyperliquid's format isn't standard. Need:
- Order hashing (SHA3/Keccek)
- Arbitrum L1 key → L2 identity mapping
- API error handling (rate limit, invalid leverage, insufficient margin)

### Polymarket (Weeks 7–8)

**Reality:** Polymarket is a **custodial orderbook on Polygon**. Not a DEX.

| Capability | Feasibility |
|-----------|-------------|
| Research (search, odds, volume) | ✅ Easy. Gamma API is public. |
| Execution (place bet, withdraw) | 🔴 Impossible without Polymarket's private broker API and KYC/deposits. |

**Scope for V2:** Research only. Agent is a research assistant.

| File | Purpose |
|------|---------|
| `apps/server/src/tools/polymarket-research.ts` | Gamma API wrapper |

**Tools:**
- `pm_searchEvents(query)` → markets by keyword
- `pm_getMarket(eventId)` → YES/NO prices, volume, liquidity, end date
- `pm_getOrderbook(marketId)` → best bid/ask

**No execution.** When user says "bet on Polymarket":
- Agent researches → finds best market → calculates edge → says **"Go to polymarket.com/event/{id} and buy YES at {odds}. Here's why..."**

This is still valuable. It's a research copilot.

---

## Files Changed Summary

### New Files
```
apps/server/src/infra/chain-client.ts
apps/server/src/infra/token-registry.ts
apps/server/src/tools/chain-tools.ts
apps/server/src/tools/api-client.ts
apps/server/src/tools/coingecko.ts
apps/server/src/tools/defillama.ts
apps/server/src/tools/swap-builder.ts
apps/server/src/tools/transaction-simulation.ts
apps/server/src/prompts/crypto-system-prompt.ts
apps/server/src/tools/hyperliquid-research.ts
apps/server/src/tools/hyperliquid-execution.ts
apps/server/src/tools/polymarket-research.ts
```

### Modified Files
```
apps/server/package.json          (+ viem dependency)
apps/app/package.json             (already has wagmi/viem)
apps/app/src/react-app/shell/session-route.tsx  (+ prompt injection)
packages/matterhorn-work-wallet-mcp/index.mjs     (+ real reads)
packages/matterhorn-work-wallet-mcp/package.json (+ viem dependency)
```

### No Changes To
```
apps/desktop/         (nothing — it's just the Electron shell)
apps/opencode-router/   (already routes to server)
packages/ui/           (nothing — shared components)
```

---

## Build Order (Sequential — Don't Skip)

1. **Day 1:** Add `viem` to `apps/server/package.json`. Write `chain-client.ts`. Verify: `node -e "import('./dist/chain-client.js').then(m => m.baseClient.getBlockNumber().then(console.log))"`
2. **Day 2:** Write `token-registry.ts`. Test: `node -e "import('./dist/token-registry.js').then(m => console.log(m.USDC_BY_CHAIN[8453]))"`
3. **Day 3:** Write `api-client.ts`. Test: fetch `https://api.coingecko.com/api/v3/ping`, verify 200.
4. **Days 4–6:** Write CoinGecko + DefiLlama tools. Test: search for "ethereum", get prices, get Base yields.
5. **Days 7–10:** 1inch swap builder. Get API key. Test: build swap ETH→USDC on Base Sepolia.
6. **Days 11–13:** Transaction simulation. Test: simulate swap before showing Approve.
7. **Days 14–16:** Rewrite wallet MCP for real chain reads. Test: MCP responds with actual balance.
8. **Days 17–19:** System prompt injection. Test: agent starts using tools when asked crypto questions.
9. **Days 20–21:** End-to-end. Fix broken paths. Run `verify-crypto.sh`.
10. **Days 22–24:** Hyperliquid research tools. Test: get ETH perp funding rate.
11. **Days 25–30:** Hyperliquid execution. Build order signing. Test: open test position on Arbitrum.
12. **Days 31–33:** Polymarket research tools. Test: search for "crypto" events.
13. **Days 34–35:** Final integration, error polish, rate limit handling.

**Total: ~5 weeks for V1+V2 (extremely focused one engineer).**

---

## Token-Saving Notes

- No full code blocks in this plan. One-liners enough for pattern.
- No explanations of "why" — file + purpose is enough.
- No fallback discussion. One approach per subsystem.
- The plan assumes the reader knows React, viem, wagmi, MCP, TypeScript.
- For precise API shapes, read the source files in this plan, not docs.
