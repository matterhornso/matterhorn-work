# Matterhorn Desks Orchestrator

Host orchestrator for the Matterhorn Desks engine, Matterhorn Desks server, and opencode-router. This is a CLI-first way to run host mode without the desktop UI. The engine is backed by the underlying OpenCode runtime.

Published on npm as `openwork-orchestrator` for compatibility. It installs the
canonical `matterhorn-work` command plus the legacy `openwork` shim.

## Quick start

```bash
npm install -g openwork-orchestrator
matterhorn-work start --workspace /path/to/workspace --approval auto
```

When run in a TTY, `matterhorn-work` shows an interactive status dashboard with service health, ports, and
connection details. Use `matterhorn-work serve` or `--no-tui` for log-only mode.

```bash
matterhorn-work serve --workspace /path/to/workspace
```

`matterhorn-work` ships as a compiled binary, so Bun is not required at runtime.
The legacy `openwork` command remains available as a compatibility shim.

If npm skips the optional platform package, `postinstall` falls back to downloading the matching
binary from the `openwork-orchestrator-v<version>` GitHub release. Override the download host with
`OPENWORK_ORCHESTRATOR_DOWNLOAD_BASE_URL` when you need to use a mirror.

`matterhorn-work` downloads and caches the `matterhorn-work-server`/legacy `openwork-server`, `opencode-router`, and `opencode` sidecars on
first run using a SHA-256 manifest. Use `--sidecar-dir` or `OPENWORK_SIDECAR_DIR` to control the
cache location, and `--sidecar-base-url` / `--sidecar-manifest` to point at a custom host.

Use `--sidecar-source` to control where `matterhorn-work-server`/`openwork-server` and `opencode-router` are resolved
(`auto` | `bundled` | `downloaded` | `external`), and `--opencode-source` to control
`opencode` resolution. Set `OPENWORK_SIDECAR_SOURCE` / `OPENWORK_OPENCODE_SOURCE` to
apply the same policies via env vars.

By default the manifest is fetched from
`https://github.com/matterhornso/matterhorn-work/releases/download/openwork-orchestrator-v<version>/openwork-orchestrator-sidecars.json`.

OpenCodeRouter is optional. If it exits, `matterhorn-work` continues running unless you pass
`--opencode-router-required` or set `OPENWORK_OPENCODE_ROUTER_REQUIRED=1`.

For development overrides only, set `OPENWORK_ALLOW_EXTERNAL=1` or pass `--allow-external` to use
locally installed `matterhorn-work-server`, legacy `openwork-server`, or `opencode-router` binaries.

Add `--verbose` (or `OPENWORK_VERBOSE=1`) to print extra diagnostics about resolved binaries.

Matterhorn Desks engine hot reload is enabled by default when launched via `matterhorn-work`.
Tune it with:

- `--opencode-hot-reload` / `--no-opencode-hot-reload`
- `--opencode-hot-reload-debounce-ms <ms>`
- `--opencode-hot-reload-cooldown-ms <ms>`

Equivalent env vars:

- `OPENWORK_OPENCODE_HOT_RELOAD` (router mode)
- `OPENWORK_OPENCODE_HOT_RELOAD_DEBOUNCE_MS`
- `OPENWORK_OPENCODE_HOT_RELOAD_COOLDOWN_MS`
- `OPENWORK_OPENCODE_HOT_RELOAD` (start/serve mode)
- `OPENWORK_OPENCODE_HOT_RELOAD_DEBOUNCE_MS`
- `OPENWORK_OPENCODE_HOT_RELOAD_COOLDOWN_MS`

Or from source:

```bash
pnpm --filter matterhorn-work-orchestrator dev -- \
  start --workspace /path/to/workspace --approval auto --allow-external
```

When `OPENWORK_DEV_MODE=1` is set, orchestrator uses an isolated engine dev state for config, auth, data, cache, and state. Matterhorn Desks's repo-level `pnpm dev` commands enable this automatically so local development does not reuse your personal OpenCode environment.

The command prints pairing URLs by default and withholds live credentials from stdout to avoid leaking them into shell history or collected logs. Use `--json` only when you explicitly need the raw pairing secrets in command output.

Use `--detach` to keep services running and exit the dashboard. The detach summary includes the
Matterhorn Desks URL and a redacted `opencode attach` command, while keeping live credentials out of the detached summary.

## Sandbox mode (Docker / Apple container)

`matterhorn-work` can run the sidecars inside a Linux container boundary while still mounting your workspace
from the host.

```bash
# Auto-pick sandbox backend (prefers Apple container on supported Macs)
matterhorn-work start --sandbox auto --workspace /path/to/workspace --approval auto

# Explicit backends
matterhorn-work start --sandbox docker --workspace /path/to/workspace --approval auto
matterhorn-work start --sandbox container --workspace /path/to/workspace --approval auto
```

Notes:

- `--sandbox auto` prefers Apple `container` on supported Macs (arm64), otherwise Docker.
- Docker backend requires `docker` on your PATH.
- Apple container backend requires the `container` CLI (https://github.com/apple/container).
- In sandbox mode, sidecars are resolved for a Linux target (and `--sidecar-source` / `--opencode-source`
  are effectively `downloaded`).
- Custom `--*-bin` overrides are not supported in sandbox mode yet.
- Use `--sandbox-image` to pick an image with the toolchain you want available to OpenCode.
- Use `--sandbox-persist-dir` to control the host directory mounted at `/persist` inside the container.

### Extra mounts (allowlisted)

You can add explicit, validated mounts into `/workspace/extra/*`:

```bash
matterhorn-work start --sandbox auto --sandbox-mount "/path/on/host:datasets:ro" --workspace /path/to/workspace
```

Additional mounts are blocked unless you create an allowlist at:

- `~/.config/openwork/sandbox-mount-allowlist.json`

Override with `OPENWORK_SANDBOX_MOUNT_ALLOWLIST`.

## Logging

`matterhorn-work` emits a unified log stream from the Matterhorn Desks engine, Matterhorn Desks server, and opencode-router. Use JSON format for
structured, OpenTelemetry-friendly logs and a stable run id for correlation.

```bash
OPENWORK_LOG_FORMAT=json matterhorn-work start --workspace /path/to/workspace
```

Use `--run-id` or `OPENWORK_RUN_ID` to supply your own correlation id.

The underlying OpenCode runtime runs at `INFO` by default, which produces large log files in
`~/.local/share/opencode/log/`. Pass `--opencode-log-level <DEBUG|INFO|WARN|ERROR>` (or set
`OPENWORK_OPENCODE_LOG_LEVEL`) to forward `--log-level` to managed `opencode serve` and reduce log
volume.

Matterhorn Desks server logs every request with method, path, status, and duration. Disable this when running
`matterhorn-work-server` directly by setting `OPENWORK_LOG_REQUESTS=0` or passing `--no-log-requests`.

## Router daemon (multi-workspace)

The router keeps a single Matterhorn Desks engine process alive and switches workspaces JIT using the `directory` parameter.

```bash
matterhorn-work daemon start
matterhorn-work workspace add /path/to/workspace-a
matterhorn-work workspace add /path/to/workspace-b
matterhorn-work workspace list --json
matterhorn-work workspace path <id>
matterhorn-work instance dispose <id>
```

Use `OPENWORK_DATA_DIR` or `--data-dir` to isolate router state in tests.

## Pairing notes

- Use the **Matterhorn Desks connect URL** and **client token** to connect a remote Matterhorn Desks client.
- The Matterhorn Desks server advertises the **engine connect URL** plus optional basic auth credentials to the client.

## Agent MCP config

Print ready-to-paste MCP config for Claude Code, Codex, Cursor, Claude Desktop, or any client that accepts the common `mcpServers` shape:

```bash
matterhorn-work mcp config \
  --target codex \
  --profile guarded \
  --repo-path /absolute/path/to/matterhorn-work \
  --server-url http://127.0.0.1:8787 \
  --token <client-token>
```

The CLI defaults to `--profile guarded` for external agents; it selects the
standalone `@matterhorn-work/guarded-mcp` source containing only focused status,
workspace, and chat-session tools. Use `--profile server` for the broad unified
MCP or `--profile full` to add UI, crypto, and wallet MCPs in a trusted local
environment. Use `--target env` to print shell exports instead of JSON. Host
approval authority is never available in the guarded profile; add
`--include-host-approvals --host-token <host-token>` only with `server` or `full`
for a trusted local operator. MCP packages are not published yet, so config
generation uses a verified checkout from `--repo-path` (or the current source
checkout). `--runner npx` is an explicit future opt-in after publication. Flags
override `MATTERHORN_WORK_*` environment variables, with legacy `OPENWORK_*`
variables preserved as fallbacks.

## Agent doctor

Run one read-only readiness report before driving Matterhorn Desks from Codex, Claude Code, or another agent:

```bash
matterhorn-work doctor \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --host-token <host-token> \
  --json
```

Add `--workspace-id <id> --session-id <id>` to probe chat status/snapshot/event routes for a real session. Add `--file-session-id <id>` to probe file catalog/event routes. Add `--require-browser` only when the task depends on the desktop browser panel, and `--strict` when automation should exit nonzero if required checks fail.

## Chat session events

Create a chat session, submit a prompt, and inspect status through the stable Matterhorn Desks server routes:

```bash
matterhorn-work sessions create \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --workspace-id <workspace-id> \
  --title "Agent session" \
  --json

matterhorn-work sessions prompt <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --workspace-id <workspace-id> \
  --message "Summarize this workspace" \
  --json

matterhorn-work sessions status <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --workspace-id <workspace-id> \
  --json
```

Read bounded progress events for a Matterhorn Desks chat session:

```bash
matterhorn-work sessions events <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --workspace-id <workspace-id> \
  --snapshot \
  --details \
  --max-events 10 \
  --json
```

Use the returned `nextSince` value with `--since <cursor>` to resume from the latest observed event. The command uses the same Server-Sent Events envelope as `matterhorn_watch_session_events`.

## Bittensor

Run the chat-first Bittensor workflow from shell-only agent environments:

```bash
matterhorn-work bittensor chat \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --message "which subnet is useful for image generation?" \
  --json

matterhorn-work bittensor chat \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --message "show my TAO" \
  --ss58-address <public-ss58-address> \
  --json

matterhorn-work bittensor readiness \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --json

matterhorn-work bittensor capabilities \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --json

matterhorn-work bittensor capability \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --netuid 14 \
  --json
```

For no-custody Bittensor action flows, prepare an unsigned preview first, then create an external-signing handoff from that preview. Submit only after an external signer returns a signed payload:

```bash
matterhorn-work bittensor extrinsic prepare \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --action stake \
  --netuid 14 \
  --amount-tao 1 \
  --hotkey <validator-hotkey> \
  --coldkey <public-coldkey-label> \
  --rate-tolerance 0.01 \
  --json

matterhorn-work bittensor extrinsic handoff \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --preview-json '<preview-json-from-prepare>' \
  --json

matterhorn-work bittensor extrinsic submit \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --preview-json '<preview-json-from-prepare>' \
  --json
```

The deprecated `submit` command always returns `wallet_airlock_required` and performs no network request. Review, sign, and submit only in the connected wallet UI.

For direct subnet service adapter calls, use the explicit preview-confirm-invoke path. The preview returns a request SHA-256 that must be shown to the user before invoke:

```bash
matterhorn-work bittensor subnet-preview \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --netuid 14 \
  --intent service_call \
  --task "use this subnet for an image generation task" \
  --json

matterhorn-work bittensor subnet-invoke \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --netuid 14 \
  --intent service_call \
  --task "use this subnet for an image generation task" \
  --preview-request-sha256 <sha256-from-preview> \
  --json
```

For Bittensor watch operations:

```bash
matterhorn-work bittensor watch create \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --kind slippage \
  --netuid 14 \
  --threshold 0.35 \
  --label "Subnet 14 slippage" \
  --json

matterhorn-work bittensor watch list \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --json

matterhorn-work bittensor watch check \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --json
```

The CLI uses the same non-custodial server routes as `matterhorn_bittensor_chat` and never accepts seed phrases, mnemonics, private keys, wallet exports, or unpreviewed direct subnet invokes. Bittensor submit accepts only externally signed payloads plus public signer metadata.

## Approvals (manual mode)

```bash
matterhorn-work approvals list \
  --openwork-url http://<host>:8787 \
  --host-token <token>

matterhorn-work approvals reply <id> --allow \
  --openwork-url http://<host>:8787 \
  --host-token <token>
```

## Health checks

```bash
matterhorn-work status \
  --openwork-url http://<host>:8787 \
  --opencode-url http://<host>:4096
```

## File sessions (JIT catalog + batch read/write)

Create a short-lived workspace file session and sync files in batches:

```bash
# Create writable session
matterhorn-work files session create \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --workspace-id <workspace-id> \
  --write \
  --json

# Fetch catalog snapshot
matterhorn-work files catalog <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --limit 200 \
  --json

# Read one or more files
matterhorn-work files read <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --paths "README.md,notes/todo.md" \
  --json

# Write a file (inline content or --file)
matterhorn-work files write <session-id> \
  --openwork-url http://<host>:8787 \
  --token <client-token> \
  --path notes/todo.md \
  --content "hello from Matterhorn Desks" \
  --json

# Watch change events and close session
matterhorn-work files events <session-id> --openwork-url http://<host>:8787 --token <client-token> --since 0 --json
matterhorn-work files session close <session-id> --openwork-url http://<host>:8787 --token <client-token> --json
```

## Smoke checks

```bash
matterhorn-work start --workspace /path/to/workspace --check --check-events
```

This starts the services, verifies health + SSE events, then exits cleanly.

## Local development

Point to source CLIs for fast iteration:

```bash
matterhorn-work start \
  --workspace /path/to/workspace \
  --allow-external \
  --matterhorn-work-server-bin apps/server/src/cli.ts \
  --opencode-router-bin apps/opencode-router/dist/cli.js
```
