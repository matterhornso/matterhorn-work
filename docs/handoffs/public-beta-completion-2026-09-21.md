# Matterhorn public beta: tech-team execution prompt

Prepared 21 September 2026. This is a self-contained work order, not a statement that deployment or public acceptance is complete.

## Start here: source and access

Take ownership of finishing the remaining Matterhorn **public beta** readiness work. Repository: https://github.com/matterhornso/matterhorn-work. Canonical app: https://matterhorn-desks-canary.vercel.app/.

Use the reviewed, merged `dev` source that includes PR #1021 and the trust-navigation fix accompanying this document. Do not deploy an arbitrary newest/unmerged PR. GitHub provides code, tests and context; it does not provide AWS configuration, secrets, verified backups, inboxes, wallet approvals or proof that the deployed app works.

Read in order:

1. `AGENTS.md`.
2. This handoff.
3. `qa-reports/public-beta/post-1021-2026-09-20/QA-REPORT.md` and its JSON results. This is historical QA; recheck live state rather than assuming its timestamp is current.
4. `docs/handoffs/public-beta-qa-remediation-2026-09-20.md` for PR1021's runtime/accounting migration and invariants. Its pre-merge status prose is historical; PR1021 is merged.
5. `.env.example`, `railway.json`, `vercel.json`, `packaging/docker/Dockerfile.public-beta`, `apps/server/src/public-launch-readiness.ts`.

Example clean source setup:

```sh
git clone --branch dev https://github.com/matterhornso/matterhorn-work.git matterhorn-beta-release
cd matterhorn-beta-release
git fetch origin dev
git status --short
git log -5 --oneline
git merge-base --is-ancestor d659734f5be712464df26ef0ee6d933983bea5f3 origin/dev
MH_RELEASE_SHA="$(git rev-parse origin/dev)"
git switch --detach "$MH_RELEASE_SHA"
pnpm install --frozen-lockfile
```

Require a clean checkout, the trust-navigation fix present, and successful CI for the chosen source. Record the approved `MH_RELEASE_SHA`; keep backend and frontend on it. If you make follow-up code changes, use a branch/PR into `dev`, review and pass CI, then pin the new merge SHA instead. Do not deploy a dirty laptop checkout.

Required access (individual scoped operator accounts, not shared root credentials):

- GitHub repository, CI results and merge/release permissions.
- Railway control-plane production service, persistent volume, backup/restore operations and authorized container access.
- Vercel production project and server-side environment settings.
- AWS SES, EventBridge, IAM, S3 and KMS; DNS for the approved sender domain.
- Cloudflare Turnstile configuration; approved model-provider account and budget.
- Secret manager/password manager, two controlled test inboxes, supported browsers/assistive technology, and wallet owner for explicitly approved wallet tests.

If access is missing, name the exact resource/action/owner. Do not disable a check, create a default/shared password, edit auth rows, or fabricate a health marker to work around it.

## Immediate deployment prerequisite and current baseline

PR1021 merge: `d659734f5be712464df26ef0ee6d933983bea5f3`. It fixes retry/stop/memory/file boundaries and accounting, including the reproduced 473-token case. It adds usage `user_message_id` and `model_message_dispatches`; preserve the usage database. It does not repair historical balances automatically.

At this handoff's preparation, Railway still runs `50ccdde690ad83b974b5ad13be53e5e8addac266`, successful deployment `7b8f9256-5656-4222-a84d-4c56cff45698`. Vercel canonical inspection resolves to `dpl_7dJ5D52t4Pt5FNUQTku8Yph5zpDx`, immutable URL `https://matterhorn-desks-canary-54to7xl26-abhinav-4820s-projects.vercel.app`.

Validated infrastructure:

- Railway project `935a8288-3a56-4964-8edf-d2eed8ae9e79` (`matterhorn-desks-control-plane`).
- Environment `8cd2f051-83fa-4005-bd23-6657991283e2` (`production`).
- Service `bd355c60-01e6-4e7f-940c-14a8d95dd72e` (`control-plane`).
- Existing `/data` volume `eaa0da33-c662-4581-87b2-eff379b39496`, instance `809b453b-c5b8-4b6c-aaad-3d714f59a13b`; one service replica.
- Backend `https://control-plane-production-d46b.up.railway.app`.
- Vercel project `matterhorn-desks-canary`, ID `prj_gASwX5aMl5doRJCDgcXYs3hWXJRv`, scope `abhinav-4820s-projects`.

**Current blocker:** the available Railway login can inspect/deploy but its attempt to create the pre-deploy snapshot returned `Not Authorized`; a subsequent backup listing was empty. Local Railway SSH also reported no authorized SSH key. No recovery snapshot was created, and no deployment was initiated. Have the Railway owner create and verify a current recovery point, with its ID/time and recovery procedure, or grant narrowly scoped authorized operator access. Do not blindly retry the migration without recovery material.

Drain active work for a consistent cutover and capture application-consistent data, including DB/WAL state, files and required recovery keys. Do not cancel unresolved model holds merely to drain. Platform volume snapshots can support cutover recovery but do not replace the encrypted offsite backup and restore acceptance below. See [Railway backups](https://docs.railway.com/volumes/backups).

Once recovery is available:

1. Record old deployment IDs/source, pending runs and rollback plan; preserve `/data`, secrets and single-writer SQLite topology.
2. Deploy the exact clean approved source to Railway using `packaging/docker/Dockerfile.public-beta` and `/health/ready`. Set only the required non-secret build marker `MATTERHORN_BUILD_COMMIT` to that actual source SHA; do not relabel an old image.
3. Verify startup/migration, persistence, runtime readiness and the returned commit. Keep `MATTERHORN_HOSTED_PUBLIC_BETA=1`, `MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED=1`, usage enforcement `hard`, and the reviewed guarded-mode profile (`off`). No incidental security mode changes.
4. Build that same SHA for Vercel: root repository, command `pnpm --filter @matterhorn-work/app build:web`, output `apps/app/dist`, `VITE_MATTERHORN_BUILD_COMMIT` matching the source. Preserve server-only `MATTERHORN_CONTROL_PLANE_URL` and `MATTERHORN_PROXY_SECRET` matching Railway's trusted proxy secret. Never pull backend secrets into a frontend build or put them in `VITE_*`.
5. Create an immutable production candidate with domain promotion deferred, check identity/proxy/auth behavior, then promote the canonical domain. Confirm both SHAs from the live app. Recheck Security → Back to app signed out and signed in; also test Open app/brand exits on Privacy, Terms, Support and Status.

## Workstream A — email, login, password reset and verified backups

### A1. Account and origin configuration

Preserve real HTTPS `MATTERHORN_APP_URL`, exact `MATTERHORN_WORK_CORS_ORIGINS`, `MATTERHORN_EMAIL_VERIFICATION_REQUIRED=true`, `MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED=true`, approved `MATTERHORN_TERMS_VERSION` / `MATTERHORN_PRIVACY_VERSION`, and appropriate `MATTERHORN_SIGNUP_MAX_ACCOUNTS`. Configure actual `MATTERHORN_TURNSTILE_SITEKEY`, backend `TURNSTILE_SECRET` and exact `TURNSTILE_HOSTNAMES`; verify the signup action server-side. No localhost/testing Turnstile keys in production.

Keep registration paused during incomplete readiness. This is a temporary release gate, not an invite-only product design.

### A2. AWS SES delivery

The implementation uses SES v2 API, not SMTP. Verify the sender domain in the chosen region, publish SES DKIM records, configure DMARC and any chosen custom MAIL FROM records without disrupting unrelated DNS. Obtain SES production sending access in that region; verified identity and leaving the sandbox are separate requirements. See [AWS production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Create/use a dedicated least-privilege SES principal scoped to the approved identity and actual `SendEmail` request. Use these **Railway/backend-only** settings via the secret manager:

```dotenv
AWS_SES_REGION=<approved SES region>
AWS_ACCESS_KEY_ID=<dedicated SES access key, private>
AWS_SECRET_ACCESS_KEY=<dedicated SES secret, private>
AWS_SES_CONFIGURATION_SET=matterhorn-transactional
EMAIL_FROM=<verified sender address>
EMAIL_FROM_NAME=Matterhorn
MATTERHORN_SES_EVENT_SECRET=<independent random secret, at least 32 characters>
```

Use the exact existing configuration-set name if different. Keep `MATTERHORN_EMAIL_DEV_MODE` unset. Current SES credential wiring does not include a session token; do not supply temporary credentials requiring one without a reviewed code change and renewal design. No root, SMTP or backup credentials here.

### A3. Real delivery/bounce/complaint events

Configure the SES configuration set to publish Delivery, Bounce and Complaint to EventBridge. Match `source: aws.ses`, correct AWS account/region/configuration-set tags, and `Email Delivered`, `Email Bounced`, `Email Complaint Received`; test against actual events. Forward the full event unchanged to:

```text
POST https://matterhorn-desks-canary.vercel.app/api/auth/email-events/ses
Header: x-matterhorn-ses-event-secret
```

Use an EventBridge Connection with API-key authentication holding the same private secret, an API Destination and least-privilege invoke role. Add bounded retries, a restricted dead-letter queue and alerts. Do not send an SNS subscription envelope to this handler. Protect recipient data in logs. References: [SES event schema](https://docs.aws.amazon.com/ses/latest/dg/monitoring-eventbridge.html), [EventBridge API destinations](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destination-create.html).

Acceptance: actual inbox delivery and tracked outbox state, controlled bounce/complaint suppression, duplicate/out-of-order event handling, and 401 for missing/wrong callback secret. SES send acceptance or a presence-only readiness flag is insufficient.

### A4. Login and password reset acceptance

No separate password-reset enable switch exists: current code derives availability from email transport/events and valid app URL. Test two controlled accounts through normal UI flows. Validate registration/verification, resend limits, expired/replayed verification, login, reload, logout, and reset request/receipt. Account owner completes credential entry/reset; never share reset links/OTPs/passwords in reports. Confirm canonical reset-link origin, single use/expiry, rejection of old password and prior sessions, enumeration-safe responses and rate limits. No auth bypass or DB seeding in production.

### A5. S3/KMS backup configuration

Create/use a private versioned S3 bucket with Block Public Access, TLS-only access and approved lifecycle retention. Use a customer-managed KMS key in the bucket region. Dedicated backup principal must differ from SES. Scope object access to the host-recovery prefix, permit required Put/Get/versioned Get and selected-key GenerateDataKey/Decrypt in both IAM and key policy. Avoid routine delete access. Checksum-enabled encrypted-object HEAD verification also needs KMS permissions: [AWS HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html).

Backend-only configuration:

```dotenv
AWS_REGION=<bucket/KMS region>
MATTERHORN_BACKUP_S3_BUCKET=<private versioned bucket>
MATTERHORN_BACKUP_KMS_KEY_ID=<customer-managed key ARN>
MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID=<dedicated backup key, private>
MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY=<dedicated backup secret, private>
MATTERHORN_ERASURE_LEDGER_DB=/data/matterhorn/erasure-ledger/ledger.db
MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET=<preserve existing; independent, at least 32 bytes>
MATTERHORN_HOST_BACKUP_INTERVAL_SECONDS=86400
MATTERHORN_HOST_BACKUP_RETRY_SECONDS=300
MATTERHORN_HOST_BACKUP_MAX_AGE_HOURS=36
```

Intervals above are the existing runbook starting policy; get owner agreement on recovery point/time and retention. After a first verified backup, use literal `MATTERHORN_HOST_BACKUP_REQUIRED=1` (the loop checks exact `1`). Temporary backup credentials support `MATTERHORN_BACKUP_AWS_SESSION_TOKEN` only with reliable renewal. Do not weaken freshness to make checks green.

The host recovery script captures auth/accounts, usage, rate-limits, guarded-runtime and the selected OpenCode SQLite database. It **does not** capture all workspace files/outputs/configuration. Inventory all durable data and implement/test complementary file backup. Preserve encryption/configuration secrets separately. The current erasure ledger and signing key require independent recovery so old archives do not resurrect deleted material.

In the actual container, verify the existing data and OpenCode DB paths first. The image uses `/data/matterhorn`, `/data/workspace`, and `/data/opencode/xdg/data`; do not assume an empty substitute is valid. Run:

```sh
MH_OPENCODE_DB='<verified existing absolute OpenCode DB path>'
MH_BACKUP_SCRATCH="$(mktemp -d)"
chmod 700 "$MH_BACKUP_SCRATCH"
node /app/scripts/matterhorn-host-recovery.mjs \
  --data-root /data/matterhorn --opencode-db "$MH_OPENCODE_DB" \
  --erasure-ledger /data/matterhorn/erasure-ledger/ledger.db \
  --output "$MH_BACKUP_SCRATCH/host-recovery.json.gz" --upload --json
```

The local gzip archive is sensitive and not application-encrypted. Restrict access; never commit/download it casually. Verify S3 object version, checksum, size, KMS key/build identity and real `/data/matterhorn/backups/last-success.json` produced by the verified uploader. Never fabricate the marker. Confirm scheduled operation/retry/alerting after enabling the required-backup loop.

Perform an isolated restore, never over production:

```sh
MH_RESTORE_ROOT="$(mktemp -d)"
chmod 700 "$MH_RESTORE_ROOT"
node scripts/matterhorn-host-recovery.mjs --restore \
  --archive '<restricted verified downloaded archive version>' \
  --restore-to "$MH_RESTORE_ROOT" --confirm-restore-to "$MH_RESTORE_ROOT" \
  --erasure-ledger '<current independently recovered ledger>' --json
```

Load matching signing material securely. Verify SQLite integrity, representative accounts/chats/usage, cross-DB references, deleted-record reconciliation and complementary files. Map restored `opencode/opencode.db` to the isolated runtime correctly. Disable external email/jobs/wallet actions in recovery. Measure achieved RPO/RTO; record protected artifact IDs, not archive content. Independent DB snapshots are not one cross-database transaction: document necessary quiescence/reconciliation.

## Workstream B — model setup and honest capability labels

Implement a small follow-up PR with regression tests, not a redesign:

1. In browser workspaces with zero models/unavailable managed provider, replace the unusable “Connect a provider first” loop with a role-appropriate recovery action. Operator can configure the managed provider in server-side settings; ordinary user sees a clear request-help/retry route. Do not expose provider API keys in the web client, chat, localStorage or VITE variables.
2. Preserve pending task/draft when visiting model setup and returning. No auto-send. Test configured, missing, rejected, offline, loading and zero-model states.
3. “Subscribe” currently navigates to Cloud account/opens an inference URL; it does not prove a purchase flow exists. Label it by its real action (e.g. Open model catalog), or hide it if unavailable. Do not add billing/charges without an approved product/payment scope.
4. Derive Polymarket and Tools wallet labels from actual deployment capability. A read-only beta must not advertise buy/sell/cancel as available or “Reviewed wallet actions — Available.” Keep wallet signing/approval gates intact.
5. Configure `CUDOS_API_KEY` server-side through the owner and verify real catalog/model access. Do not fabricate provider privacy verification. Preserve approved per-account/global usage limits and hard enforcement.
6. “Set up Private” needs a properly configured, verified server-managed Venice connection and accepted private-model path. Do not present CUDOS or a label change as private processing. If unavailable, communicate the actual limitation.

Code entry points: `apps/app/src/react-app/shell/settings-route.tsx`, `domains/settings/pages/ai-view.tsx`, `domains/settings/pages/hosted-mcp-summary.tsx`, `domains/session/chat/session-page.tsx` (all latter paths beneath `apps/app/src/react-app/`). Current findings and line references are in the QA report; verify against your revision.

## Workstream C — real hosted acceptance, not fixtures

Keep a matrix with source SHA, deployment IDs, browser/network/account, expected/actual, timestamps and redacted supporting results. Mark PASS, FAIL, BLOCKED or NOT TESTED explicitly.

- **Five desks:** Private AI, Bittensor, Hyperliquid, Polymarket, Sui each need a real harmless model response, persisted history/reload, and appropriate read-only tool use where supported. Verify source/freshness, unavailable-data behavior, stale results and provider errors. Local synthetic runtime probes are not acceptance.
- **Accounting/agents:** multi-step tool completion; cancel, failed cancel, transport loss/retry without extra inference, final usage/hold settlement, restart reconciliation. Include mixed legacy/new reservations totaling 473 weighted tokens at 1x: expect 473 used/charged and zero pending after both complete. Use disposable controlled data; do not replay charges into real balances. Historical anomalies require a backed-up, separately reviewed reconciliation, not blanket hold cancellation.
- **Isolation:** two real controlled accounts, guessed/foreign workspace/chat/stream/file/memory/notes/connector IDs, account switch, multiple tabs, reload and backend restart. No cross-account content, secret or mutation. Use normal login and scoped test accounts.
- **Memory/files:** select a benign saved marker and verify authorized use in the real request/answer; forget then confirm it is not newly injected, including stale tabs. Previous history/provider copies are not retroactively erased. Test first upload/download, malicious names and outside-workspace/symlink rejection.
- **Integrations/Cloud:** verify configured catalog/reconnect/failure states. Do not claim arbitrary hosted custom MCP/extension installation works when desktop-only. Verify Cloud provisioning independently of signed-in labels. Keep unsupported surfaces honestly unavailable.
- **Wallets:** for launch-enabled actions, wallet owner tests reject, expiry, changed/tampered fields and approve with explicitly authorized safe network/amount. Verify exact signer/network/action and receipt. No automatic mainnet spend, signatures or permission expansion. If approval/network support is unavailable, keep affected actions read-only and document scope.
- **Browsers/a11y:** current Safari and Firefox plus Chromium; 320/390-width mobile and desktop; keyboard-only complete journeys; actual VoiceOver or equivalent screen reader; visible focus, modal focus/return, labels, error announcements, zoom and no overflow. Record real results, not a source scan as conformance.
- **Performance:** measure login/home/each desk with Lighthouse or equivalent and actual Web Vitals/route timing under documented device/network conditions. Investigate large Shiki/translation/wallet chunks and loading behavior. Target common good-CWV thresholds (LCP <=2.5s, INP <=200ms, CLS <=0.1) with adequate measurement; distinguish lab samples from field percentiles. An emitted large chunk alone is not an initial-load failure.

Local baseline checks: frontend/backend tests, app/server typechecks, web build, `pnpm test:matterhorn-platform-safety`, email transport tests, backup/restore tests and relevant changed-surface regressions. Use disposable local data and a credential-free test environment. All new code needs CI and review before release.

## Final release gate and public registration

Before activation require `/health/launch` HTTP200 with all checks true, actual acceptance above, on-call ownership and a compatible rollback path. Set `MATTERHORN_SIGNUPS_ENABLED=true` only with the release owner's go-live approval. Public beta is the target; do not substitute invite-only acceptance or remove the gate.

Run from the exact approved checkout:

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://matterhorn-desks-canary.vercel.app \
  --server-url https://matterhorn-desks-canary.vercel.app \
  --expected-commit "$MH_RELEASE_SHA" --expected-web-commit "$MH_RELEASE_SHA" \
  --health-path /health/ready --expected-guarded-mode off \
  --expected-signup-status open --strict --json-output public-beta-release-probe.json
```

During incomplete rollout use expected signup `paused` only to check alignment; that is not public launch approval. Do not change guarded mode to satisfy the probe. Monitor email delivery/suppression, auth errors, inference errors, usage/holds, backup freshness, disk and request latency through a staffed launch window. On critical failure stop promotion/pause new registrations, preserve user data, and use a schema-compatible rollback; never restore an old DB just to roll back web code.

Return a completion report containing exact merge SHA and CI, Railway/Vercel deployment IDs/URLs and verified source identity, strict probe JSON, every acceptance row with results, SES delivery/event outcomes, backup object version/checksum and measured restore, limitations, signup state, monitoring owner and rollback references. Share test-account access only via the password manager. No passwords, cookies, API keys, OTPs, reset URLs, raw wallet payloads or backup contents in Git/PR/chat.
