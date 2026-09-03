# Matterhorn Guarded MCP

The external-agent MCP for Matterhorn. It exposes only authenticated workspace
and chat-session operations. Matterhorn remains the authority for privacy,
provider access, coworker identity, tools, usage, and wallet review.

This package contains no host-approval, filesystem, Memory-write, protocol,
wallet, signing, relay, submission, shell, configuration, or operator tools.

## Configuration

```bash
export MATTERHORN_WORK_SERVER_URL="https://your-matterhorn-server.example"
export MATTERHORN_WORK_TOKEN="<account-client-token>"
npx -y @matterhorn-work/guarded-mcp
```

Until the package is published, run the checked-out entrypoint with Node:

```bash
node /absolute/path/to/matterhorn-work/packages/matterhorn-guarded-mcp/index.mjs
```

The package accepts only `guarded` or `guarded_client` when the legacy
`MATTERHORN_WORK_MCP_PROFILE` variable is present. Any broader profile fails at
startup.

## Boundary

The 11 exposed tools cover server status, visible workspaces, session
create/read/list/delete, authoritative message submission, bounded progress
events, and snapshots. Every tool rejects undeclared top-level arguments before
network access.

The prompt tool cannot send system instructions, tool overrides, provider
compatibility aliases, or privacy-consent bearer values. For private context
through an unverified provider, complete Matterhorn's exact-request disclosure
inside the account UI. Connected wallets remain the only signing and submission
surface.

No package publication is implied by this source. Release requires the separate
reviewed provenance workflow and immutable registry verification.
