# Matterhorn Memory Contract

Matterhorn Memory is the local-first, inspectable, editable, forgettable memory layer for Matterhorn Work. It lets the app remember useful, user-approved context across Bittensor, Hyperliquid, Polymarket, Wellness, workflows, MCPs, files, and customer artifacts.

This document defines the shared type/contract layer. It is intentionally storage-backend and UI agnostic; those layers are owned by other workstreams.

This contract is derived from the Matterhorn Memory build plan in `docs/memory/matterhorn-memory-build-plan.md`.

## Owned Files

- `packages/types/src/memory.ts`
- `packages/types/src/index.ts`
- `scripts/matterhorn-memory-contract.test.mjs`
- `docs/memory/matterhorn-memory-contract.md`

## Core Types

### `MatterhornMemoryRecord`

Every memory record has:

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

Sources describe audit provenance, not permission. `user_confirmed` is required for sensitive categories such as clinical/wellness data.

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

### `MatterhornMemoryContextPacket`

A context packet is what the chat layer receives when retrieving relevant memory. It is always user-visible and contains only records that passed safety validation.

```ts
{
  version: "matterhorn.memory.context-packet.v1";
  taskId?: string;
  sessionId?: string;
  workspaceId?: string;
  query: string;
  records: MatterhornMemoryRecord[];
  omittedRecords: number;
  safetySummary: string;
  visibleToUser: true;
  generatedAt: string;
}
```

### `MatterhornMemorySuggestion`

A memory suggestion is a proposed record presented to the user for explicit confirmation. Suggestions never auto-capture and are forbidden if secret material is detected.

```ts
{
  version: "matterhorn.memory.suggestion.v1";
  id: string;
  proposedRecord: MatterhornMemoryRecord;
  reason: string;
  source: MatterhornMemorySource;
  confidence: number; // 0–1
  desk: MatterhornMemoryDesk;
  useCase: MatterhornMemorySuggestionUseCase;
  userAction: "confirm" | "edit" | "dismiss";
  expiresAt?: string;
  captureMode: "user_confirmed_only";
  canAutoCapture: false;
  requiresExplicitConsent: true;
  forbiddenIfSecretDetected: true;
  policyDecision?: "approve" | "reject" | "review";
  policyWarnings?: string[];
}
```

Use cases:

- `bittensor_wallet_label`
- `bittensor_subnet_watch_preference`
- `hyperliquid_watched_market`
- `polymarket_watched_market`
- `wellness_client_preference`
- `mcp_tool_preference`
- `workflow_artifact_preference`

A suggestion only becomes saved memory when `userAction` is `confirm` or `edit`, all safety validators pass, no secret material is detected, and the policy decision is not `reject`.

### `MatterhornMemoryUsePolicy`

The use policy governs how memory may be injected into chat, UI, and export flows. It defaults to visible, consent-based memory only.

```ts
{
  hiddenMemoryAllowed: false;
  userVisibleMemoryChipsRequired: true;
  autoCaptureAllowed: false;
  secretCaptureAllowed: false;
  wellnessClinicalCaptureRequiresExplicitConsent: true;
  marketSubmissionMemoryAllowed: false;
}
```

### `MatterhornMemoryExportManifest`

An export manifest describes a memory bundle that has left the device. It must never claim to include secrets, raw signatures, signed payloads, or wallet exports.

```ts
{
  version: "matterhorn.memory.export-manifest.v1";
  exportedAt: string;
  recordCount: number;
  sha256: string;
  includesSecrets: false;
  includesRawSignatures: false;
  includesSignedPayloads: false;
  includesWalletExports: false;
}
```

### `MatterhornMemoryDeskPolicy` and `MATTERHORN_MEMORY_DESK_POLICY_MATRIX`

The desk policy matrix maps each product desk to the memory kinds it may store, the default sensitivity, export eligibility, external-context eligibility, and the cases that are forbidden for that desk.

```ts
"bittensor" | "hyperliquid" | "polymarket" | "wellness" | "decentralized_services" | "generic_workspace"
```

```ts
interface MatterhornMemoryDeskPolicy {
  desk: MatterhornMemoryDesk;
  allowedKinds: MatterhornMemoryKind[];
  defaultSensitivity: MatterhornMemorySensitivity;
  canUseInChat: boolean;
  canExport: boolean;
  canSendToMcpApi: boolean;
  forbiddenCases: string[];
}
```

Matrix summary:

| Desk | Allowed kinds | Default sensitivity | Chat | Export | MCP/API | Forbidden cases |
|------|---------------|---------------------|--------|------------------|-----------------|
| `bittensor` | `protocol_address`, `watchlist`, `user_preference`, `decision` | `public` | yes | yes | yes | private keys, seed phrases, mnemonics, raw signatures, signed payloads, wallet exports, custodial key material |
| `hyperliquid` | `watchlist`, `user_preference`, `decision`, `receipt` | `public` | yes | no | no | API secrets, private keys, raw signatures, signed payloads, live submission flags, wallet exports |
| `polymarket` | `watchlist`, `user_preference`, `decision`, `receipt` | `public` | yes | no | no | API secrets, private keys, raw signatures, signed payloads, live submission flags, wallet exports |
| `wellness` | `user_preference`, `client_profile`, `decision` | `restricted` | yes | no | no | clinical records, diagnosis, treatment plans, prescriptions, guaranteed outcomes, medical records without explicit opt-in, auto-capture |
| `decentralized_services` | `project_fact`, `user_preference`, `connector_preference`, `decision`, `receipt` | `private` | yes | no | no | API secrets, private keys, raw signatures, signed payloads, wallet exports |
| `generic_workspace` | `user_preference`, `project_fact`, `workflow_artifact`, `decision` | `private` | yes | no | no | protocol wallet data, private keys, seed phrases, medical/clinical records, API secrets, raw signatures, signed payloads |

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
  canHoldBearerTokens: false,
  canHoldExchangeSecrets: false,
  requiresUserConfirmationForMedical: true,
  marketLiveSubmissionEnabled: false,
  bittensorCustodialEnabled: false,
  wellnessOptInRequired: true,
}
```

The contract enforces these invariants at validation time:

- **No custodial material.** Memory cannot hold seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, signed orders, wallet exports, bearer tokens, or exchange secrets. Credential-shaped env keys (e.g. `sk-...`, `*_API_KEY=...`, `*_SECRET=...`) are also rejected.
- **No live market submission.** Market memories (Hyperliquid, Polymarket) may remember read-only facts, watchlists, receipts, and handoff metadata, but never `canSubmit`, `liveSubmissionEnabled`, sign/submit routes, or signer material. Matterhorn remains an external signer assistant.
- **Bittensor is public-address / external-signer only.** Bittensor memories may store SS58 addresses, coldkey names, hotkey addresses, netuid, and validator names. They must never hold private keys, seed phrases, mnemonics, or wallet exports.
- **Wellness is educational and opt-in.** Wellness/health/clinical memories require `user_confirmed` provenance. Medical/clinical records (diagnosis, treatment plan, prescription, guaranteed outcome) must also be tagged `opt-in`. The system defaults to educational, non-clinical memory only.
- **Context packets are always visible.** A `MatterhornMemoryContextPacket` must have `visibleToUser: true` and only include records that pass `validateMemorySafety`.
- **Suggestions require explicit consent.** A `MatterhornMemorySuggestion` must use `captureMode: "user_confirmed_only"`, `canAutoCapture: false`, `requiresExplicitConsent: true`, and `forbiddenIfSecretDetected: true`. It only becomes saved memory when `userAction` is `confirm` or `edit`, all validators pass, and `policyDecision` is not `reject`.
- **Suggestions are desk-aware.** Each suggestion targets a `desk` and `useCase` and must pass `validateMemorySuggestionAgainstDeskPolicy`.
- **Suggestion display is sanitized.** `sanitizeMemorySuggestionForDisplay` redacts any secret-shaped material before the UI renders the proposal.
- **Use policy keeps memory visible and consent-based.** `MatterhornMemoryUsePolicy` defaults to `hiddenMemoryAllowed: false`, `userVisibleMemoryChipsRequired: true`, `autoCaptureAllowed: false`, `secretCaptureAllowed: false`, `wellnessClinicalCaptureRequiresExplicitConsent: true`, and `marketSubmissionMemoryAllowed: false`.
- **Export manifests are secret-free.** A `MatterhornMemoryExportManifest` must declare `includesSecrets: false`, `includesRawSignatures: false`, `includesSignedPayloads: false`, and `includesWalletExports: false`.
- **Desk policy matrix gates per-desk memory.** A record must match the allowed kinds and minimum sensitivity of its desk. The matrix also controls whether memory may be used in chat (`canUseInChat`), exported (`canExport`), or sent to MCP/API tools (`canSendToMcpApi`). Bittensor remains public-address/external-signer only; Hyperliquid/Polymarket reject live-submission and secrets; Wellness defaults to `restricted` and rejects clinical data without opt-in; generic workspace must not silently inherit protocol, wallet, or medical data.

## Validation Functions

Runtime validators exported from `packages/types/src/memory.ts`:

- `validateMemoryRecord(record)` – shape + forbidden-secret scan
- `validateBittensorMemoryIsNonCustodial(record)` – SS58/coldkey/hotkey only
- `validateMarketMemoryDoesNotEnableLiveSubmission(record)` – no live-submission flags
- `validateWellnessMemoryIsEducationalAndOptIn(record)` – user-confirmed + opt-in for clinical
- `validateMemorySafety(record)` – runs all record validators together
- `validateMemoryContextPacket(packet)` – context packets are user-visible and contain only safe records
- `validateMemorySuggestion(suggestion)` – suggestions require explicit consent and cannot auto-capture
- `validateMemorySuggestionAgainstDeskPolicy(suggestion)` – validates a suggestion against its desk policy
- `sanitizeMemorySuggestionForDisplay(suggestion)` – redacts secret-shaped material before UI display
- `canMemorySuggestionBecomeSavedMemory(suggestion)` – determines whether a user-approved suggestion may be persisted
- `validateMemoryUsePolicy(policy)` – use policy must keep memory visible and consent-based
- `validateMemoryExportManifest(manifest)` – export manifest must not claim secret material
- `validateMemoryDeskPolicy(policy)` – validates a desk policy entry
- `validateMemoryRecordAgainstDeskPolicy(record, desk)` – validates a record against its desk policy
- `detectMemoryDeskFromRecord(record)` – derives the desk from record tags
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

## Downstream Workstreams

This contract is Phase 1 of the Matterhorn Memory build plan. Subsequent phases are owned by other agents:

- Local vault: `codex/matterhorn-memory-vault`
- API/CLI/MCP surfaces: `codex/matterhorn-memory-api`
- Chat retrieval and capture: `codex/matterhorn-memory-chat-ui`
- UI system: `minimax/matterhorn-memory-ui-system`
- Wellness safety lane: `claude/wellness-memory-safety-lane`

## Customer Promise

Matterhorn may remember what helps users work faster, but it must always make memory visible and reversible. The memory layer should increase trust because the user can inspect and control it, not because it is invisible.
