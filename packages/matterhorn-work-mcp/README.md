# Matterhorn Work MCP

Unified MCP server for controlling a running Matterhorn Work server from Claude Code, Codex, Cursor, Claude Desktop, or another MCP-capable agent.

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

Point the MCP server at a running Matterhorn Work server:

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

## Safety

- No seed phrases, mnemonics, private keys, or wallet exports are accepted by any tool schema.
- Approval tools require the host token separately from the normal client token.
- Write tools go through Matterhorn Work file-session APIs and existing approval policy.
- Bittensor actions remain non-custodial and rely on the existing unsigned-preview/external-signing flow.
