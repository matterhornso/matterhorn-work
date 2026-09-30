# Retro UI and runtime release — 30 September 2026

## Release scope

Review branch `codex/retro-ui-2026-09-28` against `dev` at
`ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`. Includes the default-off retro
foundation, shared controls/model selection/chat corrections, guarded provider
retry binding, narrow read-only consent classification, Bittensor cold-cache
recovery, final receipt selection and cache-inclusive usage presentation.

No database migration, dependency replacement, provider substitution, secret
rotation, signup toggle, wallet signing or STM activation is part of this patch.
`VITE_MATTERHORN_RETRO_UI=1` is a separate opt-in build choice; preserve the
existing rollout flags until explicitly approved. Flag-off remains supported.

## Evidence and review

- [Five-desk enforced local acceptance](../../qa-reports/retro-ui/2026-09-29/runtime-acceptance/RESULTS.md): real ASI1 answers on all five desks; live read-only crypto tools, final receipts, exactly reconciled accounting, mobile/desktop navigation and recovery.
- Previously recorded full frontend 1,241 tests, auth 30 tests, accounting 27
  tests, full sidecar suite, platform safety, typechecks and build passed.
- Fresh pre-PR focused rerun: 230 tests, 1,367 assertions, no failures; subnet
  cache cold/coalescing/deadline/stale/failure/recovery checks passed.
- Source review covered exact-run retry authorization, mutated-message denial,
  short-lived bounded snapshots, preserved consent/signing boundaries, stale
  cache labels, dispatch deadline, receipt ordering, model persistence and
  default-off styling. Prior independent UI finish reviews are included with
  their evidence limits; no whole-platform visual sign-off is implied.

## ASI1 Mini recovery

One minimal provider probe returned HTTP 200 in 1,259 ms, 161 total provider
tokens. A separate request through the authenticated isolated app, explicitly
using `cudos/asi1-mini`, then returned “Yes, I can answer this message.”

Session: `ses_f0fea94ccffedeXae8YF02CPnQ`. Completed receipt in the UI: 1.9 s,
7,153 tokens. Read-only usage DB verification: model `asi1-mini`, completed,
7,153 raw = 7,153 charged. Isolated ledger now has eight settled operations,
46,701 raw = 46,701 charged tokens and zero pending held tokens.

This establishes recovery at test time, not a guaranteed provider quota or
capacity fix. The direct diagnostic's 161 tokens are outside the app ledger.
Keep rate-limit recovery and cancellation; never silently replace a user's
chosen model. If 429 recurs, inspect Retry-After/account limits with CUDOS.

## Hosted diagnostics and deployment boundary

Canonical app: **https://desks.matterhorn.so**. Fresh GETs returned:

- `/health/live`: 200.
- `/health/ready`: 200, guarded runtime mode `off`, account gateway ready.
- `/health/launch`: 200, all reported checks true, including backup/email.
- `/api/auth/config`: public signup open, email verification and legal
  acceptance required, password reset available.
- Frontend HTML and backend response header identify the older source
  `787d85bb830ff859a185d3bcd1a20c493dd008d4` (PR #1018).

These are diagnostics of the existing release, not acceptance of this patch;
health flags do not prove inbox delivery, restored backups or five-desk runs.

The canonical response is served by Railway. The connected Vercel account
contains only the older Matterhorn canary; inspecting the canonical domain
there fails. The accessible Railway Matterhorn project
`935a8288-3a56-4964-8edf-d2eed8ae9e79` contains only `control-plane`
(`bd355c60-01e6-4e7f-940c-14a8d95dd72e`) at
`control-plane-production-d46b.up.railway.app`, with no custom domain. Do not
assume this older service is the canonical backend or deploy to the canary as a
substitute for the live app.

Required operator input: canonical Railway project/environment and web/API/
Bittensor service IDs, access to those services, and a signed-in verified
ordinary test account. Never send passwords, session cookies or API keys in
the handoff. Use platform access controls and a password manager.

## Cutover procedure once access and CI are ready

1. Review the PR and require all CI checks green for the exact head. Merge only
   the reviewed revision to `dev`, record the merge SHA, and recheck merge CI.
2. Identify the actual web/API/sidecar source/build configuration and current
   immutable rollback deployments. Verify a recent application-consistent
   backup and restore evidence. Preserve persistent volumes and single-writer
   database topology. Drain active runs before backend replacement.
3. Build all three services from the same clean merged source. The updated
   sidecar image must include `subnet-cache.mjs`; the managed runtime must load
   the updated guard plugin. Inspect deployment artifacts, not build markers
   alone. Confirm runtime/capability credentials exist without printing them.
4. Preserve existing production modes and secrets; local enforced acceptance
   is not authorization to change production mode. A missing credential or
   incompatible mode is a blocker, not grounds to disable the boundary.
5. Deploy backend and sidecar, verify ready/launch and runtime connectivity,
   then web. Verify the actual source SHA and domain routing for every service.
   Do not replace the canonical Railway web tier with Vercel incidentally.
6. In an ordinary verified hosted account, select a model, reload, open each
   desk, and obtain a real response. For Bittensor/Sui/Hyperliquid/Polymarket
   require a read-only tool result with source/freshness; stale data must remain
   labelled and not count as live acceptance. No wallet signing or transactions.
7. Check Stop/retry/model-change draft retention, final receipts and raw versus
   charged tokens including cache. Verify no stuck holds, duplicate charges or
   cross-account reads. Exercise two-account isolation with disposable data.
8. Separately verify inbox delivery, password reset, consent, backup restore,
   mobile/desktop layouts and error recovery. Record unavailable browsers and
   untested paths honestly. Roll back if launch checks or core requests fail.
9. Return exact merge SHA, CI links, three deployment IDs/source SHAs, acceptance
   sessions/receipts, usage reconciliation and remaining owner actions. Do not
   include raw credentials, databases or private prompts in public artifacts.

## Status

Local acceptance and release packaging complete; PR/CI status is recorded in
the task. Canonical deployment and authenticated hosted acceptance are blocked
on the access/target details above. No production changes have been made.
