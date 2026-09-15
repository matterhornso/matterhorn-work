# Codex A1 build and A2 diagnostic handoff

Date: 15 September 2026. Branch: `codex/chat-submit-regression`.

Source base: `0a13b22f4454b78c6fc4c297b66907651b94a18b`, whose tracked source matches deployed PR #1015 (`ed3ee445e4cb572d65da041dab59c1f413502f50`). This document reports local changes, not a new hosted release.

## Packet status

- **A1:** implementation and local regression checks complete; awaiting PR/hosted independent acceptance before the delivery-plan packet can be marked accepted.
- **A2:** code-path inspection complete; the actual hosted timeout cause remains unknown. B1's sanitized runtime/provider observations are the next dependency. No speculative timeout or provider changes made.
- **A3–A6:** not completed by this change. Running A1 safety/build checks is not completion of the full release acceptance packets.
- CTO-owned auth, email, invitation, backup, server integration and production configuration were not edited.

## A1 implementation

1. Ask and Stop button handlers invoke callbacks with no DOM/React event argument.
2. `useComposerSubmission` separates ordinary sends from explicit consent. Only the latter accepts a validated, non-empty string token. The hook retains no token for the next ordinary send.
3. The hook gates duplicate submissions synchronously while dispatch is pending, including clicks before React renders its disabled state. Success/failure releases the gate, permitting retry or a later follow-up. It does not add a server run-completion lock or replace the authoritative per-session policy.
4. Request construction rejects malformed consent at the session-route and direct message-client boundaries before serialization/network traffic. It does not silently discard a bad token or weaken server preflight.
5. Existing draft preservation, wallet-only review, layout and security disclosures are unchanged.
6. CI installs the pinned dependency's Chromium browser and runs the new isolated composer suite in the existing public-beta checks job. Remote GitHub CI has not run yet.

## Behavioral proof

Before the fix, the real Composer browser fixture reproduced `serialization_failed` on Ask while Enter succeeded. Afterward five browser tests pass:

- Ask emits a serializable request with no event masquerading as consent.
- Enter submits without a consent argument.
- Empty/disabled Ask controls remain disabled; busy-empty Stop works.
- Two immediate sends dispatch once; a failure unlocks a token-free retry.
- Missing explicit consent rejects; a valid fixture token reaches only the confirmed send and is not reused by the next ordinary send.

The fixture uses the production React composer, Lexical editor and submission hook. Host policy and upstream dispatch are fixtures, not real accounts/providers. Non-local page requests are blocked. These tests do not prove real provider completion, wallet execution, all five hosted desk flows or server-side consent validation. API client tests separately establish zero fetch calls for malformed tokens and preserve the ordinary/consented/retry payload contract.

## Verification

| Check | Result |
| --- | --- |
| Full app tests | 1,110 pass; 0 fail; 159 files |
| Real-composer Chromium tests | 5 pass; 0 fail |
| App typecheck | PASS |
| Production web build | PASS; existing large-chunk warnings remain |
| Task-first bundle gate | PASS |
| Full platform safety gate | PASS |
| Safety-gate/CI contract | PASS |
| Release secret scan | 1,179 source files; zero findings/oversized skips |
| Git whitespace check | PASS |

The full standalone backend suite was not rerun for this client-only patch; the platform safety gate ran its backend safety suites. Full hosted acceptance, remote CI and deployment are pending. Secret-scan exclusions and bundle-gate limitations still apply.

Commands:

```sh
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app test:composer-browser
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm gate:task-first-bundle-budget
pnpm test:matterhorn-platform-safety
pnpm test:matterhorn-platform-safety-gate
pnpm release:secret-scan
git diff --check
```

The browser suite requires Chromium installed using `pnpm exec playwright install chromium`; CI additionally installs OS dependencies. Build-producing checks ran sequentially in this checkout. Temporary detailed logs are `/tmp/mh-a1-{app-tests,browser-tests,typecheck,build,bundle,safety,safety-wiring,secret-scan}.log`; they are local, not durable/shared CI artifacts.

## A2 code-path findings

The hosted path in `apps/app/src/react-app/shell/session-route.tsx` performs preflight, then calls `sendAgentMessage`. The client currently has a 12-second session-read request timeout. The server message endpoint resolves authoritative context, performs privacy authorization, reserves allowance, aborts any previous run, starts the guarded run and establishes permissions before dispatching OpenCode `prompt_async`. It returns HTTP 202 with run/message identifiers after upstream acceptance, not after model completion.

Subsequent engine events/snapshots drive visible output. The managed plugin also validates provider-bound messages/system context through internal routes. CUDOS configuration supplies a 30-second header timeout, 45-second chunk timeout and 120-second total timeout. These are source configuration facts, not proof of which deadline occurred in the live QA failure.

The existing inspector records dispatch-started and dispatch-accepted timing, but the inspected client path discards the returned gateway run/message IDs. No new telemetry or server logging was added in this patch. A scoped diagnostic enhancement can follow if the existing network/engine metadata is insufficient.

The previous keyboard test ending in Thinking then timeout does not establish that the provider received the request, that credentials are invalid, or that the provider is the failing component. Increasing a timeout without locating the failed stage is not a repair.

## CTO B1 request — metadata only

Please provide the following from a controlled public-text reproduction on the exact candidate, using a designated test account. Retest after A1 deployment as part of the agreed candidate procedure; keep signup paused, guarded off and usage hard.

1. Candidate frontend/backend SHA and runtime version; confirmation that intended provider/adapter configuration and quotas are available. No key values.
2. Selected provider/model and whether the failure occurs on the same supported model and one other supported chat model.
3. Preflight HTTP status, allow/consent/block decision and elapsed time. No prompt, attachment, Memory content or consent bearer values.
4. Message POST status, elapsed time and, if HTTP 202 is returned, its workspace/session/run/message identifiers. Do not copy request bodies or the whole network archive.
5. OpenCode dispatch acceptance time, first engine status event, first assistant event and final status/error class. Include whether permission/approval is waiting.
6. Internal provider-message/system validation status and latency, without provider-bound content.
7. Provider HTTP status/error class, first-response/first-token timing and upstream request identifier if available. No Authorization header or unrestricted response body.
8. Usage reservation/reconciliation and final receipt status for the same run, then reload behavior.

Interpretation:

| Observation | Next boundary to investigate |
| --- | --- |
| Preflight fails | Context/privacy/model resolution; do not bypass it |
| Message POST never gets 202 | Gateway preparation, prior-run abort, permission setup or engine acceptance |
| 202 succeeds but no provider request | Engine/plugin/permission processing |
| Provider rejects/times out | Provider account/config/transport, with CTO-owned settings corrections |
| Provider produces output but UI does not | Engine event/snapshot delivery and client run association |
| Answer renders but usage/receipt is wrong | Run finalization and reconciliation |

Codex owns runtime/UI repairs and regression tests once the failure is located. CTO retains hosted configuration and shared `server.ts` integration ownership. Do not send secrets or broad log dumps; selected timing/status metadata is sufficient for the first diagnosis.

## Release state

No PR has been opened, no branch pushed and no deployment or production settings changed by this work. The new browser suite is wired for the next CI run but is not evidence that GitHub CI has executed. Existing handoff/QA files remain separate from the scoped implementation.
