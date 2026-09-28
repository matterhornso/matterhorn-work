# STM settings/migration — review and release handoff

28 September 2026. **Reviewable, not approved for release.** This completes the
remaining local settings/migration implementation and local acceptance work for
engineering phases 4–5 of slice 1. It does not implement brokered execution,
hosted credentials, Teams, or OpenCode AI-provider authentication.

## Scope and dependency stack

- Matterhorn branch: `codex/stm-tool-secrets-2026-09-28`.
- Stack base: `codex/beta-launch-readiness-2026-09-25`, PR #1026, observed open at
  `dac794dfbfb71348861b8c4ccd99cc4adc14e45f`. Review this feature separately;
  retarget/rebase after the baseline is approved. Do not merge it into #1026.
- STM companion: `matterhornso/subscribetome`, branch
  `codex/matterhorn-selected-secrets-2026-09-28`, commit
  `ef24aa14e772cc2a3d546c2f73a41ae0957911eb`, based on
  `a7c5d7aac8893761ea17684998b0a429aebea443`.
- Feature remains default-off. `MATTERHORN_WORK_STM_ENABLED=1` is only for an
  explicitly approved local desktop pilot; never enable this on the public host.
- No real vault values, production configuration, wallet signatures, merge,
  deployment or migration of user data was performed.

## Implemented

Environment settings now load host-authenticated metadata before mounting any
legacy raw-value editor. Local STM users can connect with consent, inspect the
actual backend, link selected inventory, add/replace API credentials with revision
preconditions, unlink references, and review restart requirements. Remote/hosted
users retain existing restrictions. Flag-off non-adopters retain legacy behavior;
existing references remain authoritative even after flag rollback.

New password input is transient and cleared on save, failure, cancel, refresh and
unmount. Existing vault values are never returned to the renderer. Settings use
fixed recovery text instead of echoing native/daemon error payloads. Changing the
selected scope clears consent; refreshing closes a stale replacement editor so
the user must select the fresh inventory revision. There is no Reveal/export.

Migration is two explicit actions: verify/import selected eligible names and
publish references, then separately confirm removal of those plaintext entries.
The private journal contains identities/revisions/timestamps only. Create-only
imports use stable identities; uncertain writes are inspected on retry, not
blindly replaced. Source snapshots are rechecked under cross-instance locks.
Unrelated plaintext entries remain untouched. References fail closed while a
duplicate plaintext source remains. File and directory synchronization bracket
atomic rename; no plaintext backup files are introduced.

Voice migration only accepts its supported environment names. Local MCP migration
uses an exact project-local command review, existing host approval, workspace-bound
grant, selected environment bindings, and the trusted wrapper. It rechecks config
around approval/publication and reuses the same grant on an exact retry. It does
not automatically start or restart a tool. Existing tool permission checks remain.

## Verified evidence

All credentials below are disposable synthetic values. No row is real Keychain,
real inference, hosted acceptance, signed installed Electron, or a security audit.

| Check | Result |
| --- | --- |
| Adapter suite | 47 tests: 38 existing plus 9 migration cases |
| Full backend suite | 1,771 passed, 0 failed; 11,891 assertions, 184 files |
| Existing frontend suite | 1,228 passed, 0 failed; 7,732 assertions, 179 files |
| Settings Chromium fixture | 6 passed, 31 assertions; actual production component with synthetic API |
| STM companion contract/lifecycle/interoperation | 28 passed, 141 assertions |
| Native server + pinned OpenCode 1.18.31 | 1 passed, 75 assertions |
| Dedicated native launcher + pinned OpenCode | 1 passed, 66 assertions |
| App/server typecheck and production builds | Passed; existing large-chunk warnings remain |
| Electron and orchestrator typechecks / bridge contract | Passed; 50 exposed bridge methods checked |
| Full platform safety gate | All ten stages passed |
| Matterhorn strict source secret scan | 1,215 source files, zero findings |

The final full adapter invocation passed all 47 tests, including the two final
durable-boundary simulations.
Boundary fixtures cover uncertain creation, stale revisions, source edits, failed
removal, backend changes, unavailable vault, flag rollback, published references
with an uncommitted journal, and completed source removal with an uncommitted
completion record. These are deterministic state/error simulations, **not**
power-loss, disk exhaustion or OS SIGKILL qualification.

HTTP tests include ordinary-client denial, host-only metadata, read-only mode,
case-insensitive conflicts, explicit migration/removal consent and no raw-value
responses. Real EnvService tests exercise private/no-follow source validation,
locking/concurrent edits, MCP wrapper publication and retry idempotency.

Browser checks cover password clearing/storage, stale-revision refresh, scope
consent resets, offline/default-off/connect flows, migration confirmation, wrapping
controls at 390/768/1440px, light/dark, keyboard focus and 200% text enlargement.
Native browser zoom, complete screen-reader/contrast testing and Safari/Firefox
were not verified. There is no full signed-Electron settings-to-vault acceptance.

### Reproduce

Use repository-pinned pnpm 10.27.0, Bun 1.3.11 and the repository OpenCode pin.
Never point fixtures at the operator's real STM descriptor/database.

```sh
pnpm --dir packages/stm-credentials test
bun test apps/server/src/stm-migration.test.ts
bun test apps/app/scripts/stm-settings.browser.test.ts
pnpm --dir apps/app typecheck
pnpm --dir apps/server typecheck
pnpm --dir apps/desktop typecheck:electron
pnpm --dir apps/desktop check:electron
pnpm --dir apps/orchestrator typecheck
```

The browser fixture needs Playwright Chromium installed. For full regressions use
the isolated runner, supplying absolute runtime paths, then repeat `server` with
`app`, `safety`, `app-typecheck`, `app-build`, `server-build`:

```sh
TMPDIR=/private/tmp STM_QA_PNPM=/absolute/path/to/pnpm.cjs \
  STM_QA_BUN=/absolute/path/to/bun \
  node qa-reports/stm/2026-09-28/run-regressions.mjs server
```

Final local logs (disposable, not part of the PR):
- Backend: `/private/tmp/matterhorn-stm-server-RPFfft/result.log`.
- Frontend: `/private/tmp/matterhorn-stm-app-wcqKPh/result.log`.
- Safety: `/private/tmp/matterhorn-stm-safety-mQSXrf/result.log`.
- App typecheck: `/private/tmp/matterhorn-stm-app-typecheck-HtONWH/result.log`.
- App build: `/private/tmp/matterhorn-stm-app-build-skTn5o/result.log`.
- Server build: `/private/tmp/matterhorn-stm-server-build-0fygAg/result.log`.

Compiled acceptance commands:

```sh
bun build --compile apps/server/src/server-entry.ts --outfile /path/to/matterhorn-work-server
bun build --compile apps/server/src/stm-mcp-entry.ts --outfile /path/to/matterhorn-stm-mcp
STM_TEST_COMPILED_SERVER=/path/to/matterhorn-work-server \
  STM_TEST_OPENCODE_BIN=/path/to/pinned/opencode \
  bun test apps/server/src/stm-mcp-launch.e2e.test.ts
STM_TEST_COMPILED_LAUNCHER=/path/to/matterhorn-stm-mcp \
  STM_TEST_OPENCODE_BIN=/path/to/pinned/opencode \
  bun test apps/server/src/stm-mcp-launch.e2e.test.ts
```

Local macOS artifact SHA-256 (not distribution pins):
- Server: `03ee6ea881788a5aac0a8ca896c2f2b33e7abf974881d0dbb820f40c0cda5d13`.
- Launcher: `5adeeb7a112ab504fe8f1422aee252eea20c1ef09c8d8cba19355f4d15cf4123`.
- OpenCode: `16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`.

## Design finish record

Impeccable/Uncodixfy were used in Operate mode: preserve the incumbent settings
sections, semantic tokens, typography and light/dark themes. Mechanical review
reported no findings. Independent visual/interaction review first requested
consent reset, stale editor closure on refresh and explicit documentation of the
approved transient API-secret entry exception; all three were corrected and
covered by browser regressions. Follow-up verdict: **ship for those findings**.
Documenter verdict: **ship for this scoped extension**, no product/design rewrite.
These verdicts are not security or OS release sign-off. Existing DESIGN.md and
PRODUCT.md remain unchanged; existing design-context schema drift is out of scope.

No shipping raster assets. The four checked-in captures are browser-generated
**synthetic fixture evidence**, not live account/vault screenshots or visual
design sources: [390 light](settings-captures/390-light.png),
[390 dark](settings-captures/390-dark.png),
[1440 light](settings-captures/1440-light.png),
[1440 dark](settings-captures/1440-dark.png).

## Recovery and release-owner checklist

1. Review both PRs, resolve the #1026 stack, and require all relevant CI plus an
   independent security review. Companion STM's previous strict source scan
   reported pre-existing test/UI fixture literals; those were not silently
   excluded or called green. Review the recorded baseline findings before release.
2. Obtain explicit permission for one disposable OS Keychain record. Use a unique
   test service/account, no existing daemon/DB, and remove only that test record.
   Prove lock/unlock, stop/restart, wrong/stale token, external rotation/revocation,
   and selected resolution in the actual backend. Permission is still pending.
3. Build/sign/install the desktop package. Verify first-run discovery, capability
   rejection, host-only settings, migration, interruption/recovery and MCP
   stop/restart end to end. Confirm no secret/descriptor tokens in renderer state,
   logs, telemetry, prompts, exports, argv or unrelated children. Inventory
   metadata alone must not trigger vault reads or unlock dialogs.
4. Perform process-kill/disk-failure qualification around journal, registry and
   source commits. Locks fail closed: do not delete a lock because it is old.
   Stop and verify **all** writers/consumers first; inspect only metadata and
   authorize removal of the exact proven-stale lock. Never glob-delete registry
   or environment files. Retry the original migration ID; never create a second
   migration to conceal uncertain state. An unconfirmed/live process stays blocked.
5. Reconcile any `prepared` job with its same selection/backend/workspace. A
   `published` job has not yet confirmed plaintext removal. If MCP configuration
   changed, review it again; do not remove source entries without the exact
   approved configured wrapper. If the source changed or vault revision differs,
   stop and reconcile explicitly—do not overwrite either copy blindly.
6. Rollback disables operations but keeps authoritative bindings/journal. Do not
   restore secrets into plaintext or delete references to bypass a failure. No
   downgrade/export UI is included. Backups/snapshots can retain old plaintext;
   recommend provider rotation, not claims of secure SSD erasure.
7. Pin the reviewed released STM artifact/API and signed Matterhorn checksums.
   Pilot locally first. Hosted web, Linux/Windows and broker-only guarantees are
   **not** enabled by this PR. Authorized MCP processes can read their injected
   credentials; arbitrary same-OS-user process isolation is not promised.
