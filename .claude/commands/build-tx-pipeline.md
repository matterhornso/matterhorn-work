# Build Command — TX Pipeline

**IMPORTANT: After EVERY task, run the verification step. No skipping.**

**PREREQUISITE CHECK:**
```bash
ls apps/app/src/react-app/domains/wallet/state/wallet-store.ts apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx 2>/dev/null && echo "PREREQ OK" || echo "PREREQ FAIL — Features 1 and 2 must be merged first"
```
**STOP if prerequisite fails.**

---

## Task 3.1: Wire TX approval pipeline

Modify `TransactionApproval.tsx` to listen for `matterhorn:tx-approval-request` CustomEvent.
Modify `packages/matterhorn-work-wallet-mcp/index.mjs` to emit approval events and wait for UI response.

Follow the pattern in `.claude/rules/tx-pipeline.md`.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -iE "TransactionApproval|tx-approval" | head -5
# Expected: no type errors

# Test MCP still works after modifications
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1 | head -1
# Expected: valid JSON response
```

---

## Task 3.2: Add TX history to wallet store

Add `TxRecord` type and `transactions[]` array to `wallet-store.ts`.
Add `addTransaction`, `updateTransaction`, `getRecentTransactions` actions.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app exec vitest run apps/app/src/react-app/domains/wallet/state/wallet-store.test.ts 2>&1 | tail -5
# Expected: all tests pass
```

---

## Task 3.3: Create USDC transfer skill

Create `.opencode/skills/web3/usdc-transfer.md` following the template in `.claude/rules/tx-pipeline.md`.

**VERIFY:**
```bash
ls .opencode/skills/web3/usdc-transfer.md && cat .opencode/skills/web3/usdc-transfer.md | head -5
# Expected: file exists, has title "USDC Transfer"
```

---

## Task 3.4: Full build check

```bash
pnpm --filter @matterhorn-work/app typecheck && pnpm --filter @matterhorn-work/app build
# Expected: both succeed
```

---

## Task 3.5: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/tx-pipeline
git add -A
git commit -m "feat: on-chain TX pipeline — agent proposes, user approves, TX broadcast"
git push origin feat/tx-pipeline
```
