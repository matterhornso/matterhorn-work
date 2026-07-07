# Overnight Backend Control Plane Build - 2026-07-07

## Current Merged State

Base branch: `origin/dev`

Latest merged head at handoff time:

```text
bf0cecd0 Include sanitized model samples in support report (#685)
d5bfbd4f Default server CORS to loopback origins (#684)
cdbe4e95 Validate workspace model selections against catalog (#683)
0812fad3 Mark project ledger export as working (#682)
5e899945 Route profile feedback through local dialog (#681)
a5943ed7 Show team access status in profile capabilities (#680)
948df453 Use Matterhorn logo assets in app shell (#679)
721117fb Clarify settings data policy summary (#678)
57676266 Clarify model readiness settings (#677)
203fefd1 Use readable Sui output titles (#676)
5e2a8bfd Harden Sui workflow state (#675)
99799085 Report Sui in wallet runtime contract (#674)
63f61445 Add OpenCode chat metadata to project ledger (#673)
320015e0 Make desk starters launch tasks directly (#672)
```

All PRs above were merged into `dev` after passing GitHub checks. Local `gh pr merge --squash --delete-branch` often exits nonzero because another worktree owns local `dev`; verify merges with `gh pr view <number> --json state,mergedAt,mergeCommit` and `git fetch origin dev`.

## What Changed

- Desk starter tasks now send immediately instead of only filling the composer.
- Project data ledger includes OpenCode runtime chat metadata and working redacted JSON export status.
- Sui wallet capability is represented by wallet runtime, with hardened workflow state and readable output titles.
- Settings > AI has a summary-first model readiness panel explaining current picker choice, workspace default, engine fallback, and provider catalog source.
- Settings > Overview has clearer data policy copy: no training by default, explicit feedback-only collection, export/delete counts, and collapsed storage details.
- Web tab and notification identity now prefer Matterhorn logo assets.
- Profile backend capability status now shows cloud account, local teammate access, and cloud teammates from the backend contract.
- Profile feedback now opens the local structured feedback dialog, keeping feedback in the workspace ledger by default.
- Workspace model selection now validates provider/model IDs against the live OpenCode catalog when available.
- Server CORS now defaults to `loopback`, allowing localhost/127.0.0.1 dev ports while avoiding implicit wildcard browser access. Explicit `--cors *` and env/config wildcard still work.
- Backend support reports now include sanitized provider/model samples and default model hints without credentials or full provider payloads.

## Verification Highlights

Representative local checks run during the build:

```bash
bun test apps/app/tests/model-readiness-summary.test.ts apps/app/tests/backend-capability-ui-contract.test.ts apps/app/tests/backend-capability-ui.test.ts
bun test apps/app/tests/settings-overview-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/app/tests/matterhorn-logo-contract.test.ts
bun test apps/app/tests/project-feedback-ui-contract.test.ts apps/app/tests/backend-capability-ui.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/server/src/project-data-ledger-routes.e2e.test.ts
bun test apps/server/src/backend-control-plane.e2e.test.ts apps/app/tests/model-readiness-summary.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/server/src/config.compat-aliases.test.ts apps/server/src/env-routes.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts
./apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
./apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
```

GitHub checks passed for each PR: `i18n-audit`, `openwork-tests` on Linux and macOS, and `customer-crypto-gates`.

## Remaining Open Work

1. **Full browser smoke on latest `origin/dev`**
   - Start the local web app and Matterhorn server.
   - Confirm login/session routing, desk task start, run history, Notes/Memory side panels, Settings > AI/Profile/Overview, support report download, and Sui wallet panel behavior.

2. **Model selection prompt path unification**
   - Backend can save a workspace default model and validate it against OpenCode catalog.
   - Confirm the actual session send path consumes the server workspace default, not only local picker state, or document the remaining handoff clearly in Settings.

3. **Sui direct wallet completion**
   - Web has Sui wallet-standard preview wiring and receipt evidence.
   - Desktop/Electron still uses external handoff semantics. Decide whether to support direct wallet-standard connection in desktop webview or keep external signing only.

4. **Teams beyond local tokens**
   - Local teammate access is represented truthfully.
   - Durable cloud teammates remain `needs_setup` / preview. Build only after product decision on Matterhorn Cloud org/team model.

5. **Data retention/delete UX**
   - Feedback delete and output delete have concrete controls.
   - Ledger policy still correctly marks deletion as preview because append-only audit/task events are retained. Decide whether a per-store retention page is needed.

6. **Production CORS migration check**
   - Default is now `loopback`; explicit wildcard remains available.
   - Verify desktop packaging and any deployed web/dev scripts do not rely on implicit `*`.

## Suggested Next Build

Start with a browser smoke and model prompt-path audit:

1. From fresh `origin/dev`, start the Matterhorn server and app.
2. In the web app, set a workspace default model in Settings > AI.
3. Start a desk task and inspect the outgoing session prompt request to confirm whether it uses:
   - workspace default model,
   - local picker override,
   - or engine fallback.
4. If the prompt path still uses only local prefs, wire the session route to read `GET /workspace/:id/backend/model-selection` / `GET /workspace/:id/backend/models` and use the effective model for sends.

## Scratch File / Worktree Caution

Do not delete untracked scratch or parallel-agent files. This repo has had multiple concurrent Kimi/MiniMax/Codex lanes. If GitHub merge commands fail locally with a `dev` worktree warning, check PR state remotely instead of forcing local `dev`.
