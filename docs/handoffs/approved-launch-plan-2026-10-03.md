# Matterhorn approved launch plan

Prepared 3 October 2026 for the product owner, Codex and the technical release team. Execute the launch-scope work first, the provider and privacy review second, and the merge handoff third. This document records the approved direction and work to perform; it is not evidence that hosted acceptance or a policy audit has already passed.

The owner approved all five core desks, optional Jev, STM off and clear labels for unavailable models. The owner also approved proceeding with the risk/privacy work and public-claims review. This approval does not establish an undocumented provider retention term, encryption control or legal certification. Record the evidence supporting each material claim; escalate new material risks or changes to the approved scope.

Canonical application: https://desks.matterhorn.so. Repository: https://github.com/matterhornso/matterhorn-work. Target integration branch: `dev`. No production configuration changes, deployment, indexing activation or announcements are authorized by this planning document. The technical team receives conditional merge instructions in the companion handoff.

## 1 Launch scope work

### Establish the release baseline

Codex will inspect current remote `dev`, open PRs and required checks, then compare the actual hosted web, API and agent runtime versions. Record a timestamp and full SHA for each service. Historical local evidence must not be substituted for the hosted release. Preserve existing previews, chats, data and unrelated work.

Use an isolated candidate checkout and controlled test accounts. Record checks as PASS, FAIL, BLOCKED or NOT RUN. Each result must identify the commit, environment, desk, model, time and evidence location. Do not put credentials, reset links, private prompts or personal account identifiers into public reports.

### Five core desk acceptance

| Desk | Required successful user journey | Evidence required |
| --- | --- | --- |
| Private AI | Select an available model, start a chat, receive and reload a real answer | Selected model/provider, completed response, persistence and truthful processing disclosure |
| Bittensor | Enter a read-only public-chain question and complete the configured agent and chain-service path | Successful live tool receipt, requested entity/network, retrieval time, source and matching answer |
| Hyperliquid | Research a live market or public exposure through its agent | Source, units, timestamps, staleness/limitations and no contradictory warning summary |
| Polymarket | Research a specific identified market through its agent | Market identity, relevant outcome/resolution context, source, freshness and eligibility limitations |
| Sui | Read a public object/account on an explicitly selected network | Successful lookup, matching network/identifier, source, retrieval time and accurate interpretation |

For all five, verify sign-in → persisted model selection → desk → editable prompt → real response. Repeat essential checks after deployment on the exact release. Navigation, wallet badges, fixture tests and generic model knowledge do not prove live desk execution. Test only read-only public-chain actions; do not sign or submit transactions.

### Common chat and model checks

- Draft survives navigation, model changes and recoverable failures; starters never auto-send.
- Loading, streaming, Stop, retry, denied permission, missing agent, offline and expired-session states have safe recovery paths.
- Cancellation and retry do not duplicate tool execution, prompts or charges. Settled requests leave no stuck token hold. Compare provider usage, receipt accounting and allowance before/after each bounded test batch.
- Model choice persists; embedding-only models do not appear as chat choices. Unavailable models have a real reason and recovery action. Do not silently substitute a different model after an explicit selection fails. If the existing workspace-default path applies when nothing was selected, disclose it accurately.
- Test ASI1 and ASI1 Mini separately if both are offered. A throttled optional model may remain labelled unavailable while a verified model serves every core desk; that does not waive a broken core desk.
- Test mobile/desktop, light/dark, keyboard/focus and actual 200% zoom. Record unavailable browser environments, rather than calling them passed.

### Optional and disabled features

Jev is optional, with explicit consent for eligible message classification. A remembered preference must not transfer to another account or bypass a changed consent requirement. Verify off/on, new-chat persistence, disable, cancellation, timeout and late-result handling. The selected chat model remains the answering model. Jev must not grant permissions or replace deterministic approvals. If credentials/policy evidence are missing, keep Jev unavailable with an explanation and prove normal chat still works with it off. Read the repository TypeSafe skill and integration plan before changing Jev implementation.

STM stays off. Verify its default-off configuration and server enforcement, not merely hidden UI. Do not migrate credentials or activate STM for launch.

### Supporting launch gates

Use two controlled accounts and inboxes to test verification, login, password reset, expired/reused recovery links, session revocation and isolation. Verify memory/notes save, use, delete, reload and logout/account-switch cache cleanup. Test permissions at the API boundary, not only visible navigation. Confirm email delivery, production storage controls and isolated backup-restore evidence with the operator.

Codex owns reproduction, bounded fixes, regression tests and evidence. The team supplies least-privilege service access, two test inboxes, a provider-test budget and backup/restore access or an operator. Missing access is BLOCKED, never PASS. Do useful independent local work while access is pending.

**Stage 1 exit:** all five core paths pass on the candidate test environment; no unresolved critical/high security issue, tenant leak, duplicate charge or stuck hold; supporting operational gaps are explicitly recorded. Production go-live still requires hosted acceptance and verified recovery capabilities after the separately approved deployment.

## 2 Provider privacy and public claims review

Codex will inventory the actual configured processors and data flow, then compare public UI/docs with implementation and current official provider terms. Capture the exact policy URL/document/version, review date, applicable service/account tier, relevant configuration evidence, conclusion and owner. A public policy page alone may not establish the terms of our specific account or contract.

| Subject | Review and evidence | Claim boundary |
| --- | --- | --- |
| Chat provider and CUDOS/ASI path | Actual destination/service, data sent, training use, retention, deletion, subprocessors and region where documented; distinguish intermediary and upstream provider | No blanket zero-retention or no-training promise unless applicable terms and settings support it |
| Jev/TypeSafe | Eligible message fields, consent, retention/training terms, sensitivity exclusions and disable/cancel behavior | Optional classification is not authorization, proof of accuracy or an invisible processor |
| Memory and context | Storage path/service, tenant boundaries, explicit inclusion/provenance, deletion and browser cleanup | Do not imply all memory is local in a hosted deployment or universally recalled automatically |
| Chats, notes, files and exports | Separate storage and deletion lifecycles, permissions and export access | Deleting one memory record is not deletion of all copies or prior conversations |
| Encryption and backups | TLS, disk/database/backup encryption, key access, retention and an isolated restore record | File permissions are not encryption; encryption at rest is not end-to-end encryption |
| Logs and telemetry | Fields recorded, redaction, access, retention and enabled third parties | No claim of no tracking or no prompt logging without configuration/code evidence |
| Desk capabilities and safety | Deployed responses and tool receipts, warning fidelity, consent and signing boundaries | No investment/return guarantees, universal eligibility or autonomous signing claims |
| Public guides and discovery | Visible copy, metadata, schema, sitemap and private-route exclusions | No invented partners, ratings, authors, live-readiness or search-ranking guarantees |

Maintain a decision register with these fields: claim; proposed exact wording; affected UI/docs; processor/data type; authoritative evidence; deployed applicability; verification result; owner decision; remaining action. Record unknowns explicitly. Use the existing source ledger as a starting point, not proof of current hosting or contractual terms.

Keep the name Private AI, but state where requests are processed. State memory deletion limits, backup retention and provider-held copies accurately. Preserve required consent and warnings. If a claim cannot be substantiated, narrow/remove that claim or leave the affected optional feature disabled; never change a policy-verified flag solely to pass a test.

**Stage 2 exit:** every material launch claim has supporting evidence or appropriately qualified wording; implemented disclosure matches actual processing; no unresolved material data-sharing discrepancy. Existing owner approval is recorded. Newly discovered contractual/legal uncertainty or materially changed processing returns to the owner for a specific decision; Codex does not manufacture legal approval.

## 3 Transfer to the merge team

Only after stages 1 and 2, prepare a PR package with the exact head SHA, scope, test commands/results, claim decisions, remaining operator tasks and rollback instructions. The technical team reviews and merges the approved candidate into `dev`, using the companion handoff. A conditional handoff may be shared earlier for preparation, but must not be labelled merge-ready.

Separate code merge, production deployment, production acceptance and announcement. Hosting may auto-deploy from `dev`; check that before merge and coordinate production authorization rather than allowing an unintended deployment.

### Evidence at plan creation

The local search-discovery branch is `codex/search-discovery-2026-10-02`, with HEAD `c3eb7cd7f231a338524b26e0585ff5f8c1dc42fc` and base `e4342d6bef8d833d12e36bd8093a87c8dbe84856`. It was clean before these documentation additions. Its recorded checks passed 1,304 frontend tests and 22 discovery tests; full web build/typecheck were recorded at implementation checkpoint `d242f7429cdcd9444c1f2f3e9ff85f43144126db`. These are historical local results, not a fresh full-platform run or hosted sign-off. No remote PR state or current deployment was checked for this plan. This documentation is not committed/published by its creation.

References: [search report](../../qa-reports/search-growth/2026-10-02/FINAL-REPORT.md), [claim ledger](../growth/claim-source-ledger-2026-10-02.md), [search deployment details](search-discovery-deployment-2026-10-02.md), [reliability deployment details](chat-reliability-deployment-2026-10-01.md), [merge handoff](launch-merge-team-handoff-2026-10-03.md).
