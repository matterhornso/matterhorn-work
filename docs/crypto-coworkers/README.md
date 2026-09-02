# Matterhorn Guarded Crypto Coworkers

Status: Phases 1–4 security foundations plus the invite-only testnet developer and workspace integration path. All runtime switches still default to `off`; no production adapter traffic is enabled by this work.

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
- `matterhorn.crypto-public-receipt.v1`
- `matterhorn.evidence-bundle.v1`
- `matterhorn.walrus-proof.v1`

Runtime validation fails manifests that advertise signing/submission authority, omit wallet-controlled submission, omit simulations for prepare/simulate actions, use an HTTP endpoint, or configure OAuth without resource and audience binding.

## Rollout flags

These flags are inert in Phase 0 and default to `off`:

```text
MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off|shadow|enforce
MATTERHORN_CRYPTO_APP_DEVELOPER_DB=/data/crypto-apps/developer-portal.db
MATTERHORN_COWORKER_MODE=off|internal|invite|public
MATTERHORN_WALRUS_EVIDENCE_MODE=off|testnet|mainnet
MATTERHORN_WALRUS_PUBLISHER_URL=https://<authenticated-publisher>
MATTERHORN_WALRUS_AGGREGATOR_URL=https://<aggregator>
MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN=<server-only-secret>
MATTERHORN_WALRUS_ENCRYPTION_KEY_ID=<server-side-kms-key-reference>
```

The Phase 1 registry defaults to `<data-dir>/crypto-apps/registry.db`. Tests and operators may override the path with `MATTERHORN_CRYPTO_APP_REGISTRY_DB`; the registry contains signed public manifests and certification history, never workspace credentials. Certification promotion requires a passing static report plus a complete, hash-bound runtime adversarial report. The trusted harness executes every required probe with an independent bounded timeout and accepts only assertion/observation hashes; raw observations and error messages never cross into the report or registry. Workspace-scoped connection grants default to `<data-dir>/crypto-apps/connections.db` and may be overridden with `MATTERHORN_CRYPTO_APP_CONNECTION_DB`. Connection rows store opaque vault or connected-wallet references, never provider tokens, API keys, private keys, or wallet exports.

The Phase 1 adapter-router core accepts only an active tenant connection pinned to the exact certified manifest revision; validates the exact action, network, scopes, and closed input schema; performs public-DNS checks; requires server-side run authorization; and returns a typed, quarantined, freshness-annotated result. Its first trusted JSON-over-HTTPS transport explicitly creates a TLS socket to a router-approved address, preserves certificate verification against the certified hostname, verifies the connected peer, refuses redirects and non-JSON responses, caps response size, and resolves opaque credentials only inside the server boundary. Account-facing catalog and connection routes expose only redacted tenant-safe projections; execution remains backend-only until guarded enforcement rollout. No third-party adapter code receives authority to select its own destination or metering cost.

The guarded authorization bridge reuses Matterhorn's existing durable single-use capability broker. Certification must bind an app action to one compatible Matterhorn read or prepare tool; runtime authorization then hash-binds the exact manifest revision, connection, action, access, network, run, call, and canonical arguments. Adapter reservations survive restarts, are reconciled once, appear under the certified app/action in the private run receipt, and are revoked when the run closes. Server startup constructs the executable router only when both the Crypto App Gateway and guarded runtime are fully enforced. In `off` or `shadow`, no watch can reach a transport.

The operational-policy store defaults to `<data-dir>/crypto-apps/operational.db` and may be overridden with `MATTERHORN_CRYPTO_APP_OPERATIONAL_DB`. It atomically reserves a bounded per-call allowance against a workspace/day ceiling, reconciles measured cost exactly once, expires abandoned reservations without allowing call replay, and persists tenant-scoped circuit state across restarts. Its rows contain only identifiers, counters, timestamps, and outcomes—never prompts, arguments, credentials, wallet data, or adapter output. The default backend-only policy reserves at most 1,000,000 micro-units per call and 10,000,000 per workspace UTC day; launch-specific values must be explicitly configured when the gateway is wired into startup.

The account-safe catalog service returns only the current certified manifest projection. It exposes action descriptions, authority, risk, freshness, schemas, network, authentication type, and certification hashes while omitting adapter endpoints, detached signatures, publisher key IDs, security contacts, OAuth servers, vault references, and connected-wallet identifiers. Authenticated catalog and tenant connection lifecycle routes fail closed when `MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off`; host-token-only routes own registration, certification, suspension, revocation, inspection, and history.

The invite-only developer staging service defaults to `<data-dir>/crypto-apps/developer-portal.db` and may be overridden with `MATTERHORN_CRYPTO_APP_DEVELOPER_DB`. Host-token operators issue short-lived, single-use invites; only signed-in Matterhorn accounts can consume them. Developers may register Ed25519 public keys, submit immutable signed testnet manifest revisions, inspect static conformance, and request certification. The service stores only a one-way invite hash and rejects private keys. Developer keys are never inserted into the trusted runtime keyring, and the staging service exposes no certification, promotion, execution, credential, wallet, or transaction authority. Host inspection is required before the existing independent runtime-certification and registry-promotion boundary can be used. Mainnet requests fail closed.

The web app exposes two authenticated, lazy-loaded testnet surfaces. `/developer/crypto-apps` guides invited developers through public-key registration, signed manifest submission, static findings, and a certification request without accepting a private key. `/workspace/:id/crypto-apps` is discoverable from managed Tools and lets a workspace review certified capabilities, select research-only or wallet-preview access, and pause, resume, or permanently revoke its own connection. The account client deliberately omits host authority; credential-bearing apps require a future server-managed connection flow and the UI never accepts credentials in chat. The connected wallet remains the only signing and submission surface.

Signed test-harness contracts now define testnet-only Sui balance/transfer-preview actions and Hyperliquid market/orderbook/account/order-preview actions. They use closed input and model-facing output schemas, map every action to a compatible guarded tool, and never contain production publisher keys or automatic registration. Their offline router fixtures deliberately include private and malicious extra fields to prove projection removes them.

The first-party executor can now read Sui balance/checkpoint data and Hyperliquid market, orderbook, and account data through DNS-pinned, TLS-verified transports. Hyperliquid order preparation refreshes testnet market definitions, book, margin state, lot precision, leverage, and slippage before producing a short-lived hash-bound wallet-review reference; it never calls the exchange endpoint. Sui transfer preparation uses the official transaction builder and a binary gRPC-web client over a pinned HTTP/2 socket. The exact transport allowlist is `StateService/GetBalance`, `StateService/GetCoinInfo`, `LedgerService/GetServiceInfo`, `LedgerService/BatchGetObjects`, `LedgerService/GetTransaction`, and `TransactionExecutionService/SimulateTransaction`; the batch object read exists only for official Walrus certification parsing, while the single transaction read exists only for exact wallet-receipt verification. `ExecuteTransaction`, batch transaction lookup, signing, and every other gRPC method fail before dialing. Successful simulations return exact terms, a 15-second expiry, gas estimate, simulation hash, and chain version without transaction bytes or signatures. Hyperliquid and Sui public reads have been verified against their pinned live testnet transports. The executor is reachable from scheduled coworkers only in fully enforced mode, through the certified router and a single-use read capability; all production modes still default to `off`.

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

`GET|POST /workspace/:id/coworkers/:coworkerId/watches` lists or creates bounded owner-scoped read/watch schedules. Each schedule is locked to one approved app, action, network, scalar parameter set, cadence, condition set, and per-check budget. `PATCH|DELETE .../watches/:watchId` explicitly pauses/resumes or deletes a watch. Profile edits, coworker pause, and revocation pause every schedule; no watch has prepare, signing, relay, broadcast, or submission authority.

`GET /workspace/:id/coworkers/:coworkerId/inbox` returns bounded alerts, questions, and notices. Account clients can only mark an item read or dismissed through `PATCH .../inbox/:itemId`; there is no account-facing alert creation route. Every alert requires typed evidence provenance, freshness, reason codes, budget impact, and a safe next action. Inbox records never contain raw prompts, secrets, signatures, or unrestricted tool output.

The server-owned watch runner claims each due schedule atomically with a short lease and UTC-day counter. It then opens a model-free guarded run whose receipt reports zero model tokens and one exact read budget, resolves one active tenant connection, and calls only that certified app/action/network through the adapter router. Conditions may inspect at most four levels of typed scalar output; arbitrary expressions and instruction-bearing tool output are never evaluated. `changed` establishes a baseline before alerting. Completion, next schedule state, prior condition values, result hash, and any inbox item commit in one transaction. If the coworker or watch changes while the call is in flight, the completion is discarded and no alert is created.

Account deletion purges tenant coworker state, schedules, inbox items, certified-app connections, gateway usage reservations, and circuit records before the workspace deletion step can complete. Repeating a partially completed deletion remains idempotent.

Future readiness rules are fail-closed:

- Enforced app access requires the guarded agent runtime in `enforce`.
- Invite/public coworkers require an enforced app gateway.
- Public coworkers require signup to be deliberately enabled.
- Walrus evidence requires an HTTPS authenticated publisher and server-side encryption-key reference.
- Walrus mainnet additionally requires an explicit production acknowledgement.

The evidence-key foundation uses AWS KMS envelope keys when configured. Set `MATTERHORN_EVIDENCE_KMS_REGION` and `MATTERHORN_EVIDENCE_KMS_KEY_ID`; AWS credentials continue through the SDK's server-side credential chain and must never use a browser-visible variable. `MATTERHORN_EVIDENCE_KMS_ROTATION_DAYS` defaults to `90` and controls the daily, serialized rewrap scan. KMS receives only a random-nonce-bound digest as encryption context—not account, workspace, run, coworker, or wallet identifiers. Rotation uses KMS `ReEncrypt`, so the plaintext data key never returns to Matterhorn. The durable tenant index stores the KMS-wrapped data key and ciphertext locally, enforces owner/workspace/coworker isolation, and clears the wrapped key before a secure SQLite/WAL checkpoint during expiry, workspace deletion, or user-requested key destruction. Seal, decrypt, proof, rotation, denial, and destruction events are tenant-scoped, hash-chained, content-free, and expire after 365 days.

The Agent Files boundary is provider-neutral and runs before encryption, storage, Walrus publication, or model access. It currently accepts only bounded UTF-8 text, Markdown, CSV, and JSON selected by the user. Files are SHA-256 bound, workspace-private, read-only, explicitly allowlisted to one or more coworkers, and always carry zero wallet authority. Private keys, recovery material, secret-shaped filenames, executable files, malformed JSON, undeclared request fields, changed bytes, expired access, and coworker mismatches fail closed. Model context is quarantined as data and capped at 2,000 characters with an explicit narrower-excerpt recovery path. This contract stores no bytes and grants no tools or connectors; storage orchestration remains off until the encryption and deletion design is selected and reviewed.

Account users can inspect their redacted evidence packets through `GET /workspace/:id/crypto-evidence` and request independent read-only verification through `POST /workspace/:id/crypto-evidence/:evidenceId/verify`. The server derives the owner from the authenticated workspace, never accepts an owner override, and omits tenant identifiers, KMS references, wrapped keys, ciphertext, prompts, signatures, and wallet data from the response. Testnet verification recomputes the ciphertext hash and Merkle proof, reads the exact Walrus certification through the pinned Sui HTTP/2 boundary, and compares an independently retrieved Walrus blob byte-for-byte. It performs no publication, anchoring, signing, or transaction submission. When evidence mode is `off`, the list returns an explicit unavailable state and live verification fails closed.

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

- Canonical `crypto-intent.v1` production from certified Sui and Hyperliquid adapter outputs is complete. The compiler cross-checks request and result terms, rejects stale simulations, hash-binds exact terms and policy, and regenerates only wallet-review-only v2 handoffs.
- Policy intersection across platform, organization, user, coworker, app, run, and call is complete at the guarded server boundary. Static denials occur before adapter egress; a wallet handoff additionally requires an exact durable single-use capability proof and trusted economic/compliance facts.
- Certified Sui and Hyperliquid pending-review persistence and protocol-aware freshness regeneration are complete at the backend boundary. Reviews are exact-connection bound, auto-expire, are cancelled when coworker authority changes, and can be regenerated only through a new guarded run with identical canonical terms.
- Account-safe list, inspect, cancel, and public-receipt routes are complete at the backend boundary. They fetch the server-owned intent, require the exact owner/coworker/workspace, bind the connected-wallet metadata to the exact network, signer, operation, authorized arguments, guarded run, policy, and simulation, and reject secrets and raw signatures.
- Sui wallet receipts are accepted only with a null block hash and are first checked through the exact pinned `LedgerService/GetTransaction` lookup. Exact testnet digest, signer, gas owner, native-SUI split/transfer command graph, recipient, amount, effects, and balance changes must match before the receipt is promoted to `chain_verified_public_metadata`; hidden commands or unexplained deltas fail closed. A transient not-found/unavailable lookup may persist the exact wallet-reported digest as unverified metadata for later retry, but it is never represented as chain-confirmed.
- Wallet review, rejection, expiry, tamper invalidation, regeneration, submission, and public-receipt reconciliation.
- Sui first, then Hyperliquid, Bittensor, and Polymarket.

Exit: coworkers can prepare exact financial work but no agent-facing path can sign or submit it.

### Phase 4 — Walrus evidence

- Canonical minimal evidence receipt: local compiler complete for finalized guarded runs, with closed fields and per-bundle salted identity hashes.
- Envelope encryption before publication: AES-256-GCM sealing, exact recipient binding, and plaintext-key zeroization complete.
- Public ciphertext boundary: Walrus-eligible bytes exclude local KMS references and plaintext hashes; deterministic Merkle batching and proof verification are complete.
- Authenticated, peer-pinned testnet Walrus publisher and byte-exact readback gate: backend implementation complete. Account routes expose only owner-scoped redacted packets and a read-only verification result.
- Quilt batching for small encrypted bundles.
- Pinned Sui Walrus certification verification and the account-facing proof UI: complete for existing stored testnet publication records.
- Renewal, expiry, user deletion, and encryption-key destruction workflows.

The implemented foundation can perform an authenticated testnet Walrus ciphertext upload and independent pinned Sui certification read. The account-facing surface is deliberately read-only: it lists redacted records, reports local/key-destroyed states, and verifies an existing testnet publication without disclosing ciphertext or tenant metadata. Automatic finalized-run sealing, user opt-in, publication orchestration, renewal, and production anchor creation remain pending. It performs no Sui transaction submission, and mainnet remains fail-closed and disabled.

Exit: a user can independently verify a financial run without any plaintext prompt, secret, wallet signature, or private attachment appearing in public storage.

### Phase 5 — Developer platform and private beta

- Invite-only backend developer portal: one-time enrollment, account-isolated public publisher keys, immutable signed testnet manifest submissions, static conformance, and host-inspected certification requests are complete.
- Developer keys remain staging-only; runtime certification and registry promotion stay behind the existing host-token boundary and require independent sealed runtime evidence.
- The TypeScript SDK now provides deterministic manifest construction, external-signing requests, detached-signature attachment, the same closed JSON-schema input/output evaluator used by the server, inert generic and Sui/Hyperliquid testnet fixture validation, a non-authoritative local policy emulator, an account-cookie developer client limited to enrollment/public-key/testnet-staging/certification requests, and a privacy-safe readiness contract that returns one deterministic next step. Its advisory local adapter runner accepts only a developer-owned invocation callback: it supplies no fetch client, credential, wallet, signer, submit method, or mainnet target; secret-shaped inputs fail before invocation, while typed projection, freshness, timeout, abort, size, and stable-error checks mirror the safe local boundary without claiming certification. An invite-link-only account UI guides enrollment, public-key registration, signed testnet manifest submission, static failure repair, and certification requests without exposing private-key, execution, promotion, credential, or mainnet controls. A broader certified-app catalog UI remains pending.
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
