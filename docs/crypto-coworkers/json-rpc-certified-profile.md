# Certified JSON-RPC profile

Matterhorn supports a deliberately restricted [JSON-RPC 2.0](https://www.jsonrpc.org/specification) profile for certified crypto apps.

## Request boundary

- One authorized gateway call creates exactly one JSON-RPC request.
- The signed manifest action ID is the exact method. The model, browser, MCP client, and upstream service cannot replace it.
- Params contain only the already validated network and action arguments.
- Credentials are resolved server-side and travel only as bounded HTTPS headers.
- DNS resolution, TLS hostname verification, connected-peer verification, redirect denial, request size, response size, timeout, quota, and circuit-breaker controls remain active.
- Request IDs are fresh, bounded, and response-bound.

Batch calls, notifications, discovery, subscriptions, callbacks, server-initiated requests, arbitrary methods, destination overrides, and upstream cost claims are not supported.

## Response boundary

The response must match the request ID and contain exactly one `result` using Matterhorn's closed evidence envelope:

```json
{
  "jsonrpc": "2.0",
  "id": "opaque-request-id",
  "result": {
    "data": {},
    "source": "bounded source label",
    "observedAt": "2026-09-05T12:00:00.000Z",
    "blockOrVersion": "checkpoint-or-version"
  }
}
```

The gateway projects `data` through the signed output schema and quarantines instruction-like external content before model use. JSON-RPC error messages and data are not copied into Matterhorn errors, receipts, or model context.

## OpenAPI status

The v1 manifest does not bind an OpenAPI operation path and HTTP method into the publisher signature. Matterhorn therefore leaves `openapi` without a runtime executor. It fails closed as `adapter_transport_unavailable` until a versioned manifest contract can sign the exact operation binding and certification can prove it.
