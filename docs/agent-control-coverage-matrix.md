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
| Bittensor operator playbook | `POST /api/bittensor/chat/execute`, `GET /api/bittensor/readiness` | `matterhorn_bittensor_chat`, `matterhorn_bittensor_readiness` | `matterhorn-work bittensor chat`, `matterhorn-work bittensor readiness` | `test:bittensor-operator-playbook`, `test:bittensor-cli-fallback` |
| Bittensor live QA harness | `POST /api/bittensor/chat/execute`, `GET /api/bittensor/readiness` | Uses MCP-compatible Bittensor contracts | `node scripts/bittensor-live-qa.mjs` | `test:bittensor-live-qa`, `test:bittensor-live-report` |
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
| Bittensor chat workflow | `POST /api/bittensor/chat/execute` | `matterhorn_bittensor_chat` | `matterhorn-work bittensor chat` | `test:agent-control-mcp`, Bittensor server tests, `test:bittensor-cli-fallback` |
| Bittensor readiness | `GET /api/bittensor/readiness` | `matterhorn_bittensor_readiness` | `matterhorn-work bittensor readiness` | `test:agent-control-mcp`, `test:bittensor-cli-fallback` |
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
pnpm test:agent-control-doctor
pnpm test:agent-control-live-qa
pnpm test:agent-control-api-docs
pnpm test:mcp-config-cli
pnpm test:agent-session-progress-smoke
pnpm test:bittensor-cli-fallback
```

The smoke test binds a local mock server, so it may need to run outside restricted sandboxes.
