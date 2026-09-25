# Pending approval cancellation — 25 September 2026

## Result: partial correction, not launch acceptance

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

## Next work

1. Reproduce explicit **Stop** while a gateway prompt is awaiting manual approval.
   The UI currently calls the runtime session-abort endpoint; it does not cancel
   the pending gateway POST. Verify queue cancellation with workspace/session
   authorization intact, including cross-account negative controls.
2. Repair or deliberately select/test the HTTP adapter used under Bun. Do not
   disable approval as a workaround or claim a Node-only test covers Bun.
3. Repeat both cancellation paths, late-approval rejection, retry, accounting,
   and normal-hosted-user acceptance before launch.

No hosted configuration, deployment, auth policy, or wallet operation changed.
