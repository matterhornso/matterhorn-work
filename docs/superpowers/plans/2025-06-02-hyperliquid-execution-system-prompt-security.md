# Hyperliquid Execution + System Prompt Live Testing + Security Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

---

## Part 1: Hyperliquid Execution Flow

**Goal:** Wire the full Hyperliquid order signing + submission flow so the agent can propose a perp trade, the user signs an L1 proof in the approval modal, and the server submits the order to Hyperliquid's API.

**Architecture:**
- Server `hyperliquid-execution.ts` already builds unsigned order JSON
- The gap: L1 signing requires a *structured action hash* signed by the user's Arbitrum wallet key
- Hyperliquid's docs (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/order-specification) define exactly what needs to be signed
- Our UI `TransactionApproval.tsx` needs a new approval *variant* for HL orders — not a standard EVM tx
- The MCP `wallet_signMessage` tool already exists and emits the sign request; we need to capture the result and send it to HL

**Hyperliquid Signing in Plain English:**
1. User has an Arbitrum private key (same as their EVM wallet key)
2. Hyperliquid doesn't accept a simple ETH tx — it accepts a JSON order with a *signature field*
3. The signature is `sign(keccak256(encode(action, nonce, vaultAddress)), privateKey)`
4. In our flow: agent proposes → server builds order → UI shows "Sign Order" → wagmi `signMessage` → UI sends signature to server → server calls HL `/exchange`

**The Hard Part:** We need a way to sign an *action hash*, not an arbitrary message. `wallet_signMessage` in wagmi signs a personal_sign format which wraps the message in `\x19Ethereum Signed Message:\n`. HL may or may not accept that. According to HL docs, they accept EVM-compatible signatures (personal_sign).

**Files to Create/Modify:**
- Create: `apps/server/src/tools/hyperliquid-signing.ts` — encode action hash, format for signing, verify signature
- Modify: `apps/server/src/tools/hyperliquid-execution.ts` — integrate signing step
- Modify: `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx` — add HL_ORDER variant UI
- Modify: `packages/matterhorn-work-crypto-mcp/index.mjs` — add `hl_signOrder`, `hl_buildOrder`, `hl_submitOrder` tools
- Modify: `apps/app/src/react-app/shell/session-route.tsx` — add HL order to system prompt examples

---

### Task 1.1: Understand Hyperliquid's Signing Format

**Files:**
- Read: `apps/server/src/tools/hyperliquid-execution.ts`
- Read: `packages/matterhorn-work-crypto-mcp/index.mjs` (HL section)

**Steps:**
1. Read Hyperliquid docs (via webfetch of https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing-orders)
2. Determine: Does HL accept `personal_sign` signatures?
3. If yes: we can use our existing `wallet_signMessage` flow
4. If no: we need custom signing (eth_sign raw hash) — much harder

**Expected output:** A note confirming whether `personal_sign` works for HL.

---

### Task 1.2: Server-Side Order Encoding

**Files:**
- Create: `apps/server/src/tools/hyperliquid-signing.ts`

**Steps:**
1. Build an `encodeAction(action, nonce)` function that:
   - JSON-stringifies the action + nonce consistently
   - Computes `keccak256` hash
   - Returns the hex hash to be signed
2. Build `signAction(action, nonce, privateKey)` that signs the hash with `secp256k1` (use `viem` utilities)
3. Use `viem`'s `keccak256`, `toHex`, `stringify`, `parseSignature`, `recoverAddress`
4. Verify the signature format matches what HL expects

```ts
import { keccak256, toHex, serializeSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function encodeAction(action: unknown, nonce: number): `0x${string}` {
  const payload = JSON.stringify({ action, nonce });
  return keccak256(toHex(payload));
}

export function signAction(
  action: unknown,
  nonce: number,
  privateKey: `0x${string}`,
) {
  const hash = encodeAction(action, nonce);
  const account = privateKeyToAccount(privateKey);
  return account.signMessage({ message: { raw: hash } });
}
```

5. Add a test: `bun -e "import {signAction} from ...; console.log(await signAction(...))"`

---

### Task 1.3: New TransactionApproval Variant for HL Orders

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`

**Steps:**
1. Add a new case to the `pendingApproval` type:
   ```ts
   pendingApproval: {
     type: "swap" | "hl_order";
     // ... existing fields
     hlOrder?: { asset: string; isBuy: boolean; sz: number; limitPx?: number; summary: string };
   } | null;
   ```
2. In the modal: when `type === "hl_order"`:
   - Show "Hyperliquid Order" header with a warning about testnet
   - Show order details: side, size, asset, price
   - Primary action: "Sign with Wallet" (calls `wallet_signMessage` on the hex-encoded action)
   - After signing: show "Submit to Hyperliquid" button (disabled until signature received)
3. Keep the existing swap UI unchanged for standard txs

---

### Task 1.4: MCP Server Tools for HL Execution

**Files:**
- Modify: `packages/matterhorn-work-crypto-mcp/index.mjs`

**Steps:**
1. Add `hl_buildOrder` tool to MCP tools list
2. In its handler:
   - Build the unsigned order JSON (reuse existing logic)
   - Return `{ action: { orderAction: {...} }, nonce: Date.now(), needsSignature: true, summary }`
3. Add `hl_signOrder` tool:
   - Input: `{ unsignedOrder, nonce }`
   - Return: `{ messageToSign: "0x..." }` — the hash to be signed
   - Emit stderr event: `{ event: "sign_hl_order", order, nonce, messageToSign }`
4. Add `hl_submitOrder` tool:
   - Input: `{ signedOrder, signature, publicAddress }`
   - POST to `https://api.hyperliquid.xyz/exchange`
   - Return success/error

---

### Task 1.5: System Prompt Update for HL Order Flow

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts`

**Steps:**
1. Add reasoning chain for Hyperliquid execution:
   ```
   If user wants to trade on Hyperliquid:
   1. Call hl_getFundingRates to see if there's an opportunity
   2. Call wallet_getBalance to check available margin
   3. Call hl_buildOrder to create unsigned order
   4. Present order to user and ask for approval
   5. If approved, call wallet_signMessage with the messageToSign
   6. Call hl_submitOrder with the signed order + signature
   7. Confirm position is opened via hl_getPositions
   ```

---

### Task 1.6: End-to-End Test

**Steps:**
1. Run a live test: agent says "I want to short ETH on Hyperliquid $500 notional"
2. Watch the flow: build order → sign → submit
3. Verify: `hl_getPositions` shows the open position

**Note:** This requires a real Hyperliquid account with margin. Use a test wallet with minimal funds on Arbitrum.

---

## Part 2: System Prompt Live Testing

**Goal:** Actually test that the agent *uses* the crypto tools when asked crypto questions. Iterate the prompt until the agent consistently follows the reasoning chains.

**Files:**
- `apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt.ts`
- `apps/app/src/react-app/shell/session-route.tsx`

### Task 2.1: Build a Prompt Test Harness

**Files:**
- Create: `scripts/test-crypto-prompt.ts`

**Steps:**
1. Write a script that simulates agent messages and checks if the prompt injection is correct:
   ```ts
   import { shouldInjectCryptoPrompt, buildCryptoSystemPrompt } from "...";
   
   const testCases = [
     { msg: "What crypto should I buy?", shouldInject: true },
     { msg: "What's the weather today?", shouldInject: false },
     { msg: "Show me Hyperliquid funding rates", shouldInject: true },
     { msg: "Write a Python script", shouldInject: false },
   ];
   ```
2. Assert each case passes
3. Assert the prompt contains the expected tool names and reasoning chains

---

### Task 2.2: Manual Agent Conversation Testing

**Steps:**
1. Start the Matterhorn Work app (dev mode)
2. Connect a wallet with Base Sepolia
3. Ask the agent: "What's my ETH balance?"
   - Expected: agent calls `wallet_getBalance`
4. Ask: "What's the best yield on Base?"
   - Expected: agent calls `crypto_getYields('Base')`
5. Ask: "Show me ETH perp funding rates on Hyperliquid"
   - Expected: agent calls `hl_getFundingRates('ETH')`
6. Ask: "What prediction markets exist for crypto?"
   - Expected: agent calls `pm_searchEvents('crypto')`

**For each conversation:**
- Record what the agent actually did (tools called, response quality)
- Note failures: agent ignored tools, looped, fabricated data, proposed swap without simulation
- Fix the prompt and retry

---

### Task 2.3: Prompt Iteration Loop

**Steps:**
1. For each failure mode found in Task 2.2, adjust the prompt:
   - Agent fabricates prices → add "ALWAYS call crypto_getPrices, never guess prices"
   - Agent skips simulation → add "NEVER propose a swap without calling crypto_buildSwap AND crypto_simulate first"
   - Agent loops on tool calls → add "If a tool returns an error, report it to the user and stop. Do not retry automatically."
   - Agent proposes mainnet tx without warning → add "If chainId is 1, 8453, or any mainnet, explicitly warn the user before proposing any transaction"
2. Re-run the test harness after each iteration
3. Commit prompt improvements with clear notes about what failure mode was fixed

---

## Part 3: Security Audit

**Goal:** Review all security measures added so far, identify gaps, and harden before any real money is at risk.

**Files to audit:**
- `apps/app/src/react-app/domains/wallet/state/wallet-store.ts`
- `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`
- `apps/app/src/react-app/domains/wallet/infra/whitelist.ts`
- `apps/server/src/infra/token-registry.ts`
- `apps/server/src/tools/swap-builder.ts`
- `apps/server/src/tools/transaction-simulation.ts`

### Task 3.1: Audit Current Guardrails

**Checklist:**
- [ ] Spend limits are enforced BEFORE showing Approve button
- [ ] Testnet is the default for first-time users
- [ ] Protocol whitelist blocks unknown contracts
- [ ] Transaction simulation runs before Approve is shown
- [ ] Activity trail logs all proposed transactions
- [ ] Mainnet transactions show extra warnings
- [ ] No private keys are logged or exposed in UI/MCP

**Steps:**
1. Read each file in the audit list
2. Score each guardrail 0-3 (0=missing, 1=weak, 2=adequate, 3=strong)
3. List gaps

---

### Task 3.2: Fix Gaps Found

**Common gaps to look for:**
- **No rate limiting on tool calls** → Add a per-session rate limit (e.g., max 5 swap proposals per hour)
- **No max slippage enforcement** → Add `maxSlippageBps` to swap builder config
- **No approval delay** → Add a minimum 3-second countdown before "Approve" becomes clickable
- **No testnet-only mode** → Add a global flag `FORCE_TESTNET=1` that rejects any mainnet chainId
- **No contract address validation** → Verify `to` address is a contract (has code) before showing Approve
- **No simulation on read-only operations** → All write operations (swap, bridge, transfer) MUST be simulated

**Steps:**
1. Prioritize gaps by risk
2. Implement highest-risk fixes
3. Verify with `verify-crypto.sh` + manual testing

---

### Task 3.3: Add Audit Logging

**Files:**
- Modify: `apps/app/src/react-app/domains/wallet/state/wallet-store.ts`

**Steps:**
1. Create `security.log` entry for every action:
   ```ts
   interface SecurityLogEntry {
     timestamp: number;
     action: "tx_proposed" | "tx_approved" | "tx_rejected" | "tx_executed" | "limit_hit" | "whitelist_denied";
     chainId: number;
     to: string;
     valueUSD: number;
     riskLevel: "low" | "medium" | "high";
     reason: string;
   }
   ```
2. Persist to localStorage: `matterhorn:security:log`
3. Show last 5 security events in WalletPanel under a "Security" collapsible section
4. Export to JSON on demand

---

## Verification

After all three parts:
- `pnpm typecheck` (app + server): pass
- `pnpm build` (app + server): pass
- `verify-crypto.sh`: 48/48
- `e2e-crypto-test.ts`: 20/20
- Hyperliquid order flow tested end-to-end (requires real account)
- Security audit document written to `docs/security-audit.md`
