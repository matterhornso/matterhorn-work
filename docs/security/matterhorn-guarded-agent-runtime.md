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

The same runtime-only credential protects the provider-system binding route.
Its response is bound to the active workspace, session, provider, model, request
purpose, and run; carries a SHA-256 digest checked by the plugin; and is held in
memory only until the run ends. A restart discards these private bytes and makes
the in-flight request fail closed. Hosted readiness requires the authoritative
gateway, the managed OpenCode plugin, and a valid runtime credential even while
per-tool capability rollout is `off`.

Stored chats are private workspace context during compaction even when the
original turn began as public research. Secret-shaped content in any stored
message or tool result blocks compaction before allowance reservation or model
contact. Consent is bound to every canonical stored message hash, provider,
model, workspace, and session; a concurrent message, edit, tool result, revert,
provider change, or token replay fails closed.

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

Receipts are created in every guarded mode, including `off`, then written to
date-segmented, hash-chained workspace storage and expired by the daily retention
job after 365 days. Workspace purge deletes engine sessions, notes, outputs, memories,
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
