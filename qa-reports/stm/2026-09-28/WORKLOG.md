# STM integration worklog — 28 September 2026

## Goal and scope

User requested a goal and implementation of slices 1, 2, 3 using the STM plan.
The plan defines two product slices but three initial engineering phases.
An asynchronous scope question is pending; work so far is the shared foundation
for engineering phases 1–3 (selected contract, adapter, runtime boundary).
Brokered HTTP and AI-provider authentication have not been implicitly added.

Matterhorn branch: `codex/stm-tool-secrets-2026-09-28`, based on
`dac794dfbfb71348861b8c4ccd99cc4adc14e45f`. This includes the unapproved #1026
baseline; rebase onto the approved release before opening an independent STM PR.
No changes to #1026, no push/merge/deployment or real credential operations.

STM clean isolated clone: `/Users/abhinavramesh/Documents/Matterhorn-work/stm-integration-2026-09-28`,
branch `codex/matterhorn-selected-secrets-2026-09-28`, base
`a7c5d7aac8893761ea17684998b0a429aebea443`.
Original `/Users/abhinavramesh/subscribetome` dirty tracked/untracked work preserved.

## Implemented checkpoint

1. Additive STM authenticated selected-resolution and metadata contract; bounded
   inputs/values, alias validation, full prevalidation and sanitized failures.
2. Shared dependency-free Matterhorn adapter: private descriptor reads, version
   handshake, metadata registry, explicit consent, conflict checks, no value cache,
   no redirects, bounded fetches, metadata available offline, no plaintext fallback.
3. Host-token-only server status/inventory/link/unlink endpoints with read-only
   and consumer-allowlist checks. No raw-value endpoint. Legacy behavior unchanged
   when no trusted STM instance is supplied; names-only contract preserved.
4. Consumer-specific spawn primitive with authorization callback. Real disposable
   child test shows selected injection and exclusion of another consumer's key.
   **Not yet wired to Electron/OpenCode/orchestrator production execution.**

## Verification so far

- Cross-repository real loopback handler + Matterhorn adapter + disposable child,
  plus STM selected contract: 18 tests / 56 assertions passed after final changes.
  Command in STM checkout: `MATTERHORN_STM_ADAPTER_PATH=/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime/packages/stm-credentials/index.mjs bun test test/selected-secrets.test.ts test/matterhorn-contract.test.ts`.
  In-memory keystore only; not real-keychain or packaged-daemon acceptance.
- Adapter: `pnpm --dir packages/stm-credentials test`: 14 Node tests passed,
  including actual disposable child spawn, stale lock and response bounds.
- Server: `pnpm --dir apps/server exec bun test src/env-routes.e2e.test.ts src/env-file.test.ts --timeout 15000`:
  36 tests / 112 assertions passed. Valid owner tokens correctly receive 401 on
  host-token-only STM routes, consistent with the existing environment routes.
- `pnpm --dir apps/server exec tsc -p tsconfig.json --noEmit`: passed.
- `pnpm --dir apps/server build`: passed, including crypto SDK prebuild.
- `git diff --check`: passed in both checkouts.
- Total focused tests: 68 passed. Earlier intermediate test/type errors were
  corrected and rerun; they are not counted as acceptance successes.
- No browser/UI, full platform gate, packaged desktop, real keychain, hosted,
  provider, wallet or external-chain acceptance is claimed.

Environment findings: global pnpm is 9.15.9 while repository pins 10.27.0.
An offline lockfile-only command prompted for module replacement and did not run.
No modules were removed. Added the single workspace link and lockfile importer
explicitly; validate a frozen install with the pinned pnpm before release.
Initial legacy route tests tried the default auth DB and were denied by sandbox;
the test fixture now explicitly isolates auth/rate-limit/data roots. Loopback
tests then required escalation due sandbox port binding; isolated rerun passed.

## Next work / open release gates

1. Confirm meaning of requested slices. Keep product scope narrow until clarified.
2. Design actual OpenCode MCP spawn integration: OpenCode owns subprocess startup,
   so do not inject selected secrets into Electron global env, all children or
   persisted OpenCode config. Bind permission + consumer identity at that boundary.
3. Wire supported runtime paths behind one explicit default-off feature flag;
   refuse unsupported paths. Current trusted dependency injection is development-only.
4. Complete named voice resolution, legacy-loader reserved-prefix parity, complete
   metadata compatibility, stale-token retry and restart semantics.
5. Additional adversarial tests: multi-process/crash lock recovery, slow/redirect/
   oversized HTTP replies, malformed registry, consumer permission revocation.
6. STM create/replace semantics, scoped authority and explicit migration are not
   complete. Settings/UI and real migration are separate following phases.
7. Real disposable macOS Keychain and compiled binary acceptance requires its own
   explicit execution approval. Do not touch the developer's vault automatically.
8. Full regressions and security review, clean approved baseline, then reviewable
   paired PRs. No production enablement before these gates.

Status: foundation implemented and tested; goal remains ACTIVE, not release-ready.
