# Matterhorn Guarded Agent Runtime

The guarded runtime treats OpenCode and the selected model as untrusted planners.
Matterhorn remains the authority for provider disclosure, private-context release,
tool access, reviewed transaction terms, retention, and security receipts.

## Security boundary

- The server runs privacy preflight before usage reservation, audit creation,
  OpenCode dispatch, or provider contact.
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
| `POST /workspace/:id/privacy-consents/:challengeId/confirm` | Issue a five-minute, single-use token for the exact request hash. |
| `GET /workspace/:id/agent-run-receipts` | Read content-free, hash-chained run receipts and the 365-day retention contract. |
| `POST /workspace/:id/reviewed-actions/validate` | Revalidate a v2 handoff against current terms and simulation before wallet review or receipt import. |
| `POST /workspace/:id/user-content/purge` | Owner-only purge of Matterhorn-managed content. Requires `confirm: purge:<workspaceId>`. |

The internal capability and completion routes require
`X-Matterhorn-Agent-Runtime-Secret`. They are not client APIs.

## Retention and deletion

Run receipts contain provider policy, categories, counts, bounded tool outcomes,
usage, memory ids, capability decisions, action hashes, and public chain receipt
references. They never contain raw prompts, unrestricted tool output, secrets,
signatures, private keys, wallet exports, or bearer capabilities.

Receipts are written to date-segmented, hash-chained workspace storage and expire
after 365 days. Workspace purge deletes engine sessions, notes, outputs, memories,
workflow content, and transient grants/consents immediately. It retains only the
minimal content-free security chain until normal expiry. Purge fails before local
deletion when engine content cannot first be deleted, preventing a false success.

## Rollout

1. Deploy with `MATTERHORN_GUARDED_RUNTIME_MODE=off`.
2. Configure independent 32-byte-or-longer
   `MATTERHORN_AGENT_RUNTIME_SECRET` and
   `MATTERHORN_CAPABILITY_SIGNING_SECRET` values.
3. Keep the control plane at one running instance while guarded mode is `shadow`
   or `enforce`; grants and single-use capability consumption are process-local
   in this release. A shared transactional nonce store is required before
   horizontal scaling.
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
