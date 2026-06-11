# Matterhorn Work Session Event Stream Contract

This contract defines the session-progress event stream that agent clients should target after the polling-only session APIs. It is documented before implementation so the desktop bridge, server bridge, CLI, and MCP packages can converge on one event shape.

The current stable path remains polling:

```text
GET /workspace/:workspaceId/sessions/:sessionId/status
GET /workspace/:workspaceId/sessions/:sessionId/snapshot
```

The planned streaming path is:

```text
GET /workspace/:workspaceId/sessions/:sessionId/events
```

Transport: Server-Sent Events over `text/event-stream`.

Auth: `client`, using `Authorization: Bearer <client-token>`.

The stream is read-only. It must never accept seed phrases, mnemonics, private keys, wallet exports, host tokens in query strings, or signed transaction payloads.

## Why This Exists

Polling `status` is enough to know whether a prompt is busy or idle. It is too coarse when an external agent wants to show:

- assistant text as it arrives
- tool or browser progress
- todo/status updates
- approval requests
- completion or failure without repeatedly fetching full snapshots

The event stream should be an optional acceleration layer. Clients must still be able to recover through `status` and `snapshot`.

## Request

```http
GET /workspace/ws_123/sessions/ses_123/events?since=42 HTTP/1.1
Authorization: Bearer <client-token>
Accept: text/event-stream
Last-Event-ID: 42
```

Query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `since` | number or string | Optional cursor for replaying events after a disconnect |
| `snapshot` | boolean | Optional `true` to request an initial `session.snapshot` event |

Headers:

| Header | Notes |
| --- | --- |
| `Accept: text/event-stream` | Required for the streaming route |
| `Last-Event-ID` | Optional reconnect cursor; takes precedence when both header and `since` are present |
| `Authorization` | Required client bearer token |

## Event Frame

Each SSE frame uses the cursor as the `id`, a stable event kind as `event`, and a JSON envelope as `data`.

```text
id: 43
event: session.status
data: {"type":"session.status","cursor":"43","workspaceId":"ws_123","sessionId":"ses_123","observedAt":1791693600000,"payload":{"status":{"type":"busy"},"busy":true}}
```

Envelope:

```ts
type MatterhornSessionEvent = {
  type: MatterhornSessionEventType;
  cursor: string;
  workspaceId: string;
  sessionId: string;
  observedAt: number;
  source: "matterhorn-work-server" | "matterhorn-work-desktop" | "matterhorn-work-engine";
  payload: Record<string, unknown>;
};
```

Rules:

- `cursor` is opaque and monotonic within a workspace.
- `observedAt` is a Unix timestamp in milliseconds from the local server.
- `source` names the bridge that observed the event, not the user.
- `payload` is event-specific and must be JSON-serializable.
- If payload shape changes, add fields; do not remove fields without versioning.

## Event Types

| Type | Purpose | Payload minimum |
| --- | --- | --- |
| `session.snapshot` | Initial or recovery snapshot | `session`, optional `messages`, `todos`, `status` |
| `session.status` | Busy, idle, retry, failed, or unknown state | `status`, `busy` |
| `message.created` | A new user, assistant, or tool message exists | `messageId`, `role` |
| `message.delta` | Assistant or tool output appended | `messageId`, `delta` |
| `message.completed` | Message output is complete | `messageId` |
| `todo.updated` | Todo list or task state changed | `todos` or `todo` |
| `approval.requested` | Host approval is required | `approvalId`, `action`, `summary` |
| `approval.resolved` | Approval was allowed, denied, or expired | `approvalId`, `decision` |
| `tool.started` | A tool call started | `toolCallId`, `name` |
| `tool.completed` | A tool call completed | `toolCallId`, `name`, `ok` |
| `browser.action` | A browser/control action changed UI state | `action`, optional `target` |
| `error` | Recoverable or terminal execution error | `code`, `message`, `recoverable` |
| `heartbeat` | Keepalive when no other event is available | `intervalMs` |

Clients should ignore unknown event types and fetch a snapshot if ordering or payload shape is unclear.

## Reconnect And Backfill

Clients reconnect with `Last-Event-ID` or `?since=<cursor>`. The server should replay available events after that cursor. If the cursor is expired or unknown, the server should send:

```text
event: error
data: {"type":"error","cursor":"44","workspaceId":"ws_123","sessionId":"ses_123","observedAt":1791693600001,"source":"matterhorn-work-server","payload":{"code":"cursor_expired","message":"Event cursor is no longer available; fetch a snapshot.","recoverable":true}}
```

Client recovery:

1. Fetch `GET /workspace/:workspaceId/sessions/:sessionId/status`.
2. Fetch `GET /workspace/:workspaceId/sessions/:sessionId/snapshot`.
3. Reopen the stream with the newest cursor returned by the server if available.

## Client Flow

1. Call `matterhorn_create_session` if a session does not exist.
2. Call `matterhorn_submit_session_prompt`.
3. Poll `matterhorn_get_session_status` until the stream opens successfully.
4. Open `GET /workspace/:workspaceId/sessions/:sessionId/events`.
5. Render deltas and status events as they arrive.
6. Fetch `matterhorn_get_session_snapshot` when the session becomes idle, after reconnects, or before taking write actions.

MCP clients that cannot expose streaming responses should keep using `matterhorn_get_session_status` and `matterhorn_get_session_snapshot`. A future MCP tool may expose `matterhorn_watch_session_events` as a bounded watch that returns the next batch of events instead of a never-ending stream.

## Safety And Privacy

- Do not stream custody material, wallet exports, private keys, seed phrases, mnemonics, host tokens, or raw signer payloads.
- Do not put tokens in query strings.
- Do not stream full file contents through this route. Use file-session read APIs for explicit file reads.
- Approval events may include `approvalId`, `action`, `summary`, and path metadata, but not the host approval token.
- Bittensor signed-action previews may be referenced by ID or summarized, but unsigned payloads and externally signed payloads should stay in the explicit Bittensor API path.
- Browser events should expose semantic action names and safe selectors, not screenshots unless a future scoped route explicitly allows them.

## Implementation Notes

- The existing `GET /workspace/:workspaceId/events` route remains a workspace reload/config event route.
- The session event route should be session-scoped and should not replace the workspace event route.
- The first implementation can bridge existing Matterhorn Work engine session events into this envelope, then add richer message/tool deltas as they become stable.
- If native SSE is unavailable in an agent client, expose a bounded batch route or MCP watch tool with the same envelope and cursor semantics.
