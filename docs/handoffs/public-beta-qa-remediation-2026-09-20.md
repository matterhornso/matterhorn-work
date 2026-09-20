# Public beta QA remediation — 20 September 2026

## Scope

Implements the approved four-part repair, followed by regression testing and a reviewable PR into `dev`. No deployment, merge, signup change, production configuration change, paid inference or wallet signing was performed.

1. **Workspace boundaries and first uploads:** canonicalize existing paths and nonexistent descendants against the authorized workspace; reject escaping and dangling symlinks. Apply the boundary to native runtime file tools and inbox/outbox roots and children. Create first-upload directories safely; return a client error for malformed multipart data.
2. **Multi-step agent runs:** keep the accepted user message bound throughout its active run; allow multiple assistant/tool steps under that same run. Duplicate binding events remain idempotent; cross-run/workspace/session bindings remain rejected. Do not finish on `tool-calls`; aggregate observed step usage until the final response.
3. **Stop, retry and accounting:** explicit Stop requires a true runtime acknowledgement. A failed Stop does not mark the run idle or cancelled. Stable message sends use persistent subject/workspace/session-scoped request identities and server-owned runtime message/part IDs. Unknown dispatch outcomes retain authority and quota, reconcile against the exact message, and prevent a second dispatch. Usage matches the exact parent message and settles once. Browser retries retain an opaque identity without storing prompt text in the retry ledger.
4. **Memory and files:** successful forget removes selected records from all current-tab chat contexts and broadcasts the forgotten ID to other tabs. Composer sends no cached memory body; the gateway resolves current authorized records. A stale/deleted selection fails before inference. Desktop selections containing Memory also use this gateway; existing local-only overlays remain unchanged for other desktop requests. First-upload and file boundary cases are covered under item 1.

## Verification

All following checks passed locally, using disposable data where applicable:

| Check | Result |
|---|---|
| `bun --no-env-file test apps/server/src --timeout 30000` | 1,697 passed, 0 failed |
| `bun --no-env-file test apps/app/tests` | 1,165 passed, 0 failed |
| Final combined frontend + session-read-model run | 1,229 passed, 0 failed; includes deleted-memory rejection and delayed-history reconciliation |
| `pnpm test:matterhorn-platform-safety` | All 10 stages passed |
| Server and app TypeScript checks | Passed |
| App production build and `build:web` | Passed; existing large-chunk warnings remain |
| `pnpm --filter @matterhorn-work/app test:composer-browser` | 6 browser tests passed |
| Actual production forget-handler probe with mocked deletion | No retained selected record or subsequent serialized memory body |
| `git diff --check` | Passed |

Backend regressions include two-account Notes/Memory isolation across restart, 12 inbox boundary/failure cases, multi-step binding, exact-parent accounting, dispatch persistence across restart, conflicting request IDs, dropped acknowledgements on default and reasoning routes, delayed history, and blocking a different request while dispatch is unresolved.

### Pinned-runtime probes

Used OpenCode **1.18.31** with the actual Matterhorn gateway and guard plugin, and a loopback synthetic inference provider. These are real runtime integration tests, **not hosted acceptance, paid-model tests, or complete protocol-desk acceptance**.

- All five desks: accepted, one inference, final `stop` response.
- Lost acknowledgement: three transport attempts per desk, **one prompt copy and one inference per desk**; retry caused **zero** additional inference. Total usage **5,000**, charged **5,000**, pending **0**.
- Rejected Stop: strict helper rejected, runtime stayed busy and quota stayed reserved. Subsequent successful Stop disconnected inference and allowed a fresh final response. Total usage **6,000**, pending **0**.
- Allowed read/tool loop: tool result reached the next inference; final response completed; total usage **7,000**, pending **0**.
- Escaping symlink read: tool denied it, no fixture contents reached history/provider, final safe response completed; total usage **7,000**, pending **0**.
- Secret-bearing request and unauthorized raw runtime request: blocked before inference.

Reproduce with `scripts/matterhorn-runtime-regression-probe.ts`. Set `MATTERHORN_QA_OPENCODE_BIN` to a pinned 1.18.31 binary installed through the repository's checksum-verifying installer. The default binary SHA-256 is the tested Darwin arm64 executable (`16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198`). On another platform, supply `MATTERHORN_QA_OPENCODE_SHA256` for the **extracted executable**, after verifying its release archive; it is not the archive digest. Run separately with:

```sh
bun --no-env-file scripts/matterhorn-runtime-regression-probe.ts --lost-ack --retry-after-lost-ack
bun --no-env-file scripts/matterhorn-runtime-regression-probe.ts --abort-rejected
bun --no-env-file scripts/matterhorn-runtime-regression-probe.ts --read-tool-loop
bun --no-env-file scripts/matterhorn-runtime-regression-probe.ts --read-symlink-outside
```

Use an isolated environment containing PATH, NODE_ENV=test and the two executable variables. The probe creates and removes its own temporary data and local servers. Runtime shutdown required its bounded SIGKILL fallback after checks completed. No production credentials are needed.

## Review and release notes

- Additive SQLite migration: `user_message_id` on `model_usage_operations`, plus `model_message_dispatches`. Retain the usage database and include it in backups. Existing unbound reservations keep the legacy matching behavior; new stable-route sends use exact parents.
- Requests accepted by the stable message endpoint deduplicate by client `messageID`, authenticated subject, workspace and session. The field is an **idempotency key**, not permission to choose a runtime message ID. Changing content with the same key returns 409.
- If a request's outcome remains unknowable (including a process crash before durable dispatch completion), it fails closed and keeps its hold. Do not manually release the hold or resend under a new identity without confirming runtime history. An operator recovery interface for permanently unresolved requests is a follow-up, not included here.
- The retry guarantee applies to the stable gateway used by public beta. Legacy trusted/raw OpenCode callers without this request identity are not covered by that guarantee; public beta must keep its raw mutation restrictions.
- Canonical path checks close the reproduced static symlink escapes; they are not an OS sandbox or a proof against hostile concurrent parent-directory replacement. Retain process/filesystem isolation for hosted runtimes.
- Forget prevents **new injection from saved Memory**. It cannot retract text already sent to a provider or remove it from prior chat history.
- No new visual screenshot/video was captured. Six real-browser composer tests and rendered error-card tests cover interaction regressions; authenticated hosted browser review remains a separate acceptance task.
- Email delivery/reset, verified backups, real-provider responses, hosted two-account tests, wallet acceptance, Safari/Firefox/assistive-technology acceptance and production operational readiness are **not certified by these local results**.
- Unrelated working-tree icon edits and earlier handoff/QA documents are intentionally excluded from this PR.

Next: review the PR and its CI, then seek explicit merge/deployment approval. This is not a public-launch approval.
