# Authentication failure path QA

4 October 2026. This pass found and fixed two related client response-validation defects. The full-platform QA goal remains incomplete. No hosted release, account, provider, production setting, preview runtime or existing chat was changed.

## Reproduced findings and corrections

The public auth client previously trusted successful HTTP responses through a generic TypeScript cast. Thirteen initial malformed configuration cases resolved instead of rejecting, including HTML, JSON null, missing fields, incorrect boolean types and contradictory signup status. The sign-in page treats only explicit false availability as disabled, so invalid configuration could escape its intended fail-closed fallback. This was a client availability defect, not evidence of a server authorization bypass.

`apps/app/src/app/lib/public-auth-client.ts` now validates all required auth configuration fields and signup-status consistency, accepts additive server fields, and returns a constructed typed configuration. Minimum password length must be a positive safe integer; the public Turnstile key must be a nonempty string or null. No stronger product policy is invented by the client. The generic transport now returns unknown rather than casting untrusted data.

The same transport also accepted malformed successful responses for verification resends and password-reset requests/confirmation. Eighteen negative cases reproduced that failure. These three endpoints now require the server's existing `{ ok: true }` acknowledgement. Otherwise they reject before the UI displays a success message. This does not claim that a queued email reached an inbox. Sign-in, signup and verification still require the existing independent authenticated-session check before entering the app.

The server response contracts were inspected in `apps/server/src/server.ts`; its local auth acceptance tests were then run for verification/recovery and configuration safety. No backend auth policy was weakened or changed.

## Verification

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

## Remaining work

- The hosted signup-screen/API discrepancy is not root-caused by this local reproduction. Inspect the deployed response and network failure in a working browser session before attributing it to this bug.
- `publicSignupAvailabilityMessage` still describes every `setup_required` state as email setup, although server readiness depends on multiple controls and the client also uses this state for config-fetch failures. Correct that misleading explanation and test loading, fetch failure, recovery and unmount/account-change behavior in the UI.
- Fresh hosted responses on all five desks, optional Jev acceptance, accounting settlement, two-account isolation, real email/reset delivery, logout cleanup and production backup/restore evidence remain outstanding as recorded in the [previous launch report](../2026-10-03/RESULTS.md). No fresh hosted state is asserted in this pass.
- Responsive, keyboard, screen-reader, theme and zoom acceptance were not performed in this pass. No UI layout or copy was changed.
- The complete safety gate last passed on the previous candidate; this pass reran the affected frontend suite, typecheck/build and four auth endpoint tests, not every backend gate.

These corrections and regression results do not establish launch readiness. The next local review is the auth configuration loading/error/recovery UI, followed by the remaining acceptance work above.
