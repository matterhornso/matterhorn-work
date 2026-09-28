# STM engineering phases 1–3: implementation audit

Scope: the active goal's selected-resolution contract, privileged default-off
adapter, and consumer-specific runtime wiring. These are phases 1–3 in section 9
of `docs/handoffs/stm-integration-plan-2026-09-28.md`, **not** three product slices.
This document is not release approval. Settings/migration (phase 4) and signed
OS/security acceptance (phase 5) remain separate; broader broker/provider work
requires scope confirmation.

**Completion audit: engineering phases 1–3 achieved locally.** Each requirement
below has source and executable fixture evidence, including the final full safety
gate. The unsupported-keystore and pre-link normalized-name gaps found during
audit are corrected and regression-tested. This closes the active goal's local
contract/adapter/runtime implementation, not phase 4 settings/migration or phase 5
OS/security/release acceptance. Those unverified gates remain listed explicitly.

Audit source: Matterhorn branch `codex/stm-tool-secrets-2026-09-28`, production
checkpoint `5175b42b138f` plus the accompanying backend-compatibility fix;
STM branch `codex/matterhorn-selected-secrets-2026-09-28` is at
`ef24aa14e772cc2a3d546c2f73a41ae0957911eb`. Final commit IDs are recorded in the worklog. The
commit containing this audit identifies the exact Matterhorn tree. Nothing was
pushed, merged, deployed or enabled in production.

## Requirement-to-evidence review

| Requirement | Implementation inspected | Evidence and boundary |
| --- | --- | --- |
| Explicit selected resolution; empty never means all | STM `src/selected-secrets.ts`, dispatched by `src/daemon.ts` | Selection, empty, unknown/revoked/duplicate/reserved/case-fold tests; fake store records every resolution. Only selected entries are read. |
| Header-only authority, no browser/query/broker access | Same STM route | Missing/wrong/broker token, Origin, nonliteral Host and query-token tests reject before resolution. Dashboard authority is broad local authority, not a new scoped token. |
| Stable metadata and safe replacements | STM `src/store.ts` selected methods | Eight lifecycle tests cover create-only/CAS replacement, stale/replayed writes, competing writers, revoke/rotation revisions and keystore/DB failure. No value-derived hashes in metadata. |
| Bounded requests/replies and sanitized errors | STM route; adapter `#request` | Selected-body/value limits, native error redaction and exact response projection. Real disposable HTTP regression proves redirects are not followed, oversized responses fail, and a stalled body is aborted at the request deadline without retry/pairing. |
| Default-off, macOS-local-only discovery | `apps/server/src/stm-runtime.ts`, shared adapter | Strict flag tests; network listeners and unsupported platform reject activation. No auto-daemon launch, installation, migration or remote browser-vault bridge. |
| Reject unsupported keystores before enabling | STM capabilities `backendId`; adapter `#handshake()` | Explicit macOS Keychain/encrypted-file IDs only. Missing, malformed, unknown, unsupported and other-platform IDs reject without pairing. Post-pairing change blocks status/inventory/refresh/resolve/write while preserving metadata. Cross-repository fake daemon and native HTTP tests prove denial precedes key resolution. This is compatibility, not unlock/OS acceptance. |
| Private descriptor and metadata registry | `packages/stm-credentials/index.mjs` | Owner/mode/regular-file/nofollow checks, size/metadata stability checks, malformed/symlink/oversize rejection, private atomic writes and fail-closed locks. Cross-process conflicts can still refuse a read; they never downgrade authority. |
| Metadata-only bindings, explicit consent, no caching | Adapter connect/link/list/refresh/save/unlink | Consent tests; sentinel absent from registry and status; refresh does not resolve; external rotation/revocation updates observed state; unlink does not revoke the shared STM key. Same-instance metadata readers serialize with writers. Legacy/inherited case-fold collisions reject before inventory or metadata writes; both cases have regressions. |
| Host-only API; legacy contracts preserved | Server `/env/stm/*`, `/env`, `/env/keys` | Host/owner/missing-token and read-only route tests; no raw resolution endpoint; metadata names-only context. Existing legacy server tests remain green. Shared reserved internal-prefix normalization is intentional, not a migration of user credentials. |
| Voice resolves only its needed binding | `apps/server/src/voice-credential.ts` and server route | Voice tests preserve stored/inherited selection precedence for unbound keys. Bound keys require host authority and fail on disabled/offline/conflicting state; no OpenCode provider-auth changes. |
| No generic/global STM injection | Desktop `electron/runtime.mjs`, orchestrator `src/cli.ts`, server `managed-opencode.ts` | These boundaries invoke metadata-only conflict checks; actual resolution belongs to the approved consumer. Tests reject stale/case-fold bound plaintext, unsafe registries and flag rollback. Non-adopters do not contact STM. |
| Workspace/configuration-bound launch grants | `stm-mcp.ts`, `StmMcpLaunches` | Canonical workspace, reviewed executable/arguments, exact binding IDs, consent and config approval. Tests deny cross-workspace, changed command/binding and revoked grants; host-route approval wait cannot authorize a replaced command. |
| Actual runtime execution and permission preservation | `stm-mcp-run.ts`, embedded/native entry points | Pinned OpenCode 1.18.31 calls a real harmless MCP fixture through the native launcher. Allow executes once; deny and rejected ask do not. Synthetic inference only; model requests/history/logs exclude sentinel/token. Native HTTP connect/approve chooses its embedded launcher automatically, with no resolution during approval. |
| Rotation, restart and crash semantics | Applied/observed revisions, launch intent/recovery | Running child's snapshot stays old; new approved launch gets the exact new revision. Duplicate active launches blocked. Durable intent before spawn; known-PID recovery requires ESRCH and exact launch ID; live/unknown/reused PID refused. Disconnect escalates TERM to KILL for a deliberately ignoring fixture; failed-start cleanup is tested. |
| CLI/orchestrator/Electron distribution wiring | `server-entry.ts`, build script, embedded options, desktop build/resources/after-pack | Native single-file server rebuilt and executed; no missing companion download. Electron stages architecture-specific launcher and supplies it through trusted embedded-server options. Packaging-source gate, 50-method bridge check and Electron/orchestrator typechecks pass. Signed installed Electron is **not** proven by these checks. |

## Reproducible checks and observed results

Use repository-pinned pnpm **10.27.0**, Bun **1.3.11**, Node **26.7.0**. The helper
`run-regressions.mjs` creates a fresh HOME/XDG/TMP tree, strips inherited operator
credentials and installs a temporary pnpm shim for nested scripts. It deliberately
does not set global application store overrides: those override per-test paths
and incorrectly collapse isolation. macOS safety packaging needs a short TMPDIR.

```sh
TMPDIR=/private/tmp \
STM_QA_PNPM=/absolute/path/to/pnpm/10.27.0/bin/pnpm.cjs \
STM_QA_BUN=/absolute/path/to/bun \
node qa-reports/stm/2026-09-28/run-regressions.mjs server
# Repeat with app, app-typecheck, app-build, server-build, safety.
```

- Backend after final runtime fix: **1,767 pass, zero fail**, 183 files.
  Log: `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-stm-server-4d9j2Y/result.log`.
- Frontend: **1,228 pass, zero fail**, 179 files. No frontend source changed.
  Log: `/var/folders/96/vmhqgys5337f1g3f26phrhn80000gn/T/matterhorn-stm-app-hAmh12/result.log`.
- Adapter: `pnpm --dir packages/stm-credentials test`: **38 pass**. Includes
  real loopback transport and actual disposable child processes, all fake keys.
- STM: `MATTERHORN_STM_ADAPTER_PATH=/absolute/path/to/packages/stm-credentials/index.mjs
  bun test test/selected-secrets.test.ts test/selected-secret-lifecycle.test.ts
  test/matterhorn-contract.test.ts`: **28 pass / 141 assertions**. Real Store,
  fake keystore, real loopback route/adapter; no developer vault access.
- Native server: `bun script/build.ts --outdir /private/tmp/mh-stm-backend-XsFCQr`:
  **1,437 modules**, rebuilt after backend compatibility correction.
- Native HTTP + OpenCode E2E: `STM_TEST_COMPILED_SERVER=/private/tmp/mh-stm-backend-XsFCQr/matterhorn-work-server
  STM_TEST_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode
  bun test src/stm-mcp-launch.e2e.test.ts` from `apps/server`: **1 pass / 75 assertions**.
- Dedicated desktop launcher: `bun build src/stm-mcp-entry.ts --compile --outfile
  /private/tmp/mh-stm-backend-XsFCQr/matterhorn-stm-mcp`: **26 modules**. Same E2E
  with `STM_TEST_COMPILED_LAUNCHER` instead of `STM_TEST_COMPILED_SERVER`:
  **1 pass / 66 assertions** on the final rebuilt artifact. This exercises the
  packaged entry point, not an installed/signed Electron application.
- App typecheck/build and server TypeScript build passed. App build reports
  large-chunk warnings; no unrelated bundle redesign was made. Electron typecheck,
  bridge check and orchestrator typecheck passed.
- `pnpm install --lockfile-only --offline --frozen-lockfile --ignore-scripts`
  with pnpm 10.27.0 passed across all 20 workspace projects. No lockfile/dependency
  diff was produced; no install scripts ran. This is not a clean-room download or
  proof of a published package.
- Full ten-stage platform safety gate **passed after the final runtime fixes**.
  Log: `/private/tmp/matterhorn-stm-safety-nn419m/result.log`. These are local
  contract/fixture gates, not hosted acceptance despite some script labels.
- Matterhorn strict source scanner: **1,214 files, zero findings**, no oversized
  skips. Applying it to STM reports three existing `tests-ui` fixture literals;
  all three files are byte-identical to STM base `a7c5d7a`. Context confirms fake
  test/import/leak-check literals; matches were not printed. That cross-repository
  scanner command is not reported as green and its exclusions were not broadened.

Artifact SHA-256 (local verification only, not published release artifacts):

- Rebuilt Matterhorn native server:
  `d83347663d9060a7aab2e29426bb28c7e0f76695289ea5d94b6093eeebccb933`.
- Dedicated desktop launcher:
  `22a9ecff0181a728d3f54c3cfe0f90f3e7ed7632e1d62e7ce80bc863bee327dd`.
- OpenCode 1.18.31:
  `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`.

## Explicitly outstanding before release

1. Independently review paired STM/Matterhorn diffs, reconcile the approved base,
   publish PRs when authorized and run their CI. No remote CI result is inferred
   from local test success.
2. Separately authorize throwaway real macOS keystore acceptance, daemon lock/
   unlock/restart and signed installed Electron tests. Confirm both intended
   architectures, packaged resource signatures and actual backend names. Current
   evidence does not establish these, or Linux/Windows support.
3. Phase 4: metadata-only settings, accessible pairing/link/replacement flows,
   explicit selected migration and crash journal, and consented downgrade/export.
   No browser screenshot or migrated-user acceptance is claimed here.
4. Phase 5: independent threat-model/security review, hostile-tool checks,
   compiled release checksums/API matrix and OS acceptance. Session/UI Stop needs
   separate acceptance; MCP transport disconnect is not its substitute.
5. Slice-1 trust limit: the selected child can read its own key and other resources
   available to its OS user. This is not an OS sandbox or protection from a
   malicious same-user tool. Revocation cannot erase already-running process
   memory; unknown-PID/stale-lock recovery remains manual and fail-closed.
6. Clarify separate product scope before brokered HTTP execution, AI-provider
   authentication, hosted tenant vaults, wallet material or real migration.

Go/no-go: **no production enablement**. Keep the release flag off. The local
engineering implementation and tests are not a claim that STM is ready for users.
