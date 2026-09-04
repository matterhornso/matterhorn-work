# Matterhorn Guarded Crypto Coworkers

Status: Phases 1–4 security foundations plus the invite-only testnet developer and workspace integration path. All runtime switches still default to `off`; no production adapter traffic is enabled by this work.

Live release proof is defined by the [Guarded Crypto Coworkers acceptance gate](./acceptance-evidence.md). Local tests do not satisfy that gate and do not authorize enabling any runtime switch.

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

Runtime validation fails manifests that advertise signing/submission authority, omit wallet-controlled submission, omit simulations for prepare/simulate actions, use a non-public or ambiguous transport/support destination, provide an invalid security contact, or configure OAuth without exact public issuer, resource, and audience binding.

## Rollout flags

These flags are inert in Phase 0 and default to `off`:

```text
MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off|shadow|enforce
MATTERHORN_CRYPTO_APP_DEVELOPER_DB=/data/crypto-apps/developer-portal.db
MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET=<independent-server-only-secret>
MATTERHORN_COWORKER_MODE=off|internal|invite|public
MATTERHORN_AGENT_FILES_MODE=off|encrypted
MATTERHORN_WALRUS_EVIDENCE_MODE=off|testnet|mainnet
MATTERHORN_WALRUS_PUBLISHER_URL=https://<authenticated-publisher>
MATTERHORN_WALRUS_AGGREGATOR_URL=https://<aggregator>
MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN=<server-only-secret>
MATTERHORN_WALRUS_ENCRYPTION_KEY_ID=<server-side-kms-key-reference>
MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET=<dedicated-server-only-secret>
MATTERHORN_ERASURE_LEDGER_DB=/data/erasure-ledger/ledger.db
```

The Phase 1 registry defaults to `<data-dir>/crypto-apps/registry.db`. Tests and operators may override the path with `MATTERHORN_CRYPTO_APP_REGISTRY_DB`; the registry contains signed public manifests and certification history, never workspace credentials. Certification promotion requires a passing static report plus a complete, hash-bound runtime adversarial report. The trusted harness executes every required probe with an independent bounded timeout and accepts only assertion/observation hashes; raw observations and error messages never cross into the report or registry. Workspace-scoped connection grants default to `<data-dir>/crypto-apps/connections.db` and may be overridden with `MATTERHORN_CRYPTO_APP_CONNECTION_DB`. Connection rows store opaque vault or connected-wallet references, never provider tokens, API keys, private keys, or wallet exports.

Certified `api_key_vault` apps can use a deployment-managed connection without asking the user for a key. `MATTERHORN_CRYPTO_APP_MANAGED_CREDENTIALS_JSON` binds one safe identifier to an exact app ID, manifest revision, approved header, and `raw` or `bearer` scheme; it contains no secret. The value itself lives only in `MATTERHORN_CRYPTO_APP_SECRET_<ID>` in the deployment secret manager and is resolved after connection, schema, egress, and capability checks at the pinned transport boundary. Only `authorization`, `api-key`, `x-api-key`, and `x-access-token` are accepted; an `authorization` value must use the Bearer scheme. Missing, malformed, duplicate, wrong-app, wrong-revision, or substituted references fail closed without echoing the identifier or secret. Account responses expose only the authentication type and connected state.

Certified `oauth2` apps use a server-owned authorization-code flow with S256 PKCE. `MATTERHORN_CRYPTO_APP_OAUTH_CLIENTS_JSON` contains only public client and endpoint bindings for one exact app revision. Each authorization binds a one-time HMAC state value to the workspace, account, app revision, requested tasks, scopes, networks, issuer, resource, audience, and exact redirect URI. The callback requires the signed manifest's exact issuer, and the token exchange uses the same pinned DNS/TLS transport boundary as certified adapters. Verifiers and access/refresh tokens are AES-256-GCM encrypted with a dedicated server-only key; they never enter browser storage, prompts, model messages, tool results, logs, or account responses. Token resolution also requires the exact workspace, connection, app, and manifest revision. Revoking the connection atomically deletes its encrypted tokens. Public PKCE clients omit `clientSecretId`; confidential clients resolve their secret only from `MATTERHORN_CRYPTO_APP_SECRET_<ID>` at exchange time.

Certified `wallet_connection` apps use a five-minute personal-message challenge. The challenge is bound to the account, workspace, app revision, wallet family, address digest, actions, scopes, and networks, and is consumed atomically once. EVM and Sui signatures prove control only: they never authorize spending, approvals, signing, relaying, broadcasting, or submission. Raw addresses, messages, and signatures are not stored; the durable proof contains an HMAC address digest and an opaque internal proof reference. The reference is verified before capability authorization or network access and is removed from the transport request. Existing proof challenges cannot be used across tenants, connections, revisions, or changed grants. `MATTERHORN_CRYPTO_APP_WALLET_PROOF_SECRET` must be an independent server-only value of at least 32 bytes; enforce mode fails startup without it. The connected wallet remains the only transaction signing and submission surface.

The Phase 1 adapter-router core accepts only an active tenant connection pinned to the exact certified manifest revision; validates the exact action, network, scopes, and closed input schema; performs public-DNS checks; requires server-side run authorization; and returns a typed, quarantined, freshness-annotated result. Its first trusted JSON-over-HTTPS transport explicitly creates a TLS socket to a router-approved address, preserves certificate verification against the certified hostname, verifies the connected peer, refuses redirects and non-JSON responses, bounds request and response bytes, and resolves opaque credentials only inside the server boundary. Protocol-specific first-party reads may use the same pinned boundary with a bodyless `GET`; JSON `POST` remains available for exact request envelopes. No other HTTP method is accepted. GET bodies, missing POST bodies, URL credentials, fragments, non-HTTPS origins, redirects, deceptive JSON content types, and peer changes fail closed. Generic third-party adapter calls remain POST-only. Account-facing catalog and connection routes expose only redacted tenant-safe projections; execution remains backend-only until guarded enforcement rollout. No third-party adapter code receives authority to select its own destination or metering cost.

Signed `mcp_http` manifests use Matterhorn's [restricted certified MCP Streamable HTTP profile](./mcp-http-certified-profile.md), pinned to the stable `2025-11-25` protocol. Matterhorn performs the lifecycle itself and calls only the already-authorized signed action with already-validated arguments. It accepts only JSON `structuredContent` in the closed Matterhorn evidence envelope; dynamic discovery, prompts, resources, sampling, elicitation, tasks, SSE, server instructions, and content-only results are excluded. The implementation is dormant until an adapter independently passes sealed certification and an operator explicitly promotes it.

Signed `rpc` manifests use Matterhorn's [restricted certified JSON-RPC profile](./json-rpc-certified-profile.md). One authorized call maps to the exact signed action method with a fresh response-bound ID and the closed evidence envelope. Batch calls, notifications, discovery, subscriptions, callbacks, destination overrides, and upstream cost claims are excluded.

Signed `openapi` manifests may use Matterhorn's [restricted certified OpenAPI action profile](./openapi-certified-profile.md). The signature binds the adapter origin and one static `POST` path per action. Arbitrary API-document import, remote references, server lists, callbacks, links, redirects, query parameters, and caller-selected paths or methods are excluded. Legacy unprofiled OpenAPI manifests remain non-executable and cannot pass certification.

The guarded authorization bridge reuses Matterhorn's existing durable single-use capability broker. Certification must bind an app action to one compatible Matterhorn read or prepare tool; runtime authorization then hash-binds the exact manifest revision, connection, action, access, network, run, call, and canonical arguments. Adapter reservations survive restarts, are reconciled once, appear under the certified app/action in the private run receipt, and are revoked when the run closes. Server startup constructs the executable router only when both the Crypto App Gateway and guarded runtime are fully enforced. In `off` or `shadow`, no watch can reach a transport.

The operational-policy store defaults to `<data-dir>/crypto-apps/operational.db` and may be overridden with `MATTERHORN_CRYPTO_APP_OPERATIONAL_DB`. It atomically reserves a bounded per-call allowance against a workspace/day ceiling, reconciles measured cost exactly once, expires abandoned reservations without allowing call replay, and persists tenant-scoped circuit state across restarts. Its rows contain only identifiers, counters, timestamps, and outcomes—never prompts, arguments, credentials, wallet data, or adapter output. The default backend-only policy reserves at most 1,000,000 micro-units per call and 10,000,000 per workspace UTC day; launch-specific values must be explicitly configured when the gateway is wired into startup.

The account-safe catalog service returns only the current certified manifest projection. It exposes action descriptions, authority, risk, freshness, schemas, network, authentication type, and certification hashes while omitting adapter endpoints, detached signatures, publisher key IDs, security contacts, OAuth servers, vault references, and connected-wallet identifiers. Authenticated catalog and tenant connection lifecycle routes fail closed when `MATTERHORN_CRYPTO_APP_GATEWAY_MODE=off`; host-token-only routes own registration, certification, suspension, revocation, inspection, and history.

The invite-only developer staging service defaults to `<data-dir>/crypto-apps/developer-portal.db` and may be overridden with `MATTERHORN_CRYPTO_APP_DEVELOPER_DB`. Host-token operators issue short-lived, single-use invites; only signed-in Matterhorn accounts can consume them. Developers may register Ed25519 public keys, submit immutable signed testnet manifest revisions, inspect static conformance, and request certification. The service stores only a one-way invite hash and rejects private keys. A host may record an exact, hash-verified independent runtime outcome; developers receive only the pass/fail probes and affected action IDs, not host evidence hashes. Outcomes are immutable and policy-pinned. Developer keys are never inserted into the trusted runtime keyring, and recording a result never certifies, lists, promotes, executes, signs, or submits an app. Registry promotion remains a separate host-only operation. Mainnet requests fail closed.

The web app exposes two authenticated, lazy-loaded testnet surfaces. `/developer/crypto-apps` guides invited developers through public-key registration, signed manifest submission, static findings, and a certification request without accepting a private key. `/workspace/:id/crypto-apps` is discoverable from managed Tools and lets a workspace review certified capabilities, select research-only or wallet-preview access, connect an EVM or Sui wallet with a proof-only message, complete a certified OAuth authorization-code flow, and pause, resume, or permanently revoke its own connection. The account client deliberately omits host authority. Deployment-managed API connections require no secret field in the browser. OAuth uses S256 PKCE and exact manifest-bound issuer, resource, audience, redirect, tenant, and revision checks; verifiers and tokens remain encrypted and server-only. The UI never accepts credentials in chat. The connected wallet remains the only signing and submission surface.

### Operator coworker invitations

With `MATTERHORN_COWORKER_MODE=invite`, an operator can create one short-lived link without placing host authority in command arguments, output, or the browser URL:

```bash
MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \
pnpm invite:crypto-coworker -- \
  --server-url https://control-plane.example \
  --app-url https://matterhorn.example \
  --ttl-minutes 1440
```

The command calls only the host-authenticated invite route and places the returned `mhci_` token in the `/coworker-access` URL fragment. The app removes the fragment before rendering, keeps the token in memory only, and binds successful acceptance to the signed-in account. Each link is single-use; expiry, replay, cross-account use, and access after operator revocation fail closed. Coworker access never grants wallet signing or transaction-submission authority.

Operators manage accepted invitations with opaque access IDs, never account IDs, emails, or wallet addresses:

```bash
MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \
pnpm manage:crypto-coworkers -- list \
  --server-url https://control-plane.example

MATTERHORN_WORK_HOST_TOKEN=<server-only-token> \
pnpm manage:crypto-coworkers -- revoke \
  --server-url https://control-plane.example \
  --access-id mhca_<opaque-id>
```

Revocation is immediate and idempotent. It blocks coworker routes, new messages, certified app calls, and scheduled checks. Restoring access requires a new one-time invite and creates a new opaque access ID, so a stale operator handle cannot revoke the replacement grant. Account deletion removes the access record and unlinks the account from consumed-invite metadata. Revoked access and expired invite metadata are retained for no more than 365 days.

Signed test-harness contracts now define testnet-only Sui balance/transfer-preview actions, Hyperliquid market/orderbook/account/order-preview actions, and Bittensor subnet/validator plus transfer/stake/unstake-preview actions. They use closed input and model-facing output schemas, map every action to a compatible guarded tool, and never contain production publisher keys or automatic registration. Their offline router fixtures deliberately include private and malicious extra fields to prove projection removes them.

A signed Polymarket discovery contract defines one informational `polymarket_market_search` action over the unauthenticated Gamma API. Matterhorn constructs the exact same-origin `/public-search` request itself, permits only a bodyless `GET`, bounds the query and result count, and projects typed active-market fields plus the exact outcome token IDs needed for the next certified read. A separate signed CLOB contract defines only `polymarket_orderbook_read` against the unauthenticated CLOB origin. It accepts one canonical uint256 token ID returned by discovery, constructs `/book?token_id=...` itself, and projects at most 20 sorted bid and ask levels plus snapshot, tick, minimum-size, and freshness evidence. Splitting the origins prevents the discovery grant from reaching CLOB routes and prevents the CLOB grant from reaching account, order, cancellation, relay, or credential routes. Profile data, instruction-like fields, arbitrary URLs, methods, headers, wallet data, geoblock decisions, order preparation, signing, relaying, and submission remain outside both contracts. Because these are current mainnet public metadata rather than transaction-testnet actions, neither is included in the first-party testnet manifest bundle or accepted by the testnet promotion command. A separate public-read-only command can create a sealed `certified_mainnet` promotion body for exactly these two contracts after the same static, live egress, schema, tenant, quarantine, timeout, replay, quota, and circuit probes pass. Registration, certification execution with operator-owned signed inputs, and promotion remain explicit operator work; the gateway stays off by default.

The first-party executor can now read Sui balance/checkpoint data and Hyperliquid market, orderbook, and account data through DNS-pinned, TLS-verified transports. Hyperliquid order preparation refreshes testnet market definitions, book, margin state, lot precision, leverage, and slippage before producing a short-lived hash-bound wallet-review reference; it never calls the exchange endpoint. Sui transfer preparation uses the official transaction builder and a binary gRPC-web client over a pinned HTTP/2 socket. The exact transport allowlist is `StateService/GetBalance`, `StateService/GetCoinInfo`, `LedgerService/GetServiceInfo`, `LedgerService/BatchGetObjects`, `LedgerService/GetTransaction`, and `TransactionExecutionService/SimulateTransaction`; the batch object read exists only for official Walrus certification parsing, while the single transaction read exists only for exact wallet-receipt verification. Receipt promotion requires a valid Sui digest, exact signer and gas owner, an unambiguous two-command native transfer, exact recipient and amount, explained native balance changes, and a canonical uint64 epoch. Missing ownership, hidden union variants, or malformed chain metadata fail closed. `ExecuteTransaction`, batch transaction lookup, signing, and every other gRPC method fail before dialing. Successful simulations return exact terms, a 15-second expiry, gas estimate, simulation hash, and chain version without transaction bytes or signatures. Hyperliquid and Sui public reads have been verified against their pinned live testnet transports. The executor is reachable from scheduled coworkers only in fully enforced mode, through the certified router and a single-use read capability; all production modes still default to `off`.

The Bittensor first-party contract uses exact bodyless `GET` requests for public subnet/validator reads and one exact JSON `POST /extrinsics/prepare` plus a public wallet read for transfer, stake, and unstake previews. The model's free-form request, endpoint overrides, headers, credentials, and unknown fields are not forwarded. The executor requires Python-SDK output explicitly identifying the `test` network with live freshness and a concrete block, rejects mock and Finney responses, validates the complete prepared action against authorized arguments, requires current balance/stake plus network and swap fees, bounds subnet and validator counts, and projects no unsigned payload, coldkeys, owners, warnings, raw metadata, key material, or instruction-shaped control fields. The sidecar's `/submit` route permanently returns `501 wallet_airlock_required`; its Python bridge has no submit handler or enabling switch. Registration, live runtime certification, and rollout remain explicit operator work; the gateway and guarded runtime stay off by default.

### Operator testnet certification

`pnpm certify:crypto-app` runs the static manifest gate and every sealed runtime adversarial probe before producing the exact host-route promotion body. It supports only Matterhorn's signed Sui, Hyperliquid, and Bittensor testnet manifests, including Bittensor wallet-only preparation probes. It deliberately rejects the separate Polymarket mainnet public-research contract. The action-input file must be an owner-only regular file (`0600` on Unix); action arguments, linked wallet identities, live output, secrets, and capability material are never written to the promotion artifact or command logs.

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

### Operator public-read certification

`pnpm certify:crypto-app-readonly` is a separate, fail-closed path for the signed first-party Polymarket discovery and CLOB order-book contracts. It accepts only one exact `polymarket:public` mainnet network, no authentication or scopes, and actions that are exclusively `read` plus `informational`. Prepare, simulation, account, wallet, order, signing, relay, submit, alternate-network, or third-party app authority is rejected before live transport. The resulting `certified_mainnet` artifact contains report and evidence hashes only—never queries, token IDs, upstream output, credentials, or capabilities—and the command does not register or promote it.

```bash
chmod 600 /secure/public-read-inputs.json
pnpm certify:crypto-app-readonly -- \
  --manifest /secure/signed-polymarket-manifest.json \
  --publisher-public-key /secure/publisher-public-key.pem \
  --inputs /secure/public-read-inputs.json \
  --policy-version crypto-app-public-read-v1 \
  --output /secure/public-read-certification-promotion.json
```

The input file contains either a bounded public discovery query or one canonical outcome token ID. Signing the manifest, running this command against the live public endpoint, inspecting the sealed artifact, registering it, and promoting it remain separate operator actions.

### Durable coworker profiles

Phase 2 profile storage is available only when `MATTERHORN_COWORKER_MODE` is not `off` and an explicit `MATTERHORN_COWORKER_POLICY_VERSION` is configured. It defaults to `<data-dir>/crypto-coworkers/coworkers.db` and may be overridden with `MATTERHORN_COWORKER_DB`. Off mode performs no database access.

Authenticated routes under `/workspace/:id/coworkers` create, list, inspect, revise, pause, revoke, and delete only the requesting identity's profiles. The server owns workspace, owner, revision, policy version, lifecycle state, and the immutable connected-wallet-only escalation boundary. Client JSON cannot supply those fields. Profiles use optimistic revisions; a stale edit, state transition, or deletion fails without mutation. A policy-version change makes older profiles non-resolvable until an explicit revisioned update rebinds them. Account responses omit the internal owner identifier, and workspace/owner composite scoping prevents enumeration across tenants.

`GET /workspace/:id/coworker-templates` exposes four chat-first templates: `Market Analyst`, `Risk Monitor`, `Transaction Coordinator`, and `Treasury Coworker`. `POST /workspace/:id/coworkers/from-template` creates an owner-scoped copy with optional name and mission overrides. The first two remain read/watch only. The latter two can prepare at most one exact testnet wallet review per action family; they have no signing, relay, broadcast, or submission authority.

Every selected coworker also receives a concise, versioned, server-owned master prompt from `apps/server/src/crypto-coworker-master-prompt.ts`. Browser input, Memory, files, app metadata, MCP output, and the model cannot alter this layer. The prompt narrows the role, treats external content as untrusted data rather than instructions, consent, or financial intent, and accepts transaction intent only from the user's current direct request. Terms from files, Memory, app output, or a prior action cannot be reused as authority. Exact preparation ends at one expiring connected-wallet review. The authoritative privacy hash includes this server context, so a prompt change invalidates one-request consent.

The authoritative message preflight and submission routes accept an optional `coworkerId`. A selected coworker is resolved only from the signed-in identity and active server record. Its mission becomes versioned workspace-private system context, and its exact profile revision, policy version, app/action/network/data-label allowlist, proxy-tool mapping, and per-run budgets are bound into the hidden run grant. Coworker execution fails closed unless both the Crypto App Gateway and guarded runtime are in `enforce`. Direct legacy crypto tools are denied for coworker runs; only an exact certified app/action proxy binding can receive a capability. Data outside the coworker's allowlist is rejected before provider dispatch, and editing, pausing, revoking, deleting, or changing the deployment policy invalidates active and staged coworker authority. Templates refuse unverified providers for private context rather than offering one-request consent.

Venice private mode discovers the current provider catalog through the pinned public models endpoint and admits only explicitly private, online, stable, non-deprecated, tool-capable text models. Venice's E2EE and TEE models are deliberately excluded from the current OpenAI-compatible path: those models require the provider's dedicated client-side encryption or attestation protocol, which Matterhorn does not claim to implement. This prevents an E2EE/TEE badge from being exposed while the request would still use the ordinary compatible transport. A future E2EE integration must have its own reviewed transport, key lifecycle, attestation verification, and failure tests before those models can be admitted.

The account response includes the exact expiry of the server's Venice catalog proof. The composer enables and labels `Private` only while that proof is current; a missing field from an older server, an expired proof, a catalog refresh failure, or a model removed from the catalog makes the control unavailable and opens model setup instead. The authoritative message gateway independently repeats the same check immediately before dispatch.

Each coworker also has an explicit `matterhorn.coworker-resource-scope.v1` grant. The durable tenant record contains only exact Agent File revisions, Memory record versions, and certified app connection/action/network identifiers selected by the user. An absent scope grants zero app authority. `GET /workspace/:id/coworkers/:coworkerId/resources/recommendation` may suggest files already assigned to that coworker, Memory whose existing tags match its approved protocols or assets, and current certified connections inside its fixed role. The advisory response contains display metadata but no resource content, credentials, or wallet authority. It is tenant-, profile-, scope-revision-, resource-hash-, app-revision-, action-, and network-bound; accepting it through the normal resource `PUT` requires the exact recommendation hash and exact suggested IDs. Matterhorn recomputes the proposal immediately before saving, while any manual edit discards recommendation status and becomes an ordinary explicit selection. Nothing is granted automatically. Before every message, the server revalidates the current profile, file hashes, Memory versions, connection certification, actions, and networks; any deletion, mutation, disconnect, stale revision, or tenant mismatch makes the scope inactive. Private files or Memory force `private_workspace` handling and cannot be sent to an unverified provider through consent. The account UI sends only identifiers and optimistic revisions, keeps chat unavailable until an active scope contains an app connection, and degrades app and file availability independently without exposing raw resource content.

`GET` and `PUT /workspace/:id/coworkers/:coworkerId/state` expose owner-scoped structured working state. The closed schema stores only bounded decisions, observed positions, unresolved risks, pending wallet-review intent hashes, evidence hashes, and explicitly approved Memory IDs—never transcript history, signing material, or unrestricted tool output. Writes require both the latest profile revision and an optimistic state revision. Policy and lifecycle changes immediately clear pending financial work and rebind the retained non-financial state; deletion and workspace purge remove it. Active state is compiled into bounded workspace-private model context and its approved Memory records pass through the normal privacy preflight.

`GET|POST /workspace/:id/coworkers/:coworkerId/watches` lists or creates bounded owner-scoped read/watch schedules. Each schedule is locked to one approved app, action, network, scalar parameter set, cadence, condition set, and per-check budget. `PATCH|DELETE .../watches/:watchId` explicitly pauses/resumes or deletes a watch. Profile edits, coworker pause, and revocation pause every schedule; no watch has prepare, signing, relay, broadcast, or submission authority.

`GET /workspace/:id/coworkers/:coworkerId/inbox` returns bounded alerts, questions, and notices. Account clients can only mark an item read or dismissed through `PATCH .../inbox/:itemId`; there is no account-facing alert creation route. Every alert requires typed evidence provenance, freshness, reason codes, budget impact, and a safe next action. Inbox records never contain raw prompts, secrets, signatures, or unrestricted tool output.

The server-owned watch runner claims each due schedule atomically with a short lease and UTC-day counter. It then opens a model-free guarded run whose receipt reports zero model tokens and one exact read budget, resolves one active tenant connection, and calls only that certified app/action/network through the adapter router. Conditions may inspect at most four levels of typed scalar output; arbitrary expressions and instruction-bearing tool output are never evaluated. `changed` establishes a baseline before alerting. Completion, next schedule state, prior condition values, result hash, and any inbox item commit in one transaction. If the coworker or watch changes while the call is in flight, the completion is discarded and no alert is created.

Account deletion purges tenant coworker state, schedules, inbox items, certified-app connections, gateway usage reservations, and circuit records before the workspace deletion step can complete. Repeating a partially completed deletion remains idempotent.

The shared account store runs privacy maintenance at startup and daily. Expired login sessions, verification capabilities, and password-reset capabilities are deleted. Pending email whose verification code or reset link has expired is stopped and its payload is erased before the challenge is removed. Finalized delivery metadata and completed deletion manifests are retained for at most 365 days, while active retries, email suppressions, and incomplete deletion jobs remain available for safety and recovery.

Future readiness rules are fail-closed:

- Enforced app access requires the guarded agent runtime in `enforce`.
- Invite/public coworkers require an enforced app gateway.
- Public coworkers require signup to be deliberately enabled.
- Walrus evidence requires an HTTPS authenticated publisher and server-side encryption-key reference.
- Walrus mainnet additionally requires an explicit production acknowledgement.

The evidence-key foundation uses AWS KMS envelope keys when configured. Set `MATTERHORN_EVIDENCE_KMS_REGION` and `MATTERHORN_EVIDENCE_KMS_KEY_ID`; AWS credentials continue through the SDK's server-side credential chain and must never use a browser-visible variable. `MATTERHORN_EVIDENCE_KMS_ROTATION_DAYS` defaults to `90` and controls the daily, serialized rewrap scan. KMS receives only a random-nonce-bound digest as encryption context—not account, workspace, run, coworker, or wallet identifiers. Rotation uses KMS `ReEncrypt`, so the plaintext data key never returns to Matterhorn. The durable tenant index stores the KMS-wrapped data key and ciphertext locally, enforces owner/workspace/coworker isolation, and clears the wrapped key before a secure SQLite/WAL checkpoint during expiry, workspace deletion, or user-requested key destruction. Seal, decrypt, proof, rotation, denial, and destruction events are tenant-scoped, hash-chained, content-free, and expire after 365 days.

Encrypted Evidence and Agent Files additionally require a dedicated recovery-erasure ledger. Each deletion first writes an HMAC-authenticated tombstone derived from the wrapped key and its random context; the ledger stores no account, workspace, file, run, coworker, wallet, ciphertext, or KMS identifiers. It lives at `MATTERHORN_ERASURE_LEDGER_DB`, is excluded from the ordinary host rollback snapshot, and is reconciled before encrypted records become readable at startup. A restored stale Evidence record is forced to `key_destroyed`; a restored stale Agent File and any pending renewal are removed. Modified chains, missing secrets, missing external ledgers, and ledgers older than the backup checkpoint fail closed. The operator must retain the current ledger independently of every host archive and pass it explicitly to a restore.

The Agent Files boundary is provider-neutral and runs before encryption, storage, Walrus publication, or model access. It currently accepts only bounded UTF-8 text, Markdown, CSV, and JSON selected by the user. Files are SHA-256 bound, workspace-private, read-only, explicitly allowlisted to one or more coworkers, and always carry zero wallet authority. Private keys, recovery material, secret-shaped filenames, executable files, malformed JSON, undeclared request fields, changed bytes, expired access, and coworker mismatches fail closed. Format-aware checks reject bare or unlabelled 32-byte keys, Sui private-key strings and legacy keystore entries, Bitcoin wallet-import keys, extended private keys, Solana byte-array exports, private JWK members, encrypted Ethereum keystores, and private-key PEM blocks. Public hashes, addresses, and transaction signatures remain available when identified as public evidence. The same scan runs again before model-context compilation so an older stored descriptor cannot bypass a newly recognized secret format. Model context is quarantined as data and capped at 2,000 characters per file with an explicit narrower-excerpt recovery path.

Matterhorn Memory applies the same format-aware exclusion to the exact model-facing title, summary, and body before capture, suggestion acceptance, browser session-context storage, export eligibility, or chat use. Selected records are rescanned immediately before privacy preflight and provider dispatch, so a legacy or restored record cannot bypass a newer detector. This closes the unlabeled-key case as well as secret-shaped field names and phrases. Explicitly identified public hashes, digests, addresses, accounts, checksums, and public keys remain available as structured evidence. Rejection returns only a stable safety category and never echoes the detected value.

Persistent Crypto Coworker content uses the same boundary. Model-facing profile text, structured working state, watch definitions, watch result values, and inbox items are scanned before storage or state transition. Every restored SQLite row is rescanned before it can be listed, scheduled, compiled into model context, or returned to an account, preventing an older profile, state, watch, or alert from bypassing a newly recognized secret format. Corrupt records fail closed and never fall back to an unvalidated copy.

`MATTERHORN_AGENT_FILES_MODE=encrypted` enables the durable account API only when coworkers and the server-side KMS boundary are configured. `GET|POST /workspace/:id/agent-files` list metadata or encrypt a user-selected file, `POST /workspace/:id/agent-files/:fileId/recover` returns the exact original bytes only to the authenticated owner after tenant, expiry, integrity, and revision checks, and `DELETE /workspace/:id/agent-files/:fileId` performs revision-bound cryptographic deletion. List and mutation responses never contain file bytes, ciphertext, wrapped keys, owner identifiers, or KMS references; the recovery response is a no-store attachment with content sniffing disabled. Each upload must name existing coworkers owned by the same account. The authoritative message gateway accepts up to eight `agentFileIds`, decrypts them only for the exact selected coworker, rescans and hash-verifies the bytes, and binds the private context into the normal provider preflight and exact-request consent hash. Expiry and account deletion destroy recovery material before removing the durable record. This storage layer grants no tools, connectors, signing, or transaction authority.

When both Agent Files and testnet Walrus evidence are enabled, `POST /workspace/:id/agent-files/:fileId/publish` requires the exact current revision plus an explicit public-ciphertext acknowledgement. Matterhorn uploads only a generic AES-GCM public envelope, verifies its pinned Sui certification, reads the exact bytes back from Walrus, and then records redacted publication metadata. `POST /workspace/:id/agent-files/:fileId/verify` independently repeats certification and byte reconciliation. Verification reports the remaining storage window, warns when two or fewer epochs remain, and fails with a stable expired-copy result once the certification lifetime ends. During that renewal window, `POST /workspace/:id/agent-files/:fileId/renew` prepares and simulates an exact, five-minute Sui testnet transaction bound to the tenant, file revision, signer, epochs, and certification. The browser verifies the digest before the connected wallet reviews, signs, and submits it. `POST /workspace/:id/agent-files/:fileId/renew/confirm` is single-use and records the extension only after Sui confirms the exact digest, signer, and renewed Walrus certification. The public object contains no filename, tenant ID, coworker ID, KMS reference, or plaintext. Deletion destroys the recovery key and pending renewal immediately even if residual public ciphertext remains. Publication and renewal are testnet-only, single-instance, configuration-gated, and never automatic; agents receive no wallet, renewal, payment, relay, or submission authority; mainnet remains disabled.

Account users can inspect their redacted evidence packets through `GET /workspace/:id/crypto-evidence`, explicitly store one exact sealed revision through `POST /workspace/:id/crypto-evidence/:evidenceId/publish`, request independent read-only verification through `POST /workspace/:id/crypto-evidence/:evidenceId/verify`, and irreversibly delete one exact revision's recovery key through `DELETE /workspace/:id/crypto-evidence/:evidenceId/recovery-key`. For new connected-wallet-owned deletable Blob objects, `POST /workspace/:id/crypto-evidence/:evidenceId/delete` prepares and simulates a five-minute deletion transaction and `/delete/confirm` accepts it once only after pinned Sui verification of the exact digest, signer, object, and successful effects. Matterhorn then destroys the recovery key and stores only bounded public transaction metadata. Publication, renewal, deletion, and key destruction are mutually serialized through short-lived durable SQLite state. Published run evidence is also checked at startup and every six hours by a bounded read-only verifier; its redacted, exact-revision status is shown in the account response and discarded as soon as the evidence revision changes. New publisher requests explicitly set `deletable=true` and `send_object_to=<connected wallet>`; Matterhorn independently verifies that exact `AddressOwner` before accepting the publication. Legacy or publisher-owned records remain recovery-key-deletion-only. Responses state that public ciphertext may remain in caches or independent copies and never claim universal erasure. Tenant identifiers, coworker IDs, wallet addresses, KMS references, wrapped keys, prompts, signatures, and ciphertext remain private. Matterhorn never signs, pays, or submits these transactions; the connected wallet does. When evidence mode is `off`, list and network operations fail closed while local owner-controlled key deletion remains available when the evidence KMS boundary is configured.

## Build sequence

The comprehensive execution plan, delivery cadence, metrics, and stop conditions are maintained in [`phases-1-5-plan.md`](./phases-1-5-plan.md). Monid-derived discovery patterns and crypto-specific changes are documented in [`monid-reference-audit.md`](./monid-reference-audit.md); Grok Bot's persistent-teammate patterns and the boundaries Matterhorn deliberately tightens are documented in [`grokbot-reference-audit.md`](./grokbot-reference-audit.md).

### Phase 1 — Crypto App Gateway

- Signed and version-pinned manifest registry.
- Workspace-scoped app connections and token vault.
- MCP/OpenAPI/RPC/SDK adapter router.
- Typed output projections, freshness metadata, timeouts, quotas, circuit breakers, and revocation.
- Conformance suite and testnet certification.
- Wrap Sui, Hyperliquid, and Bittensor as transaction-capable testnet adapters whose financial authority ends at connected-wallet review.

Exit: a malicious or malformed adapter cannot broaden authority or expose a model-facing submit route.

### Phase 2 — Persistent coworkers

- Coworker storage, ownership, mission, pause/revoke, limits, and policy versioning.
- Chat-first setup for all four initial roles, with prepare authority available only to the Transaction Coordinator and Treasury Coworker and only as an exact connected-wallet review.
- Durable watches with an inbox for alerts and questions.
- One active run per session and bounded tool/model budgets.
- Replacement requests stop the current response before dispatch and receive a new server-owned message/run binding; abort failure sends nothing.
- Explicit data disclosure and Memory selection.
- Compact mobile workspace navigation exposes Coworkers, Files, MCPs, Memory, Notes, Wallet, Profile, and all crypto desks through the same shareable panel routes as the desktop rail.

Exit: the user can operate a coworker through chat, see its allowed/approval/prohibited boundary, and stop it immediately.

### Phase 3 — Transaction Coordinator

- Canonical `crypto-intent.v1` production from certified Sui, Hyperliquid, and Bittensor adapter outputs is complete. The compiler cross-checks request and result terms, rejects stale simulations, hash-binds exact terms and policy, and regenerates only wallet-review-only v2 handoffs. The account-facing transaction policy admits only the exact signed Bittensor testnet app, `bittensor:test` network, and transfer/stake/unstake preparation actions; each is valued at zero USD on testnet for configured spend limits and still ends at a connected-wallet review.
- Policy intersection across platform, organization, user, coworker, app, run, and call is complete at the guarded server boundary. Static denials occur before adapter egress; a wallet handoff additionally requires an exact durable single-use capability proof and trusted economic/compliance facts.
- Certified Sui and Hyperliquid pending-review persistence and protocol-aware freshness regeneration are complete. Reviews are exact-connection bound, auto-expire, are cancelled when coworker authority changes, and can be regenerated only through a new guarded run with identical canonical terms.
- Account-safe list, inspect, cancel, wallet-panel staging, and public-receipt reconciliation are complete across Sui, Hyperliquid, Bittensor, and Polymarket whenever a certified pending intent exists. A wallet-activity row stages its immutable reviewed-action v2 and a separate one-shot owner/workspace/session/coworker/revision/protocol/network/signer/operation/argument-hash context into only the matching protocol panel. Expired or mutated bindings fail before navigation; stale-but-unexpired simulations proceed only to server refresh. Bittensor test/local intents stay closed in the current Finney-only wallet build. Polymarket also rechecks Polygon, exact operation, reviewed signer, and the user's current browser location before wallet authorization. The browser calls Polymarket's exact documented geoblock endpoint without credentials, cache, or referrer data, discards the returned IP, and fails closed before new-order preparation and again before submission; cancellation is not blocked so close-only users can reduce risk. Its wallet ticket pins the official CLOB V2 client, explicit EOA/funder binding, FAK execution, and current pUSD collateral; legacy V1 clients are rejected, and temporary L2 credentials remain browser-only and are erased after the attempt. The wallet UI reports submitted or failed public metadata through the account client after connected-wallet execution or receipt import, while unknown exchange outcomes remain pending with a do-not-resubmit warning. The server fetches the immutable intent, requires the exact owner/coworker/workspace, binds the connected-wallet metadata to the exact network, signer, operation, authorized arguments, guarded run, policy, and simulation, and rejects secrets and raw signatures. Certified Polymarket transaction preparation remains a separate incomplete adapter/certification milestone; the browser eligibility and receipt paths do not grant it.
- Sui wallet receipts are accepted only with a null block hash and are first checked through the exact pinned `LedgerService/GetTransaction` lookup. Exact testnet digest, signer, gas owner, native-SUI split/transfer command graph, recipient, amount, effects, and balance changes must match before the receipt is promoted to `chain_verified_public_metadata`; hidden commands or unexplained deltas fail closed. A transient not-found/unavailable lookup may persist the exact wallet-reported digest as unverified metadata for later retry, but it is never represented as chain-confirmed.
- Wallet review, rejection, expiry, tamper invalidation, regeneration, submission, and public-receipt reconciliation.
- Sui first, then Hyperliquid, Bittensor, and Polymarket.

Exit: coworkers can prepare exact financial work but no agent-facing path can sign or submit it.

### Phase 4 — Walrus evidence

- Canonical minimal evidence receipt: local compiler complete for finalized guarded runs, with closed fields and per-bundle salted identity hashes.
- Envelope encryption before publication: AES-256-GCM sealing, exact recipient binding, and plaintext-key zeroization complete.
- Public ciphertext boundary: Walrus-eligible bytes exclude local KMS references and plaintext hashes; deterministic Merkle batching and proof verification are complete.
- Authenticated, peer-pinned testnet Walrus publisher and byte-exact readback gate: backend implementation complete. Account routes expose owner-scoped redacted packets, explicit per-revision ciphertext publication, and read-only verification.
- Quilt batching for small encrypted bundles: implemented with atomic tenant-record attachment after every patch and the shared Sui certification verify.
- Pinned Sui Walrus certification verification, scheduled read-only integrity health, and the account-facing proof UI: complete for existing stored testnet publication records.
- Expiry warning, fail-closed verification, user deletion, encryption-key destruction, and connected-wallet testnet renewal are complete for Agent Files. Wallet-owned run evidence additionally supports exact simulated, single-use testnet deletion followed by recovery-key destruction. Automatic, agent-initiated, infrastructure-submitted, and mainnet lifecycle operations remain disabled.

The implemented foundation can perform an authenticated testnet Walrus ciphertext upload, independently verify pinned Sui certification and exact wallet ownership, and prepare connected-wallet Agent File renewal, run-evidence deletion, or immutable non-content Sui anchoring. The account-facing surface lists redacted records, reports local/key-destroyed/deleted states, asks for explicit acknowledgement before publishing one exact encrypted revision, automatically refreshes read-only integrity health, verifies existing publication without disclosing ciphertext or tenant metadata, and opens only an exact simulated transaction in the owning wallet. Finalized coworker runs are sealed automatically into local encrypted evidence; nothing is published, anchored, renewed, or deleted automatically. Ciphertext-only Quilt batching is implemented. Anchor code is complete but dormant until an operator audits and publishes the exact Move package and configures its package ID. Matterhorn itself performs no Sui transaction submission, and mainnet remains fail-closed and disabled.

Exit: a user can independently verify a financial run without any plaintext prompt, secret, wallet signature, or private attachment appearing in public storage.

### Phase 5 — Developer platform and private beta

- Invite-only backend developer portal: one-time enrollment, account-isolated public publisher keys, immutable signed testnet manifest submissions, static conformance, host-inspected certification requests, and immutable passed/failed runtime outcomes are complete.
- Developer keys remain staging-only. Host-recorded outcomes must verify against the exact manifest, static report, and policy; account views omit host evidence hashes. Registry promotion stays behind a separate host-token boundary and is never automatic.
- The TypeScript SDK now provides deterministic manifest construction, external-signing requests, detached-signature attachment, the same closed JSON-schema input/output evaluator used by the server, inert generic and Sui/Hyperliquid testnet fixture validation, a non-authoritative local policy emulator, an account-cookie developer client limited to enrollment/public-key/testnet-staging/certification requests, redacted terminal review results, and a privacy-safe readiness contract that returns one deterministic next step. Its advisory local adapter runner accepts only a developer-owned invocation callback: it supplies no fetch client, credential, wallet, signer, submit method, or mainnet target; secret-shaped inputs fail before invocation, while typed projection, freshness, timeout, abort, size, and stable-error checks mirror the safe local boundary without claiming certification. An invite-link-only account UI guides enrollment, public-key registration, signed testnet manifest submission, static or runtime failure repair, and certification requests without exposing private-key, execution, promotion, credential, or mainnet controls. The workspace app catalog now supports plain-language search, task/protocol/network filters, safe action and risk details, privacy and health links, metering disclosure, version status, connection history, and tenant-scoped connect/pause/resume/revoke controls.
- The SDK now also emits versioned, client-only setup packets for Matterhorn Skill instructions, Codex, Claude Code, generic MCP clients, the CLI, and the authenticated HTTP API. Generated packets accept no credential values, exclude host and wallet authority, reject unsafe origins and paths, use the real local-checkout MCP distribution, and carry an explicit wallet-only signing boundary.
- The `matterhorn-work mcp config` CLI now resolves checked-out MCP entrypoints instead of silently advertising unpublished packages. Generated configuration is client-scoped by default; host approval authority requires the separate `--include-host-approvals` opt-in.
- The `pnpm create:crypto-app` quickstart now scaffolds one locally validated, read-only Sui, Hyperliquid, or Bittensor testnet adapter in a new directory. It emits an unsigned manifest, canonical external-signing request, inert fixture, developer-owned callback, and advisory validation report; refuses overwrite; performs no network access; and creates no key, credential, wallet, certification, financial action, or mainnet authority. Enrolled developers can choose the network, app ID, public test endpoint, and new folder in the invite-only portal, then copy the same SDK-validated command without sending those fields to Matterhorn.
- The Crypto App SDK release candidate is now a standalone ESM and TypeScript artifact rather than a package that requires Matterhorn's private workspace types at runtime. Its packaged JSON-schema subpath and quickstart binary are verified from an offline clean install. The mandatory supply-chain check rejects tests, environment files, lockfiles, and workspace artifacts in the tarball, then proves the installed CLI still creates only testnet read authority. The package is not published yet; registry publication and provenance attestation remain a separate operator action, and generated MCP setup remains local-checkout-only until its own packages are released.
- Operators can issue a one-time developer link with `pnpm invite:crypto-developer`. The command reads host authority only from the server environment, never accepts or prints it as an argument, and places the developer token in a URL fragment rather than a query or path. The account-gated portal removes that fragment before accepting the invite and never writes it to browser storage.
- The developer portal now exposes 7- or 30-day operational usage for one owned app revision at a time. `GET /developer/crypto-apps/submissions/:appId/:manifestRevision/usage?days=7` returns aggregate calls, outcomes, latency, reconciled micro-USD cost, and separate tool-cost caps. Ownership is checked before the ledger is read; the response contains no workspace, tenant-count, connection, reservation, run, call, prompt, credential, wallet, argument, or result data. Expired unfinished reservations are reported as abandoned, never left looking active. This is operational metering only; billing and provider revenue sharing remain deferred.
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
