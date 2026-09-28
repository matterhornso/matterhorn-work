# STM MCP launch boundary — next implementation contract

Status: launch grants, host control route, stdio launcher and source/compiled
fixture tests implemented. Pinned OpenCode 1.18.31 connection/disconnect verified.
Actual engine model-driven tool execution/denial, crash recovery and signed
packaged acceptance remain incomplete. The earlier `spawnStmConsumer()` primitive
alone remains insufficient proof of runtime integration.

## Required integration

1. A host-token-only local control operation reviews a configured local MCP and
   records an explicit launch grant. Bind the grant to canonical workspace identity,
   tool name, reviewed executable/arguments and working directory. Consumer identity
   must include workspace identity (or be an opaque grant ID), not only `mcp:name`.
   A same-named tool in another workspace must not inherit access.
2. Persist only metadata in a private machine-scoped grant registry. Never place
   a dashboard token or resolved key in OpenCode configuration, command arguments,
   project files or model context. Configuration may carry a nonsecret grant ID.
3. At OpenCode's actual MCP launch boundary, a trusted launcher looks up the grant,
   verifies that it remains active and matches the reviewed command/workspace,
   resolves the selected bindings and passes them directly to the approved child.
   It must not accept arbitrary replacement command arguments from the workspace.
   It must preserve the standard MCP stdio stream and cancellation/exit behavior.
4. OpenCode's existing per-tool permission checks remain authoritative for tool
   execution. A storage binding is not permission to bypass workspace/session/tool
   approvals. Grant creation and startup consent are host-control operations.
5. Linking/rotation marks restart required. Do not restart a tool mid-task.
   Capture the exact applied revision at successful startup; show pending changes
   accurately. Revoked/removed/disabled grants block future launches, even when a
   stale plaintext value is present in inherited or legacy environment storage.
6. Generic Electron/server/orchestrator environment builders must not resolve STM
   keys. Suppress or reject bound-name conflicts at every generic inheritance path;
   do not treat the newly shared reserved-prefix policy as complete isolation.
7. Account for both local Bun/CLI and Electron packaged execution. Do not assume
   an installed Node/Bun executable on an end user's desktop. A wrapper must use
   a verified packaged runtime/entry point; remote and unsupported environments
   must refuse the operation without reverting to old values.

## Proof required

- A pinned actual OpenCode instance connects to a disposable MCP fixture through
  this path, lists/calls a harmless tool, and receives a response. Use an in-memory
  STM keystore or isolated fake daemon; no paid provider/real chain operation.
- Same-name other workspace, altered command, removed binding, disabled flag,
  stopped daemon, denied tool execution and stale config cannot expose or use keys.
- A running child's snapshot remains old until a safe explicit restart; the next
  launch receives the new revision, and only its own selected keys.
- Secret sentinel absent from argv, persistent config, reports and model responses;
  arbitrary trusted child code can still read its own environment (slice-1 limit).
- Packaged entry-point build checks and local runtime parity. Real Keychain and
  signed/packaged OS acceptance remain explicitly unverified until separately run.

This contract does not add brokered HTTP or AI-provider-auth scope. A local tool
is trusted code running as the local OS user; selected injection is not an OS
sandbox against malicious same-user processes reading other local vault files.
