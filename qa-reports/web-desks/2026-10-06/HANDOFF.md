# PR #1032 desk/chat and UI visibility handoff

## Candidate and decision

Repository: `matterhornso/matterhorn-work`. Target remains draft [PR #1032](https://github.com/matterhornso/matterhorn-work/pull/1032), head branch `codex/search-discovery-2026-10-02`, base `dev`. Do not merge or deploy on this handoff alone.

- Prior UI parity commit: `a5dba9649975f33e6eda614cdf88a81767e20a66`.
- Tested desk/chat, model/workspace and visibility correction commit: `0b65d89424fffa25c37bbd29d499c03dbfee35bf`.
- This evidence commit follows that source commit. The PR closeout comment records the exact final pushed head and its CI snapshot. Green checks on old remote head `16523ca23ea87422a16c87e6654afcbc0de5202c` are not new-candidate CI evidence.

The one-hour implementation window ended at 2026-10-06 01:21:27 UTC. Subsequent work is publication/report closeout only. Original preview processes, chats and data were preserved; isolated test origins used disposable accounts and public reads. No deployment, signing, auth/consent bypass, production-secret change or STM activation was performed.

## What is established

All five desks completed their recorded core public-read conversation flow with real local ASI1 inference and manual operator approval. Navigation exposes Desks, Model, Workspace tools, Profile and Settings; visible actions retain genuine setup/permission boundaries. Notes, reviewed memory, logout and two-account isolation have recorded local checks.

The fresh approval flow displayed Waiting for operator approval; Stop preserved the draft with zero usage/holds. Approved retry charged 984 tokens. Cross-venue tool plus response charged 8,667 tokens; combined account total 9,651, no holds. The model's omission attribution was imperfect and is not passed as semantic accuracy.

Broad regressions: 1,646 frontend/MCP/Bittensor tests, SDK/UI builds, app/server typechecks, offline Bittensor gate and isolated web build passed. A later compact Account-link adjustment passed 42 focused tests and app typecheck. Separately, 871 approval/session tests passed. Counts overlap. Selected full `desk.depth,product.readiness` stages passed; the latest all-stage safety attempt encountered Bun import/read EINTR and is not a complete green run.

## Remaining review and release-owner actions, in order

1. **Verify the exact new PR head and CI.** Read [ONE-HOUR-RESULTS.md](ONE-HOUR-RESULTS.md), inspect the source delta and the [48-starter action matrix](DESK-ACTION-MATRIX.md). Await/recheck new-head CI. Re-run `pnpm test:matterhorn-platform-safety` in a stable clean environment and record all stages, not just the selected-stage pass. Existing build chunk warnings are documented, not silently fixed.
2. **Resolve hosted manual approval operations.** `Dockerfile.public-beta` uses manual approval. Normal users cannot approve their own requests. Establish a secure staffed host/separate-owner review workflow or obtain separate approval for a policy-design change. Do not put host credentials in the browser or disable the boundary just to make tests pass. See [operator-approval-deployment-limit.md](operator-approval-deployment-limit.md).
3. **Complete browser coverage after unlocking the Mac normally.** Browser automation became unavailable while the Mac was locked. Recheck compact Profile → Account, mobile Settings drawer close, Sui explicit mainnet/testnet comparison with an approved public address, Safari, Firefox, 200% zoom and full accessibility. The Sui comparison had an approval timeout and no successful final receipt. Prior testnet balance/object evidence is separate. Keep the user's original preview untouched; use the isolated candidate/runtime.
4. **Approve deployment separately, then run hosted acceptance on the exact release SHA.** This handoff is not deployment authorization. Test model persistence → all five desk choices → real tool/model responses through ordinary accounts, source/network/freshness fidelity, Stop/retry, no stuck reservations, two-account isolation, notes/memory and logout. Preserve auth, provider consent, signing gates and regional restrictions.
5. **Close non-code launch gates.** Verify actual provider policies and configured model availability/throttling; real inbox signup/recovery; backup restore and storage encryption evidence; any enabled external integration. Jev was off in these real-response tests and needs separate enabled-path acceptance if offered. STM remains off. Do not claim every model, wallet transaction, connector or generated sentence works based on these five read-only flows.

## Evidence and reproduction

- [One-hour results and limitations](ONE-HOUR-RESULTS.md)
- [Earlier five-desk real-provider receipts and screenshots](RESULTS.md)
- [UI visibility inventory](VISIBILITY-INVENTORY.md)
- [Final broad commands and results](final-verification-result.json)
- [Approval/session commands and results](final-verification-approval-status-result.json)
- [Selected safety-stage command and result](platform-safety-desk.depth-product.readiness-result.json)

No credentials are included. Private temporary runtime files must not be copied into the repository, shared PR artifacts or frontend configuration. Review screenshots contain synthetic/public QA data, not proof of production readiness.
