# Build All — Full Crypto Injection Pipeline

This command orchestrates all 5 features in dependency order. Each phase has a hard verification gate. If any verification fails, stop and fix before proceeding.

---

## PHASE 1: Wallet Extension

Execute `/build-wallet` (read `.claude/commands/build-wallet.md`).

**GATE CHECK before proceeding:**
```bash
ls apps/app/src/react-app/domains/wallet/state/wallet-store.ts \
   apps/app/src/react-app/domains/wallet/WalletConnect.tsx \
   apps/app/src/react-app/domains/wallet/WalletPanel.tsx \
   apps/app/src/react-app/domains/wallet/TransactionApproval.tsx \
   packages/matterhorn-work-wallet-mcp/index.mjs \
   apps/app/src/react-app/infra/chains.ts \
   apps/app/src/react-app/infra/contracts.ts \
   2>/dev/null | wc -l
# Expected: 7

node -e "const p=require('./apps/app/package.json'); console.log(p.dependencies?.wagmi?'YES':'NO')" 2>/dev/null
# Expected: YES
```

**ALL 8 checks must pass.** If any file is missing or wagmi isn't installed, do NOT proceed.

---

## PHASE 2: Session Context

Requires: Phase 1 complete.

Execute `/build-session-context` (read `.claude/commands/build-session-context.md`).

**GATE CHECK:**
```bash
ls apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
# Expected: EXISTS
```

---

## PHASE 3: TX Pipeline

Requires: Phase 1 + Phase 2 complete.

Execute `/build-tx-pipeline` (read `.claude/commands/build-tx-pipeline.md`).

**GATE CHECK:**
```bash
ls .opencode/skills/web3/usdc-transfer.md 2>/dev/null && echo "EXISTS" || echo "MISSING"
# Expected: EXISTS

# Verify MCP still runs
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1 | head -1 | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print('OK' if 'result' in d else 'FAIL')" 2>/dev/null
# Expected: OK
```

---

## PHASE 4: Web3 Skills

Requires: Phase 3 complete (needs TX pipeline context, but skills are standalone).

Execute `/build-web3-skills` (read `.claude/commands/build-web3-skills.md`).

**GATE CHECK:**
```bash
ls .opencode/skills/web3/*.md 2>/dev/null | wc -l
# Expected: 25
```

---

## PHASE 5: Agent Marketplace

Requires: Phase 1 complete (wallet gate only).

Execute `/build-marketplace` (read `.claude/commands/build-marketplace.md`).

**GATE CHECK:**
```bash
ls apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx \
   apps/app/src/react-app/domains/settings/state/marketplace-store.ts \
   apps/app/src/react-app/domains/settings/data/agent-blueprints.ts \
   2>/dev/null | wc -l
# Expected: 3
```

---

## FINAL VERIFICATION

```bash
pnpm --filter @matterhorn-work/app typecheck && echo "TYPECHECK PASS" || echo "TYPECHECK FAIL"
pnpm --filter @matterhorn-work/app build && echo "BUILD PASS" || echo "BUILD FAIL"
```

Both must pass.

---

## CRITICAL RULES (read before starting any phase)

1. **Verify after every task.** Each task in each build command has a VERIFY step. Run it. Check it. Fix if it fails.
2. **Never skip verification.** Hours of work without verification = wasted time.
3. **pnpm only.** Never npm or yarn.
4. **Typecheck after every file.** `pnpm --filter @matterhorn-work/app typecheck` catches 90% of errors.
5. **Commit after each phase.** Each phase produces its own branch. Push it.
6. **Do NOT rename openwork.extension.* keys.**
7. **Use vi.mock() for wagmi tests.** See `.claude/rules/wagmi-testing.md`.
8. **Test the MCP server with echo/printf.** See `.claude/rules/mcp-testing.md`.
9. **ERC-20 transfers: to=USDC contract, value=0, data=encoded transfer.** See `.claude/rules/contract-interaction.md`.
10. **If you don't know how to verify something, stop and ask.** Do not proceed blindly.
