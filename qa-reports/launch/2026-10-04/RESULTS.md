# Authentication failure path QA

4 October 2026. This review fixed client response-validation and auth recovery defects. The full-platform QA goal remains incomplete. No hosted release, account, provider, production setting, existing preview runtime or chat was changed. Disposable loopback UI fixtures were created and stopped after testing.

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

## Remaining work

- The hosted signup-screen/API discrepancy is not root-caused by this local reproduction. Inspect the deployed response and network failure in a working browser session before attributing it to this bug.
- The local auth config loading/failure/recovery defects above are corrected. In-flight auth mutation completion across connection/account changes still needs a separate lifecycle review; the present cancellation tests cover access checks, not server-side rollback of mutations.
- Fresh hosted responses on all five desks, optional Jev acceptance, accounting settlement, two-account isolation, real email/reset delivery, logout cleanup and production backup/restore evidence remain outstanding as recorded in the [previous launch report](../2026-10-03/RESULTS.md). No fresh hosted state is asserted in this pass.
- The limited responsive and keyboard evidence above does not establish platform-wide accessibility, cross-browser or theme acceptance.
- The complete safety gate last passed on the previous candidate; this pass reran the affected frontend suite, typecheck/build and four auth endpoint tests, not every backend gate.

These corrections and regression results do not establish launch readiness. Continue with auth mutation lifecycle and account-boundary review, followed by the remaining acceptance work above.
