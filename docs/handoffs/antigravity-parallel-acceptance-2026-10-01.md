# Antigravity assignment: independent Matterhorn Desks release acceptance

## Your role and boundaries

You are joining a project with no prior context. Independently audit the public-beta user journey and produce reproducible acceptance evidence. Codex owns PR #1030 remediation, memory code, chat/runtime/accounting changes, CI triage and its merge. Your initial lane is **read-only product/security acceptance, test design and documentation**, not another implementation of those systems. This handoff does not authorize deployment, production configuration changes, paid operations or access to customer data.

Use a separate clone or worktree and branch `antigravity/hosted-acceptance-2026-10-01`. Do not switch branches, stash, clean files or restart processes in Codex's checkout. Do not use its preview runtime or existing chats as disposable fixtures. Never copy its environment files, credentials or local account data into your checkout. Do not merge or push changes to `dev`. If a defect needs application changes, return a narrowly scoped proposed fix and request ownership before editing it. After the owner assigns it to you, use a separate PR with regression tests.

## Product context

- Product: **Matterhorn Desks**, a public-beta, Web3-native agent workspace. Public beta is the intended release model; actual signup availability must be observed, not assumed.
- Repository: https://github.com/matterhornso/matterhorn-work ; integration branch: `dev`.
- Canonical hosted app: https://desks.matterhorn.so . The older `matterhorn-desks-canary.vercel.app` hostname is not proof of the canonical deployment's state.
- Five desks, in order: Private AI, Bittensor, Hyperliquid, Polymarket, Sui. A wallet-support badge or successful navigation is not proof an agent works.
- Core journey: normal sign-in → persisted model selection → desk → editable starter or prompt → agent/tool execution → useful answer with source, network, freshness and limitations where applicable.
- Selected provider/model answers the chat. CUDOS/ASI is an existing integration; ASI1 and ASI1 Mini are different choices, not interchangeable fallbacks. Mini previously returned HTTP 429; reverify if available.
- Jev/TypeSafe is optional classification before the selected model answers. It does not replace that model or grant tool, wallet or data permissions. Users explicitly opt in and can remember the choice across new chats, disable it, or stop classification. Missing TypeSafe credentials/policy is a genuine blocker to live Jev acceptance, not permission to bypass it. Ordinary chat must remain usable with Jev off.
- The interface has a retro/neobrutalist visual system with light/dark preferences. Preserve the Matterhorn logo, truthful copy, explicit consent and transaction terms.
- Memory is explicit, user-controlled saved context, not an unrestricted hidden transcript store. The filesystem vault must retain isolation, deletion and restricted permissions; permissions alone do not prove encryption. Notes, chats, backups, exports and provider-held copies have separate lifecycles.
- STM credential tooling exists but is separately gated. Do not activate it, migrate secrets or broaden its rollout as part of this audit.

## Establish your baseline before testing

Read `AGENTS.md` and applicable nested instructions in your own checkout. Use pnpm and repository-pinned tool versions; inspect scripts before running them. Package names can retain OpenWork/OpenCode compatibility terms. Read the following files from the checked-out revision:

1. `docs/handoffs/chat-reliability-deployment-2026-10-01.md`
2. `qa-reports/reliability/2026-09-30/RESULTS.md`
3. `docs/architecture/jev-integration-plan.md`
4. `docs/memory/legacy-deletion-cleanup.md` (understand only; do not apply cleanup)
5. `apps/app/package.json`, `apps/server/package.json`, root `package.json` and the relevant CI workflows.

Code map: `apps/app` is the frontend, `apps/server` the API/control plane, `packages/matterhorn-memory-vault` the memory store. Follow actual imports for runtime plugins, protocol services and agent definitions rather than inferring architecture from directory names. Secrets belong in approved server-side secret stores, never browser bundles or reports.

PR #1029 was merged into `dev` as `5e4b5516c3683410923f5b8d789418707a448485`. PR #1030 is the follow-on reliability/privacy work. At this handoff's creation it was awaiting Codex's remediation of two CodeQL alerts; its status can change. Verify GitHub and record your exact checkout SHA. Do not assume an open PR is deployed, or that a successful CodeQL workflow means the separate code-scanning gate passed.

Before #1030 merges, audit the existing hosted deployment and prepare the acceptance matrix without claiming it tests #1030. Once merged, update only your clean isolated checkout, record the merge SHA and run local tests as appropriate. Hosted acceptance of the release must wait until the operator has deployed that exact coordinated web/API/runtime candidate.

## Access and safety

Ask the owner for two controlled test accounts and their inbox access through the normal secure credential channel. Do not invent working credentials, ask for passwords in a public report, reset real users' passwords, bypass verification, obtain admin tokens, or enable signup. Use only your assigned accounts and their disposable data. If no access is supplied, complete public-page inspection and code/test review, recording authenticated coverage as blocked.

Use public-chain reads only, no signing, approval of transactions, funds transfers, trades or paid-resource creation. A wallet rejection or unsigned preview may be tested only with an explicitly approved test wallet and no submission. Never send production workspace content to Jev or another provider as a test. Any controlled failure injection belongs in an isolated local fixture, not production. Keep real-provider calls bounded and stop on throttling; no automatic model substitution or retry storm.

## Workstream 1: deployment and account readiness

1. Record canonical URL, UTC time, observed web/API build identifiers and test checkout SHA. Verify that deployment metadata agrees with operator artifact records. An HTTP 200 alone is not acceptance.
2. Inspect public Security, Privacy, Terms and Support links, Back to app, refresh/deep links, loading and network-error copy. Record misleading or dead actions.
3. With authorized accounts, verify registration availability, actual email receipt and verification, sign-in, password reset, expired/reused recovery links, logout and session revocation. Use only your controlled mailboxes; do not infer email delivery from an API response.
4. Request operator evidence for TLS/proxy/cookie routing, guarded runtime enforcement, encrypted backup storage, access policy, key ownership and a successful isolated restore. Do not change these systems yourself. Mark missing evidence unverified rather than declaring them secure.

## Workstream 2: every desk and Jev

For each of the five desks, record model/provider, consent state, run/session identifiers (content-free where possible), final status, source/tool outcome, limitations, and usage/allowance before and after. Suggested read-only tasks:

| Desk | Representative task | Evidence to check |
| --- | --- | --- |
| Private AI | Explain a harmless concept in a short answer | Actual selected-model response; no unsupported private/local-processing claim |
| Bittensor | Read public emissions/activity for an explicitly selected subnet | Successful live-chain service read; subnet/network, units, time and stale-data warning |
| Hyperliquid | Read one public market's order book/funding | Market identity, book/funding timestamp and limitations; compare prose to tool warnings |
| Polymarket | Read an exact public market selected by its identifier | Correct market, source, liquidity/price and freshness; no invented substitute |
| Sui | Read an explicit public object/address on a named network | Correct network, source and returned object/balance; no fabricated omitted network |

If the selected model completes without a required live read, the read is **not passed**. Prior local runs completed all five representative tasks, but that does not certify every action or the hosted deployment. Known follow-up risks include a Hyperliquid answer incorrectly saying “no warnings” and incomplete source/freshness fields in some Polymarket/Sui receipts. Reproduce before classifying as current defects.

Test Jev off on every desk. If operator-approved live Jev is available, test explicit opt-in, remembered preference in a new chat, per-chat disable, Stop during classification, unavailable service and late classification results. Confirm the selected model still answers and Jev never widens permissions. Distinguish browser observation from server-side proof of no external call; request redacted operator traces when necessary. Do not mark fixture classifications as live TypeSafe results.

Check failed submission, incomplete answer, rate limit, Stop, retry and answer-only continuation. Drafts must survive recoverable failures; continuation must not replay tools or double-charge. Where receipts/allowance are visible, reconcile totals and terminal reserved/pending usage. Do not claim a restart/accounting test passed without access to the authorized isolated runtime needed to demonstrate it.

## Workstream 3: isolation, data and UI

- Account A creates a harmless note and explicitly confirmed memory. Verify expected use in context, edit, deletion and visible save/error states. Never seed sensitive or real customer content.
- Account B must not see A's sessions, memory, notes or drafts. Exercise normal logout/account switching. Test direct links only to artifacts you created with A; do not enumerate other users' data or bypass permission controls.
- Verify browser state does not restore A's content for B. Do not dump browser storage, cookies or tokens into reports.
- Inspect available integrations: Connected, Needs setup and Unavailable must reflect actual capability. Missing credentials must not produce a working badge.
- Test model → desk → conversation at 390px mobile, tablet, desktop and actual preview width; light/dark, keyboard/focus, labelled buttons, 200% zoom, overflow and composer overlap. Check navigation never flashes Home, drafts survive model changes, and public-page Back to app works without reload.
- Use actual Chromium, Safari and Firefox when installed. Missing environments are **unverified**, not equivalent to Chromium with a different viewport.

## Evidence and deliverables

Create only your assigned evidence/docs under `qa-reports/antigravity/2026-10-01/`. Use sanitized screenshots: no emails, tokens, account credentials, private prompts or customer data. Do not commit large/raw logs, secrets, local databases or unreviewed browser storage. Include:

1. `BASELINE.md`: exact source/deployed identifiers, environments, accounts identified by non-secret aliases, allowed operations and access limitations.
2. `ACCEPTANCE.md`: matrix of feature × environment × outcome with Passed / Failed / Blocked / Unverified and linked evidence. Clearly separate local fixture, local real-provider and hosted results.
3. `FINDINGS.md`: severity, exact steps, expected/actual, affected SHA, evidence, suspected cause, smallest proposed fix, suggested owner and regression test. Do not duplicate known findings without new evidence.
4. `RELEASE-DECISION.md`: launch/no-launch recommendation, blocking evidence, operator actions, optional disabled features and rollback prerequisites. No “100% ready” claim based on partial coverage.

Return a concise summary plus file paths to the owner. You may prepare a documentation/test-only PR if explicitly asked to publish it; do not merge or deploy. Coordinate any implementation ownership before touching shared application files.

## Launch stop conditions

Stop recommending launch when deployed artifacts disagree, guard enforcement is missing, account isolation fails, usage double-charges/strands holds, a required enabled desk cannot perform its supported read, or registration/recovery/backup proof is absent. Jev and Mini can remain honestly unavailable only by explicit product/operator decision. A successful local test or CI check is not hosted acceptance.
