# Pending approval cancellation — 25 September 2026

## 19:27 UTC follow-up: corrected locally in Bun and Node

The remaining compatibility defect is now corrected on the local branch:
`serve()` selects Bun's native HTTP server under Bun, preserving native request
cancellation. Node/Electron keep the existing Node HTTP adapter. Both return the
trusted socket peer and await shutdown; native error responses are generic and
development error rendering is disabled. The implementation uses the documented
[Bun server API](https://bun.sh/reference/bun/serve).

The app's existing session-abort endpoint now also cancels pending chat approvals
for the authenticated subject, workspace and session. This cancellation occurs
before forwarding Stop to the runtime; it does not require host approval and
cannot grant any operation. Approval scope is internal and is not included in
the approval-list response.

Verified locally:

- The same standalone physical-disconnect probe now passes **Bun 1.3.11 and
  Node 26.7.0**: empty queue, late approval refused, zero dispatches.
- Full HTTP tests pass allow, deny, timeout, Stop and disconnect. Before the fix,
  Stop returned success but late approval still returned 200. It now returns 404.
- Retry with the same message ID requires a fresh approval and dispatches once.
  Final targeted approval HTTP run: five tests / 67 assertions passed.
- Unauthenticated Stop cannot clear the queue. Another session's Stop leaves it
  pending. Unit coverage isolates subject/workspace/session and unscoped requests.
  Cookie-based two-account tests reject both foreign-workspace Stop URL forms.
- Full backend suite: **1,734 tests / 11,491 assertions passed** before adding
  the final retry assertions. Complete ten-stage platform safety gate passed.
  Final server typecheck and strict secret scan also pass (zero findings).
- Pinned OpenCode 1.18.31 + real guard plugin + synthetic local provider:
  all five agent responses complete in enforcement mode; in-flight Stop releases
  the hold, disconnects the provider, and permits a successful next request.
  Exact fixture usage/charge 6,000 tokens; zero pending holds. Secret and unbound
  raw-runtime negative controls cause no extra inference.

These are local checks, not hosted acceptance or live-chain/model proof. Runtime
fixture cleanup still needs forced termination and partial-output retention is
not proved. No production configuration, signup, auth policy or deployment was
changed. Re-run the production-container and hosted flow before launch.

## Historical 18:57 UTC result: partial correction

`ApprovalService` did not observe request cancellation. A queued manual approval
could remain usable after its requester disconnected. The service now accepts
an AbortSignal, denies already-aborted requests (including auto mode), and removes
pending requests, timers and listeners when cancelled. The API passes the
request signal into approval checks. Allow/deny/timeout behavior and host-only
approval authorization are unchanged.

Eight service regressions pass. Approval + HTTP-adapter + chat gateway regression
batch: 79 tests / 567 assertions. Server build/typecheck passes.
Full backend suite: **1,731 tests / 11,456 assertions passed**. That suite does
not cover the failing Bun socket probe; its green result does not override it.

## Runtime-specific blocker

The same real-socket probe gives different results by runtime:

| Runtime | Result after POST body read and client process termination |
| --- | --- |
| Node 26.7.0 | Queue clears; late approval refused; zero dispatches |
| Bun 1.3.11 | Queue remains; probe fails |

Reproduction (build server first):

```sh
pnpm --dir apps/server build
node scripts/matterhorn-approval-disconnect-probe.mjs
bun scripts/matterhorn-approval-disconnect-probe.mjs
```

The probe uses loopback and synthetic requests only, with no credentials or model
calls. The Bun failure is intentional evidence of an unresolved defect, not a
passing acceptance check. A separate full gateway experiment also accepted a
late host approval with HTTP 200 instead of 404 after disconnect.

Minimal adapter diagnostics isolate the difference to POST-body consumption:
the existing Node HTTP adapter reports disconnect for a GET under Bun, but not
for the consumed POST in this reproduction. Adding a socket-close listener did
not repair it; that experimental adapter change and diagnostic logging were
removed. Node reports the consumed-POST disconnect correctly. This establishes
an observed compatibility problem, not a claim about every Bun release.

The public-beta Docker entrypoint runs `bun apps/server/src/cli.ts`, so the Node
pass does **not** clear the deployment blocker. Node 22 (the container's installed
Node version) was not tested here, and the container runtime was not changed.

## Follow-up identified at 18:57 UTC (completed locally above)

1. Reproduce explicit **Stop** while a gateway prompt is awaiting manual approval.
   The UI currently calls the runtime session-abort endpoint; it does not cancel
   the pending gateway POST. Verify queue cancellation with workspace/session
   authorization intact, including cross-account negative controls.
2. Repair or deliberately select/test the HTTP adapter used under Bun. Do not
   disable approval as a workaround or claim a Node-only test covers Bun.
3. Repeat both cancellation paths, late-approval rejection, retry, accounting,
   and normal-hosted-user acceptance before launch.

No hosted configuration, deployment, auth policy, or wallet operation changed.
