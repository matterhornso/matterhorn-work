# Matterhorn Work Agent Control Surface

Matterhorn Work should be usable from agent environments such as Claude Code, Codex, Cursor, Claude Desktop, and other MCP-capable clients. The control surface is intentionally layered so agents can choose the safest interface for the job.

## Layers

| Layer | Package or API | Primary Use |
| --- | --- | --- |
| Unified server MCP | `matterhorn-work-mcp` | Server status, workspaces, approvals, file sessions, and Bittensor chat |
| Desktop UI MCP | `matterhorn-work-ui-mcp` | Read visible UI state and run desktop actions |
| Crypto MCP | `matterhorn-work-crypto-mcp` | Crypto research, Bittensor tools, quote/preparation flows |
| Wallet MCP | `matterhorn-work-wallet-mcp` | EVM wallet reads and transaction/signature handoffs |
| CLI | `matterhorn-work` | Start/serve/status, approvals, workspaces, chat progress, and file sessions |
| HTTP API | `matterhorn-work-server` | Stable server endpoints for remote clients and MCP wrappers |

See [Matterhorn Work Local Agent API](./agent-control-api.md) for the OpenAPI-style endpoint contract currently wrapped by `matterhorn-work-mcp`. See [Matterhorn Work Agent Control Coverage Matrix](./agent-control-coverage-matrix.md) for the current HTTP/MCP/CLI coverage and remaining gaps. See [Matterhorn Work Session Event Stream Contract](./agent-session-event-stream.md) for the planned session-progress stream that will complement status polling. See [Matterhorn Work MCP Install Guide](./agent-mcp-install.md) for Codex, Claude Code, Claude Desktop, Cursor, and generic MCP client setup. See [Matterhorn Work Agent Action Model](./agent-action-model-contract.md) before adding new browser/control tools. See [Matterhorn Work Agent Browser Control](./agent-browser-control.md) and [Matterhorn Work Browser Control Live QA](./agent-browser-live-qa.md) for the semantic browser tool workflow.

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

5. Use `matterhorn_doctor` to confirm the server, token, workspaces, Bittensor readiness, optional session/file routes, approval access, and desktop browser bridge state in one report.

6. Use `matterhorn_status` when you only need raw health/status/capability payloads.

7. Use `matterhorn_list_workspaces`, `matterhorn_list_sessions`, `matterhorn_get_session_snapshot`, `matterhorn_create_file_session`, `matterhorn_file_catalog`, and `matterhorn_read_files` to inspect a workspace.

8. Use `matterhorn_create_session` and `matterhorn_submit_session_prompt` when the user wants Matterhorn Work to act in chat. Prompt submission still goes through the server route and normal approval policy.

9. Use `matterhorn_watch_session_events` for bounded session progress batches, or `matterhorn_get_session_status` to poll whether a submitted prompt is still running before fetching another session snapshot.

10. Use `matterhorn_write_files` only when the user explicitly wants edits. Writes still go through Matterhorn Work file-session APIs and approval policy.

11. Use `matterhorn_bittensor_chat` for ordinary Bittensor requests before lower-level Bittensor tools.

12. When MCP is unavailable, use `matterhorn-work doctor` first, then `matterhorn-work sessions create`, `matterhorn-work sessions prompt`, `matterhorn-work sessions status`, `matterhorn-work sessions snapshot`, and `matterhorn-work sessions events` as the CLI fallback for the same session-control loop.

13. For Bittensor without MCP, use `matterhorn-work bittensor chat --message "<prompt>"` and `matterhorn-work bittensor readiness` as the CLI fallback for the same non-custodial server routes.

14. When changing the session-progress path, run `pnpm test:agent-session-progress-smoke` to verify direct HTTP, MCP watch, and CLI fallback behavior against the same event-stream envelope.

## Doctor Readiness

`matterhorn_doctor` and `matterhorn-work doctor` are read-only readiness aggregators. They check:

- public server health;
- client token presence plus `/status`, `/capabilities`, and `/workspaces`;
- Bittensor readiness through `/api/bittensor/readiness`;
- optional chat session status/snapshot/event routes when a workspace and session id are supplied;
- optional file catalog/event routes when a file session id is supplied;
- optional approval listing when a host token is configured;
- optional desktop browser bridge health when the desktop app publishes a UI-control discovery file.

Use `requireBrowser` in MCP or `--require-browser` in CLI only when the task truly depends on the desktop browser panel. Use `--strict` in CLI automation when a non-ready report should exit with a nonzero status.

## Safety

- Keep seed phrases, mnemonics, private keys, and wallet exports out of every MCP/API/CLI schema.
- Keep host approval tools behind `MATTERHORN_WORK_HOST_TOKEN`.
- Prefer read-only file sessions until the user asks for a write.
- Keep Bittensor signed actions non-custodial: preview first, sign externally, submit only through the configured safe path.

## Next Build Steps

1. Add richer message/tool deltas to the session event stream as the underlying Matterhorn Work engine events stabilize.
2. Keep browser-control live QA current as new desktop actions are added.
3. Keep `matterhorn_doctor` current as new stable MCP/API/CLI surfaces are added.
