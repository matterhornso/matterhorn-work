# Handoff: Matterhorn Memory Contract Layer

**From:** Kimi (type/contract owner)  
**To:** Codex (runtime API/CLI/vault owner, coordination lead)  
**Date:** 2026-06-22  
**Subject:** Matterhorn Memory type/contract layer is ready for runtime integration

## What Was Built

I completed the Matterhorn Memory **type/contract layer** in `packages/types/src/memory.ts` and supporting tests/docs. This is the shared foundation the vault, API/CLI/MCP, chat, and UI workstreams will consume.

### Core Record Model

- `MatterhornMemoryRecord` – full memory record shape
- `MatterhornMemoryScope` – `user | workspace | project | session`
- `MatterhornMemoryKind` – `user_preference | project_fact | protocol_address | watchlist | receipt | workflow_artifact | decision | client_profile | connector_preference | mcp_tool_preference`
- `MatterhornMemorySource` – `user_confirmed | chat_capture | workflow_output | receipt_import | watch_event | connector_metadata | manual_entry`
- `MatterhornMemorySensitivity` – `public | private | restricted | forbidden_secret`
- `MatterhornMemoryProvenance` – source, sourceId, capturedAt, capturedBy, confidence, reasonRemembered
- `MatterhornMemoryRedactionResult` – ingest-time rejection result
- `MatterhornMemorySafetyPolicy` / `DEFAULT_MATTERHORN_MEMORY_SAFETY_POLICY`
- `MatterhornMemoryStore` – vault-facing store shape

### Context & Integration Types

- `MatterhornMemoryContextPacket` – what chat/UI receives when retrieving memory; must be `visibleToUser: true` and contain only safety-validated records
- `MatterhornMemorySuggestion` – proposed memory capture; `user_confirmed_only`, `canAutoCapture: false`, `requiresExplicitConsent: true`, `forbiddenIfSecretDetected: true`
- `MatterhornMemoryUsePolicy` – governs chat/UI use: `hiddenMemoryAllowed: false`, `userVisibleMemoryChipsRequired: true`, `autoCaptureAllowed: false`, `secretCaptureAllowed: false`, `wellnessClinicalCaptureRequiresExplicitConsent: true`, `marketSubmissionMemoryAllowed: false`
- `MatterhornMemoryExportManifest` – exported bundle metadata; must declare `includesSecrets: false`, `includesRawSignatures: false`, `includesSignedPayloads: false`, `includesWalletExports: false`

### Runtime Validators

All exported from `packages/types/src/memory.ts`:

- `validateMemoryRecord(record)`
- `validateBittensorMemoryIsNonCustodial(record)`
- `validateMarketMemoryDoesNotEnableLiveSubmission(record)`
- `validateWellnessMemoryIsEducationalAndOptIn(record)`
- `validateMemorySafety(record)`
- `redactForbiddenMemorySecrets(record)`
- `validateMemoryContextPacket(packet)`
- `validateMemorySuggestion(suggestion)`
- `validateMemoryUsePolicy(policy)`
- `validateMemoryExportManifest(manifest)`

## Files Owned & Changed

- `packages/types/src/memory.ts`
- `packages/types/src/index.ts` (re-exports `./memory`)
- `scripts/matterhorn-memory-contract.test.mjs`
- `docs/memory/matterhorn-memory-contract.md`
- `docs/handoffs/kimi-matterhorn-memory-context-contract.md` (this file)

## Pull Requests

- **#497** `feat: add Matterhorn memory contract` – base record model, merged.
- **#499** `feat: extend Matterhorn memory context contract` – context packet, suggestion, use policy, export manifest. **Open and ready for review.**

Both are based on latest `dev` after #493 (build plan) and #495 (Wellness memory safety lane) merged.

## Verification

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-memory-contract
pnpm test:market-execution-safety-gate
```

All three pass.

## Safety Invariants Enforced

- Rejects seed phrases, private keys, mnemonics, API secrets, raw signatures, signed payloads, signed orders, wallet exports, bearer tokens, exchange secrets, and credential-shaped env keys
- Bittensor memory is public-address / external-signer only; never custodial
- Market memories cannot enable live submission
- Wellness memories are educational and opt-in; clinical records require `user_confirmed` provenance and `opt-in` tag
- Context packets are always user-visible and safe
- Suggestions cannot auto-capture and require explicit consent
- Use policy forbids hidden memory, auto-capture, secret capture, and market-submission memory
- Export manifests must declare they contain no secrets, signatures, payloads, or wallet exports

## What You (Codex) Should Know

1. **This is a contract-only PR.** No runtime behavior is implemented. It defines the types and validators the vault/API/CLI/MCP layers should import and call.

2. **Merge independence.** #499 can merge independently of #496 (Minimax Memory UI) and any in-flight production UI/UX work. It only touches types, a script test, and docs.

3. **No overlap with your runtime work.** I did not touch:
   - `packages/matterhorn-memory-vault/`
   - `apps/server/`
   - `apps/orchestrator/`
   - `packages/matterhorn-work-mcp/`
   - `apps/app/`

4. **Recommended integration points for your team:**
   - Call `validateMemorySafety(record)` before any write in the vault layer.
   - Call `redactForbiddenMemorySecrets(record)` to decide whether to propose or reject ingest.
   - Use `MatterhornMemoryContextPacket` as the return shape for chat-context queries.
   - Use `MatterhornMemorySuggestion` for "Remember this?" proposals.
   - Enforce `MatterhornMemoryUsePolicy` defaults in the API/MCP layer.
   - Use `MatterhornMemoryExportManifest` when exporting memory bundles.

5. **Downstream workstreams referenced in docs:**
   - Local vault: `codex/matterhorn-memory-vault`
   - API/CLI/MCP surfaces: `codex/matterhorn-memory-api`
   - Chat retrieval and capture: `codex/matterhorn-memory-chat-ui`
   - UI system: `minimax/matterhorn-memory-ui-system`
   - Wellness safety lane: `claude/wellness-memory-safety-lane`

## Next Steps

- Review and merge #499 when ready.
- Begin Phase 2/3 vault and API/CLI/MCP work using these types.
- If the contract needs new fields/kinds for runtime integration, propose changes and I will own the type updates.

## Customer Promise

Matterhorn may remember what helps users work faster, but it must always make memory visible and reversible. The memory layer should increase trust because the user can inspect and control it, not because it is invisible.
