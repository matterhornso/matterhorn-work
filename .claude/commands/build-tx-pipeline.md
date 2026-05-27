Read `.claude/rules/tx-pipeline.md` completely first. Then execute ALL 5 tasks IN ORDER:

1. Wire the full TX pipeline:
   - Modify TransactionApproval.tsx to listen for `matterhorn:tx-approval-request` CustomEvent
   - Modify the wallet MCP server (`packages/matterhorn-work-wallet-mcp/index.mjs`) to emit approval events and wait for UI response
   - Implement the complete flow: agent proposes TX → MCP emits event → modal renders → user approves/rejects → MCP returns result to agent

2. Add TX history to wallet-store.ts:
   - Add TxRecord type { hash, to, value, status, timestamp, chainId }
   - Add transactions[] array to store snapshot
   - Add addTransaction, updateTransaction, getRecentTransactions actions

3. Create `.opencode/skills/web3/usdc-transfer.md` — USDC transfer skill following the template in the rules file

4. Verify the pipeline by tracing through code paths (describe each step of the flow)

5. Run `git checkout -b feat/tx-pipeline && git add -A && git commit -m "feat: on-chain TX pipeline — agent proposes, user approves, TX broadcast" && git push origin feat/tx-pipeline`

IMPORTANT: Features 1 AND 2 must be merged first. If wallet-store.ts or SessionContextProvider.tsx don't exist yet, stop.
