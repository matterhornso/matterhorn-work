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

## Continuation: named voice and shared runtime safeguards

Previous goal turn classified as **progress**: two local commits plus test evidence
were revalidated from current files. This continuation made further code changes:

- Voice resolves one named key at a time, preserving stored realtime/general
  and inherited fallback order for unbound credentials. A bound unavailable,
  denied or disabled key blocks instead of falling back. No provider auth DB work.
- Bound voice requests require host-token authority before resolution; owner
  bearer credentials cannot consume the local STM grant. Unbound legacy voice
  behavior is retained. Error responses never include secret values.
- One default-off `MATTERHORN_WORK_STM_ENABLED` gate is checked by the shared
  `startServer` entry point used by embedded Electron and CLI/server startup.
  macOS loopback-only; unsupported/network modes reject connection/resolution.
  Disabled adapters retain metadata so existing bindings cannot silently become
  legacy credentials. No real opt-in flag has been set.
- Server, Electron and orchestrator now import one reserved legacy-key policy;
  Electron's missing `MATTERHORN_WORK_` prefix is fixed. STM's stricter process-
  control policy remains separate so unrelated legacy behavior is preserved.
- Added exactly one authenticated-descriptor rediscovery after 401, with no
  unbounded retry or response-provided URL. Still no secret-value cache.

Verification for this continuation:

- `pnpm --dir packages/stm-credentials test`: **16 passed**.
- `pnpm --dir apps/server exec bun test src/env-routes.e2e.test.ts src/voice-credential.test.ts src/stm-runtime.test.ts src/env-file.test.ts --timeout 15000`:
  **43 passed / 151 assertions**, isolated loopback fixtures only.
- Server TypeScript check and build: **passed**.
- Orchestrator typecheck and build: **passed**.
- Electron typecheck: **passed**; bridge check: **50 methods covered**.
- Found the cached pinned pnpm executable at
  `/Users/abhinavramesh/.cache/node/corepack/v1/pnpm/10.27.0/bin/pnpm.cjs`.
  `node <that-path> install --lockfile-only --offline --ignore-scripts --frozen-lockfile`
  **passed** using 10.27.0. This validates the lockfile without a fresh full install.

Remaining first-three-phase work is substantive, not a release formality:

1. Actual OpenCode MCP launch wiring: approved command/workspace identity,
   per-consumer injection, no persisted secret config, and existing permission
   enforcement. The tested spawn primitive is not yet its production launch path.
2. Guard against stale manually reintroduced bound names at generic legacy loader
   boundaries; do not mistake shared reserved-prefix parity for full STM isolation.
3. STM revisioned replacement/create semantics, metadata revisions/backend and
   durable restart state required by the plan are not implemented yet.
4. Prove rotation/restart safety against a pinned actual OpenCode runtime, then
   complete adversarial tests and broader regressions. OS/packaged acceptance and
   real-keychain tests remain separately gated. No release claim is made.

Goal remains active; nothing pushed, deployed, migrated, or enabled for real users.

## Continuation: revision-safe credential lifecycle

Previous turn classified as **progress**: inspected local commit `31ad10b007` and
the recorded remaining gates before implementation. No external state was changed.

Implemented in the isolated STM checkout:

- Additive metadata revisions derived from random storage identity/status, not
  secret bytes. No inventory schema migration or legacy response-shape change.
- Explicit create-only and revision-conditional replace API. Rotation uses DB
  compare-and-swap; competing create/replacement attempts cannot silently overwrite.
  Native STM rotations/revocations invalidate old integration revisions as well.
- Fixed, sanitized HTTP failure codes; cleanup failures are reported as metadata.
- Injectable fake keystore for `Store`, and isolated stores no longer create or
  chmod the real user's STM directory. Existing default keystore behavior remains.

Implemented in Matterhorn:

- Consent-required `saveCredential()` and host-token/read-only protected write
  endpoint. Neither transport nor server automatically retries writes. Ambiguous
  responses explicitly require metadata refresh before another write.
- Registry v2 stores backend, opaque revision and restart-required metadata;
  legacy v1 references remain protected and are normalized in memory. No secrets
  or value-derived hashes in the registry. New links require revisioned inventory.
- Registry payload size checked before writes. Successful replacement marks MCP
  bindings restart-required; voice resolves per call and does not require restart.
  This does not restart or erase a running process.

Verification:

- STM selected + lifecycle tests: **24 passed / 87 assertions**. Includes two real
  SQLite connections with one in-memory keystore to exercise competing writers.
- Cross-repository loopback run before the final additional create-race test:
  **25 passed / 99 assertions**, including actual Store + fake keystore -> STM
  HTTP handler -> Matterhorn create/link/resolve/replace/stale-write/revoke paths.
- Matterhorn adapter tests: **18 passed**.
- Server environment/voice/STM tests: **44 passed / 163 assertions**.
- Server typecheck/build, Electron typecheck, orchestrator typecheck: **passed**.
- STM CLI Bun JavaScript bundle: **passed**, 40 modules. This is a bundle check,
  not a native compiled binary or real keystore acceptance result.
- `git diff --check` passed in both repositories.

No real daemon descriptor, developer keystore or real credential was opened.
The tests' keystore operations were in-memory only; all database/descriptor files
were disposable. Existing original STM working-tree changes remain untouched.

Next: implement and verify the actual workspace-bound OpenCode MCP launch path,
guided by `docs/handoffs/stm-mcp-launch-boundary-2026-09-28.md`. Remaining gates
include safe restart/applied revision tracking, generic inheritance suppression,
permission/identity adversarial tests, full regression/security gates and separately
authorized OS acceptance. Goal remains ACTIVE; this is not a completed integration.

## Continuation: generic inheritance boundary

Verified the lifecycle checkpoint, then added a shared metadata-only, descriptor-
validated synchronous guard for existing synchronous spawn paths. It rejects
stale plaintext for STM-bound names (including case-fold aliases), malformed or
unsafe registries, even when the feature flag is disabled. It does not open the
daemon descriptor, contact STM, resolve values, or mutate the parent environment.
Missing registry leaves non-adopter behavior unchanged.

Wired the guard into Electron's generic environment builder, synchronous probes
and managed child launches; orchestrator's common spawn builder (also used by
Docker/container starts); server legacy injection helper and managed OpenCode
launch/restart. This intentionally rejects a plaintext conflict for operator
recovery; it does not silently choose a credential or remove saved data. Existing
processes keep their earlier snapshots. Filesystem metadata alone is not a
sandbox against malicious same-user code.

Verification commands and results:

- `pnpm --dir packages/stm-credentials test`: **21 passed**.
- STM `MATTERHORN_STM_ADAPTER_PATH=<local adapter> bun test
  test/selected-secrets.test.ts test/selected-secret-lifecycle.test.ts
  test/matterhorn-contract.test.ts`: **26 passed / 102 assertions**. Disposable
  loopback and in-memory keystore only; no real daemon or Keychain.
- In `apps/server`, `bun test src/env-file.test.ts src/env-routes.e2e.test.ts
  src/stm-runtime.test.ts src/voice-credential.test.ts
  src/managed-opencode.test.ts`: **50 passed / 186 assertions**. Includes inherited
  and explicit-override conflicts rejected before engine spawn, plus recovery and
  supervisor regressions. Test children are fixtures, not actual OpenCode.
- Server `tsc -p tsconfig.json --noEmit`, Electron `typecheck:electron`,
  orchestrator `typecheck`: **passed**.
- `node --test apps/desktop/electron/runtime.test.mjs`: **3 passed** (existing
  bridge/runtime tests, not complete desktop execution acceptance).
- `pnpm --dir apps/desktop check:electron`: **50 methods covered**.
- `git diff --check`: **passed** in both repositories.

Use pinned cached pnpm 10.27.0, not the machine-global pnpm 9, to reproduce.

Next task remains actual workspace-bound OpenCode MCP launch authorization and
transport wiring, with applied-revision/safe-restart proof. Do not mistake the
generic inheritance guard or a fixture child test for that completion. Full
regressions, packaging and authorized OS acceptance remain outstanding. Nothing
pushed, merged, deployed or enabled for users. Goal remains **ACTIVE**.
