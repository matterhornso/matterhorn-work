# Matterhorn Memory Contract

Matterhorn Memory is a local-first, inspectable, editable, forgettable memory system for Matterhorn Work. It helps the app remember safe public facts and user preferences across Bittensor, Hyperliquid, Polymarket, Wellness, workflows, MCPs, files, and customer artifacts.

## Scope

This document defines the type/contract layer only. It does not prescribe storage backends, UI surfaces, or sync mechanics.

Owned files:

- `packages/types/src/memory.ts`
- `packages/types/src/index.ts`
- `scripts/matterhorn-memory-contract.test.mjs`
- `docs/memory/matterhorn-memory-contract.md`

## Core Types

### `MatterhornMemoryRecord`

The central record shape. Every memory has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Stable record identifier |
| `kind` | `MatterhornMemoryKind` | What kind of memory this is |
| `scope` | `MatterhornMemoryScope` | Visibility/ownership boundary |
| `title` | `string` | Human-readable title |
| `summary` | `string` | Short description |
| `body` | `Record<string, unknown>` | Structured memory payload |
| `tags` | `string[]` | Searchable labels |
| `links` | `MatterhornMemoryLink[]` | Related references |
| `provenance` | `MatterhornMemoryProvenance` | Why and how this was remembered |
| `sensitivity` | `MatterhornMemorySensitivity` | Data-sensitivity tier |
| `createdAt` | `string` | ISO creation timestamp |
| `updatedAt` | `string` | ISO update timestamp |
| `expiresAt` | `string?` | Optional expiration timestamp |
| `canUseInChat` | `boolean` | Allowed in chat context |
| `canExport` | `boolean` | Allowed to leave the device |
| `canDelete` | `boolean` | User can delete it |

### `MatterhornMemoryScope`

```ts
"user" | "workspace" | "project" | "session"
```

- `user` – follows the Matterhorn account
- `workspace` – scoped to a workspace
- `project` – scoped to a project
- `session` – ephemeral, tied to the current session

### `MatterhornMemoryKind`

```ts
"user_preference" |
"project_fact" |
"protocol_address" |
"watchlist" |
"receipt" |
"workflow_artifact" |
"decision" |
"client_profile" |
"connector_preference" |
"mcp_tool_preference"
```

### `MatterhornMemorySource`

```ts
"user_confirmed" |
"chat_capture" |
"workflow_output" |
"receipt_import" |
"watch_event" |
"connector_metadata" |
"manual_entry"
```

Sources are audit facts, not permissions. `user_confirmed` is required for sensitive categories such as clinical/wellness data.

### `MatterhornMemorySensitivity`

```ts
"public" | "private" | "restricted" | "forbidden_secret"
```

- `public` – safe to use in chat and export
- `private` – user-facing only, not exported by default
- `restricted` – gated by explicit user action
- `forbidden_secret` – must never be stored; triggers redaction

### `MatterhornMemoryProvenance`

```ts
{
  source: MatterhornMemorySource;
  sourceId?: string;
  capturedAt: string;
  capturedBy: "user" | "agent" | "connector" | "workflow" | "system";
  confidence: number; // 0–1
  reasonRemembered: string;
}
```

### `MatterhornMemoryRedactionResult`

Returned when a record is rejected at ingest time:

```ts
{
  recordId: string;
  redacted: boolean;
  reason: string;
  redactedFields?: string[];
}
```

## Safety Policy

`DEFAULT_MATTERHORN_MEMORY_SAFETY_POLICY` is the conservative baseline:

```ts
{
  canHoldPrivateKeys: false,
  canHoldSeedPhrases: false,
  canHoldApiSecrets: false,
  canHoldRawSignatures: false,
  canHoldSignedPayloads: false,
  canHoldWalletExports: false,
  requiresUserConfirmationForMedical: true,
  marketLiveSubmissionEnabled: false,
  bittensorCustodialEnabled: false,
  wellnessOptInRequired: true,
}
```

The memory contract enforces these invariants at validation time:

- **No custodial material.** Memory cannot hold seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, signed orders, or wallet exports. Secret-shaped env keys (e.g. `sk-...`, `*_API_KEY=...`, `*_SECRET=...`) are also rejected.
- **No live market submission.** Market memories (Hyperliquid, Polymarket) may remember read-only facts, watchlists, receipts, and handoff metadata, but never `canSubmit`, `liveSubmissionEnabled`, sign/submit routes, or signer material. Matterhorn remains an external signer assistant.
- **Bittensor is non-custodial.** Bittensor memories may store SS58 addresses, coldkey names, hotkey addresses, netuid, and validator names. They must never hold private keys, seed phrases, mnemonics, or wallet exports.
- **Wellness is educational and opt-in.** Wellness/health/clinical memories require `user_confirmed` provenance. Medical/clinical records must also be tagged `opt-in`. The system defaults to educational, non-clinical memory only.

## Validation Functions

The contract exports validators for runtime enforcement:

- `validateMemoryRecord(record)` – shape + forbidden-secret scan
- `validateBittensorMemoryIsNonCustodial(record)` – SS58/coldkey/hotkey only
- `validateMarketMemoryDoesNotEnableLiveSubmission(record)` – no live-submission flags
- `validateWellnessMemoryIsEducationalAndOptIn(record)` – user-confirmed + opt-in for clinical
- `validateMemorySafety(record)` – runs all validators together
- `redactForbiddenMemorySecrets(record)` – returns a redaction decision

## Usage Example

```ts
import {
  type MatterhornMemoryRecord,
  validateMemorySafety,
} from "@matterhorn-work/types";

const memory: MatterhornMemoryRecord = {
  id: "mem-123",
  kind: "watchlist",
  scope: "user",
  title: "BTC watchlist",
  summary: "Track BTC price on Hyperliquid",
  body: { symbol: "BTC", exchange: "hyperliquid" },
  tags: ["hyperliquid", "watchlist"],
  links: [],
  provenance: {
    source: "user_confirmed",
    capturedAt: new Date().toISOString(),
    capturedBy: "user",
    confidence: 1,
    reasonRemembered: "User added BTC to watchlist",
  },
  sensitivity: "public",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  canUseInChat: true,
  canExport: false,
  canDelete: true,
};

const result = validateMemorySafety(memory);
if (!result.ok) {
  console.error("Memory rejected:", result.errors);
}
```

## Verification

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-memory-contract
pnpm test:market-execution-safety-gate
```

## Future Work (Out of Scope)

- Persistence backend (vault, IndexedDB, file system)
- UI for inspecting, editing, and deleting memory
- Sync and encryption boundaries
- MCP tool memory integration
- Vector/memory retrieval for chat
