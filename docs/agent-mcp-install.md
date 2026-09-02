# Matterhorn Desks MCP Install Guide

This guide shows how to connect Matterhorn Desks to Codex, Claude Code, Claude Desktop, Cursor, and other MCP-capable clients.

The default setup uses local stdio MCP servers launched by the client. The server-control MCP (`matterhorn-work-mcp`) talks to a running Matterhorn Desks server over `MATTERHORN_WORK_SERVER_URL`.

> **Current distribution:** the MCP packages are not published to npm yet. Clone
> this repository and run `pnpm install` once, then use the absolute `index.mjs`
> paths shown below. The package names are reserved for a later npm release;
> do not use the older `npx -y matterhorn-work-*-mcp` examples until that release
> is published.

After setup, use [Matterhorn Desks Agent Operator Workflow](./agent-operator-workflow.md) for the copy-paste Codex/Claude loop: doctor, session, prompt, event watch, file reads/writes, approvals, and Bittensor chat.

## What “Connected” Means

Matterhorn distinguishes configuration from a live MCP runtime:

- **Configured:** an MCP entry exists in project or global OpenCode configuration.
- **Connected:** the managed OpenCode runtime initialized that MCP process and can list its tools.
- **Needs auth / failed / disabled:** the runtime cannot currently provide tools for the stated reason.

A connected MCP is not proof that a browser wallet, OAuth account, paid provider, or every upstream API is available. For example, the local wallet MCP can be connected while the Wallet rail still reports that no browser wallet is connected.

The product UI should say **MCP server active** rather than **app connected** when it is reporting OpenCode MCP status.

## Prerequisites

Start Matterhorn Desks locally and copy the client token from the startup output:

```bash
matterhorn-work start \
  --workspace /path/to/workspace \
  --approval manual
```

You need:

- `MATTERHORN_WORK_SERVER_URL`, usually `http://127.0.0.1:8787`
- `MATTERHORN_WORK_TOKEN`, the client token used for normal server tools
- Optional `MATTERHORN_WORK_HOST_TOKEN`, used only when a trusted local operator deliberately enables approval tools

You also need a local checkout:

```bash
git clone https://github.com/matterhornso/matterhorn-work.git
cd matterhorn-work
pnpm install
```

In the commands below, replace `<matterhorn-repo>` with that checkout's
absolute path.

The generated setup is client-only by default. Add `--include-host-approvals --host-token <host-token>` only for a trusted local operator client that is intentionally allowed to list or answer host approval requests.

## Profiles

Generate config with the Matterhorn Desks CLI:

```bash
matterhorn-work mcp config \
  --target json \
  --profile full \
  --repo-path <matterhorn-repo> \
  --server-url http://127.0.0.1:8787 \
  --token <client-token>
```

Profiles:

- `server`: only `matterhorn-work-mcp`, for server status, workspaces, chat sessions, file sessions, and Bittensor chat. Approval tools require the explicit host-authority opt-in.
- `full`: `server` plus UI, crypto, and wallet MCP servers.

Targets:

- `json`, `claude`, `claude-desktop`, and `cursor` print the common `mcpServers` JSON shape.
- `env` prints shell exports.
- `codex` prints native `mcp_servers` TOML sections for `~/.codex/config.toml`.

## Codex

Codex supports local stdio MCP servers with environment variables through `codex mcp add` or `~/.codex/config.toml`.

Generate the complete Codex TOML profile:

```bash
matterhorn-work mcp config --target codex --profile full --repo-path <matterhorn-repo>
```

Append the generated sections to `~/.codex/config.toml`, then restart or refresh Codex.

Add the server-control MCP:

```bash
codex mcp add matterhorn-work \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_WORK_TOKEN=<client-token> \
  -- node <matterhorn-repo>/packages/matterhorn-work-mcp/index.mjs
```

Add the full profile one server at a time:

```bash
codex mcp add matterhorn-work-ui -- node <matterhorn-repo>/packages/matterhorn-work-ui-mcp/index.mjs

codex mcp add matterhorn-work-crypto \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_SERVER_URL=http://127.0.0.1:8787 \
  -- node <matterhorn-repo>/packages/matterhorn-work-crypto-mcp/index.mjs

codex mcp add matterhorn-work-wallet -- node <matterhorn-repo>/packages/matterhorn-work-wallet-mcp/index.mjs
```

Verify inside Codex with `/mcp`, then ask Codex to call `matterhorn_status`.

Equivalent `config.toml` entry for the server-control MCP:

```toml
[mcp_servers.matterhorn-work]
command = "node"
args = ["<matterhorn-repo>/packages/matterhorn-work-mcp/index.mjs"]

[mcp_servers.matterhorn-work.env]
MATTERHORN_WORK_SERVER_URL = "http://127.0.0.1:8787"
MATTERHORN_WORK_TOKEN = "<client-token>"
```

## Claude Code

Claude Code supports local stdio MCP servers through `claude mcp add`.

Add the server-control MCP:

```bash
claude mcp add --transport stdio \
  --env MATTERHORN_WORK_SERVER_URL=http://127.0.0.1:8787 \
  --env MATTERHORN_WORK_TOKEN=<client-token> \
  matterhorn-work \
  -- node <matterhorn-repo>/packages/matterhorn-work-mcp/index.mjs
```

For a project-shared setup, generate the JSON and place it in a project `.mcp.json`:

```bash
matterhorn-work mcp config \
  --target claude \
  --profile full \
  --repo-path <matterhorn-repo> \
  --server-url http://127.0.0.1:8787 \
  --token <client-token>
```

Verify with `claude mcp list` or `/mcp`, then ask Claude Code to call `matterhorn_status`.

## Claude Desktop

Generate the common MCP JSON:

```bash
matterhorn-work mcp config \
  --target claude-desktop \
  --profile server \
  --repo-path <matterhorn-repo> \
  --server-url http://127.0.0.1:8787 \
  --token <client-token>
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
  --repo-path <matterhorn-repo> \
  --server-url http://127.0.0.1:8787 \
  --token <client-token>
```

Paste the generated `mcpServers` object into Cursor's MCP configuration UI or MCP JSON file, then reload Cursor's MCP servers. Confirm the `matterhorn-work` server appears in Cursor's MCP tools and call `matterhorn_status`.

## Generic MCP Clients

Use this minimal stdio config when a client accepts the common `mcpServers` shape:

```json
{
  "mcpServers": {
    "matterhorn-work": {
      "command": "node",
      "args": ["<matterhorn-repo>/packages/matterhorn-work-mcp/index.mjs"],
      "env": {
        "MATTERHORN_WORK_SERVER_URL": "http://127.0.0.1:8787",
        "MATTERHORN_WORK_TOKEN": "<client-token>"
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
6. For upstream OpenWork intake, call `matterhorn_upstream_openwork_check` to get the reviewed sync branch name, conflict zones, and verification commands.

If the MCP client is unavailable, the CLI fallback for chat control is `matterhorn-work sessions create`, `matterhorn-work sessions prompt`, `matterhorn-work sessions status`, `matterhorn-work sessions snapshot`, and `matterhorn-work sessions events`.

For Bittensor without MCP, use `matterhorn-work bittensor chat --message "<prompt>"` and `matterhorn-work bittensor readiness`. These CLI commands call the same non-custodial server routes as `matterhorn_bittensor_chat` and `matterhorn_bittensor_readiness`.

For upstream OpenWork checks without MCP, use `matterhorn-work upstream openwork check --json`.

## Troubleshooting

- If the server does not start, run `node <matterhorn-repo>/packages/matterhorn-work-mcp/index.mjs` manually with the same environment variables.
- If tools return `MATTERHORN_WORK_TOKEN is required`, check that the MCP client passes environment variables to stdio servers.
- If approval tools are intentionally required, regenerate with `--include-host-approvals --host-token <host-token>`. Normal read/chat tools need only `MATTERHORN_WORK_TOKEN`.
- If Claude Desktop does not show the server, restart the app and check MCP logs.
- If Codex does not show the server, run `/mcp` or `codex mcp --help`, then re-check `~/.codex/config.toml`.
- If Bittensor tools are unavailable, first verify `matterhorn_status`, then call `matterhorn_bittensor_readiness`.

## External References

- Codex MCP configuration: <https://developers.openai.com/codex/mcp>
- Claude Code MCP configuration: <https://code.claude.com/docs/en/mcp>
- Claude Desktop local MCP configuration: <https://modelcontextprotocol.io/docs/develop/connect-local-servers>
- Cursor MCP configuration: <https://cursor.com/docs/mcp>
