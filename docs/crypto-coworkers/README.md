# Matterhorn Guarded Crypto Coworkers

Status: Phase 0 contract and threat-model foundation. All runtime switches default to `off` and no production behavior changes in this phase.

## Product boundary

Matterhorn is the authorization, privacy, transaction-review, and evidence layer between an untrusted model and a crypto application. A coworker can research, monitor, prepare, and simulate. It cannot possess a signing key or sign, relay, broadcast, or submit a financial transaction. The connected wallet remains the only transaction submission surface.

The platform consists of two additive systems:

1. **Crypto App Gateway** — accepts signed application manifests and projects app capabilities into Matterhorn's read/watch/prepare/simulate model.
2. **Coworker Runtime** — gives users durable, chat-operated agents whose app access, privacy scope, budgets, schedules, and escalation rules are controlled by deterministic policy.

The model is an untrusted planner in both systems. The Matterhorn server is the security boundary.

## Existing foundation

The design extends these existing boundaries rather than replacing them:

- Authoritative privacy preflight and exact-request consent.
- Short-lived, single-use, workspace/session/run/tool/argument-bound capabilities.
- Canonical crypto action registry with read and prepare classes.
- Reviewed-action v2 airlock with simulation, policy, expiry, and intent hashing.
- Connected-wallet-only signing and submission.
- Redacted, hash-chained agent run receipts.
- Managed MCP transport with server-side authorization.

## Phase 0 contracts

The public types are exported from `@matterhorn-work/types/crypto-coworkers`:

- `matterhorn.crypto-app-manifest.v1`
- `matterhorn.coworker-profile.v1`
- `matterhorn.crypto-intent.v1`
- `matterhorn.policy-decision.v1`
- `matterhorn.evidence-bundle.v1`
- `matterhorn.walrus-proof.v1`

Runtime validation fails manifests that advertise signing/submission authority, omit wallet-controlled submission, omit simulations for prepare/simulate actions, use an HTTP endpoint, or configure OAuth without resource and audience binding.

## Rollout flags

These flags are inert in Phase 0 and default to `off`:

```text
MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off|shadow|enforce
MATTERHORN_COWORKER_MODE=off|internal|invite|public
MATTERHORN_WALRUS_EVIDENCE_MODE=off|testnet|mainnet
```

The Phase 1 registry defaults to `<data-dir>/crypto-apps/registry.db`. Tests and operators may override the path with `MATTERHORN_CRYPTO_APP_REGISTRY_DB`; the registry contains signed public manifests and certification history, never workspace credentials. Workspace-scoped connection grants default to `<data-dir>/crypto-apps/connections.db` and may be overridden with `MATTERHORN_CRYPTO_APP_CONNECTION_DB`. Connection rows store opaque vault or connected-wallet references, never provider tokens, API keys, private keys, or wallet exports.

Future readiness rules are fail-closed:

- Enforced app access requires the guarded agent runtime in `enforce`.
- Invite/public coworkers require an enforced app gateway.
- Public coworkers require signup to be deliberately enabled.
- Walrus evidence requires an HTTPS authenticated publisher and server-side encryption-key reference.
- Walrus mainnet additionally requires an explicit production acknowledgement.

## Build sequence

The comprehensive execution plan, delivery cadence, metrics, and stop conditions are maintained in [`phases-1-5-plan.md`](./phases-1-5-plan.md). Monid-derived product patterns and the crypto-specific changes are documented in [`monid-reference-audit.md`](./monid-reference-audit.md).

### Phase 1 — Crypto App Gateway

- Signed and version-pinned manifest registry.
- Workspace-scoped app connections and token vault.
- MCP/OpenAPI/RPC/SDK adapter router.
- Typed output projections, freshness metadata, timeouts, quotas, circuit breakers, and revocation.
- Conformance suite and testnet certification.
- Wrap Sui and Hyperliquid as the first two first-party adapters.

Exit: a malicious or malformed adapter cannot broaden authority or expose a model-facing submit route.

### Phase 2 — Persistent coworkers

- Coworker storage, ownership, mission, pause/revoke, limits, and policy versioning.
- Chat-first setup for Market Analyst and Risk Monitor.
- Durable watches with an inbox for alerts and questions.
- One active run per session and bounded tool/model budgets.
- Explicit data disclosure and Memory selection.

Exit: the user can operate a coworker through chat, see its allowed/approval/prohibited boundary, and stop it immediately.

### Phase 3 — Transaction Coordinator

- Canonical `crypto-intent.v1` production from certified adapter outputs.
- Policy intersection across platform, organization, user, coworker, app, run, and call.
- Protocol-aware simulation and freshness refresh.
- Wallet review, rejection, expiry, tamper invalidation, regeneration, submission, and public-receipt reconciliation.
- Sui first, then Hyperliquid, Bittensor, and Polymarket.

Exit: coworkers can prepare exact financial work but no agent-facing path can sign or submit it.

### Phase 4 — Walrus evidence

- Canonical minimal evidence receipt.
- Envelope encryption before publication.
- Authenticated Walrus publisher/upload relay.
- Quilt batching for small encrypted bundles.
- Sui certification/hash anchor and verification UI.
- Renewal, expiry, user deletion, and encryption-key destruction workflows.

Exit: a user can independently verify a financial run without any plaintext prompt, secret, wallet signature, or private attachment appearing in public storage.

### Phase 5 — Developer platform and private beta

- TypeScript SDK, developer portal, manifest signer, test harness, certification report, health telemetry, and registry revocation.
- Three to five design-partner apps.
- Invite-only rollout in `shadow`, then sequential enforcement.

## Initial UX

Matterhorn Home should offer one primary composer and a small set of coworkers:

- **Market Analyst** — public research, comparisons, reports, and citations.
- **Risk Monitor** — approved account/position watches and alerts.
- **Transaction Coordinator** — prepares and simulates actions for wallet review.
- **Treasury Coworker** — balances, policy checks, reporting, and multisig-ready handoffs.

Every coworker surface must show:

- What it can do automatically.
- What requires user or wallet approval.
- What it can never do.
- Connected apps and wallets.
- Current financial and tool budgets.
- Pause and revoke controls.
- Pending decisions and completed receipts.

## Deferred delegated execution

Smart-account permissions or session-key execution are explicitly outside the first release. They require a separate protocol, regulatory, recovery, revocation, and adversarial-security review. The initial release must prove the wallet-reviewed model before any delegated-spend experiment begins.
