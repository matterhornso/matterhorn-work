# Phase B: "Send Money" Wedge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sending money as simple as Venmo/Cash App. Three capabilities in one flow: same-chain transfer, cross-chain bridge, unified smart routing.

**Architecture:** Server builds transfer/bridge calldata; client signs via `requestApproval()`. Address book in localStorage. Transaction history from store + on-chain.

**Tech Stack:** TypeScript, React 19, Vite, wagmi v2, viem, shadcn/ui, Tailwind, pnpm

---

## Task 1: Add `/api/transfer/build` Server Endpoint

**Files:**
- Create: `apps/server/src/tools/transfer.ts`
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Write transfer calldata builder**

```typescript
/**
 * Transfer builder — same-chain ERC-20 transfer or native ETH send.
 */
import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";

const erc20Abi = [
  "function transfer(address to, uint256 amount) external returns (bool)",
] as const;

export function buildTransferTx({
  chainId,
  token,
  to,
  amount,
}: {
  chainId: number;
  token: "native" | Address;
  to: Address;
  amount: string;
}): { success: true; to: Address; data?: Hex; value: string } | { success: false; error: string } {
  if (token === "native") {
    return { success: true, to, value: amount };
  }
  try {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, BigInt(amount)],
    });
    return { success: true, to: token, data, value: "0" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Transfer encoding failed" };
  }
}
```

- [ ] **Step 2: Add route to server.ts**

```typescript
import { buildTransferTx } from "./tools/transfer.js";

addRoute(routes, "POST", "/api/transfer/build", "client", async (ctx) => {
  const body = await readJsonBody(ctx.request);
  const result = buildTransferTx({
    chainId: Number(body.chainId),
    token: body.token === "native" ? "native" : String(body.token) as Address,
    to: String(body.to) as Address,
    amount: String(body.amount),
  });
  return jsonResponse(result);
});
```

- [ ] **Step 3: Verify TypeScript**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/tools/transfer.ts apps/server/src/server.ts
git commit -m "feat: add /api/transfer/build endpoint for same-chain transfers"
```

---

## Task 2: Create `useAddressBook` Hook

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/hooks/useAddressBook.ts`

- [ ] **Step 1: Write the hook**

```typescript
import { useState, useCallback, useEffect } from "react";

interface SavedAddress {
  name: string;
  address: string;
  chainId?: number;
}

const STORAGE_KEY = "matterhorn_address_book";

export function useAddressBook() {
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedAddress[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  const add = useCallback((addr: SavedAddress) => {
    setAddresses((prev) => {
      if (prev.some((a) => a.address.toLowerCase() === addr.address.toLowerCase())) return prev;
      return [...prev, addr];
    });
  }, []);

  const remove = useCallback((address: string) => {
    setAddresses((prev) => prev.filter((a) => a.address.toLowerCase() !== address.toLowerCase()));
  }, []);

  return { addresses, add, remove };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /Users/thebiglebowski/matterhorn-work/apps/app && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/hooks/useAddressBook.ts
git commit -m "feat: add useAddressBook hook with localStorage persistence"
```

---

## Task 3: Create `TransferPanel` Component

**Files:**
- Create: `apps/app/src/react-app/domains/wallet/pages/TransferPanel.tsx`

- [ ] **Step 1: Write TransferPanel**

Use existing panel patterns (AavePanel, BridgePanel). Features:
- Token selector (USDC, WETH, native ETH)
- Recipient input with address book dropdown
- Amount input with max
- Review step
- `store.requestApproval()` for signing

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/pages/TransferPanel.tsx
git commit -m "feat: add TransferPanel for same-chain transfers"
```

---

## Task 4: Polish BridgePanel (v2)

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx`

- [ ] **Step 1: Add fee preview before bridge action**

Show Across quote inline: "Fee: $0.50 • Receive: $99.50 • Time: ~10 min"

- [ ] **Step 2: Integrate address book**

Recipient input with saved addresses dropdown.

- [ ] **Step 3: Add transaction history stub**

Show recent bridge TXs from store transactions array.

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx
git commit -m "feat: polish BridgePanel with fee preview, address book, history"
```

---

## Task 5: Add Unified "Send" Flow to WalletPanel

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`

- [ ] **Step 1: Add Send button to nav**

Replace or supplement protocol nav buttons. Primary "Send" CTA.

- [ ] **Step 2: Wire TransferPanel lazy load**

```typescript
const TransferPanel = lazy(() => import("./pages/TransferPanel"));
```

- [ ] **Step 3: Add panel state for "send"**

```typescript
type PanelType = "portfolio" | "cow" | "aave" | "bridge" | "send" | null;
```

- [ ] **Step 4: Verify TypeScript + build**

Run: `pnpm run -r build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/react-app/domains/wallet/WalletPanel.tsx
git commit -m "feat: add unified Send entry point to WalletPanel"
```

---

## Task 6: E2E Tests + Final Verification

**Files:**
- Create: `scripts/test-phase-b-e2e.test.ts`

- [ ] **Step 1: Write E2E test**

```typescript
import { test, expect } from "bun:test";

const SERVER = process.env.SERVER_URL || "http://localhost:8787";

async function serverAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

test("Transfer calldata builds for ERC-20", async () => {
  if (!(await serverAvailable())) return;
  const res = await fetch(`${SERVER}/api/transfer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: 8453, token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "1000000" }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  expect(String(json.data)).toStartWith("0x");
});

test("Transfer calldata builds for native ETH", async () => {
  if (!(await serverAvailable())) return;
  const res = await fetch(`${SERVER}/api/transfer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chainId: 8453, token: "native", to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "1000000000000000" }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  expect(json.value).toBe("1000000000000000");
});

test("TransferPanel file exists with key features", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync("apps/app/src/react-app/domains/wallet/pages/TransferPanel.tsx", "utf8");
  expect(content).toInclude("requestApproval");
  expect(content).toInclude("transfer");
});
```

- [ ] **Step 2: Run full verification**

Run: `bash scripts/verify-crypto.sh`
Expected: ALL PASS

Run: `pnpm run -r build`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add scripts/test-phase-b-e2e.test.ts
git commit -m "test: add Phase B E2E test suite for send money"
```

---

## Task 7: Final Push

- [ ] **Step 1: Push branch**

```bash
git push origin dev
```

---

## Summary of Commits

| # | Commit | What |
|---|--------|------|
| 1 | `feat: add /api/transfer/build endpoint` | Server: transfer calldata |
| 2 | `feat: add useAddressBook hook` | Client: address book persistence |
| 3 | `feat: add TransferPanel` | Client: same-chain transfer UI |
| 4 | `feat: polish BridgePanel v2` | Client: fee preview, address book, history |
| 5 | `feat: add unified Send entry point` | Client: WalletPanel nav |
| 6 | `test: add Phase B E2E test suite` | Tests |

---

**Plan complete. Ready for execution using superpowers:executing-plans.**
