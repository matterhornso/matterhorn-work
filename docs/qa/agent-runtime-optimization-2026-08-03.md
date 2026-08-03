# Matterhorn Desks Agent Runtime Optimization

**Review date:** 2026-08-03
**Scope:** prompt assembly, execution modes, reasoning effort, context latency, provider latency, action completion, answer quality, and privacy-safe runtime telemetry

## Outcome

The agent path now prioritizes the shortest safe route from a user's intent to a useful answer or typed review artifact. The implementation reduces repeated context, bounds optional lookups, keeps mode behavior deterministic, and records first visible output without retaining prompt content.

The focused runtime contract completed with **34 passing tests and no failures**.

## Execution Modes

| Mode | Intended behavior | Tool policy | Response behavior |
| --- | --- | --- | --- |
| Discuss | Explain and inspect existing context | No edits or action tools | Direct answer, assumptions surfaced, no hidden reasoning transcript |
| Plan | Research and produce an actionable plan | Read-only tools only | Ordered plan, dependencies and blockers, explicit handoff to Work |
| Work | Complete approved work within safety limits | Agent-specific allowlist | Act first when safe, summarize result and evidence, request approval only at protected boundaries |

Mode selection is persisted per workspace session. Unsupported or conflicting reasoning values are rejected server-side. Specialized desk tool access remains deny-by-default in every mode.

## Fast Action Path

Protocol desks now share these action rules:

1. Convert natural-language requests into a typed intent.
2. Reuse context already available in the session instead of asking for it again.
3. Resolve public symbols, markets, and validators through protocol tools when possible.
4. Ask one batched clarification only for fields that cannot be resolved or safely defaulted.
5. Offer no more than three choices when ambiguity remains.
6. Call the final bounded action tool before writing a prose completion claim.
7. Return a typed review artifact with the destination, amount or size, network, constraints, and completion surface.
8. Never answer with a generic simulated-completion message for a real user request.

Hyperliquid supports the controlled review, wallet-signature, and submission path. Polymarket produces an eligible, compliance-checked external submission handoff. Bittensor produces unsigned transaction material for the user's external signer.

## Latency Work

- Specialized agents receive a compact safety overlay; the general router receives the full workspace prompt.
- Environment and workflow context are loaded concurrently with 400 ms deadlines.
- Optional wallet and protocol context is bounded and failure tolerant.
- Interactive Bittensor provider reads use a 750 ms deadline, request coalescing, and bounded response processing.
- Draft parts and optional context are assembled concurrently.
- Duplicate session context and untrusted wallet metadata are sanitized and bounded before prompt dispatch.

These are enforced implementation budgets, not measured production service-level claims.

## Reasoning Effort

Reasoning effort is transported end-to-end for compatible providers and normalized to supported values. It changes the provider's compute effort; it does not expose private chain-of-thought. The UI modes continue to control capabilities independently from reasoning effort.

Recommended defaults:

- Discuss: low or medium
- Plan: medium or high for complex research
- Work: medium by default; high only for genuinely complex work
- Protocol action preparation: low or medium after deterministic tool results are available

This avoids spending model time on decisions that protocol validators and typed tools can make more reliably.

## Answer Quality Controls

- Desk prompts require factual completion claims to be backed by typed tool results.
- Unsupported facts, submission claims, or execution claims are rejected by deterministic contracts.
- Public wallet context is shared only with desks that need it.
- System prompts instruct agents not to reveal or narrate hidden reasoning.
- Action prompts prefer useful results over setup exposition and avoid requesting raw URLs or identifiers when they can be resolved.

## Runtime Measurements

The app now records two privacy-safe events:

- Prompt dispatch: dispatch timing and selected mode/agent
- First visible assistant output: elapsed milliseconds, selected mode, and agent

Synthetic status text does not count as first output. Prompt and response content are never included in these timing events.

Suggested production dashboards should report p50/p95 by mode, agent, model, and success state for:

- dispatch-to-first-visible-output
- dispatch-to-typed-action-artifact
- end-to-end completion
- clarification frequency
- tool failure and timeout rate
- action validation failure rate

Targets should be set after collecting representative production measurements; none are fabricated in this report.

## Verification Evidence

```text
bun test apps/app/tests/agent-runtime-performance.test.ts \
  apps/app/tests/session-sync-permissions.test.ts \
  apps/app/tests/execution-mode-contract.test.ts \
  apps/app/tests/desk-agent-architecture.test.ts

34 pass, 0 fail, 252 assertions
```

The suite verifies compact overlays, bounded lookup deadlines, privacy-safe first-output timing, mode persistence and enforcement, deny-by-default tool policies, typed review cards, fast action behavior, bounded context, and synchronized desk manifests.

The complete `pnpm test:matterhorn-platform-safety` gate also passed all 10 stages after these changes.

## Remaining Live Acceptance

1. Measure first-output and action-artifact latency against the production model provider.
2. Run representative natural-language tasks for each desk and record clarification count, answer correctness, and time to review artifact.
3. Confirm browser wallet review, cancellation, wrong-network recovery, and submission timing with controlled test accounts.
4. Tune model selection and reasoning defaults only from those measurements; do not trade away action validation or wallet approval for latency.
