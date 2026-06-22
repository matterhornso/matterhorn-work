# Matterhorn Memory Local Vault

The local vault is the first runtime package for Matterhorn Memory. It stores user-controlled memory records as inspectable Markdown files, keeps a portable local index, and writes an append-only audit log for capture, update, forget, and export operations.

This package is intentionally native-free. It uses `memory-index.json` instead of a native SQLite dependency in the first vault PR so the memory layer can build in CI, local desktop tests, and external agent environments without native binding failures. A future desktop/server integration can add SQLite FTS behind the same public package API once runtime packaging owns the native dependency.

## Storage Shape

```text
<memory-root>/
  People/
  Projects/
  Protocols/
    Bittensor/
    Hyperliquid/
    Polymarket/
  Wellness/
  Workflows/
  Watchlists/
  Receipts/
  Decisions/
  Sources/
  memory-index.json
  memory-log.jsonl
```

Each captured record is written to a Markdown note with frontmatter, a human-readable summary, a “Why Remembered” section, and a JSON body block. The index exists for fast local lookup; the Markdown files remain the inspectable source users can review.

## Safety

Before any record is written, the vault calls the shared memory contract safety validators:

- forbidden secret material is rejected;
- `forbidden_secret` sensitivity records cannot be written;
- Bittensor memories must remain non-custodial;
- market memories cannot enable live submission;
- Wellness memories keep the educational/opt-in boundary.

The vault never stores seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or exchange secrets.

## Public API

The package exposes:

- `createMatterhornMemoryVault(rootDir)`
- `captureRecord(record)`
- `getRecord(id)`
- `listRecords(options)`
- `searchRecords(options)`
- `updateRecord(id, patch)`
- `forgetRecord(id, reason)`
- `exportBundle(outputDir)`

The API is designed so later API, CLI, MCP, and app UI layers can build against it without knowing the storage backend.

## Server Routes

The Matterhorn Work server exposes the vault through explicit, client-token-protected routes. These routes do not auto-capture chat. A caller must provide a full memory record or an explicit record id.

```text
GET    /api/memory/search?q=<text>&kind=<kind>&scope=<scope>&tags=a,b&limit=20
GET    /api/memory/entities
GET    /api/memory/entities/:id
POST   /api/memory/capture
PATCH  /api/memory/entities/:id
DELETE /api/memory/entities/:id
POST   /api/memory/forget
POST   /api/memory/export
```

`MATTERHORN_WORK_MEMORY_ROOT` controls the vault root. `OPENWORK_MEMORY_ROOT` is accepted as a legacy fallback. If neither is set, the server uses:

```text
~/.matterhorn-work/memory
```

Every write path runs the shared memory safety contract and the local vault safety checks before touching disk.

## CLI

Agents and operators can use the same server-backed surface through the Matterhorn Work CLI:

```bash
matterhorn-work memory search --query "bittensor wallet" --json
matterhorn-work memory list --kind protocol_address --json
matterhorn-work memory get <memory-id> --json
matterhorn-work memory capture \
  --id mem_public_tao_wallet \
  --kind protocol_address \
  --scope workspace \
  --title "Main TAO wallet" \
  --summary "Public SS58 address label for read-only TAO workflows." \
  --body-json '{"ss58Address":"5...","netuid":14}' \
  --tags bittensor,tao \
  --source user_confirmed \
  --sensitivity public \
  --json
matterhorn-work memory update <memory-id> --patch-json '{"summary":"Updated label."}' --json
matterhorn-work memory forget <memory-id> --reason "User requested deletion." --json
matterhorn-work memory export --output-dir /tmp/matterhorn-memory-export --json
```

The CLI requires the normal local server auth flags or environment:

```bash
matterhorn-work memory search \
  --openwork-url http://127.0.0.1:8787 \
  --token "$MATTERHORN_WORK_TOKEN" \
  --query "TAO" \
  --json
```

The command rejects credential-shaped flags such as `--private-key`, `--seed-phrase`, `--api-secret`, `--raw-signature`, `--signed-payload`, and `--wallet-export`. Body JSON is still validated by the server and vault, so secret-shaped nested fields are rejected before writing.

## Verification

```bash
pnpm test:matterhorn-memory-api-cli
pnpm test:matterhorn-memory-vault
pnpm --dir packages/types build
pnpm test:matterhorn-memory-contract
pnpm test:market-execution-safety-gate
```
