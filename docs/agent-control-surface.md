# Matterhorn Work Agent Control Surface

Matterhorn Work should be usable from agent environments such as Claude Code, Codex, Cursor, Claude Desktop, and other MCP-capable clients. The control surface is intentionally layered so agents can choose the safest interface for the job.

## Layers

| Layer | Package or API | Primary Use |
| --- | --- | --- |
| Unified server MCP | `matterhorn-work-mcp` | Server status, workspaces, approvals, file sessions, and Bittensor chat |
| Desktop UI MCP | `matterhorn-work-ui-mcp` | Read visible UI state and run desktop actions |
| Crypto MCP | `matterhorn-work-crypto-mcp` | Crypto research, Bittensor tools, quote/preparation flows |
| Wallet MCP | `matterhorn-work-wallet-mcp` | EVM wallet reads and transaction/signature handoffs |
| CLI | `matterhorn-work` | Start/serve/status, approvals, workspaces, and file sessions |
| HTTP API | `matterhorn-work-server` | Stable server endpoints for remote clients and MCP wrappers |

See [Matterhorn Work Local Agent API](./agent-control-api.md) for the OpenAPI-style endpoint contract currently wrapped by `matterhorn-work-mcp`.

## First Agent Flow

1. Start a local server:

   ```bash
   matterhorn-work start --workspace /path/to/workspace --approval manual
   ```

2. Copy the client token and host token from startup output.

3. Generate an MCP client config:

   ```bash
   matterhorn-work mcp config \
     --target codex \
     --profile full \
     --server-url http://127.0.0.1:8787 \
     --token <client-token> \
     --host-token <host-token>
   ```

4. Or configure an MCP client manually:

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

5. Use `matterhorn_status` to confirm the server.

6. Use `matterhorn_list_workspaces`, `matterhorn_list_sessions`, `matterhorn_get_session_snapshot`, `matterhorn_create_file_session`, `matterhorn_file_catalog`, and `matterhorn_read_files` to inspect a workspace.

7. Use `matterhorn_create_session` and `matterhorn_submit_session_prompt` when the user wants Matterhorn Work to act in chat. Prompt submission still goes through the server route and normal approval policy.

8. Use `matterhorn_get_session_status` to poll whether a submitted prompt is still running before fetching another session snapshot.

9. Use `matterhorn_write_files` only when the user explicitly wants edits. Writes still go through Matterhorn Work file-session APIs and approval policy.

10. Use `matterhorn_bittensor_chat` for ordinary Bittensor requests before lower-level Bittensor tools.

## Safety

- Keep seed phrases, mnemonics, private keys, and wallet exports out of every MCP/API/CLI schema.
- Keep host approval tools behind `MATTERHORN_WORK_HOST_TOKEN`.
- Prefer read-only file sessions until the user asks for a write.
- Keep Bittensor signed actions non-custodial: preview first, sign externally, submit only through the configured safe path.

## Next Build Steps

1. Add browser/control tools only after the desktop UI bridge and server bridge have one consistent action model.
2. Add install docs for each target app once their Matterhorn MCP config paths are finalized.
3. Add event streaming for session progress if polling status proves too coarse for agent clients.
