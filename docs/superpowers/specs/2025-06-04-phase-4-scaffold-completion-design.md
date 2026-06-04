# Matterhorn Work — Phase 4 Scaffold Completion Design Spec

> **Date:** 2025-06-04
> **Sub-project:** D — Complete the Scaffolding (Foundation Layer)
> **Goal:** Replace all `alert("Implementation pending")` stubs with real on-chain contract execution for Aave V3, Across Bridge, and CoW Swap.

---

## 1. Problem Statement

The Phase 3 UI panels for Aave, Bridge, and CoW Swap are **visual scaffolding only**. Every action button triggers `alert()` with no actual contract call. This blocks all downstream product wedges (A: Savings, B: Send Money, C: Agent Workspace) because they depend on real on-chain execution.

## 2. Success Criteria

- [ ] Aave Panel: Maria can supply USDC, see aUSDC balance, withdraw, borrow, and repay — all via real Aave V3 Pool contract calls
- [ ] Bridge Panel: Maria can get a real Across quote, deposit USDC from Base → Arbitrum, and track fill status
- [ ] CoW Swap Panel: Maria can get a quote, sign an EIP-712 order, and submit it to CoW Protocol
- [ ] All panels return real TX hashes, show confirmation states, and auto-refresh balances
- [ ] No `alert()` calls remain in any protocol panel
- [ ] All new contracts are whitelisted in `token-registry.ts`
- [ ] MCP v0.6 exposes all new tools
- [ ] Full E2E test suite passes

## 3. Architecture

### 3.1 Pattern: Server Builds Calldata, Client Signs & Broadcasts

Every protocol follows the same execution model already proven by `swap-builder.ts` and `TransactionApproval.tsx`:

```
UI Panel ──fetch()──> Server API Route ──> Server Tool ──> viem (read/build calldata)
   │                                                        │
   │                                                        │
   │<──{ calldata, to, value, chainId }<────────────────────┘
   │
   └──> requestTx({ to, data, value }) ──> wagmi sign + broadcast
```

**Security invariant:** Server never holds private keys. Client signs with user's wallet via wagmi.

### 3.2 File Responsibility Map

| File | Responsibility |
|------|---------------|
| `apps/server/src/tools/aave-v3.ts` | Build `supply/withdraw/borrow/repay` calldata; read `getUserAccountData` |
| `apps/server/src/tools/bridge.ts` | Query Across API for quotes; build `depositV2` calldata |
| `apps/server/src/tools/cow-swap.ts` | Already exists — extend with `signTypedData` helper |
| `apps/server/src/server.ts` | Add 8 new API routes |
| `apps/server/src/infra/token-registry.ts` | Add Aave Pool + aToken + Across SpokePool addresses |
| `apps/app/src/react-app/domains/wallet/pages/AavePanel.tsx` | Wire to real API; replace `alert()` |
| `apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx` | Wire to real API; replace `alert()` |
| `apps/app/src/react-app/domains/wallet/pages/CowSwapPanel.tsx` | Wire `signTypedData` via wagmi |
| `packages/matterhorn-work-crypto-mcp/index.mjs` | Add MCP v0.6 tools |

## 4. Protocol Designs

### 4.1 Aave V3 on Base

**Contracts (Base mainnet):**
- Pool: `0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994`
- PoolDataProvider: `0x2d8A4C8D072cE092016652604A8fe5bE43e67b48`
- aUSDC: `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB`

**ABI snippets (minimal):**
```typescript
const poolAbi = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
] as const;
```

**API Routes:**
- `POST /api/aave/deposit` → body: `{ chainId, asset, amount, onBehalfOf }` → returns `{ success, tx: { to: Pool, data: supplyCalldata, value: 0 } }`
- `POST /api/aave/withdraw` → body: `{ chainId, asset, amount, to }`
- `POST /api/aave/borrow` → body: `{ chainId, asset, amount, interestRateMode, onBehalfOf }`
- `POST /api/aave/repay` → body: `{ chainId, asset, amount, interestRateMode, onBehalfOf }`
- `GET /api/aave/positions?chainId=&address=` → returns `{ totalCollateral, totalDebt, availableBorrows, healthFactor, assets: [{ asset, aTokenBalance, borrowBalance, supplyAPY, borrowAPY }] }`

**UI Flow (Deposit):**
1. User selects USDC, types "100"
2. Panel fetches `POST /api/aave/deposit` with `{ chainId, asset: USDC, amount: 100000000, onBehalfOf: userAddress }`
3. Server builds `supply(USDC, 100000000, userAddress, 0)` calldata
4. Panel calls `store.requestTx({ to: Pool, data: calldata, value: 0 })`
5. wagmi opens wallet prompt → user signs
6. Panel polls receipt → shows "Deposit confirmed" + aUSDC balance
7. Auto-refetch positions via `GET /api/aave/positions`

### 4.2 Across Protocol Bridge

**API:** `https://across.to/api/suggested-fees` + `https://across.to/api/limits`

**Contract (Base SpokePool):** `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64`

**API Routes:**
- `GET /api/bridge/quote?originChainId=&destinationChainId=&originToken=&amount=&recipient=` → returns `{ fee, time, totalSent, receiveAmount, quoteId }`
- `POST /api/bridge/deposit` → body: `{ originChainId, destinationChainId, originToken, amount, recipient, quoteId }` → returns `{ success, tx: { to: SpokePool, data: depositV2Calldata, value: fee } }`

**UI Flow:**
1. User selects Base → Arbitrum, USDC, "50"
2. Panel calls `GET /api/bridge/quote`
3. Server queries Across API → returns real fee/time estimate
4. User taps "Bridge"
5. Panel calls `POST /api/bridge/deposit` → gets calldata
6. `requestTx({ to: SpokePool, data, value: fee })` → user signs
7. Panel shows "Deposited to Across" + fill tracking link

### 4.3 CoW Swap Execution

**Missing piece:** EIP-712 signing. The quote and order building already work. We need `signTypedData` integration.

**wagmi hook:** `useSignTypedData()` from `@wagmi/core` or `useSignTypedData` from wagmi hooks

**UI Flow:**
1. User gets quote (already works)
2. Taps "Submit Order"
3. Panel builds EIP-712 typed data from quote
4. Calls `signTypedData(domain, types, message)` → gets signature
5. Calls `POST /api/cow/order` with `{ order, signature }`
6. Server submits to CoW `/api/v1/orders`
7. Returns `orderId` + explorer URL

## 5. MCP v0.6 Tool Additions

```javascript
// New tools added to crypto MCP
"crypto_aaveDeposit",
"crypto_aaveWithdraw",
"crypto_aaveBorrow",
"crypto_aaveRepay",
"crypto_aavePositions",
"crypto_bridgeQuote",
"crypto_bridgeDeposit"
```

## 6. Testing Strategy

| Test | What It Checks |
|------|---------------|
| `verify-crypto.sh` | All files exist, TypeScript passes, Vite builds |
| `test-phase-4-e2e.ts` | API routes respond with correct shape, calldata is valid hex, MCP lists new tools |
| Manual | Deposit 0.01 USDC on Base Sepolia Aave, verify aUSDC received |

## 7. Risk Mitigation

- **Test on Base Sepolia first** — never mainnet for dev
- **All contract addresses whitelisted** — prevent accidental interaction with malicious contracts
- **Server returns calldata only** — client must sign; no server-side key exposure
- **Approval manager used for ERC-20** — Aave supply requires `approve(Pool, amount)` first; UI checks allowance and triggers approval TX if needed

## 8. Out of Scope (for this sub-project)

- Fiat on-ramp (Feature A wedge)
- Cross-chain intent routing optimization (Feature B wedge)
- Workspace context awareness (Feature C wedge)
- Batch execution sequencing (already works in `defi-batcher.ts`)
- Smart wallet / account abstraction (future phase)

---

**Next step:** Writing-plans skill to create the implementation plan.
