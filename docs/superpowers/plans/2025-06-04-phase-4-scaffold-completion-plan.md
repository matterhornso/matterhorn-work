# Phase 4 Scaffold Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `alert("Implementation pending")` stubs with real on-chain contract execution for Aave V3, Across Bridge, and CoW Swap.

**Architecture:** Server tools build calldata using viem; client signs and broadcasts via wagmi. Same pattern as existing `swap-builder.ts`. All contract addresses whitelisted.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## Task 1: Add Aave V3 Contract Addresses to Token Registry

**Files:**
- Modify: `apps/server/src/infra/token-registry.ts`

- [ ] **Step 1: Add Aave V3 Base mainnet addresses**

```typescript
// Add to WHITELISTED_PROTOCOLS[8453]
aaveV3Pool: "0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994",
aaveV3PoolDataProvider: "0x2d8A4C8D072cE092016652604A8fe5bE43e67b48",
aaveV3aUSDC: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
aaveV3aWETH: "0x8437d7c167dFB82ED4Cb79CD44B7a32A1f2951E3",
```

- [ ] **Step 2: Add Across Protocol SpokePool address**

```typescript
acrossSpokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
```

- [ ] **Step 3: Run build check**

Run: `cd /Users/thebiglebowski/matterhorn-work && pnpm run -r build`
Expected: PASS (0 errors)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/infra/token-registry.ts
git commit -m "feat: add Aave V3 and Across Protocol addresses to whitelist"
```

---

## Task 2: Create Aave V3 Server Tool

**Files:**
- Create: `apps/server/src/tools/aave-v3.ts`

- [ ] **Step 1: Write the Aave V3 tool with supply/withdraw/borrow/repay calldata builders**

```typescript
/**
 * Aave V3 Pool interactions — supply, withdraw, borrow, repay.
 * Builds calldata only; client signs and broadcasts.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { WHITELISTED_PROTOCOLS } from "../infra/token-registry.js";

const poolAbi = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
] as const;

function poolAddress(chainId: number): Address | undefined {
  return WHITELISTED_PROTOCOLS[chainId]?.aaveV3Pool as Address | undefined;
}

export function buildAaveSupplyTx({
  chainId,
  asset,
  amount,
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string; // raw wei
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "supply",
      args: [asset, BigInt(amount), onBehalfOf, 0],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Supply encoding failed" };
  }
}

export function buildAaveWithdrawTx({
  chainId,
  asset,
  amount,
  to,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  to: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "withdraw",
      args: [asset, BigInt(amount), to],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Withdraw encoding failed" };
  }
}

export function buildAaveBorrowTx({
  chainId,
  asset,
  amount,
  interestRateMode = 2, // variable
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  interestRateMode?: number;
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "borrow",
      args: [asset, BigInt(amount), BigInt(interestRateMode), 0, onBehalfOf],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Borrow encoding failed" };
  }
}

export function buildAaveRepayTx({
  chainId,
  asset,
  amount,
  interestRateMode = 2,
  onBehalfOf,
}: {
  chainId: number;
  asset: Address;
  amount: string;
  interestRateMode?: number;
  onBehalfOf: Address;
}): { success: true; to: Address; data: Hex; value: "0" } | { success: false; error: string } {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const data = encodeFunctionData({
      abi: poolAbi,
      functionName: "repay",
      args: [asset, BigInt(amount), BigInt(interestRateMode), onBehalfOf],
    });
    return { success: true, to: pool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Repay encoding failed" };
  }
}

export async function getAaveUserPositions({
  chainId,
  user,
}: {
  chainId: number;
  user: Address;
}): Promise<{ success: true; healthFactor: string; totalCollateral: string; totalDebt: string; availableBorrows: string } | { success: false; error: string }> {
  const pool = poolAddress(chainId);
  if (!pool) return { success: false, error: `Aave not supported on chain ${chainId}` };
  try {
    const { getClient } = await import("../infra/chain-client.js");
    const client = getClient(chainId);
    if (!client) return { success: false, error: "Chain client not available" };
    const result = await client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getUserAccountData",
      args: [user],
    }) as [bigint, bigint, bigint, bigint, bigint, bigint];
    const [totalCollateralBase, totalDebtBase, availableBorrowsBase, , , healthFactor] = result;
    return {
      success: true,
      healthFactor: (Number(healthFactor) / 1e18).toFixed(2),
      totalCollateral: (Number(totalCollateralBase) / 1e8).toFixed(2), // USD-based
      totalDebt: (Number(totalDebtBase) / 1e8).toFixed(2),
      availableBorrows: (Number(availableBorrowsBase) / 1e8).toFixed(2),
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Position read failed" };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/server && npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/tools/aave-v3.ts
git commit -m "feat: add Aave V3 server tool with supply/withdraw/borrow/repay + position reads"
```

---

## Task 3: Create Bridge Server Tool (Across Protocol)

**Files:**
- Create: `apps/server/src/tools/bridge.ts`

- [ ] **Step 1: Write the Across bridge tool**

```typescript
/**
 * Across Protocol bridge integration.
 * Quotes via Across API; builds depositV2 calldata.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";
import { WHITELISTED_PROTOCOLS } from "../infra/token-registry.js";

const ACROSS_API = "https://across.to/api";

const spokePoolAbi = [
  "function depositV2(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes memory message) external payable"
] as const;

export async function getBridgeQuote({
  originChainId,
  destinationChainId,
  originToken,
  amount,
  recipient,
}: {
  originChainId: number;
  destinationChainId: number;
  originToken: Address;
  amount: string;
  recipient: Address;
}): Promise<{ success: true; fee: string; time: string; receiveAmount: string; totalSent: string } | { success: false; error: string }> {
  try {
    const url = new URL(`${ACROSS_API}/suggested-fees`);
    url.searchParams.set("token", originToken);
    url.searchParams.set("inputAmount", amount);
    url.searchParams.set("originChainId", String(originChainId));
    url.searchParams.set("destinationChainId", String(destinationChainId));
    url.searchParams.set("recipient", recipient);
    url.searchParams.set("message", "0x");

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      return { success: false, error: `Across API HTTP ${res.status}: ${err}` };
    }
    const data = await res.json() as {
      totalRelayFee: { total: string; pct: string };
      timestamp: number;
      estimatedFillTimeSec: number;
      outputAmount: string;
    };
    const fee = data.totalRelayFee.total;
    const feeFormatted = (Number(fee) / 1e18).toFixed(6);
    const timeMin = Math.ceil(data.estimatedFillTimeSec / 60);
    const receive = data.outputAmount;
    const total = (BigInt(amount) + BigInt(fee)).toString();
    return {
      success: true,
      fee: feeFormatted,
      time: `~${timeMin} min`,
      receiveAmount: receive,
      totalSent: total,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Bridge quote failed" };
  }
}

export function buildBridgeDepositTx({
  chainId,
  destinationChainId,
  inputToken,
  outputToken,
  inputAmount,
  outputAmount,
  recipient,
  quoteTimestamp,
}: {
  chainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  inputAmount: string;
  outputAmount: string;
  recipient: Address;
  quoteTimestamp: number;
}): { success: true; to: Address; data: Hex; value: string } | { success: false; error: string } {
  const spokePool = WHITELISTED_PROTOCOLS[chainId]?.acrossSpokePool as Address | undefined;
  if (!spokePool) return { success: false, error: `Across not supported on chain ${chainId}` };
  try {
    const depositor = recipient; // self-deposit pattern
    const data = encodeFunctionData({
      abi: spokePoolAbi,
      functionName: "depositV2",
      args: [
        depositor,
        recipient,
        inputToken,
        outputToken,
        BigInt(inputAmount),
        BigInt(outputAmount),
        BigInt(destinationChainId),
        "0x0000000000000000000000000000000000000000", // no exclusive relayer
        quoteTimestamp,
        quoteTimestamp + 7200, // fill deadline 2h
        0, // no exclusivity
        "0x", // no message
      ],
    });
    return { success: true, to: spokePool, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Deposit encoding failed" };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/tools/bridge.ts
git commit -m "feat: add Across Protocol bridge server tool with quote + deposit calldata"
```

---

## Task 4: Add Aave + Bridge API Routes to server.ts

**Files:**
- Modify: `apps/server/src/server.ts` (add imports + routes)

- [ ] **Step 1: Add imports at top of server.ts**

```typescript
import {
  buildAaveSupplyTx,
  buildAaveWithdrawTx,
  buildAaveBorrowTx,
  buildAaveRepayTx,
  getAaveUserPositions,
} from "./tools/aave-v3.js";
import { getBridgeQuote, buildBridgeDepositTx } from "./tools/bridge.js";
```

- [ ] **Step 2: Add API routes in createRoutes function**

Add these routes after the existing `/api/cow/order` route (around line 3471):

```typescript
  // Aave V3 routes
  addRoute(routes, "POST", "/api/aave/deposit", "client", async (ctx) => {
    const body = await ctx.request.json();
    const chainId = Number(body.chainId);
    const result = buildAaveSupplyTx({ chainId, asset: body.asset, amount: body.amount, onBehalfOf: body.onBehalfOf });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/withdraw", "client", async (ctx) => {
    const body = await ctx.request.json();
    const chainId = Number(body.chainId);
    const result = buildAaveWithdrawTx({ chainId, asset: body.asset, amount: body.amount, to: body.to });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/borrow", "client", async (ctx) => {
    const body = await ctx.request.json();
    const chainId = Number(body.chainId);
    const result = buildAaveBorrowTx({ chainId, asset: body.asset, amount: body.amount, onBehalfOf: body.onBehalfOf });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/aave/repay", "client", async (ctx) => {
    const body = await ctx.request.json();
    const chainId = Number(body.chainId);
    const result = buildAaveRepayTx({ chainId, asset: body.asset, amount: body.amount, onBehalfOf: body.onBehalfOf });
    return jsonResponse(result);
  });
  addRoute(routes, "GET", "/api/aave/positions", "client", async (ctx) => {
    const chainId = Number(ctx.url.searchParams.get("chainId"));
    const user = ctx.url.searchParams.get("address") as Address;
    const result = await getAaveUserPositions({ chainId, user });
    return jsonResponse(result);
  });

  // Bridge routes
  addRoute(routes, "GET", "/api/bridge/quote", "client", async (ctx) => {
    const originChainId = Number(ctx.url.searchParams.get("originChainId"));
    const destinationChainId = Number(ctx.url.searchParams.get("destinationChainId"));
    const originToken = ctx.url.searchParams.get("originToken") as Address;
    const amount = ctx.url.searchParams.get("amount") || "0";
    const recipient = ctx.url.searchParams.get("recipient") as Address;
    const result = await getBridgeQuote({ originChainId, destinationChainId, originToken, amount, recipient });
    return jsonResponse(result);
  });
  addRoute(routes, "POST", "/api/bridge/deposit", "client", async (ctx) => {
    const body = await ctx.request.json();
    const result = buildBridgeDepositTx({
      chainId: Number(body.chainId),
      destinationChainId: Number(body.destinationChainId),
      inputToken: body.inputToken,
      outputToken: body.outputToken,
      inputAmount: body.inputAmount,
      outputAmount: body.outputAmount,
      recipient: body.recipient,
      quoteTimestamp: Number(body.quoteTimestamp),
    });
    return jsonResponse(result);
  });
```

- [ ] **Step 3: Run build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/server.ts
git commit -m "feat: add Aave V3 and bridge API routes to server"
```

---

## Task 5: Wire AavePanel UI to Real Endpoints

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/pages/AavePanel.tsx`

- [ ] **Step 1: Add state for positions and loading**

```typescript
import { useState, useCallback, useEffect } from "react";
// ... existing imports

export default function AavePanel({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("USDC");
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<{ healthFactor: string; totalCollateral: string; totalDebt: string; availableBorrows: string } | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
```

- [ ] **Step 2: Add position fetch effect**

```typescript
  const fetchPositions = useCallback(async () => {
    if (!state.chainId || !state.address) return;
    try {
      const res = await fetch(`/api/aave/positions?chainId=${state.chainId}&address=${state.address}`);
      const json = await res.json();
      if (json.success) setPositions(json);
    } catch { /* silent fail */ }
  }, [state.chainId, state.address]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);
```

- [ ] **Step 3: Replace deposit alert with real execution**

```typescript
  const handleDeposit = async () => {
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta || !state.address || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/aave/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: raw, onBehalfOf: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        // Execute via wallet store
        const hash = await store.requestTx({ to: json.to, data: json.data, value: json.value });
        if (hash) {
          setTxHash(hash);
          await fetchPositions();
        }
      }
    } finally { setLoading(false); }
  };
```

Replace the deposit button's onClick with `handleDeposit`.

- [ ] **Step 4: Replace borrow alert similarly**

```typescript
  const handleBorrow = async () => {
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta || !state.address || !amount) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/aave/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: state.chainId, asset: meta.address, amount: raw, onBehalfOf: state.address }),
      });
      const json = await res.json();
      if (json.success) {
        const hash = await store.requestTx({ to: json.to, data: json.data, value: json.value });
        if (hash) { setTxHash(hash); await fetchPositions(); }
      }
    } finally { setLoading(false); }
  };
```

- [ ] **Step 5: Update Positions tab to show real data**

```typescript
      {tab === "positions" && (
        <div className="space-y-3">
          {positions ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Health Factor</div>
                <div className={cn("font-mono text-dls-text", Number(positions.healthFactor) < 1.1 && "text-red-400")}>{positions.healthFactor}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Collateral</div>
                <div className="font-mono text-dls-text">${positions.totalCollateral}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Debt</div>
                <div className="font-mono text-dls-text">${positions.totalDebt}</div>
              </div>
              <div className="rounded-lg bg-dls-surface border border-dls-border px-3 py-2">
                <div className="text-dls-secondary">Available</div>
                <div className="font-mono text-dls-text">${positions.availableBorrows}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-dls-secondary">Connect wallet to view positions.</p>
          )}
        </div>
      )}
```

- [ ] **Step 6: Run build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/pages/AavePanel.tsx
git commit -m "feat: wire AavePanel to real Aave V3 supply/borrow + position reads"
```

---

## Task 6: Wire BridgePanel UI to Real Endpoints

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx`

- [ ] **Step 1: Add state for real quote and TX tracking**

```typescript
const [quoteData, setQuoteData] = useState<{ fee: string; time: string; receiveAmount: string; totalSent: string; quoteTimestamp: number } | null>(null);
const [txHash, setTxHash] = useState<string | null>(null);
```

- [ ] **Step 2: Replace handleEstimate with real Across API call**

```typescript
  const handleEstimate = async () => {
    if (!amount || !state.address) return;
    setLoading(true);
    try {
      const meta = tokens.find((t) => t.symbol === selectedToken);
      if (!meta) return;
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch(
        `/api/bridge/quote?originChainId=${fromChain}&destinationChainId=${toChain}&originToken=${meta.address}&amount=${raw}&recipient=${state.address}`,
      );
      const json = await res.json();
      if (json.success) {
        setQuoteData({
          fee: json.fee,
          time: json.time,
          receiveAmount: json.receiveAmount,
          totalSent: json.totalSent,
          quoteTimestamp: Math.floor(Date.now() / 1000),
        });
      }
    } finally { setLoading(false); }
  };
```

- [ ] **Step 3: Replace handleBridge with real deposit execution**

```typescript
  const handleBridge = async () => {
    if (!quoteData || !state.address) return;
    const meta = tokens.find((t) => t.symbol === selectedToken);
    if (!meta) return;
    setLoading(true);
    try {
      const raw = String(Math.round(Number(amount) * 10 ** meta.decimals));
      const res = await fetch("/api/bridge/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: fromChain,
          destinationChainId: toChain,
          inputToken: meta.address,
          outputToken: meta.address, // same token cross-chain
          inputAmount: raw,
          outputAmount: quoteData.receiveAmount,
          recipient: state.address,
          quoteTimestamp: quoteData.quoteTimestamp,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const hash = await store.requestTx({ to: json.to, data: json.data, value: json.value });
        if (hash) setTxHash(hash);
      }
    } finally { setLoading(false); }
  };
```

- [ ] **Step 4: Run build + commit**

Run: `pnpm run -r build`
Expected: PASS

```bash
git add apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx
git commit -m "feat: wire BridgePanel to real Across Protocol quote + deposit"
```

---

## Task 7: Add EIP-712 Signing to CoW Swap Panel

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/pages/CowSwapPanel.tsx`

- [ ] **Step 1: Import signTypedData from wagmi**

```typescript
import { useSignTypedData } from "wagmi";
```

- [ ] **Step 2: Add signing hook and replace handleSubmit**

```typescript
export default function CowSwapPanel({ store }: { store: WalletStore }) {
  // ... existing state
  const { signTypedDataAsync } = useSignTypedData();

  const handleSubmit = useCallback(async () => {
    if (!quote || !state.address || !quoteId) return;
    try {
      // CoW Protocol EIP-712 domain
      const domain = {
        name: "Gnosis Protocol",
        version: "v2",
        chainId: state.chainId,
        verifyingContract: "0x9008D19f58AAbd9eD0D60971565AA8510560ab41", // CoW Settlement
      };
      const types = {
        Order: [
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "receiver", type: "address" },
          { name: "sellAmount", type: "uint256" },
          { name: "buyAmount", type: "uint256" },
          { name: "validTo", type: "uint32" },
          { name: "appData", type: "bytes32" },
          { name: "feeAmount", type: "uint256" },
          { name: "kind", type: "string" },
          { name: "partiallyFillable", type: "bool" },
          { name: "sellTokenBalance", type: "string" },
          { name: "buyTokenBalance", type: "string" },
        ],
      };
      const message = {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        receiver: state.address,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        validTo: quote.validTo,
        appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
        feeAmount: quote.feeAmount,
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };
      const signature = await signTypedDataAsync({ domain, types, message });
      const res = await fetch("/api/cow/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: state.chainId,
          order: { ...quote, from: state.address, signingScheme: "eip712" },
          signature,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Order submitted! ID: ${json.orderId}\n${json.explorerUrl}`);
      } else {
        setError(json.error ?? "Submission failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed");
    }
  }, [quote, state.address, state.chainId, quoteId, signTypedDataAsync]);
```

- [ ] **Step 3: Run build + commit**

Run: `pnpm run -r build`
Expected: PASS

```bash
git add apps/app/src/react-app/domains/wallet/pages/CowSwapPanel.tsx
git commit -m "feat: wire CoW Swap Panel with EIP-712 signing and order submission"
```

---

## Task 8: Add MCP v0.6 Tools

**Files:**
- Modify: `packages/matterhorn-work-crypto-mcp/index.mjs`

- [ ] **Step 1: Add 7 new tool definitions in the tools array**

```javascript
    {
      name: "crypto_aaveDeposit",
      description: "Build Aave V3 supply calldata. Returns {to, data, value} for client signing.",
      parameters: { /* same shape as POST /api/aave/deposit body */ },
    },
    {
      name: "crypto_aaveWithdraw",
      description: "Build Aave V3 withdraw calldata.",
      parameters: { /* ... */ },
    },
    {
      name: "crypto_aaveBorrow",
      description: "Build Aave V3 borrow calldata.",
      parameters: { /* ... */ },
    },
    {
      name: "crypto_aaveRepay",
      description: "Build Aave V3 repay calldata.",
      parameters: { /* ... */ },
    },
    {
      name: "crypto_aavePositions",
      description: "Read Aave V3 user positions and health factor.",
      parameters: { chainId: { type: "integer" }, address: { type: "string" } },
    },
    {
      name: "crypto_bridgeQuote",
      description: "Get Across Protocol bridge quote (fee, time, receive amount).",
      parameters: { originChainId: { type: "integer" }, destinationChainId: { type: "integer" }, originToken: { type: "string" }, amount: { type: "string" }, recipient: { type: "string" } },
    },
    {
      name: "crypto_bridgeDeposit",
      description: "Build Across Protocol depositV2 calldata.",
      parameters: { /* ... */ },
    },
```

- [ ] **Step 2: Bump version to 0.6.0**

```javascript
const VERSION = "0.6.0";
```

- [ ] **Step 3: Add handlers**

```javascript
      if (name === "crypto_aaveDeposit") {
        const res = await fetch(`${SERVER}/api/aave/deposit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
        return { content: [{ type: "text", text: JSON.stringify(await res.json()) }] };
      }
      // ... similar for withdraw, borrow, repay, positions, bridgeQuote, bridgeDeposit
```

- [ ] **Step 4: Commit**

```bash
git add packages/matterhorn-work-crypto-mcp/index.mjs
git commit -m "feat: MCP v0.6 with Aave + Bridge tools"
```

---

## Task 9: Add Client-Side Token Registry Mirror

**Files:**
- Modify: `apps/app/src/react-app/infra/token-registry.ts`

- [ ] **Step 1: Add aave + across addresses to client registry**

```typescript
// Add to MAINNET and SEPOLIA records
aaveV3Pool: "0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994",
aaveV3PoolDataProvider: "0x2d8A4C8D072cE092016652604A8fe5bE43e67b48",
acrossSpokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
```

- [ ] **Step 2: Run build + commit**

```bash
git add apps/app/src/react-app/infra/token-registry.ts
git commit -m "feat: add Aave + Across addresses to client token registry"
```

---

## Task 10: Full E2E Test + Final Verification

**Files:**
- Create: `scripts/test-phase-4-e2e.ts`

- [ ] **Step 1: Write Phase 4 E2E test**

```typescript
import { test, expect } from "bun:test";

const SERVER = process.env.SERVER_URL || "http://localhost:8787";

test("Aave supply calldata builds correctly", async () => {
  const res = await fetch(`${SERVER}/api/aave/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: 8453, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "1000000", onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994");
  expect(json.data).toStartWith("0x");
});

// ... tests for withdraw, borrow, repay, positions, bridge quote, bridge deposit
```

- [ ] **Step 2: Run verification script**

Run: `bash scripts/verify-crypto.sh`
Expected: ALL PASS

- [ ] **Step 3: Run full build**

Run: `pnpm run -r build`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add scripts/test-phase-4-e2e.ts
git commit -m "test: add Phase 4 E2E test suite"
```

---

## Summary of Commits

| # | Commit | What |
|---|--------|------|
| 1 | `feat: add Aave V3 and Across Protocol addresses to whitelist` | Token registry update |
| 2 | `feat: add Aave V3 server tool` | `aave-v3.ts` |
| 3 | `feat: add Across Protocol bridge server tool` | `bridge.ts` |
| 4 | `feat: add Aave V3 and bridge API routes to server` | `server.ts` routes |
| 5 | `feat: wire AavePanel to real Aave V3` | UI real execution |
| 6 | `feat: wire BridgePanel to real Across Protocol` | UI real execution |
| 7 | `feat: wire CoW Swap Panel with EIP-712 signing` | CoW execution |
| 8 | `feat: MCP v0.6 with Aave + Bridge tools` | MCP update |
| 9 | `feat: add Aave + Across addresses to client token registry` | Client registry |
| 10 | `test: add Phase 4 E2E test suite` | Tests |

---

**Plan complete. Ready for execution using superpowers:executing-plans.**
