# Build Command — Wallet Extension

**IMPORTANT: After EVERY task, run the verification step. Do NOT skip verification. If verification fails, STOP — fix it — re-verify — then continue.**

## Task 1.1: Port chain config and contracts

Read `.claude/rules/wallet-extension.md` for the exact file contents.

- Create `apps/app/src/react-app/infra/chains.ts`
- Create `apps/app/src/react-app/infra/contracts.ts`

**VERIFY:**
```bash
ls apps/app/src/react-app/infra/chains.ts apps/app/src/react-app/infra/contracts.ts
# Expected: both files exist

node -e "import('./apps/app/src/react-app/infra/chains.ts').then(m => console.log('EXPORTS:', Object.keys(m).join(', ')))" 2>&1
# Expected: EXPORTS: MATTERHORN_CHAINS, CHAIN_NAMES, DEFAULT_CHAIN (or similar)

node -e "import('./apps/app/src/react-app/infra/contracts.ts').then(m => console.log('EXPORTS:', Object.keys(m).join(', ')))" 2>&1
# Expected: EXPORTS: USDC_BY_CHAIN, USDC_DECIMALS, RECEIVER_ADDRESS, ERC20_TRANSFER_ABI
```

**STOP if either import fails.**

---

## Task 1.2: Install wagmi + viem

```bash
cd apps/app && pnpm add wagmi viem @tanstack/react-query && cd ../..
```

**VERIFY:**
```bash
node -e "const p = require('./apps/app/package.json'); const d = p.dependencies || {}; console.log('wagmi:', d.wagmi ? 'YES' : 'NO', 'viem:', d.viem ? 'YES' : 'NO', 'tanstack:', d['@tanstack/react-query'] ? 'YES' : 'NO')"
# Expected: wagmi: YES viem: YES tanstack: YES
```

**STOP if any dep is missing.**

---

## Task 1.3: Create wallet Zustand store

Create `apps/app/src/react-app/domains/wallet/state/wallet-store.ts`. Follow the extensions-store.ts pattern exactly.

**VERIFY:**
```bash
ls apps/app/src/react-app/domains/wallet/state/wallet-store.ts
# Expected: file exists

pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "wallet-store" | head -5
# Expected: no type errors mentioning wallet-store (empty output = good)
```

**STOP if typecheck fails.**

---

## Task 1.4: Create WalletConnect component

Create `apps/app/src/react-app/domains/wallet/WalletConnect.tsx`.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "WalletConnect" | head -5
# Expected: no type errors mentioning WalletConnect
```

---

## Task 1.5: Create WalletPanel component

Create `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "WalletPanel" | head -5
# Expected: no type errors
```

---

## Task 1.6: Create TransactionApproval component

Create `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "TransactionApproval" | head -5
# Expected: no type errors
```

---

## Task 1.7: Create wallet MCP server

Create `packages/matterhorn-work-wallet-mcp/package.json` and `packages/matterhorn-work-wallet-mcp/index.mjs`.

Follow the exact pattern in `.claude/rules/mcp-testing.md`.

**VERIFY:**
```bash
# Test 1: Server starts
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1 | head -1
# Expected: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"0.1.0"... (valid JSON)

# Test 2: Tools list
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1 | grep "wallet_connect"
# Expected: output contains wallet_connect (means tools are listed)
```

**STOP if either test fails — fix the MCP server.**

---

## Task 1.8: Register wallet MCP

Find the opencode config file (check `.opencode/opencode.json`, `apps/app/.opencode/opencode.json`, or `opencode.jsonc`). Add wallet MCP registration.

**VERIFY:**
```bash
grep -r "matterhorn-work-wallet-mcp" . --include="*.json" --include="*.jsonc" 2>/dev/null | head -1
# Expected: at least one match showing the wallet MCP is registered
```

---

## Task 1.9: Wallet unit tests

Create `apps/app/src/react-app/domains/wallet/state/wallet-store.test.ts` using vitest.

Follow `.claude/rules/wagmi-testing.md` for mocking patterns.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app exec vitest run apps/app/src/react-app/domains/wallet/state/wallet-store.test.ts 2>&1
# Expected: tests pass (all green)
```

**STOP if tests fail.**

---

## Task 1.10: Full typecheck and build

```bash
pnpm --filter @matterhorn-work/app typecheck
# Expected: no errors

pnpm --filter @matterhorn-work/app build
# Expected: build succeeds
```

**STOP if typecheck or build fails.**

---

## Task 1.11: Commit and push

```bash
git checkout -b feat/wallet-extension
git add -A
git commit -m "feat: wallet extension — connect, panel, MCP server, TX approval"
git push origin feat/wallet-extension
```

**VERIFY:**
```bash
git log --oneline -1
# Expected: shows the feat commit
```

**CRITICAL: If ANY verification step fails, STOP immediately. Fix the error. Re-run verification. Only proceed when it passes. Do NOT skip verification steps.**
