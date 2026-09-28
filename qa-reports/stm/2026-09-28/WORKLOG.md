# STM integration worklog — 28 September 2026

Current requirement audit: `PHASE-1-3-AUDIT.md` in this directory. Historical
checkpoints below are chronological, not claims about today's remaining work.

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

## Continuation: post-spawn failure cleanup and single-artifact distribution

Previous turn classified as **progress**: revalidated `923b06ab8f` and no tracked
drift before continuing. No unrelated files were staged.

- Fixed failed-start cleanup after child spawn: drain pipes, send SIGTERM, escalate
  once to SIGKILL after 1.5 seconds and bound waiting to 3 seconds. If process state
  remains uncertain, its launch record stays authoritative. A test installs an
  ignoring signal handler before forcing acknowledgement failure and proves the
  test-owned credential-bearing process is absent when failure returns.
- Added safe stop handling for stdio transport errors. Extended the MCP fixture
  to leave a tool call pending and ignore SIGTERM. Client stdin EOF still triggers
  escalation and clears the launch record. This proves disconnect cleanup, not
  the separate application/session Stop-button journey or descendant erasure.
- Found a distribution gap: orchestrator copies/downloads only the server binary,
  not the prior sibling STM executable. Added `server-entry.ts` with a dedicated
  `--stm-mcp` branch that never imports the HTTP server/CLI. Native server builds
  now contain this mode in the same artifact; native launcher selection uses it.
  No fourth managed sidecar, remote daemon download or new production setting.
  Electron's embedded server keeps its staged architecture-specific launcher.

Verification:

- Adapter: **32 tests passed**, including deliberate post-spawn bookkeeping failure
  with an ignoring tool; only disposable processes and fake credentials used.
- Source disconnect/crash MCP E2E: **1 passed / 20 assertions**.
- Native server built with `bun script/build.ts --outdir
  /private/tmp/matterhorn-stm-server-mode-Rw5Uqs` (**1437 modules**); canonical and
  legacy binaries both report **0.13.15** in an isolated HOME.
- Canonical native server STM mode + pinned engine: **1 passed / 66 assertions**.
- Final rebuilt legacy-named artifact (the orchestrator release naming path),
  pinned OpenCode, synthetic inference, disconnect/crash fixture and seven server
  suites: **54 passed / 327 assertions**. Command from `apps/server`:
  `STM_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode STM_TEST_COMPILED_SERVER=/private/tmp/matterhorn-stm-server-mode-Rw5Uqs/openwork-server bun test src/env-file.test.ts src/env-routes.e2e.test.ts src/stm-runtime.test.ts src/voice-credential.test.ts src/managed-opencode.test.ts src/stm-mcp.test.ts src/stm-mcp-launch.e2e.test.ts --timeout 15000`.
- Server, Electron and orchestrator typechecks passed. Electron packaging source
  gate passed; existing Electron runtime tests **3 passed**. These do not prove a
  signed installed app or remote published-artifact acceptance.

Next: exercise native HTTP approval's automatic launcher selection, then full
regression/security gates and a requirement-by-requirement phase-1–3 audit. Include
chat/session cancellation if required beyond MCP transport shutdown. Signed OS,
real Keychain, cross-architecture execution and production rollout remain expressly
unverified. All work stays local/default-off; goal remains **ACTIVE**.

## Continuation: full regression gates, native HTTP approval and metadata races

Previous goal work is classified as **progress** (`4b5fdc4c54`); the intervening
Serena installation check was not STM implementation progress. Revalidated both
worktrees and resumed the existing uncommitted native HTTP test and QA harness.

- Native compiled-server E2E now pairs and approves through the actual host API,
  checks automatic single-artifact launcher selection, and proves no resolution
  during approval before running actual OpenCode permission/stdio/crash checks.
- Added isolated regression runner: scrub operator environment, disposable HOME/
  XDG/TMP, pinned pnpm shim. Its initial global application-store overrides caused
  **39 backend failures** by defeating individual tests' selected paths. Source
  inspection confirmed precedence; removing those overrides yielded **1,767/0**.
  No production guard or test assertion was weakened to repair that harness.
- First app run lacked sandbox loopback access (two bind failures); authorized
  disposable-loopback rerun passed **1,228/0**. First safety run hit pnpm
  ENAMETOOLONG in an offline tarball fixture under macOS's long temp directory;
  rerun with `TMPDIR=/private/tmp` passed all ten stages.
- Added real HTTP negative coverage for redirect refusal (target not contacted),
  oversized body, stalled response-body timeout and no pairing/retry after failure.
- This run exposed a real same-instance listing/write race: atomic replacement
  changes the old inode's ctime while descriptor validation is reading it.
  Separate concurrent grant and binding tests both failed with `unsafe_file`
  before the fix. Their reads now use the instance's existing serialization queue;
  permissions, nofollow, mutation checks and cross-process fail-closed behavior
  remain intact. Reads do not acquire a write lock or steal one.

Final verification after that production correction:

- Adapter **35 passed**; STM selected/lifecycle/cross-repository **27 passed /
  115 assertions**, fake keystores only.
- Backend **1,767 passed / 11,833 assertions / 183 files**. Final log:
  `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-stm-server-f0wR6m/result.log`.
- Full **10-stage platform safety gate passed** on the final runtime code. Log:
  `/private/tmp/matterhorn-stm-safety-gyHbFy/result.log`.
- App typecheck/build and server TypeScript build passed; Electron bridge covers
  **50 renderer methods**, Electron and orchestrator typechecks passed. App build
  has large-chunk warnings, not a new UI or release-ready claim.
- Rebuilt native artifact at `/private/tmp/mh-stm-final-vdtBdQ/matterhorn-work-server`
  (**1,437 modules**, SHA-256 recorded in audit). Actual pinned OpenCode 1.18.31
  with native HTTP approval/launcher and synthetic inference: **1 pass /
  72 assertions**. No paid/real provider requests or credentials.
- Matterhorn source scanner **1,214 files / zero findings**. STM scan reports
  three pre-existing UI fixture literals; verified all files byte-identical to
  STM base and inspected redacted fake-test context. No values printed, no
  scanner exclusions changed; STM scan is not claimed green.

Completion audit is **not achieved**: adapter `#handshake()` accepts arbitrary
nonempty backend descriptions, while STM can report `unsupported (...)`. The
plan explicitly requires rejecting unsupported keystores before enabling.
Next: implement a supported-backend compatibility contract and negative tests,
reverify interoperation, then finish the requirement audit. This is actionable
local work, not an external blocker. Preserve the broader goal and leave ACTIVE.
No push, merge, deployment, real keystore access or migration occurred.

## Continuation: backend compatibility and final phase audit

Previous turn classified as **progress**: revalidated local Matterhorn commit
`5175b42b138f` and STM commit `d548049cc61f` with no tracked drift before work.
Closed the concrete handshake gap identified by the last audit:

- STM capabilities now expose an explicit `backendId`, mapped from the actual
  existing implementation descriptions. Unknown/custom/unsupported descriptions
  become `unsupported` with a fixed safe label, not echoed native failure details.
  This performs no vault read/probe/unlock and does not change legacy bulk APIs.
- The macOS adapter accepts `macos-keychain` and `encrypted-file` explicitly.
  Missing/malformed IDs are incompatible; unknown, unsupported and other-platform
  IDs refuse pairing and bound operations before key reads/writes. Display labels
  alone cannot authorize compatibility. Metadata remains usable after failure;
  no stale plaintext fallback or real credential migration was added.
- Tests cover all ID classes, encrypted-file naming, changes after pairing,
  metadata preservation and no resolution/write after rejection. The cross-repo
  test changes the fake daemon's backend after a successful real child call.
  Native HTTP acceptance now also proves failed pairing did not persist consent.
- Requirement review also found case-fold plaintext conflicts were deferred to
  runtime instead of rejected while linking. A regression failed before correction;
  legacy/inherited names now use the same normalized conflict policy before any
  inventory or registry write. Non-adopters are unaffected.

STM companion commit: **`ef24aa14e772cc2a3d546c2f73a41ae0957911eb`**.
Matterhorn's exact final tree is the commit containing this section and audit.

Final results after the normalized-name correction:

- Adapter **38 passed**; STM selected/lifecycle/interoperation **28 passed /
  141 assertions**. Fake stores only, no real daemon descriptor or vault.
- Full backend **1,767 passed / 11,833 assertions / 183 files**, isolated HOME:
  `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-stm-server-4d9j2Y/result.log`.
- Rebuilt native server **1,437 modules**; native HTTP + actual OpenCode 1.18.31
  fixture **1 passed / 75 assertions**. Dedicated desktop launcher **26 modules**;
  pinned-engine fixture **1 passed / 66 assertions**. Both final SHA-256 values
  and exact commands are in `PHASE-1-3-AUDIT.md`. Only synthetic inference used.
- Server typecheck passed. Prior app **1,228/0**, app typecheck/build, server build,
  Electron/orchestrator typechecks and 50-method bridge evidence remain applicable
  to unchanged frontend/shell sources. The adapter's current native builds exercise
  the changed runtime code. Matterhorn source scan: **1,214 files / zero findings**.
- Pinned pnpm10.27.0 offline/frozen/lockfile-only/ignore-scripts check passed for
  all 20 workspaces and left no dependency diff. This closes the earlier local
  lockfile-validation note, not clean-install/published-artifact acceptance.
- Full **ten-stage safety gate passed** after both backend-ID enforcement and
  normalized-name tightening. Final log:
  `/private/tmp/matterhorn-stm-safety-nn419m/result.log`.

No new product slice, production change, secret migration, push or deployment.
Settings/migration, real keystore/unlock, signed OS acceptance and independent
security/CI review remain release gates rather than being silently claimed done.

Requirement-by-requirement completion audit: `PHASE-1-3-AUDIT.md` records the
actual source and test evidence for all three engineering phases and separates
unverified release work. The active local implementation goal is achieved; no
remaining phase-1–3 coding/test requirement was left as an inferred success.
This is not public-beta activation or an assertion that real/signed OS acceptance,
settings/migration, brokered execution or AI-provider authentication is complete.

## Remaining phases — settings, migration and PR preparation (28 September)

Implemented engineering phase 4 and the locally executable portion of phase 5.
See `PHASE-4-5-REVIEW.md` for the requirement evidence, exact replay commands,
compiled checksums, design verdict, screenshots, recovery and release-owner gates.

- Added compact local Environment settings using existing components/tokens:
  capability state, backend identity, connection consent, selected inventory,
  transient API-secret add/replace, selected voice/MCP bindings, unlink and
  guarded restart information. Hosted restrictions and default-off flag remain.
- Added metadata-only settings/migration HTTP APIs, explicit host-only/read-only
  enforcement and source eligibility checks. No raw STM values in responses.
- Added two-stage selected migration with owner-only metadata journal,
  create-only/idempotent imports, verification before reference publication,
  separate plaintext-removal consent, exact source checks, cross-instance locks
  and file/directory sync. No plaintext backups or automatic fallback.
- Added reviewed project-local MCP migration into the existing launch boundary;
  exact command/workspace/bindings and configuration are checked before the
  wrapper is published. No automatic process launch/restart or approval bypass.
- Added deterministic interrupted-write/restart recovery and backend/source/
  revision failure tests. Real process-kill/power-loss qualification remains.
- Independent finish review required consent reset after scope changes and
  fresh revision selection after Refresh; corrected both and added browser
  regressions. Explicit API-secret input exception documented in surface brief.
  Follow-up and documenter verdicts ship for the scoped design, not security/OS.

Final local results: adapter **47/0**; server **1,771/0, 11,891 assertions**;
frontend **1,228/0, 7,732 assertions**; real Chromium component fixture **6/0,
31 assertions**; companion STM fake-keystore contract **28/0, 141 assertions**;
native server/OpenCode fixture **1/0, 75 assertions** and native launcher/OpenCode
fixture **1/0, 66 assertions**. App/server builds and typechecks, Electron and
orchestrator typechecks, 50-method bridge contract, strict source scan (1,215 files,
zero findings) and the full ten-stage platform safety gate passed.

All captures show synthetic data. No real Keychain permission was received;
no existing secret or real OS test record was read/created. Real Keychain,
signed installed Electron, independent security review and CI are unfulfilled
release gates. This is not hosted enablement, real inference, deployment or an
assertion that the complete release phase has been signed off.

PR plan: publish the existing isolated STM companion branch and this feature
branch as linked draft PRs; stack Matterhorn on the still-open #1026 head instead
of duplicating its changes against dev. Keep unrelated untracked handoffs/QA
artifacts and the original STM checkout untouched. No merge/deployment authorized.
