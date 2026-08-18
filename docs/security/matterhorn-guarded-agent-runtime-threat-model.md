# Matterhorn Guarded Agent Runtime threat model

Status: implementation baseline for `matterhorn.agent-privacy-preflight.v1`, `matterhorn.agent-capability.v1`, `matterhorn.reviewed-action-handoff.v2`, and `matterhorn.agent-run-receipt.v1`.

## Trust boundary

The model, provider, OpenCode conversation state, webpages, token metadata, governance text, protocol responses, third-party MCP output, and every generated tool argument are untrusted. Matterhorn's authenticated server, deterministic privacy firewall, capability broker, typed crypto registry, transaction airlock, connected-wallet review UI, and minimal receipt store are trusted only for their narrow roles. Matterhorn never treats the browser UI as the enforcement boundary.

The wallet is the final authority. The agent may read public data and prepare exact terms. It never receives a sign, relay, submit, scheduler, or autonomous execution capability.

## Protected assets

- Workspace files, selected memories, account-linked wallet context, positions, transaction intent, attachments, and provider choices.
- Seed phrases, private keys, API credentials, wallet exports, raw signatures, signed payloads, and authentication tokens.
- Tenant boundaries, run grants, single-use capabilities, consent tokens, reviewed intent hashes, public receipts, and the security receipt chain.

## Threats and deterministic controls

| Threat | Control | Fail-closed result |
| --- | --- | --- |
| Prompt injection | External content is labeled untrusted, instruction-shaped fields are quarantined, and authorization ignores model prose. | No tool grant or policy change. |
| MCP poisoning | Typed projections, provenance, freshness, bounded output, and evidence hashes; MCP output cannot mint capabilities. | Data remains evidence only. |
| Secret exfiltration | Local deterministic secret detection runs before usage reservation, audit creation, OpenCode dispatch, or provider contact. | `blocked`; zero provider call. |
| Private context sent to an unverified provider | Source labels escalate mode; exact-request consent binds prompt, files, memory, provider, model, workspace, and session for five minutes and one use. | `consent_required`; mutation invalidates consent. |
| Cross-tenant access | Authenticated workspace resolution plus workspace/session claims on run grants, capabilities, preflights, consents, receipts, and actions. | 403/404 without cross-tenant existence disclosure. |
| Permission escalation | Capability authority is the intersection of global policy, selected desk, execution mode, server tool profile, run grant, and exact call. Client profiles can only narrow. | Tool call denied. |
| Tool argument mutation | HMAC capability contains a canonical argument hash and is consumed atomically. | Mutated or replayed call denied. |
| Capability disclosure | Signed capability remains in server memory; OpenCode receives only its own non-secret call id. The MCP bridge redeems and deletes it. | Unknown, expired, or replayed call denied. |
| Transaction mutation | v2 handoff hashes full typed terms, policy, signer, network, amount, recipient, slippage, expiry, and simulation reference. | Review invalidated and must be regenerated. |
| Chain confusion | Exact protocol/network/signer fields and protocol-specific wallet surfaces are part of the intent hash. | Wrong network or signer cannot reuse review. |
| Replay | Consent and capabilities are single-use; capabilities expire after 60 seconds; reviewed actions expire and simulations become stale. | Replay denied. |
| Malicious metadata | Keys shaped as instructions, prompts, permissions, or tool calls are quarantined. Original evidence remains outside model context. | Metadata cannot control runtime. |
| Wallet rejection or timeout | No server or agent submit capability exists. Only connected wallet approval can submit. | No transaction is broadcast. |
| Receipt tampering | Date-segmented JSONL receipts are allowlisted, hash chained, verified on load, and expire after 365 days. | Tampered tail is ignored. |
| Deletion conflict | User content and minimal security metadata are separated. An owner-confirmed `POST /workspace/:id/user-content/purge` first deletes engine chats, then Matterhorn-managed notes, memory, outputs, feedback, mission and workflow content; transient consents and grants are revoked. | The purge fails before local deletion when the engine cannot confirm chat removal. Only content-free security records remain until normal expiry. |

## Residual risks

- Provider privacy statements are an external policy dependency; Matterhorn discloses verification status and requires exact consent when the status is unverified.
- A compromised Matterhorn server can subvert server-side controls. Runtime and capability secrets must be independently generated, server-only, rotated after suspected exposure, and never placed in `VITE_*` variables.
- Capability issuance and atomic single-use consumption are process-local in this release. Guarded `shadow` or `enforce` mode therefore requires the documented single-instance control-plane topology. Before horizontal scaling, move grants, call bindings, nonces, and consumption into one shared transactional store; load balancing alone is not sufficient.
- Browser extensions or a compromised wallet can alter or reject a transaction. The wallet UI must refresh simulation, compare the v2 intent, and show exact changed fields before approval.
- Public on-chain addresses become private context when associated with a Matterhorn account even though they remain public on-chain.

## Rollout and rollback

`MATTERHORN_GUARDED_RUNTIME_MODE` defaults to `off`. `shadow` records decisions without weakening any existing denial. Both `shadow` and `enforce` require `MATTERHORN_AGENT_RUNTIME_SECRET` and `MATTERHORN_CAPABILITY_SIGNING_SECRET`; readiness fails when either is missing. Rollback is one mode switch to the existing safe permission and wallet-handoff behavior. Rollout order is Sui, Bittensor, Hyperliquid, Polymarket, then generic crypto chat.
