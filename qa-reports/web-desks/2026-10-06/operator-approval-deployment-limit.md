# Manual operator approval remains a deployment requirement

The isolated real-provider QA runtime deliberately uses manual host approval.
This is also the repository's hosted production default, not only a test fixture:

- `apps/server/src/config.ts` defaults to manual approval.
- `packaging/docker/Dockerfile.public-beta` sets `MATTERHORN_WORK_APPROVAL_MODE=manual`.
- `docs/production-launch-configuration.md` explicitly requires keeping manual approvals.
- Account `session.prompt` requests await host approval before usage reservation or model dispatch.
- `GET /approvals` and `POST /approvals/:id` require a host token or separate owner API credential. Normal account cookies do not confer that authority.
- The public same-origin proxy does not allow the `/approvals` root and strips host-token headers. Host credentials must not be put into the browser.

Therefore an unattended hosted chat cannot be claimed to work without operator intervention under the current deployment contract. A staffed, secure operator review process is still required. Removing that requirement or designing delegated approval authority is a separate security/product decision; this QA work does neither. Desktop's pre-existing local auto mode is not evidence that hosted auto mode is acceptable.

## Bounded visibility fix

The existing session stream exposes engine state, not the server's pre-dispatch approval queue. An idle engine or manual configuration alone does not prove that a particular chat is waiting for review.

The authenticated session status route now adds only `item.awaitingOperatorApproval`. It is true only for a currently pending `session.prompt` with an exact match on the original authenticated subject, canonical workspace, and session. Approval identifiers, request summaries, paths, actors, and prompt text are not returned. Existing session existence and post-read authorization checks remain in place. The flag clears on allow, deny, timeout, disconnect, or cancellation, and does not match compaction approvals.

This status makes accurate waiting copy possible; it does not approve requests, change timeout behavior, relax provider privacy or consent checks, or alter privileged approval APIs. Status reads cannot replace manual operator review.

## Regression scope

Focused unit, route, and client tests verify scope isolation, ordinary account-cookie access to the boolean, denial of account access to privileged approval APIs, no early model dispatch, settlement cleanup, retained strict account-workspace alias denial, and rejection of stale account responses. Full session-read and approval regression results: 871 passed, 0 failed, 6,313 assertions across three files; both server and app typechecks passed. Results are recorded separately in `final-verification-approval-status-result.json` by `run-final-verification.mjs --approval-only`.
