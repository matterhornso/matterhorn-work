# Grok Bot Reference Audit

Captured: 2026-09-03

Primary references:

- <https://docs.x.ai/grok-bot/overview>
- <https://docs.x.ai/grok-bot/get-started>
- <https://docs.x.ai/grok-bot/files-and-results>
- <https://docs.x.ai/grok-bot/skills-routines-and-automations>
- <https://docs.x.ai/grok-bot/approvals-security-and-privacy>

## Scope and limitation

This is a product-pattern audit of xAI's public Grok Bot documentation, not a security endorsement or authenticated product test. No Grok Bot account, private workspace, connector, computer, wallet, or paid plan was used. Claims below are limited to the cited public documentation as captured on the date above.

## Patterns to adopt

1. **One named teammate.** A coworker should feel like one durable owner of a job, not a temporary mode or a collection of tools.
2. **Start in chat.** A user gives an outcome first. Matterhorn suggests a focused role and requests access only when the work needs it; no workflow builder is required.
3. **One strong handoff.** Encourage five plain inputs: outcome, sources, constraints, deliverable, and the point where the coworker must stop for review.
4. **Visible progress and return points.** Background work should update the same conversation and return only with a result, a blocker, or a concrete approval request.
5. **Reviewable results.** Consequential output separates sourced facts, inference, completed work, work awaiting approval, and unresolved questions.
6. **Practice before routine.** A successful one-time task becomes a reusable process only after the user reviews it and a safe test run passes.
7. **Explicit stale-data behavior.** Scheduled work names its source, expected output, approval boundary, and what to do when data is unavailable or stale.

## Crypto changes Matterhorn must make

Grok Bot's persistent computer is a useful usability reference but is not the right authority boundary for crypto. Matterhorn uses a narrower path:

```text
one named coworker + one user outcome
  → explicit Agent Files, Memory, and certified-app grant
  → privacy preflight and exact run budget
  → typed read/watch result or deterministic preparation
  → exact, expiring wallet review
  → connected wallet signs and submits
  → public receipt reconciliation
  → private receipt and optional encrypted Walrus proof
```

Each Matterhorn coworker therefore needs:

- its own owner/workspace/profile/revision security scope rather than an account-shared login surface;
- an explicit, revisioned resource grant instead of ambient access to every file or session;
- certified typed adapters instead of arbitrary browser or terminal control for financial workflows;
- deterministic policy and capability checks instead of treating a model-based review as authorization;
- a connected-wallet-only final step that the agent cannot automate away;
- a concise result contract: Facts, Inference, Done, Needs approval, and Open questions;
- pause, revoke, deletion, receipt, and stale-source states that remain visible in the same chat; and
- a verified private-provider option for approved private context rather than requiring all work to use a non-private cloud data setting.

## Patterns not to copy

- Do not give a coworker a general cloud computer, terminal, browser session, or cross-app login as crypto authority.
- Do not share one coworker's files, connections, wallet context, or approvals with another coworker by default.
- Do not let a prompt, model-based reviewer, learned routine, website, connector, or MCP response grant or broaden permission.
- Do not permit an `allow once` control to sign, relay, broadcast, or submit a transaction through the agent runtime.
- Do not ask users to enter passwords, one-time codes, seed phrases, private keys, raw signatures, or wallet exports into chat.
- Do not turn an unverified successful task into an unattended routine.
- Do not imply privacy when the selected provider proof is missing, stale, or incompatible with the requested data.

## Matterhorn product contract

The reference is considered implemented only when all of the following remain true:

1. Home starts from one outcome and offers a focused named coworker.
2. The selected coworker persists across chat reloads without gaining ambient authority.
3. Access is granted per exact file, memory version, certified connection, action, and network.
4. The result uses the compact review structure when a section is relevant.
5. Watches and routines are read-only until an independent connected-wallet review is created from fresh exact terms.
6. Private mode is shown only with a current server-verified private model proof.
7. A coworker can never sign, submit, relay, broadcast, or hold wallet keys.
