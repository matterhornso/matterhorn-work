# Phase A: "Savings Account" Wedge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make yield earning discoverable inside the Portfolio tab with one-tap "Earn" / "Manage" actions on token rows. Aave V3 only, USDC + WETH on Base.

**Architecture:** Server reads Aave PoolDataProvider for APYs; client combines portfolio balances with Aave positions via `useSavings()` hook. Transactions reuse existing `requestApproval()` flow.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## Task 1: Add `/api/aave/apy` Server Endpoint

**Files:**
- Modify: `apps/server/src/tools/aave-v3.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Add `getAaveSupplyApy()` to `aave-v3.ts`**

```typescript
const poolDataProviderAbi = [
  "function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryShares, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 stableBorrowRate, uint256 variableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbackedMintCap, uint128 debtCeiling, uint128 debtCeilingDecimals, uint8 eModeCategory, uint128 borrowCap, uint128 supplyCap, uint40 eModeLabel, uint16 borrowableInIsolation, uint16 flashLoanEnabled)",
] as const;

export async function getAaveSupplyApy({
  chainId,
  asset,
}: {
  chainId: number;
  asset: Address;
}): Promise<{ success: true; supplyApy: string } | { success: false; error: string }> {
  const registry = WHITELISTED_PROTOCOLS[chainId];
  const provider = registry?.aaveV3PoolDataProvider as Address | undefined;
  if (!provider) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const { getClient } = await import("../infra/chain-client.js");
    const client = getClient(chainId);
    if (!client) return { success: false, error: "Chain client not available" };
    const result = await client.readContract({
      address: provider,
      abi: poolDataProviderAbi,
      functionName: "getReserveData",
      args: [asset],
    }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, number, Address, Address, Address, Address, bigint, bigint, bigint, bigint, number, number, number, number, number, number];
    const liquidityRate = result[5]; // index 5 in tuple
    // Aave APR = liquidityRate / RAY (1e27)
    const apy = (Number(liquidityRate) / 1e27) * 100;
    return { success: true, supplyApy: apy.toFixed(2) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "APY read failed" };
  }
}
```

- [ ] **Step 2: Add GET `/api/aave/apy` route in `server.ts`**

Add after existing Aave routes:

```typescript
  addRoute(routes, "GET", "/api/aave/apy", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const asset = ctx.url.searchParams.get("asset") as Address;
    const result = await getAaveSupplyApy({ chainId, asset });
    return jsonResponse(result);
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tools/aave-v3.ts apps/server/src/server.ts
git commit -m "feat: add /api/aave/apy endpoint for supply APY reads"
```

---

## Task 2: Create `useSavings()` Hook

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/hooks/useSavings.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { Address } from "viem";

interface TokenBalance {
  token: Address;
  symbol: string;
  balance: string;
  decimals: number;
  price: number;
}

interface AavePosition {
  asset: Address;
  symbol: string;
  depositAmount: string;
  depositValue: number;
  supplyApy: number;
}

interface SavingsState {
  savingsValue: number;
  idleValue: number;
  blendedApy: number;
  yieldEarned: number;
  positions: AavePosition[];
}

const YIELD_ASSETS = ["USDC", "WETH"];

export function useSavings({
  chainId,
  address,
  balances,
}: {
  chainId?: number;
  address?: Address;
  balances: TokenBalance[];
}): SavingsState {
  const [positions, setPositions] = useState<AavePosition[]>([]);

  const fetchPositions = useCallback(async () => {
    if (!chainId || !address) return;
    try {
      const res = await fetch(`/api/aave/positions?chainId=${chainId}&address=${address}`);
      const posJson = await res.json();
      if (!posJson.success) return;

      // Fetch APY for each yield asset
      const yieldPositions: AavePosition[] = [];
      for (const bal of balances.filter((b) => YIELD_ASSETS.includes(b.symbol))) {
        const apyRes = await fetch(`/api/aave/apy?chainId=${chainId}&asset=${bal.token}`);
        const apyJson = await apyRes.json();
        const supplyApy = apyJson.success ? Number(apyJson.supplyApy) : 0;

        // For now, we don't have per-asset deposit amounts from getUserAccountData
        // Future: read aToken balances directly. For Phase A, show wallet balance as "idle".
        yieldPositions.push({
          asset: bal.token,
          symbol: bal.symbol,
          depositAmount: "0",
          depositValue: 0,
          supplyApy,
        });
      }
      setPositions(yieldPositions);
    } catch {
      /* silent fail */
    }
  }, [chainId, address, balances]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  const savingsValue = positions.reduce((sum, p) => sum + p.depositValue, 0);
  const idleValue = balances
    .filter((b) => YIELD_ASSETS.includes(b.symbol))
    .reduce((sum, b) => {
      const raw = Number(b.balance) / 10 ** b.decimals;
      return sum + raw * b.price;
    }, 0);
  const blendedApy = savingsValue > 0
    ? positions.reduce((sum, p) => sum + p.depositValue * p.supplyApy, 0) / savingsValue
    : 0;

  return {
    savingsValue,
    idleValue,
    blendedApy,
    yieldEarned: 0, // Placeholder — real calculation requires historical tracking
    positions,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/app && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/hooks/useSavings.ts
git commit -m "feat: add useSavings hook combining portfolio + Aave APY data"
```

---

## Task 3: Enhance PortfolioView with Savings Summary Card

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/pages/PortfolioView.tsx`

- [ ] **Step 1: Import useSavings and add summary card**

```typescript
import { useSavings } from "../hooks/useSavings";

// Inside PortfolioView component:
const savings = useSavings({ chainId: state.chainId, address: state.address, balances: portfolio });

// Add at top of return, before token list:
{savings.savingsValue > 0 && (
  <div className="mb-4 rounded-xl bg-dls-surface border border-dls-border p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-dls-secondary">Earning Yield</span>
      <span className="text-sm font-medium text-emerald-400">{savings.blendedApy.toFixed(1)}% APY</span>
    </div>
    <div className="text-2xl font-bold text-dls-text">${savings.savingsValue.toFixed(2)}</div>
    <div className="mt-1 text-xs text-dls-secondary">Across {savings.positions.length} position{savings.positions.length > 1 ? "s" : ""}</div>
  </div>
)}
```

- [ ] **Step 2: Add "Earn" / "Manage" pill to token rows**

For each token row in the list:

```typescript
const position = savings.positions.find((p) => p.asset === token.token);
const hasDeposit = position && Number(position.depositAmount) > 0;

// In the token row JSX, add right-aligned action:
<button
  onClick={() => openYieldSheet(token.symbol)}
  className={cn(
    "ml-auto text-xs font-medium px-2.5 py-1 rounded-full transition-colors",
    hasDeposit
      ? "bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
      : "bg-dls-surface text-dls-secondary hover:text-dls-text border border-dls-border"
  )}
>
  {hasDeposit ? "Manage" : "Earn"}
</button>
```

- [ ] **Step 3: Add state for YieldSheet**

```typescript
const [yieldSheetOpen, setYieldSheetOpen] = useState(false);
const [yieldToken, setYieldToken] = useState<string | null>(null);

const openYieldSheet = (symbol: string) => {
  setYieldToken(symbol);
  setYieldSheetOpen(true);
};
```

- [ ] **Step 4: Run build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/pages/PortfolioView.tsx
git commit -m "feat: add savings summary card + Earn/Manage actions to Portfolio"
```

---

## Task 4: Create YieldSheet Component

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/components/YieldSheet.tsx`

- [ ] **Step 1: Write the YieldSheet component**

```typescript
import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Address } from "viem";

const TOKENS: Record<string, { address: Address; decimals: number; symbol: string }> = {
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" },
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18, symbol: "WETH" },
};

export default function YieldSheet({
  open,
  onOpenChange,
  tokenSymbol,
  chainId,
  address,
  balance,
  depositAmount,
  supplyApy,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tokenSymbol: string | null;
  chainId?: number;
  address?: Address;
  balance: number; // idle balance in token units
  depositAmount: number; // current deposit in token units (0 if none)
  supplyApy: number;
  store: any; // WalletStore — import type properly
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);

  const token = tokenSymbol ? TOKENS[tokenSymbol] : null;
  const isDeposit = mode === "deposit";
  const maxAmount = isDeposit ? balance : depositAmount;

  const handleAction = async () => {
    if (!token || !address || !chainId || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** token.decimals));
      const endpoint = isDeposit ? "/api/aave/deposit" : "/api/aave/withdraw";
      const body = isDeposit
        ? { chainId, asset: token.address, amount: raw, onBehalfOf: address }
        : { chainId, asset: token.address, amount: raw, to: address };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        await store.requestApproval({
          to: json.to,
          value: json.value,
          data: json.data,
          chainId,
          proposedBy: "Aave V3",
          riskLevel: isDeposit ? "low" : "medium",
        });
        onOpenChange(false);
        setAmount("");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-dls-bg border-dls-border">
        <SheetHeader>
          <SheetTitle className="text-dls-text">{token.symbol} Yield</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("deposit")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                mode === "deposit" ? "bg-violet-500 text-white" : "bg-dls-surface text-dls-secondary"
              )}
            >
              Deposit
            </button>
            <button
              onClick={() => setMode("withdraw")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                mode === "withdraw" ? "bg-violet-500 text-white" : "bg-dls-surface text-dls-secondary"
              )}
            >
              Withdraw
            </button>
          </div>

          {supplyApy > 0 && (
            <div className="text-center text-sm text-emerald-400">
              {supplyApy.toFixed(1)}% APY
            </div>
          )}

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-dls-secondary">
              <span>Amount</span>
              <button onClick={() => setAmount(String(maxAmount))} className="text-violet-400">Max: {maxAmount.toFixed(4)} {token.symbol}</button>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`0 ${token.symbol}`}
              className="bg-dls-surface border-dls-border text-dls-text"
            />
          </div>

          <Button
            onClick={handleAction}
            disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
            className="w-full bg-violet-500 hover:bg-violet-600 text-white"
          >
            {loading ? "Processing..." : isDeposit ? `Deposit ${token.symbol}` : `Withdraw ${token.symbol}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire YieldSheet into PortfolioView**

Import and add to PortfolioView return:

```typescript
import YieldSheet from "../components/YieldSheet";

// At bottom of JSX:
<YieldSheet
  open={yieldSheetOpen}
  onOpenChange={setYieldSheetOpen}
  tokenSymbol={yieldToken}
  chainId={state.chainId}
  address={state.address}
  balance={/* idle balance for selected token */}
  depositAmount={/* current deposit for selected token */}
  supplyApy={/* APY for selected token */}
  store={store}
/>
```

- [ ] **Step 3: Run build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/components/YieldSheet.tsx
git add apps/app/src/react-app/domains/wallet/pages/PortfolioView.tsx
git commit -m "feat: add YieldSheet bottom sheet for deposit/withdraw"
```

---

## Task 5: Read Aave aToken Balances for Real Position Data

**Files:**
- Modify: `apps/server/src/tools/aave-v3.ts`
- Modify: `apps/server/src/server.ts`
- Modify: `apps/app/src/react-app/domains/wallet/hooks/useSavings.ts`

- [ ] **Step 1: Add aToken addresses to token registry**

In `apps/server/src/infra/token-registry.ts`, ensure these exist:

```typescript
aaveV3aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
aaveV3aWETH: "0x8437d7c167dFB82ED4Cb79CD44B7a32A1f2951E3",
```

- [ ] **Step 2: Add `getAaveTokenDeposits()` server function**

```typescript
const erc20Abi = [
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
] as const;

export async function getAaveTokenDeposits({
  chainId,
  user,
}: {
  chainId: number;
  user: Address;
}): Promise<{ success: true; deposits: { asset: Address; aToken: Address; amount: string; symbol: string }[] } | { success: false; error: string }> {
  const registry = WHITELISTED_PROTOCOLS[chainId];
  if (!registry) return { success: false, error: `Chain ${chainId} not supported` };
  const deposits = [];
  for (const [symbol, aTokenKey] of [
    ["USDC", "aaveV3aUSDC"],
    ["WETH", "aaveV3aWETH"],
  ] as const) {
    const aToken = registry[aTokenKey as keyof typeof registry] as Address | undefined;
    const underlying = registry[symbol.toLowerCase() as keyof typeof registry] as Address | undefined;
    if (!aToken || !underlying) continue;
    try {
      const { getClient } = await import("../infra/chain-client.js");
      const client = getClient(chainId);
      if (!client) continue;
      const balance = await client.readContract({ address: aToken, abi: erc20Abi, functionName: "balanceOf", args: [user] }) as bigint;
      if (balance > 0n) {
        deposits.push({ asset: underlying, aToken, amount: balance.toString(), symbol });
      }
    } catch {
      /* skip */
    }
  }
  return { success: true, deposits };
}
```

- [ ] **Step 3: Add GET `/api/aave/deposits` route**

```typescript
  addRoute(routes, "GET", "/api/aave/deposits", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const user = ctx.url.searchParams.get("address") as Address;
    const result = await getAaveTokenDeposits({ chainId, user });
    return jsonResponse(result);
  });
```

- [ ] **Step 4: Update `useSavings()` to use real deposit amounts**

Replace placeholder logic:

```typescript
      const depRes = await fetch(`/api/aave/deposits?chainId=${chainId}&address=${address}`);
      const depJson = await depRes.json();
      const deposits = depJson.success ? depJson.deposits : [];

      const yieldPositions: AavePosition[] = [];
      for (const bal of balances.filter((b) => YIELD_ASSETS.includes(b.symbol))) {
        const apyRes = await fetch(`/api/aave/apy?chainId=${chainId}&asset=${bal.token}`);
        const apyJson = await apyRes.json();
        const supplyApy = apyJson.success ? Number(apyJson.supplyApy) : 0;

        const deposit = deposits.find((d: any) => d.symbol === bal.symbol);
        const depositAmount = deposit ? deposit.amount : "0";
        const depositValue = deposit
          ? (Number(deposit.amount) / 10 ** bal.decimals) * bal.price
          : 0;

        yieldPositions.push({
          asset: bal.token,
          symbol: bal.symbol,
          depositAmount,
          depositValue,
          supplyApy,
        });
      }
```

- [ ] **Step 5: Run build + commit**

Run: `pnpm run -r build`
Expected: PASS

```bash
git add apps/server/src/tools/aave-v3.ts apps/server/src/server.ts apps/server/src/infra/token-registry.ts
git add apps/app/src/react-app/domains/wallet/hooks/useSavings.ts
git commit -m "feat: read real aToken balances for savings positions"
```

---

## Task 6: Final Integration + E2E Test

**Files:**
- Create: `scripts/test-phase-a-e2e.ts`
- Modify: `scripts/verify-crypto.sh` (if needed)

- [ ] **Step 1: Write Phase A E2E test**

```typescript
import { test, expect } from "bun:test";

const SERVER = process.env.SERVER_URL || "http://localhost:8787";

test("Aave APY endpoint returns valid APY for USDC", async () => {
  const res = await fetch(`${SERVER}/api/aave/apy?chainId=8453&asset=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(Number(json.supplyApy)).toBeGreaterThan(0);
  expect(Number(json.supplyApy)).toBeLessThan(50); // sanity cap
});

test("Aave deposits endpoint returns array", async () => {
  const res = await fetch(`${SERVER}/api/aave/deposits?chainId=8453&address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8`);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(Array.isArray(json.deposits)).toBe(true);
});
```

- [ ] **Step 2: Run full verification**

Run: `bash scripts/verify-crypto.sh`
Expected: ALL PASS

Run: `pnpm run -r build`
Expected: 0 errors

- [ ] **Step 3: Commit test**

```bash
git add scripts/test-phase-a-e2e.ts
git commit -m "test: add Phase A E2E test suite for savings wedge"
```

---

## Task 7: Final Commit + Branch Push

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: working tree clean

- [ ] **Step 2: Push branch**

```bash
git push origin dev
```

---

## Summary of Commits

| # | Commit | What |
|---|--------|------|
| 1 | `feat: add /api/aave/apy endpoint for supply APY reads` | Server: APY endpoint |
| 2 | `feat: add useSavings hook combining portfolio + Aave APY data` | Client: savings state hook |
| 3 | `feat: add savings summary card + Earn/Manage actions to Portfolio` | PortfolioView enhancements |
| 4 | `feat: add YieldSheet bottom sheet for deposit/withdraw` | YieldSheet component |
| 5 | `feat: read real aToken balances for savings positions` | Real deposit tracking |
| 6 | `test: add Phase A E2E test suite for savings wedge` | Tests |

---

**Plan complete. Ready for execution using superpowers:executing-plans.**
