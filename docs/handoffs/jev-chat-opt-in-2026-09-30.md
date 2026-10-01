# Jev optional chat classification — implementation handoff

## Delivery status

Delivery branch: `codex/jev-chat-opt-in-2026-09-30`, based on `239632e8d85a03f92ab6add75020efc5f713f7e9`. The PR to `dev` intentionally includes pending security/retro commits `1a7f19ac7ab86f9a48f8828b4900e75cfc9a09fb` and `239632e8d85a03f92ab6add75020efc5f713f7e9`; review the complete stack. No deployment, production enablement or real TypeSafe test occurred. Existing preview processes and chats were left untouched; real CUDOS chat checks used a separate disposable local account/runtime.

QA found and fixed two integration issues: the enforcing guard now recognizes the exact compiled system context containing the bounded Jev advisory, while retaining existing privacy labels; and renewing/removing a receipt no longer changes a pending chat's idempotency identity after a lost acknowledgement. No authorization check was relaxed. All five desks passed Jev off/on/unavailable through the pinned local runtime with synthetic providers (15 calls, 15,000 charged/used tokens, zero holds). Real CUDOS and browser evidence, including limitations, is in the linked QA report. These are not hosted or live TypeSafe acceptance.

The composer has Jev On/Off with explicit data-sharing consent. The user's confirmed choice is remembered across new chats in the same account, workspace and browser. The selected model still answers, and the selected desk/agent does not change. Jev provides only advisory topic and task labels. No tool, wallet, policy, permission or approval is delegated to Jev.

TypeSafe skill guidance determined the two independent structured Choice questions, one parallel request, named minimal state, explicit unknown options and strict distinction between probability and authorization. Impeccable/Uncodixfy kept this an extension of existing controls, not another redesign.

## Operator activation (staging first)

1. Review the complete TypeSafe data-processing agreement and applicable account terms from <https://docs.typesafe.ai/legal>. Record actual evidence of training, retention, subprocessors and transfer terms. Do not infer zero retention from product marketing or merely from having an API key.
2. Provision a separate **TypeSafe** API key through the server secret manager as `TYPESAFE_API_KEY`. A CUDOS key cannot authenticate TypeSafe. Never place it in browser variables, logs, committed files, screenshots or this handoff.
3. Only after policy approval, set `MATTERHORN_JEV_POLICY_REVIEWED_AT` to the real review's ISO timestamp. The gate requires a non-future review less than 90 days old. Then set `MATTERHORN_JEV_ENABLED=1` on an isolated staging server. These three conditions are required; none overrides each user's opt-in.
4. Use a single-instance evaluation or a verified shared atomic rate-limit store. The current store is SQLite (`MATTERHORN_WORK_RATE_LIMIT_DB`); separate replica databases multiply limits. Do not enable a replicated rollout until aggregate enforcement and provider-account spend controls are verified. Caps are 60 calls/subject/hour and 600/store/hour, current text <=4,000 characters, response <=32 KiB. This is request limiting, not monetary settlement or end-user billing.
5. Deploy matched app/server/types changes to staging. There is no schema migration and no new dependency. The model pin is `jev-1.13.0`, endpoint `https://api.typesafe.ai/v1/systemone`, provider deadline six seconds, browser deadline twelve seconds. Operator manual approval can outlast the browser deadline; fallback is ordinary chat, not implicit permission to share.
6. Confirm authenticated `GET /workspace/:id/jev` reports available without exposing credentials. Enable Jev through its consent dialog, not a forced localStorage value. Check normal member roles as well as owner access.

## Required real acceptance before customer enablement

- Test the full model → desk → conversation path on Private AI, Bittensor, Hyperliquid, Polymarket and Sui with Jev off/on. Private AI with a public provider may classify public text; Private mode/local providers must skip it. Use disposable consenting accounts and public prompts, never real secrets, private customer text or wallet signing.
- Inspect server audit events (`jev.classify`) for bounded usage, duration and result. Input/output counts belong to the classification, not the chat provider. Transport failure records usage unknown, not zero. No Jev call reserves a chat token hold. Verify provider billing against reported usage and assess latency/quality on a labelled corpus (ordinary, protocol, cross-desk, unclear and adversarial classification prompts).
- Verify only the current message text is transmitted; no history, files, saved-memory selections, system instructions, account identifiers or wallet context. The server uses privacy-history metadata locally, but does not transmit that history to TypeSafe.
- Verify new-chat/reload persistence, account/workspace separation, disabled and unconfigured zero egress, Private skips, expired policy, provider 401/429/overload, cancellation, and safe fallback. Turning off cannot undo a request already sent.
- Confirm preflight and send use the same signed advisory, preserve selected model/agent and deterministic tools, and reject tampered/expired/wrong-message/wrong-user receipts. Invalid receipt recovery: turn Jev off and retry or re-enable to classify anew; the original draft remains.
- Test manual approval/denial, limited roles, private history, two hosted accounts, actual Codex preview width, and real screen-reader/200% zoom. Fixture screenshots are not full-app acceptance. Browser-engine tests are not certification of every installed Safari/Firefox version.

## Rollback and limits

Set `MATTERHORN_JEV_ENABLED=0` and restart with the normal deployment procedure. New classification calls become unavailable; ordinary chat stays functional. In-flight signed receipts are rejected while disabled; the UI preserves the draft and users can turn Jev off and retry. Disabling or credential rotation does not delete chats/models/drafts or retract already disclosed text. Clearing consent-versioned browser storage resets only the remembered preference.

No automatic desk switching, semantic tool authorization, secret classification guarantee, live accuracy evaluation, cross-device preference sync, user subscription/billing, or migration of previous conversations is included. Existing historical-message retry paths remain ordinary chat; composer sends and follow-ups use the optional classifier. See `qa-reports/jev/2026-09-30/RESULTS.md` for exact local checks and limitations.
