# Matterhorn public beta: Codex / tech-team handoff

Prepared 26 September 2026. Production: **https://desks.matterhorn.so**.
Repository: **https://github.com/matterhornso/matterhorn-work**.

Rolling Codex progress and team dependencies are recorded in
`qa-reports/public-beta/codex-local-2026-09-26/WORKLOG.md`. The first local
follow-up reproduced and corrected missing agent-policy errors being hidden
behind host-approval timeouts; the log distinguishes this fix from the still
unverified production approval journey. It also records exact regression counts
and source changes to reconcile with the team's parallel branch.

Follow-up implementation commit (local only):
`314ccd6620e3022ad7e8cd00d51404a1871476fb`. Final local validation: 1,751 backend
tests, 1,228 frontend tests, both typechecks, frontend build and full safety gate
pass. This is not hosted acceptance. No new configuration or migration is needed;
do not confuse this setup-error correction with a change to the approval policy.

## 1. Read this first: production is already hosted

This handoff supersedes the production assumptions in the earlier overnight
handoff. That earlier assessment tested `matterhorn-desks-canary.vercel.app`,
which is a separate deployment. Do not apply its paused-signup or failing-email
findings to production. Do not redirect working production settings to canary.

Read-only checks at approximately **2026-09-26 01:45 UTC / 07:15 IST** found:

| Production observation | Result |
| --- | --- |
| App HTTPS response | 200 |
| `/health/ready` | 200 |
| `/health/launch` | 200, `ready`; all reported checks true |
| `/api/auth/config` | Signup open; verification required; reset available; launch ready |
| Email transport / delivery / event checks | Pass |
| Backup configuration / freshness checks | Pass |
| Legal, Turnstile, provider privacy and inference checks | Pass |
| Security headers, exact-origin CORS, untrusted-origin denial | Pass |
| Anonymous `/workspaces` and `/opencode/global/health` | JSON 401 |
| Web and API reported revision | `787d85bb830ff859a185d3bcd1a20c493dd008d4` |

That revision maps in the local Git history to the PR #1018 merge. This is a
**release-identity discrepancy to investigate**, not proof that the actual
deployed bytes are old: metadata may be stale. The probe failed only its
comparison against the overnight implementation SHA. Resolve the discrepancy
using deployment records and artifacts; do not simply relabel an old build.

These are health/configuration observations, not proof of complete user journeys,
inbox delivery, full restore or successful agent execution. Production readiness
is **not yet signed off by this QA effort**. Some required evidence may already
exist with the team; provide and validate it rather than repeating working setup.

## 2. Ownership: what Codex can do vs what the team must do

| Workstream | Codex can own | Tech team / release owner owns |
| --- | --- | --- |
| Code corrections | Diagnose approval/runtime/UI issues; bounded fixes; tests; reviewable branch/PR when authorized | Review intended behavior, approve merge and production release |
| Revision reconciliation | Compare supplied deployment SHA/artifacts with Git and the overnight changes | Identify actual Vercel/Railway projects, immutable deployments, source commits and image digests |
| Five-desk acceptance | Drive the authenticated app with approved test sessions; collect sanitized outcomes; fix reproducible code defects | Supply two ordinary test identities and inbox access, approved test allowance, operational logs and any server-side permissions |
| Email/reset | Test app flow, expiry/replay and error behavior with designated accounts | Handle private inboxes, verification/Turnstile steps, SES event records and any DNS/IAM changes |
| Recovery | Review scripts/coverage and validate disposable local restore fixtures | Retrieve real backup, provide approved isolated recovery environment, execute production-shaped restore and secret recovery |
| UI/accessibility | Test available browser/preview, keyboard, drafts and failure states; fix defects | Provide Safari/Firefox/mobile/device coverage unavailable here |
| Monitoring / rollback | Define checks, inspect sanitized evidence and release commands | Actual alert delivery, incident routing, rollback drill, on-call ownership |
| Wallets / OAuth | Read-only checks, contract tests, explain/reproduce errors | Test-wallet signatures and external consent under separate authorization; keep keys private |
| Final release | Assemble evidence and run gate validation | Legal/security decisions, release policy, production changes and final GO/NO-GO |

Codex is not claiming all of this is happening automatically now. This document
is the division of work. Publishing the local branch, merging or changing
production requires the appropriate approval. Credentials must stay in approved
secret storage or a signed-in test browser, never in chat or this document.

## 3. Source handoff: GitHub latest alone is not enough yet

The overnight changes were prepared on this local checkout:

```text
/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime
branch: codex/beta-launch-readiness-2026-09-25
base: 084880d7aad8321bd8b3a09104b5ac7cf9dff037
tested implementation: 6a34543d6d0cffb2facd835183b7cc35b409cbf5
documentation tip: 8f22f324b4b8d5b93f9163d96fb70ac8dbee0c4f
```

At preparation time these commits are **local, not pushed**. This handoff itself
is a new local file. Forward the file directly; it is not yet available through
a GitHub link. Do not tell another engineer to pull a nonexistent remote branch
or assume “latest PR” includes the work.

Next source-control step: obtain approval for Codex to push/open a PR, or arrange
an approved source transfer. Once published, fetch the exact branch, compare it
with current target-branch changes, review, rerun CI, merge and record the final
full SHA. Never deploy the local dirty workspace or blindly cherry-pick all
commits onto a different implementation. Preserve unrelated untracked files.

The local work covers chat metadata reconciliation, scoped approval cancellation
and native Bun disconnects, draft persistence, notes save/connection races,
account-security cache isolation, atomic database restores, WAL erasure-ledger
preservation, backup flag parity and truthful tenant archive validation.

Validated implementation commits, oldest first:

```text
546821f25116ea41415356c737e88e21daf10977
f98828d06a04c2decf31457a9e90825c5d2c1105
69a35790cdd56e7f4db725d909f5fe2644f42617
1504ae112257730760707835708488bc5ace8e94
939cc17878c01248d405cf15832237e69b042331
090ddfd817c27dcc7dcc5c577562512db1693186
a459076ebd9cff593708e14e8916ce0aa8ff657e
8874baabf47ccc35f6cfc7e82dd67239ed133e4e
da2399b4c0a27575a991e052f0c062a3f5f1ac0e
869d4020713685f643dcc75075813a8952cf61ef
5eb3d380b68224f16a8accf59cc644cbf5a25f09
9b06a26541356bd721e563c05319c7e34ac2ded9
6a34543d6d0cffb2facd835183b7cc35b409cbf5
```

Local evidence: 1,734 backend tests and 1,225 frontend tests pass; frontend/server
typechecks, frontend build and the ten-stage safety gate pass. Source secret scan
had zero findings across 1,206 source files; tests, fixtures, Markdown and QA
reports are excluded by that scanner. Large frontend chunk warnings remain.
The five-agent enforce-mode probe uses a synthetic provider, not production.
Earlier real-model results were local/operator-assisted, not ordinary hosted
user acceptance. Do not promote either to live acceptance evidence.

## 4. Team runbook, in order

### A. Establish the actual production release

1. Identify which Vercel project/deployment owns `desks.matterhorn.so` and which
   Railway project/environment/service receives its same-origin API traffic.
   Do not assume the previously observed canary backend is production's target.
2. Record immutable deployment IDs/URLs, Git source SHA, container image digest,
   build time and backend runtime versions. Inspect private deployment records,
   not just `/health` headers or manually entered commit variables.
3. Explain why both surfaces report `787d85bb830ff859a185d3bcd1a20c493dd008d4`.
   If metadata is stale, correct it in the build/release pipeline and rebuild the
   same reviewed source. If code is old, reconcile and deploy the approved fixes.
4. Verify whether the overnight corrections are already present in another
   branch or deployment before merging duplicate/conflicting changes.
5. Return the exact intended release SHA and rollback artifact IDs to Codex.

After an approved release, web `VITE_MATTERHORN_BUILD_COMMIT` and backend
`MATTERHORN_BUILD_COMMIT` must describe the actual built source. Keep all proxy,
provider, SES, S3 and KMS secrets server-side; never in public `VITE_*` values.
Preserve working signup, verification, privacy and usage enforcement. This
handoff does not authorize toggling signup, provisioning costs or changing secrets.

Read-only probe after setting `RELEASE_SHA` to the independently verified full
40-character SHA (not a guess):

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://desks.matterhorn.so \
  --server-url https://desks.matterhorn.so \
  --expected-commit "$RELEASE_SHA" \
  --expected-web-commit "$RELEASE_SHA" \
  --expected-signup-status open --strict --json
```

This tests the public same-origin API. Inspect direct service deployment identity
privately as well. A pass is necessary but not sufficient for sign-off.

### B. Provide safe ordinary-user acceptance access

Create/designate two isolated test identities, A and B, through supported normal
registration. Give each a real controlled inbox. Complete verification and any
human Turnstile interaction normally. Do not seed a verified flag in the database
or send Codex passwords, reset links, cookies or API keys in chat. Prefer signing
the test account into the available browser; provide separate profiles for A/B.

Agree a bounded model-test allowance and cleanup ownership. Supply sanitized
request IDs/log excerpts if needed; keep prompt content and credentials out of
general logs. Ask Codex to run the real acceptance matrix after access is ready.

### C. Confirm the approval policy before testing all desks

The locally reviewed production Dockerfile defaults to
`MATTERHORN_WORK_APPROVAL_MODE=manual`. In that source, prompt dispatch requires
approval while the host queue requires host/owner credentials. This is a known
source-level concern; the actual production path has not been established.

Report the effective production policy and demonstrate an ordinary user obtaining
a completed response without an operator approving every prompt out of band.
If blocked, return the sanitized request ID, error and effective policy to Codex
for a scoped fix. Do not expose host tokens, globally disable approvals or remove
tool/wallet/privacy consent as a workaround. Any revised hosted policy needs
explicit authorization and tests for allow, deny, expiry, Stop and disconnect.

### D. End-to-end acceptance matrix: Codex runs; team supplies access/evidence

| Area | Required test and evidence |
| --- | --- |
| New user | Signup, real inbox verification, sign-in, model selection and all five visible desks |
| Returning user | Sign-out/in, persisted chats/default model and clear expired-session recovery |
| Private AI | Harmless completed model answer; do not confuse the desk name with verified private-provider mode |
| Bittensor | Successful live-chain read, such as current block/network information, with source and freshness |
| Hyperliquid | Current public market/orderbook read; no orders or account secrets |
| Polymarket | Current public market research/read; no trades or unsupported availability claims |
| Sui | Current checkpoint/network read; no transaction signing |
| Chat failures | Stop while preparing/working, approval denial/expiry, provider failure, safe retry and draft retention |
| Accounting | Provider-reported usage matches settled accounting using configured weights; zero stale holds; retry does not duplicate inference/charges |
| Isolation | B cannot list/read/change A's chats, notes, memory, files, models or connections, including direct ID attempts |
| Memory | Explicit save/review, provenance, safe contextual use, delete; A's memory absent from B |
| Notes/files | Save/reload/error states; rapid edits and navigation; authorized upload/download; no cross-account leakage |
| Integrations | Every visible integration accurately states availability; each enabled OAuth connector passes connect, reload, safe call, revoke and disconnect |
| UI | 390px mobile, tablet, desktop/Codex width; no clipped controls; keyboard/focus, 200% zoom, screen-reader labels; Chromium/Safari/Firefox |

Use disposable test records and public read-only requests. Record failures as
failures, not as passed because a spinner or HTTP 202 appeared. Real-fund signing
is out of scope. Test-wallet acceptance required by the release contract must
be carried out by authorized wallet owners on approved test networks.

### E. Email/reset: verify working configuration, do not rebuild it blindly

Production checks are green. Supply evidence of one delivered verification and
one delivered password reset in the designated inboxes, with canonical
`desks.matterhorn.so` links. Test expired/replayed and superseded challenges,
new-password sign-in, old-password failure and intended session invalidation.

Confirm SES delivery/bounce/complaint events are authenticated and correctly
processed, using test tooling or controlled cases. An accepted SES message ID
alone is not inbox delivery. Share timestamps/outcomes, never codes/reset URLs.
If a real failure occurs, inspect the existing sender/domain, configuration set,
event endpoint and backend transport; do not rotate working credentials or alter
DNS without approval.

### F. Full recovery proof: team executes; Codex reviews

The reviewed host backup script archives five databases: accounts, model usage,
rate limits, guarded runtime and OpenCode. It does not itself archive all notes,
memory, outputs and workspace configuration. Production may have additional
volume backups: establish their actual coverage before declaring a gap or a pass.

1. Inventory persistent mounts and paths for all data, runtime/workspace files,
   memory and the independently preserved erasure ledger. Memory may use
   `MATTERHORN_WORK_MEMORY_ROOT` / `OPENWORK_MEMORY_ROOT`, otherwise
   `~/.matterhorn-work/memory`; verify actual deployed settings privately.
2. Select a real backup version and use an approved, isolated empty recovery
   target. Never overwrite production, attach the restored service to the public
   domain or send real emails/jobs from it.
3. Verify encryption/checksum/version, SQLite consistency and filesystem digests.
   Reconcile the latest external erasure ledger so deleted data stays deleted.
4. Start the restored application in isolation. Check known account/chat/usage,
   note, memory and output sentinels for both test accounts and their isolation.
5. Record object/version IDs, backup age, restore duration, coverage/exclusions
   and sanitized outcomes. Keep archives, private contents and recovery secrets
   out of source control and chat. Provide approved RPO/RTO targets and whether
   the drill met them.

A green freshness marker is not a restore drill. The corrected tenant packaging
tool reports `archive_verified`, not a complete application import or authenticated
tenant recovery. Use a supported full recovery path, not an invented pass.

### G. Operations and final release decision

Demonstrate actual alert delivery for service/provider failures and name the
incident, rollback and support owners. Record a safe rollback drill between
immutable releases, including data compatibility. Obtain legal/support approval
and review any exposed credentials privately with the security owner.

The locally reviewed release contract requires **48 hours of guarded-runtime
shadow evidence tied to the exact release SHA**, with anomaly review. Ask the
team for existing qualifying evidence. If absent, schedule it; do not shorten
timestamps, lower gates or disable consent to meet a date. Any policy change is
a separate documented security/product decision, not something Codex can waive.

Use the current candidate's owner-acceptance schema; confirm whether production
uses a different approved contract. For a web-only launch, explicitly declare
`releaseSurface: web`. This omits desktop distribution requirements, not the
web/security/operations requirements. Validate fresh, real, SHA-bound reports:

```sh
pnpm public-beta:owner-acceptance -- \
  --input qa-reports/public-beta/owner-input.json \
  --output-dir qa-reports/public-beta/final-owner-acceptance \
  --strict --json
```

The input does not exist merely because this command is listed. Populate it from
`docs/public-beta-owner-acceptance.example.json` with actual evidence; never copy
example successes. Read `docs/public-beta-owner-acceptance-2026-07-20.md` for the
contract, including monitoring, wallets/OAuth and human approvals. Keep completed
operational evidence outside the release commit. Announce launch only after
named owner sign-off; this document is not that authorization.

## 5. What the team should return

Return one sanitized status report with each item marked **PASS / FAIL / BLOCKED
/ NOT TESTED**, timestamp, exact SHA, evidence reference and responsible owner:

1. Actual production topology, deployment IDs/image digest and verified source SHA.
2. Whether reported `787d85bb...` is real source identity or stale metadata.
3. PR/merge/release decision for the local overnight fixes; final reviewed SHA.
4. Two ordinary test accounts ready through normal registration, with inbox
   owners and safe browser access arranged; no credentials in the report.
5. Effective approval policy and unassisted five-desk outcomes.
6. Verification/reset delivery, two-account isolation and accounting outcomes.
7. Complete restore drill, coverage, RPO/RTO and deletion reconciliation.
8. Monitoring/rollback evidence, shadow evidence and remaining human approvals.
9. Any unresolved defect: reproduction, expected/actual behavior and sanitized
   request ID/logs. Codex can implement bounded code corrections from this.

## 6. Copy-paste assignment for the tech team

> Please own production verification and operational acceptance for Matterhorn's
> public beta at https://desks.matterhorn.so, repository
> https://github.com/matterhornso/matterhorn-work. Do not use the canary URL as
> production. Checks on 26 September 2026 at about 01:45 UTC show signup open and
> launch/email/reset/backup readiness green; do not rebuild working setup.
>
> First reconcile actual Vercel/Railway deployment records and artifact identity:
> both surfaces report 787d85bb830ff859a185d3bcd1a20c493dd008d4 (locally PR #1018).
> Establish whether this is deployed code or stale metadata. Do not merely change
> the reported SHA. Codex has thirteen tested local fixes on
> codex/beta-launch-readiness-2026-09-25, implementation tip
> 6a34543d6d0cffb2facd835183b7cc35b409cbf5, documentation tip
> 8f22f324b4b8d5b93f9163d96fb70ac8dbee0c4f. They are not yet pushed; pulling GitHub
> latest will not supply them. Arrange an approved PR/source handoff, review and
> reconcile before any approved release.
>
> Supply two ordinary verified test accounts with controlled inboxes and safe
> browser access, not credentials in chat. Confirm the effective chat approval
> policy and remove any operator-only dependency through an approved scoped
> implementation, without disabling safety boundaries. Codex can run functional
> QA and fix code defects once access is ready.
>
> Own real verification/reset inbox and SES-event evidence; full isolated backup
> restoration covering databases plus notes, memory, outputs/configuration and
> deletion reconciliation; production monitoring/alert delivery and rollback;
> unavailable browser/device tests and authorized test-wallet/OAuth acceptance.
> Supply existing 48-hour exact-release shadow evidence or schedule the required
> observation; do not weaken the gate. Follow the detailed attached runbook and
> return a SHA-bound PASS/FAIL/BLOCKED/NOT TESTED report with evidence and owners.
> Preserve working production settings. No secrets in chat/Git, auth bypass,
> unapproved infrastructure spending or real-fund transactions. Obtain explicit
> release approval before merging/deploying or changing production policy.
