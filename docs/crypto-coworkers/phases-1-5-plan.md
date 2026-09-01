# Guarded Crypto Coworkers: Phases 1–5

Status: active delivery goal

Reference patterns: [Monid reference audit](./monid-reference-audit.md)

## Execution status

- Phase 0 contracts, fail-closed flags, threat model, and offline evidence encryption: complete.
- Phase 1 signed manifest registry and static conformance gate: complete.
- Phase 1 durable manifest/certification history, atomic revocation, and policy-version invalidation: complete.
- Phase 1 tenant-scoped connection grants with opaque vault/wallet references and immediate certification revocation: complete.
- Phase 1 adapter-router core, closed schema validation, runtime DNS/egress checks, typed output projection, untrusted-data quarantine, timeout handling, usage reservation/reconciliation, and circuit breaking: complete and backend-only.
- Phase 1 trusted JSON-over-HTTPS transport foundation with DNS address pinning, TLS hostname verification, peer verification, redirect/content/size bounds, and server-side credential resolution: complete and backend-only.
- Phase 1 guarded-runtime authorization bridge with explicit certified-action-to-tool bindings, exact hash-bound single-use capabilities, durable reservations, restart-safe receipts, and run-close revocation: complete and backend-only.
- Phase 1 signed, testnet-only Sui and Hyperliquid manifest contracts, closed projections, guarded-tool bindings, and offline routed fixtures: complete and backend-only.
- Current slice: live-source Sui/Hyperliquid adapter implementations, durable cost/quota and circuit policy, and conflicting-source/simulation adversarial tests.
- All new production modes remain `off`; no HTTP routes or upstream adapter traffic are enabled.

## Goal

Deliver Matterhorn as the safe middle layer between AI coworkers and crypto applications: users interact through chat; apps expose certified, narrowly scoped capabilities; Matterhorn deterministically controls privacy, permissions, budgets, simulations, and wallet review; connected wallets remain the only signing and submission surface; redacted evidence can be encrypted and independently verified through Walrus and Sui.

The first supported product roles are:

- **Market Analyst** — public research, comparisons, citations, and reports.
- **Risk Monitor** — approved balance/position watches and user-facing alerts.
- **Transaction Coordinator** — prepares and simulates exact actions for wallet review.
- **Treasury Coworker** — policy-aware balances, reporting, and multisig-ready handoffs.

The first protocol sequence is Sui, Hyperliquid, Bittensor, and Polymarket. Generic crypto chat may use certified read-only actions. Delegated spending and agent-held keys are excluded.

## Non-negotiable invariants

1. Models, external tools, MCP servers, app metadata, and chain metadata are untrusted.
2. No model-, agent-, app-, MCP-, CLI-, scheduler-, or server-automation surface can sign, relay, broadcast, or submit a financial transaction.
3. Every automatic action is an intersection of platform, organization, user, coworker, app, run, and per-call policy.
4. Private and wallet-linked context follows the authoritative privacy gateway. Secrets are never consentable.
5. Capabilities are short-lived, exact-argument-bound, single-use, and tenant/run/call scoped.
6. Financial work is canonicalized, simulated, hash-bound, refreshed, and reviewed in the connected wallet.
7. Public evidence is ciphertext and non-identifying proof material only.
8. All new runtime modes default to `off`; rollout is internal → shadow → invite enforcement.

## Product model

```text
User chat
  → Coworker mission + approved state
  → Matterhorn privacy and policy kernel
  → Certified Crypto App Gateway
  → typed read/watch result OR prepared simulation
  → wallet review for financial work
  → public chain receipt reconciliation
  → private run receipt + optional encrypted Walrus proof
```

The Web2 simplicity comes from one setup flow, one searchable catalog, one budget surface, and a common action contract. Crypto safety comes from separating discovery, connection, execution authority, financial preparation, wallet submission, and evidence.

## Success measures

### Safety

- Zero agent-originated sign/submit/relay/broadcast network calls.
- 100% rejection of replayed, expired, mutated, cross-tenant, cross-run, and wrong-tool capabilities.
- 100% of financial handoffs include current simulation, exact terms, policy result, expiry, and intent hash.
- Zero plaintext prompt, secret, wallet signature, account identifier, or private attachment in Walrus/Sui objects.

### Product

- A new non-technical user can create a coworker and complete a public research task in under three minutes.
- A developer can register and test an app locally in under 30 minutes.
- At least 80% of test users can correctly explain what a coworker may do, what needs approval, and what it can never do.
- Pause/revoke becomes effective before any new capability can be issued.

### Performance and economics

- At least 40% fewer repeated provider input tokens than the pre-compiler baseline.
- Privacy and authorization policy overhead under 100 ms p95 for text-only requests.
- Catalog discovery does not place more than the active app/action summaries in model context.
- Every completed run reports model/tool spend, tokens, latency, and any wallet action status.

## Phase 1 — Certified Crypto App Gateway

### Outcome

A signed, version-pinned, revocable registry projects multiple crypto protocols through one safe read/watch/prepare/simulate interface. Sui and Hyperliquid become the first certified first-party adapters.

### Build slices

1. **Signed registry boundary**
   - Canonical manifest serialization excluding its detached signature.
   - Ed25519 verification against a server-managed publisher keyring.
   - Immutable `(appId, manifestRevision)` records and current-version pointer.
   - Certification states: `pending`, `certified_testnet`, `certified_mainnet`, `suspended`, `revoked`.
   - Revocation reason, policy version, certification report hash, and effective timestamp.
2. **Workspace connections**
   - Tenant-scoped connection records with granted scopes, networks, and action IDs.
   - OAuth resource/audience binding with PKCE where supported.
   - API credentials stored only in the existing server-side vault boundary.
   - Connected wallets are references to browser wallet sessions, never exported keys.
3. **Adapter router**
   - MCP HTTP, OpenAPI, RPC, and first-party SDK adapters behind one server interface.
   - Strict input validation and typed output projection.
   - Source, trust label, block/time, freshness, sanitization, latency, and cost metadata.
   - Timeouts, quotas, circuit breakers, health, version pinning, and immediate revocation.
4. **Certification harness**
   - Static checks for forbidden authority and unknown fields.
   - Adversarial output/prompt-injection tests.
   - Auth confusion, tenant isolation, timeout, schema drift, replay, and egress tests.
   - Testnet fixtures for Sui and Hyperliquid.
5. **Catalog API**
   - Search and category filters.
   - Inspect endpoint with schemas, scopes, risk, privacy, freshness, price, and certification.
   - Server-resolved active actions; the browser cannot broaden action scope.

### Public interfaces

- `GET /crypto-apps`
- `GET /crypto-apps/:appId`
- `POST /workspace/:id/crypto-app-connections`
- `DELETE /workspace/:id/crypto-app-connections/:connectionId`
- Trusted-operator certification and revocation routes, never account-facing.

### Exit criteria

- Tampered, unsigned, revoked, schema-drifted, or submit-capable manifests never resolve.
- Cross-workspace connections and wrong-audience credentials fail with zero upstream traffic.
- Sui and Hyperliquid pass the conformance suite on testnet.
- No production behavior changes while gateway mode is `off`.

## Phase 2 — Persistent Chat-Operated Coworkers

### Outcome

Users create, configure, run, pause, and revoke durable coworkers through chat. Coworkers remember approved structured state and bring alerts, questions, and prepared work back to an inbox.

### Build slices

1. **Durable profile and ownership**
   - Workspace/owner, role, mission, state, version, app/action/network/asset scopes.
   - Per-action, daily, weekly, slippage, leverage, reserve, watch, tool-call, and model budgets.
   - Optimistic versioning for edits; policy changes invalidate pending financial work.
2. **Chat-first creation**
   - Start with one outcome, suggest an appropriate role, disclose limits, then confirm.
   - Default templates for Market Analyst and Risk Monitor.
   - Advanced settings stay collapsed until requested.
3. **Structured working state**
   - Decisions, positions, unresolved risks, pending actions, evidence references, and user-approved memories.
   - No transcript replay as the primary memory mechanism.
4. **Watches and inbox**
   - Bounded schedules and event-driven checks.
   - Alerts never cause financial submission.
   - Each alert includes reason, source freshness, budget impact, and next safe action.
5. **Lifecycle controls**
   - Immediate pause, revoke, delete, and app disconnect.
   - Existing capabilities and scheduled work are invalidated on pause/revoke.
   - One active run per session; new prompts explicitly abort or queue.

### UX direction

- Home leads with one composer and four coworker choices, not a wall of desk cards.
- Each coworker always shows: automatic, approval-required, impossible, connections, budgets, pending decisions, receipts, pause, and revoke.
- Catalog cards use Monid's scannability while adding Matterhorn's risk and wallet boundaries.

### Exit criteria

- A first-time user completes setup and a cited research run in under three minutes.
- Pause/revoke prevents every new grant, tool call, and scheduled run.
- Two accounts cannot enumerate or access each other's coworkers, state, watches, alerts, receipts, or app connections.
- Token/context budgets are enforced server-side.

## Phase 3 — Deterministic Transaction Coordinator

### Outcome

Coworkers can turn a user request into an exact, policy-checked, simulated wallet ticket. They cannot sign or submit it.

### Build slices

1. **Intent compiler**
   - Certified adapter output becomes `matterhorn.crypto-intent.v1`.
   - Canonical protocol, network, signer, operation, asset, amount, recipient, slippage, expiry, and arguments.
2. **Policy intersection**
   - Deterministic evaluation across platform, org, user, coworker, app, run, and capability.
   - Recipient allow/deny rules, network/asset limits, leverage, reserve, velocity, slippage, and geographic/compliance controls.
3. **Protocol-aware simulation**
   - Sui gas/object-version refresh and dry-run.
   - Hyperliquid market metadata, tick/lot, position/margin, price, and slippage refresh.
   - Bittensor signer/network/fee/amount/staking refresh.
   - Polymarket eligibility, market state, liquidity, price, and orderbook refresh.
4. **Wallet airlock**
   - Exact review UI with human-readable and canonical terms.
   - Reject, expire, edit/tamper, regenerate, approve, and wallet-switch states.
   - Editing any reviewed field creates a new intent hash.
5. **Receipt reconciliation**
   - Imported wallet/chain receipt must match the reviewed intent and public chain result.
   - Reorg, dropped, failed, or mismatched submissions remain unresolved and visible.

### Exit criteria

- Static registry and runtime egress tests prove there is no agent-facing sign/submit path.
- Replay, mutation, wrong tenant/session/run/tool, stale simulation, signer change, and network change fail closed.
- Sui, Hyperliquid, Bittensor, and Polymarket pass reject/expire/tamper/regenerate/approve/reconcile scenarios on supported testnets or sandbox environments.

## Phase 4 — Encrypted Walrus and Sui Evidence

### Outcome

Users may opt to publish an encrypted, minimal evidence bundle whose integrity and availability can be independently verified without disclosing private content.

### Build slices

1. **Evidence compiler**
   - Redacted provider/model, policy, tool outcome hashes, evidence references, reviewed intents, public chain receipt hashes, tokens, and latency.
   - Raw prompts, keys, credentials, signatures, wallet exports, identities, and unrestricted tool output are structurally forbidden.
2. **Encryption and key lifecycle**
   - Envelope encryption before any publisher receives bytes.
   - Workspace-scoped key references, rotation, access audit, deletion, and key destruction.
3. **Walrus publisher**
   - Authenticated relay with strict ciphertext-only content type and maximum size.
   - Quilt batching and Merkle proofs for small bundles.
   - Blob certification, epoch/expiry, renewal, and availability verification.
4. **Sui anchor**
   - Merkle root and non-identifying proof metadata only.
   - Transaction digest reconciliation and explorer/verifier flow.
5. **Retention and deletion**
   - User content deletes immediately from Matterhorn.
   - Deletable Walrus lifecycle where supported; key destruction for residual ciphertext.
   - Clear disclosure that public hashes/transactions may be permanent.

### Exit criteria

- Public object scans reveal ciphertext and non-identifying proofs only.
- Any byte modification, wrong proof, uncertified blob, or mismatched Sui anchor fails verification.
- Testnet publish, verify, renew, expire, delete, and key-destruction flows pass.
- Mainnet remains disabled until a separate explicit approval.

## Phase 5 — Developer Platform and Invite-Only Network

### Outcome

Crypto teams can build, certify, list, meter, and operate safe integrations; invited users can connect them to coworkers without learning MCP internals.

### Build slices

1. **Developer kit**
   - TypeScript SDK, manifest builder/signer, local adapter runner, typed fixtures, and policy emulator.
   - Setup flows for Matterhorn Skill, MCP, Codex, Claude Code, CLI, and HTTP API.
2. **Developer portal**
   - Register publisher keys, submit manifest revisions, run conformance, inspect failures, and request certification.
   - Separate testnet and mainnet certification.
3. **User catalog**
   - Search, categories, protocol/network filters, and capability counts.
   - Detail page shows actions, authority, risk, privacy, freshness, scopes, cost, health, version, certification, and revocation history.
4. **Metering and budgets**
   - Tool/model spend uses a separate budget from wallet transaction limits.
   - Per-call or per-result cost estimates, quota, and receipt reconciliation.
   - Provider revenue sharing is deferred until accounting and dispute controls pass.
5. **Private beta rollout**
   - Three to five design-partner apps.
   - Internal mode, then 48-hour shadow, then sequential invite enforcement.
   - Sui → Hyperliquid → Bittensor → Polymarket → generic crypto reads.

### Exit criteria

- A new developer gets a test adapter passing locally in under 30 minutes.
- Certification results are reproducible, signed, version-pinned, and revocable.
- Invite users can connect an app and complete supported flows without pasting credentials into chat.
- Hosted acceptance, two-account isolation, backup/restore, privacy, transaction airlock, accessibility, responsive, performance, and rollback gates all pass.

## Delivery cadence

Each phase is split into independently reviewable PRs and must remain deployable with its mode disabled.

| Phase | Expected slices | Target elapsed time | Production exposure |
|---|---:|---:|---|
| 1. Gateway | 4–6 PRs | 3–4 weeks | Off, then internal testnet |
| 2. Coworkers | 4–6 PRs | 3–4 weeks | Internal, then invite UI |
| 3. Transactions | 5–7 PRs | 4–5 weeks | Testnet only |
| 4. Evidence | 4–6 PRs | 3–4 weeks | Walrus/Sui testnet only |
| 5. Platform | 5–7 PRs | 4–6 weeks | Invite-only shadow/enforce |

The ranges are planning estimates, not release promises. Security findings extend the schedule rather than reducing acceptance coverage.

## Required test program

- Contract and unit: manifest validation/signatures, registry immutability/revocation, policy intersection, consent, capabilities, tenancy, canonical intents, evidence redaction/encryption, retention.
- Integration: app auth, schema projection, prompt injection, circuit breakers, watches, pause/revoke, one-active-run, wallet airlock, receipt reconciliation.
- Adversarial: malicious metadata, Unicode/confusables, hidden fields, OAuth audience confusion, replay races, stale sources, RPC/indexer disagreement, wallet switching, reorgs, publisher tampering.
- Hosted: two real accounts, public/private/transaction messages, Sui/Hyperliquid/Bittensor/Polymarket scenarios, testnet wallet handoffs, evidence proof verification, backup/restore, deletion, rollback.
- UX: 320/375/768/1024/1440 px, keyboard, screen reader, Safari, Firefox, non-technical first-run testing.

## Stop-and-confirm conditions

Implementation must stop before any of these decisions:

1. Granting a model, coworker, server, scheduler, or third-party app signing/submission authority.
2. Storing or handling seed phrases, private keys, wallet exports, or autonomous session keys.
3. Publishing plaintext user, wallet-linked, or identity data to Walrus/Sui.
4. Enabling Walrus/Sui mainnet writes or incurring a new paid third-party commitment.
5. Enabling public signup, live billing, custody, delegated spend, or unrestricted third-party apps.
6. Introducing a breaking public contract or destructive migration without a verified rollback.
7. Proceeding when a protocol lacks a reliable simulation/freshness boundary.
8. Proceeding when regulatory, geographic, privacy, or data-retention treatment is materially ambiguous.

When a stop condition occurs, report the exact decision, evidence, options, recommendation, and reversible fallback. Do not continue that branch until the user confirms.

## Immediate implementation slice

The completed adapter-router core remains backend-only and inert. It now:

- Routes only active tenant connections to their exact certified manifest revision.
- Resolves and revalidates public IPv4 DNS at request time before authorization or adapter execution.
- Validates arguments and projects outputs through a deliberately closed JSON-schema subset.
- Quarantines instruction-like external content and model-control-shaped fields after typed projection.
- Attaches trust, source, freshness, latency, metering, and evidence-hash metadata.
- Enforces timeout, reservation/reconciliation, per-tenant circuit breaking, and immediate registry/connection revocation.
- Requires exact run/call/action/network/argument authorization through an injected server-only boundary.

The trusted JSON transport additionally pins the HTTPS socket to one router-approved address, preserves TLS verification against the certified hostname, verifies the actual peer address, refuses redirects and non-JSON responses, caps response bytes, and prevents opaque credential references from entering the request body. Upstream adapters cannot declare their own metering cost.

The guarded-runtime bridge requires full `enforce` mode and a trusted certification-time binding between each app action and one existing Matterhorn read or prepare tool. It stages and consumes the existing server-only capability, binds the manifest revision, connection, action, access, network, and canonical argument hash, persists only non-content reservation metadata, records the app/action in the run receipt, survives a process restart, and invalidates outstanding reservations when the run closes. It is not registered in server startup or any account-facing route.

The first-party contract fixtures cover Sui balance reads and dry-run transfer preparation plus Hyperliquid market, orderbook, account-exposure, and order-preparation actions. Every contract is testnet-only, signed in the test harness, closed-schema projected, wallet-submission-only, and bound to a compatible existing guarded tool. Test fixtures prove unknown/private payload fields do not enter model-facing results. These are certification contracts, not live chain adapters; no production publisher key, automatic registration, startup hook, or upstream endpoint is included.

The next Phase 1 slice must:

- Bind MCP/OpenAPI/RPC and first-party SDK protocols to the trusted transport boundary without allowing redirects, destination overrides, arbitrary methods, or raw upstream cost claims.
- Add a durable adapter cost/quota ledger; capability reservation/reconciliation is complete, while monetary/tool allowance accounting remains separate and pending.
- Persist circuit/quota state needed across process restarts while keeping the hosted release single-instance.
- Implement live Sui and Hyperliquid testnet sources behind the certified contracts, including semantic validation, protocol-aware simulation, conflicting-source, schema-drift, abort, replay, and zero-upstream-denial fixtures.
- Keep account-facing HTTP routes and runtime capabilities disconnected until that full adversarial gate passes.
