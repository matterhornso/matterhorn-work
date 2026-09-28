# Matterhorn public-beta launch handoff — 26 September 2026

> Production correction (26 September, 01:45 UTC): this overnight report tested
> the canary, not the user-confirmed production origin `https://desks.matterhorn.so`.
> Production reports launch ready, signup open and email/reset/backup checks
> passing. Its web/API report `787d85bb830ff859a185d3bcd1a20c493dd008d4`;
> actual artifact identity and end-to-end acceptance remain to be verified.
> Use `docs/handoffs/production-go-live-team-handoff-2026-09-26.md` for the
> corrected current handoff. Preserve the report below as historical canary and
> local-test evidence; do not apply its production configuration assumptions.
>
> Fresh follow-up QA (26 September, approximately 16:38 UTC) is recorded in
> `qa-reports/public-beta/codex-local-2026-09-26/QA-REVIEW.md`. Production public
> checks remain green, but Security → Back to app still shows Support until
> reload. The local build passes that navigation. See the current production
> handoff for updated source identities, test counts and team action items;
> the historical NO-GO below is not a fresh probe of production configuration.

## Decision: NO-GO for public beta

The local candidate passes the final regression suites, but is **not deployed or
accepted for public launch**. Do not announce general availability or enable
signup from these local results. This is a public-beta project, not an
invite-only product; temporary paused registration is a release blocker.

Prepared after the 00:27 UTC continuation. Hosted observations below were
captured on 25 September at 17:29 UTC and were intentionally not re-probed when
unchanged. They are last-observed facts, not a claim of continuous monitoring.

### Candidate identity

- Repository: `matterhornso/matterhorn-work`.
- Local checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime`.
- Branch: `codex/beta-launch-readiness-2026-09-25`.
- Base: `084880d7aad8321bd8b3a09104b5ac7cf9dff037`.
- Tested implementation tip: `6a34543d6d0cffb2facd835183b7cc35b409cbf5`.
- Thirteen implementation commits, **local only**. No PR, push, merge, deployment,
  production configuration change, signup activation or credential rotation was
  performed during this block. Pulling GitHub's latest branch will not fetch these
  changes until a separately approved push occurs.
- This report/worklog will be committed separately; that documentation commit
  does not change the tested implementation. Use the eventual exact merge SHA
  for release certification and deployment, not a pre-merge SHA.

## What was repaired

- Preserve completed message metadata when stale snapshots arrive.
- Cancel pending approvals on disconnect and explicit Stop, scoped to the
  authenticated subject, workspace and session. Preserve native Bun disconnect
  signals; display intentional cancellation as stopped, not failed.
- Preserve newer drafts when pending sends settle, including exact whitespace
  and expanded pasted text across reloads.
- Isolate notes by workspace and server connection; serialize saves and prevent
  older saves from dismissing newer edits. Show load errors honestly.
- Scope account-security cache and forms by account/connection. Unknown or
  failed security checks no longer claim that only one session exists.
- Stage and validate database restores before publication; preserve committed
  erasure-ledger WAL records through a consistent SQLite snapshot.
- Align backup-required flag handling between launch health, readiness and the
  backup worker.
- Validate tenant export contents before encryption/extraction. Reports now
  distinguish a verified archive from an actual application restore.

UI corrections followed Impeccable hardening and Uncodixfy guidance without a
visual redesign. Existing brand and safety boundaries were retained.

## Final local validation

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm --dir apps/server test` | 1,734 pass; 11,501 assertions; 179 files | Local tests/fixtures |
| `pnpm --dir apps/app test` | 1,225 pass; 7,698 assertions; 178 files | Local frontend tests |
| `pnpm test:matterhorn-platform-safety` | All ten stages pass | Contract/regression gate, not live certification |
| App and server `typecheck` | Pass | Static checks |
| `pnpm --dir apps/app build` | Pass | Existing large-chunk warnings remain |
| `pnpm release:secret-scan` | 1,206 source files; zero findings | Scanner excludes tests, fixtures, Markdown and QA reports |
| `git diff --check` | Pass | Whitespace check |
| Integration failure batch | 34 pass; 255 assertions | Catalog/OAuth/MCP fixtures; not live OAuth |
| Two-account auth HTTP suite | 30 pass; 590 assertions | Disposable local accounts and actual route authorization |
| Pinned runtime enforcement probe | Five agents respond; exact usage; zero final holds | Real OpenCode 1.18.31, **synthetic provider** |

The runtime probe also covered lost acknowledgements/retry, cancellation and
recovery, denied writes and secret/unbound-request rejection. Earlier real-model
responses were local and operator-assisted with guarded runtime off. Neither
those nor this synthetic probe proves a normal hosted user can use every desk.

Browser fixtures reproduced and checked draft and notes races in the Codex
browser. This is not a complete fresh cross-browser/mobile acceptance run.
Safari, Firefox and native screen-reader testing were unavailable in this block.
The current 390px override did not succeed; do not count it as a mobile pass.
Reload retention of binary attachments/structured mentions, partial streamed
answer retention, cross-tab notes conflict handling and graceful runtime shutdown
are not established. Forced shutdown was needed in the runtime probe.

Raw final command logs are temporary local files:
`/private/tmp/matterhorn-20260926-final-backend.log`,
`/private/tmp/matterhorn-20260926-final-safety.log`, and
`/private/tmp/matterhorn-20260926-final-server-typecheck.log`.
Frontend logs use `/private/tmp/matterhorn-20260925-2357-{frontend,typecheck,build}.log`.
The durable evidence and reproductions are the Markdown reports in this folder.

## Remaining gates and accountable work

### 1. Review, CI and exact-release deployment — release engineer

The last observed web and API SHA was
`50ccdde690ad83b974b5ad13be53e5e8addac266`, older than the base and all fixes above.
App: <https://matterhorn-desks-canary.vercel.app/>.
Known control plane: <https://control-plane-production-d46b.up.railway.app>.
Confirm the intended projects/services privately before making changes; this
checkout's Railway CLI is not linked. AWS CLI was unavailable.

After explicit authorization, push this branch, open/review the PR against the
current intended integration branch, run CI, resolve any intervening changes,
merge and record the full resulting SHA. Re-run affected tests after any changes.
Do not include unrelated untracked handoff/QA files from this checkout.

Record the existing Railway deployment and Vercel immutable deployment for
rollback. Deploy the approved SHA to the API and an immutable web candidate;
verify the same SHA in both before promotion. Set server
`MATTERHORN_BUILD_COMMIT` and non-secret web `VITE_MATTERHORN_BUILD_COMMIT` to
that SHA. Keep proxy credentials server-side:
`MATTERHORN_CONTROL_PLANE_URL` and `MATTERHORN_PROXY_SECRET` on Vercel, matching
backend `MATTERHORN_WORK_TRUSTED_PROXY_SECRET`. Never put backend credentials in
`VITE_*` or return them to browsers.

Run this read-only check from the approved clean checkout, with `RELEASE_SHA`
set to the approved full merge SHA. It verifies paused prelaunch, not launch:

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://matterhorn-desks-canary.vercel.app \
  --server-url https://matterhorn-desks-canary.vercel.app \
  --expected-commit "$RELEASE_SHA" \
  --expected-web-commit "$RELEASE_SHA" \
  --expected-signup-status paused --strict --json
```

The canonical origin exercises the deployed same-origin proxy. Also inspect the
actual API deployment privately. Unauthorized `/workspaces` and `/opencode` must
return JSON 401/403, not an HTML app fallback. After approved public activation,
repeat with `--expected-signup-status open`; this additionally requires launch
health. Never fabricate evidence timestamps or change a gate to force a pass.

### 2. Normal-user agent approvals — backend engineer and release owner

The production image defaults to `MATTERHORN_WORK_APPROVAL_MODE=manual`.
Submitting a chat requires approval, but the host approval queue is protected by
host/owner credentials. The overnight fixes make Stop/disconnect safe; they do
**not** provide a normal hosted-user approval journey.

Choose and implement a deliberate hosted policy or an authorized in-app approval
flow. Do not distribute the host token to users, disable global approval as a
shortcut, or weaken wallet, tool, privacy or tenant authorization. Test allow,
deny, expiry, disconnect, Stop and retry with an ordinary account. A queued 202,
wallet-support label or model-picker selection is not a completed response.

### 3. Verification email and password recovery — infrastructure/email owner

Last `/health/launch` returned 503 with `emailDelivery`, `emailEvents`,
`emailTransport`, `passwordReset`, `backupConfiguration`, `backupFresh` and
`backup` failing. `/health/ready` being green does not resolve those gates.
Signup was paused and reset unavailable; no hosted test account was created.

Configure the production SES API transport, not SMTP, using the approved sender
domain and SES region. Verify domain/DKIM, appropriate DNS authentication and SES
production access. Put values only in the backend secret manager:

```text
AWS_SES_REGION
AWS_ACCESS_KEY_ID                    # SES-only principal
AWS_SECRET_ACCESS_KEY
AWS_SES_CONFIGURATION_SET
EMAIL_FROM                          # real verified sender, not an example
EMAIL_FROM_NAME
MATTERHORN_SES_EVENT_SECRET          # independent event authentication secret
MATTERHORN_APP_URL=https://matterhorn-desks-canary.vercel.app
MATTERHORN_EMAIL_VERIFICATION_REQUIRED=true
```

Wire the configuration set through the authenticated event path
`/api/auth/email-events/ses`; test delivery, bounce and complaint processing. An
SES acceptance/message ID is not delivered-inbox evidence. Prove verification
and reset in designated real inboxes, correct canonical links, expiry/replay
rejection, replacement-challenge invalidation, and session handling after reset.
Keep secrets, verification codes and reset links out of reports. Do not use local
console mail, DB edits or disabled verification to manufacture a hosted pass.

### 4. Full backup and restore — infrastructure/data owner

The host archive contains five databases, **not** filesystem notes, memory,
workspace outputs/configuration. A green upload/freshness marker alone cannot
prove full-platform recovery. Tenant packaging now explicitly returns
`archive_verified`, `ready: false`; it is not an application importer or an
authenticated tenant-restoration proof.

Privately inventory all actual persistent mounts, including memory
`MATTERHORN_WORK_MEMORY_ROOT`/`OPENWORK_MEMORY_ROOT` (default
`~/.matterhorn-work/memory`), workspace files and the independent erasure ledger.
The Dockerfile does not itself set the memory-root override. Provide an approved
filesystem/volume recovery path alongside consistent database snapshots.

Required backend configuration, with a separate backup-only principal:

```text
AWS_REGION                          # backup region; AWS_DEFAULT_REGION also supported
MATTERHORN_BACKUP_S3_BUCKET          # private, versioned bucket
MATTERHORN_BACKUP_KMS_KEY_ID
MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID
MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY
MATTERHORN_BACKUP_AWS_SESSION_TOKEN  # only when temporary backup credentials are used
MATTERHORN_HOST_BACKUP_REQUIRED=1
MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET
MATTERHORN_ERASURE_LEDGER_DB=/data/erasure-ledger/ledger.db
```

Prove a real versioned, checksum/encryption-verified upload, then restore to a
new isolated empty environment, never over production. Preserve and reconcile
the latest external deletion ledger. Verify known account/chat/usage records,
notes/memory/output sentinels, file digests and deleted-record absence. Start the
isolated application and prove data is usable. Record backup age, version,
recovery duration and sanitized outcomes; do not attach archives or keys.

### 5. Hosted acceptance and launch decision — QA and release owner

Use two authorized ordinary test accounts with working inboxes. On the exact
deployed release, complete all five desks: Private AI, Bittensor, Hyperliquid,
Polymarket and Sui. Verify actual model answers and applicable live read-only
data/tool results, source freshness, reload persistence and exact token usage
with zero stranded holds. Test cancellation/retry and provider/agent failures.

Prove A cannot read or mutate B's chats, models, notes, memory, outputs or
connections. Verify explicit memory confirmation/deletion and contextual use;
notes save/error behavior; model changes and drafts; new/returning sessions;
keyboard/focus/zoom, mobile/tablet/desktop and Chromium/Safari/Firefox. Record
unavailable checks as unverified, never passed.

The current owner-acceptance contract also requires **at least 48 hours of
guarded-runtime shadow evidence bound to the release commit**. This was confirmed
in `scripts/public-beta-owner-acceptance.mjs` and
`scripts/guarded-runtime-shadow-evidence.mjs`; no qualifying hosted evidence was
produced here. Deploying tonight and running local tests cannot meet that window.
Any change to this release policy needs explicit security/product review, not a
silent flag change or shortened test clock.

Complete monitoring and delivered-alert tests, rollback drill, named incident
and support owners, legal approval and a private exposed-credential review.
Keep unaccepted OAuth integrations hidden; each public connector needs connect,
reload, safe call, revocation and disconnect evidence. Existing wallet acceptance
requirements need separately authorized test-wallet owners; no wallet signing
or real-fund activity was done in this block.

Use `docs/public-beta-owner-acceptance.example.json` and
`docs/public-beta-owner-acceptance-2026-07-20.md` for the complete evidence schema.
Declare `releaseSurface: web` for an explicitly web-only release; this excludes
desktop distribution acceptance, not the remaining platform gates. Reports must
be fresh, intact and tied to the final SHA. Keep completed operational evidence
outside the release commit. Run only after supplying real evidence:

```sh
pnpm public-beta:owner-acceptance -- \
  --input qa-reports/public-beta/owner-input.json \
  --output-dir qa-reports/public-beta/final-owner-acceptance \
  --strict --json
```

The safety suite tests this gate's behavior; it does not supply its human or
hosted facts. Public signup activation and launch announcement require a separate
approved release decision after these blockers are resolved.

## Exact local implementation commits, in order

```text
546821f25116ea41415356c737e88e21daf10977 chat completion metadata
f98828d06a04c2decf31457a9e90825c5d2c1105 atomic restore and WAL erasures
69a35790cdd56e7f4db725d909f5fe2644f42617 backup flag parity
1504ae112257730760707835708488bc5ace8e94 approval request cancellation
939cc17878c01248d405cf15832237e69b042331 Stop and native Bun disconnects
090ddfd817c27dcc7dcc5c577562512db1693186 newer draft preservation
a459076ebd9cff593708e14e8916ce0aa8ff657e cancelled approval presentation
8874baabf47ccc35f6cfc7e82dd67239ed133e4e exact draft/paste reload
da2399b4c0a27575a991e052f0c062a3f5f1ac0e notes scope and compact navigation
869d4020713685f643dcc75075813a8952cf61ef serialized note saves
5eb3d380b68224f16a8accf59cc644cbf5a25f09 notes connection isolation
9b06a26541356bd721e563c05319c7e34ac2ded9 validated, truthful archive evidence
6a34543d6d0cffb2facd835183b7cc35b409cbf5 account-security state isolation
```

Supporting evidence: `WORKLOG.md`, `UI-RECOVERY.md`,
`APPROVAL-CANCELLATION.md`, `RUNTIME-ENFORCEMENT.md`,
`RECOVERY-AND-ISOLATION.md`, and `hosted-release-probe.json` in this folder.
