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

## Polymarket policy review deadline

The broader regression run found that the bundled policy's review deadline is `2026-10-04T00:00:00.000Z`, which had passed at execution time. `evaluatePolymarketOpenPositionJurisdiction` now returns `policy_review_required` for otherwise valid jurisdiction evidence, and guarded capability issuance denies new-position preparation. This is intended fail-closed behavior. The production deadline and restrictions were not changed. This result concerns the local candidate; the exact hosted policy version and user-facing recovery text have not been verified. It does not establish that public research reads are broken.

The old runtime test used wall-clock time while always expecting an allowed preparation. It was changed to exercise both a reviewed date and the exact expiry boundary using separate disposable state databases, with clock restoration in `finally`. Both retain the assertions that raw location is absent from capability/receipt output. An initial attempt shared the runtime database across clock changes and failed grant validation; isolation corrected the test setup without weakening grant checks. Final tests pass before and at expiry; they do not renew the policy or prove current venue eligibility.

Release action: review the current official venue restrictions and the applicable product/compliance scope before approving a versioned policy update. Do not simply advance the date, bypass the gate or accept browser/model location claims. Until that review is complete, new-position preparation must remain unavailable with accurate guidance. Verify the expiry-state UI and hosted behavior before advertising that workflow as ready.

## Remaining work

- The hosted signup-screen/API discrepancy is not root-caused by this local reproduction. Inspect the deployed response and network failure in a working browser session before attributing it to this bug.
- The local auth config loading/failure/recovery defects above are corrected. In-flight auth mutation completion across connection/account changes still needs a separate lifecycle review; the present cancellation tests cover access checks, not server-side rollback of mutations.
- Fresh hosted responses on all five desks, optional Jev acceptance, accounting settlement, two-account isolation, real email/reset delivery, logout cleanup and production backup/restore evidence remain outstanding as recorded in the [previous launch report](../2026-10-03/RESULTS.md). No fresh hosted state is asserted in this pass.
- The limited responsive and keyboard evidence above does not establish platform-wide accessibility, cross-browser or theme acceptance.
- The Polymarket policy review and expiry-state UI/hosted checks above are open release actions; passing historical policy tests does not establish current eligibility.
- All 11 local safety stages pass after the renewal-completion corrections. These include offline and source-contract checks, not fresh hosted acceptance or real inbox/provider/restore evidence. The final gate log is `/tmp/matterhorn-renewal-deletion-safety-2026-10-04.log`.

These corrections and regression results do not establish launch readiness. Continue with writes already past request-body validation, auth mutation lifecycle and the remaining acceptance work above.
