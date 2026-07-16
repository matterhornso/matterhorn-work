# Market Execution-Readiness Security Gate

This document defines the security boundary for market execution. Matterhorn Work supports connected-wallet Hyperliquid execution in the web app. Polymarket remains read/preview only. Agent, MCP, CLI, watch, and chat surfaces do not submit orders.

## Current Enforcement

- `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=true` is required to enable the Hyperliquid execution routes; omitting it is the deployment kill switch
- Hyperliquid execution is limited to `POST /api/hyperliquid/orders/execution-intent` followed by `POST /api/hyperliquid/orders/submit`
- the user reviews an exact, expiring intent and signs it in the connected wallet; Matterhorn verifies the recovered signer and relays that one intent once
- mainnet additionally requires the typed confirmation `SUBMIT LIVE ORDER`
- the default maximum order notional is 1,000 USDC and can be lowered or explicitly changed with `MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC`
- Polymarket has no submit route and remains compliance-gated read/preview and external handoff only
- no private key, seed phrase, API secret, unbound signature, arbitrary signed payload, or wallet export is accepted; the dedicated submit route accepts only the signature for a server-held intent
- Polymarket compliance-blocked previews carry no executable price, size, estimated shares, or typed-data handoff
- public receipt import verifies preview/handoff hashes and rejects credential-shaped fields

## Connected-Wallet Hyperliquid Execution

1. The web app reads current Hyperliquid metadata and mark price through the server.
2. The server validates asset, side, size, price/slippage, network, precision, and notional cap.
3. The server creates a 90-second, one-time intent with an immutable action, nonce, `expiresAfter`, expected signer, and exact EIP-712 Agent payload.
4. The connected wallet signs that exact payload. Matterhorn never receives a private key or API secret.
5. The submit route accepts only intent id, public signer address, signature, and the mainnet confirmation when required.
6. The server recovers the signer, rejects mismatches/replays/expired intents, then relays the already-authorized action to the fixed Hyperliquid testnet or mainnet exchange endpoint.
7. The receipt stores public result data and explicitly does not persist the signature.

Market orders are implemented as IOC limit orders at the reviewed slippage boundary. Limit orders use GTC. Every order requires a fresh wallet approval; no watch, prompt, agent, MCP, or CLI action can auto-submit.

## Legacy Preview And Evidence Chain

`matterhorn.market.execution-chain-guide.v1` is available as a read-only guide through the local API at `GET /api/crypto/market-execution-chain`, plus the local CLI/MCP helpers. It is not a submit or signing permission.

1. Preview or handoff produces a no-submit plan with `canSubmit: false`.
2. External sign request produces `matterhorn.market.external-sign-request.v1` only with `executionMode=testnet_external_signer`.
3. Redacted artifact validation accepts only public/redacted `matterhorn.market.redacted-signed-artifact-envelope.v1` metadata and returns `matterhorn.market.artifact-validation.v1`.
4. Artifact reconciliation turns accepted public validation outputs into customer evidence.
5. Public receipt import accepts only public status fields and verifies them against the originating handoff.

This legacy chain remains deliberately incomplete for agent and operator automation. It proves hash binding and redacted evidence handling without giving MCP, CLI, chat, or watches a submit path.

## Non-Custodial Boundary

All current and future execution paths must keep Matterhorn non-custodial:

1. Build a fresh preview from public data and user-supplied public context.
2. Bind the preview to `previewSha256`.
3. Reject stale previews and hash mismatches before a handoff can be used.
4. Show the exact venue, network, asset, side, size, price/slippage, expiry, reduce-only state, and estimated notional before signing.
5. The user's own connected wallet decides whether to sign the exact intent.
6. Matterhorn may relay only that verified, one-time intent when the deployment kill switch allows it.
7. Matterhorn stores only public receipt data: order id, status, public signer address, or public result metadata.
8. Audit logs store public hashes, public route names, safety status, and redacted evidence only.

## Required Controls

| Control | Required behavior |
| --- | --- |
| `preview_hash_binding` | Every preview includes a deterministic public hash over the non-secret action terms. |
| `stale_preview_rejection` | Expired previews, mismatched hashes, or changed public terms fail closed. |
| `operator_confirmation` | Any future handoff requires a plain-English consequence statement and explicit external-signer acknowledgement. |
| `external_signer_handoff` | Matterhorn never signs, computes a final signature, or stores keys. Hyperliquid relay is limited to the exact wallet-authorized intent. |
| `public_receipt_import` | Receipt import accepts only public status fields and verifies them against the originating handoff. |
| `audit_logging` | Evidence logs are public/redacted and contain no signing material. |
| `prompt_injection_rejection` | Prompts that ask Matterhorn to ignore safety, sign, submit, or bypass policy return a safe refusal or clarification. |
| `secret_injection_rejection` | Credential-shaped fields and values are rejected before planning, preview, handoff, receipt, MCP, or CLI execution. |
| `compliance_bypass_rejection` | Compliance-blocked Polymarket previews cannot emit executable order terms or signing handoff data. |

## Negative Tests

The readiness gate must continue to prove:

- prompt injection cannot enable signing or submission; execution is reachable only from the dedicated connected-wallet ticket;
- secret-shaped input is rejected in HTTP, MCP, and CLI surfaces;
- stale preview or hash mismatch fails closed;
- Polymarket compliance blocks cannot be bypassed into executable price/size/share fields;
- fake signed-payload or raw-signature receipt imports are rejected;
- no command, MCP schema, chat helper, or watch exposes live market submission or exchange credential handling;
- kill-switch-off, expired intent, changed wallet, changed intent, replay, oversized notional, excess slippage, and wrong mainnet confirmation all fail closed.

## Current Status

Hyperliquid connected-wallet execution is enabled only when the deployment kill switch is on. Polymarket remains read/preview only. Passing this gate means the code preserves those separate boundaries; it does not replace a small-value testnet wallet acceptance test or production incident-response review.
