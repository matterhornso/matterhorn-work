# Matterhorn Work Orchestrator

Host orchestrator for opencode + Matterhorn Work server + opencode-router. This is a CLI-first way to run host mode without the desktop UI.

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

OpenCode Router is optional. If it exits, `matterhorn-work` continues running unless you pass
`--opencode-router-required` or set `OPENWORK_OPENCODE_ROUTER_REQUIRED=1`.

For development overrides only, set `OPENWORK_ALLOW_EXTERNAL=1` or pass `--allow-external` to use
locally installed `matterhorn-work-server`, legacy `openwork-server`, or `opencode-router` binaries.

Add `--verbose` (or `OPENWORK_VERBOSE=1`) to print extra diagnostics about resolved binaries.

OpenCode hot reload is enabled by default when launched via `matterhorn-work`.
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

When `OPENWORK_DEV_MODE=1` is set, orchestrator uses an isolated OpenCode dev state for config, auth, data, cache, and state. Matterhorn Work's repo-level `pnpm dev` commands enable this automatically so local development does not reuse your personal OpenCode environment.

The command prints pairing URLs by default and withholds live credentials from stdout to avoid leaking them into shell history or collected logs. Use `--json` only when you explicitly need the raw pairing secrets in command output.

Use `--detach` to keep services running and exit the dashboard. The detach summary includes the
Matterhorn Work URL and a redacted `opencode attach` command, while keeping live credentials out of the detached summary.

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

`matterhorn-work` emits a unified log stream from OpenCode, Matterhorn Work server, and opencode-router. Use JSON format for
structured, OpenTelemetry-friendly logs and a stable run id for correlation.

```bash
OPENWORK_LOG_FORMAT=json matterhorn-work start --workspace /path/to/workspace
```

Use `--run-id` or `OPENWORK_RUN_ID` to supply your own correlation id.

OpenCode runs at `INFO` by default, which produces large log files in
`~/.local/share/opencode/log/`. Pass `--opencode-log-level <DEBUG|INFO|WARN|ERROR>` (or set
`OPENWORK_OPENCODE_LOG_LEVEL`) to forward `--log-level` to managed `opencode serve` and reduce log
volume.

Matterhorn Work server logs every request with method, path, status, and duration. Disable this when running
`matterhorn-work-server` directly by setting `OPENWORK_LOG_REQUESTS=0` or passing `--no-log-requests`.

## Router daemon (multi-workspace)

The router keeps a single OpenCode process alive and switches workspaces JIT using the `directory` parameter.

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

- Use the **Matterhorn Work connect URL** and **client token** to connect a remote Matterhorn Work client.
- The Matterhorn Work server advertises the **OpenCode connect URL** plus optional basic auth credentials to the client.

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
  --content "hello from Matterhorn Work" \
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
