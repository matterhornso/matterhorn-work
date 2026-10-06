# Matterhorn Guarded Agent Runtime

The guarded runtime treats OpenCode and the selected model as untrusted planners.
Matterhorn remains the authority for provider disclosure, private-context release,
tool access, reviewed transaction terms, retention, and security receipts.

## Security boundary

- The server runs privacy preflight before usage reservation, audit creation,
  OpenCode dispatch, or provider contact.
- In hosted mode, the last managed OpenCode plugin replaces the final provider
  system array with only the exact server-authorized bytes. Late environment,
  skill, MCP, workspace, or provider additions are not forwarded.
- Immediately before that release, the same last plugin submits OpenCode's
  exact final message array to a runtime-only endpoint. Matterhorn bounds and
  scans every restored user/assistant part and tool result, rejects mixed-chat
  arrays and late-added secrets, attachments, or wallet/transaction intent,
  marks tool output as untrusted external data, rechecks the accepted provider
  policy, and records only a SHA-256 digest in transient memory. One validation
  authorizes one immediate system release and expires after 30 seconds; a retry
  or tool continuation must validate its new final array again.
- OpenCode's provider-backed automatic title agent is disabled in hosted
  configuration because upstream starts it before the final-message hook. Chat
  names remain deterministic and user-editable; titles cannot race or bypass
  the one-shot provider-message proof.
- The OpenCode plugin receives a server-generated non-secret call id after model
  arguments exist. Signed capabilities remain inside the Matterhorn server.
- The managed MCP bridge strips the reserved call id and atomically consumes the
  matching 60-second capability before forwarding a crypto request.
- Capability policy is the intersection of the managed registry, selected desk,
  execution mode, server tool profile, run grant, and exact canonical arguments.
- The capability vocabulary contains only `read` and `prepare`. No agent-facing
  submit, relay, sign, scheduler, or watch capability exists.
- Agent-created actions use `matterhorn.reviewed-action-handoff.v2`. The wallet
  validates the exact intent, policy, expiry, and fresh simulation immediately
  before showing review. A field change requires regeneration.

## Authenticated APIs

| Method and path | Purpose |
|---|---|
| `POST /workspace/:id/sessions/:sessionId/messages/preflight` | Classify the exact prompt, attachments, memories, provider, model, agent, and requested mode. |
| `POST /workspace/:id/sessions/:sessionId/messages` | Authoritative provider gateway: classify, consent, reserve usage, create a run, and dispatch one server-built request. |
| `POST /workspace/:id/sessions/:sessionId/compact` | Hash and classify the exact stored transcript, require one-request consent when needed, reserve usage, compact, and write a content-free run receipt without exposing raw OpenCode summarize access. |
| `POST /workspace/:id/privacy-consents/:challengeId/confirm` | Issue a five-minute, single-use token for the exact request hash. |
| `GET /workspace/:id/agent-run-receipts` | Read content-free, hash-chained run receipts and the 365-day retention contract. |
| `POST /workspace/:id/reviewed-actions/validate` | Revalidate a v2 handoff against current terms and simulation before wallet review or receipt import. |
| `POST /workspace/:id/user-content/purge` | Owner-only purge of Matterhorn-managed content. Requires `confirm: purge:<workspaceId>`. |

Raw OpenCode command dispatch is trusted/local-only. Because OpenCode expands a
command's stored template and implicit runtime context after Matterhorn parses the
request, Matterhorn cannot bind those final bytes to one exact consent challenge.
Commands therefore require a local or currently verified no-training provider and
fail before abort, allowance reservation, guarded-run creation, or upstream
dispatch otherwise. Public research through a disclosed unverified provider must
use the authoritative message endpoint, where the complete provider-bound request
is hashable and preflighted.

The internal capability and completion routes require
`X-Matterhorn-Agent-Runtime-Secret`. They are not client APIs.

The same runtime-only credential protects the provider-message validation and
provider-system binding routes. Final-message validation resolves the exact
sealed user-message binding and checks the active workspace, session and run;
retries also supply the expected run ID. The local plugin requires current-parent
identity from early runtime hooks, supplied by an experimental source patch but
absent from stock OpenCode 1.18.31. Missing identity fails closed. See the
[current native-runtime evidence](../../qa-reports/launch/2026-10-05/RESULTS.md#exact-runtime-identity-and-unused-reservations);
the deployable runtime contract is not yet certified. The following system request must supply
the exact run ID returned by message validation. A stale ID is rejected before
consuming the replacement run's authorization. Its response is additionally
bound to provider, model, request purpose, and the single-use message-validation
digest; it carries a SHA-256 digest checked by the plugin and is held in memory
only until the run ends. A restart discards these private bytes and makes the
in-flight request fail closed. Hosted readiness requires the authoritative
gateway, the managed OpenCode plugin, and a valid runtime credential even while
per-tool capability rollout is `off`.

Compaction can release an unused reservation only when the same gateway process
observed the exact run/workspace/session/message and revokes it synchronously
before any provider-system release. A content-free, expiring record tracks that
monotonic release state. A previous release, missing record, expiry or restart is
not evidence for cancellation; history reconciliation retains responsibility for
those outcomes. HTTP 400 or an empty response alone does not prove zero usage.

Ordinary-chat reconciliation uses the same scoped unused-dispatch evidence.
A completed native error with default zero counters does not settle a request:
the provider may have received it without returning final usage. The reservation
stays pending, including when an earlier tool step has recorded usage. Exact
later usage can settle the request once; replaying an older zero report cannot
reduce a settled charge. A proven unused parent can release its own hold, never
another subject/workspace/session's hold or an unbound legacy reservation.
Unknown provider outcomes need reconciliation, not guessed refunds.

Authenticated Stop revokes the exact workspace/session's active guarded run
before native abort and before asynchronous receipt finalization. It does not
depend on the runtime completion notification to disable provider context,
message bindings or capability grants. Wrong-workspace/session Stop cannot
cancel that run. Revocation prevents new authorization; it is not proof that
an already-dispatched provider or tool operation stopped or incurred no usage.

Stored chats are private workspace context during compaction even when the
original turn began as public research. Secret-shaped content in any stored
message or tool result blocks compaction before allowance reservation or model
contact. Consent is bound to every canonical stored message hash, provider,
model, workspace, and session; a concurrent message, edit, tool result, revert,
provider change, or token replay fails closed.

Normal message turns apply the same exact-history boundary. Matterhorn records
only a content-free privacy floor for each tenant-scoped chat. A newly created
public-research chat remains public; once an accepted request includes private
workspace or wallet/transaction context, later history can never be downgraded.
Legacy chats with stored history and no trustworthy floor are treated as private
workspace context. The server hashes and scans every stored turn during
preflight, re-reads the transcript immediately before run creation, and rejects
changed consent, stored secrets, or a history too large to inspect safely. The
floor is purged with the chat or workspace and otherwise expires after 365 days.

Trusted local clients may still use the raw OpenCode prompt route, but its
`system` field is not outside this boundary. Matterhorn scans and SHA-256 binds
the exact final string forwarded upstream, including its enforced execution-mode
suffix. Recognized workflow and environment blocks are workspace-private;
account-linked wallet addresses and balances are wallet-private even though the
underlying chain facts are public. Secrets in any system block are rejected
before allowance reservation or provider contact, and changing one byte after
consent invalidates that consent. Hosted account clients cannot author system
context at all; the authoritative message gateway builds it server-side.

Selected OpenCode agent instructions are also provider-bound context, even
though OpenCode resolves them after accepting a prompt. Matterhorn therefore
reads the effective session agent before preflight, includes the exact prompt
hash and bytes in secret scanning and one-request consent, and sends that agent
id explicitly upstream. An exact shipped Matterhorn agent prompt is public
platform policy; any workspace-authored or modified agent prompt is
workspace-private. Matterhorn re-reads the agent immediately before dispatch
and returns `agent_context_changed` without contacting the provider if its id or
prompt hash changed. The same boundary applies to trusted raw prompts and
commands, so an agent file cannot hide secret or unconsented private context
behind OpenCode's later prompt expansion.

Compaction is a separate provider request and has its own hidden OpenCode agent.
Matterhorn binds the exact pinned compaction-agent prompt and its first-party
crypto compaction contract alongside the exact stored transcript. A custom or
modified compaction prompt is workspace-private, secrets are blocked before
usage reservation or provider contact, and a pre-dispatch re-read fails with
`agent_context_changed` if the hidden prompt changes after authorization. The
canonical prompt is versioned with the pinned OpenCode runtime so an upgrade
cannot silently change provider-bound instructions.
Managed OpenCode automatic compaction is disabled. Summaries may contact a
provider only through Matterhorn's explicit compact endpoint, which binds the
stored transcript and the `compaction` provider-system purpose to one protected
run.

## Retention and deletion

Run receipts contain provider policy, categories, content-free counts of chat files,
coworker files, and saved memories used for that run, bounded tool outcomes, usage,
memory ids, capability decisions, action hashes, and public chain receipt references.
They never contain raw prompts, file names, file identifiers, unrestricted tool output,
secrets, signatures, private keys, wallet exports, or bearer capabilities.

The first terminal receipt outcome and completion time remain fixed. Authenticated
late completion reports can increase observed cumulative usage, but cannot reduce
it, change cancellation/error into success, or extend the run's duration. A replay
after backend restart still verifies the sealed receipt index and persisted hash
chain before updating the receipt. These counters are runtime observations and
estimated cost, not provider invoices or a mechanism for downward corrections.
The separate usage ledger controls reservations and charged allowance.

New requests persist a sealed, content-free completion binding before dispatch:
run, workspace, session, parent message, selected provider/model and admission
time. It survives execution revocation but expires one year after admission and
is removed by workspace purge. It confers no execution authority. Startup and
periodic recovery, plus receipt/usage reads, can reconcile intact terminal history
fetched by the server from its configured native engine. No public route accepts
history as completion evidence. Exact parent/session/model identity, complete
ordered steps, recognized terminal status and valid usage are required; unknown
or malformed outcomes remain unresolved. The binding and deletion barrier are
rechecked under the receipt writer lock. Native storage remains a trusted runtime
boundary, not signed provider evidence. Historical runs without this binding are
not inferred or migrated. Do not treat billing as proof of receipt success or
re-execute model/tools to repair a receipt. See
[native completion recovery and limits](../../qa-reports/launch/2026-10-05/RESULTS.md#native-completion-recovery).

New coworker admissions also persist a sealed audit identity in the same SQLite
transaction as the execution grant. It contains only run/workspace/session and
coworker id/owner/revision/policy version, not tool permissions or bearer grants.
It survives execution expiry for 365 days from admission so the evidence retry
worker can reconstruct a missing finalization queue from an authenticated terminal
receipt after restart. It neither dispatches work nor restores expired authority.
Workspace deletion, the exact retained identity and the current receipt hash are
rechecked under the writer lock before queuing. Purge removes the identity.

Finalization delivery is at least once: an acknowledgement removes the queued
snapshot and audit identity atomically, only if the queued row is still exactly
the one delivered. A delayed acknowledgement cannot discard a newer snapshot.
The existing encrypted sealer is idempotent per run, and workspace deletion still
blocks writes after delayed key allocation. Graceful shutdown awaits the evidence
retry worker before closing storage. This does not guarantee recovery for older
runs that have neither a live grant nor a retained audit identity.

Encrypted coworker evidence remains the first sealed snapshot per run. Later
usage corrections to the receipt do not automatically revise that encrypted
snapshot or an already published proof; do not present it as a current provider
invoice. Versioned evidence and publication semantics require separate review.
Synthetic in-memory-key tests prove the local sealing/retry path, not production
KMS availability, encryption configuration, or backup restoration. See
[coworker evidence recovery](../../qa-reports/launch/2026-10-05/RESULTS.md#durable-coworker-evidence-finalization).

The authenticated receipt writer commits a sealed append intent before file IO.
It binds the prior index, original file prefix and exact intended receipt bytes.
After a partial append or failed index transaction, recovery checks those bindings,
appends only the missing bytes, fsyncs the file and its directory, then commits
the sealed index and removes the intent together. SQLite serializes these steps
across stores sharing that database. Recovery never reruns a model or tool and
cannot change the first terminal outcome. An unresolved intent blocks tool dispatch
even if a process died before replacing its older pending index.

Missing or unsigned indexes, altered prefixes, unexpected tails and invalid intents
fail closed. Historical orphaned files without a valid intent are not automatically
reindexed. Preserve the consistent receipt files, guarded-state database and signing
authority through backup and restore; the hash chain alone is not authenticity proof.
Abrupt Bun-process exits and two competing recovery processes pass locally, but this
does not certify power-loss durability, other operating systems, multi-replica agent
execution or production backup restoration. Reads and writes currently scan retained
workspace receipts synchronously; a small synthetic history benchmark is recorded,
but production-scale latency remains unverified. See
[recovery evidence and limits](../../qa-reports/launch/2026-10-05/RESULTS.md#authenticated-receipt-append-recovery).

Receipts are created in every guarded mode, including `off`, then written to
date-segmented, hash-chained workspace storage. Individual receipts stop appearing
after 365 days; a daily segment is physically removed only once the entire day is
older than that retention window. Earlier expired entries can therefore remain in
that segment until the rest of the day expires and cleanup runs. Cleanup never
deletes a newer durable index based on a stale in-memory receipt. It resolves a
live append intent under the writer lock before deleting segments. Global expiry
temporarily retains expired receipt indexes for a workspace with a live matching
append intent, so recovery can authenticate its exact predecessor. They remain
expired for ordinary reads and execution; retention grants no new authority.
The protection ends when the intent is resolved or expires. Historical orphaned
indexes without valid recovery evidence are not revived.

Workspace purge deletes engine sessions, notes, outputs, memories,
workflow content, and transient grants/consents immediately. It retains only the
minimal content-free security chain until normal expiry. Purge fails before local
deletion when engine content cannot first be deleted, preventing a false success.

## Context and token acceptance

Only the active desk's bounded tool vocabulary is projected into model context.
Discuss and Plan project only that desk's read tools. Tool reads are bounded near
2,000 characters and previews near 4,000 characters, with omitted data recovered
through a narrower query. Structured pending-action and evidence references replace
transcript replay; user-selected Memory is resolved and version-bound by the server.

The Phase 0 JSON remains an engineering estimate, not hosted evidence. Before launch,
capture provider-reported input tokens and quality results for the same fixed scenarios,
then run:

```sh
pnpm gate:guarded-runtime-tokens -- --baseline <baseline.json> --candidate <candidate.json> --json
```

The gate requires at least 40% fewer repeated input tokens for every scenario, complete
citations/action terms/risk warnings/receipts, and text-only policy overhead below 100ms p95.

## Rollout

1. Deploy with `MATTERHORN_GUARDED_RUNTIME_MODE=off`.
2. Configure independent 32-byte-or-longer
   `MATTERHORN_AGENT_RUNTIME_SECRET` and
   `MATTERHORN_CAPABILITY_SIGNING_SECRET` values.
3. Keep the Railway control plane at one running instance while guarded mode is
   `shadow` or `enforce`. Grants, consent challenges, run scopes, replay records,
   and receipt indexes are durable in the host SQLite database, whose atomic
   single-use constraints are scoped to that one persistent `/data` volume.
4. Run `shadow` for invite-only accounts for 48 hours. Missing secrets or invalid
   rollout selectors fail readiness.
5. Set `MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS=prepare` and
   `MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS=sui`.
6. After 24 clean hours per step, append `bittensor`, `hyperliquid`, then
   `polymarket`.
7. Set access to `all`, repeat the desk progression for reads, then clear the
   desk selector only after generic crypto chat passes.

`off` is the one-switch rollback to the existing safe permission and wallet
handoff behavior. Shadow observations never override an existing denial.

See also the [threat model](./matterhorn-guarded-agent-runtime-threat-model.md)
and [Phase 0 benchmark](./guarded-runtime-phase0-baseline.json).
