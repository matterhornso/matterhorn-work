# STM credential adapter (development, default off)

Dependency-free local adapter shared by Electron/server/orchestrator consumers.
The common server entry point creates a disabled adapter by default. Local macOS
operators can opt in with `MATTERHORN_WORK_STM_ENABLED=1`; no API can set that flag.
Network listeners and unsupported platforms reject connection/resolution. Current
active consumer wiring is realtime voice only, not OpenCode MCP children.
Do not use this development integration with real credentials yet.

Protocol: STM `/api/integrations/v1/{capabilities,keys,resolve}`, version 1,
`x-stm-token` header, literal loopback, no redirects. Requires the companion STM
branch `codex/matterhorn-selected-secrets-2026-09-28`; released STM 1.9.0 is not
assumed to support this contract. Do not use `/api/inject/env` as a fallback.

## Current boundary

- `connect({consent:true})` records pairing metadata after authentication.
- `inventory()` and `listBindings()` return only explicit metadata.
- `link(...)` grants one named consumer (`mcp:name` or
  `voice:realtime` consumer) access to a tool/label identity. The server additionally
  restricts consumer names to its trusted allowlist. No real migration is provided.
- `resolveForConsumer()` retrieves only that selection, with no value cache.
- `resolveKeyForConsumer()` retrieves one explicitly bound name. Voice uses this
  instead of reading all credentials and keeps the existing key priority.
  Bound voice calls require a host token; owner bearer tokens retain legacy
  voice behavior only when no voice key is bound. A disabled/offline binding
  does not fall back. One descriptor rediscovery handles stale-token responses.
- `spawnStmConsumer()` requires the caller's authorization callback and injects
  only at spawn, never globally. It is a tested primitive, not yet connected to
  OpenCode's actual MCP child-launch path. Callers must preserve session/workspace
  permission checks; the callback is not itself a permission engine.
- Unlink removes a Matterhorn reference; it never revokes/deletes a shared STM key.
- Feature rollback preserves references and blocks affected resolution. It never
  exports credentials back into plaintext.

This is a single-user trust boundary. A dashboard credential grants broad local
vault authority. The selected consumer receives its raw credential and can read
or print it. This does not provide brokered-execution isolation.

The JSON registry contains version, consent state, and binding metadata only.
The server locates it next to the configured legacy environment store, which
also makes isolated test/data-directory overrides explicit.
Writes use a private temporary file and rename, with an exclusive registry lock.
A crash can leave `<registry>.lock`; stop all writers and inspect the registry
before an operator removes that exact stale lock. Never automatically steal locks.
No migration journal, downgrade/export operation, or cross-platform ACL support
is implemented. macOS is the proposed initial platform, not yet OS-accepted.

## Verification

`pnpm --dir packages/stm-credentials test` uses disposable private files,
in-memory HTTP responses and a real disposable child. It does not access a vault.
The STM checkout has an opt-in cross-repository HTTP contract test:

```sh
MATTERHORN_STM_ADAPTER_PATH=/absolute/path/to/matterhorn/packages/stm-credentials/index.mjs \
  bun test test/selected-secrets.test.ts test/matterhorn-contract.test.ts
```

Both fixture and loopback tests are distinct from packaged desktop/real Keychain
acceptance. Do not enable this integration for ordinary users yet.
