# Guarded Crypto Coworkers: Phases 1–5

Status: active delivery goal

Reference patterns: [Monid reference audit](./monid-reference-audit.md) and [Grok Bot reference audit](./grokbot-reference-audit.md)

## Execution status

- Phase 0 contracts, fail-closed flags, threat model, and offline evidence encryption: complete.
- Product-reference boundary: complete. Monid informs capability discovery and developer setup; Grok Bot informs the named persistent-teammate, chat-first handoff, reviewable-result, and tested-routine experience. Matterhorn does not copy broad cloud-computer authority, cross-coworker session sharing, model-based financial approval, or mandatory non-private storage.
- Phase 1 signed manifest registry and static conformance gate: complete.
- Phase 1 manifest trust boundary: complete. Every authority-bearing manifest object is closed against unknown fields; identifiers, descriptions, networks, actions, scopes, and audiences are bounded; action identifiers use canonical lowercase snake case; composite signing, submission, relay, broadcast, and unqualified execution names fail closed; freshness and timeout metadata must be finite, integral, and internally consistent; and OAuth issuer/resource, adapter transport, privacy-policy, status, and URL-based security-contact destinations must be canonical public HTTPS locations without credentials, query, fragments, local names, literal IP addresses, path normalization, or non-default ports. Security contacts may instead use one bounded public email address.
- Phase 1 durable manifest/certification history, atomic revocation, and policy-version invalidation: complete.
- Phase 1 tenant-scoped connection grants with opaque vault/wallet references and immediate certification revocation: complete.
- Phase 1 adapter-router core, closed schema validation, runtime DNS/egress checks, typed output projection, untrusted-data quarantine, timeout handling, usage reservation/reconciliation, and circuit breaking: complete and backend-only.
- Phase 1 schema admission hardening: complete. The shared SDK/server evaluator requires bounded ASCII property names; rejects direct and composite secret, credential, signature, signing-payload, transaction-byte, and sign/submit/relay/broadcast authority fields at every input/output nesting depth; and admits only bounded, type-correct scalar constants and enums. Descriptions are bounded and control-free, keywords must apply to the declared type, unsupported keywords cannot inject attacker-controlled error text, contradictory bounds and ambiguous `oneOf` siblings fail closed, and runtime field errors redact invalid names. Global schema and runtime-value traversal budgets complement the depth, array, object-property, and string limits, preventing wide or nested certified data from exhausting the gateway. Unsafe manifests cannot produce SDK signing bytes, invoke the local adapter runner, pass server conformance, or reach typed model-facing projection.
- Phase 1 trusted JSON-over-HTTPS transport foundation with DNS address pinning, TLS hostname verification, peer verification, redirect/content/size bounds, and server-side credential resolution: complete and backend-only.
- Phase 1 pinned JSON method boundary: complete and backend-only. Certified transports may use only bodyless `GET` or JSON `POST`; unsupported methods, GET bodies, missing or invalid POST bodies, credential-bearing or non-HTTPS URLs, fragments, redirects, peer changes, request/response-size violations, and non-JSON or deceptive JSON-prefixed media types fail before or during the pinned request. Existing generic adapter calls remain POST-only.
- Phase 1 guarded-runtime authorization bridge with explicit certified-action-to-tool bindings, exact hash-bound single-use capabilities, durable reservations, restart-safe receipts, and run-close revocation: complete and backend-only.
- Phase 1 signed, testnet-only Sui, Hyperliquid, and Bittensor transaction-capable manifest contracts, closed projections, guarded-tool bindings, and offline routed fixtures: complete and backend-only. Bittensor authority is limited to public reads and transfer/stake/unstake preparation; it has no sign, submit, relay, or broadcast capability.
- Phase 1 pinned live-source executor: Sui balance/checkpoint reads and exact transfer simulations, Hyperliquid market/orderbook/account reads and exact short-lived order previews, and Bittensor subnet/validator reads plus exact short-lived transfer/stake/unstake previews are complete and backend-only. Hyperliquid preparation never calls the exchange endpoint, and the Bittensor sidecar permanently returns `wallet_airlock_required` for `/submit` with no Python SDK submit handler.
- Phase 1 Sui SDK boundary: complete and backend-only. Matterhorn injects an explicit binary gRPC-web transport over a TLS-verified, IPv4-pinned HTTP/2 socket. The exact allowlist contains `StateService/GetBalance`, `StateService/GetCoinInfo`, `StateService/ListOwnedObjects`, `LedgerService/GetServiceInfo`, `LedgerService/BatchGetObjects`, `LedgerService/GetTransaction`, `MovePackageService/GetFunction`, and `TransactionExecutionService/SimulateTransaction` for typed balance, coin selection, coin and Move metadata, checkpoint freshness, Walrus object certification, exact wallet-receipt verification, transaction construction, and simulation. The additional object and Move lookups are used only by the official Sui/Walrus transaction builder. `GetTransaction` accepts one exact digest and remains read-only. `ExecuteTransaction`, batch transaction lookup, and every other method fail before dialing.
- Phase 1 durable operational policy: complete and backend-only. Workspace/day quota reservations, per-call cost ceilings, replay-safe reconciliation, abandoned-reservation expiry, tenant purge, and circuit state persist atomically in SQLite across process restarts.
- Phase 1 certification promotion boundary: complete and backend-only. A passing static manifest report is insufficient by itself; promotion now requires a hash-bound runtime adversarial report covering authority, pinned egress, tenant isolation, schema drift, untrusted output, abort behavior, capability replay, restart-safe quota/circuit state, wallet-only simulation, and authenticated-credential confusion where applicable. Only redacted evidence hashes are retained.
- Phase 1 account-safe catalog and connection service: complete. Authenticated discovery includes only the current certified revision, exposes signed/report hashes and closed action schemas without adapter endpoints or publisher/credential/creator internals, removes suspended apps immediately, and delegates connection lifecycle through tenant-scoped redacted views. Browser JSON cannot supply vault references or wallet IDs. Every surface fails closed while gateway mode is `off`.
- Phase 1 certified OAuth connection lifecycle: complete and backend-only. S256 PKCE, exact issuer/resource/audience/redirect binding, five-minute single-use HMAC state, tenant-and-revision-bound AES-256-GCM verifier/token storage, pinned token exchange, coalesced refresh, and fail-closed confidential-client secret resolution are implemented without exposing credentials to the browser, model, MCP, logs, or receipts.
- Phase 1 connection setup retention: complete. Expired wallet proof challenges and OAuth setup flows are automatically removed after a 24-hour recovery window. An expired OAuth verifier envelope is erased on the first hourly maintenance pass even during that window; active connections and refreshable OAuth tokens are not included in this cleanup.
- Shared account security retention: complete for the invite boundary. Expired login sessions, email-verification challenges, and password-reset challenges are removed at startup and daily. Pending email containing an expired verification code or reset link is terminalized and its payload erased before delivery. Finalized email-delivery rows and completed deletion manifests expire after 365 days; active challenges, sessions, delivery retries, suppressions, and incomplete deletion jobs are retained.
- Phase 5 workspace app catalog: complete for the invite testnet slice. Users can search by app or task, filter by task type, protocol, and exact network, inspect plain-language authority/risk/freshness/privacy/health/version/cost status, see prior revocations, and connect, pause, resume, or permanently remove tenant-scoped access. The browser receives no adapter endpoint, publisher key, signature, security contact, credential reference, owner identifier, or wallet identifier.
- Phase 5 SDK publication and published-provenance verifier: complete in code and dormant. The manual workflow requires a protected GitHub environment review, exact `dev` head, exact package version, matching immutable release tag, explicit typed confirmation, fixed public registry, pinned actions, a GitHub-hosted runner, minimal read/OIDC permissions, npm 11.5.1+, and npm trusted publishing with no long-lived token. It tests and publishes one exact archive with lifecycle scripts disabled, then verifies npm registry signatures, transparency-backed publish and SLSA provenance attestations against the fixed Matterhorn repository, workflow, and source commit. A safe rerun is verification-only after an immutable version exists. The Phase 1–5 live gate requires that closed, content-addressed verifier report and rejects a checkbox-only claim, a different commit, unexpected report fields, or missing proof. Configuring the protected GitHub environment and npm trusted publisher, approving publication, and supplying live evidence remain explicit operator steps; no SDK has been published by this change.
- Phase 5 developer certification lifecycle: complete for the invite testnet slice. A host can record a complete passed or failed runtime report only after its hash, exact manifest, static report, policy, required probes, and action scope verify. Outcomes are immutable and leave the request queue. Developers see a bounded result and one next step without host evidence hashes; neither outcome registers, lists, promotes, connects, executes, signs, or submits the app.
- Phase 5 developer setup handoff: complete for the invite testnet slice. Enrolled developers can select Matterhorn Skill, Codex, Claude Code, generic MCP, CLI, or HTTP inside the account-gated portal and generate the existing inert SDK setup packet in their browser. The same packet now provides a deterministic, target-specific four-check connection boundary without asking the browser for a token: server response, client-scoped workspace access, focused tool scope, and absence of wallet submission authority. Generated MCP configurations select a guarded client profile that exposes only the authoritative session workflow; host approval, local-file, Memory-write, direct protocol, operator, and QA tools stay hidden and rejected before network access. Local checkout paths are never sent to Matterhorn; generated material contains only a client-token placeholder, never host approval, wallet submission, private-key, certification, or promotion authority. MCP setup remains explicitly local-checkout-only until the packages are published.
- Phase 5 developer quickstart: complete for the local and invite-portal testnet slice. One command creates an atomic, no-overwrite Sui, Hyperliquid, or Bittensor starter with an unsigned manifest, exact canonical signing request, one inert read fixture, a developer-owned local callback, and a machine-readable advisory report. Enrolled developers can build and copy the same SDK-validated command from the account-gated portal; its fields stay in the browser and the component has no API call. Generation shares the SDK schema boundary, admits testnet read authority only, ignores unknown caller fields, performs no I/O beyond writing the requested new directory, and never creates credentials, keys, wallet access, certification, financial actions, or mainnet authority.
- Phase 5 SDK distribution boundary: complete for the release-candidate artifact. The public manifest types are bidirectionally type-checked against the authoritative server contract, while the server validator is bundled into the JavaScript release. ESM, declaration, JSON-schema subpath, and quickstart-binary entry points contain no private runtime dependency. A mandatory gate packs the exact tarball, rejects tests, environment files, lockfiles, and workspace artifacts, installs offline into an empty consumer, compiles a strict TypeScript import, executes both public module paths, and generates a testnet-only starter with no credential, key, wallet, certification, mainnet, or submission authority. The SDK has not been published; registry publication and provenance remain an explicit operator release step, and MCP setup remains local-checkout-only until its separate packages are released.
- Phase 5 developer invite handoff: complete for the invite testnet slice. A host-only operator command issues one expiring invite through the existing control-plane boundary, reads host authority only from the environment, and emits a one-time app link whose developer token is confined to the URL fragment. The app removes the fragment before rendering, holds the token only in volatile memory through sign-in and onboarding, never renders it after loading, and never writes it to local or session storage. Invalid, expired, consumed, replayed, and cross-account invites continue to fail at the server boundary. Account deletion unlinks consumed invite metadata, and consumed or expired invite hashes are automatically removed after 365 days.
- Phase 5 developer metering: complete for the privacy-safe operational slice. An enrolled developer can inspect 7- or 30-day call, outcome, latency, estimated micro-USD cost, and tool-cost guardrail aggregates for an exact immutable app revision. The account boundary verifies revision ownership before reading the operational ledger; the report never selects or returns workspace, connection, reservation, run, call, prompt, credential, wallet, argument, or result identifiers. Stale pending reservations appear as abandoned rather than active, and wallet transaction limits remain explicitly separate.
- Phase 5 coworker invite handoff: complete for the local invite boundary. A host-only operator command creates one expiring app link through the account-access control plane, reads host authority only from the environment, and confines the raw one-time token to the URL fragment. The app strips that fragment before rendering and holds it only in volatile memory through sign-in and onboarding. Operators list and revoke accepted access through random opaque access IDs; account IDs, emails, and wallet addresses are excluded from the management response. Every restored grant rotates that opaque ID, preventing a stale operator handle from revoking newer access. Revocation immediately blocks routes, messages, certified tools, and scheduled checks. Account deletion removes the access record and unlinks consumed-invite metadata; revoked grants and expired invites are capped at 365 days. The commands carry no wallet authority, refuse unsafe origins and command-line secrets, and are part of the mandatory platform safety gate.
- Phase 1 trusted operator promotion boundary: complete. Manifest registration returns a server-generated static report; promotion accepts only matching static plus sealed runtime reports. Certification, suspension, revocation, inspection, and history are host-token-only, and client bearer tokens fail before the handler.
- Phase 1 first-party certification driver and operator command: complete for Sui, Hyperliquid, and Bittensor. The driver executes every required adversarial probe, including wallet-only simulation for all three Bittensor action families, retains hashes only, refuses secret-bearing inputs, and writes a promotion artifact only after full verification. Public Sui and Hyperliquid testnet reads have passed live transport probes; Bittensor live certification still requires an operator-hosted Python-SDK `test` sidecar.
- Phase 1 Polymarket public-read boundaries and certification workflow: complete in code and backend-only for active-market discovery plus exact-token order-book evidence. Gamma discovery and CLOB reads use separate signed manifests, separate pinned HTTPS origins, bodyless GETs, canonical uint256 token IDs, closed typed projections, bounded sorted levels, and read-only coworker capabilities. A distinct operator command accepts only the exact first-party IDs, revisions, actions, origins, public network, and informational read authority, then emits hash-only `certified_mainnet` evidence after every adversarial probe passes. Account, compliance, order, cancellation, signing, relay, submission, credentials, and destination overrides are excluded. Operator-signed manifests, live sealed reports, registry insertion, and promotion remain pending; the gateway stays off by default.
- Remaining Phase 1 operator acceptance: supply operator-controlled public testnet identities to complete the financial Sui simulation, Hyperliquid order-preview, and Bittensor transfer/stake/unstake preview probes, then promote the resulting sealed reports. Publisher signing keys, signatures, private key material, and testnet account credentials remain outside source and server configuration.
- Phase 2 durable profile and ownership foundation: complete. Coworkers persist in an owner/workspace-scoped SQLite store with closed policy fields, bounded limits, optimistic revisions, explicit policy versioning, terminal revocation, immediate pause/delete, account-safe authenticated routes, and disabled-mode no-I/O behavior. Existing profiles fail active resolution after a policy-version change until an explicit revisioned update rebinds them.
- Phase 2 chat and authority binding: complete for all four initial roles. Market Analyst and Risk Monitor remain read/watch only; Transaction Coordinator and Treasury Coworker may prepare one exact testnet wallet review per action family but receive no signing or submission authority. Selected profiles become versioned private system context. A separate server-owned, versioned master prompt constrains each role, while guarded run grants and hidden capabilities bind the exact coworker revision/policy, certified app/action/proxy mapping, networks, data labels, authorities, and per-run budgets. Legacy direct tools, broadened scopes, disallowed private context, stale profiles, and disallowed provider consent fail closed, while lifecycle changes revoke staged authority immediately.
- Phase 2 prompt-ordering boundary: complete. Coworker mission text, structured
  state, selected Memory, and Agent Files are bounded inside marked data blocks
  before the instruction layer. The complete server-owned execution, desk,
  coworker, and security policy is appended last and cannot be truncated; an
  oversized data block is explicitly bounded or omitted instead of displacing
  wallet, privacy, evidence, or tool-authority rules.
- Phase 2 privacy and runtime-message durability: complete. Confirming an exact-request privacy challenge atomically replaces it with one single-use consent, and binding a provider assistant message atomically replaces its accepted user-message binding. SQLite is the sole message-binding authority; wrong-scope, expired, replayed, duplicate-ID, cross-run, restart, and injected-write-failure cases fail closed without losing the retryable source record. A binding failure cancels the reserved model usage and guarded run before provider dispatch.
- Phase 2 exact provider-context consent binding: complete. Privacy preflight
  includes a SHA-256 digest and compiler version for the exact final system
  context sent upstream. Changes to context data, policy, ordering, framing, or
  truncation invalidate an outstanding one-request consent without storing or
  returning the raw compiled prompt. Every newly created run receipt retains
  the resulting request digest, so the accepted provider-bound request remains
  auditable without retaining its raw prompt, files, Memory, or wallet context;
  legacy v1 receipts remain readable without the additive digest.
- Phase 2 Venice private-mode catalog boundary: complete. Matterhorn discovers only stable, non-deprecated, private, online, tool-capable text models through an exact-origin, DNS/TLS-peer-pinned, no-redirect, JSON- and size-bounded request that sends no provider credential. E2EE and TEE catalog entries remain excluded because the current OpenAI-compatible path does not implement Venice's separate encryption or attestation protocol; Matterhorn never labels that plaintext-compatible path as E2EE or TEE. The authoritative admitted-model proof refreshes every 12 hours, expires after 24 hours, records its verification time in privacy disclosures, and clears immediately on refresh failure; policy resolution and exact-model admission use one request clock, so stale or substituted model IDs cannot receive prompts.
- Phase 2 private-mode UI proof binding: complete. The account model-policy response carries the exact Venice catalog-proof expiry, and the composer can show `Private on` only while the server proof is current. Missing rolling-upgrade metadata, expiry, refresh failure, a removed model, or an unverified provider fails closed in both the UI and the authoritative pre-dispatch check.
- Phase 2 run-start durability: complete. Active-session ownership, exact run scope, and the guarded capability grant now start in one immediate SQLite transaction. Grant persistence occurs before any in-memory authority becomes usable, and a receipt-start failure revokes every grant and run marker before provider dispatch. Tool staging additionally requires the exact tenant-bound active run, scope, and pending receipt from SQLite; broker-memory fallbacks, restored orphan grants, and finalized receipts cannot authorize work. Short deterministic runs give their grants the same expiry as their run markers. Injected scope, grant, and receipt-index failures leave no usable authority and permit a clean retry.
- Phase 2 structured working state: complete. Owner-scoped state persists bounded decisions, positions, unresolved risks, pending wallet-review hashes, evidence hashes, and approved Memory IDs under a closed schema with optimistic revisions. Transcript fields and secret-shaped content are rejected; profile/lifecycle changes clear pending financial work, and active state becomes privacy-preflighted model context instead of transcript replay.
- Phase 2 schedules, certified checks, and inbox: complete at the backend boundary. Owner-scoped watches have fixed certified app/action/network scope, bounded scalar parameters, minimum cadence, explicit conditions, per-check budgets, atomic active-watch limits, lifecycle pause semantics, and no financial authority. Due checks use atomic leases and daily counters, open a model-free guarded run with one exact read capability, traverse the certified adapter router, evaluate typed scalar conditions deterministically, and commit any provenance-bearing inbox item atomically with the check. A pause, profile edit, disconnect, stale revision, replay, or failed capability drops the late result. Account clients can list and acknowledge alerts but cannot inject them.
- Phase 2 first-run coworker guidance: complete for the invite UI slice. Each coworker now exposes one contextual next action—reload setup, connect an app, review access, or start chat—rather than a disabled unexplained button. Resource selection is named by what the coworker can use, numeric operating limits are progressively disclosed under `Safety limits`, and permanent connection/coworker actions use plain removal or disabling language. Empty wallet, check, and update sections collapse into one plain-language Activity summary, while pause and permanent-disable controls stay behind a separate deliberate disclosure. Existing work opens automatically, so an active wallet review or alert is never hidden. The exact wallet-review, connected-wallet-only submission, private-data, and no-key boundaries remain visible and unchanged.
- Phase 3 intent compiler: complete for the certified Sui transfer-preview, Hyperliquid order-preview, and Bittensor transfer/stake/unstake-preview actions. Exact request terms, resolved simulation terms, policy, freshness, tenant/run context, and expiry are hash-bound into `matterhorn.crypto-intent.v1`; only integrity-checked intents can regenerate wallet-only reviewed-action v2 handoffs.
- Phase 3 policy intersection: the server now intersects platform, organization, user, coworker, app, run, and consumed single-use capability policy. It fails closed on tenant/run binding, app/action/network/asset/recipient, jurisdiction/compliance, USD, reserve, leverage, slippage, velocity, expiry, or policy-integrity failures. The guarded transaction service denies static policy before adapter egress and requires durable capability-consumption proof before it can emit a wallet-only handoff.
- Phase 3 wallet-intent lifecycle foundation: complete for certified Sui, Hyperliquid, and Bittensor actions. Wallet-review tickets persist in the guarded SQLite boundary, are tenant/owner/coworker scoped, carry exact connection, authorized-argument hash, resolved-term hash, and prior-intent lineage, auto-expire with their simulation, and become non-approvable when coworker authority changes. Every state transition, wallet-reported receipt, and public-chain receipt reconciliation now replaces its prior record in one immediate SQLite transaction, so a crash or failed write cannot erase the outstanding review; stale receipt attempts durably commit the terminal expiry before failing closed. Bittensor handoffs preserve the certified `bittensor:test` network, numeric TAO amount, hotkey or destination, netuid, and measured slippage instead of inheriting legacy Finney display defaults. Refresh requires unchanged authorized arguments plus a different guarded run and consumed capability; it re-executes the certified adapter, creates a new intent, and permanently supersedes the prior review. Scheduled checks remain read-only and cannot prepare, sign, relay, broadcast, or submit.
- Phase 3 account wallet boundary: complete for owner-scoped list, inspect, cancel, exact wallet-panel staging, and wallet-reported public metadata. Each row stages only its bound reviewed-action v2 into the matching Sui, Hyperliquid, or compatible Bittensor Finney wallet panel; workspace, session, coworker, intent revision, protocol, network, signer, operation, and authorized-argument hash travel as a separate one-shot context rather than editable transaction data. Certified `bittensor:test` tickets remain visible but cannot open the Finney-only wallet executor, and protocol refresh now rejects any test/Finney/local network substitution rather than carrying a test label into a different chain. Stale-but-unexpired simulations may enter compatible wallet surfaces only so the server can refresh them; expired, mutated, or wrong-network bindings fail before signing. After connected-wallet execution or public-receipt import, the account client reconciles the exact intent without host authority; valid Bittensor Finney results are bound to the exact intent revision, signer, operation, network, and authorized arguments before coworker history changes. Unknown Hyperliquid outcomes remain pending and tell the user not to resubmit. Server reconciliation fetches the immutable intent, verifies the exact authorized arguments, signer, network, operation, guarded run receipt, policy, and simulation, and rejects signatures or credential-shaped content. Transaction preparation is cancelled if the guarded run receipt cannot durably stage the reviewed action.
- The pinned HTTP/2/gRPC `GetTransaction` read method was explicitly approved on 2026-09-01. A backend-only verifier binds one exact wallet-reported, valid Sui transaction digest to the expected testnet signer, mandatory matching gas owner, closed and unambiguous native SUI transfer command/input unions, recipient, amount, balance changes, and canonical uint64 epoch before the receipt store may promote it to chain-verified public metadata. It has no signing or submission method and is not exposed to models, MCP, CLI, or account callers. Missing gas ownership, hidden union variants, malformed digests or epochs, and unavailable or not-yet-indexed transactions fail closed; unavailable transactions remain visibly wallet-reported and unverified.
- Phase 4 local evidence foundation: complete and backend-only. Finalized coworker-bound guarded receipts are automatically and idempotently sealed into a tenant/run-bound encrypted record; finalized guarded receipts compile into a closed, identity-hashed evidence schema; AES-256-GCM sealing occurs before any publisher boundary; the transient plaintext data key and publisher buffer are zeroed after use; public Walrus bytes exclude the local key reference and plaintext hash; and deterministic Merkle proofs reject duplicate, modified, or mismatched ciphertext. No automatic Walrus relay, Sui anchor, or mainnet write is enabled.
- Phase 4 immutable Sui anchor boundary: complete in code and dormant. The testnet-only Move package freezes one non-content object containing only the schema version, batch ID, Merkle root, Walrus object ID, and certification epochs. Its Move dependencies and source hashes are locked, and the backend must independently prove that the configured first-version on-chain package contains exactly the audited module bytecode before readiness or anchoring can succeed. Matterhorn rechecks live certification, prepares and simulates one five-minute transaction, and accepts it only after exact pinned verification of sender, gas owner, package, function, BCS arguments, successful effects, and one immutable created object. The browser must disclose permanence; only the connected wallet can sign, pay, and submit. Publishing the package and setting `MATTERHORN_EVIDENCE_ANCHOR_PACKAGE_ID` remain explicit operator actions, and mainnet is rejected.
- Phase 4 account publication and verification boundary: complete for the current testnet slice, including wallet-controlled lifecycle operations. Authenticated owner-scoped routes expose only redacted proof packets, require explicit acknowledgement to publish one exact sealed revision, serialize publication with an expiring durable SQLite claim, and independently verify ciphertext hash, Merkle inclusion, pinned Sui Walrus certification, byte-exact Walrus readback, and the exact connected-wallet owner of the Blob object. New publications are created as deletable and transfer Blob ownership directly to the connected Sui wallet; publisher-owned and legacy records remain recovery-key-deletion-only. Public bytes contain only the generic encrypted envelope; account responses expose no tenant identifiers, coworker IDs, wallet addresses, KMS references, wrapped keys, ciphertext, prompts, or signatures. Matterhorn prepares and simulates exact renewal or deletion bytes, but the connected wallet remains the only signer, payer, and submitter.
- Phase 4 Agent Files cloud boundary: complete at the backend testnet boundary, including user-controlled renewal. A collaborator must explicitly confirm each exact file revision before Matterhorn uploads the ciphertext-only envelope. Matterhorn verifies pinned Sui certification and byte-exact Walrus readback before storing redacted publication metadata; tenant identifiers, filenames, coworker IDs, KMS references, and plaintext never enter public bytes. Publication and recovery-key destruction share a tenant- and revision-bound expiring SQLite operation claim before external work, so the lock survives restart, blocks upload/deletion races and duplicate spend in either direction, and cannot be cleared by a stale worker after a replacement claim is issued. When renewal is due, Matterhorn uses the official Walrus builder to prepare and simulate one exact five-minute transaction, binds it to the tenant, revision, signer, epochs, digest, and certification, and accepts confirmation only once after Sui verifies that exact digest and signer. Renewal completion atomically consumes both the pending wallet intent and its single-use operation claim with the proof revision, so an interrupted or losing replay cannot partially advance the file. The connected wallet remains the only signer and submitter; agents have no renewal, signing, payment, relay, or submission authority. Duplicate publication and renewal are serialized, deletion destroys the recovery key and pending renewal, expired copies fail closed, and mainnet remains disabled.
- Phase 2 account Coworkers control center: complete for the current internal-mode slice. Users can create, select, start a chat with, pause, resume, and revoke any of the four initial coworkers through plain-language controls: Research markets, Monitor risk, Prepare wallet actions, or Track treasury. Home now begins with one outcome field, makes a deterministic local coworker suggestion, permits an explicit user override, and carries the unsent outcome into the selected coworker's chat only after resource-access review. The panel shows automatic authority, approval boundaries, prohibited authority, request limits, watches, alerts, and wallet-review work without exposing signing or submission controls. Wallet activity now distinguishes active reviews from terminal history, exposes the exact operation, amount, network, signer, recipient, simulation, policy checks, expiry, and public-receipt verification state, and permits only a confirmed pre-submission cancellation. Starting or selecting a coworker binds its exact identity and revision to the session, and that context survives reloads until the user clears it.
- Phase 2 coworker resource sandbox: complete for the current internal-mode slice. Each coworker has one optimistic-revisioned, owner/workspace-scoped resource grant containing only explicitly selected Agent File revisions, Memory record versions, and certified app connections/actions/networks. No grant means no app authority. Matterhorn can now produce an advisory, content-free access recommendation from files already assigned to the coworker, topic-tagged Memory, and current certified app connections inside the fixed profile. Recommendations never activate themselves: the server binds each hash to the tenant, profile and scope revisions, resource hashes, app revisions, exact actions, and networks, recomputes it before acceptance, and rejects changed IDs or stale inputs. The authoritative message gateway resolves and hash-binds the exact current resources, forces private-workspace handling when private files or Memory are selected, forbids unverified-provider consent, and rejects deleted, changed, disconnected, or cross-tenant resources. The account UI keeps chat disabled until the grant is current and includes an app connection, explains unavailable services independently, and sends IDs and revisions rather than resource contents or privacy overrides.
- Phase 4 Agent Files account UI: complete for the current testnet slice. Users can browse encrypted files, bind a file and its owning coworker to a new or existing chat, and continue with the same privacy-bound coworker context. The file panel follows the active session coworker rather than silently switching tenants or identities.
- Current Phase 4 slice: authenticated original-file recovery is complete with tenant, revision, expiry, and integrity checks plus a no-store browser download. Testnet renewal and deletion are connected-wallet airlocks: the server prepares and simulates exact bytes, the browser verifies the digest, the wallet reviews/signs/submits, and the server changes durable state only after exact public-chain reconciliation. Deletion then destroys the local recovery key and records only bounded public transaction metadata. Renewal and deletion are never automatic and cannot be invoked by an agent. Expiry monitoring and ciphertext-only Quilt batching are implemented. Finalized runs are sealed locally and can be published only after the owner confirms the exact revision and the public-ciphertext disclosure; the backend then uploads only ciphertext, creates a deletable connected-wallet-owned Blob, and verifies ownership, certification, and exact readback. Publication remains configuration-gated, never automatic, and testnet-only; mainnet remains disabled.
- Current verification evidence: 1,102 application tests, 1,383 server tests, and 35 Crypto App SDK tests pass, including the four-role template, master-prompt budget, tenant isolation, wallet-only escalation, cross-account wallet-intent cancellation and receipt denial, exact wallet-review lifecycle contracts, Bittensor test/Finney/local network separation, developer-database migration, policy-pinned passed/failed certification outcomes, privacy-safe app-revision usage aggregation and ownership enforcement, composite action-authority and non-finite timing rejection, nested secret/signing schema and metadata/literal rejection before signing or adapter invocation, global schema/value traversal-budget enforcement, oversized input rejection, raw-evidence rejection, one-shot consent and message handoff binding, mutation rejection, stale/expired behavior, crash-safe consent, message, run startup, dispatch readiness, and intent replacement, exact-revision evidence publication, wallet-owned testnet renewal and deletion, key destruction, operation serialization, and the separate certified Polymarket discovery/CLOB read boundaries. The resource-sandbox slice adds 56 focused application/server checks for tenant isolation, exact revision binding, stale-resource invalidation, content-free recommendations, private-profile compatibility, zero-authority defaults, partial-service degradation, and minimal account requests. Focused certification and CLI tests additionally prove the public-read scope, exact origin/revision/action lock, sealed output, secret-input rejection, and absence of transaction authority. The full 10-stage platform safety gate, application and server type checks, server and SDK builds, OpenWork 0.18.42 / OpenCode 1.18.27 compatibility gate, strict secret scan, dependency audit, production web build, and task-first bundle budget pass. Rendered 1440 px desktop and 390 px mobile acceptance confirms keyboard operation, no unnamed controls, no horizontal overflow, deterministic local coworker suggestion, explicit user override, outcome continuity, exact resource selection, and a disabled chat start until a current app-scoped grant exists. Earlier rendered acceptance confirmed that the desktop workspace rail remains visible while a compact mobile menu exposes Coworkers, Files, MCPs, Memory, Notes, Wallet, Profile, and every crypto desk; a coworker row opens the matching Sui wallet panel, loads the exact recipient and amount, permits only server refresh of a stale-but-unexpired simulation, rejects an expired handoff without navigation, and preserves exact wallet activity, progressive disclosure, receipt verification state, safe cancellation, all four creation choices, Treasury Coworker creation, exact authority and limits, lifecycle controls, chat binding, reload persistence, and Agent Files continuity.
- Guarded external MCP evidence: generated Matterhorn Skill, Codex, Claude Code,
  and generic MCP setup selects the standalone `@matterhorn-work/guarded-mcp`
  entrypoint. Its release archive physically contains exactly 11
  workspace-session tools and no broad operator implementation, dependencies,
  lifecycle scripts, host-token handling, filesystem routes, Memory writes,
  protocol routes, or wallet authority. Every schema is closed and every call
  rejects unknown arguments before network access. The prompt boundary rejects
  client-supplied system instructions, tool overrides, compatibility
  agent/provider aliases, and one-request consent bearer values; the
  authoritative server constructs and intersects those policies. The clean
  package gate installs the exact archive offline and checks its model-facing
  registry. Trusted operators still use the separate broad MCP explicitly. No
  MCP package has been published by this change. The dormant release workflow
  requires an immutable version tag, the exact protected `dev` commit, typed
  operator confirmation, npm OIDC trusted publishing, and post-publish registry
  signature and SLSA provenance verification before it can report success.
- Phase 1–5 live acceptance gate: complete in code. `scripts/crypto-coworkers-acceptance-evidence.mjs` binds 21 live certification, coworker, transaction-airlock, encrypted-evidence, immutable Sui-anchor, developer-platform, design-partner, shadow-rollout, tenant-isolation, recovery, UX, and runtime-compatibility outcomes to one exact deployed commit. The encrypted-evidence outcome cannot pass without a connected-wallet-created immutable anchor whose exact package/function/arguments and public non-content object were verified, with mutation and replay rejected. Each report is a relative content-addressed file whose SHA-256 is rechecked; changed, missing, oversized, absolute, or traversing evidence fails closed. Credential- or signing-material fields are forbidden. This gate records no live success by itself and correctly remains `NO-GO` until operator-controlled acceptance evidence exists.
- Phase 1–5 live acceptance template: complete in code. An operator can create one non-passing owner-only manifest bound to the exact candidate, deployed HTTPS origin, pinned runtime versions, required networks, and all 21 pending evidence groups. The command refuses overwrite and unsafe URLs, creates no evidence reports or hashes, and cannot convert a pending outcome into release proof.
- All new production modes remain `off`; the new HTTP routes return a stable disabled response and no upstream adapter traffic is enabled.

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

A signed, version-pinned, revocable registry projects multiple crypto protocols through one safe read/watch/prepare/simulate interface. Sui and Hyperliquid are the first transaction-capable testnet adapters; Bittensor adds a separately certified read-only testnet boundary without expanding wallet authority.

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
   - API credentials resolved only from exact app/revision bindings in the deployment secret manager; connection rows and account responses retain opaque status only.
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
   - Testnet fixtures for Sui, Hyperliquid, and read-only Bittensor research.
   - Promotion requires both the passing static report and a complete passing runtime report cryptographically bound to the manifest, policy, environment, and redacted probe-evidence hashes.
   - A separate operator command certifies only Matterhorn's fixed unauthenticated Polymarket discovery and order-book reads as mainnet public metadata; it cannot certify transaction authority and performs no registration or promotion.
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
- Missing, malformed, substituted, wrong-app, or wrong-revision managed API credentials fail before adapter egress.
- Sui, Hyperliquid, and read-only Bittensor pass the conformance suite on testnet.
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
   - **Implemented locally:** Home accepts one outcome, suggests one of four deterministic coworker roles without provider contact, and carries that outcome into an unsent chat draft. The coworker access review can create or resume compatible no-credential certified app connections using only the exact app, action, scope, and network intersection allowed by the selected role. Connection never grants the coworker access automatically: the user must separately review and save the resource sandbox.
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
   - **Implemented locally:** finalized-receipt enforcement, closed-schema projection, per-bundle salted identity hashes, opaque public ciphertext serialization, ciphertext-only Merkle proofs, and idempotent automatic sealing for coworker-bound completions. A durable hashed run index prevents duplicate evidence records without exposing tenant identifiers in the index value.
2. **Encryption and key lifecycle**
   - Envelope encryption before any publisher receives bytes.
   - Workspace-scoped key references, rotation, access audit, deletion, and key destruction.
   - **Lifecycle, tenant index, and restore reconciliation implemented:** the key-manager contract, exact-recipient binding, AES-256-GCM envelope, plaintext-key zeroization, AWS KMS `GenerateDataKey`, exact-context decryption, plaintext-free `ReEncrypt` rotation, durable tenant index, startup/daily expiry and rotation, account/workspace destruction, readiness enforcement, secure SQLite deletion, WAL truncation, and 365-day hash-chained access receipts are complete. Deletion also writes an identifier-free, HMAC-authenticated tombstone to a separate erasure ledger before recovery material is cleared. Startup and host restore reconcile that ledger against stale Evidence and Agent File records; missing, divergent, older, or modified ledgers fail closed. Production operations must retain the current ledger outside every ordinary host snapshot and prove the restore drill before evidence publishing.
3. **Walrus publisher**
   - Authenticated relay with strict ciphertext-only content type and maximum size.
   - Quilt batching and Merkle proofs for small bundles.
   - Blob certification, epoch/expiry, renewal, and availability verification.
   - **Testnet transport and Quilt batching implemented locally:** public-DNS/TLS peer pinning, fixed authenticated Blob and Quilt upload paths, opaque ciphertext-hash patch identifiers, bounded multipart requests, exact object/patch readback, a separate certification-verifier interface, and byte-for-byte ciphertext reconciliation. A Quilt is attached to all of its tenant-bound evidence records in one immediate SQLite transaction only after every patch and the common Sui certification verify. Authenticated account routes expose redacted proof listing, exact-revision testnet publication, read-only verification, and irreversible exact-revision recovery-key deletion. Publication, rotation, and deletion are mutually serialized through a durable expiring SQLite operation claim; mainnet remains disabled.
4. **Sui anchor**
   - Merkle root and non-identifying proof metadata only.
   - Transaction digest reconciliation and explorer/verifier flow.
   - **Verification and renewal surface implemented:** `GET /workspace/:id/crypto-evidence` returns redacted proof packets with exact-revision verification health and `POST /workspace/:id/crypto-evidence/:evidenceId/verify` checks the local ciphertext hash, Merkle inclusion, exact pinned Sui certification, and independent Walrus readback. A bounded read-only worker refreshes published evidence at startup and every six hours; revision changes invalidate stored status. When storage enters its two-epoch notice window, the server may prepare one five-minute, hash-bound testnet renewal transaction. Only the connected wallet can review, sign, pay, and submit it; the server advances the proof revision only after exact transaction and certification reconciliation. Automatic publication, renewal, signing, submission, and anchor creation remain disabled.
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
   - Implemented: `matterhorn.crypto-app-integration-setup.v1` produces inert target-specific setup packets. It accepts no token values, host authority, signing authority, private keys, or mainnet controls; MCP packets use a trusted absolute checkout until packages are actually published.
   - Implemented: CLI-generated MCP configuration verifies real local checkout entrypoints and excludes host approval authority unless a trusted operator explicitly opts in. An unavailable distribution now fails clearly instead of producing a broken setup.
2. **Developer portal**
   - Register publisher keys, submit manifest revisions, run conformance, inspect failures, request certification, and receive immutable policy-pinned runtime outcomes.
   - Implemented: host-recorded outcomes verify the complete independent report against the exact manifest and static report. Developer views expose only probe status and affected action IDs; host evidence hashes stay private, and a passing outcome never promotes an app automatically.
   - Separate testnet and mainnet certification.
3. **User catalog**
   - Search, categories, protocol/network filters, and capability counts.
   - Detail page shows actions, authority, risk, privacy, freshness, scopes, cost, health, version, certification, and revocation history.
4. **Metering and budgets**
   - Tool/model spend uses a separate budget from wallet transaction limits.
   - Per-call or per-result cost estimates, quota, and receipt reconciliation.
   - Implemented: exact app-revision operational aggregates expose calls, outcomes, latency, reconciled cost, and the deployment's per-call/per-workspace tool-cost caps to the owning developer only. No tenant count or request-level data is disclosed.
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

The trusted JSON transport additionally pins the HTTPS socket to one router-approved address, preserves TLS verification against the certified hostname, verifies the actual peer address, refuses redirects and non-JSON responses, caps response bytes, and prevents opaque credential references from entering the request body. Its lower-level first-party requester supports only bodyless `GET` and JSON `POST`; all other methods and ambiguous URL/body combinations fail before dialing. Generic adapter envelopes remain POST-only. Upstream adapters cannot declare their own metering cost.

The guarded-runtime bridge requires full `enforce` mode and a trusted certification-time binding between each app action and one existing Matterhorn read or prepare tool. It stages and consumes the existing server-only capability, binds the manifest revision, connection, action, access, network, and canonical argument hash, persists only non-content reservation metadata, records the app/action in the run receipt, survives a process restart, and invalidates outstanding reservations when the run closes. Startup and account-safe catalog, connection, coworker, and wallet-intent routes are wired behind fail-closed runtime flags; none can enable signing or submission.

The first-party testnet contracts and backend-only executors cover Sui balance reads and dry-run transfer preparation plus Hyperliquid market, orderbook, account-exposure, and order-preparation actions. Every testnet contract is signed in the test harness, closed-schema projected, wallet-submission-only, and bound to a compatible existing guarded tool. Separate signed Polymarket mainnet public-research contracts cover bounded Gamma `/public-search` discovery and one exact-token CLOB `/book` read. Matterhorn—not the model or upstream response—constructs both bodyless same-origin GETs. Discovery projects only typed active-market metadata and aligned outcome token IDs; the CLOB contract accepts only one canonical uint256 token ID and projects a bounded, sorted order-book snapshot. Neither grant can switch origins or reach profiles, arbitrary destinations or methods, geoblock, wallet, order, cancellation, signing, relay, submission, or credential routes, and the testnet promotion command rejects both. Test fixtures prove unknown/private and instruction-like payload fields do not enter model-facing results. Live testnet egress and the Polymarket request boundaries are pinned and method-bounded. Registration and certification promotion remain trusted-operator actions; account users receive only redacted discovery, connection, coworker, and wallet-review surfaces.

The next Phase 1 work must:

- Add a dedicated Polymarket compliance boundary only after the venue's region signal can be bound to the user rather than the server egress location. Order preparation remains out of scope until that distinction and a wallet-only simulation contract are proven.
- Extend the trusted transport boundary to future MCP/OpenAPI/RPC protocols without allowing redirects, destination overrides, arbitrary methods, or raw upstream cost claims. The first-party JSON and Sui gRPC transports are complete for the current testnet actions.
- Complete the operator-controlled Sui financial-simulation and Hyperliquid order-preview probes, then promote only their sealed runtime reports.
- Keep the gateway and coworker modes off outside internal acceptance until those operator probes and hosted two-account acceptance pass.
