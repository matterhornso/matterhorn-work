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

## Next action

Record the local commit, then continue data/auth isolation and recovery/restore
coverage not already evidenced. Inspect remaining
normal-user agent failures under guarded enforcement using disposable local
data. Do not rerun unchanged hosted probes or count operator-assisted five-desk
responses as normal hosted acceptance. Expand release/operator handoff with the
manual approval constraint, alongside SES, reset, backup and revision blockers.
