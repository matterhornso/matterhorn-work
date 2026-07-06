# Backend Spine Overnight Handoff

Generated: 2026-07-07 02:52 IST, continuing the 2026-07-06 build window.

## Branch

- Repo: `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`
- Branch: `codex/project-activity-compact-history`
- Remote: `origin/codex/project-activity-compact-history`
- PR: #662
- Current head after this checkpoint: `deb8d3ee Auto-start desk task launchers`

Do not delete untracked scratch or parallel-agent files in sibling worktrees. This checkout was clean when this note was written.

## What Is Now Built

### Backend control plane and data policy

- Backend capability, model, data-map, data-controls, readiness, control-plane, support-report, team-access, and data-policy contracts are all exposed through server routes.
- Settings/Profile now consume the backend contract instead of static guesses for model routing, wallet status, storage locations, feedback use, team access, and security posture.
- Workspace data policy persists local feedback collection choice.
- Feedback is blocked when disabled by workspace policy.
- Model training remains `none_by_default`.

### Project data ledger and evidence

- Unified project data ledger reads project evidence, audit, and feedback.
- Ledger supports source, kind, desk, session, task, and time-window filters.
- Settings can export a redacted ledger JSON and a compact backend support report.
- Home Project Activity is compact by default and links to a full Run History route.
- Run History shows filtered runs, outputs, notes, memory, team access, wallet, chat, feedback, and audit rows without raw prompts or secret material.

### Outputs and receipts

- Outputs panel receives workflow output receipts from project evidence.
- Output files can be deleted one at a time through guarded server route `DELETE /workspace/:id/outputs?path=...`.
- Output deletion requires collaborator scope, writable server, and path containment under `outputs/`.
- Output deletion writes audit and project data ledger rows.

### Memory, notes, and feedback safety

- Memory write routes are collaborator/writable guarded and audited.
- Workspace memory APIs are reflected in data controls.
- Notes remain workspace-local markdown plus `.matterhorn-work/notes/index.json`.
- Structured local feedback is stored for eval, routing, and product quality only.
- Feedback bulk delete is exposed in Settings and audited.

### Wallet and Sui

- Wallet families are reported separately: EVM, Sui, Bittensor.
- Sui uses Mysten dApp Kit in the React app.
- Sui account/balance read routes exist.
- Sui transaction preview and receipt routes exist globally and per workspace.
- Sui workspace preview/receipt writes output evidence and wallet ledger rows.
- Wallet Settings includes Sui wallet-standard connect plus a Sui workflow panel that also works with a public sender address for desktop/watch-only flows.
- Signing stays in the user's Sui wallet. Matterhorn does not store keys, seed phrases, signatures, signed payloads, or wallet exports.

### Task launch UX

- Focused desk task cards already started tasks immediately.
- This checkpoint also makes protocol rail, Monday demo, and blank workflow launchers pass `sendImmediately: true` when they create a new task.
- Existing in-session desk starters now use clearer composer-handoff copy: open chats fill the composer so the user can add context before pressing Ask.

## Commits In This Segment

- `9c311cfa Add guarded output deletion route`
- `fd86150a Wire output deletion into Outputs panel`
- `ef65bba4 Add workspace data policy controls`
- `6c366545 Expose workspace data policy in settings`
- `deb8d3ee Auto-start desk task launchers`

Earlier branch commits also include model selection, feedback deletion, wallet evidence controls, metadata-only chat ledger rows, team access support reports, and compact project activity/history.

## Verification

Latest verification at this checkpoint:

```bash
bun test apps/app/tests/
# 253 pass, 0 fail

bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/tools/sui.test.ts apps/server/src/project-evidence-routes.e2e.test.ts
# 77 pass, 0 fail

./apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
# pass

./apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
# pass
```

## Remaining Product Decisions

- Whether Sui desktop should stay public-address plus external wallet handoff, or whether to prioritize WalletConnect/deep-link signing for desktop.
- Whether Sui should graduate from `preview` to `working` only after live wallet signing is smoke-tested in web.
- Whether full team collaboration should remain local-token-only for v1 or move to Matterhorn Cloud invites/org membership.
- Whether memory should remain a machine-global vault with workspace tags or move to physically workspace-scoped storage.
- Whether append-only task/audit/history retention needs a user-facing retention window, beyond export plus per-store deletion controls.

## Next Build Candidate

Recommended next slice: live browser smoke of the current PR with the local app, specifically:

1. Home compact Project Activity opens Run History.
2. Bittensor/Hyperliquid/Polymarket focused desk task starts a real run.
3. Sui wallet panel can read a public testnet address and save preview evidence.
4. Outputs panel shows that Sui preview and can delete one output file.
5. Settings support report and ledger export download without secrets.

After that, merge PR #662 if CI is green.
