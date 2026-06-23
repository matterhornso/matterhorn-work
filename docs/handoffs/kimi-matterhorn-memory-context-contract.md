# Handoff: Matterhorn Memory Contract Layer

**From:** Kimi (type/contract owner)  
**To:** Codex (runtime API/CLI/vault owner, coordination lead)  
**Date:** 2026-06-25  
**Subject:** Matterhorn Memory contract layer is ready for runtime integration

## What Was Built

I completed and extended the Matterhorn Memory **type/contract layer** in `packages/types/src/memory.ts` and supporting tests/docs. This is the shared foundation the vault, API/CLI/MCP, chat, and UI workstreams consume.

### Base Record Model

- `MatterhornMemoryRecord`
- `MatterhornMemoryScope` – `user | workspace | project | session`
- `MatterhornMemoryKind` – `user_preference | project_fact | protocol_address | watchlist | receipt | workflow_artifact | decision | client_profile | connector_preference | mcp_tool_preference`
- `MatterhornMemorySource` – `user_confirmed | chat_capture | workflow_output | receipt_import | watch_event | connector_metadata | manual_entry`
- `MatterhornMemorySensitivity` – `public | private | restricted | forbidden_secret`
- `MatterhornMemoryProvenance`
- `MatterhornMemoryRedactionResult`
- `MatterhornMemorySafetyPolicy` / `DEFAULT_MATTERHORN_MEMORY_SAFETY_POLICY`
- `MatterhornMemoryStore`

### Context & Integration Types

- `MatterhornMemoryContextPacket` – chat-visible retrieval packet; `visibleToUser: true`; records pass `validateMemorySafety`
- `MatterhornMemorySuggestion` – full user-confirmed capture proposal with `id`, `source`, `confidence`, `desk`, `useCase`, `userAction` (`confirm | edit | dismiss`), `expiresAt`, `policyDecision`, `policyWarnings`, plus safety fields `captureMode: "user_confirmed_only"`, `canAutoCapture: false`, `requiresExplicitConsent: true`, `forbiddenIfSecretDetected: true`
- `MatterhornMemoryUsePolicy` – `hiddenMemoryAllowed: false`, `userVisibleMemoryChipsRequired: true`, `autoCaptureAllowed: false`, `secretCaptureAllowed: false`, `wellnessClinicalCaptureRequiresExplicitConsent: true`, `marketSubmissionMemoryAllowed: false`
- `MatterhornMemoryExportManifest` – declares `includesSecrets: false`, `includesRawSignatures: false`, `includesSignedPayloads: false`, `includesWalletExports: false`

### Memory Suggestion Contract

- `MatterhornMemorySuggestion` – full proposal shape: `id`, `proposedRecord`, `reason`, `source`, `confidence`, `desk`, `useCase`, `userAction`, `expiresAt`, safety flags, `policyDecision`, `policyWarnings`
- `MatterhornMemorySuggestionUseCase` – `bittensor_wallet_label`, `bittensor_subnet_watch_preference`, `hyperliquid_watched_market`, `polymarket_watched_market`, `wellness_client_preference`, `mcp_tool_preference`, `workflow_artifact_preference`
- `MatterhornMemorySuggestionUserAction` – `confirm | edit | dismiss`
- `validateMemorySuggestion(suggestion)`
- `validateMemorySuggestionAgainstDeskPolicy(suggestion)`
- `sanitizeMemorySuggestionForDisplay(suggestion)`
- `canMemorySuggestionBecomeSavedMemory(suggestion)`

### Memory Producers V1

Producer helpers for chat, workflow, and connector layers to create safe suggestions:

- `createWellnessMemorySuggestion(useCase, id, title, body, reason, overrides?)`
  - Wellness use cases: `wellness_client_preference`, `wellness_program_format_preference`, `wellness_offer_builder_preference`, `workflow_artifact_preference`
  - Defaults to `restricted` sensitivity and `opt-in` tag
- `createBittensorMemorySuggestion(useCase, id, title, body, reason, overrides?)`
  - Bittensor use cases: `bittensor_wallet_label`, `bittensor_subnet_watch_preference`, `bittensor_validator_watch_preference`, `bittensor_receipt_context`
  - Defaults to `public` sensitivity and `bittensor` tag

Both helpers enforce the suggestion safety contract and target the correct desk policy.

### Memory Policy Matrix

- `MatterhornMemoryDesk` – `bittensor | hyperliquid | polymarket | wellness | decentralized_services | generic_workspace`
- `MatterhornMemoryDeskPolicy` – `desk`, `allowedKinds`, `defaultSensitivity`, `canUseInChat`, `canExport`, `canSendToMcpApi`, `forbiddenCases`
- `MATTERHORN_MEMORY_DESK_POLICY_MATRIX` – per-desk defaults
- `detectMemoryDeskFromRecord(record)`
- `validateMemoryDeskPolicy(policy)`
- `validateMemoryRecordAgainstDeskPolicy(record, desk)`

### Runtime Validators

- `validateMemoryRecord(record)`
- `validateBittensorMemoryIsNonCustodial(record)`
- `validateMarketMemoryDoesNotEnableLiveSubmission(record)`
- `validateWellnessMemoryIsEducationalAndOptIn(record)`
- `validateMemorySafety(record)`
- `redactForbiddenMemorySecrets(record)`
- `validateMemoryContextPacket(packet)`
- `validateMemorySuggestion(suggestion)`
- `validateMemorySuggestionAgainstDeskPolicy(suggestion)`
- `sanitizeMemorySuggestionForDisplay(suggestion)`
- `canMemorySuggestionBecomeSavedMemory(suggestion)`
- `validateMemoryUsePolicy(policy)`
- `validateMemoryExportManifest(manifest)`
- `validateMemoryDeskPolicy(policy)`
- `validateMemoryRecordAgainstDeskPolicy(record, desk)`

## Files Owned & Changed

- `packages/types/src/memory.ts`
- `packages/types/src/index.ts` (re-exports `./memory`)
- `scripts/matterhorn-memory-contract.test.mjs`
- `docs/memory/matterhorn-memory-contract.md`
- `docs/handoffs/kimi-matterhorn-memory-context-contract.md` (this file)

## Pull Requests

- **#497** `feat: add Matterhorn memory contract` – base record model, merged.
- **#499** `feat: extend Matterhorn memory context contract` – context/suggestion/use-policy/export-manifest, merged.
- **#505** `feat: add Matterhorn memory policy matrix` – desk policy matrix, merged.
- **#511** `feat: add Matterhorn memory suggestion contract` – full suggestion contract, merged.
- **#514** `feat: add Matterhorn memory producer suggestion fixtures` – Memory Producers V1 fixtures and tests, **open**.

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
- Desk policy matrix gates allowed kinds and minimum sensitivity per product desk
- Suggestions never become saved memory without explicit `confirm` or `edit`
- Secret-shaped suggestion content is rejected and redacted before display
- Producer suggestions default to the correct desk sensitivity (`public` for Bittensor, `restricted` for Wellness) and never auto-capture

## What You (Codex) Should Know

1. **This is a contract-only layer.** No runtime behavior is implemented. It defines the types and validators the vault/API/CLI/MCP layers should import and call.

2. **Merge independence.** #514 can merge independently of Codex's production policy enforcement work. It only touches types, a script test, and docs.

3. **No overlap with your runtime work.** I did not touch:
   - `packages/matterhorn-memory-vault/`
   - `apps/server/`
   - `apps/orchestrator/`
   - `packages/matterhorn-work-mcp/`
   - `apps/app/`

4. **Recommended integration points for your team:**
   - Call `validateMemorySafety(record)` before any write in the vault layer.
   - Call `validateMemoryRecordAgainstDeskPolicy(record, desk)` when the desk is known (e.g. from active protocol tab).
   - Call `redactForbiddenMemorySecrets(record)` to decide whether to propose or reject ingest.
   - Use `MatterhornMemoryContextPacket` as the return shape for chat-context queries.
   - Use `MatterhornMemorySuggestion` for "Remember this?" proposals.
   - Use `createWellnessMemorySuggestion` and `createBittensorMemorySuggestion` in producer/chat layers to generate safe suggestions.
   - Enforce `MatterhornMemoryUsePolicy` defaults in the API/MCP layer.
   - Use `MatterhornMemoryExportManifest` when exporting memory bundles.

5. **Downstream workstreams referenced in docs:**
   - Local vault: `codex/matterhorn-memory-vault`
   - API/CLI/MCP surfaces: `codex/matterhorn-memory-api`
   - Chat retrieval and capture: `codex/matterhorn-memory-chat-ui`
   - UI system: `minimax/matterhorn-memory-ui-system`
   - Wellness safety lane: `claude/wellness-memory-safety-lane`

## Next Steps

- Review and merge #514 when ready.
- Wire `validateMemoryRecordAgainstDeskPolicy` into desk-aware capture flows.
- If the contract needs new fields/kinds for runtime integration, propose changes and I will own the type updates.

## Customer Promise

Matterhorn may remember what helps users work faster, but it must always make memory visible and reversible. The memory layer should increase trust because the user can inspect and control it, not because it is invisible.
