# Matterhorn Guarded Crypto Coworkers

Status: Phase 1 certification and account-safe gateway foundation. All runtime switches still default to `off`; no production adapter traffic is enabled by this work.

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

The Phase 1 registry defaults to `<data-dir>/crypto-apps/registry.db`. Tests and operators may override the path with `MATTERHORN_CRYPTO_APP_REGISTRY_DB`; the registry contains signed public manifests and certification history, never workspace credentials. Certification promotion requires a passing static report plus a complete, hash-bound runtime adversarial report. The trusted harness executes every required probe with an independent bounded timeout and accepts only assertion/observation hashes; raw observations and error messages never cross into the report or registry. Workspace-scoped connection grants default to `<data-dir>/crypto-apps/connections.db` and may be overridden with `MATTERHORN_CRYPTO_APP_CONNECTION_DB`. Connection rows store opaque vault or connected-wallet references, never provider tokens, API keys, private keys, or wallet exports.

The Phase 1 adapter-router core accepts only an active tenant connection pinned to the exact certified manifest revision; validates the exact action, network, scopes, and closed input schema; performs public-DNS checks; requires server-side run authorization; and returns a typed, quarantined, freshness-annotated result. Its first trusted JSON-over-HTTPS transport explicitly creates a TLS socket to a router-approved address, preserves certificate verification against the certified hostname, verifies the connected peer, refuses redirects and non-JSON responses, caps response size, and resolves opaque credentials only inside the server boundary. Account-facing catalog and connection routes expose only redacted tenant-safe projections; execution remains backend-only until guarded enforcement rollout. No third-party adapter code receives authority to select its own destination or metering cost.

The guarded authorization bridge reuses Matterhorn's existing durable single-use capability broker. Certification must bind an app action to one compatible Matterhorn read or prepare tool; runtime authorization then hash-binds the exact manifest revision, connection, action, access, network, run, call, and canonical arguments. Adapter reservations survive restarts, are reconciled once, appear under the certified app/action in the private run receipt, and are revoked when the run closes. The bridge refuses to operate unless the guarded runtime is fully enforced, and it remains disconnected from server startup in this delivery slice.

The operational-policy store defaults to `<data-dir>/crypto-apps/operational.db` and may be overridden with `MATTERHORN_CRYPTO_APP_OPERATIONAL_DB`. It atomically reserves a bounded per-call allowance against a workspace/day ceiling, reconciles measured cost exactly once, expires abandoned reservations without allowing call replay, and persists tenant-scoped circuit state across restarts. Its rows contain only identifiers, counters, timestamps, and outcomes—never prompts, arguments, credentials, wallet data, or adapter output. The default backend-only policy reserves at most 1,000,000 micro-units per call and 10,000,000 per workspace UTC day; launch-specific values must be explicitly configured when the gateway is wired into startup.

The account-safe catalog service returns only the current certified manifest projection. It exposes action descriptions, authority, risk, freshness, schemas, network, authentication type, and certification hashes while omitting adapter endpoints, detached signatures, publisher key IDs, security contacts, OAuth servers, vault references, and connected-wallet identifiers. Authenticated catalog and tenant connection lifecycle routes fail closed when `MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off`; host-token-only routes own registration, certification, suspension, revocation, inspection, and history.

Signed test-harness contracts now define testnet-only Sui balance/transfer-preview actions and Hyperliquid market/orderbook/account/order-preview actions. They use closed input and model-facing output schemas, map every action to a compatible guarded tool, and never contain production publisher keys or automatic registration. Their offline router fixtures deliberately include private and malicious extra fields to prove projection removes them.

The first-party executor can now read Sui balance/checkpoint data and Hyperliquid market, orderbook, and account data through DNS-pinned, TLS-verified transports. Hyperliquid order preparation refreshes testnet market definitions, book, margin state, lot precision, leverage, and slippage before producing a short-lived hash-bound wallet-review reference; it never calls the exchange endpoint. Sui transfer preparation uses the official transaction builder and a binary gRPC-web client over a pinned HTTP/2 socket. The exact transport allowlist is `StateService/GetBalance`, `StateService/GetCoinInfo`, `LedgerService/GetServiceInfo`, and `TransactionExecutionService/SimulateTransaction`; signing, execution, and every other gRPC method fail before dialing. Successful simulations return exact terms, a 15-second expiry, gas estimate, simulation hash, and chain version without transaction bytes or signatures. Hyperliquid and Sui public reads have been verified against their pinned live testnet transports. These executors remain disconnected from server startup and all production modes remain off.

### Operator testnet certification

`pnpm certify:crypto-app` runs the static manifest gate and every sealed runtime adversarial probe before producing the exact host-route promotion body. It supports only Matterhorn's signed Sui and Hyperliquid testnet manifests. The action-input file must be an owner-only regular file (`0600` on Unix); action arguments, linked wallet identities, live output, secrets, and capability material are never written to the promotion artifact or command logs.

```bash
chmod 600 /secure/testnet-action-inputs.json
pnpm certify:crypto-app -- \
  --manifest /secure/signed-manifest.json \
  --publisher-public-key /secure/publisher-public-key.pem \
  --inputs /secure/testnet-action-inputs.json \
  --policy-version crypto-app-policy-v1 \
  --output /secure/certification-promotion.json
```

The command refuses private keys, seeds, credentials, raw signatures, wallet exports, path aliasing, unsafe input permissions, pre-existing output files, non-testnet manifests, incomplete probes, and failed live simulations. It writes a `0600` output only after both report hashes verify. Publisher signing and testnet funding remain external operator responsibilities.

### Durable coworker profiles

Phase 2 profile storage is available only when `MATTERHORN_COWORKER_MODE` is not `off` and an explicit `MATTERHORN_COWORKER_POLICY_VERSION` is configured. It defaults to `<data-dir>/crypto-coworkers/coworkers.db` and may be overridden with `MATTERHORN_COWORKER_DB`. Off mode performs no database access.

Authenticated routes under `/workspace/:id/coworkers` create, list, inspect, revise, pause, revoke, and delete only the requesting identity's profiles. The server owns workspace, owner, revision, policy version, lifecycle state, and the immutable connected-wallet-only escalation boundary. Client JSON cannot supply those fields. Profiles use optimistic revisions; a stale edit, state transition, or deletion fails without mutation. A policy-version change makes older profiles non-resolvable until an explicit revisioned update rebinds them. Account responses omit the internal owner identifier, and workspace/owner composite scoping prevents enumeration across tenants.

`GET /workspace/:id/coworker-templates` exposes the initial chat-first `Market Analyst` and `Risk Monitor` templates. `POST /workspace/:id/coworkers/from-template` creates an owner-scoped copy with optional name and mission overrides. Neither template has prepare or submission authority.

The authoritative message preflight and submission routes accept an optional `coworkerId`. A selected coworker is resolved only from the signed-in identity and active server record. Its mission becomes versioned workspace-private system context, and its exact profile revision, policy version, app/action/network/data-label allowlist, proxy-tool mapping, and per-run budgets are bound into the hidden run grant. Coworker execution fails closed unless both the Crypto App Gateway and guarded runtime are in `enforce`. Direct legacy crypto tools are denied for coworker runs; only an exact certified app/action proxy binding can receive a capability. Data outside the coworker's allowlist is rejected before provider dispatch, and editing, pausing, revoking, deleting, or changing the deployment policy invalidates active and staged coworker authority. Templates refuse unverified providers for private context rather than offering one-request consent.

`GET` and `PUT /workspace/:id/coworkers/:coworkerId/state` expose owner-scoped structured working state. The closed schema stores only bounded decisions, observed positions, unresolved risks, pending wallet-review intent hashes, evidence hashes, and explicitly approved Memory IDs—never transcript history, signing material, or unrestricted tool output. Writes require both the latest profile revision and an optimistic state revision. Policy and lifecycle changes immediately clear pending financial work and rebind the retained non-financial state; deletion and workspace purge remove it. Active state is compiled into bounded workspace-private model context and its approved Memory records pass through the normal privacy preflight.

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
