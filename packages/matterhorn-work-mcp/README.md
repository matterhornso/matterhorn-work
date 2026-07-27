# Matterhorn Desks MCP

Unified MCP server for controlling a running Matterhorn Desks server from Claude Code, Codex, Cursor, Claude Desktop, or another MCP-capable agent.

This package is the server/control complement to:

- `matterhorn-work-ui-mcp` for desktop UI control
- `matterhorn-work-crypto-mcp` for crypto and Bittensor tools
- `matterhorn-work-wallet-mcp` for EVM wallet reads and approval handoffs

## Install

```bash
npm install -g matterhorn-work-mcp
```

Or run it without installing:

```bash
npx matterhorn-work-mcp
```

## Configure

Point the MCP server at a running Matterhorn Desks server:

```bash
export MATTERHORN_WORK_SERVER_URL="http://127.0.0.1:8787"
export MATTERHORN_WORK_TOKEN="<client-token>"
export MATTERHORN_WORK_HOST_TOKEN="<host-token>" # only needed for approval tools
```

Legacy env fallbacks are still accepted:

- `OPENWORK_SERVER_URL`
- `OPENWORK_TOKEN`
- `OPENWORK_HOST_TOKEN`

## MCP Config

For app-specific setup in Codex, Claude Code, Claude Desktop, Cursor, and generic MCP clients, see [`docs/agent-mcp-install.md`](https://github.com/matterhornso/matterhorn-work/blob/dev/docs/agent-mcp-install.md).

```json
{
  "mcpServers": {
    "matterhorn-work": {
      "command": "npx",
      "args": ["-y", "matterhorn-work-mcp"],
      "env": {
        "MATTERHORN_WORK_SERVER_URL": "http://127.0.0.1:8787",
        "MATTERHORN_WORK_TOKEN": "<client-token>",
        "MATTERHORN_WORK_HOST_TOKEN": "<host-token>"
      }
    }
  }
}
```

## Tools

The HTTP routes used by these tools are documented in [`docs/agent-control-api.md`](https://github.com/matterhornso/matterhorn-work/blob/dev/docs/agent-control-api.md). The session-progress stream is documented in [`docs/agent-session-event-stream.md`](https://github.com/matterhornso/matterhorn-work/blob/dev/docs/agent-session-event-stream.md); use `matterhorn_watch_session_events` for bounded progress batches when the client cannot hold an open Server-Sent Events stream directly.

- `matterhorn_doctor` — one readiness report across server health, client token, workspaces, optional session/file probes, approvals, desktop browser bridge, and Bittensor readiness
- `matterhorn_status` — health, status, and server capabilities
- `matterhorn_upstream_source_check` — build a read-only upstream runtime-source intake plan with conflict zones and verification commands
- `matterhorn_list_workspaces` — visible workspaces
- `matterhorn_create_session` — create a chat session with a writable collaborator/owner token
- `matterhorn_list_sessions` — list chat sessions in a workspace
- `matterhorn_get_session` — read one chat session
- `matterhorn_get_session_messages` — read chat session messages
- `matterhorn_get_session_status` — poll a chat session's current execution status
- `matterhorn_watch_session_events` — read a bounded batch of session progress events
- `matterhorn_submit_session_prompt` — submit a prompt through the stable server route and normal approval policy
- `matterhorn_get_session_snapshot` — read a combined session/messages/todos/status snapshot
- `matterhorn_delete_session` — delete a chat session with a writable collaborator/owner token
- `matterhorn_create_file_session` — create a file session
- `matterhorn_file_catalog` — list files in a file session
- `matterhorn_watch_file_events` — read file catalog change events for a file session
- `matterhorn_read_files` — read files and decode text content
- `matterhorn_write_files` — write files through a writable session
- `matterhorn_close_file_session` — close a file session
- `matterhorn_list_approvals` — list pending host approval requests
- `matterhorn_reply_approval` — allow or deny an approval request
- `matterhorn_memory_search` — search explicit Matterhorn Memory records visible to the configured client token
- `matterhorn_memory_list` — list explicit Matterhorn Memory records with kind, scope, tag, and limit filters
- `matterhorn_memory_get` — read one explicit Matterhorn Memory record by id
- `matterhorn_memory_capture` — capture one user-confirmed memory record through the server safety validators
- `matterhorn_memory_update` — update one explicit memory record by id
- `matterhorn_memory_forget` — forget one explicit memory record by id and record the deletion reason
- `matterhorn_memory_export` — export explicit memory records into a local evidence bundle path on the Matterhorn server
- `matterhorn_services_get_capabilities` — read future decentralized service capability contracts for hosting, storage, email, payments, and identity/access; discovery only, no live provider execution
- `matterhorn_services_chat_plan` — plan future hosting, storage, email, payments, or identity/access workflows from ordinary chat; planning only, no live provider execution
- `matterhorn_workflows_catalog` — read the catalog-only registry for longevity creator, Bittensor, market read/preview, decentralized service, and future workflows; discovery only, no provider execution
- `matterhorn_workflows_prompt_pack` — read copy-pasteable staged prompts from the Matterhorn workflow registry; prompt-pack only, no provider execution
- `matterhorn_hyperliquid_chat` — run the read/preview-only Hyperliquid workflow
- `matterhorn_hyperliquid_list_markets` — list Hyperliquid markets through Matterhorn server reads
- `matterhorn_hyperliquid_get_account` — read a public Hyperliquid account snapshot
- `matterhorn_hyperliquid_get_positions` — read normalized public position summaries
- `matterhorn_hyperliquid_get_open_orders` — read normalized public open-order summaries
- `matterhorn_hyperliquid_get_funding` — read funding/open-interest context for an asset
- `matterhorn_hyperliquid_get_orderbook` — read an L2 orderbook snapshot
- `matterhorn_hyperliquid_create_watch` — create a read-only Hyperliquid funding/orderbook/account watch
- `matterhorn_hyperliquid_check_watches` — evaluate Hyperliquid watches and return alert cards
- `matterhorn_hyperliquid_watch_digest` — summarize Hyperliquid watch alerts into an agent-facing digest
- `matterhorn_hyperliquid_act_on_watch_alert` — review one Hyperliquid watch alert through deterministic read-only crypto chat
- `matterhorn_hyperliquid_preview_order` — prepare a non-submittable order preview
- `matterhorn_polymarket_create_watch` — create a read-only Polymarket market/compliance/liquidity watch
- `matterhorn_polymarket_check_watches` — evaluate Polymarket watches and return alert cards
- `matterhorn_polymarket_watch_digest` — summarize Polymarket watch alerts into an agent-facing digest
- `matterhorn_polymarket_act_on_watch_alert` — review one Polymarket watch alert through deterministic read-only crypto chat
- `matterhorn_bittensor_chat` — run the chat-first Bittensor workflow
- `matterhorn_bittensor_readiness` — run Bittensor readiness checks
- `matterhorn_bittensor_list_capabilities` — list Bittensor subnet capability manifests
- `matterhorn_bittensor_get_subnet_capability` — read one subnet capability manifest by netuid
- `matterhorn_bittensor_prepare_extrinsic` — prepare an unsigned Bittensor action preview
- `matterhorn_bittensor_create_signing_handoff` — create a checksumed external-signing handoff
- `matterhorn_bittensor_submit_signed_extrinsic` — submit an externally signed Bittensor payload when a sidecar is available
- `matterhorn_bittensor_preview_subnet_invocation` — preview a subnet adapter call before invocation
- `matterhorn_bittensor_invoke_subnet` — invoke a supported subnet adapter with a confirmed preview hash
- `matterhorn_bittensor_create_watch` — create a public Bittensor watch
- `matterhorn_bittensor_list_watches` — list configured Bittensor watches
- `matterhorn_bittensor_check_watches` — evaluate Bittensor watches and return alert cards
- `matterhorn_bittensor_watch_digest` — summarize Bittensor watch alerts into an agent-facing queue with next prompts/actions
- `matterhorn_bittensor_act_on_watch_alert` — run one watch alert's suggested public-data prompt through Bittensor chat

## Safety

- No seed phrases, mnemonics, private keys, or wallet exports are accepted by any tool schema.
- Memory tools do not auto-capture hidden context. `matterhorn_memory_capture` is for explicit, user-confirmed records only, and the server rejects credential-shaped or unsafe memory content before writing.
- Approval tools require the host token separately from the normal client token.
- Write tools go through Matterhorn Desks file-session APIs and existing approval policy.
- Bittensor actions remain non-custodial and rely on the existing unsigned-preview/external-signing flow.
