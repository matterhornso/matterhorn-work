# Customer-Ready Crypto Build Plan

This plan moves Matterhorn Work from many strong individual crypto surfaces into one customer-ready product loop. The product goal is simple: a user should be able to ask ordinary chat questions about Bittensor, Hyperliquid, or Polymarket and receive safe read data, clear previews, external-signer handoffs, public receipt evidence, and watch/alert follow-through without Matterhorn ever holding signing material.

## Phase 1: Customer Readiness Smoke Pass

Goal: give operators, Hermes, Claude Code, and Codex one copy-pasteable smoke loop before a test-customer session.

Build:

- A consolidated smoke runner that orchestrates the existing Bittensor, Hyperliquid, Polymarket, receipt, readiness, and safety gates.
- A dry-run mode that prints exactly which checks will run.
- Optional live-server add-ons for read-only market routes when a local server token is available.
- Documentation that explains pass/fail evidence and customer demo red lines.

Done when:

- `pnpm test:customer-ready-crypto-smoke` passes.
- The smoke runner includes Bittensor gates, market execution safety, venue readiness, read-preview QA, receipt QA, and market live read-only smoke.
- The runner never references submit/sign/exchange routes and never asks for secrets.

## Phase 2: Unified Market Chat Router

Goal: users should not need to know which backend workflow to call. Matterhorn should route ordinary prompts across Bittensor, Hyperliquid, and Polymarket.

Build:

- A server-side `/api/crypto/chat/execute` router that detects venue and intent.
- Deterministic handoff to existing Bittensor, Hyperliquid, and Polymarket chat workflows.
- One clarification question when venue or required context is ambiguous.
- A shared result envelope with venue, intent, execution, cards, warnings, and safety status.
- Secret-shaped field rejection before any venue workflow executes.

Done when:

- Prompts like "show my TAO", "compare validators on subnet 14", "show BTC perp liquidity", and "find AI Polymarket markets" route correctly.
- Hyperliquid and Polymarket remain read/preview/external-signer only.
- `pnpm test:unified-crypto-chat` passes.
- `pnpm test:market-execution-safety-gate` remains green.

## Phase 3: Shared Cross-Venue Cards

Goal: chat responses should feel like one product instead of three separate tool stacks.

Build a reusable shared card envelope while preserving the original venue cards. The unified router returns both:

- `cards`: the original Bittensor, Hyperliquid, or Polymarket cards for existing renderers.
- `sharedCards`: customer-readable cross-venue categories for future shared UI/agent rendering.

Map venue cards into:

- Account snapshot.
- Market/subnet discovery.
- Orderbook or metagraph context.
- Quote/action preview.
- Compliance block.
- External-signer handoff.
- Public receipt/status.
- Watch alert.

Done when:

- Cards share a common customer-readable vocabulary.
- Compliance-blocked Polymarket previews have no executable price, size, or share fields.
- Market previews and handoffs always show `canSubmit: false`.
- `pnpm test:unified-crypto-chat` proves Bittensor, Hyperliquid, and Polymarket cards map into `sharedCards`.

## Phase 4: Bittensor Customer Polish

Goal: make Bittensor the flagship advanced AI interface.

Build:

- Better wallet and validator copilot summaries.
- Watch/autopilot review cards with clear next actions.
- Read-only adapter canary UX that explains preview, exact request-hash confirmation, invocation, result validation, and rollback.
- Safer "what should I do next?" guidance that is educational and non-advisory.
- A `customer_guidance` card appended to core Bittensor chat results so wallet reads, validator comparisons, watches, subnet discovery, subnet-service previews, and unsigned action previews all include one safe follow-up prompt plus explicit non-custodial boundaries.

Done when:

- Bittensor customer readiness, receipt, watch autopilot, scheduler, and adapter canary gates pass.
- The UI can be demoed to a customer without exposing debug-only concepts first.
- Focused Bittensor tests prove wallet, validator, and unsigned preview flows include guidance while preserving the original primary card.

## Phase 5: Official SDK Validation Track

Goal: validate the signing payload templates against official clients before any future execution work.

Build:

- Hyperliquid testnet validation against the official SDK for L1 order action structure, asset index, nonce, agent domain, and connection id computation.
- Polymarket testnet or client validation against `@polymarket/clob-client` for EIP-712 order domain, verifying contract, amount rounding, outcome token handling, and expiration.
- Evidence docs that say what was validated, what remains template-only, and why Matterhorn still does not sign or submit.
- A local validation-track gate that keeps template payloads marked `requiresClientValidation: true`, keeps all previews/handoffs non-submittable, and documents the exact external official-client evidence required before future execution work.

Done when:

- Signing templates are corrected where official clients differ.
- No private keys, API secrets, raw signatures, or signed payloads are accepted by Matterhorn.
- `pnpm test:market-official-sdk-validation-track` passes alongside the market execution safety gate.

## Phase 6: Agent Control Surface Polish

Goal: make Matterhorn Work usable from Codex, Claude Code, Hermes, Cursor, and other agent environments.

Build:

- One MCP install and smoke guide.
- One CLI happy path: doctor, create session, submit prompt, watch events, read/write files, run Bittensor/market chat, import public receipts.
- Customer evidence bundle that includes Bittensor and market readiness evidence.
- A final Hermes usability/security test prompt that points to the exact docs and commands.

Done when:

- An external agent can run Matterhorn Work end to end from the command line without reading the codebase.
- Customer-ready evidence is reproducible and free of secret-shaped fields.
