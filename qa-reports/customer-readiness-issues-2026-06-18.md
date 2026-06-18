# Matterhorn Work Customer-Readiness Issue Ledger - 2026-06-18

Test source: latest `origin/dev` clean worktree.

## Summary

- `CR-QA-001` fixed and retested: the session page no longer exposes raw OpenCode/unconfigured-engine JSON to customers.
- `CR-QA-002` retested: the initial `pnpm dev:headless-web` failure was not reproducible after rerun; the default wrapper started, server health passed, Vite returned 200, and browser session creation succeeded.

## CR-QA-001: Session startup error exposed raw OpenCode copy

- Severity: P2
- Area: UI
- Status: retested
- Commit tested: `2cb5bea52326102612f25a7b97df2dbd56b65345`
- Repro: Start the app against a server workspace with no engine base URL, open `/workspace/<id>/session`, click the icon-only `New task` button.
- Expected: Customer-facing copy says the Matterhorn Work engine is unavailable and gives a clear retry/restart action.
- Actual: The browser showed `OpenCode unavailable` and then raw JSON containing `{"code":"opencode_unconfigured","message":"OpenCode base URL is missing for this workspace"}`.
- Evidence: In-app browser text before fix contained `OpenCode unavailable`, `opencode_unconfigured`, and `OpenCode base URL is missing for this workspace`.
- Fix branch/PR: `codex/full-customer-readiness-qa` pending PR.
- Retest command or browser path: `pnpm test:opencode-abstraction-copy`; `pnpm --filter @matterhorn-work/app typecheck`; `pnpm test:customer-readiness-ui`; `pnpm test:market-execution-safety-gate`; in-app browser reload plus `New task` click.
- Retest result: Fixed. Browser text now contains `Matterhorn Work engine unavailable` and does not contain `opencode_unconfigured` or `OpenCode base URL`.

## CR-QA-002: Headless web dev wrapper exits before full browser QA

- Severity: P2
- Area: UI
- Status: retested
- Commit tested: `2cb5bea52326102612f25a7b97df2dbd56b65345`
- Repro: Run `pnpm dev:headless-web` from a clean worktree.
- Expected: The documented full local stack starts and stays alive so browser/session/chat QA can be run against the same command a tester would use.
- Actual: The first local wrapper run exited early after printing selected ports. Reruns outside the sandbox with local loopback access were healthy.
- Evidence: Retest showed `pnpm dev:headless-web` serving Matterhorn Work at `http://127.0.0.1:55730/`; `GET /health` returned `{"ok":true,"version":"0.13.12","opencodeVersion":"1.14.38",...}` and the browser created session `ses_126a7689cffeoKDIYd06RLSsak` with the composer visible.
- Fix branch/PR: No code fix required; not reproducible after rerun. Keep this item as a retest note because local loopback commands can fail inside the sandbox and should be rerun outside it before being treated as product defects.
- Retest command or browser path: `pnpm dev:headless-web`, then browser route/session/chat QA.
- Retest result: Passed outside sandbox. The documented wrapper starts, Vite returns 200, server health returns ok, and browser session creation works.

## Issue Template

```markdown
## CR-QA-001: Short title

- Severity: P0 | P1 | P2 | P3
- Area: CI | API | MCP | CLI | Bittensor | Hyperliquid | Polymarket | UI | Security | Docs
- Status: open | fixed | retested | accepted
- Commit tested:
- Repro:
- Expected:
- Actual:
- Evidence:
- Fix branch/PR:
- Retest command or browser path:
- Retest result:
```
