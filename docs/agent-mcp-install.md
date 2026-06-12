# Matterhorn Work MCP Install Guide

This guide shows how to connect Matterhorn Work to Codex, Claude Code, Claude Desktop, Cursor, and other MCP-capable clients.

The default setup uses local stdio MCP servers launched by the client. The server-control MCP (`matterhorn-work-mcp`) talks to a running Matterhorn Work server over `MATTERHORN_WORK_SERVER_URL`.

After setup, use [Matterhorn Work Agent Operator Workflow](./agent-operator-workflow.md) for the copy-paste Codex/Claude loop: doctor, session, prompt, event watch, file reads/writes, approvals, and Bittensor chat.

## Prerequisites

Start Matterhorn Work locally and copy the client and host tokens from the startup output:

```bash
matterhorn-work start \
  --workspace /path/to/workspace \
  --approval manual
```

You need:

- `MATTERHORN_WORK_SERVER_URL`, usually `http://127.0.0.1:8787`
- `MATTERHORN_WORK_TOKEN`, the client token used for normal server tools
- `MATTERHORN_WORK_HOST_TOKEN`, the host token used only for approval tools

Use the host token only in a trusted local MCP client. Leave it out if the client should not be able to list or answer host approval requests.

## Profiles

Generate config with the Matterhorn Work CLI:

```bash
matterhorn-work mcp config \
  --target json \
  --profile full \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --host-token <host-token>
```

Profiles:

- `server`: only `matterhorn-work-mcp`, for server status, workspaces, chat sessions, approvals, file sessions, and Bittensor chat.
- `full`: `server` plus UI, crypto, and wallet MCP servers.

Targets:

- `json`, `claude`, `claude-desktop`, and `cursor` print the common `mcpServers` JSON shape.
- `env` prints shell exports.
- `codex` currently prints the common JSON shape for review, but Codex itself is best configured with `codex mcp add` or `~/.codex/config.toml`.

## Codex

Codex supports local stdio MCP servers with environment variables through `codex mcp add` or `~/.codex/config.toml`.

Add the server-control MCP:

```bash
codex mcp add matterhorn-work \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_WORK_TOKEN=<client-token> \
  --env MATTERHORN_WORK_HOST_TOKEN=<host-token> \
  -- npx -y matterhorn-work-mcp
```

Add the full profile one server at a time:

```bash
codex mcp add matterhorn-work-ui -- npx -y matterhorn-work-ui-mcp

codex mcp add matterhorn-work-crypto \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_SERVER_URL=http://127.0.0.1:8787 \
  -- npx -y matterhorn-work-crypto-mcp

codex mcp add matterhorn-work-wallet -- npx -y matterhorn-work-wallet-mcp
```

Verify inside Codex with `/mcp`, then ask Codex to call `matterhorn_status`.

Equivalent `config.toml` entry for the server-control MCP:

```toml
[mcp_servers.matterhorn-work]
command = "npx"
args = ["-y", "matterhorn-work-mcp"]

[mcp_servers.matterhorn-work.env]
MATTERHORN_WORK_SERVER_URL = "http://127.0.0.1:8787"
MATTERHORN_WORK_TOKEN = "<client-token>"
MATTERHORN_WORK_HOST_TOKEN = "<host-token>"
```

## Claude Code

Claude Code supports local stdio MCP servers through `claude mcp add`.

Add the server-control MCP:

```bash
claude mcp add --transport stdio \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_WORK_TOKEN=<client-token> \
  --env MATTERHORN_WORK_HOST_TOKEN=<host-token> \
  matterhorn-work \
  -- npx -y matterhorn-work-mcp
```

For a project-shared setup, generate the JSON and place it in a project `.mcp.json`:

```bash
matterhorn-work mcp config \
  --target claude \
  --profile full \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --host-token <host-token>
```

Verify with `claude mcp list` or `/mcp`, then ask Claude Code to call `matterhorn_status`.

## Claude Desktop

Generate the common MCP JSON:

```bash
matterhorn-work mcp config \
  --target claude-desktop \
  --profile server \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --host-token <host-token>
```

Paste the generated `mcpServers` object into Claude Desktop's config file, then restart Claude Desktop.

Common config locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Use Claude Desktop's MCP tool list to confirm `matterhorn-work` is loaded, then call `matterhorn_status`.

## Cursor

Generate the common MCP JSON:

```bash
matterhorn-work mcp config \
  --target cursor \
  --profile full \
  --server-url http://127.0.0.1:8787 \
  --token <client-token> \
  --host-token <host-token>
```

Paste the generated `mcpServers` object into Cursor's MCP configuration UI or MCP JSON file, then reload Cursor's MCP servers. Confirm the `matterhorn-work` server appears in Cursor's MCP tools and call `matterhorn_status`.

## Generic MCP Clients

Use this minimal stdio config when a client accepts the common `mcpServers` shape:

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

## Verification

After connecting any client:

1. Call `matterhorn_status`.
2. Call `matterhorn_list_workspaces`.
3. Call `matterhorn_list_sessions` with a workspace id.
4. For chat control, call `matterhorn_create_session`, `matterhorn_submit_session_prompt`, then use `matterhorn_watch_session_events` for bounded progress updates or `matterhorn_get_session_status` for simple polling.
5. For Bittensor, call `matterhorn_bittensor_chat` with a read-only prompt such as `show my TAO`.

If the MCP client is unavailable, the CLI fallback for chat control is `matterhorn-work sessions create`, `matterhorn-work sessions prompt`, `matterhorn-work sessions status`, `matterhorn-work sessions snapshot`, and `matterhorn-work sessions events`.

For Bittensor without MCP, use `matterhorn-work bittensor chat --message "<prompt>"` and `matterhorn-work bittensor readiness`. These CLI commands call the same non-custodial server routes as `matterhorn_bittensor_chat` and `matterhorn_bittensor_readiness`.

## Troubleshooting

- If the server does not start, run `npx -y matterhorn-work-mcp` manually with the same environment variables.
- If tools return `MATTERHORN_WORK_TOKEN is required`, check that the MCP client passes environment variables to stdio servers.
- If approval tools fail, check `MATTERHORN_WORK_HOST_TOKEN`; normal read/chat tools only need `MATTERHORN_WORK_TOKEN`.
- If Claude Desktop does not show the server, restart the app and check MCP logs.
- If Codex does not show the server, run `/mcp` or `codex mcp --help`, then re-check `~/.codex/config.toml`.
- If Bittensor tools are unavailable, first verify `matterhorn_status`, then call `matterhorn_bittensor_readiness`.

## External References

- Codex MCP configuration: <https://developers.openai.com/codex/mcp>
- Claude Code MCP configuration: <https://code.claude.com/docs/en/mcp>
- Claude Desktop local MCP configuration: <https://modelcontextprotocol.io/docs/develop/connect-local-servers>
- Cursor MCP configuration: <https://cursor.com/docs/mcp>
