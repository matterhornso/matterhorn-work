# Feature 3: On-Chain Transaction End-to-End

**Priority:** P1 — depends on Features 1 + 2

## Goal

Full flow: user asks agent to do something on-chain → agent proposes transaction → wallet panel shows approval modal → user approves → TX broadcast → TX hash returned to agent → agent reports result.

## Dependencies

- Feature 1 (Wallet Extension) — wallet store + MCP server + TransactionApproval modal
- Feature 2 (Session Context) — agent knows chain + USDC address

## Task 3.1: Wire the full TX pipeline

The flow:

1. Agent calls `wallet_sendTransaction({ to, value, data? })` via MCP
2. MCP server returns `{ status: "pending_approval" }` and fires a CustomEvent on window
3. TransactionApproval modal renders with TX preview
4. User clicks Approve → wagmi `sendTransaction` → wait for receipt → return `{ status: "approved", txHash }` to agent via MCP
5. User clicks Reject → return `{ status: "rejected" }` to agent

Implementation:
- In `TransactionApproval.tsx`: listen for the CustomEvent, render the modal
- In the MCP server (`index.mjs`): implement a message channel pattern — when `wallet_sendTransaction` is called, emit an event and wait for the UI response
- Use `window.dispatchEvent(new CustomEvent("matterhorn:tx-approval-request", { detail: txData }))` from MCP bridge
- Listen for `matterhorn:tx-approval-response` event with `{ approved: boolean, txHash?: string }`

## Task 3.2: Add TX history to wallet store

Add to `wallet-store.ts`:

```typescript
type TxRecord = {
  hash: `0x${string}`;
  to: `0x${string}`;
  value: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
  chainId: number;
};

// In store:
transactions: TxRecord[];  // max 50, newest first
```

Actions:
- `addTransaction(tx: TxRecord)` — prepend to list
- `updateTransaction(hash, status)` — update status
- `getRecentTransactions()` — return last 20

Display in WalletPanel with status badges (pending=yellow, confirmed=green, failed=red).

## Task 3.3: USDC transfer example skill

**Create `.opencode/skills/web3/usdc-transfer.md`:**

```markdown
# USDC Transfer

## What this skill does
Send USDC to any address on Base or Base Sepolia. The agent prepares an ERC-20 transfer transaction and the user approves it in their wallet panel.

## Contract addresses
- Base Sepolia: 0x036CbD53842c5426634e7949541eC2318f3dCF7e
- Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- Decimals: 6

## How to use
1. Ask the user for the recipient address and amount
2. Calculate the raw amount: amount * 10^6 (USDC uses 6 decimals)
3. Encode the ERC-20 transfer call:
   - function: transfer(address to, uint256 amount)
   - to: the recipient address
   - amount: the raw amount as a hex string
4. Call wallet_sendTransaction with:
   - to: USDC contract address
   - data: the encoded transfer call
   - value: "0" (no ETH, this is a token transfer)
5. The user will approve or reject in their wallet panel
6. Report the transaction hash to the user
```

## Task 3.4: TX pipeline integration test

Manual verification on Base Sepolia:
1. Connect wallet (Base Sepolia)
2. Start a session
3. Ask agent: "Send 1 USDC to 0x..."
4. Verify: TransactionApproval modal appears with correct details
5. Click Approve → verify TX hash returned to agent
6. Verify TX appears in wallet panel history
7. Repeat: ask agent to send again, but click Reject
8. Verify: agent reports "User rejected transaction"

## Task 3.5: Commit and push

```bash
git checkout dev
git pull origin dev
git checkout -b feat/tx-pipeline
git add -A
git commit -m "feat: on-chain TX pipeline — agent proposes, user approves, TX broadcast"
git push origin feat/tx-pipeline
```

Merge after feat/session-context lands.
