# Final Evidence UI Integration - 2026-07-06

## Branch

- Integration branch: `codex/evidence-ui-final-integration`
- Base: `origin/dev` at `e3a9127c`, plus the existing platform shell cleanup commit `f34f39d7`
- Kimi and MiniMax had no open GitHub PRs when this cleanup pass started; their local branch work and handoff docs were consolidated into this branch.

## What was consolidated

- Platform shell and shared shadcn primitive cleanup from `kimi/platform-shell-ui-cleanup`
- Project Activity / Run Detail Drawer cleanup from `kimi/run-detail-activity-drawer`
- Local engine reliability and task start flow polish from `minimax/engine-task-flow-polish`
- Outputs receipt wiring and activity-to-output bridging from the Codex integration lane

## Product outcome

- Project Activity now reads as an evidence trail, not a raw task log.
- Activity rows open a run detail drawer with timing, desk, session, task, source, failure detail, and output receipts where available.
- Start-only events use honest copy: `Run started` plus `No output recorded yet.`
- Outputs panel consumes workflow receipts so activity, workflow stages, and output files share the same evidence story.
- Workflow stage cards hide raw prompts and show user-facing stage/objective/output/evidence details.
- Memory review is simplified into a review queue with compact filters and collapsed manual capture.
- Notes, Memory, Recent Activity, Outputs, token prices, and extensions use a shared local-engine error state.
- MCP docs links now send users to GitHub docs instead of expanding long docs inside the app.
- Broad app surfaces were made less boxy by tightening shared shadcn primitives, settings sections, wallet panels, workspace modals, and session shell surfaces.

## Verification

```bash
bun test apps/app/tests/recent-activity-contract.test.ts apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/output-descriptor.test.ts apps/app/tests/output-receipts.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/workflow-stage-card.test.ts apps/app/tests/memory-panel-ui-contract.test.ts apps/app/tests/notes-integration-contract.test.ts
```

Result: 86 pass, 0 fail.

```bash
bun test apps/app/tests/
```

Result: 188 pass, 0 fail.

```bash
CI=true npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
```

Result: passed.

```bash
CI=true npx pnpm@10.27.0 smoke:customer-ready-crypto --offline --strict
```

Result: READY. The customer onboarding UI contract was updated to match the new GitHub-linked MCP docs behavior instead of requiring inline example prompts.

Browser smoke on `http://127.0.0.1:5175/workspace/ws_d52295617e23/session`:

- Home Project Activity rendered real local evidence rows.
- Activity rows showed `Run started`, not `Task Started`.
- No `Ready Start task` pair was visible.
- No technical prompt copy was visible.
- Opening the first activity row showed the run detail drawer with recorded time, relative time, desk, session, task, event, source, and `No output recorded yet.`
- No browser console errors were reported.

## Excluded local files

The following local runtime artifacts were intentionally not staged:

- `.matterhorn-work/notes/index.json`
- `.matterhorn-work/task-logs/**`
- `test-results/.last-run.json`

## Remaining product choices

- Whether old duplicate start-only rows should be grouped in the Project Activity trail.
- Whether stale start-only runs should get an explicit stale label after a time threshold.
- Whether Memory should remain a right-side review panel only or also get a full workspace route.
- Whether Outputs unification should later include durable workflow receipts beyond local server evidence events.
