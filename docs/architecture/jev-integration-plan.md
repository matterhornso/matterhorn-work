# Jev integration into Matterhorn agents

## Scope and current status

This plan is for Matterhorn engineering. It proposes adding Jev as a bounded recommendation service alongside the existing agents, not replacing chat models or the guarded execution runtime.

As of 30 September 2026, the TypeSafe development skill is installed for Codex and recorded in `skills-lock.json`. An optional chat-classification slice is implemented locally on `codex/jev-chat-opt-in-2026-09-30`. No real TypeSafe request, credential configuration, live evaluation, push or deployment has been performed. The feature remains server-disabled by default. See [implementation and activation handoff](../handoffs/jev-chat-opt-in-2026-09-30.md).

## Implemented user-approved slice

The user asked to enable/disable Jev from the chat composer and explicitly confirmed remembering the choice across new chats. This first slice classifies only **topic** and **task type**, then adds bounded advisory context to the selected model's original message. It does not recommend an automatic desk switch, choose a model, or modify deterministic tool routing. The broader recommendation stages below remain future work.

- Explicit consent before enabling; remembered per account/workspace/browser, versioned by the disclosure contract. Clearing browser storage resets it. This is not cross-device synchronization.
- Only eligible current composer text, at most 4,000 characters, reaches TypeSafe. No stored history, files, memory, wallet context, credentials or system prompts are included. Private/local modes, recognized secrets/transaction intent and private or unverified session history are skipped. Detection is not a guarantee that arbitrary text contains no sensitive information.
- Pin `jev-1.13.0`, ask the two independent Choice questions together, validate bounded responses, use a six-second provider timeout, and never automatically retry uncertain billable classification.
- HMAC receipts bind account, workspace, session, original text hash and selected model for five minutes. They carry only validated fixed-option judgments, never executable authority. Receipt signing uses a domain-separated key derived from the TypeSafe credential; rotation invalidates outstanding receipts. Receipts are not persisted with drafts.
- Both canonical preflight and dispatch consume the identical advisory context. The existing guarded gateway separately binds agent, policy and tool capabilities. The compatibility proxy rejects Jev receipts rather than silently ignoring them. No selected-agent or permission change uses Jev output, so the broader routing/capability receipt design below is not introduced in this slice.
- Limits: 60 calls per subject/hour and 600 per configured rate-limit store/hour. Actual returned usage is audited separately from chat quota, with unknown usage marked unknown on transport failure. These limits do not constitute a provider-account-wide monetary cap.
- Existing chat execution, approval, accounting and selected model remain authoritative. Provider failure/skipping leaves normal chat available. Stop cancels pending classification before model submission; disabling discards a pending result and continues ordinary chat.

TypeSafe's System One API supplies structured judgments. Its Choice primitive returns a selected option, probabilities, and confidence. This suits a recommendation among known options; it does not generate the user's conversational answer. See the [HTTP API](https://docs.typesafe.ai/api) and [Choice reference](https://docs.typesafe.ai/primitives/choice).

## Recommended first use

Start with desk and tool-family recommendations for ambiguous general-agent requests. Keep explicit user-selected desks authoritative. Include Private AI, Bittensor, Hyperliquid, Polymarket, Sui, a cross-desk outcome, and a no-match or clarification outcome. Do not force multi-desk requests into a single crypto desk.

Later candidates are ranking already-authorized tools and checking claims against supplied evidence. Neither should enter the first slice: each needs its own data-minimization policy, evaluations, and failure behavior. Citation judgment must never substitute for deterministic source availability and freshness checks.

The existing `apps/server/src/agent-tool-routing.ts` narrows general-agent crypto tools using deterministic intent matching. It leaves custom agents, attachments, ambiguous requests, and broader workspace tasks to existing behavior. Preserve these cases as regression fixtures rather than replacing the function blindly.

## Integration boundaries

The server currently calls `buildMatterhornGeneralCryptoToolProfile` from three paths in `apps/server/src/server.ts`: the OpenCode prompt compatibility proxy, message privacy preflight, and message submission. Centralize the recommendation contract before changing those paths. A network classifier must not be inserted ahead of provider consent merely because local routing currently runs there.

Proposed flow:

1. Authenticate the caller and resolve workspace, session, execution mode, selected agent, and authoritative capabilities.
2. Check feature eligibility and permission to disclose the specific routing input to TypeSafe. Existing consent to another chat provider is not sufficient.
3. Request one bounded recommendation with a deadline and validated response schema.
4. Treat the recommendation as untrusted input. Apply the existing deterministic tool restrictions, role permissions, and execution-mode rules.
5. Bind any accepted recommendation to the exact request and authorization context before executing through the existing guarded runtime.

Do not rerun classification independently between approved preflight and submission. Bind the server-owned decision to workspace, session, request digest, agent identity, capability version, model/question version, and expiry. Reject stale or mismatched decisions; never trust a client-supplied recommended desk or tool profile as authority. Define equivalent behavior for the compatibility proxy rather than leaving an alternate path.

## Delivery stages

### Stage 1 Development integration and offline evaluation

- Add a small server-only client for `POST https://api.typesafe.ai/v1/systemone`, using the documented bearer authentication and typed Choice schema. Select and pin a supported model after verifying current model documentation; do not silently adopt an unversioned latest model for release.
- Use named JSON state containing only the minimum eligible request text and authorized candidate descriptions. Do not include attachments, conversation history, memory, STM secrets, wallet signing material, or system prompts in the initial slice.
- Validate option membership, finite probability ranges, confidence, usage counts, and the distribution before consuming a response. Cap request and response size and apply cancellation and a bounded timeout. Reject redirects to prevent credential forwarding.
- Keep the feature disabled by default. Configuration and possession of a key alone must not authorize data disclosure. Private/local-only requests remain outside this feature.
- Use fixture responses and a representative labeled corpus first. Cover all five desks, cross-desk requests, ordinary chat, workspace tasks, ambiguous follow-ups, explicit desk selection, and injection attempts.
- Measure agreement with labels, incorrect recommendations, clarification frequency, and regressions against current routing. No threshold is considered validated from mocked outputs.

### Stage 2 Consented live evaluation without execution changes

- Provision a separate server-side TypeSafe key through the operator's secret store. A CUDOS key is not a TypeSafe credential. Never expose the key to the browser or commit it.
- Review provider training, retention, subprocessors, and data-transfer terms. Record the approved policy and any user-facing disclosure or consent required before sending data. Do not mark policy verified without evidence.
- Use disposable evaluation accounts and explicitly permitted test prompts. Live evaluation must not copy ordinary customer traffic by default.
- Record actual returned model, input/output usage, latency, failure category, question version, and evaluation outcome without recording raw prompts or credentials in general logs.
- Give the routing request a bounded operator budget. Keep its usage separate from existing chat usage and avoid user charging until pricing and settlement behavior are explicitly implemented. Do not create or strand the existing 20,000-token chat hold for a routing-only request.
- Compare recommendations to current behavior without changing agent selection or execution. Handle 401, 422, 429, overload, timeout, malformed output, and cancellation without breaking normal chat. Do not automatically retry a billable request whose completion is uncertain.

### Stage 3 User visible recommendations

- Only after the live evaluation passes agreed thresholds, offer a desk recommendation for eligible general requests. Require a user action to switch desks; preserve the draft and conversation.
- A low-confidence, no-match, unavailable, or invalid result leaves the existing flow intact and can ask for clarification where useful. Never advertise an unavailable desk as ready based on Jev output.
- Explicit desk selection, answer-only mode, plan mode, collaborator restrictions, and existing tool denials remain authoritative.
- If later using Jev to narrow available tools, intersect with all existing restrictions and test preflight/submission/proxy parity. It must never broaden permissions, authorize a transaction, or approve a tool call.

### Stage 4 Release and rollback

- Run server regression tests, typecheck/build, privacy and safety gates, accounting failure-path tests, and two-account isolation tests.
- Complete real app requests on Private AI, Bittensor, Hyperliquid, Polymarket, and Sui with the feature off and on. Use read-only public-chain work; no signing or real-fund transactions.
- Verify the displayed chat answer still comes from the selected chat provider and that recommendations do not mutate a conversation's chosen agent without user confirmation.
- Publish a separate reviewable PR and handoff. Verify hosted acceptance after an explicitly approved deployment; local evidence is not hosted proof.
- Disabling the feature restores the previous routing behavior without changing persisted chats, drafts, model choices, or permissions. No database migration is expected; revisit this assumption if durable decision receipts require a schema change.

## Acceptance and operating decisions

Before enabling customer use, require all of the following:

- No unconsented provider egress; test disabled, missing-key, denied-consent, and private-mode paths with a network spy proving zero requests.
- No permission widening, no selected-agent override, no cross-tenant decision reuse, and no changed request accepted using an old decision.
- Accurate provider usage recording, no duplicate settlement, no leaked holds, and no credential or raw-prompt logging.
- Measured recommendation quality and latency on a representative corpus. Set thresholds and the request budget from those results, not cookbook examples.
- Working fallback on network, schema, credential, and rate-limit failures; conversation drafts survive all recoverable failures.
- A release owner approves provider policy, key provisioning, budget, evaluation criteria, and hosted rollout.

Confidence reflects the concentration of the returned distribution, not permission or guaranteed correctness. The [confidence documentation](https://docs.typesafe.ai/confidence) explains why thresholds need domain evaluation. The [function-calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling) is a useful API pattern, not a reason to let inferred intent execute financial actions.

## Next implementation task

Review the default-off chat slice and complete consented live evaluation before enabling it for customer traffic. The immediate dependencies are a securely configured **TypeSafe** API key (not CUDOS), an approved data-handling policy, provider spend controls, and staging acceptance in the full app. Local fixture tests validate the integration contract, not Jev's classification accuracy or hosted operation.
