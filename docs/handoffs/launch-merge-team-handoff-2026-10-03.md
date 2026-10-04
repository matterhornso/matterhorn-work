# Matterhorn launch merge handoff

Prepared 3 October 2026 for the technical release team. This is a conditional runbook, not a green light to merge an unverified branch. The owner approved five core desks, optional Jev, STM off, clear unavailable-model labels and proceeding with the risk/privacy review. Codex prepares acceptance evidence and fixes; your team reviews and merges only the exact candidate that passes the gates below.

## Execution update

Latest local work wires pending-confirmation recovery into all four storage wallet callbacks. Metadata is saved before wallet handoff, scoped to the account/backend/workspace/resource and cleared on logout. Check confirmation retries only the saved intent and requires an exact newer server record before showing completion; it never opens another wallet request. Missing metadata and a replaced cross-tab intent no longer imply success. A new owner-scoped evidence filter makes older records recoverable beyond the default 50-record list. **Deploy the matching frontend and backend together.**

Final local checks: 1,381 frontend tests and 26 coworker HTTP tests pass; both typechecks, production build and all 11 safety stages pass. Existing bundle-size warnings remain. The synthetic browser harness verifies pending state after reload, confirmation-only retry, desktop/mobile wrapping and one keyboard-focus path. It is not an actual connected-wallet or hosted test. See [current QA results](../../qa-reports/launch/2026-10-04/RESULTS.md#pending-wallet-confirmation-recovery) for exact commands, logs, failing reproductions and limitations. The current changes must be included in the final reviewed branch head; no PR publication, merge or deployment is asserted.

Remaining recovery gates: real wallet rejection/submission behavior; verified release of genuinely unsigned or expired requests; recovery after logout/browser metadata loss; changed-wallet and cross-tab browser tests; screen-reader, zoom and cross-browser acceptance. Uncertain wallet results remain pending instead of offering an unsafe resubmission. Recovery metadata is not encrypted. Do not advertise complete wallet recovery or launch readiness from these local results.

The preceding API-only recovery commit is `ca07c465150623138059e00d56495ad2ec653e2c`. Its four storage actions confirmed after a temporary verifier error without another preparation; replay returned 410 and authenticated reads exposed matching committed digests. Wrong-account and changed-intent attempts remained denied. That pass had 25 HTTP tests and 563 assertions. The latest section above supersedes its pending UI implementation status. All evidence remains local and synthetic.

Cleanup commit `0aec4aa1d0932b0bcd3d52a70520b47cd84beb8f` adds active Sui anchor intents to workspace purge. Its regression failed before the fix; the separate expired-preview account-deletion HTTP test already passed through existing expiry cleanup. That pass had 77 targeted tests, 21 coworker HTTP tests, server typecheck and all 11 safety stages passing. Other-workspace data and the deletion barrier are preserved. These cleanup tests establish neither a duplicate on-chain submission nor safe end-to-end wallet recovery. See the current QA report for exact scope and logs.

The latest renewal recovery follow-up maps workspace deletion to HTTP 410 and corrects misleading API/UI claims about wallet outcomes. Users are directed to check submitted transactions in their wallet before retrying. Full local coworker HTTP tests pass 20 cases; frontend tests pass 1,357 cases, both typechecks and the web build pass. See [current QA results](../../qa-reports/launch/2026-10-04/RESULTS.md) for the final safety gate and evidence limits. Fresh rendered error-state acceptance, deletion/anchor mappings and safe confirmation retry after signing remain open; do not treat this copy correction as complete wallet-flow acceptance.

Verification follow-up `97dcad1cebab6cb87d1c4686e1e36e34258e16f1` rejects status writes after workspace deletion and stops further verification reads when the evidence revision changes. Status validation and persistence share one database transaction; renewal retains its existing outer transaction. Tests include successful and failed checks, deletion immediately before status saving, key destruction, unrelated-workspace controls and scheduled verification exclusion. Its affected regressions pass 243 tests with 1,819 assertions across 13 files; server typecheck and all 11 safety stages pass. No real storage or wallet request was made. Cleanup claims, remote-orphan reconciliation and hosted acceptance remain open.

Sui anchor follow-up `5f518a2a8ab991658d5f28359e522012ff24bf9b` rejects preparation/confirmation after workspace deletion and expired or replaced preparation claims. It also blocks cached previews for deleted workspaces. Its affected regressions pass 225 tests with 1,755 assertions across 13 files, server typecheck and all 11 safety stages pass. The focused anchor/store/package suites pass 40 tests. These are synthetic service tests, not real signatures or hosted acceptance. A rejected local anchor attachment cannot reverse an already-submitted wallet transaction.

Renewal follow-up `578581bdc5cfa38ecd4e793a1c1f5cbc1cdc4ec8` rejects file/evidence preview preparation and confirmation after workspace deletion begins. Preparation atomically rechecks the exact live claim and current revision before saving; expired/replaced claims cannot create an intent or clear their replacement. Its affected regressions: 216 pass, zero fail, 1,729 assertions across 13 files; server typecheck and all 11 local safety stages pass. Existing confirmation intents are left unchanged for deletion cleanup/expiry, not falsely treated as reversed wallet transactions. The later recovery follow-up above corrects the generic renewal “Nothing was changed” claim. Obtain the final commit/PR head including subsequent follow-ups; no remote PR, deployment or hosted acceptance is asserted here.

Publication follow-up `4273224c7154c4740056cfb322e1a90a31943be1` stops evidence, Agent File and multi-record Quilt publishers from attaching proofs after workspace deletion begins. Marker checks run after external waits and before final persistence; cleanup remains permitted, and a retry succeeds after busy publisher claims are released. Its affected regressions: 196 pass, zero fail, 1,604 assertions across 13 files; server typecheck and all 11 local safety stages pass. The tests use synthetic transports and keys. This does not undo ciphertext already accepted by external storage.

Evidence follow-up `c413338b94894d64e32b08f275c60a0937ed5b29` fixes delayed decryption returning data after deletion and delayed rotation overwriting destroyed recovery material. Rotation validates the current record and exact live claim, then commits its update/audit/claim consumption atomically. Scheduled rotation uses a fresh completion clock rather than its initial scan timestamp. Regression tests cover deletion retries, expired/replaced claims, rollback and unchanged-workspace controls. Its affected tests: 172 pass, zero fail, 1,450 assertions across 11 files; server typecheck and all 11 local safety stages pass. These remain local synthetic results, not hosted acceptance.

Earlier deletion follow-up `9156180c9bf848fc5c2116246b6d3471a69389f5` adds a durable workspace-deletion marker and atomic checks that reject encrypted evidence/file creation after delayed key allocation. Agent File context and recovery reads recheck deletion after waiting for decryption. These were failing local reproductions, not speculative hardening. Its affected regressions: 138 pass, zero fail, 1,253 assertions across eight files; server typecheck and all 11 local safety stages pass. See [current QA results](../../qa-reports/launch/2026-10-04/RESULTS.md) for commands and scope. The marker retains only a workspace identifier and must be preserved through restore; it is not proof of backup erasure. No deployment or hosted acceptance is established by this correction.

Earlier 4 October follow-up: include local commits `db096d2177ad0d1916aa615e540b82f47231813b` (delayed-body authorization) and `b32d542ff9f17773ab36fbd4be1c59b216dfd09d` (approval cancellation/revalidation), plus the subsequent policy-expiry test/report update in the final reviewed branch head. Both fixed reproduced writes that recreated workspace data after deletion. The approval follow-up has 132 related tests passing, server typecheck passing and all 11 local safety stages passing. The latest follow-up above separately covers delayed evidence finalization and file reads; it is not a global deletion-safety certification.

**New policy action:** the local candidate's Polymarket jurisdiction policy reached its review deadline at `2026-10-04T00:00:00.000Z`. New-position preparation is therefore denied by design. Review current official restrictions and applicable product/compliance scope before a versioned policy update; do not merely advance the deadline. Keep preparation unavailable and verify accurate user guidance until reviewed. Public research reads are a separate acceptance path. The test now covers both reviewed and expired dates; passing it is not current eligibility or hosted acceptance evidence.

4 October follow-up: include the subsequent local auth validation/recovery fixes and the delayed-upload authorization correction documented in [the current QA report](../../qa-reports/launch/2026-10-04/RESULTS.md). The review reproduced an authenticated upload recreating a workspace after account deletion; the corrected server rechecks access after body reading. The final local safety gate passes all 11 stages. This code is not deployed or proven on hosted accounts. Obtain the final reviewed branch head rather than using the historical candidate SHA below. Full in-flight/background deletion safety and hosted acceptance remain open; do not turn these local passes into launch approval.

Earlier 3 October execution evidence is in [launch results](../../qa-reports/launch/2026-10-03/RESULTS.md) and the [provider privacy register](provider-privacy-review-2026-10-03.md). At that revision, all 11 local platform-safety stages passed after fixing a Vercel security-header test selector, with a negative regression for conditional-only protection. Frontend 1,304 tests, discovery 22 tests, focused server 59 tests, typecheck and web build also passed. The 4 October report above records subsequent verification.

**Do not mark the full launch ready:** the 3 October hosted probe reported web/API `9b74d923b8c999733fe698c29a6555dd2980460b`, then 27 commits behind `dev`, with guarded mode off. At that probe API signup was open but the browser initially displayed signup/reset disabled; reproduction was limited by browser-control timeouts. This is historical evidence, not a fresh hosted-status claim. Real five-desk hosted acceptance, two test inboxes, provider budget, account-specific policy applicability and encryption/restore evidence remain outstanding. No launch PR or production deployment was made in this execution pass. Publication must include the final local fix/docs commit, not only the earlier candidate SHA below.

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
