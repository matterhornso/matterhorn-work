# Bittensor Advanced AI Interface Plan

Matterhorn Work's Bittensor direction is to make Bittensor usable through plain chat while keeping the system non-custodial, source-aware, and honest about uncertainty.

For the current implementation stocktake and remaining build sequence, see [Matterhorn Work Bittensor: Built vs Remaining Vision](./bittensor-built-vs-remaining-vision.md).

The advanced interface should feel like a Bittensor analyst, wallet copilot, staking planner, subnet operator, and safety officer in one workflow. Chat remains the primary interface. Cards, APIs, MCP tools, and CLI commands exist to make the chat decisions inspectable and repeatable.

## Phase 1: Intelligence Engine

Goal: turn existing subnet, wallet, metagraph, validator, and capability data into explainable intelligence reports.

Build:

- Subnet intelligence reports with score, rating, provider quality, mechanism-awareness status, market context, metagraph context, validator concentration, capability readiness, warnings, and next questions.
- Wallet intelligence reports with free TAO, stake value, subnet/validator concentration, slippage exposure, stale-data risk, largest positions, warnings, and next questions.
- Chat behavior for prompts like:
  - `analyze subnet 14`
  - `what is the risk on subnet 14?`
  - `analyze my TAO exposure`
  - `what are the weak spots in my Bittensor wallet?`
- Server APIs and MCP tools so Codex, Claude, and Hermes can request the same intelligence output.

Safety:

- Public data only.
- No seed phrases, mnemonics, private keys, wallet exports, or signing material.
- Every report labels source and freshness.
- Scores are inspection confidence and risk context, not financial advice.

## Phase 2: Wallet Risk And Portfolio Copilot

Goal: make `show my TAO` become a full portfolio explanation.

Build:

- Wallet exposure dashboard through chat.
- Concentration analysis by subnet, validator hotkey, and slippage bucket.
- Inactive/stale/missing-validator warnings where provider data allows.
- "What changed since last time?" comparisons using public snapshots.
- Suggested watch creation from wallet findings.

Deliverable prompt:

```text
Explain my Bittensor wallet, what I am exposed to, and what I should monitor.
```

Current implementation:

- Wallet reads and wallet intelligence requests now maintain an in-memory public SS58 baseline for the active server process.
- Follow-up prompts such as `what changed in my wallet since last time?` compare the current watch-only wallet snapshot against the prior baseline.
- Change cards show free TAO, staked TAO, estimated value, position-count, subnet, validator, top-position, freshness, and source deltas.
- No persistence, custody, signing, seed import, private keys, mnemonics, wallet exports, or transaction broadcast are involved.

## Phase 3: Advanced Staking Planner

Goal: let users describe allocation goals and receive safe, unsigned staking plans.

Build:

- Goal-driven allocation planner.
- Strategy modes: safety, balanced, growth, yield-aware, low-slippage.
- What-if previews across candidate subnets and validators.
- Dynamic TAO price/slippage/alpha checks where live data exists.
- Multi-step action bundles that remain unsigned until external signing.

Deliverable prompt:

```text
I have 10 TAO. Build a low-risk Bittensor staking plan for inference and compute exposure.
```

Current implementation:

- Chat and API can draft deterministic staking plans from a plain-English goal, TAO amount, and strategy.
- Plans split exposure across discovered subnet candidates, attach visible validator candidates where available, and return unsigned previews only.
- Plan cards include assumptions, warnings, watch suggestions, and next actions so the user can monitor before signing.

## Phase 4: Non-Custodial Signing Gateway

Goal: move safely from unsigned preview to externally signed execution.

Build:

- External signing adapters for browser-injected Substrate wallets where available.
- Desktop/CLI signing handoff with canonical payload JSON, checksum, expiry, and receipt capture.
- Submit externally signed payloads through the Subtensor sidecar.
- Transaction status, finality, explorer links, and post-action wallet diff.

Non-goal:

- No seed import or local custody.

Current implementation:

- Signing remains external-only.
- Unsigned previews can be turned into checksumed handoff JSON with expiry and plain-English consequences.
- Handoffs and submit attempts now create signing receipts with payload hash, signature hash, signer address, status, explorer fields, warnings, and next safe actions.
- The sidecar submit path remains gated by configured external signed payloads; Matterhorn still never stores or requests seed phrases, private keys, mnemonics, keyfiles, or SURI material.

## Phase 5: Subnet Service Marketplace

Goal: allow chat to use supported subnet services, not only explain and stake around them.

Build:

- Adapter registry with category, auth, cost model, request schema, result schema, rate limits, and safety notes.
- First adapters for inference, creative/media, data/search, compute, and agent tooling.
- Cost/auth review card before service calls.
- Unsupported-adapter fallback for every subnet.

Deliverable prompt:

```text
Use the best Bittensor subnet available to help with this task.
```

Current implementation:

- Chat-first subnet use now prepares a service review card before any configured adapter call.
- The preview shows adapter support, auth requirement, cost model, request context, request hash, schemas, warnings, and confirmation action.
- Direct adapter invocation remains a lower-level explicit API path; ordinary chat does not silently call service adapters.
- Explicit invoke calls can pass the reviewed request hash so Matterhorn rejects mismatched service-call confirmations.
- Subnet service adapter contracts now define the safe interface, unsupported behavior, privacy promises, and validation gate before real direct subnet execution is added.
- Preview and invocation paths are contract-gated, and the reusable contract harness covers safe configured, missing-adapter, and unsafe-schema fixtures.

## Phase 6: Autonomous Monitoring And Bittensor Agent Ops

Goal: make Matterhorn continuously useful after the user leaves chat.

Build:

- Scheduled watch evaluations.
- Alerts for wallet concentration, validator disappearance, emissions changes, stale provider data, slippage changes, adapter failures, and signing receipts.
- Agent-readable event streams for Bittensor state changes.
- Runbooks for operators using Matterhorn through MCP/CLI.

Deliverable prompt:

```text
Watch my Bittensor wallet and tell me when something important changes.
```

Current implementation:

- Chat can create watches from wallet/subnet/validator intelligence suggestions.
- Watches persist validator hotkey, wallet scope, threshold, reason, and last-alert timestamp where available.
- Watch checks return actionable alert prompts that can send the user back into subnet analysis, wallet intelligence, or validator deep dives.
- Watch evaluations now expose an alert key, notification intent, and multiple copilot actions so chat, MCP clients, and future UI alerts can route the user into the safest next step.
- `matterhorn_bittensor_watch_digest` gives MCP agents a compact alert queue with watch ids, alert keys, notification intents, and next prompts/actions.
- `matterhorn_bittensor_act_on_watch_alert` lets MCP agents select one alert and run its suggested public-data Bittensor chat prompt without signing, custody, or broadcast.
- Server watch cards expose the same notification intent in card items and action payloads so UI, CLI, and MCP operators can route wallet, validator, subnet, emissions, and slippage alerts consistently.

## Cross-Cutting: Upstream OpenWork Update Intake

Goal: keep Matterhorn Work current with useful OpenWork upstream improvements without losing Matterhorn-specific product, branding, Bittensor, and agent-control decisions.

Build:

- Maintain a repeatable upstream checker and sync playbook for OpenWork updates.
- Review upstream changes against Matterhorn conflict zones: branding, env/header aliases, CLI/packaging names, OpenCode abstraction, agent control surface, Bittensor safety, and release automation.
- Split useful upstream improvements into focused Matterhorn patches instead of auto-merging broad upstream ranges.
- Run the upstream sync check beside Bittensor and agent-control verification when relevant.

Current implementation:

- `docs/upstream-openwork-sync.md` defines the sync policy, conflict zones, and no-secret merge rules.
- `pnpm upstream:openwork:check` provides the repeatable intake command for operators.
- The agent-control coverage matrix tracks upstream OpenWork intake as a first-class operator workflow.

## Build Order

1. Phase 1 Intelligence Engine.
2. Phase 2 Wallet Risk And Portfolio Copilot.
3. Phase 3 Advanced Staking Planner.
4. Phase 4 Non-Custodial Signing Gateway.
5. Phase 5 Subnet Service Marketplace.
6. Phase 6 Autonomous Monitoring And Bittensor Agent Ops.
7. Cross-cutting upstream OpenWork update intake continues during every phase.

This order keeps the product useful at every step and avoids adding action execution before the intelligence and safety layers are mature.
