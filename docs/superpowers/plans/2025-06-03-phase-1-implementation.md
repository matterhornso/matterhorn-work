# Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:dispatching-parallel-agents.

**Goal:** Fix the bundle size crisis + add 5 P0 security/UX features.

**Architecture:** All 7 tasks are independent and can run in parallel. Each task touches isolated files.

---

## Task 1: Fix Shiki Bundle (70% Size Reduction)

**Files:**
- Modify: `apps/app/src/react-app/domains/session/surface/markdown.tsx`

**Problem:** `import { bundledLanguages } from "shiki"` pulls 308 grammar files (~10-11 MB).

**Fix:** Import only the 15 languages actually needed by a coding workspace.

```ts
// NEW imports — specific languages only
import { codeToHtml } from "shiki";
import js from "shiki/langs/javascript.mjs";
import ts from "shiki/langs/typescript.mjs";
import tsx from "shiki/langs/tsx.mjs";
import jsx from "shiki/langs/jsx.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import solidity from "shiki/langs/solidity.mjs";
import markdown from "shiki/langs/markdown.mjs";
import html from "shiki/langs/html.mjs";
import css from "shiki/langs/css.mjs";
import shell from "shiki/langs/shellscript.mjs";
import json from "shiki/langs/json.mjs";
import yaml from "shiki/langs/yaml.mjs";
import sql from "shiki/langs/sql.mjs";
import go from "shiki/langs/go.mjs";

const languageMap: Record<string, unknown> = {
  javascript: js,
  typescript: ts,
  tsx,
  jsx,
  python,
  rust,
  solidity,
  markdown,
  html,
  css,
  shell: shell,
  shellscript: shell,
  bash: shell,
  json,
  yaml,
  yml: yaml,
  sql,
  go,
};

// Replace bundledLanguages reference
function normalizeShikiLanguage(lang: string) {
  const normalized = lang.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return normalized in languageMap ? normalized : "text";
}
```

**Verification:** `pnpm build` → check dist/assets/ chunk count drops from 308 to ~30.

---

## Task 2: Vite Manual Chunks

**Files:**
- Modify: `apps/app/vite.config.ts`

**Add to build.rollupOptions.output:**
```ts
manualChunks: {
  vendor: ["react", "react-dom", "react-router-dom"],
  wallet: ["wagmi", "viem", "@tanstack/react-query"],
  editor: ["lexical", "@lexical/react"],
  markdown: ["marked", "marked-emoji", "marked-shiki", "shiki"],
}
```

**Verification:** `pnpm build` → check chunk sizes are under 500 KB each.

---

## Task 3: Lazy-Load Wallet Provider

**Files:**
- Modify: `apps/app/src/react-app/shell/providers.tsx`
- Create: `apps/app/src/react-app/shell/wallet-providers.tsx`

**Move WagmiProvider + WalletProvider into a lazy-loaded component.**

**wallet-providers.tsx:**
```tsx
/** @jsxImportSource react */
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "../infra/wagmi-config";
import { WalletProvider } from "../domains/wallet/WalletProvider";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <WalletProvider>{children}</WalletProvider>
    </WagmiProvider>
  );
}
```

**providers.tsx:** Replace static `<WagmiProvider>` with lazy import:
```tsx
import { lazy, Suspense } from "react";
const WalletProviders = lazy(() => import("./wallet-providers"));

// In render tree, wrap with Suspense:
<Suspense fallback={children}>
  <WalletProviders>{children}</WalletProviders>
</Suspense>
```

**Verification:** `pnpm build` → wagmi/viem should be in a separate chunk, not in app chunk.

---

## Task 4: Token Approval Manager (revoke.cash API)

**Files:**
- Create: `apps/server/src/tools/approval-manager.ts`
- Modify: `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`

**API:** https://api.revoke.cash/v1/approvals/{address}?chainId={chainId}

**Tool:** `wallet_getTokenApprovals(address, chainId)` → returns array of `{token, spender, amount, risk}`

**UI:** Add "Approvals" section in WalletPanel listing active approvals with "Revoke" buttons.

**Verification:** Test with a wallet that has active USDC approvals.

---

## Task 5: Transaction Calldata Decoder (4byte.directory)

**Files:**
- Create: `apps/server/src/tools/calldata-decoder.ts`
- Modify: `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`

**API:** https://www.4byte.directory/api/v1/signatures/?hex_signature=0x{a0b1...}

**Tool:** `wallet_decodeCalldata(chainId, to, data)` → returns `{methodName, params}`

**UI:** In TransactionApproval, show decoded method name + params instead of raw hex.

**Verification:** Test with a Uniswap swap transaction.

---

## Task 6: ENS Name Resolution

**Files:**
- Create: `apps/server/src/tools/ens-resolver.ts`
- Modify: `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`
- Modify: `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`

**Tool:** `wallet_resolveEns(name)` → address; `wallet_lookupEns(address)` → name

**UI:** Show ENS name in WalletPanel if available. Show resolved name in TransactionApproval for "to" field.

**Verification:** Test with vitalik.eth, nick.eth.

---

## Task 7: Gas Estimator

**Files:**
- Create: `apps/server/src/tools/gas-estimator.ts`
- Modify: `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`

**API:** Use viem's `estimateGas` or Blocknative `https://api.blocknative.com/gasprices/blockprices?chainid=8453`

**Tool:** `wallet_estimateGas(chainId, to, data, value, from)` → `{gasLimit, gasPrice, maxFeePerGas, maxPriorityFeePerGas, totalCostUSD}`

**UI:** Show gas cost in USD in TransactionApproval with slow/market/fast/urgent presets.

**Verification:** Test on Base Sepolia with a simple transfer.

---

## Verification (All Tasks)

After all tasks complete:
- [ ] `pnpm typecheck` (app + server): pass
- [ ] `pnpm build` (app + server): pass
- [ ] `verify-crypto.sh`: 48/48
- [ ] Bundle audit: total JS < 4 MB, chunks < 50, initial gzipped < 500 KB
- [ ] New features tested end-to-end
