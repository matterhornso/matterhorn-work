# Authentication and storage lifecycle QA

4 October 2026. This review fixed client response-validation, auth recovery and delayed-upload authorization defects. The full-platform QA goal remains incomplete. No hosted release, account, provider, production setting, existing preview runtime or chat was changed. All account-deletion tests use disposable loopback accounts and files. Disposable loopback UI fixtures were created and stopped after testing.

## Reproduced findings and corrections

The public auth client previously trusted successful HTTP responses through a generic TypeScript cast. Thirteen initial malformed configuration cases resolved instead of rejecting, including HTML, JSON null, missing fields, incorrect boolean types and contradictory signup status. The sign-in page previously treated only explicit false availability as disabled, so invalid configuration could escape its intended fail-closed fallback. This was a client availability defect, not evidence of a server authorization bypass.

`apps/app/src/app/lib/public-auth-client.ts` now validates all required auth configuration fields and signup-status consistency, accepts additive server fields, and returns a constructed typed configuration. Minimum password length must be a positive safe integer; the public Turnstile key must be a nonempty string or null. No stronger product policy is invented by the client. The generic transport now returns unknown rather than casting untrusted data.

The same transport also accepted malformed successful responses for verification resends and password-reset requests/confirmation. Eighteen negative cases reproduced that failure. These three endpoints now require the server's existing `{ ok: true }` acknowledgement. Otherwise they reject before the UI displays a success message. This does not claim that a queued email reached an inbox. Sign-in, signup and verification still require the existing independent authenticated-session check before entering the app.

The server response contracts were inspected in `apps/server/src/server.ts`; its local auth acceptance tests were then run for verification/recovery and configuration safety. No backend auth policy was weakened or changed.

## Response validation verification

These results apply to commit `049af31387c21526a32dd9715c023f23147b92a3`. The subsequent UI recovery checks are recorded separately below.

| Check | Result |
| --- | --- |
| New negative configuration tests before the fix | 13 failures, reproducing missing validation |
| New negative acknowledgement tests before the fix | 18 failures, reproducing false-success acceptance |
| `bun test apps/app/tests/public-auth-client.test.ts apps/app/tests/public-web-auth-errors.test.ts apps/app/tests/public-cloud-config.test.ts` | 51 pass, zero fail, 70 assertions |
| `pnpm --filter @matterhorn-work/app test` on the final source | 1,343 pass, zero fail, 8,075 assertions across 187 files |
| `pnpm --filter @matterhorn-work/app typecheck` on the final source | Pass |
| `pnpm --filter @matterhorn-work/app build:web` on the final source | Pass; existing large-chunk warnings remain |
| Scoped server auth acceptance command below | 4 pass, zero fail, 45 assertions; 26 other tests filtered out |
| `git diff --check` | Pass |

```sh
bun test apps/server/src/auth.e2e.test.ts --test-name-pattern 'verifies email and completes|fails closed before creating|does not advertise signup|requires an explicit production'
```

The initial sandboxed frontend run had three local listener failures in `prompt-request-diagnostics-client.test.ts`. The permitted loopback rerun passed; no tests were skipped or altered to accommodate those failures. Server acceptance used disposable temporary data and console email fixtures. These are local endpoint/fixture checks, not real inbox delivery, paid inference or hosted browser acceptance.

Supplementary local logs: `/tmp/matterhorn-auth-final-tests-2026-10-04.log`, `/tmp/matterhorn-auth-final-typecheck-2026-10-04.log`, `/tmp/matterhorn-auth-final-build-2026-10-04.log`, `/tmp/matterhorn-auth-server-contract-2026-10-04.log`. Temporary logs are not durable production evidence.

## UI recovery follow-up

The next review confirmed that every configuration failure was presented as email setup, even though server setup can fail for other reasons and a fetch failure proves no setup diagnosis. The page now distinguishes a paused signup, incomplete setup, and an unsuccessful configuration lookup. The latter keeps established-account sign-in usable and exposes **Check again** while leaving signup and reset requests unavailable until configuration is verified.

Session lookups now have a 12-second active-time timeout. Auth configuration requests receive the caller's abort signal; the page aborts checks on replacement or unmount and ignores obsolete results. Loading resets previously accepted configuration. Mode changes are blocked while a submission is pending, and the reset-request view returns to sign-in if recovery becomes unavailable. Token-based password confirmation retains its existing server-controlled path. Existing layout, colors, consent and server authorization are unchanged. Impeccable hardening and Uncodixfy guided the focused recovery changes rather than a redesign.

The isolated preview runs the actual sign-in component, public-auth stylesheet, retro stylesheet and original bootstrap font declarations. It blocks account mutations and outbound connections. Reproduce with:

```sh
bun apps/app/scripts/public-auth-recovery-fixture.ts
```

Use the printed loopback URL. The labelled fixture controls configure synthetic responses only, not production features. Browser evidence confirmed:

- Config failure: truthful uncertainty message; sign-in remains usable; signup and Forgot password remain unavailable; Check again is visible.
- Recovery: Fixture ready followed by Check again restores signup and Forgot password and removes the failure notice.
- Loading: delayed config disables account controls and displays Checking session.
- Connection replacement: releasing the old delayed response does not replace the newer connection's failure state. Unmounting before release leaves the auth view absent and the fixture's accepted-sign-in count at zero.
- Reset request: after entering the reset form, a connection change to failed configuration returns to sign-in with retry guidance and no Send reset link action.
- Desktop light at 1280px and mobile dark at 390px have no horizontal document overflow. Keyboard navigation reaches Check again with a visible 3px ice focus outline in dark mode.

[Desktop light capture](auth-recovery-desktop-light.jpg) and [mobile dark retry capture](auth-recovery-mobile-dark.jpg) are synthetic UI evidence, not hosted acceptance. Browser viewport overrides were reset, the fixture tab closed and both temporary fixture server processes stopped. The original user preview remained untouched.

The browser redacted the email field, so draft-value equality could not be verified through that inspection. Do not count the attempted value comparison as a preservation pass. No real registration, reset, credential change, email delivery or paid inference occurred. Safari, Firefox, 200% zoom, assistive-technology output and the full theme/device cross-product remain unverified.

Final validation after the UI source changes:

| Check | Result |
| --- | --- |
| Auth/config/error and responsive focused tests | 68 pass, zero fail, 194 assertions |
| Full frontend suite | 1,347 pass, zero fail, 8,086 assertions across 187 files |
| App typecheck | Pass |
| Web build | Pass; existing large-chunk warnings remain |
| Diff whitespace check | Pass |

An initial full frontend run caught the old preview-specific copy assertion. The assertion was updated to the new recovery message; existing fail-closed, unavailable-state and Check again assertions remain. The final full suite passed. Logs: `/tmp/matterhorn-auth-ui-tests-final-2026-10-04.log`, `/tmp/matterhorn-auth-ui-typecheck-2026-10-04.log`, `/tmp/matterhorn-auth-ui-build-2026-10-04.log`.

## Delayed uploads after account deletion

The account-boundary review reproduced a write after deletion. A client sent valid authentication headers and only the first byte of a memory capture request. The test waited for the server to create that account's workspace, proving that authenticated middleware had run. Account deletion then returned 200 and removed the directory. Completing the withheld upload returned 200 and recreated the deleted directory. Separate failing assertions confirmed both the success status and the recreated path. This is a local authenticated request race, not evidence that one account can read another account's data or that hosted data has been exploited.

The initial test did not flush its HTTP headers and failed before reaching the intended barrier. That failure was a test transport issue, not vulnerability evidence. Calling `flushHeaders()` established the barrier and exposed the actual defect; response status and filesystem assertions then failed on the original implementation.

The server now pins a request-scoped authorization check to the originally accepted account session or hosted tool credential. After bounded body reads, multipart parsing and buffered OpenCode proxy body reads, it rechecks that identity and workspace access. A revoked or expired session cannot fall back to another supplied credential. Workspace changes reject the old request. Memory error mapping preserves explicit authorization status codes instead of turning them into generic 400 errors. Operator-token authentication and public signup/recovery policy are unchanged.

The behavioral matrix covers both memory capture APIs and multipart inbox uploads, each with account deletion, logout, workspace selection changes and an unchanged-session control. Deletion cases verify the directory stays absent after the upload completes. Multipart cases verify no file is written for rejected requests and exact bytes are written for valid requests. Every case also compares a second account's existing memory before and after the first account's operation. Sessions and temporary files are cleaned up by the fixture; no real account, inbox, provider or production data is used.

| Check | Result |
| --- | --- |
| Original implementation with flushed delayed upload | Fails: accepted write and recreated deleted workspace |
| Final delayed upload matrix | 12 pass, zero fail, 119 assertions |
| Auth endpoints, auth-store verification, memory routes, inbox boundaries and hosted tool credential regressions | 81 pass, zero fail, 1,110 assertions across five files |
| Server typecheck | Pass |
| Complete local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/auth.e2e.test.ts --test-name-pattern 'delayed upload'
bun test apps/server/src/auth.e2e.test.ts apps/server/src/auth-store-verification.test.ts apps/server/src/memory-routes.e2e.test.ts apps/server/src/inbox-boundary.e2e.test.ts apps/server/src/hosted-mcp-access.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs are `/tmp/matterhorn-deletion-race-red-2026-10-04.log`, `/tmp/matterhorn-deletion-race-path-red-2026-10-04.log`, `/tmp/matterhorn-delayed-upload-matrix-2026-10-04.log`, `/tmp/matterhorn-delayed-upload-regressions-final-2026-10-04.log` and `/tmp/matterhorn-delayed-upload-typecheck-2026-10-04.log`. Temporary logs supplement this recorded evidence; they are not durable hosted acceptance artifacts.

Commit `db096d2177ad0d1916aa615e540b82f47231813b` closes the reproduced delayed-body path, not every possible in-flight deletion race. The approval-wait follow-up below addresses another path. The proxy and hosted tool checks were added at the same authorization boundary, but their specific delayed-upload revocation paths still need dedicated behavioral fixtures. The unchanged-session controls demonstrate usable uploads; no browser UI was changed in this server pass.

## Approval waits during account deletion

A second local reproduction sent a complete multipart file upload and waited until it appeared in the host approval queue. Account deletion returned 200 and removed the account's workspace, but the stale approval remained actionable. Allowing it afterward let the upload recreate the directory. The failing filesystem assertion is recorded in `/tmp/matterhorn-approval-deletion-red-2026-10-04.log`. This is distinct from a delayed request body: parsing and its authorization check had already finished.

Commit `b32d542ff9f17773ab36fbd4be1c59b216dfd09d` cancels every pending approval for each deleted workspace before content removal, including deletion retries. Cancellation uses the authoritative workspace on the approval request, not optional chat-cancellation metadata. It clears timers and abort listeners through the existing settlement path. Shared approval handling now rechecks the original authorization both before queuing and after waiting, so an allow response cannot revive a logged-out session or apply to a previously selected workspace.

The four loopback scenarios cover deletion, logout, workspace changes and unchanged authorization. A second account has a pending upload in each case: its approval remains queued, can be allowed, and writes the expected bytes. The deleted account's stale approval returns 404 and its directory remains absent. Revoked or changed-session uploads write no file; unchanged authorization remains usable. A separate service test covers scoped and unscoped approvals, repeat cancellation, listener cleanup and stale reply rejection.

| Check | Result |
| --- | --- |
| Approval matrix and cancellation unit test | 5 pass, zero fail, 79 assertions |
| Auth, approval, recovery, inbox, guarded-runtime and jurisdiction suites | 132 pass, zero fail, 1,217 assertions across six files |
| Server typecheck on final source | Pass |
| Full local safety gate after approval correction | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/auth.e2e.test.ts apps/server/src/approvals.test.ts --test-name-pattern 'pending workspace approvals|workspace deletion'
bun test apps/server/src/auth.e2e.test.ts apps/server/src/approvals.test.ts apps/server/src/auth-store-verification.test.ts apps/server/src/inbox-boundary.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/polymarket-jurisdiction-policy.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Final logs: `/tmp/matterhorn-approval-revocation-matrix-2026-10-04.log`, `/tmp/matterhorn-approval-revocation-regressions-final-2026-10-04.log`, `/tmp/matterhorn-approval-revocation-typecheck-final-2026-10-04.log` and `/tmp/matterhorn-approval-safety-gate-2026-10-04.log`. The first typecheck caught an implicit array type in the new fixture; it was explicitly typed, and the final check passed.

These fixes do not establish a global deletion lock. The follow-up below reproduced and corrected the delayed evidence-sealing path identified during this review. Provider responses, other background mutations and external runtime operations still require separate acceptance.

## Delayed encryption and file reads during deletion

Two local regressions confirmed that operations waiting for a new data key could persist private records after workspace cleanup had finished: coworker evidence finalization and encrypted Agent File creation. Both original tests failed because the deleted workspace's list contained the newly persisted record. The fixtures use disposable SQLite stores and synthetic key managers; no hosted account, real key service or blockchain publication was involved.

The deletion coordinator now installs a durable workspace-deletion marker before asynchronous content cleanup. Evidence and Agent File creation check it before requesting a key and again in a synchronous SQLite transaction before persistence. Rejected creations clean up their scoped key reference and zero the plaintext key. The marker remains across normal workspace purge, expiry cleanup, another database connection and reopening the database. Its presence grants denial only: modifying its payload or expiry cannot grant access. Tests also verify that an unrelated workspace can still create data and that the normal account-deletion endpoint writes only the deleted account's marker.

A second matrix reproduced stale decrypted reads. Both Agent File model-context projection and recovery download returned their captured content after file deletion or workspace deletion completed while the key service was delayed. The corrected paths recheck the current record, revision, erasure state and workspace marker before requesting a key and after the wait. The final check and decryption run synchronously in one SQLite transaction. Returned key buffers are cleared on rejection and success. Unchanged-record controls still return the expected content. This protects these store methods; it does not recall bytes already returned to a caller or prove that every downstream runtime cancels work after account deletion.

| Check | Result |
| --- | --- |
| Delayed evidence sealing and Agent File creation before correction | Two failing reproductions persisted records after cleanup |
| Delayed context and recovery reads before correction | Four failing deletion cases returned content; two unchanged controls passed |
| Final Agent File suite | 13 pass, zero fail, 78 assertions |
| Auth, guarded runtime, evidence finalizer/store, file store/publisher/renewal and durable state suites | 138 pass, zero fail, 1,253 assertions across eight files |
| Server typecheck | Pass |
| Full local platform safety gate after the file-read correction | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/agent-file-store.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/guarded-runtime-state-store.test.ts apps/server/src/agent-file-walrus-publisher.test.ts apps/server/src/agent-file-walrus-renewal.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-finalizer-deletion-red-2026-10-04.log`, `/tmp/matterhorn-agent-file-deletion-red-2026-10-04.log`, `/tmp/matterhorn-file-read-deletion-red-2026-10-04.log`, `/tmp/matterhorn-file-read-deletion-green-2026-10-04.log`, `/tmp/matterhorn-deletion-followup-regressions-2026-10-04.log`, `/tmp/matterhorn-deletion-followup-typecheck-2026-10-04.log` and `/tmp/matterhorn-deletion-followup-safety-2026-10-04.log`.

The deletion marker retains a workspace identifier indefinitely, not chat/file content or keys. It uses the existing generic state table; no new database table is required. It does not survive replacement of the database with a pre-deletion backup, deliberate deletion of the marker, or bypassing these guarded paths. Operators must preserve deletion/erasure evidence during restore. KMS envelope-key destruction is not proof of deleting an individual KMS resource or every backup copy; hosted key-service and restore evidence remain required.

Commit `9156180c9bf848fc5c2116246b6d3471a69389f5` contains these creation/file-read corrections. The next section separately covers evidence decryption and rotation; publication/renewal completions and downstream use of already-returned context remain open. The changes are local, with no push, merge, deployment, production configuration change or user-preview restart.

## Evidence decryption and rotation during deletion

The evidence-store follow-up reproduced five failing cases: delayed decryption returned a bundle after workspace cleanup or key destruction; delayed rotation persisted after workspace deletion began, after its claim was removed as expired, and after another operation destroyed the key. In the last case it overwrote the destroyed record with its earlier snapshot and a new wrapped key. Three initial controls passed: unchanged decryption/rotation and deletion of a different workspace. These are synthetic key-service tests against disposable local stores, not evidence of hosted exploitation or real KMS behavior.

Decryption now revalidates the durable deletion marker, current record, tenant, revision and erasure state after the key-service wait. Validation, decryption and successful audit persistence share a synchronous SQLite transaction. The returned plaintext key buffer is cleared on success and rejection. Failure auditing rechecks current state in a transaction and does not recreate an audit row for a purged/deleted workspace.

Rotation now revalidates the current record and exact live operation claim before saving. The record update, verification-status invalidation, access audit and single-use claim consumption commit atomically. A replaced claim is left intact; failed claim consumption rolls back the update and its success audit. Deletion that initially cannot acquire the busy key claim can retry successfully after the rejected rotation releases its claim. Rejected rotation output is not persisted; this does not require destroying a shared KMS master key.

A separate clock-controlled regression caught a scheduled-rotation defect: `rotateDue` passed its initial timestamp to every completion check, allowing a six-minute key-service wait to use an expired five-minute claim when no cleanup task had removed it. Production scheduled rotation now uses a fresh clock in `rotateKey`; explicitly injected test timestamps remain supported. The fixture restores the clock in `finally`. A test-extension typo initially called a nonexistent audit-list method; correcting it did not change production behavior or weaken the rollback assertions.

| Check | Result |
| --- | --- |
| Initial delayed decryption/rotation matrix | Five reproduced failures, three passing controls |
| Scheduled rotation with elapsed claim and no cleanup | Reproduced failure before clock correction |
| Final evidence-store suite including replacement and rollback | 16 pass, zero fail, 120 assertions |
| Auth, guarded runtime, evidence stores/finalizer/publisher/renewal/deletion/verification/anchor, file store and durable state | 172 pass, zero fail, 1,450 assertions across 11 files |
| Server typecheck on final source | Pass |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/crypto-evidence-store.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/guarded-runtime-state-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Reproduction logs: `/tmp/matterhorn-evidence-await-red-2026-10-04.log` and `/tmp/matterhorn-evidence-rotation-clock-red-2026-10-04.log`. Final verification logs: `/tmp/matterhorn-evidence-await-final-2026-10-04.log`, `/tmp/matterhorn-evidence-await-regressions-2026-10-04.log`, `/tmp/matterhorn-evidence-await-typecheck-final-2026-10-04.log` and `/tmp/matterhorn-evidence-await-safety-2026-10-04.log`.

Commit `c413338b94894d64e32b08f275c60a0937ed5b29` contains this evidence decryption/rotation follow-up. The publication review below separately tests the deletion marker on publisher completion paths. Renewal remains open. No real Walrus upload, wallet signature or provider request was made. Hosted release, key management, backup restore and full user-journey acceptance remain unverified.

## Publication completion during workspace deletion

The next local matrix reproduced four failures across evidence and Agent File publishers: after deletion began during either upload or readback, the pending publisher still completed successfully. Its active operation claim temporarily prevented key cleanup, but there was no deletion-marker check to stop final proof attachment. Four controls deleting a different workspace still published correctly.

Both publishers now check the durable workspace marker after each awaited upload, certification and readback step. Multi-record Quilt publication checks each patch readback before starting the next one. The store also rejects new non-deletion operation claims and final single/batch proof attachments for marked workspaces. Cleanup operations remain permitted. The Agent File store shares one marker-check helper across creation, reads and publication instead of repeating the same check.

The final matrix covers evidence, Agent Files and two-record Quilts, each paused during upload or readback, with target-workspace and unrelated-workspace deletion. Target deletion rejects completion, clears the ciphertext buffers owned by the publisher and releases the busy claims. A second cleanup attempt destroys the local recovery material. When deletion occurs during upload, no certification/readback is started afterward; a Quilt paused on its first readback does not start its second. Unrelated-workspace deletion preserves successful publication. Existing publisher, tenant isolation, renewal, deletion and anchor tests also pass.

| Check | Result |
| --- | --- |
| Original single-record/file publisher matrix | Four reproduced failures and four passing controls |
| Final publisher suites including Quilt deletion | 32 pass, zero fail, 192 assertions across two files |
| Auth, guarded runtime and affected evidence/file lifecycle suites | 196 pass, zero fail, 1,604 assertions across 13 files |
| Server typecheck | Pass |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/agent-file-walrus-publisher.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/agent-file-walrus-publisher.test.ts apps/server/src/agent-file-walrus-renewal.test.ts apps/server/src/guarded-runtime-state-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-publication-deletion-red-2026-10-04.log`, `/tmp/matterhorn-publication-deletion-final-2026-10-04.log`, `/tmp/matterhorn-publication-deletion-regressions-2026-10-04.log`, `/tmp/matterhorn-publication-deletion-typecheck-2026-10-04.log` and `/tmp/matterhorn-publication-deletion-safety-2026-10-04.log`.

Commit `4273224c7154c4740056cfb322e1a90a31943be1` contains this publication follow-up. These fixtures replace every storage/network/key operation; no real upload or signature occurred. The correction rejects continuation after an awaited request returns, not an already-dispatched network upload. It cannot remove ciphertext already accepted by external storage or recall data from existing backups. Local proof attachment and remote object existence are distinct outcomes. Remote-orphan cleanup/reconciliation remains unverified. The next section covers renewal service deletion checks. Source review also found that deleted-workspace errors currently fall back to generic unavailable responses; dedicated user-facing recovery copy and HTTP behavior need testing before this is called seamless end-to-end deletion.

## Renewal preparation and confirmation during deletion

The renewal matrix reproduced eight failures across Agent Files and evidence: preparation certification, transaction-preview building, confirmation transaction verification and confirmation certification all allowed completion after the workspace deletion marker was committed. Eight unrelated-workspace controls succeeded. The fixture marks the same durable state used by the account-deletion coordinator; it deliberately pauses before content cleanup to test that tombstoning itself denies new work. These tests do not invoke a real account deletion endpoint, upload, wallet signature or network transaction.

Both renewal services now check the workspace before serving even a cached preview and after each awaited dependency. Preparation revalidates the exact claim and current record revision, then saves the intent in the same synchronous SQLite transaction as those checks. Production calls use a fresh completion time; the HTTP routes do not pass a fixed clock. Final renewal writes also check the marker inside their existing transaction boundary. Existing wallet-owner, transaction, certification, single-use and tenant checks remain in place.

The final tests confirm that target deletion produces no new preview, does not advance the file/evidence revision and does not start confirmation certification after deletion was observed during transaction verification. A previously prepared intent stays unchanged when confirmation is rejected; deletion cleanup or claim expiry still owns its removal. Four additional cases verify that delayed preview preparation rejects removed/expired and replaced claims without writing an intent or clearing the replacement. Controls for unrelated workspaces and existing renewal flows pass.

| Check | Result |
| --- | --- |
| Original deletion matrix | Eight reproduced failures and eight passing controls |
| Final file/evidence renewal suites | 33 pass, zero fail, 200 assertions across two files |
| Auth, guarded runtime and affected evidence/file lifecycle suites | 216 pass, zero fail, 1,729 assertions across 13 files |
| Server typecheck | Pass |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/agent-file-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/agent-file-walrus-publisher.test.ts apps/server/src/agent-file-walrus-renewal.test.ts apps/server/src/guarded-runtime-state-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-renewal-deletion-red-2026-10-04.log`, `/tmp/matterhorn-renewal-deletion-final-2026-10-04.log`, `/tmp/matterhorn-renewal-deletion-regressions-2026-10-04.log`, `/tmp/matterhorn-renewal-deletion-typecheck-2026-10-04.log` and `/tmp/matterhorn-renewal-deletion-safety-2026-10-04.log`.

This is service-level local evidence, not hosted account-to-wallet acceptance. It cannot cancel a transaction a wallet already submitted or certify remote erasure. Follow-up targets are Sui anchor/verification completion writes, claim cleanup during account deletion, HTTP deletion-error guidance and downstream use of already-returned context. The full platform review, hosted real responses and operational launch gates remain incomplete.

Specific copy follow-up: `cryptoEvidenceRenewalApiError` currently ends its generic failure message with “Nothing was changed.” That can be misleading after a wallet transaction has been confirmed but local renewal finalization is rejected. Separate the local record outcome from the external transaction outcome and test the HTTP response; the local rejection tests above do not validate that copy.

## Sui anchor completion during workspace deletion

The isolated anchor matrix reproduced three deletion failures: preparation continued after certification or transaction-preview building, and confirmation attached an anchor after transaction verification, despite the workspace deletion marker. Three controls deleting an unrelated workspace passed. A fourth reproduction showed that preparation could return a preview after its five-minute claim expired during the builder wait.

The anchor service now rejects deleted workspaces before returning cached previews or starting confirmation. It rechecks deletion after preparation dependencies and within the final confirmation transaction. Preparation saves its intent in the same SQLite transaction as the workspace, exact claim and current revision checks, using the completion clock without extending the original expiry. The final anchor attachment store method also rejects marked workspaces. Tests confirm that a stale worker cannot clear a replacement claim, that deleted-workspace confirmation leaves the previous intent and evidence revision unchanged, and that certification interrupted by deletion does not start transaction building.

| Check | Result |
| --- | --- |
| Initial anchor reproductions | Four failures and 11 passing existing/control tests |
| Anchor service, package, contract and evidence store suites | 40 pass, zero fail, 219 assertions across four files |
| Auth, guarded runtime and evidence/file lifecycle regressions | 225 pass, zero fail, 1,755 assertions across 13 files |
| Server typecheck | Pass |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-sui-anchor-package.test.ts apps/server/src/crypto-evidence-sui-anchor-contract.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/agent-file-walrus-publisher.test.ts apps/server/src/agent-file-walrus-renewal.test.ts apps/server/src/guarded-runtime-state-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-anchor-deletion-red-2026-10-04.log`, `/tmp/matterhorn-anchor-deletion-final-2026-10-04.log`, `/tmp/matterhorn-anchor-deletion-regressions-2026-10-04.log`, `/tmp/matterhorn-anchor-deletion-typecheck-2026-10-04.log` and `/tmp/matterhorn-anchor-deletion-safety-2026-10-04.log`. The full safety process exited successfully and its terminal result confirms all 11 stages passed.

These service fixtures directly mark the durable workspace state before content cleanup and use synthetic certification, transaction building and verification. They do not perform a wallet signature, contact a chain, or establish hosted account-deletion acceptance. Rejecting local attachment cannot reverse a transaction already submitted by a wallet or delete an immutable on-chain anchor. Existing confirmation intent cleanup remains owned by deletion cleanup/expiry. Evidence verification status writes, HTTP recovery guidance and broader hosted acceptance remain open.

## Evidence verification during workspace deletion

The first integrated verification matrix reproduced five failures. Four success/error paths saved a verification result after workspace deletion during certification or readback. Another path continued to read remote ciphertext after key destruction had changed the record revision during certification. The existing revision check already prevented saving that stale result, but did not stop the unnecessary subsequent read. Controls deleting another workspace remained valid.

The publisher verifier now rechecks the workspace and current revision after certification and readback. The verification service rejects marked workspaces at entry, and the scheduled candidate scan skips them. Status persistence checks the deletion marker, current record revision and status validity in the same immediate SQLite transaction as the write. Renewal confirmation uses the corresponding caller-owned-transaction method so the renewal proof and verification status remain atomic. An initial wrapper-only implementation caused three renewal tests to fail with a nested transaction; the explicit transaction method corrected that regression before final testing.

The final matrix covers certification, readback and the gap immediately before status saving, each with successful/failed transport outcomes and deletion, unrelated-workspace deletion or key destruction. Assertions check both returned results and durable status rows, including failures: neither verified nor failed status is recreated for a deleted workspace. Tests also verify that stale publisher verification does not return success, that no read starts after certification discovers deletion/revision change, and that deleted workspaces cannot initiate direct or scheduled verification.

| Check | Result |
| --- | --- |
| Initial integrated publisher verification suite | Five reproduced failures, 30 passing tests |
| Final publisher, verification, store, renewal and deletion suites | 79 pass, zero fail, 465 assertions across five files |
| Auth, guarded runtime and evidence/file lifecycle regressions | 243 pass, zero fail, 1,819 assertions across 13 files |
| Server typecheck | Pass |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-store.test.ts
bun test apps/server/src/auth.e2e.test.ts apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-store.test.ts apps/server/src/crypto-evidence-finalizer.test.ts apps/server/src/crypto-evidence-walrus-publisher.test.ts apps/server/src/crypto-evidence-walrus-renewal.test.ts apps/server/src/crypto-evidence-walrus-deletion.test.ts apps/server/src/crypto-evidence-verification.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/agent-file-store.test.ts apps/server/src/agent-file-walrus-publisher.test.ts apps/server/src/agent-file-walrus-renewal.test.ts apps/server/src/guarded-runtime-state-store.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs: `/tmp/matterhorn-verification-deletion-red-2026-10-04.log`, `/tmp/matterhorn-verification-deletion-focused-2026-10-04.log`, `/tmp/matterhorn-verification-deletion-regressions-2026-10-04.log`, `/tmp/matterhorn-verification-deletion-typecheck-2026-10-04.log` and `/tmp/matterhorn-verification-deletion-safety-2026-10-04.log`. The full gate exited successfully with all 11 stages passed. These stages include offline/source-contract checks and do not replace hosted acceptance.

These are local service/storage integration tests with synthetic keys and transports. They mark the durable deletion barrier before content cleanup; they do not perform a real account deletion, remote storage request or wallet transaction. The fix does not erase existing remote objects or backup data. HTTP deletion/error recovery guidance, cleanup claims, downstream use of already-returned context and hosted acceptance remain open. The earlier Sui anchor follow-up is commit `5f518a2a8ab991658d5f28359e522012ff24bf9b`.

## Renewal HTTP and UI recovery messages

Four local HTTP tests reproduced missing or misleading renewal recovery guidance: evidence and file confirmation mapped workspace deletion to a generic 503, while verification failures either claimed “Nothing was changed” or gave no wallet recovery action. The tests use normal fixture signup, cookie-authenticated creation/publication/preparation, and confirmation through the HTTP server. A synthetic verification hook either marks the workspace in a second SQLite connection or raises an upstream error. It does not delete the account or contact a chain.

Evidence renewal and file errors now map the deletion marker to 410 with an explicit explanation that the action cannot continue. Generic renewal failures, replay/expiry, review-integrity failures and mismatch messages direct users to check their wallet transaction status before retrying, rather than claiming no external effect. The two UI message functions previously replaced some server messages with “Nothing was recorded” or omitted wallet guidance; their corresponding renewal messages now preserve that uncertainty. Conditional guidance distinguishes users who submitted a transaction from those who only attempted preparation.

| Check | Result |
| --- | --- |
| Initial HTTP recovery matrix | Four failures |
| Full coworker HTTP suite | 20 pass, zero fail, 437 assertions |
| Focused UI message and existing UI contracts | 20 pass, zero fail, 128 assertions |
| Full frontend suite with loopback permission | 1,357 pass, zero fail, 8,128 assertions across 188 files |
| Server and frontend typechecks | Pass |
| Web production build | Pass with existing large-chunk advisory |
| Full local platform safety gate | All 11 stages pass |
| Diff whitespace check | Pass |

```sh
bun test apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 15000
bun test apps/app/tests/storage-wallet-recovery-copy.test.ts apps/app/tests/agent-files-ui-contract.test.ts apps/app/tests/crypto-evidence-verification-ui-contract.test.ts
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Logs use `/tmp/matterhorn-wallet-recovery-` with suffixes `red`, `http`, `app-tests-final`, `app-typecheck`, `app-build`, `server-typecheck` and `safety`, followed by `-2026-10-04.log`. The initial sandboxed frontend run had three loopback listener failures; the permitted rerun above passed without changing those tests. The safety gate exited successfully and its terminal result confirms all 11 stages passed.

Impeccable guided the correction toward plain factual recovery text, and Uncodixfy kept the change copy-only. The automatic design hook found no deterministic issues. There are no new browser captures for these error states: function tests, source review of the existing announced alert containers and build success are not viewport, zoom or screen-reader acceptance. Optional wording feedback was requested; no new legal/provider claim or production setting was introduced.

This pass covers renewal responses only. Separate deletion/anchor error mappings, some expired-claim responses and unknown-error fallbacks still need review. The wallet callbacks also need tests for retaining already-submitted transaction details and safely retrying confirmation without asking for another signature. No live wallet transaction, remote erasure or hosted acceptance was performed. The preceding verification fix is commit `97dcad1cebab6cb87d1c4686e1e36e34258e16f1`.

## Sui anchor intent cleanup

Direct workspace purge omitted active `crypto_evidence_sui_anchor_intent` rows. A failing regression reproduced the retained target-workspace row; the explicit purge list now includes that kind. The test preserves another workspace's intent and the durable deletion barrier. Its synthetic row proves cleanup scope, not validity of a signed wallet intent.

A separate normal HTTP account-deletion test prepares an anchor through the API without signing, advances the disposable fixture clock past preview expiry, and deletes the account. This test already passed before the correction: key destruction triggers existing expired-state cleanup. It checks physical removal using a pre-expiry lookup time, destroyed fixture keys, preservation of the deletion barrier and continued access for another account. Do not describe this passing baseline as a reproduced account-deletion failure.

Final local results: 77 targeted runtime/store/anchor tests pass with 297 assertions; all 21 coworker HTTP tests pass with 450 assertions; server typecheck and all 11 platform-safety stages pass. Logs are `/tmp/matterhorn-anchor-purge-final-2026-10-04.log`, `/tmp/matterhorn-anchor-purge-http-2026-10-04.log`, `/tmp/matterhorn-anchor-purge-typecheck-2026-10-04.log` and `/tmp/matterhorn-anchor-purge-safety-2026-10-04.log`. The initial direct-purge failure is in `/tmp/matterhorn-anchor-purge-red-2026-10-04.log`. Despite its filename, `/tmp/matterhorn-anchor-intent-cleanup-red-2026-10-04.log` contains the passing HTTP baseline.

```sh
bun test apps/server/src/guarded-agent-runtime.test.ts apps/server/src/crypto-evidence-sui-anchor.test.ts apps/server/src/guarded-runtime-state-store.test.ts
bun test apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
```

Source review also confirms that evidence renewal/deletion/anchoring and Agent File renewal callbacks prepare and request wallet submission on each attempt; no separate pending-confirmation state is retained. This is a recovery gap, not proof that a duplicate transaction was executed: cached intents may retain the same transaction digest, while committed confirmations change the record state. Test transient verification failure, lost acknowledgments, expiry, navigation/reload and account/wallet changes before claiming safe retry. No real wallet, provider or hosted request was used for this pass. The preceding recovery-copy correction is commit `c3aabb7f84a3c587522dc903ad15bcdda4674b53`.

## Confirmation retry API acceptance

Four new local HTTP cases exercise evidence renewal, Agent File renewal, Walrus evidence deletion and Sui anchoring. Each creates a disposable owner and outsider through normal signup, publishes synthetic encrypted content, prepares one transaction and injects a temporary verifier error. The HTTP response is 503 without the injected private error detail; the account record remains at revision 2 and the fixture key remains available.

With the verifier restored, cross-account confirmation is denied with 404 and a changed intent hash with 409, neither reaching verification. Retrying only the exact confirmation succeeds. No second preparation occurs, the synthetic transaction builder is called once, and both verification attempts receive the same digest. A subsequent repeat is rejected with 410 `expired_or_replayed` without another verification call. An authenticated list read returns revision 3 with the exact recorded renewal/deletion/anchor digest; deletion also removes the fixture key. The outsider cannot read that result.

This establishes two different recovery paths for the UI: retry confirmation while the original intent remains valid after a temporary failure; reconcile an already-committed operation against its exact digest through an authenticated read when the acknowledgment is uncertain. A 410 alone cannot distinguish successful prior completion from expiry and must never be displayed as success without matching durable evidence. Do not prepare or submit another transaction automatically. The test ignores the successful response body to model an uncertain acknowledgment; it does not physically sever a network connection.

The four new cases pass with 113 assertions. The full coworker HTTP suite passes 25 cases with 563 assertions, and server typecheck passes. Commands:

```sh
bun test apps/server/src/crypto-coworker-routes.e2e.test.ts --test-name-pattern 'confirmation recovery without a new preview' --timeout 15000
bun test apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 15000
pnpm --filter matterhorn-work-server typecheck
```

Logs: `/tmp/matterhorn-confirmation-retry-baseline-2026-10-04.log`, `/tmp/matterhorn-confirmation-retry-http-2026-10-04.log` and `/tmp/matterhorn-confirmation-retry-typecheck-2026-10-04.log`. No production code changed in this test-only follow-up. The immediately preceding cleanup fix and its full safety pass are recorded above; its commit is `0aec4aa1d0932b0bcd3d52a70520b47cd84beb8f`.

The API-only pass left UI wiring and recovery acceptance open. The following section records the subsequent implementation and its narrower verified coverage. A temporary failure before expiry is not proof that an expired intent can be recovered. These HTTP tests perform no wallet signing, real chain calls or hosted traffic.

## Pending wallet confirmation recovery

All four UI callbacks now share a recovery controller: evidence renewal, file renewal, evidence deletion and Sui anchoring. It validates and saves minimal transaction metadata before opening the existing wallet flow. Pending entries are partitioned by backend, credential, authenticated cache owner, workspace and resource. Only an opaque scope hash is persisted, not the bearer token. The entry contains the action, resource/revision, signer/network, intent identity, digest and expiry; it contains no transaction bytes, file contents or key material. This browser metadata is not encrypted. Logout/account-boundary cleanup removes it, and generation checks prevent delayed operations from recreating it after cleanup.

The notice offers **Check confirmation**, which never opens another wallet request. It first reads the server record, retries only the saved confirmation while valid, then verifies an exact committed digest and newer revision before clearing the pending entry. Deletion additionally requires the key-destroyed state. Web Locks prevent concurrent operations for the same resource across tabs; absent browser support fails closed. Expired, uncertain, malformed or unwritable recovery state gives guidance instead of automatically preparing another transaction. The existing consent and wallet-signing controls remain in place.

This review reproduced and fixed three additional recovery defects:

- Removing pending metadata could make a retry resolve without proof of completion. Missing metadata now requires a matching server record or returns an unresolved error.
- A stale retry could attempt to confirm a replacement intent saved by another tab. It now rejects a changed action, intent ID/hash or digest before confirmation.
- The evidence list defaults to 50 records, so older pending records could not reconcile. The authenticated list now accepts a bounded optional `evidenceId` filter, applied after owner scoping and before the list limit. Recovery requests one exact record. A 51-record HTTP fixture proves lookup beyond the first page, same-workspace foreign-owner and unknown IDs return no items, and invalid filter lengths return 400. The new frontend and backend should ship together; an old backend ignores this filter and cannot guarantee recovery for older records.

Final local checks:

| Check | Result |
| --- | --- |
| Frontend regression suite | 1,381 pass, zero fail, 8,291 assertions across 189 files |
| Coworker HTTP regression suite | 26 pass, zero fail, 573 assertions |
| App and server typechecks | Pass |
| Web production build | Pass; existing large-chunk advisory remains |
| Platform safety gate | Pass, all 11 configured stages |
| Diff whitespace | Pass |

The recovery tests cover four-action retry/reload and uncertain acknowledgments, wrong digests, expiry, uncertain wallet errors, account changes during submission, storage failure, malformed/transplanted metadata, overlapping clicks, missing metadata and stale replacement intents. They use synthetic fetch responses with the actual API client and an injected lock; they do not prove real wallet behavior or browser locking under contention. HTTP fixtures use disposable normal-signup accounts and synthetic keys/transports.

```sh
pnpm --filter @matterhorn-work/app test
bun test apps/server/src/crypto-coworker-routes.e2e.test.ts --timeout 15000
pnpm test:matterhorn-platform-safety
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app build
git diff --check
```

Final logs are `/tmp/matterhorn-wallet-pending-app-tests-final-reviewed-2026-10-04.log`, `/tmp/matterhorn-wallet-pending-http-verified-2026-10-04.log`, `/tmp/matterhorn-wallet-pending-safety-permitted-2026-10-04.log`, `/tmp/matterhorn-wallet-pending-app-typecheck-final-2026-10-04.log`, `/tmp/matterhorn-wallet-pending-server-typecheck-final-2026-10-04.log` and `/tmp/matterhorn-wallet-pending-build-final-2026-10-04.log`. Failing reproductions use `/tmp/matterhorn-wallet-missing-metadata-red-2026-10-04.log`, `/tmp/matterhorn-wallet-stale-retry-red-2026-10-04.log` and `/tmp/matterhorn-wallet-exact-record-red-2026-10-04.log`.

An initial sandboxed frontend run failed three loopback listener tests, and an initial safety run failed local listener setup. Permitted reruns passed without weakening tests. Running bare app TypeScript checking while another command rebuilt the shared SDK also produced missing-declaration errors; the successful final run used the normal pretypecheck and sequential safety/typecheck/build steps.

The disposable `bun apps/app/scripts/wallet-confirmation-fixture.ts` browser harness renders the actual recovery hook, notice and shared controls against synthetic loopback responses, with no wallet/provider connection. A bounded capture round covered light desktop and dark mobile; the final confirmation round used the rebuilt harness in dark desktop (1280×720) and mobile (390×844). Pending metadata survived reload, the mount's synthetic submission count stayed at zero during confirmation-only retry, and restoring the fixture verifier removed the pending notice with “Matching transaction recorded.” The mobile DOM reported width and scroll width of 390. Keyboard Tab from the transaction disclosure reached Check confirmation with a visible 3px focus outline. Native screenshots were inspected in the tool output but are not saved as repository artifacts. The fixture server/tab were closed and viewport reset; user previews/chats were untouched. The final subsequent stale-intent controller guard is covered by automated tests, not a new browser capture.

Impeccable guided truthful recovery/error handling and bounded visual verification; Uncodixfy kept the incumbent layout. This is not full wallet acceptance: actual wallet rejection versus submission, safe release of a genuinely unsigned/expired request, recovery after logout or loss of browser metadata, changed-wallet browser interactions, multi-tab contention, unavailable reads, 200% zoom, screen-reader announcements and cross-browser behavior remain unverified or incomplete. An uncertain wallet exception intentionally retains the entry and may require support; there is no dismiss-and-resubmit bypass. Do not claim server-resumable recovery, real-chain acceptance or launch readiness from this pass. Hosted desk/auth/accounting/email/restore gates remain unchanged.

## Polymarket policy review deadline

The broader regression run found that the bundled policy's review deadline is `2026-10-04T00:00:00.000Z`, which had passed at execution time. `evaluatePolymarketOpenPositionJurisdiction` now returns `policy_review_required` for otherwise valid jurisdiction evidence, and guarded capability issuance denies new-position preparation. This is intended fail-closed behavior. The production deadline and restrictions were not changed. This result concerns the local candidate; the exact hosted policy version and user-facing recovery text have not been verified. It does not establish that public research reads are broken.

The old runtime test used wall-clock time while always expecting an allowed preparation. It was changed to exercise both a reviewed date and the exact expiry boundary using separate disposable state databases, with clock restoration in `finally`. Both retain the assertions that raw location is absent from capability/receipt output. An initial attempt shared the runtime database across clock changes and failed grant validation; isolation corrected the test setup without weakening grant checks. Final tests pass before and at expiry; they do not renew the policy or prove current venue eligibility.

Release action: review the current official venue restrictions and the applicable product/compliance scope before approving a versioned policy update. Do not simply advance the date, bypass the gate or accept browser/model location claims. Until that review is complete, new-position preparation must remain unavailable with accurate guidance. Verify the expiry-state UI and hosted behavior before advertising that workflow as ready.

## Remaining work

- The hosted signup-screen/API discrepancy is not root-caused by this local reproduction. Inspect the deployed response and network failure in a working browser session before attributing it to this bug.
- The public auth mutation lifetime correction below now covers obsolete form callbacks. The account-security review below adds guards for exports, password changes and deletion callbacks. Neither correction rolls back server mutations or establishes browser-cookie ordering across simultaneous logins. The subsequent synthetic browser pass verifies selected account-switch/unmount cases; real authenticated browser acceptance remains open.
- Fresh hosted responses on all five desks, optional Jev acceptance, accounting settlement, two-account isolation, real email/reset delivery, logout cleanup and production backup/restore evidence remain outstanding as recorded in the [previous launch report](../2026-10-03/RESULTS.md). No fresh hosted state is asserted in this pass.
- The limited responsive and keyboard evidence above does not establish platform-wide accessibility, cross-browser or theme acceptance.
- The Polymarket policy review and expiry-state UI/hosted checks above are open release actions; passing historical policy tests does not establish current eligibility.
- All 11 local safety stages pass after the renewal-completion corrections. These include offline and source-contract checks, not fresh hosted acceptance or real inbox/provider/restore evidence. The final gate log is `/tmp/matterhorn-renewal-deletion-safety-2026-10-04.log`.

These corrections and regression results do not establish launch readiness. Continue with writes already past request-body validation, auth mutation lifecycle and the remaining acceptance work above.

## Public auth mutation lifetime

The earlier access-check cancellation did not cover form submissions. A synthetic browser reproduction held a sign-in response for connection A, switched the mounted form to connection B, then released A's response. The fixture's accepted-sign-in counter advanced from zero to one while B was selected. This demonstrates an obsolete UI callback, not an authentication bypass or a real account switch.

The public auth client now accepts an optional abort signal for sign-in, signup, email verification/resend and password-reset request/confirmation. The form keeps one synchronous mutation slot, aborts it on unmount or connection/account reset, and checks its identity, connection and account generation before displaying results or invoking the signed-in callback. The independent session check uses the same cancellation signal. A late operation cannot clear the busy state of its replacement. Connection/account changes clear email, passwords, verification codes, consent checkbox, Turnstile token and password-reset token so the new connection cannot reuse those form values. No auth policy, registration gate, layout or backend mutation was changed.

The fixture now has a **Fixture delayed sign-in** control. Its sign-in/session responses are synthetic only, use no cookies, and create no accounts. Reproduce using `bun apps/app/scripts/public-auth-recovery-fixture.ts`, select the delayed sign-in scenario, enter disposable fictional values, submit through the actual form, switch connection, and release the old response. Before the correction the accepted-sign-in count became one; after the correction it stayed zero. Both email and password fields were confirmed empty through read-only DOM checks. A subsequent current-connection sign-in advanced the counter to one, while another delayed response released after unmount left it at one. This is an actual component/browser check against a fixture, not hosted sign-in acceptance. The temporary server and tab were stopped; user previews/chats were untouched. A native screenshot of the final fixture counter was inspected but not saved as a repository artifact.

New unit tests cover duplicate submission exclusion before React rerenders, invalidation on cancellation, old completion not clearing a replacement, and late success/error suppression after an account-generation change. Six transport tests verify that each mutation receives cancellation without misreporting it as a timeout. The focused auth/accessibility group passes 70 tests with 211 assertions. The full frontend suite passes 1,390 tests with 8,321 assertions across 190 files, and frontend typecheck passes.

```sh
bun test apps/app/tests/public-auth-mutation.test.ts apps/app/tests/public-auth-client.test.ts apps/app/tests/public-web-auth-errors.test.ts apps/app/tests/responsive-a11y-regressions.test.ts
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app typecheck
pnpm test:matterhorn-platform-safety
pnpm --filter @matterhorn-work/app build
git diff --check
```

Logs: `/tmp/matterhorn-auth-lifetime-focused-2026-10-04.log`, `/tmp/matterhorn-auth-lifetime-frontend-2026-10-04.log`, `/tmp/matterhorn-auth-lifetime-typecheck-2026-10-04.log`, `/tmp/matterhorn-auth-lifetime-safety-2026-10-04.log` and `/tmp/matterhorn-auth-lifetime-build-2026-10-04.log`. The full safety gate completed successfully with all 11 stages passed; the subsequent production build passed with the existing large-chunk advisory. Diff whitespace checking passed. These stages include offline/source contracts, not fresh hosted or real inbox evidence.

Impeccable's hardening guidance kept progress/error ownership tied to the active form; Uncodixfy preserved the existing interface. The documentation skill kept this evidence and its limitations in the established repository report. The browser reproduction covers delayed sign-in, not every form branch, real credential changes, email delivery, cookie side effects or multi-tab login ordering. Aborting a request cannot undo an account, email, password or session already changed on the server. Do not claim full auth mutation safety or hosted release readiness. The following section records the subsequent authenticated account-security review.

## Account security response lifetime and validation

Five delayed-response regressions initially failed: security summary, account export, session revocation, password change and account deletion could resolve after the account boundary changed. The client now checks the account generation before dispatch and after either success or failure. The keyed account-security component also checks its mounted lifetime before accepting data or running download, cache-refresh and session-ending callbacks. A stale server error becomes a generic account-change error instead of displaying the old account's server message. This discards obsolete results; it does not abort these requests, undo server-side mutations or prevent a response from changing browser cookies.

A separate failing reproduction showed all five methods accepting malformed HTTP-success bodies. Each now validates the fields used by the UI against the current server contract. Checks include session counts, organization roles, export version/profile/legal fields and safe JSON filename, explicit password/session acknowledgments, and consistent completed versus pending deletion results. Invalid responses produce an uncertainty message instead of claiming success. Valid 202 deletion responses remain accepted as pending. Pending-deletion copy no longer claims that the account has already been deleted. No authorization, registration, consent or deployment setting changed, and no dependency was added.

The focused tests use synthetic fetch responses through the real Den client, plus actual TanStack Query mutation observers. They cover unchanged-account success, all five stale completions, stale errors, disposed requests, malformed responses, contradictory deletion states, valid pending deletion, suppression of an export callback after disposal and suppression of a password-success callback after an invalid acknowledgment. The component wiring test is a source assertion, not a mounted React interaction test. Existing rendered account-security regressions run as static markup.

Current results:

- Focused account-security/lifecycle suite: 43 pass, zero fail, 175 assertions across four files.
- Full frontend suite: 1,412 pass, zero fail, 8,393 assertions across 191 files.
- Existing local auth HTTP suite: 46 pass, zero fail, 786 assertions. It uses disposable normal-signup accounts and covers actual server session revocation, password rotation, account/workspace/memory deletion and access denial. It does not exercise the frontend validator through a browser or send real email.
- Safety gate: all 11 stages pass. Frontend typecheck and production build pass; the existing large-chunk build advisory remains. Diff whitespace check passes.

```sh
bun test apps/app/tests/account-security-client-lifetime.test.ts apps/app/tests/account-client-state.test.ts apps/app/tests/account-lifecycle-contract.test.ts apps/app/tests/account-security-render.test.tsx
pnpm --filter @matterhorn-work/app test
bun test apps/server/src/auth.e2e.test.ts --timeout 20000
pnpm test:matterhorn-platform-safety
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build
git diff --check
```

Failing reproductions: `/tmp/matterhorn-account-security-lifetime-red-2026-10-04.log` and `/tmp/matterhorn-account-security-response-red-2026-10-04.log`. Passing logs: `/tmp/matterhorn-account-security-focused-2026-10-04.log`, `/tmp/matterhorn-account-security-final-frontend-permitted-2026-10-04.log`, `/tmp/matterhorn-account-security-auth-http-2026-10-04.log`, and `/tmp/matterhorn-account-security-final-{safety,typecheck,build}-2026-10-04.log`. The initial sandboxed frontend run failed three loopback-listener tests; the permitted rerun passed without test changes.

Impeccable guided truthful failure/pending states; Uncodixfy preserved the existing layout, and the documentation skill kept the evidence in this repository. No new browser capture was made for this pass. Remaining checks include mounted-component account switching/unmounting, actual downloads, visibility of notices across the existing hard redirect, multi-tab cookie ordering, real inbox flows and hosted two-account acceptance. In particular, the session-ended message is stored in React state before `window.location.assign`; durable display after that navigation remains unverified. Server deletion-job recovery and production backup/restore evidence are separate gates. No production account was changed; nothing was pushed, merged or deployed. The overall QA goal remains incomplete.

## Account security browser verification and announcements

The preceding lifetime/validation correction is committed as `d0df1aea7213fda14fec3df71c536562cbc5cc48`. This follow-up renders the actual account-security component, real Den client and TanStack Query against a disposable loopback server. Run `bun apps/app/scripts/account-security-fixture.ts` and open the printed URL. Its controls select ready, delayed, malformed or pending-deletion responses; Switch account changes both the account generation and connection. It has no real accounts, authentication cookies, credentials, email, provider requests or deletion side effects. No existing preview or chat was reused.

Browser observations:

- Delayed account-A export, switch to B, then release: download-click count stayed zero and B remained active.
- A current-account export initiated one download and showed success. The browser download-event API timed out, so a saved file was not verified. The copy now says **Account record download started**, not downloaded.
- Malformed export: the existing error appeared and the download-click count did not increase.
- Delayed export, unmount, then release: no additional download click occurred.
- Delayed synthetic password response, switch account, then release: the new account remained visible; no session-ending callback or redirect occurred.
- A valid synthetic pending-deletion response invoked the pending message and redirected. The fixture preserves that callback in a diagnostic session-storage field solely for observation. This does not prove the product preserves its notice after navigation.

The first browser DOM inspection found no alert/status/live region for the visible account error. A failing rendered-component test reproduced the missing role. `SettingsNotice` now accepts an optional alert/status role, and this account surface opts in for its error and completion notices. Other settings notices remain unchanged. The corrected browser exposed the error through `getByRole("alert")`. This verifies markup, not a spoken screen-reader announcement.

A bounded capture round covered 1280×900 light desktop and 390×844 dark mobile; the confirmation round checked the corrected mobile alert and keyboard focus. Mobile document width and scroll width were both 390, and password inputs computed to 16px. Tab from Download account record reached Change password with a visible focus outline. Native screenshots were inspected in tool output but are not saved as repository artifacts. Intermittent browser command timeouts were recovered through fresh state inspection; no timed-out action is counted as evidence. The temporary tab/server were closed and viewport override reset.

Final checks: 44 focused lifecycle/render tests pass with 181 assertions; 1,413 frontend tests pass with 8,399 assertions across 191 files; all 11 platform safety stages, frontend typecheck, production build and diff whitespace checks pass. The existing large-chunk advisory remains. The auth HTTP suite was not rerun in this markup-only follow-up; its preceding 46-test result remains historical evidence. Logs: `/tmp/matterhorn-account-security-announcements-red-2026-10-04.log`, `/tmp/matterhorn-account-security-browser-focused-2026-10-04.log`, and `/tmp/matterhorn-account-security-browser-{frontend,safety,typecheck,build}-2026-10-04.log`.

The next defect identified by this pass was that `onSessionEnded` stored the password/deletion outcome only in React state, followed immediately by `window.location.assign("/")`. Both sign-in surfaces initialized their notice state to null. The following section records its correction; the diagnostic fixture callback above was not that correction. Real download persistence, multi-tab cookie ordering, hosted account/desk/inbox acceptance, 200% zoom, screen-reader and cross-browser checks remain open. Impeccable guided the truthful copy and announcement fix; Uncodixfy preserved the incumbent layout. Nothing was pushed, merged or deployed.

## Account outcome notices across sign out

Password-change and account-deletion acknowledgments now write a fixed outcome code and creation time to same-tab session storage after account cleanup and before navigation. The sign-in notice consumes and removes it once, rejects values older than five minutes or from a future clock, and maps only the three known codes to local copy. No email, account ID, password, credential, endpoint or server error text is written. This is a navigation notice, not evidence of authorization or independent proof of server deletion. An earlier notice is removed before replacement, so a failed replacement write does not replay the old outcome when removal succeeds.

The shared notice is connected to public-web sign-in and the existing Cloud sign-in presentation. It has status/live-region semantics, uses the existing visual styles, and registers to clear its displayed text at the account boundary. Connection changes remount the notice. Storage errors do not block sign-out or display raw errors: if storage is unavailable, the notice cannot survive navigation. This limitation is intentional and remains distinct from the actual account operation.

The disposable fixture now navigates from the actual account-security component to the actual public-web sign-in component. Synthetic password change displayed the password-changed notice after the full navigation; a second reload did not replay it. A synthetic HTTP 202 deletion displayed the pending-deletion notice, never the completed message. These observations used role/status queries as well as the visible page, separate from the fixture's diagnostic callback text. No actual credentials were changed and no real account was deleted. The valid completed-deletion code is covered by helper tests, not a separate browser run.

The first capture found a fixture-only constrained parent and missing logo route; those were corrected without changing the product layout. The final mobile capture showed the pending notice near the sign-in heading. A 390px DOM check reported no horizontal overflow before the fixture adjustment. Final desktop capture and account-switch cleanup verification were interrupted by browser-control timeouts; neither is counted as passed. The temporary tab and server were closed and the viewport reset. Captures were inspected natively but not saved as repository image artifacts. The last failed-write replacement guard has automated coverage, not an additional browser capture.

Final checks: 42 focused tests pass with 175 assertions across four files; 1,420 frontend tests pass with 8,441 assertions across 192 files; all 11 safety stages, frontend typecheck, production build and diff whitespace pass. The existing bundle-size advisory remains. Focused command: `bun test apps/app/tests/account-outcome.test.ts apps/app/tests/account-lifecycle-contract.test.ts apps/app/tests/account-security-render.test.tsx apps/app/tests/account-security-client-lifetime.test.ts`. Full commands are the same frontend/safety/typecheck/build commands listed above. Logs: `/tmp/matterhorn-account-outcome-final-{focused,frontend,safety,typecheck,build}-2026-10-04.log`.

The notice tests cover all known outcomes, one-time consumption, exact expiry, future/invalid clocks, malformed and oversized values, arbitrary stored text, unavailable/throwing storage, failed removal and failed replacement. The previous server auth HTTP evidence is not a fresh browser or hosted result. Remaining work includes real Cloud/desktop sign-in notice delivery, mounted account-switch clearing, Strict Mode effect replay, storage-disabled browser behavior, actual download persistence and all broader hosted/accounting/email/restore gates. Impeccable guided the non-sensitive recovery notice and bounded inspection; the documentation skill preserves the evidence and limits in this report. No push, merge or deployment occurred.

## Hosted release and public sign in recheck

The read-only deployment probe completed at **2026-10-04 14:53:51 UTC**. GitHub's `dev` branch still reports `e4342d6bef8d833d12e36bd8093a87c8dbe84856`; both hosted web HTML and API headers report `9b74d923b8c999733fe698c29a6555dd2980460b`. The deployed revision is 27 commits behind that remote baseline. The local candidate before this documentation update is `e8ee860e5d44ff4f7c3a1d0f1c72b6239984d751`, itself 27 commits beyond the remote baseline. These are distinct comparisons: deploying current `dev` alone would still omit the local corrections.

The strict probe exits 1 with three failed checks: web commit mismatch, API commit mismatch and guarded runtime mode `off` instead of the expected `enforce`. Runtime readiness is reported as true while the mode is off. This does not prove an authorization bypass or that every other guard is absent. It means the required guarded-runtime release setting is not established. The `/health/launch` endpoint reports ready; that narrower configuration signal must not be treated as platform-wide acceptance.

The other 27 probe checks pass: HTTPS, successful app/health responses, same-origin routing, the sampled security headers, JSON 401 denial on `/workspaces` and `/opencode/global/health`, and the trusted/untrusted CORS challenges. Public auth configuration reports signup open, email verification required, password reset available, legal acceptance required and a configured Turnstile site key. No account was created and no email delivery, restore, authenticated session or inference was tested.

Reproduction command (GET and OPTIONS only, no credentials):

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://desks.matterhorn.so \
  --server-url https://desks.matterhorn.so \
  --allowed-origin https://desks.matterhorn.so \
  --expected-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-web-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-guarded-mode enforce --expected-signup-status open --strict \
  --json-output /tmp/matterhorn-hosted-release-recheck-2026-10-04.json
```

### Browser specific signup failure

A new background Codex browser tab at `/session` reached the signed-out screen with enabled email/password/sign-in controls, but Create account and Forgot password remained disabled. The page claimed that secure email delivery was being configured. A separate command-line GET to `/api/auth/config` returned HTTP 200, `Cache-Control: no-store`, signup open and password reset available. Thus the contradictory visible state is freshly reproduced, not merely carried forward from the earlier report.

Opening that exact public config URL directly in another Codex browser tab failed with `net::ERR_BLOCKED_BY_CLIENT`. No security protection was bypassed. This is evidence of a client-side loading block in this browser environment, not proof that the hosted endpoint is down. The available browser console log API returned no errors. The tool's read-only DOM evaluator cannot inspect resource timing, so the actual in-page failed fetch response was not captured.

Inspection of the publicly served `app-Hue0tu8o.js` and its referenced `index.react-CgjtqoYz.js` confirms same-origin auth configuration. The deployed sign-in code catches a configuration-load error and substitutes `setup_required`, then displays the email-setup explanation. This supports the misleading-fallback diagnosis, but the direct-navigation block does not establish why the in-page fetch failed or that it failed for the same reason. Do not report an email-provider outage from this observation. The local candidate already distinguishes unavailable configuration from authoritative setup-required status and supplies retry guidance; see the earlier public-auth recovery evidence. It is not yet deployed.

Next verification: inspect the in-page config request in a supported regular browser and the Codex preview without disabling security protections; distinguish browser/client blocking, network failure and a real setup-required response. After an approved deployment, verify that failed configuration loading offers accurate retry guidance, successful loading enables eligible actions, and the real signup/verification/reset flows complete using controlled inboxes. Do not activate signup or change email configuration merely to remove this message.

This was a narrow functional audit guided by Impeccable, not a scored full accessibility/performance/theme audit. It creates no new platform-wide UI certification. The documentation skill preserved observed facts separately from hypotheses and historical test evidence. No product code, production settings, accounts or user-owned previews were changed; no push, merge or deployment occurred. Hosted five-desk responses, accounting, two-account isolation, email delivery, encryption/restore evidence and the policy-review gate remain open.

## Password changes and obsolete reset links

**P1 security finding, corrected locally:** an authenticated password change revoked sessions but did not delete previously issued password-reset challenges. A valid old reset link could therefore overwrite the newly chosen password until its original one-hour expiry. A store-level regression reproduced this successful obsolete reset. This requires possession of a valid reset link; it is not evidence of a credential-free account takeover or an observed production incident.

Both successful password-change paths now share transaction-scoped recovery invalidation. The authenticated change deletes the account's outstanding reset challenges, and reset confirmation retains that invalidation. Both retire only that account's pending, retrying or sending password-reset emails, clear their stored link payloads and label them `password_changed`. Password update, session revocation, challenge deletion and queue retirement commit together. Another account's challenges/sessions and unrelated verification emails are untouched; already accepted delivery history is retained. No schema migration, production cleanup or credential change was performed.

The first nine new store tests produced eight failures and one pass before correction. The final expanded suite includes failed-current-password preservation, two-account isolation, new recovery after rotation, pending/retry/sending outbox states, late acceptance/failure callbacks and transaction failures during both challenge deletion and email retirement. SQL-trigger failures prove that password, sessions, challenge and pending email remain recoverable when cleanup cannot commit. These are disposable local databases, not production corruption tests.

A new local HTTP test signs up normally, captures a console-transport reset email, changes the password with its authenticated cookie, rejects the earlier link with HTTP 400 `invalid_reset_token`, confirms the original session is invalid and signs in with the new password. It then requests a fresh link, completes recovery successfully, verifies session invalidation and signs in with the recovered password. All account data and email are disposable; no real inbox or provider is contacted.

| Check | Result |
| --- | --- |
| Recovery, verification, outbox and maintenance suites | 26 pass, zero fail, 149 assertions across four files |
| Full local auth HTTP suite | 47 pass, zero fail, 800 assertions |
| Server typecheck and build | Pass |
| Platform safety gate | All 11 stages pass |
| Diff whitespace | Pass |

```sh
bun test apps/server/src/auth-password-lifecycle.test.ts apps/server/src/auth-store-verification.test.ts apps/server/src/auth-email-outbox.test.ts apps/server/src/auth-store-maintenance.test.ts
bun test apps/server/src/auth.e2e.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
pnpm test:matterhorn-platform-safety
git diff --check
```

Logs: `/tmp/matterhorn-password-lifecycle-red-2026-10-04.log`, `/tmp/matterhorn-password-lifecycle-focused-final-2026-10-04.log`, `/tmp/matterhorn-password-lifecycle-auth-http-final-2026-10-04.log`, and `/tmp/matterhorn-password-lifecycle-{typecheck,build,safety}-2026-10-04.log`. The first HTTP attempt could not bind a loopback listener in the sandbox; the permitted full-suite run passed without weakening tests. No frontend code changed, and the previous full frontend result is historical, not a rerun in this pass.

Limitations and release actions: a worker may already hold an email payload or have handed it to a provider, so queue retirement cannot recall an in-flight email. Its reset link is invalid after a successful password change. The `terminal/password_changed` state is expected invalidation, not an email-provider failure. This fix acts on future password changes; it does not retroactively erase old production challenges or provider-held messages. Previously issued links retain their existing one-hour expiry unless an operator separately approves cleanup or a subsequent password change invalidates them. Multi-process races and multi-tab browser cookie ordering are not certified by these synchronous-store/local-HTTP tests. Hosted password recovery requires controlled accounts and inbox access after an approved deployment. The broader launch gates remain open. The documentation skill keeps those limits separate from the passing regression evidence.

## Concurrent reset token consumption

The preceding sequential correction is committed as `3409f34589a6249022f1d2184552531b5e63dc79`. A subsequent concurrent review reproduced another **P1 security defect**: `resetPassword` read a challenge before computing the password hash, then updated the password without confirming that the challenge still existed. A request already past that read could overwrite a newer password even after the token had been consumed, replaced or invalidated by another database connection.

The new regression fixture uses a worker thread and the main thread with independent SQLite connections to the same disposable database. A barrier pauses the worker immediately after its challenge read. The main connection then performs an authenticated password change, consumes the same reset token, or issues a replacement link. After release, the stale worker reset succeeded in all three pre-fix cases. This is controlled concurrent database execution, not a timing-only test or an HTTP mock; it is not a certification of a multi-host deployment.

Reset confirmation now conditionally deletes the exact, unexpired token inside the write transaction and requires exactly one affected row before updating the password. Losing requests receive `invalid_reset_token`; they cannot overwrite the winner, revoke its sessions or consume its replacement challenge. Hash computation remains outside the write transaction. Failure later in the transaction rolls token consumption back with the existing password/session/email operations. No migration or production data operation is added.

All three interleavings pass after correction. A fourth case advances only the disposable worker's clock after its initial check, proving that expiry is rechecked at commit time and rejection leaves the original account/session usable. Fresh recovery and valid sign-in still work. The worker fixture closes its database, restores its clock and terminates; the main test removes only its generated temporary directory. It does not alter machine time, user accounts, existing previews or provider state.

Results:

- Focused concurrency, password lifecycle, verification, outbox and maintenance suites: **30 pass, zero fail, 168 assertions across five files**.
- Full local auth HTTP suite: **47 pass, zero fail, 800 assertions**.
- Server typecheck and build: pass.
- Expanded platform safety gate: all **11 stages pass**, including all four new worker scenarios.
- Security workflow and safety-gate contract tests, plus diff whitespace: pass.

The password-lifecycle and concurrency tests are now included in `.github/workflows/security.yml` and the local platform safety gate; their contract tests require both entries. These workflow edits have been checked locally, not run on GitHub. No branch was pushed or merged.

```sh
bun test apps/server/src/auth-reset-concurrency.test.ts apps/server/src/auth-password-lifecycle.test.ts apps/server/src/auth-store-verification.test.ts apps/server/src/auth-email-outbox.test.ts apps/server/src/auth-store-maintenance.test.ts
bun test apps/server/src/auth.e2e.test.ts --timeout 20000
pnpm --filter matterhorn-work-server typecheck
pnpm --filter matterhorn-work-server build
node scripts/security-workflow-contract.test.mjs
node scripts/matterhorn-platform-safety-gate.test.mjs
pnpm test:matterhorn-platform-safety
git diff --check
```

Logs: `/tmp/matterhorn-reset-concurrency-red-2026-10-04.log`, `/tmp/matterhorn-reset-concurrency-focused-final-2026-10-04.log`, `/tmp/matterhorn-reset-concurrency-http-2026-10-04.log`, `/tmp/matterhorn-reset-concurrency-typecheck-final-2026-10-04.log`, `/tmp/matterhorn-reset-concurrency-build-2026-10-04.log` and `/tmp/matterhorn-reset-concurrency-safety-2026-10-04.log`.

Next security coverage is concurrent sign-in, authenticated password change and email-verification completion against credential/session changes. This reset-specific correction does not certify those separate paths, browser cookie ordering, actual inbox delivery or hosted rollout. The broader UI, five-desk, accounting, privacy and operational acceptance requirements remain unchanged. The documentation skill keeps the new evidence scoped to the tested reset path.

## Concurrent credential and verification authority

The subsequent review reproduced nine unsafe interleavings in sign-in, password change and verification. Two independent SQLite connections to a disposable database pause a worker after its credential reads, while the other connection rotates credentials, signs out, replaces a verification challenge or completes verification. Before correction all nine stale operations incorrectly succeeded. This is a deterministic concurrent database reproduction, not an observed hosted incident or a multi-host certification.

Sign-in now conditionally matches the verified password hash and salt inside the session-creation transaction, including legacy hash upgrades. Password changes also require the exact session to remain active and the captured credentials to remain unchanged at the write. Verification consumes the exact unexpired challenge within the same transaction as verification and session issuance. Expired-challenge cleanup matches the captured challenge so it cannot delete a replacement code. No schema or production data change is introduced.

The new suite covers the nine original interleavings, expired-code replacement, and rollback after failed session creation for both legacy sign-in and verification. Winning credentials, replacement challenges, other accounts and valid subsequent recovery remain usable. The worker-local interception does not add production hooks or print credentials. The suite is included in the local safety gate and GitHub security workflow; remote CI has not run.

- Focused credential/reset/password/verification/outbox/maintenance suites: **42 pass, zero fail, 251 assertions across six files**.
- Local auth HTTP, backend security and request rate-limit suites: **110 pass, zero fail, 1,102 assertions across three files**.
- Server typecheck and build, both workflow contract checks, and diff whitespace: pass.
- Full platform safety gate: **all 11 stages pass**, with a confirmed terminal exit of zero.

Evidence logs: `/tmp/matterhorn-credential-concurrency-red-2026-10-04.log`, `/tmp/matterhorn-credential-concurrency-focused-final-2026-10-04.log`, `/tmp/matterhorn-credential-concurrency-http-2026-10-04.log`, and `/tmp/matterhorn-credential-concurrency-{typecheck,build,safety}-2026-10-04.log`. Run the six named server suites with `bun test`; run the three HTTP/security/rate-limit suites with `--timeout 20000`; run `pnpm --filter matterhorn-work-server typecheck`, `pnpm --filter matterhorn-work-server build`, and `pnpm test:matterhorn-platform-safety`.

No frontend changes or fresh frontend/browser acceptance are claimed in this pass. Hosted inbox delivery, browser cookie ordering, all five desks and operational release gates remain open. The next security review covers account-deletion preparation and revoking other sessions across concurrent authority changes. No push, merge or deployment occurred.
