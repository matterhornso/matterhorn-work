# Matterhorn Work Local Agent API

This is the stable local HTTP surface used by `matterhorn-work-mcp`. It is meant for Claude Code, Codex, Cursor, Claude Desktop, and other agent environments that need to inspect or operate a running Matterhorn Work server without scraping the UI.

The API is local-first and non-custodial. It does not accept seed phrases, mnemonics, private keys, or wallet exports.

## Base URL

Default local server:

```text
http://127.0.0.1:8787
```

MCP clients should read this from `MATTERHORN_WORK_SERVER_URL`. Legacy `OPENWORK_SERVER_URL` remains supported by the MCP package.

## Authentication

| Auth class | Header | Used for |
| --- | --- | --- |
| `none` | none | Public health checks |
| `client` | `Authorization: Bearer <client-token>` | Status, capabilities, workspaces, file sessions, Bittensor chat/readiness |
| `host` | `X-Matterhorn-Host-Token: <host-token>` | Approval inspection and approval replies |

Legacy `X-OpenWork-Host-Token` still works for host routes. Owner-scoped bearer tokens are also accepted by the server for host operations, but `matterhorn-work-mcp` uses the explicit host-token header to avoid confusing client and host capabilities.

## Common Response Shapes

Success responses are JSON objects. Most routes return `200`; file-session creation may return `200` with the created session.

Errors are JSON objects with at least:

```json
{
  "error": "unauthorized",
  "message": "Invalid bearer token"
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `400` | Invalid request body, query, or route parameter |
| `401` | Missing or invalid token |
| `403` | Token scope is too weak, route is read-only, or file session belongs to another token |
| `404` | Workspace, file session, approval, or context was not found |

## MCP Tool Mapping

| MCP tool | HTTP route |
| --- | --- |
| `matterhorn_status` | `GET /health`, `GET /status`, `GET /capabilities` |
| `matterhorn_list_workspaces` | `GET /workspaces` |
| `matterhorn_create_session` | `POST /workspace/:workspaceId/sessions` |
| `matterhorn_list_sessions` | `GET /workspace/:workspaceId/sessions` |
| `matterhorn_get_session` | `GET /workspace/:workspaceId/sessions/:sessionId` |
| `matterhorn_submit_session_prompt` | `POST /workspace/:workspaceId/sessions/:sessionId/messages` |
| `matterhorn_get_session_messages` | `GET /workspace/:workspaceId/sessions/:sessionId/messages` |
| `matterhorn_get_session_status` | `GET /workspace/:workspaceId/sessions/:sessionId/status` |
| `matterhorn_get_session_snapshot` | `GET /workspace/:workspaceId/sessions/:sessionId/snapshot` |
| `matterhorn_watch_session_events` | `GET /workspace/:workspaceId/sessions/:sessionId/events` |
| `matterhorn_delete_session` | `DELETE /workspace/:workspaceId/sessions/:sessionId` |
| `matterhorn_create_file_session` | `POST /workspace/:workspaceId/files/sessions` |
| `matterhorn_file_catalog` | `GET /files/sessions/:sessionId/catalog/snapshot` |
| `matterhorn_watch_file_events` | `GET /files/sessions/:sessionId/catalog/events` |
| `matterhorn_read_files` | `POST /files/sessions/:sessionId/read-batch` |
| `matterhorn_write_files` | `POST /files/sessions/:sessionId/write-batch` |
| `matterhorn_close_file_session` | `DELETE /files/sessions/:sessionId` |
| `matterhorn_list_approvals` | `GET /approvals` |
| `matterhorn_reply_approval` | `POST /approvals/:approvalId` |
| `matterhorn_bittensor_chat` | `POST /api/bittensor/chat/execute` |
| `matterhorn_bittensor_readiness` | `GET /api/bittensor/readiness` |

## System Routes

### `GET /health`

Auth: `none`

Returns a public health snapshot.

```json
{
  "ok": true,
  "version": "0.13.13-alpha.0",
  "opencodeVersion": "1.14.38",
  "uptimeMs": 12345
}
```

### `GET /status`

Auth: `client`

Returns server diagnostics, active workspace metadata, approval mode, CORS configuration, and token-source diagnostics.

### `GET /capabilities`

Auth: `client`

Returns the server capability document used by clients to decide which workspace, sandbox, inbox/outbox, file-session, and approval features are available.

## Workspace Routes

### `GET /workspaces`

Auth: `client`

Returns all workspaces visible to the token.

```json
{
  "items": [
    {
      "id": "ws_1",
      "name": "Matterhorn Work",
      "path": "/Users/me/project",
      "workspaceType": "local"
    }
  ],
  "workspaces": [],
  "activeId": "ws_1"
}
```

## Chat Session Routes

Chat session routes expose stable read-side access to the Matterhorn Work engine's sessions through the Matterhorn Work server. Agents should use these routes to inspect existing work before opening file sessions or asking the user to approve changes.

### `POST /workspace/:workspaceId/sessions`

Auth: `client`

Creates a chat session. This requires writable server mode and at least collaborator token scope.

Request:

```json
{
  "title": "Investigate Bittensor wallet flow"
}
```

Response:

```json
{
  "item": {
    "id": "ses_123",
    "title": "Investigate Bittensor wallet flow"
  }
}
```

### `GET /workspace/:workspaceId/sessions`

Auth: `client`

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `roots` | boolean | Optional root-session expansion where supported |
| `start` | number | Optional non-negative pagination offset |
| `search` | string | Optional search filter |
| `limit` | number | Optional positive item limit |

Response:

```json
{
  "items": [
    {
      "id": "ses_123",
      "title": "Investigate Bittensor wallet flow"
    }
  ]
}
```

### `GET /workspace/:workspaceId/sessions/:sessionId`

Auth: `client`

Returns one chat session.

```json
{
  "item": {
    "id": "ses_123",
    "title": "Investigate Bittensor wallet flow"
  }
}
```

### `POST /workspace/:workspaceId/sessions/:sessionId/messages`

Auth: `client`

Submits a prompt to an existing chat session without going through the raw engine proxy. This requires writable server mode, at least collaborator token scope, and the normal Matterhorn approval policy.

Request with plain text:

```json
{
  "message": "Summarize the current Bittensor flow",
  "model": {
    "providerID": "openai",
    "modelID": "gpt-4.1"
  },
  "agent": "build",
  "noReply": true
}
```

Request with explicit parts:

```json
{
  "parts": [
    { "type": "text", "text": "Summarize the current Bittensor flow" }
  ]
}
```

Response:

```json
{
  "ok": true,
  "accepted": true,
  "sessionId": "ses_123"
}
```

Supported optional fields:

| Name | Type | Notes |
| --- | --- | --- |
| `messageID` | string | Optional client-provided message id |
| `model` | object | `{ "providerID": "...", "modelID": "..." }` |
| `providerID` / `modelID` | string | Top-level model alias; both must be supplied together |
| `agent` | string | Optional agent name |
| `variant` | string | Optional model variant |
| `noReply` | boolean | Ask the engine not to continue with an assistant response when supported |
| `tools` | object | Tool-name to boolean map |
| `system` | string | Optional system override |
| `reasoningEffort` | string | Also accepts `reasoning_effort` |

### `GET /workspace/:workspaceId/sessions/:sessionId/messages`

Auth: `client`

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `limit` | number | Optional positive message limit |

Response:

```json
{
  "items": [
    {
      "id": "msg_123",
      "role": "user",
      "content": "show my TAO"
    }
  ]
}
```

### `GET /workspace/:workspaceId/sessions/:sessionId/status`

Auth: `client`

Returns a lightweight execution-status record for polling after a prompt submission. Use this before fetching a full snapshot when an agent only needs to know whether the session is still busy.

```json
{
  "item": {
    "session": {
      "id": "ses_123",
      "title": "Investigate Bittensor wallet flow"
    },
    "status": { "type": "busy" },
    "busy": true,
    "observedAt": 1781180000000
  }
}
```

### `GET /workspace/:workspaceId/sessions/:sessionId/snapshot`

Auth: `client`

Returns a combined snapshot with the session, messages, todos, and status data where the underlying engine provides them.

```json
{
  "item": {
    "session": { "id": "ses_123" },
    "messages": [],
    "todos": [],
    "status": { "type": "idle" }
  }
}
```

### `GET /workspace/:workspaceId/sessions/:sessionId/events`

Auth: `client`

Streams session progress over Server-Sent Events using the envelope in [Matterhorn Work Session Event Stream Contract](./agent-session-event-stream.md). MCP agents can use `matterhorn_watch_session_events` for bounded progress batches, `GET /workspace/:workspaceId/sessions/:sessionId/status` for lightweight polling, and `GET /workspace/:workspaceId/sessions/:sessionId/snapshot` for recovery.

### `DELETE /workspace/:workspaceId/sessions/:sessionId`

Auth: `client`

Deletes a chat session. This requires writable server mode and at least collaborator token scope.

```json
{
  "ok": true
}
```

## File Session Routes

File sessions are short-lived workspace handles bound to the token that created them. Create read-only sessions by default; request writes only when the user explicitly asks for an edit.

### `POST /workspace/:workspaceId/files/sessions`

Auth: `client`

Request:

```json
{
  "write": false,
  "ttlSeconds": 900
}
```

Response:

```json
{
  "session": {
    "id": "fs_123",
    "workspaceId": "ws_1",
    "createdAt": 1791693600000,
    "expiresAt": 1791694500000,
    "ttlMs": 900000,
    "canWrite": false
  }
}
```

If `write` is not `false`, the server attempts to create a writable session. Writable sessions require at least collaborator scope and are disabled when the server is read-only.

### `GET /files/sessions/:sessionId/catalog/snapshot`

Auth: `client`

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `prefix` | string | Optional path prefix filter |
| `after` | string | Optional pagination cursor by path |
| `limit` | number | Optional item limit |
| `includeDirs` | boolean | Defaults to `true`; set `false` to omit directories |

Response includes `items`, `total`, `truncated`, and `nextAfter`.

### `GET /files/sessions/:sessionId/catalog/events`

Auth: `client`

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `since` | number | Optional file catalog event cursor |

Returns file catalog change events after the optional cursor. MCP agents can use `matterhorn_watch_file_events` when they need lightweight file-change deltas instead of repeatedly fetching full catalog snapshots.

### `POST /files/sessions/:sessionId/read-batch`

Auth: `client`

Request:

```json
{
  "paths": ["README.md", "docs/agent-control-surface.md"]
}
```

Response:

```json
{
  "items": [
    {
      "ok": true,
      "path": "README.md",
      "kind": "file",
      "bytes": 1200,
      "updatedAt": 1791693600000,
      "revision": "1700000000000-1200",
      "contentBase64": "IyBNYXR0ZXJob3JuIFdvcmsK"
    }
  ]
}
```

The raw HTTP API returns `contentBase64`. `matterhorn-work-mcp` decodes text files for agent convenience and preserves binary files as base64.

### `POST /files/sessions/:sessionId/write-batch`

Auth: `client`

Requires a writable file session, collaborator or owner token scope, and the server's normal approval policy.

Request:

```json
{
  "writes": [
    {
      "path": "docs/example.md",
      "contentBase64": "SGVsbG8K",
      "ifMatchRevision": "1700000000000-1200"
    }
  ]
}
```

`force: true` bypasses the optimistic revision check, but it does not bypass server approval policy.

Response:

```json
{
  "items": [
    {
      "ok": true,
      "path": "docs/example.md",
      "bytes": 6,
      "revision": "1700000100000-6",
      "previousRevision": "1700000000000-1200"
    }
  ],
  "cursor": 42
}
```

### `DELETE /files/sessions/:sessionId`

Auth: `client`

Closes a file session.

```json
{
  "ok": true
}
```

## Approval Routes

Approval routes require the host token. They are intentionally separate from client-token routes so an agent can inspect workspaces without being able to approve its own writes.

### `GET /approvals`

Auth: `host`

Returns pending host approval requests.

```json
{
  "items": []
}
```

### `POST /approvals/:approvalId`

Auth: `host`

Request:

```json
{
  "reply": "allow"
}
```

`reply` may be `allow` or `deny`.

Response:

```json
{
  "ok": true,
  "allowed": true
}
```

## Bittensor Routes

### `POST /api/bittensor/chat/execute`

Auth: `client`

Runs the safe Bittensor chat workflow. Use this for ordinary TAO, subnet, wallet, validator, staking-preview, and monitoring requests before reaching for lower-level Bittensor APIs.

Request:

```json
{
  "message": "show my TAO",
  "contextId": "optional-context-id",
  "context": {},
  "ss58Address": "5...",
  "netuid": 14,
  "amountTao": "1",
  "validatorHotkey": "5...",
  "coldkey": "5...",
  "recipient": "5...",
  "destination": "5...",
  "limit": 6,
  "strategy": "balanced",
  "rateTolerance": 0.01
}
```

Response:

```json
{
  "success": true,
  "plan": {},
  "responseText": "I can show this wallet once you provide an SS58 public address.",
  "cards": [],
  "data": {},
  "warnings": [],
  "requiresClarification": true,
  "clarificationQuestion": "What SS58 public address should I check?",
  "execution": "clarification_required"
}
```

Safety rules:

- The route accepts public addresses and action context only.
- It returns unsigned previews for Bittensor actions.
- Users must sign externally through a compatible signer when an action moves beyond preview.
- It never requests or accepts custody material.

### `GET /api/bittensor/readiness`

Auth: `client`

Runs a Bittensor readiness audit and returns a report plus cards for the chat renderer.

```json
{
  "success": true,
  "report": {
    "status": "ready",
    "generatedAt": 1791693600000,
    "checks": []
  },
  "cards": []
}
```

## Not Yet Stable

Browser control and desktop UI automation are not part of this HTTP contract yet. Session event streaming is documented in [Matterhorn Work Session Event Stream Contract](./agent-session-event-stream.md), and MCP clients can use `matterhorn_watch_session_events` when they need bounded progress events instead of polling only.
