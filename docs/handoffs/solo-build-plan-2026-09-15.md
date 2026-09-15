# Matterhorn solo build block — 15 September 2026

## Ownership and time boundary

The user has assigned all remaining development and QA to Codex alone. No subagents or CTO delegation. This supersedes the ownership split in the earlier CTO delivery plan, not its security requirements. Previously CTO-owned server integration, email and backup diagnostics are now Codex work; missing credentials or infrastructure authority must still be reported rather than invented.

Window: **2026-09-15 17:07–20:07 UTC** (22:37 IST to 01:37 IST on 16 September). Follow-ups resume this same task; stop new changes at the deadline, summarize and pause the heartbeat. A scheduler is best-effort and does not guarantee uninterrupted execution while the host is unavailable.

Workspace: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime`.
Starting branch: `codex/opencode-1-18-31`; PR #1017 into `dev`; initial head `701d6a3021bb0190e0cc4df2d2e011748b37ad25`.

## Scope and controls

Build reproducible fixes, test, commit and push updates to the existing draft PR. No merge, deployment, signup activation, production-secret changes, paid resource creation or wallet signatures without applicable explicit approval. Read-only production diagnostics and local isolated tests are in scope. Preserve unrelated untracked handoffs and QA artifacts.

Prioritize security and usable core beta over new product surface area. Do not disable audits or privacy checks to turn failures green. Do not claim simulation results as live acceptance. No global runtime replacement is required.

## Execution plan

| Window | Implementation and checks | Exit condition |
| --- | --- | --- |
| 0–35 min | Update the locked Rust dependency affected by RUSTSEC-2026-0285; inspect accompanying warnings; add a regression check if needed; compile the locked example; push the focused change and inspect CI. | Vulnerable rustls version removed; compilation and relevant guards pass. |
| 35–85 min | Determine available authenticated browser/test-account access; trace preflight, message acceptance, engine dispatch, provider output and UI delivery. Test Private AI plus Bittensor, Hyperliquid, Polymarket and Sui with harmless read-only prompts. Test selected-memory attachment. Fix failures only after identifying their boundary. | Per-desk result with version/model, status and sanitized timing; distinguish real inference from fixtures. |
| 85–125 min | Exercise login/logout, password-reset contracts, two-account access denial, privacy proof expiry, memory deletion and usage reservation/reconciliation. Test pending/error/retry UX without weakening controls. | Reproducible defects patched with regression tests; unavailable real-account acceptance explicitly blocked. |
| 125–155 min | Inspect current readiness and existing email/backup implementations. Validate environment names and presence without values where access permits. Test local email contracts and backup/restore against disposable data. | Verified delivery/restore when authorized infrastructure permits, otherwise exact missing capability and safe setup steps. |
| 155–180 min | Review all changes, run affected tests plus release safety checks, inspect remote CI, update draft PR and final report. | Tested commits pushed, CI state recorded, concrete user needs and release decision documented. |

If an external dependency blocks a workstream, move to the next safe local item; do not spend the whole window polling. Reserve the last 25 minutes for verification. If a change cannot be validated, keep it out of the ready release scope.

## Deferred from this timebox

Full multi-project/worker provisioning, arbitrary executable hosted extensions, automatic cross-chat memory retrieval, third-party crypto gateway activation and the 1,255-file OpenWork 0.18.47 migration require separate scoped releases. OpenCode 1.18.31 is already the PR candidate. Do not label OpenWork as upgraded.

## Required report

- PR/head and tests with exact pass/fail or blocked outcomes.
- Live versus local/fixture coverage for each desk, memory and authentication.
- Security findings and what was changed (never secret values).
- Email, reset, backup and restore verification status.
- Remaining owner decisions/access needed from the user, since there is no separate CTO.
- No-go versus invite-only readiness; signup remains paused unless separately authorized after acceptance.

## Progress

- Started: confirmed clean tracked tree and sole-agent ownership.
- Initial remote CI: ten checks passed; Rust dependency security failed on rustls 0.23.37. Official advisory identifies 0.23.45 or later as patched. Local cargo-audit is not installed; use CI and a temporary local installation if needed.
- Security implementation: locked rustls updated to 0.23.45, with its resolved aws-lc and webpki updates. Added a fail-closed dependency-graph check: a failed cargo lookup can no longer be mistaken for an unreachable vulnerable dependency. Six regression tests cover patched/unaffected versions, vulnerable duplicates, RSA/LRU reachability and command failures.
- Verification: `cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets` passed (temporary target directory, two build jobs); `node scripts/rust-dependency-policy.mjs` passed on the actual all-target graph; six policy tests and `pnpm test:security-workflow-contract` passed; secret scan found zero issues. Remote audit remains the authority for the current complete advisory database.
- Source: [RUSTSEC-2026-0285](https://rustsec.org/advisories/RUSTSEC-2026-0285.html). Existing audit warnings for unmaintained proc-macro-error2/rustls-pemfile and yanked chacha20/spin are not fixed by the rustls patch; they need separate dependency-path review. No additional advisory exemptions were added.
- Sixteen local tests passed across public-launch readiness, host-backup readiness, auth email outbox and email transport. These use fixtures and do not prove real SES delivery or cloud restoration.
- Fresh hosted `/health/ready`: ready, guarded runtime off. `/health/launch`: not ready; email delivery/events/transport, password reset and backup configuration/freshness are false. Inference configuration reports true, which is not proof of a real model response.
- Browser tab 4 is open on the canonical sign-in page and marked for handoff; signup is paused and Forgot password is disabled. Requested that the user sign in with a disposable test account; no credentials were requested in chat. No authenticated acceptance has run yet.

### First packet: pushed and verified

- Commit `72a930bd09` pushed to PR #1017. **Remote Rust dependency security now passes.** Latest snapshot also passed Linux/macOS app checks, customer crypto gates, i18n, dependency review and repository security. CodeQL, platform safety and container build were still in progress; recheck those before making a final CI claim. Remote runs: `35000068028` (security), `35000067927` (tests).
- Ran the new dependency-policy tests and workflow contract on the pinned Node 24 binary as well as the local default Node 26; both passed.
- `bun test apps/server/src/auth.e2e.test.ts apps/server/src/backend-security.e2e.test.ts apps/server/src/request-rate-limit-store.test.ts apps/server/src/agent-privacy.test.ts apps/server/src/memory-routes.e2e.test.ts --timeout 15000`: **123 pass, zero fail** (local fixtures).
- `bun test apps/server/src/guarded-agent-runtime.test.ts apps/server/src/model-usage-store.test.ts apps/server/src/agent-run-receipts.test.ts --timeout 15000`: **65 pass, zero fail** (local fixtures).
- `node scripts/matterhorn-host-recovery.test.mjs`: passed disposable SSE-KMS recovery contract. `node scripts/workspace-backup-restore-drill.test.mjs`: passed after granting localhost test-server access. This is not a real S3/KMS round trip or production restore.
- Read-only strict hosted probe passed for **existing deployment ed3ee445e4cb572d65da041dab59c1f413502f50**, with matching frontend/backend, expected guarded `off` and signup `paused`. The probe's `READY` summary means readiness for that explicitly paused configuration; `/health/launch` remains `not_ready`. PR #1017 is not deployed.
- Temporary logs: `/tmp/mh-solo-{rust-check,rust-policy,launch-contracts,host-recovery,workspace-recovery,auth-isolation,runtime-usage,hosted-probe}.log`. They contain fixture/status output, not operator secrets. No active command sessions remain from this packet.

Next: finish remote CI review, then continue the model/authenticated acceptance work if the user has signed in. Otherwise inspect and improve safe local runtime observability/recovery and email/backup acceptance tooling, documenting concrete findings rather than repeatedly rerunning green suites. Ownership is entirely Codex; do not wait for a CTO handoff.

### Second packet: finite-response deadline repair

- Confirmed all 11 remote PR checks passed for `72a930bd09`, including Rust audit/compile, CodeQL, platform safety and container build. The next code push starts a new CI run; do not carry those results forward as the new head's remote status.
- Browser remains signed out; no live model/memory acceptance claimed. The Railway CLI can list the existing `matterhorn-desks-control-plane` project, production environment and control-plane service. This checkout is not linked. No link, deployment, secret retrieval or configuration write was performed; AWS CLI is absent.
- Found and reproduced a client defect: `fetchWithTimeout` covered only headers, then released the timer before `response.text()` / `response.arrayBuffer()`. A body that stalled after a successful header response never reached the request deadline.
- Added a real client regression: before the fix the three-second health deadline remained pending after 3.5 seconds; after the fix it rejects with the existing timeout message and aborts its signal. This does not establish the cause of the earlier hosted inference failure.
- Extended the same deadline through finite JSON, multipart acknowledgement and binary body consumption. No timeout values, provider policy, consent handling or streaming transport changed; no automatic retries were added.
- Six new tests cover stalled JSON, stalled binary/error bodies, header stalls, successful-body timer cleanup, body errors and explicitly disabled deadlines. **1,128 app tests passed**, plus app typecheck, web build, six Chromium regressions, full platform safety gate and zero-finding secret scan. Existing large-chunk warnings remain.
- Logs: `/tmp/mh-solo-body-{timeout-tests,typecheck,app-tests,build,browser,safety,secret-scan}.log` (the timeout test log is `/tmp/mh-solo-body-timeout-tests.log`). No screenshot is attached because this is request handling, not a visual change; browser tests still use production components with fixtures.
- Next safe work: strengthen backup upload verification before its freshness marker is written. Current uploader supplies a checksum and SSE-KMS on PutObject, but marks success without an independent object-metadata check. Review required IAM permissions and regression coverage before changing this contract; do not access or download real backup contents.

### Third packet: verified backup publication

- All 11 remote checks passed for timeout-fix commit `251f28b84a`, including platform safety, container build, Rust security and CodeQL. New commits require fresh CI results.
- Backup uploads now perform checksum-enabled S3 HEAD verification of the uploaded version/ETag, SHA-256, size, content type, SSE-KMS key, bucket-key setting and release metadata. Verification reads metadata only, never the archive body.
- Fixed the freshness marker's directory: it now uses the explicit snapshot `--data-root`, not an unrelated environment value. A private temporary file and atomic rename publish the marker only after verification; failed uploads/verification preserve any previous marker.
- Backend readiness rejects legacy PutObject-only markers. The deployment guide documents the required fresh verified upload, prefix-scoped S3 metadata/version permissions and KMS permissions. No production IAM/configuration changes were made. An upload is not a restore drill, and neither real S3/KMS recovery nor real SES delivery has been verified.
- Seven verifier tests pass on Node 24 and Node 26. They cover eleven metadata mismatch cases, failed requests, wrong keys, alias/key-ID resolution, explicit data-root wiring and the actual AWS SDK PUT/HEAD wire protocol against a localhost fixture with fake credentials. No real cloud contents or credentials were accessed.
- Existing disposable host recovery tests, backend backup/launch tests, server typecheck, production-launch configuration contract, safety-gate wiring contract, full platform safety gate and zero-finding secret scan passed. The final seven-test wire suite was also run separately on pinned Node 24.
- Logs: `/tmp/mh-solo-verified-{backup-tests,upload-tests,upload-node24,upload-wire,backup-safety}.log`, `/tmp/mh-solo-backup-{typecheck,secret-scan}.log`. No UI screenshot is required for these script/backend changes.
- Pushed backup commit `58e085863d` to the existing draft PR. Fresh remote CI started; production is unchanged.

### Fourth packet: SES acknowledgement integrity

- Reproduced an email defect: an SES result without a message ID was treated as console-style delivery, clearing the queued payload. Also confirmed a new SES client was created per send without being destroyed after success/failure. Four regression assertions failed before the fix.
- Require a nonblank SES message ID both at the transport boundary and before accepting an outbox item. Missing acknowledgement follows the existing durable retry policy and preserves its payload. Explicit local console delivery can still finish without a provider ID. No templates, OTP logic, secrets, provider configuration or retry timing changed.
- SES clients now release their resources in `finally`, and upstream error details remain hidden. A valid provider message ID still means accepted, not delivered; only the later delivery event completes the SES outbox item. This follows [SES SendEmail response semantics](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html).
- Added email transport, outbox, backup readiness and public-launch readiness tests to the product-readiness safety stage; the SDK module mock runs in a separate test process to avoid affecting unrelated suites. The wiring contract now requires these tests and the verified-backup test.
- Verification: six transport tests and fifteen backend outbox/readiness tests passed; eighty-six auth/backend security tests passed. Server typecheck, email package build/declarations, safety-gate contract, production configuration contract, full platform safety gate and zero-finding secret scan passed. These are local fixtures, not real SES delivery.
- Logs: `/tmp/mh-solo-email-ack-{before,after,backend,transport,auth,typecheck,build,gate-contract,safety}.log`. The `before` log intentionally records the reproduced failures; subsequent runs are green. No visual change or screenshot for this packet.

Next: inspect fresh CI after these pushes; check authenticated browser access only if available. Continue safe local acceptance/recovery work without printing or downloading credentials or backup contents. Reserve the final 25 minutes for final verification and a candid launch decision; the original 20:07 UTC deadline is unchanged.

### Fifth packet: challenge replacement queue cleanup

- At 18:52 UTC, all 11 remote checks passed on `e367765829`. Browser tab 4 remains signed out; live model/desk/memory acceptance remains unverified. No authentication bypass or production account provisioning was attempted.
- Reproduced two recovery UX defects: a replacement verification challenge left the old retry queued, and a replacement password-reset challenge left the old pending link queued. Both tests offered two messages even though only the newest challenge was valid.
- In the existing challenge/enqueue transaction, retire older pending/retrying messages for the same user and template, exclude the same idempotency key, label them `challenge_superseded`, and clear obsolete codes/links. Already accepted or claimed messages are unchanged; this does not recall an email already in flight. Documented that this terminal status is not an SES outage.
- Regression coverage verifies the latest code/link, unrelated-account isolation, preserved accepted-message history and atomic rollback when a replacement insert fails. The rollback test also completes verification using the original retained code.
- Verification: 97 outbox/auth/backend security tests, seven auth maintenance/verification tests, server typecheck, production configuration contract, full platform safety gate and zero-finding secret scan passed. No provider configuration, expiry times, rate limits or production state changed.
- Logs: `/tmp/mh-solo-email-superseded-{before,regression,maintenance,typecheck,safety}.log`. The `before` log records the two reproduced failures; regression and final gate runs passed. No visual change in this packet.
