# Matterhorn Work Agent Control Coverage Matrix

This matrix tracks the current local agent-control surface for Codex, Claude Code, Cursor, Claude Desktop, and other MCP-capable clients.

The goal is to keep every stable capability available through at least one safe agent path, and preferably through all three layers:

- HTTP API for direct integrations.
- `matterhorn-work-mcp` for MCP clients.
- `matterhorn-work` CLI for shell fallback and debugging.

## Session Control

| Capability | HTTP | MCP | CLI | Verification |
| --- | --- | --- | --- | --- |
| Agent operator workflow | Stable server/session/file/Bittensor routes | Copy-paste Codex/Claude tool sequence | Copy-paste CLI fallback loop | `test:agent-operator-workflow` |
| Upstream OpenWork intake | Sync playbook and remote-aware checker output | `matterhorn_upstream_openwork_check` | `matterhorn-work upstream openwork check`, `pnpm upstream:openwork:check` | `test:upstream-openwork-sync`, `test:upstream-openwork-cli`, `test:agent-control-mcp` |
| Bittensor operator playbook | `POST /api/bittensor/chat/execute`, `GET /api/bittensor/readiness`, extrinsic prepare/handoff/submit routes, subnet preview/invoke routes, Bittensor monitoring routes | `matterhorn_bittensor_chat`, `matterhorn_bittensor_readiness`, `matterhorn_bittensor_*extrinsic*`, `matterhorn_bittensor_*signing*`, `matterhorn_bittensor_*subnet*`, `matterhorn_bittensor_*_watch*` | `matterhorn-work bittensor chat`, `matterhorn-work bittensor readiness`, `matterhorn-work bittensor extrinsic`, `matterhorn-work bittensor subnet-preview`, `matterhorn-work bittensor watch` | `test:bittensor-operator-playbook`, `test:bittensor-cli-fallback` |
| Bittensor live QA harness | `POST /api/bittensor/chat/execute`, `GET /api/bittensor/readiness`, `POST /api/bittensor/subnets/:netuid/preview` | Uses MCP-compatible Bittensor contracts | `node scripts/bittensor-live-qa.mjs` | `test:bittensor-live-qa`, `test:bittensor-live-report` |
| Bittensor customer-readiness gate | Aggregates live QA and CI evidence | Uses MCP-compatible Bittensor and agent-control contracts indirectly | `node scripts/bittensor-customer-readiness-gate.mjs` | `test:bittensor-customer-readiness-gate` |
| Unified readiness doctor | Aggregates stable local routes | `matterhorn_doctor` | `matterhorn-work doctor` | `test:agent-control-doctor`, `test:agent-control-mcp`, `test:agent-control-coverage-matrix` |
| End-to-end agent QA harness | Stable server/session/file/Bittensor routes | Uses MCP-compatible contracts | `node scripts/agent-control-live-qa.mjs` | `test:agent-control-live-qa` |
| Health/status/capabilities | `GET /health`, `GET /status`, `GET /capabilities` | `matterhorn_status` | `matterhorn-work status` | `test:agent-control-mcp`, `test:agent-control-api-docs` |
| List workspaces | `GET /workspaces` | `matterhorn_list_workspaces` | `matterhorn-work workspace list` | `test:agent-control-mcp` |
| Create chat session | `POST /workspace/:workspaceId/sessions` | `matterhorn_create_session` | `matterhorn-work sessions create` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| List chat sessions | `GET /workspace/:workspaceId/sessions` | `matterhorn_list_sessions` | `matterhorn-work sessions list` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Read chat session | `GET /workspace/:workspaceId/sessions/:sessionId` | `matterhorn_get_session` | `matterhorn-work sessions get` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Read chat messages | `GET /workspace/:workspaceId/sessions/:sessionId/messages` | `matterhorn_get_session_messages` | `matterhorn-work sessions messages` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Submit prompt | `POST /workspace/:workspaceId/sessions/:sessionId/messages` | `matterhorn_submit_session_prompt` | `matterhorn-work sessions prompt` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Poll session status | `GET /workspace/:workspaceId/sessions/:sessionId/status` | `matterhorn_get_session_status` | `matterhorn-work sessions status` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Read session snapshot | `GET /workspace/:workspaceId/sessions/:sessionId/snapshot` | `matterhorn_get_session_snapshot` | `matterhorn-work sessions snapshot` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |
| Watch session events | `GET /workspace/:workspaceId/sessions/:sessionId/events` | `matterhorn_watch_session_events` | `matterhorn-work sessions events` | `test:agent-session-event-stream-contract`, `test:agent-session-progress-smoke` |
| Delete chat session | `DELETE /workspace/:workspaceId/sessions/:sessionId` | `matterhorn_delete_session` | `matterhorn-work sessions delete` | `test:agent-control-mcp`, `test:agent-session-progress-smoke` |

## Workspace Files

| Capability | HTTP | MCP | CLI | Verification |
| --- | --- | --- | --- | --- |
| Create file session | `POST /workspace/:workspaceId/files/sessions` | `matterhorn_create_file_session` | `matterhorn-work files session create` | `test:agent-control-mcp` |
| List file catalog | `GET /files/sessions/:sessionId/catalog/snapshot` | `matterhorn_file_catalog` | `matterhorn-work files catalog` | `test:agent-control-mcp` |
| Watch file catalog events | `GET /files/sessions/:sessionId/catalog/events` | `matterhorn_watch_file_events` | `matterhorn-work files events` | `test:agent-control-mcp` |
| Read files | `POST /files/sessions/:sessionId/read-batch` | `matterhorn_read_files` | `matterhorn-work files read` | `test:agent-control-mcp` |
| Write files | `POST /files/sessions/:sessionId/write-batch` | `matterhorn_write_files` | `matterhorn-work files write` | `test:agent-control-mcp` |
| Close file session | `DELETE /files/sessions/:sessionId` | `matterhorn_close_file_session` | `matterhorn-work files session close` | `test:agent-control-mcp` |

## Approvals, Browser, And Bittensor

| Capability | HTTP | MCP | CLI | Verification |
| --- | --- | --- | --- | --- |
| List approvals | `GET /approvals` | `matterhorn_list_approvals` | `matterhorn-work approvals list` | `test:agent-control-mcp` |
| Reply to approval | `POST /approvals/:approvalId` | `matterhorn_reply_approval` | `matterhorn-work approvals reply` | `test:agent-control-mcp` |
| Unified crypto chat router | `POST /api/crypto/chat/execute` with versioned `matterhorn.crypto.shared-card.v1` `sharedCards` for discovery, account snapshot, market/orderbook context, preview, compliance block, signer handoff, receipt/status, and watch alert | `matterhorn_crypto_chat`; venue MCP tools remain available after routing: `matterhorn_bittensor_chat`, `matterhorn_hyperliquid_chat`, `matterhorn_polymarket_chat` | `matterhorn-work crypto chat` (aliases `market`/`markets chat`); venue CLI fallbacks: `matterhorn-work bittensor chat`, `matterhorn-work hyperliquid chat`, `matterhorn-work polymarket chat` | `test:unified-crypto-chat`, `test:unified-crypto-shared-card-contract`, `test:crypto-cli-fallback`, `test:agent-crypto-operator-loop`, `test:market-execution-safety-gate` |
| Bittensor chat workflow | `POST /api/bittensor/chat/execute` | `matterhorn_bittensor_chat` | `matterhorn-work bittensor chat` | `test:agent-control-mcp`, Bittensor server tests, `test:bittensor-cli-fallback` |
| Hyperliquid read/preview chat | `POST /api/hyperliquid/chat/execute`, `POST /api/hyperliquid/orders/preview`, handoff/receipt routes | `matterhorn_hyperliquid_chat`, `matterhorn_hyperliquid_prepare_handoff`, `matterhorn_hyperliquid_verify_receipt` | `matterhorn-work hyperliquid chat/preview-order/handoff/receipt` | `test:hyperliquid-read-preview-qa`, `test:hyperliquid-cli-fallback`, `test:market-execution-safety-gate` |
| Polymarket read/preview chat | `POST /api/polymarket/chat/execute`, `POST /api/polymarket/orders/preview`, handoff/receipt routes | `matterhorn_polymarket_chat`, `matterhorn_polymarket_prepare_handoff`, `matterhorn_polymarket_verify_receipt` | `matterhorn-work polymarket chat/preview-order/handoff/receipt` | `test:polymarket-read-preview-qa`, `test:polymarket-cli-fallback`, `test:market-execution-safety-gate` |
| Market public receipt evidence | Venue receipt routes verify through the running server; offline evidence checker has no server route | Venue MCP receipt tools remain available: `matterhorn_hyperliquid_verify_receipt`, `matterhorn_polymarket_verify_receipt` | `matterhorn-work crypto receipt-check` for offline file validation; `matterhorn-work crypto evidence-bundle --receipt-check ... --require-receipt-check` attaches accepted receipt evidence to the final bundle; venue commands remain `matterhorn-work hyperliquid receipt` and `matterhorn-work polymarket receipt` | `test:market-receipt-qa`, `test:market-receipt-evidence`, `test:market-customer-evidence-bundle`, `test:crypto-cli-fallback`, `test:market-execution-safety-gate` |
| Market official SDK evidence | No server route; operator-owned testnet/fixture artifacts only | No MCP tool; agents use the documented operator loop and public evidence bundle | `matterhorn-work crypto customer-smoke` for the consolidated smoke report; `matterhorn-work crypto sdk-doctor` for validation environment readiness; `matterhorn-work crypto sdk-normalize` for redacted official-client artifacts; `matterhorn-work crypto sdk-capture` for normalized public evidence capture; `matterhorn-work crypto sdk-evidence` for offline validation/sample evidence JSON; `matterhorn-work crypto sdk-loop` for the copy-pasteable SDK loop plus `matterhorn-market-sdk-run-manifest.json`; `matterhorn-work crypto evidence-bundle` for the final customer bundle, optionally with public receipt-check evidence; raw helpers remain available: `node scripts/market-official-sdk-validation-doctor.mjs`, `node scripts/market-official-sdk-normalize.mjs`, `node scripts/market-official-sdk-validation-capture.mjs`, `node scripts/market-official-sdk-operator-loop.mjs` | `test:customer-ready-crypto-smoke`, `test:market-official-sdk-validation-doctor`, `test:market-official-sdk-normalize`, `test:market-official-sdk-operator-loop`, `test:market-official-sdk-validation-capture`, `test:market-official-sdk-validation-track`, `test:market-customer-evidence-bundle`, `test:crypto-cli-fallback` |
| Bittensor readiness | `GET /api/bittensor/readiness` | `matterhorn_bittensor_readiness` | `matterhorn-work bittensor readiness` | `test:agent-control-mcp`, `test:bittensor-cli-fallback` |
| Bittensor capability registry | `GET /api/bittensor/capabilities`, `GET /api/bittensor/capabilities/:netuid` | `matterhorn_bittensor_list_capabilities`, `matterhorn_bittensor_get_subnet_capability` | `matterhorn-work bittensor capabilities`, `matterhorn-work bittensor capability` | `test:agent-control-mcp`, `test:bittensor-cli-fallback` |
| Bittensor external signing | `POST /api/bittensor/extrinsics/prepare`, `POST /api/bittensor/extrinsics/handoff`, `POST /api/bittensor/extrinsics/receipt`, `POST /api/bittensor/extrinsics/submit` | `matterhorn_bittensor_prepare_extrinsic`, `matterhorn_bittensor_create_signing_handoff`, `matterhorn_bittensor_import_receipt`, `matterhorn_bittensor_submit_signed_extrinsic` | `matterhorn-work bittensor extrinsic prepare/handoff/submit` plus panel `Copy Import` | `test:agent-control-mcp`, `test:bittensor-cli-fallback`, Bittensor server tests |
| Bittensor subnet adapter preview | `POST /api/bittensor/subnets/:netuid/preview`, `POST /api/bittensor/subnets/:netuid/invoke` | `matterhorn_bittensor_preview_subnet_invocation`, `matterhorn_bittensor_invoke_subnet` | `matterhorn-work bittensor subnet-preview`, `matterhorn-work bittensor subnet-invoke` | `test:agent-control-mcp`, `test:bittensor-cli-fallback` |
| Bittensor monitoring watches | `GET/POST /api/bittensor/monitoring/watchlist`, `GET /api/bittensor/monitoring/check`, `POST /api/bittensor/chat/execute` | `matterhorn_bittensor_create_watch`, `matterhorn_bittensor_list_watches`, `matterhorn_bittensor_check_watches`, `matterhorn_bittensor_watch_digest`, `matterhorn_bittensor_act_on_watch_alert` | `matterhorn-work bittensor watch create/list/check/digest/act` | `test:agent-control-mcp`, `test:bittensor-cli-fallback` |
| Browser semantic actions | Desktop bridge action model | `matterhorn-work-ui-mcp` browser tools | Doctor reports bridge availability | `test:agent-browser-control-guide`, `test:agent-browser-live-qa`, `test:agent-browser-live-probe` |

## Current Gaps

1. Keep OpenAPI-style docs and MCP schemas in sync as new stable server routes are added.
2. Keep the unified doctor updated as new product surfaces become agent-addressable.

## Required Checks

Run these when changing this control surface:

```bash
pnpm test:agent-control-coverage-matrix
pnpm test:agent-operator-workflow
pnpm test:bittensor-operator-playbook
pnpm test:bittensor-live-qa
pnpm test:bittensor-live-report
pnpm test:bittensor-customer-readiness-gate
pnpm test:bittensor-receipt-check
pnpm test:agent-control-doctor
pnpm test:agent-control-live-qa
pnpm test:agent-control-api-docs
pnpm test:mcp-config-cli
pnpm test:agent-session-progress-smoke
pnpm test:bittensor-cli-fallback
pnpm test:upstream-openwork-sync
pnpm test:unified-crypto-chat
pnpm test:unified-crypto-shared-card-contract
pnpm test:agent-crypto-operator-loop
pnpm test:market-execution-safety-gate
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-capture
pnpm test:market-official-sdk-normalize
pnpm test:market-official-sdk-validation-fixtures
pnpm test:market-customer-evidence-bundle
```

The smoke test binds a local mock server, so it may need to run outside restricted sandboxes.

## Bittensor Customer Evidence MCP

- Tool: `matterhorn_bittensor_customer_evidence_bundle`
- Purpose: let Codex, Claude Code, and other MCP clients turn already-collected Bittensor live QA, agent-control QA, CI, readiness-gate, optional public wallet timeline, and scheduled watch-autopilot evidence into a customer-safe Markdown handoff packet.
- Safety: accepts only public evidence objects, rejects credential-shaped fields, does not sign, broadcast, or call subnet services.
- Verification: `pnpm test:agent-control-mcp` / `node packages/matterhorn-work-mcp/test-smoke.mjs`.

## Bittensor Signing Handoff Validation

- The `matterhorn_bittensor_check_signing_handoff` MCP tool validates an external-signer handoff before the user signs it.
- It checks payload SHA-256, expiry, action context, explicit external-signer marker, and forbidden credential/signed-output fields.
- It never signs, submits, broadcasts, imports wallet material, or accepts custody.

## Bittensor Adapter Canary Gate MCP

- `matterhorn_bittensor_adapter_canary_gate` inspects subnet adapter capability evidence before real adapter canaries.
- It checks netuid, adapter declaration, configuration, endpoint policy, host allowlist, mock gating, auth/cost warnings, and forbidden credential/signed-output fields.
- It does not call adapter services, sign, submit, broadcast, move stake, or transfer TAO.

## Bittensor Adapter Canary Evidence Through MCP

- `matterhorn_bittensor_customer_evidence_bundle` accepts optional `adapterCanary` evidence and `requireAdapterCanary` for customer demos involving real subnet adapter canaries.
- This mirrors the CLI evidence bundle and keeps adapter-canary readiness visible to Codex, Claude Code, Claude Desktop, and Cursor operators.

## Bittensor Receipt Import And Check MCP

- `matterhorn_bittensor_import_receipt` imports public external-signer receipt evidence through `POST /api/bittensor/extrinsics/receipt`.
- Receipt import accepts preview/handoff context plus `signatureSha256`, public signer address, or public result metadata; it rejects raw signatures, signed payloads, seed phrases, private keys, mnemonics, and wallet exports.
- `matterhorn_bittensor_check_receipt` validates post-signing Bittensor receipts and produces a public wallet diff follow-up prompt.
- It checks transaction hash/status, payload-hash continuity, expected action/netuid context, and rejects raw signatures or signed payload fields.
- It does not sign, submit, broadcast, import keys, or store signed payloads.

## Bittensor Receipt Evidence Through MCP

- `matterhorn_bittensor_customer_evidence_bundle` accepts optional `receiptCheck` evidence and `requireReceiptCheck` for customer demos that involve an external signer return.
- Required receipt evidence must be accepted by the receipt checker and must not include raw signatures, signed payloads, seed phrases, private keys, mnemonics, or wallet exports.
- This keeps the MCP customer handoff aligned with the CLI evidence bundle while remaining non-custodial.

## Bittensor Read-Only Adapter Canary Evidence Through MCP

- `matterhorn_bittensor_customer_evidence_bundle` accepts optional `readonlyAdapterCanary` evidence and `requireReadonlyAdapterCanary` for demos that include direct subnet service canaries.
- This evidence is distinct from the inspect-only adapter canary gate: it proves the preview-confirm-invoke path ran with explicit invoke confirmation.
- The MCP bundle still rejects credential-shaped fields and remains non-custodial.


## Bittensor Scheduled Watch Evidence Through MCP

- `matterhorn_bittensor_customer_evidence_bundle` accepts optional `watchAutopilotScheduler` evidence and `requireWatchAutopilotScheduler` for demos where monitoring ran while an operator was away.
- The evidence summarizes repeated read-only watch checks, alert counts, and safe prompts; it does not sign, submit, broadcast, transfer TAO, move stake, or invoke subnet services.
- This keeps Codex, Claude Code, Claude Desktop, and Cursor evidence bundles aligned with the CLI customer-evidence flow.
