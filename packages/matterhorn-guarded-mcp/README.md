# Matterhorn Guarded MCP

The external-agent MCP for Matterhorn. It exposes only authenticated workspace
and chat-session operations. Matterhorn remains the authority for privacy,
provider access, coworker identity, tools, usage, and wallet review.

This package contains no host-approval, filesystem, Memory-write, protocol,
wallet, signing, relay, submission, shell, configuration, or operator tools.

## Hosted HTTP (invite preview)

An invited account can connect a remote MCP client directly, without this npm
package or a local Matterhorn checkout:

```text
MCP address: https://<matterhorn-app>/mcp/guarded
Authorization: Bearer <one-time-key>
Transport: Streamable HTTP
```

Create the key in **Settings → MCPs & Tools**. Matterhorn shows it once, stores
only its hash, limits it to the issuing account's workspace, and lets the user
revoke it immediately. Do not paste the key into chats, commit it to a project,
or share it with another person.

This invite transport uses a static, revocable bearer key. It is not an OAuth
2.1 implementation and must not be described as one. OAuth remains required
before broad self-service distribution.

## Local stdio configuration

```bash
export MATTERHORN_WORK_SERVER_URL="https://your-matterhorn-server.example"
export MATTERHORN_WORK_TOKEN="<guarded-client-token>"
npx -y @matterhorn-work/guarded-mcp
```

Hosted keys have a 30-day maximum lifetime and are rejected on raw OpenCode,
host, configuration, protocol, wallet, signing, relay, and transaction-
submission routes. Operators keep `MATTERHORN_HOSTED_MCP_ACCESS_MODE=off` until
an account is explicitly added to `MATTERHORN_HOSTED_MCP_ACCESS_ACCOUNT_IDS`
and the connector is ready for that tester. Invite mode also requires an
independent `MATTERHORN_HOSTED_MCP_ACCESS_INTEGRITY_SECRET` of at least 32 bytes;
Matterhorn uses it only to authenticate restored key ownership, workspace
scope, expiry, usage, and revocation state.

Until the package is published, run the checked-out entrypoint with Node:

```bash
node /absolute/path/to/matterhorn-work/packages/matterhorn-guarded-mcp/index.mjs
```

## Hosted acceptance

Before invite mode is enabled for design partners, run the exact-release,
two-account acceptance probe. Supply two disposable account session values only
through the invoking process environment; the command accepts no credential
flags and never includes sessions, access keys, workspace IDs, or chat IDs in
its report. It creates one short-lived key per account, proves hash-only listing,
tenant isolation, the bounded chat route set, denial of host/OpenCode/file and
policy controls, token-tamper rejection, immediate revocation, and cleanup.

```sh
# Inject both MATTERHORN_HOSTED_MCP_ACCEPTANCE_ACCOUNT_*_SESSION values from an
# ephemeral secret manager into this process environment first.
pnpm accept:hosted-mcp-access -- \
  --origin https://candidate.example \
  --expected-commit <40-character-release-commit> \
  --strict \
  --json
```

Use separate acceptance accounts, keep shell history private, and revoke their
other browser sessions after the run. A passing report is required evidence; it
does not enable invite mode, publish this package, or grant wallet authority.

The package accepts only `guarded` or `guarded_client` when the legacy
`MATTERHORN_WORK_MCP_PROFILE` variable is present. Any broader profile fails at
startup.

## Boundary

Both the hosted HTTP transport and this local package expose the same 11 tools.
They cover server status, visible workspaces, session
create/read/list/delete, authoritative message submission, bounded progress
events, and snapshots. Every tool rejects undeclared top-level arguments before
network access.

The prompt tool cannot send system instructions, tool overrides, provider
compatibility aliases, or privacy-consent bearer values. For private context
through an unverified provider, complete Matterhorn's exact-request disclosure
inside the account UI. Connected wallets remain the only signing and submission
surface.

No package publication is implied by this source. Release requires the manual,
protected-environment workflow in `.github/workflows/publish-guarded-mcp.yml`,
an immutable `guarded-mcp-v<version>` tag at the exact protected `dev` commit,
npm OIDC trusted publishing without a long-lived token, and post-publication
registry-signature and SLSA-provenance verification.
