Read `.claude/rules/wallet-extension.md` completely first. Then execute ALL 11 tasks IN ORDER:

1. Create `apps/app/src/react-app/infra/chains.ts` and `apps/app/src/react-app/infra/contracts.ts` — port chain config and USDC constants from the embedded source code in CLAUDE.md

2. Run `cd apps/app && pnpm add wagmi viem @tanstack/react-query`

3. Create `apps/app/src/react-app/domains/wallet/state/wallet-store.ts` — Zustand store following the extensions-store.ts pattern, with subscribe/getSnapshot/mutate

4. Create `apps/app/src/react-app/domains/wallet/WalletConnect.tsx` — connect button with wagmi hooks, truncated address, chain badge

5. Create `apps/app/src/react-app/domains/wallet/WalletPanel.tsx` — collapsible sidebar panel with balance and recent TXs

6. Create `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx` — modal for TX approval with Approve/Reject

7. Create `packages/matterhorn-work-wallet-mcp/package.json` and `packages/matterhorn-work-wallet-mcp/index.mjs` — MCP server with wallet_connect, wallet_sendTransaction, wallet_signMessage, wallet_getBalance

8. Register MCP in `.opencode/opencode.json` or `apps/app/.opencode/opencode.json`

9. Create `apps/app/src/react-app/domains/wallet/state/wallet-store.test.ts` — vitest unit tests

10. Run `pnpm --filter @matterhorn-work/app typecheck` to verify no type errors

11. Run `git checkout -b feat/wallet-extension && git add -A && git commit -m "feat: wallet extension — connect, panel, MCP server, TX approval" && git push origin feat/wallet-extension`

After each task, report what files were created/modified and whether the step succeeded. If any step fails, stop and explain why before continuing.
