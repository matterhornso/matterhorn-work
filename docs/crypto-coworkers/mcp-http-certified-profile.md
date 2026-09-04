# Certified MCP Streamable HTTP profile

Status: implemented behind the existing Crypto App Gateway enforcement boundary. The gateway remains `off` by default, and this profile does not certify, register, promote, deploy, or enable any adapter.

Protocol references: [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), and [MCP schema](https://modelcontextprotocol.io/specification/2025-11-25/schema).

Matterhorn implements a deliberately restricted client profile of the stable MCP Streamable HTTP transport dated `2025-11-25`. The server—not the model—performs exactly this sequence for one already authorized manifest action:

1. `initialize` with an empty client capability set.
2. `notifications/initialized` after exact protocol-version negotiation.
3. One `tools/call` whose name is the signed manifest action ID and whose arguments have already passed Matterhorn schema, capability, tenant, network, scope, quota, and circuit checks.

Stateful servers may return `Mcp-Session-Id` during initialization. Matterhorn treats it as opaque, bounds it, sends it only in the protocol header, and rejects any later attempt to replace it. Every request also retains the certified endpoint, public-DNS resolution, pinned TLS peer, response-size bound, timeout, and abort signal selected by the gateway.

## Closed security profile

The profile intentionally does not expose MCP discovery or control surfaces:

- no `tools/list` or model-selected tool names;
- no prompts, resources, roots, sampling, elicitation, tasks, logging, or server-initiated requests;
- no SSE response processing;
- no redirects, endpoint overrides, arbitrary methods, or credential-controlled MCP headers;
- no adapter-provided cost or authority claims;
- no content-only results.

A successful tool response must contain `structuredContent` in Matterhorn's closed evidence envelope: `data`, `source`, `observedAt`, and `blockOrVersion`. Human-readable `content`, server instructions, and `_meta` never become the adapter result. The router then applies the signed projection schema, untrusted-data quarantine, freshness rules, receipt capture, and usage reconciliation.

This is an intentionally narrower certified subset, not a general-purpose MCP client. An adapter needing SSE, tasks, elicitation, sampling, or dynamic tool discovery must not be certified under this profile.

## Certification requirements

Before an MCP HTTP app can be promoted, the existing sealed certification harness must prove:

- exact lifecycle and protocol negotiation;
- exact action-name and canonical-argument binding;
- session replay/substitution rejection;
- credential non-disclosure;
- JSON-RPC error, content-only, SSE, malformed envelope, timeout, peer-change, and abort failure behavior;
- no signing, submission, relay, broadcast, permission-broadening, or destination-selection surface;
- tenant isolation, quota/circuit enforcement, and receipt redaction.

Passing local tests is not certification or release approval. Live sealed evidence and explicit operator promotion remain required.
