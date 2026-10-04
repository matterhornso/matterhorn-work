# Matterhorn launch merge handoff

Prepared 3 October 2026 for the technical release team. This is a conditional runbook, not a green light to merge an unverified branch. The owner approved five core desks, optional Jev, STM off, clear unavailable-model labels and proceeding with the risk/privacy review. Codex prepares acceptance evidence and fixes; your team reviews and merges only the exact candidate that passes the gates below.

## Execution update

Latest deletion follow-up on 4 October adds a durable workspace-deletion marker and atomic checks that reject encrypted evidence/file creation after delayed key allocation. Agent File context and recovery reads now recheck deletion after waiting for decryption. These were failing local reproductions, not speculative hardening. Final affected regressions: 138 pass, zero fail, 1,253 assertions across eight files; server typecheck and all 11 local safety stages pass. Include the final tested follow-up commit identified in the return report, not only the historical SHAs below. See [current QA results](../../qa-reports/launch/2026-10-04/RESULTS.md) for commands and scope. The marker retains only a workspace identifier and must be preserved through restore; it is not proof of backup erasure. Evidence rotation/decryption, publication completions and downstream operations remain separate review targets. No deployment or hosted acceptance is established by this correction.

Earlier 4 October follow-up: include local commits `db096d2177ad0d1916aa615e540b82f47231813b` (delayed-body authorization) and `b32d542ff9f17773ab36fbd4be1c59b216dfd09d` (approval cancellation/revalidation), plus the subsequent policy-expiry test/report update in the final reviewed branch head. Both fixed reproduced writes that recreated workspace data after deletion. The approval follow-up has 132 related tests passing, server typecheck passing and all 11 local safety stages passing. The latest follow-up above separately covers delayed evidence finalization and file reads; it is not a global deletion-safety certification.

**New policy action:** the local candidate's Polymarket jurisdiction policy reached its review deadline at `2026-10-04T00:00:00.000Z`. New-position preparation is therefore denied by design. Review current official restrictions and applicable product/compliance scope before a versioned policy update; do not merely advance the deadline. Keep preparation unavailable and verify accurate user guidance until reviewed. Public research reads are a separate acceptance path. The test now covers both reviewed and expired dates; passing it is not current eligibility or hosted acceptance evidence.

4 October follow-up: include the subsequent local auth validation/recovery fixes and the delayed-upload authorization correction documented in [the current QA report](../../qa-reports/launch/2026-10-04/RESULTS.md). The review reproduced an authenticated upload recreating a workspace after account deletion; the corrected server rechecks access after body reading. The final local safety gate passes all 11 stages. This code is not deployed or proven on hosted accounts. Obtain the final reviewed branch head rather than using the historical candidate SHA below. Full in-flight/background deletion safety and hosted acceptance remain open; do not turn these local passes into launch approval.

Earlier 3 October execution evidence is in [launch results](../../qa-reports/launch/2026-10-03/RESULTS.md) and the [provider privacy register](provider-privacy-review-2026-10-03.md). At that revision, all 11 local platform-safety stages passed after fixing a Vercel security-header test selector, with a negative regression for conditional-only protection. Frontend 1,304 tests, discovery 22 tests, focused server 59 tests, typecheck and web build also passed. The 4 October report above records subsequent verification.

**Do not mark the full launch ready:** hosted web/API report `9b74d923b8c999733fe698c29a6555dd2980460b`, 27 commits behind current `dev`, and guarded mode is off. API signup is open but the browser initially displayed signup/reset disabled; reproduction was limited by browser-control timeouts. Real five-desk hosted acceptance, two test inboxes, provider budget, account-specific policy applicability and encryption/restore evidence remain outstanding. No launch PR or production deployment was made in this execution pass. Publication must include the final local fix/docs commit, not only the earlier candidate SHA below.

## Product and release context

- Repository: https://github.com/matterhornso/matterhorn-work; target branch `dev`.
- Canonical app: https://desks.matterhorn.so. Do not use the old canary as proof of production behavior.
- Desks: Private AI, Bittensor, Hyperliquid, Polymarket and Sui. Each must complete a real selected-model response; crypto desks also need successful live read-only tool evidence.
- Jev is optional classification, not permission/approval logic. Ordinary chat must work with Jev off. Keep STM off, including server-side enforcement.
- Preserve auth, consent, wallet review, token accounting, drafts, existing chats and account isolation. No data migrations or signing are authorized by this handoff.
- The search package adds seven static `/learn` guides, metadata/schema, sitemap and default-off indexing. Ship its public guides together with app-shell noindex changes. It does not repair or certify the underlying runtime, email or backups.

## Candidate status and acquisition

Known local checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-search-discovery-2026-10-02`.

Known local branch: `codex/search-discovery-2026-10-02`.

Committed HEAD before this handoff: `c3eb7cd7f231a338524b26e0585ff5f8c1dc42fc`.

Historical base: `e4342d6bef8d833d12e36bd8093a87c8dbe84856`.

No PR URL or remote availability is verified in this handoff. Do not guess a PR number or merge “the latest PR.” A pull of `dev` may omit this local work. Obtain the approved published PR and full head SHA from Codex/the owner, including subsequent acceptance fixes and these documents if intended for review. If the branch is still local, request its publication or an approved Git bundle; never copy environment files, credentials or runtime data to transfer code.

Use an isolated clean checkout. Read `AGENTS.md`; use pinned pnpm. Review the PR diff against current `dev`, inspect all commits/dependencies, and rerun after resolving conflicts or base updates. Historical SHAs above identify evidence, not an instruction to reset or overwrite newer work.

## Merge gates

1. **Scope evidence:** stages 1 and 2 in `docs/handoffs/approved-launch-plan-2026-10-03.md` have completed against the actual candidate. Any remaining operator-only gate is separately named and blocks launch where material. Do not treat mock/synthetic/local results as hosted acceptance.
2. **Candidate identity:** record PR URL, full head/base SHAs and intended services. No unexplained unrelated changes, new data processing, feature activation or migration.
3. **Review:** review auth/isolation, consent, accounting, Jev optionality, STM-off enforcement, model-unavailability copy and private-route discovery exclusions. Review actual provider-claim decisions; owner approval cannot replace missing factual evidence.
4. **Checks:** required GitHub CI/security jobs pass on the current head or platform merge candidate, not an older run. Investigate skipped/missing checks and unresolved security findings. No administrative bypass or forced merge.
5. **Deployment coupling:** determine whether merging `dev` automatically deploys to production. If it does, stop until production deployment is authorized and operational prerequisites are ready. Do not quietly disable or modify the deployment pipeline.
6. **Merge:** use the repository's permitted merge method and branch protection. Pin the merge to the reviewed head. If the head changes, stop and re-review/retest. Record the exact merge commit and post-merge CI result.

## Checks to reproduce

The following commands are a minimum for the existing discovery package, not a substitute for all required CI or backend tests affected by new fixes. Run in the isolated candidate checkout with the repository-supported Node/Bun environment. Missing runtimes or blocked loopback tests must be reported, not silently omitted.

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test scripts/search-discovery-audit.test.mjs apps/app/scripts/build-public-guides.test.mjs
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
git diff --check
```

Inspect the safety runner before execution and use disposable local data; do not supply production secrets to a broad test suite. Add affected server/runtime tests from the final PR. If the approved bootstrap needs package build scripts, follow repository setup in the isolated environment; do not use blanket unsafe workarounds.

Historical evidence: 1,304 frontend passes and 22 discovery passes. Build/typecheck passed at `d242f7429cdcd9444c1f2f3e9ff85f43144126db`. Only safety-gate wiring was recorded for that search block, not a full platform safety pass. Current CI, real hosted responses, inbox delivery, encryption/restore and all-browser acceptance are not established by those counts.

## Operational handoff after merge

Merge is not launch approval. Before any separately authorized deployment:

- Record coordinated web/API/runtime source versions, deployment IDs, expected configuration and last known-good rollback versions.
- Operator verifies email/reset delivery, applicable provider configuration/budget and encrypted backup/isolated-restore evidence. Never print keys in logs, screenshots or PRs.
- Preserve guarded execution and permissions. Do not set policy-reviewed flags without applicable evidence. Keep STM off; leave unverified optional Jev/model paths unavailable with clear copy.
- Keep discovery indexing off unless explicitly approved. Canonical indexable builds require both `MATTERHORN_SEARCH_INDEXABLE=1` and genuine Vercel production context. Do not manufacture production context on previews. Review actual Vercel root configuration and preserve API/auth routes.
- After deployment, prove exact hosted versions and run normal-user acceptance on all five desks, Jev-off ordinary chat, account recovery, isolation and usage settlement. Run `node scripts/search-discovery-audit.mjs https://desks.matterhorn.so` only with expectations matching approved publication state; use the documented preview/alias modes for other hosts.
- Hold announcement on auth/tenant leaks, broken core desks, duplicate billing/stuck holds, failed recovery, missing restore evidence or public claims contradicting actual behavior. Revert code through the approved rollback process without overwriting user data. Indexing rollback requires its own verification; it does not instantly remove cached search copies.

## Required return report

Return a concise report with:

1. PR URL and reviewed full head SHA.
2. Final base and exact merge commit SHA; merge time and method.
3. Required CI links, exact test commands/results and any skipped/blocked checks.
4. Five-desk acceptance table with environment and evidence, including whether hosted checks are pending.
5. Provider/privacy decision register and remaining operational blockers.
6. Whether merge triggered deployment; deployment IDs/SHAs if it did through an authorized pipeline.
7. Explicit MERGED / NOT MERGED and LAUNCH READY / LAUNCH BLOCKED conclusions with reasons. A green merge does not imply a green launch.

## Message to send with this handoff

Please own the review and merge of the approved Matterhorn launch candidate into `dev`. First obtain the exact PR/head SHA; the search-discovery work described here was local and must not be assumed present on GitHub. Follow the scope and privacy gates, reproduce checks, inspect required CI/security findings, and merge only the reviewed head without bypasses. If merging automatically deploys production, obtain deployment authorization before proceeding. Keep all five core desks in scope, Jev optional, STM off and unavailable models honestly labelled. Preserve user data and do not activate indexing or change production secrets/configuration as part of the merge. Return the exact merge SHA, CI evidence, any deployment side effects and remaining launch blockers. Read the companion approved plan and existing discovery/reliability handoffs for test and operational details.
