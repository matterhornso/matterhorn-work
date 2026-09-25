# Overnight beta readiness — 25–26 September 2026

## Scope and deadline

User requested autonomous readiness work while asleep for tomorrow's public beta.
Work solo through 2026-09-26 01:30 UTC / 07:00 IST, with 30-minute heartbeat
continuations. Branch `codex/beta-launch-readiness-2026-09-25`, base merged dev
`084880d7aad8321bd8b3a09104b5ac7cf9dff037`.

Do not equate green CI with hosted acceptance. Preserve unrelated untracked
files. No production config/secrets changes, deployment, merge, signup activation,
auth/verification/consent bypass, paid resource creation or wallet signing.
Use disposable local test data and read-only hosted/public-chain diagnostics.
Prepare tested corrections and a precise operator handoff, not unsupported
100%-ready claims. Stop at deadline and pause the heartbeat with a final report.

## Known baseline (reuse, do not repeat blindly)

- PRs #1023 → #1024 → #1025 merged in order. Post-merge test/security CI passed.
- 1,178 frontend tests; complete backend suite 1,717 tests; sidecar tests;
  frontend/server typechecks, production build and ten-stage safety script passed.
- Default and flag-on minimal UI received a scoped desktop/mobile/tablet pass.
- Earlier five-desk real responses were local with operator-assisted approvals
  and guarded runtime off, not hosted normal-user acceptance.
- Just observed on hosted canary: Create account disabled, signup paused,
  password recovery disabled. No hosted test account created.
- Latest merged code has not been proven deployed to Railway/Vercel.

## Execution plan, ordered by launch impact

1. **Hosted truth and operator blockers:** run strict read-only release probe;
   inspect launch/auth health, deployed revisions, email/backup signals and
   supported provisioning paths. Record exact failing gates and required owner
   inputs; do not enable registration to get a passing result.
2. **Normal-user agent path:** inspect production approval/enforcement paths;
   reproduce missing-agent, unavailable-provider, denial, cancellation/retry and
   usage settlement failures with disposable accounts. Complete real-provider
   tests only where existing access safely permits; never bypass policy.
3. **Data and recovery:** expand two-account isolation across chats, models,
   memory, notes, tools and outputs. Exercise reset/verification expiry and replay
   locally; validate backup/restore with disposable data. Live SES/S3/KMS claims
   require real evidence, not fixtures.
4. **UI/user journey gaps:** fresh-account model selection, persistence failure,
   draft survival, permission waiting, accurate errors, minimal flag rollback,
   loading/offline states, keyboard/zoom/theme and secondary panels. Use applicable
   design skills and bounded fixes; no broad redesign. Mark unavailable browsers
   or screen-reader checks unverified.
5. **Regression and handoff:** targeted tests per fix, full relevant suites,
   typechecks/build/safety checks for the resulting candidate, secrets/diff check,
   local commits and a launch/no-launch report with exact remaining owner actions.

## Activity

### 17:27 UTC — started

- Resumed existing heartbeat with new scope and deadline; no duplicate automation.
- Created branch from merged dev, preserving unrelated files.
- Began inspection of the existing strict deployment probe.

### Hosted read-only acceptance — blocked

- Strict probe saved as `hosted-release-probe.json`, exit 1 (expected failure).
- Both web and API report `50ccdde690ad83b974b5ad13be53e5e8addac266`, not
  merged `084880d7aad8321bd8b3a09104b5ac7cf9dff037`.
- HTTPS, security headers, origin/CORS restrictions and unauthenticated workspace
  and runtime boundaries passed. Infrastructure health is ready.
- Launch health returns 503: email delivery, events, transport, password reset,
  backup configuration and backup freshness fail. Auth reports signup paused and
  password reset unavailable; no account was created and no gates were bypassed.
- Railway CLI has no project linked in this checkout; AWS CLI is absent.
  No production configuration was changed. Existing handoffs document the
  required SES configuration set/event secret and dedicated S3/KMS backup setup;
  actual delivery and restore evidence are still required.

### 17:39 UTC — completion metadata fixed; manual approval acceptance covered

- Initial transport hypothesis was ruled out: the unused legacy chat transport
  omits metadata, but active `session-sync` already receives it. Do not patch the
  unused adapter as a purported fix. The actual render/cache merge preferred an
  older snapshot's metadata over a completed live message.
- Reproduced four failing reconciliation assertions before implementation.
  Fixed the shared merge to preserve a newer valid completion timestamp, while
  retaining server authority for equal timestamps (including corrected zero
  usage). This is display metadata only; billing/accounting is unchanged.
- Added 12 regressions for pending snapshots, completion ordering, zero usage,
  invalid timestamps, legacy snapshots and repeated refreshes. Focused frontend
  tests: 46 pass. Entire frontend suite: 1,190 pass / 7,570 assertions. Initial
  sandbox run had two listener failures; rerun with local HTTP access passed.
- Frontend typecheck and production build pass; existing large-chunk warnings
  remain. Impeccable detector found no issues in the changed logic. No layout,
  copy, theme or design-contract change was made. PRODUCT.md has stale skill
  schema metadata; it was left unchanged rather than expanding release scope.
- Added three local HTTP gateway tests for manual host approval: allow, deny,
  expiry; clients cannot read/approve the host queue, no prompt is dispatched
  before approval, and denied/expired requests never dispatch. All three pass.
  Tests use a mock runtime and disposable local data, not real model acceptance.
- Production image defaults to manual approval. Normal chat gateway calls
  `requireApproval`; `/approvals` requires host credentials/owner bearer. Existing
  local five-desk tests used host assistance. **A normal hosted-user approval
  journey is still a launch blocker**, not evidence that agents are broken and
  not permission to disable global approval. Choose and test a deliberate hosted
  policy before launch; keep wallet/tool/privacy consent boundaries intact.
- Full session gateway regression file: 67 pass / 529 assertions. Server
  typecheck passed. No deployment or production settings changed.

### 17:57 UTC continuation — recovery and isolation

- Fixed two reproduced restore defects: failed validation left partial databases
  at the target; plain-file copying of an active erasure ledger omitted committed
  WAL deletion records. Restores now validate/reconcile in private staging and
  atomically publish; ledger uses a consistent SQLite snapshot. Regression tests
  fail before and pass after these corrections. See `RECOVERY-AND-ISOLATION.md`.
- Added 12 cross-account route denials for models/selection, files, integrations
  and exports, asserting the actual workspace authorization error. Full auth HTTP
  suite: 30 pass / 590 assertions. Auth store/outbox/freshness batch: 47 pass / 640
  assertions before the extension. Host restore contract and eight Node backup
  fixture tests pass. No AWS or hosted account acceptance is claimed.
- **New recovery coverage blocker:** the host archive includes five databases,
  not filesystem notes, memory, workspace outputs/config. Configuration export
  is not a substitute. The Dockerfile also leaves memory's persistent path to
  operator configuration. Need a verified filesystem/volume recovery path (or a
  carefully bounded archive extension) before full-platform backup signoff.
- Complete ten-stage safety gate passed. Strict secret scan: 1,201 files,
  zero findings. Diff check clean. No live config changed.

## Next action

### 18:27 UTC continuation — backup flag parity and enforced runtime

- Prior recovery commit is `f98828d06a`; all work remains local/unpushed.
- Reproduced a backup flag mismatch: launch checks accept `true/yes/on`, while
  `/health/ready` and the container backup loop only accepted `1`. Three local
  readiness tests returned 200 instead of 503 without a backup; the worker test
  showed `true` exiting without an upload attempt.
- Fixed server readiness using its existing boolean helper and aligned the
  worker's trimmed/case-insensitive parser. Added a local shell-worker fixture
  (stub uploader, no AWS), with seven enabled spellings and seven disabled/invalid
  spellings. Wired it into the container contract command already run by CI.
- Readiness/metrics/launch tests: 17 pass / 83 assertions; container tests pass;
  server typecheck passes. Full backend suite: **1,723 pass / 11,425 assertions**.
- Extended the pinned runtime probe with `--guarded-enforce`. All five agents
  complete synthetic responses in enforce mode. Baseline, lost-ack/retry,
  cancellation/recovery and denied-write runs pass; usage settles to exact fixture
  totals and zero holds. Secret and unbound-runtime negative controls block
  inference. See `RUNTIME-ENFORCEMENT.md` for scope and limits. This is not hosted
  normal-user or live-model acceptance.
- Runtime cleanup needed bounded forced termination; partial streaming output
  retention was not established. Do not report either as accepted.
- Filesystem recovery gap remains an operator/implementation blocker. Did not
  add an unreviewed broad archival format or mutate actual volume configuration.

## Resume here

### 18:57 UTC continuation — pending approval cancellation

- Backup parity/runtime evidence commit: `69a35790cdd56e7f4db725d909f5fe2644f42617`.
- Reproduced a late host approval being accepted after client disconnect. Added
  AbortSignal handling and deterministic cleanup to ApprovalService, passing the
  request signal from the API. Eight unit regressions and the 79-test/567-assertion
  approval/adapter/gateway batch pass; server build/typecheck passes.
- Full backend suite: **1,731 pass / 11,456 assertions**. The standalone Bun
  socket probe remains a known failing acceptance check outside that suite.
- **Not fully fixed:** identical socket probe passes Node 26.7.0 and fails Bun
  1.3.11 after POST body consumption. Public-beta entrypoint uses Bun, so this is
  still a release blocker. No speculative adapter switch shipped. See
  `APPROVAL-CANCELLATION.md` and the new repeatable diagnostic script.
- Traced explicit UI Stop to runtime session abort, rather than cancellation of
  the pending gateway request. Reproduce this separately next, then implement
  scoped cancellation without weakening session/account authorization.

### 19:27 UTC continuation — Stop and Bun disconnect corrections

- Prior approval signal commit: `1504ae112257730760707835708488bc5ace8e94`.
- Reproduced explicit Stop returning success while a later host approval could
  still dispatch the stopped request. Added pending approval cancellation keyed
  by authenticated subject + workspace + session. Negative tests protect other
  accounts/workspaces/sessions, unauthenticated callers and unscoped approvals.
- Corrected Bun POST disconnect propagation by selecting its native HTTP server
  under Bun, retaining the Node adapter for Node/Electron. Existing peer-address,
  streaming-failure and shutdown tests pass; error responses remain generic.
- Previously failing physical-disconnect probe now passes both Bun 1.3.11 and
  Node 26.7.0. Full gateway tests verify late approval 404, zero cancelled dispatch,
  and same-ID retry with fresh approval and exactly one dispatch.
- Full backend suite: **1,734 pass / 11,491 assertions** before final retry test
  extension. Full ten-stage safety gate passes. Server build/typecheck passes.
- Final same-ID retry/approval HTTP tests: five pass / 67 assertions. Final strict
  secret scan: 1,202 files, zero findings; diff check clean.
- Re-ran five-agent enforced runtime + in-flight abort because transport changed:
  all synthetic responses pass, cancellation/recovery passes, used=charged=6,000,
  zero holds, and secret/raw-runtime controls stop extra inference. Not live model
  or hosted acceptance. Forced cleanup and partial-output limitations remain.
- See `APPROVAL-CANCELLATION.md` for reproduction, historical failure, correction
  and scope. No deployment or production policy/config changes.

## Next continuation

UI recovery/accessibility coverage next: inspect Stop/failed-send presentation,
draft retention and model/desk navigation using disposable local data. Read
applicable design skills before UI work. Do not repeat unchanged hosted probes.
Manual hosted approval journey, SES/reset, full filesystem recovery and revision
drift still block launch. Pending-approval Stop/disconnect now pass locally but
still require production-container/hosted acceptance. No push, merge or deployment.
