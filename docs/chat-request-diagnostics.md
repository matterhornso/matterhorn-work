# Chat request diagnostics

The normal session composer now records bounded metadata for privacy preflight and hosted message dispatch. The existing browser inspector retains at most 200 events in memory; these additions do not send telemetry, persist a log, or change API payloads, consent, retries, deadlines or provider configuration.

## What is recorded

Each submission has a diagnostic `attemptId` shared by its preflight, dispatch and existing first-observed-output timing event. It is a correlation label, never a credential. Explicit-consent submissions may skip client preflight as before; server authorization still applies.

New event names:

- `session.request.preflight.started`, `.completed`, `.failed`
- `session.request.dispatch.started`, `.completed`, `.failed`

All contain bounded workspace/session/attempt identifiers. Completed/failed events contain elapsed milliseconds. Preflight completion includes only its decision. Accepted dispatch includes `runId` and the accepted session ID. Failure includes an HTTP status when available and one fixed category: timeout, aborted, access_denied, rate_limited, server_error, request_rejected or request_failed.

No prompts, attachments, memory contents, consent tokens, request hashes, arbitrary backend error messages/codes, response bodies or stacks are copied to these events. A broken recorder cannot block or repeat a request. The original result or error still reaches the caller.

## Collect a scoped diagnostic

Use a designated test account with public, non-sensitive text. Start from a page reload or clear the existing inspector buffer before reproduction. Do not export a full HAR, screenshot credentials, or dump the complete inspector snapshot: other older inspector slices/events are outside this new metadata-only contract.

In browser developer tools:

```js
window.__matterhorn?.clearEvents();
```

Send one message, then inspect only the new request events:

```js
window.__matterhorn?.events(200)
  .filter(event => event.name.startsWith("session.request."));
```

The existing `session.prompt.first_output` now includes the same attempt label plus workspace/session/message IDs. It measures the first assistant-output notification observed by the client after dispatch started, not provider first-token latency, completion, or cryptographic proof that the message belongs to the returned run. An output event may precede the HTTP acknowledgement. Match authoritative run/session records before drawing conclusions.

## Interpretation

| Observation | Next check |
| --- | --- |
| Preflight failed | Gateway reachability, authentication, context or policy checks |
| Preflight completed with blocked/consent_required | Resolve policy/consent; do not bypass it |
| Dispatch failed before acknowledgement | Inspect status/category and gateway/engine preparation for this session |
| Dispatch completed with accepted and runId | Gateway accepted the run; this does not prove model execution |
| Accepted run but no observed output | Inspect the scoped server run, engine, permissions, provider and event delivery |
| Output appears but final usage/receipt is wrong | Inspect run finalization and allowance reconciliation |

The browser is not an authoritative security audit log. Events are capped, can be cleared and disappear on reload. Identifiers should still be treated as account metadata and shared only with the support/operator team. Do not infer provider credential failures or increase timeouts from missing browser events alone.

## Coverage and limitations

Instrumentation covers the main chat composer's preflight and hosted dispatch. Desktop direct OpenCode dispatch retains its existing timing events. Slash commands, alternate launchers, streaming internals and provider timing are not newly instrumented. This work does not complete live model acceptance, repair an unlocated hosted inference failure, or enable signup.

Reproduce local regressions with:

```sh
pnpm exec bun test apps/app/tests/prompt-request-diagnostics.test.ts apps/app/tests/prompt-request-diagnostics-client.test.ts apps/app/tests/agent-runtime-performance.test.ts
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app test:composer-browser
```

The HTTP tests use only disposable localhost servers and fixture content. Chromium regressions use isolated production components, not hosted accounts. No visual layout changed in this packet, so no screenshot is required to demonstrate its behavior.
