# Phase A: "Savings Account" Wedge — Design Spec

> **Goal:** Make yield earning discoverable inside the Portfolio tab. One-tap "Earn" / "Manage" actions on token rows. Aave V3 only, USDC + WETH on Base.

**Architecture:** Server reads Aave PoolDataProvider for APYs + positions; client combines portfolio balances with Aave deposits to show savings summary + action buttons. Transactions reuse existing `requestApproval()` → `sendTransactionAsync` flow.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## 1. What We Are Building

Three user-visible features in the **Portfolio tab**:

| Feature | Description |
|---------|-------------|
| **Savings Summary Card** | Fixed card at top of Portfolio. Shows: total savings value (USD), blended APY, yield earned to date. Only appears if user has Aave deposits. |
| **Yield Action on Token Rows** | Each token row (USDC, WETH) gets a secondary action pill: "Earn" (if not deposited) or "Manage" (if deposited). |
| **One-Tap Deposit / Withdraw Sheet** | Bottom sheet triggered from token row. Pre-fills token + max amount. One button to supply to Aave. If already earning, shows current deposit amount + withdraw button. |

## 2. Why This Matters

- **Problem:** Users hold stablecoins in wallet earning 0%. They don't know Aave exists or how to use it.
- **Opportunity:** The Portfolio tab is already the most-visited screen. Adding yield context there meets users where they are.
- **100x Thesis:** "Earn yield on your USDC" is one sentence. Aave tab requires understanding supply, borrow, health factor, etc. This is the narrowest wedge.

## 3. Technical Approach

**Server-side:**
- Reuse existing `/api/aave/positions` (Phase 4) to get user's Aave deposits
- New lightweight endpoint `/api/aave/apy?asset=USDC` returns current supply APY for a single asset (PoolDataProvider `getReserveData`)

**Client-side:**
- `PortfolioView.tsx` (existing lazy panel): Add savings summary card + yield action buttons on token rows
- New `YieldSheet.tsx`: Bottom sheet for deposit/withdraw into Aave for a specific token
- New `useSavings()` hook: Combines portfolio balances + Aave positions to compute "yield-earning value", "idle value", blended APY
- Reuse existing `requestApproval()` flow — no new signing patterns

**Data flow:**
```
User opens Portfolio
  → fetchPortfolioBalances() (existing)
  → fetchAavePositions() (existing Phase 4)
  → fetchAaveApy(asset) for each yield-bearing token
  → useSavings() computes:
      - savingsValue = sum of (aToken balances * token prices)
      - idleValue = wallet balance of yield-bearing tokens (USDC, WETH)
      - blendedApy = weighted average of deposit APYs
  → Render summary card + rows

User taps "Earn" on USDC row
  → Open YieldSheet for USDC
  → User enters amount (default: max idle balance)
  → POST /api/aave/deposit → get calldata
  → store.requestApproval(aavePool, 0, supplyCalldata, chainId, "Aave Supply", "low")
  → TransactionApproval flow signs + broadcasts
  → Sheet closes, Portfolio refreshes positions

User taps "Manage" on USDC row
  → YieldSheet shows: "You have $500 earning 4.2% APY"
  → Withdraw button: POST /api/aave/withdraw → calldata → approval flow
```

## 4. Scope Boundaries

**In Phase A:**
- USDC and WETH only (Aave markets on Base)
- Savings summary card with value, APY, yield earned
- "Earn" / "Manage" actions on token rows
- Deposit and withdraw flows
- Reuse existing Aave V3 supply/withdraw server tools

**Out of Phase A:**
- Auto-deposit / sweep
- Yield history charts
- Savings goals / buckets
- Morpho or other protocols
- Push notifications

## 5. Key UX Flows

**Flow A: First-time yield user**
1. User opens Portfolio, sees "Your USDC is idle" hint on USDC row
2. Taps "Earn" → YieldSheet opens with USDC pre-selected
3. Sees current APY (e.g., "4.2% APY") + amount input (default max)
4. Taps "Deposit" → TransactionApproval screen
5. Confirms in wallet → Success toast → USDC row now shows "Manage"

**Flow B: Existing yield user**
1. User opens Portfolio, sees summary card: "$1,240 earning 4.2% APY • $12 earned"
2. Taps "Manage" on USDC row → YieldSheet shows current deposit + withdraw option
3. Taps "Withdraw" → TransactionApproval → Funds back to wallet

## 6. UI Components

| Component | Location | Notes |
|-----------|----------|-------|
| `SavingsSummaryCard` | `PortfolioView.tsx` | Top card, aggregate savings stats. Hidden when no deposits. |
| `TokenRow` (enhanced) | `PortfolioView.tsx` | Add "Earn" / "Manage" pill button right of balance. |
| `YieldSheet` | `apps/app/src/react-app/domains/wallet/components/` | Bottom sheet, token-specific deposit/withdraw. Lazy loaded. |
| `useSavings` hook | `apps/app/src/react-app/domains/wallet/hooks/` | Combines portfolio + Aave data into savings state. |

## 7. API Changes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/aave/apy` | `GET` | `?asset=USDC\|WETH&chainId=8453` → `{ supplyApy: string }` |
| (existing) `/api/aave/positions` | `GET` | Reused for summary card + token row state |
| (existing) `/api/aave/deposit` | `POST` | Reused for supply calldata |
| (existing) `/api/aave/withdraw` | `POST` | Reused for withdraw calldata |

## 8. Data Model

```typescript
// useSavings return type
interface SavingsState {
  savingsValue: number;       // USD value of all aToken deposits
  idleValue: number;          // USD value of tokens not earning yield
  blendedApy: number;         // Weighted average APY across deposits
  yieldEarned: number;        // Estimated yield earned (placeholder — real calc in future)
  positions: AavePosition[];  // Per-asset deposit info
}

interface AavePosition {
  asset: Address;        // underlying token address
  symbol: string;        // "USDC" | "WETH"
  depositAmount: string; // raw wei in aTokens
  depositValue: number;  // USD
  supplyApy: number;     // current APY from PoolDataProvider
}
```

## 9. Acceptance Criteria

- [ ] Portfolio shows savings summary card when user has Aave deposits
- [ ] Token rows for USDC/WETH show "Earn" (if no Aave deposit) or "Manage" (if deposited)
- [ ] YieldSheet allows deposit into Aave with one tap + approval flow
- [ ] YieldSheet allows withdraw from Aave with one tap + approval flow
- [ ] After deposit/withdraw, Portfolio refreshes automatically
- [ ] APY displayed is real on-chain data from Aave PoolDataProvider
- [ ] Works for both USDC and WETH
- [ ] No `alert()` calls anywhere in the flow
- [ ] `pnpm run -r build` passes with 0 errors
- [ ] E2E tests verify APY endpoint + savings state computation

## 10. MCP Impact

No new MCP tools needed. Phase A is purely client UX. Existing MCP tools (`crypto_aaveDeposit`, `crypto_aaveWithdraw`, `crypto_aavePositions`) are reused.

---

**Spec complete. Ready for implementation plan.**
