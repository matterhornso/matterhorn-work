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

## Verification

```bash
pnpm test:matterhorn-memory-vault
pnpm --dir packages/types build
pnpm test:matterhorn-memory-contract
pnpm test:market-execution-safety-gate
```
