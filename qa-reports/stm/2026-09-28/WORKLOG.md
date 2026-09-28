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

## Continuation: approved MCP launch path and revision snapshots

Previous turn classified as **progress**: commits `e1db7edbcd` (Matterhorn) and
`d0cdb943f3` (STM), working-tree/test evidence rechecked before new work.

Implemented:

- STM's opt-in resolution snapshots couple each value to the same inventory
  row's revision. No value-derived hash or separate metadata/value race. Legacy
  selected responses remain compatible; unsupported snapshot requests fail closed.
- Private metadata-only MCP launch grants: canonical workspace, reviewed absolute
  executable/arguments, launcher, exact binding IDs, revocation and active launch
  revision/PID metadata. Same-name other workspace is denied. Grant creation
  partially failing never yields an executable grant; only its new references
  are cleaned up, not underlying keys.
- Host-only local approval endpoint reuses MCP configuration approval, writes
  only launcher command plus opaque ID, and never automatically reloads/restarts
  an in-flight tool. Ordinary bearer tokens and read-only requests are rejected.
- Actual stdio launcher checks current project MCP configuration before resolving
  and before spawning. Altered/disabled/removed config, missing bindings, disabled
  flag or revoked grant fails closed. Only the approved child receives secrets.
  Child stderr is not piped into application/support logs. Existing OpenCode
  model/tool permission enforcement remains in place; denial acceptance still
  must be proven with a model-driven engine test.
- One active launch per grant. Rotation marks restart pending; an existing child
  retains its earlier snapshot. A later start receives current values/revisions;
  acknowledgement cannot clear a concurrently newer revision's pending flag.
  Exit bookkeeping clears only that launch's active ID. Crashes can leave a
  fail-closed active record; safe operator recovery remains a required follow-up.
- Source Node/Bun entry plus self-contained compiled Bun launcher. macOS Electron
  build stages an architecture-named launcher; shell passes only a known packaged
  resource path, never a renderer/PATH-selected runtime. Missing executable means
  unavailable. Server binary build includes a sibling launcher. Signed packaging,
  cross-architecture and orchestrator distribution still need verification.

Observed verification:

- Adapter tests: **23 passed**, including real disposable child snapshot rotation,
  simultaneous-launch refusal, cross-workspace denial, binding removal and revoke.
- STM selected/lifecycle + real-Store/fake-keystore HTTP interoperability:
  **27 passed / 105 assertions**.
- Server targeted run: **53 passed / 220 assertions**, seven test files including
  MCP configuration and actual stdio fixture; source launcher completed initialize,
  tool list and harmless tool call using fake credentials.
- Server typecheck, Electron typecheck and orchestrator typecheck passed.
- Electron packaging source gate passed, including retaining the architecture-
  appropriate STM executable through after-pack pruning. This is source-level
  packaging evidence, not a signed app install/launch result.
- Native macOS launcher compiled (26 modules) and completed the same isolated
  stdio test: **1 passed / 14 assertions**. Temporary build at
  `/private/tmp/matterhorn-stm-launcher-TwCepA/matterhorn-stm-mcp`.
- The repository's existing desktop sidecar reports **1.18.30**, not the pin.
  Do not use it as 1.18.31 acceptance. A preexisting isolated cached binary at
  `/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode` reports **1.18.31**;
  SHA256 `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`.
- With `STM_TEST_OPENCODE_BIN=<that binary>` and
  `STM_TEST_COMPILED_LAUNCHER=<compiled path>`, the stdio E2E test passed:
  **1 passed / 21 assertions**. Real OpenCode connected via the compiled launcher
  and disconnected, then the direct fixture call succeeded. No provider was
  contacted. This proves runtime connection, **not engine-driven tool execution**.
- `git diff --check` passed. No real daemon, vault or keys were opened. Test HOME,
  OpenCode data/config/cache, descriptors, credentials and children were disposable.

Next (not optional release polish): model-driven tool call and denied-permission
proof through pinned OpenCode, host-route happy-path acceptance, safe crashed-
launcher recovery, status refresh for native STM rotation/revocation, stronger
failure/cancellation tests, compiled CLI/orchestrator/Electron distribution parity,
full regressions/security gates. Real Keychain and signed OS acceptance remain
separately authorized/unverified. Goal remains **ACTIVE**; no push/deploy/migration.

## Continuation: engine tool execution and approval race

Previous implementation turn classified as **progress**: current branch and
`d8b13bac7d` revalidated before continuing. The intervening Serena setup changed
only local Codex configuration, not these repositories. Serena tools are not yet
available in this running session; this work used existing local tools.

- Extended the actual pinned OpenCode test with a loopback synthetic inference
  provider. An allowed `fixture_probe` executes exactly once through the STM
  launcher; a denied call does not execute; a pending approval is visibly listed
  and rejection stops the turn without another inference call. The fixture logs
  only method/name so zero additional execution is independently observable.
- Fake credential/token sentinels remain absent from captured model requests,
  session history, engine/launcher output and direct MCP responses. The trusted
  fixture only returns credential presence/length, never the value. This does
  not prove arbitrary credential-holding tools cannot print their environment.
- Added host-route acceptance using real metadata registries and fake STM
  responses. Pending or denied approval creates no grant/binding or config change;
  successful approval writes a nonsecret grant, leaves the child stopped, and
  revocation preserves bindings while blocking future starts. No resolution
  occurs during any configuration action.
- Found and fixed a configuration-approval race: the route previously looked up
  the command only after approval. Now it snapshots the validated configuration
  before waiting and refuses changed commands before creating any grant. This
  supplements the existing recheck before writing configuration. It is not an
  OS sandbox or a filesystem-wide atomic transaction against same-user writers.

Verification for this checkpoint:

- Source launcher + pinned engine E2E: **1 passed / 60 assertions**.
- Host-route/config regression: **25 passed / 150 assertions**.
- Rebuilt native launcher at
  `/private/tmp/matterhorn-stm-acceptance-NstkI7/matterhorn-stm-mcp` (26 modules).
- Combined compiled-launcher/pinned-engine acceptance and seven targeted server
  suites: **54 passed / 299 assertions**:
  `STM_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode STM_TEST_COMPILED_LAUNCHER=/private/tmp/matterhorn-stm-acceptance-NstkI7/matterhorn-stm-mcp bun test src/env-file.test.ts src/env-routes.e2e.test.ts src/stm-runtime.test.ts src/voice-credential.test.ts src/managed-opencode.test.ts src/stm-mcp.test.ts src/stm-mcp-launch.e2e.test.ts --timeout 15000`
  (run from `apps/server`). Version rechecked **1.18.31** and SHA256 unchanged:
  `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`.
- Adapter: `node --test test/*.test.mjs` from `packages/stm-credentials`:
  **23 passed**. Server TypeScript check and `git diff --check`: **passed**.
- An initial E2E assertion incorrectly expected inference to continue after an
  explicit user rejection. Updated to assert the observed safe terminal rejection
  and five total inference calls; rerun passed. A refactor type-narrowing error
  was fixed without a type assertion and typecheck rerun successfully.

Next: safe crashed-launcher recovery and transient exit-bookkeeping contention;
external STM rotation/revocation metadata refresh; cancellation/failure tests;
compiled CLI/orchestrator/Electron distribution parity; full regressions/security
gates. Real Keychain and signed OS acceptance remain separately authorized and
unverified. No production flags, real keys, hosted state or upstream releases
changed. Goal remains **ACTIVE**, not release-ready.

## Continuation: external rotation/revocation metadata refresh

Previous turn classified as **progress**: revalidated `dd16e5fb32` and clean tracked
state before this continuation. Unrelated untracked handoffs/reports preserved.

Implemented an explicit host-token-only, writable-local `POST /env/stm/refresh`.
It reads authenticated capabilities/inventory only, records observed revisions,
and returns a timestamp plus available/revoked/missing state for existing bindings.
It never resolves key values, creates bindings, starts/restarts children or
deletes shared keys. Network/inventory failures preserve the last-known registry;
the operation fails instead of falsely reporting refreshed readiness. Duplicate
tool/label identities in inventory now fail validation.

Registry v3 records each MCP binding's applied revision separately from the
observed inventory revision. External rotation marks restart pending; matching
applied/current revisions can be reconciled without unnecessary repeat restarts.
An old in-flight launch acknowledgement cannot erase a newer observed revision.
Revoked/missing bindings remain authoritative and block resolution, without
plaintext fallback. Voice remains per-call and does not claim restart is needed.
Legacy v1/v2 registries preserve references and normalize unknown applied revisions
conservatively. Older code that cannot parse v3 must fail closed on rollback.

Verification:

- Adapter: **27 tests passed**, including external rotate/revoke/missing states,
  failed/duplicate metadata preservation, legacy v2 authority, and reconciliation
  of resolution occurring after external rotation. No secret fetch during refresh.
- Cross-repository real STM SQLite Store + fake keystore + loopback handler:
  **27 passed / 115 assertions**, selected/lifecycle/contract suites. Added native
  `Store.rotateKey` and `Store.revokeKey` observations with unchanged keystore read
  count. Companion test commit: **`d548049`** in the isolated STM branch.
- Seven targeted server suites: **54 passed / 261 assertions** with the source
  stdio launcher (no optional engine in this run). Host refresh success, missing
  host auth, owner bearer rejection, read-only and default-off paths checked.
- Native launcher rebuilt (26 modules) at
  `/private/tmp/matterhorn-stm-refresh-snAgxP/matterhorn-stm-mcp`.
  `STM_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode STM_TEST_COMPILED_LAUNCHER=/private/tmp/matterhorn-stm-refresh-snAgxP/matterhorn-stm-mcp bun test src/stm-mcp-launch.e2e.test.ts`
  from `apps/server`: **1 passed / 60 assertions**, allowed/denied/rejected calls
  through pinned OpenCode with synthetic loopback inference and fake credentials.
- Server, Electron and orchestrator typechecks passed. `git diff --check` passed
  in both repositories. No frontend, full regression, signed app or real Keychain
  acceptance is inferred from these targeted checks.

Next task: safe crashed-launcher recovery and transient exit-bookkeeping contention,
then mid-call cancellation/failure tests, compiled distribution parity and full
regression/security gates. OS/real-Keychain acceptance remains separately gated.
Refresh is explicit and point-in-time: no daemon event subscription or always-live
readiness claim. Goal remains **ACTIVE**; no deployment or real-key migration.

## Continuation: explicit exited-process recovery and durable launch intent

Previous turn classified as **progress**: revalidated `2b14908c13` and tracked
worktree state before implementing the next recorded task.

- Publish metadata-only active launch intent **before** spawning the selected
  credential-bearing child. Until the PID is known, the record explicitly has
  `pid: null`, so a crash cannot make that grant appear unused. Confirmed spawn
  failure clears only its own intent; uncertainty remains blocked.
- Exit bookkeeping retries transient registry-lock contention at most ten times
  with bounded 50 ms delays. It never steals a lock. Exhaustion leaves the active
  record intact for operator recovery rather than permitting a second launch.
- Added host-only `GET /env/stm/mcp-grants` (redacted status, no command arguments)
  and consent-required `POST /env/stm/mcp-grants/:id/recover`. Recovery compares the
  expected launch ID under lock and requires OS ESRCH for the recorded direct
  process. Live/reused PID, permission/unknown errors, unknown PID and stale
  request IDs are refused. It never kills/restarts a process, resolves a key,
  removes bindings or un-revokes a grant. Read-only mode blocks mutation.
- Actual crash fixture kills only its disposable source/compiled wrapper while
  its test MCP deliberately survives stdin EOF. Recovery refuses the live orphan;
  after the test explicitly stops that tool and verifies absence, recovery clears
  the record. Cleanup also handles assertion/startup failures using test-owned
  metadata. No developer process or real credential is involved.
- Added `docs/handoffs/stm-launch-recovery.md`: known-PID recovery workflow and
  precise operator limits. Unknown-PID crash windows and stale-lock repair remain
  manual and must establish stopped writers/tools first. PID absence is not proof
  of erased key copies or stopped descendants; no stronger isolation is claimed.

Verification:

- Adapter: **31 tests passed**, including stale/live IDs, revoked-grant preservation,
  transient/exhausted lock contention, intent visibility before child execution,
  unknown-PID refusal and confirmed missing-executable cleanup.
- Source launcher crash E2E: **1 passed / 18 assertions**.
- Native launcher rebuilt (26 modules) at
  `/private/tmp/matterhorn-stm-recovery-SOSDkY/matterhorn-stm-mcp`.
- Seven combined server suites with pinned real OpenCode, synthetic inference,
  compiled launcher and crash/recovery fixture: **54 passed / 325 assertions**.
  Command from `apps/server`:
  `STM_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode STM_TEST_COMPILED_LAUNCHER=/private/tmp/matterhorn-stm-recovery-SOSDkY/matterhorn-stm-mcp bun test src/env-file.test.ts src/env-routes.e2e.test.ts src/stm-runtime.test.ts src/voice-credential.test.ts src/managed-opencode.test.ts src/stm-mcp.test.ts src/stm-mcp-launch.e2e.test.ts --timeout 15000`.
- STM selected/lifecycle/cross-repository tests: **27 passed / 115 assertions**,
  real Store with fake keystore only. Server/Electron/orchestrator typechecks
  passed. No frontend/full safety or signed-app acceptance claim.

Next: mid-call cancellation and post-spawn failure cleanup; compiled distribution
parity; full regression/security gates and requirement-by-requirement phase audit.
Real Keychain/signed OS acceptance remains separately gated. Extreme crash windows
without a published PID are explicitly manual, not silently auto-recovered. Goal
remains **ACTIVE**. No push, deployment, production configuration or real migration.
