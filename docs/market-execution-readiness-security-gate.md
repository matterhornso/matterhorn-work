# Market Execution-Readiness Security Gate

This document defines the security boundary for market execution. Matterhorn Desks supports connected-wallet Hyperliquid execution and separate, compliance-gated Polymarket EOA buy, sell, and cancel tickets in the web app. Agent, MCP, CLI, watch, and chat surfaces do not submit orders.

## Current Enforcement

- `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=true` is required to enable the Hyperliquid execution routes; omitting it is the deployment kill switch
- Hyperliquid execution is limited to `POST /api/hyperliquid/orders/execution-intent` followed by `POST /api/hyperliquid/orders/submit`
- the user reviews an exact, expiring intent and signs it in the connected wallet; Matterhorn verifies the recovered signer and relays that one intent once
- mainnet additionally requires the typed confirmation `SUBMIT LIVE ORDER`
- the default maximum order notional is 1,000 USDC and can be lowered or explicitly changed with `MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC`
- Polymarket has no agent-facing server submit route; agent and MCP tools remain compliance-gated read, draft, and wallet-handoff only
- the separate browser-wallet ticket supports eligible EOA buy, sell, and cancel actions only after exact, unexpired review, allowed compliance, and connected Polygon-wallet authorization
- proxy accounts, blocked or unknown compliance, watches, agents, MCP, CLI, and unattended execution cannot submit
- temporary Polymarket CLOB credentials are created inside the browser ticket, never sent to Matterhorn's server, and cleared immediately after the attempt
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

## Connected-Wallet Polymarket Ticket

1. The agent or desk resolves public market context and prepares a non-submittable draft.
2. The separate wallet ticket requests a fresh server preview and compliance result, including the exact market, outcome, CLOB token, pUSD spend, maximum loss, public hash, and expiry.
3. The ticket rejects missing or changed terms, invalid or expired reviews, non-finite values, maximum-loss mismatches, and any compliance result other than `allowed`.
4. The connected EVM wallet must be on Polygon and the user must type `SUBMIT POLYMARKET ORDER`.
5. The official Polymarket CLOB client creates temporary credentials and submits the exact reviewed buy, sell, or cancel action from the connected EOA wallet.
6. Temporary credentials are cleared in a `finally` block. Matterhorn's server receives only a public receipt bound to the original handoff.

This ticket does not make agent drafts executable and does not provide an agent, MCP, CLI, watch, or chat submit route. Proxy-account execution, automatic retries, and unattended trading remain out of scope.

## Connected-Wallet Transaction Path

`matterhorn.market.execution-chain-guide.v1` is available as a read-only guide through `GET /api/crypto/market-execution-chain` and the local CLI/MCP helper. It describes the boundary; it is not permission to submit.

1. **Agent draft:** the agent turns the request into exact proposed terms but has no approval or submission authority.
2. **Policy and simulation:** deterministic limits, compliance, network checks, and fresh protocol state either block the action or create a hash-bound reviewed action.
3. **Wallet review:** a short-lived ticket shows the exact network, signer, action, amount, price or slippage, fees, risks, simulation, and expiry.
4. **Wallet authorization:** only the connected wallet can reject or submit the unchanged supported action. Any material change regenerates the ticket.
5. **Receipt reconciliation:** public protocol evidence must match the reviewed intent hash; secrets, signatures, and raw wallet material are never stored in the receipt.

Unsupported and advanced actions remain unavailable. There is no fallback route that accepts an externally signed artifact from the agent, MCP, CLI, chat, or a watch.

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
| `policy_and_simulation` | Limits, compliance, network state, and current protocol conditions are rechecked before wallet review. |
| `wallet_review` | Every supported action requires a plain-English consequence statement and exact connected-wallet review. |
| `connected_wallet_only` | Matterhorn never signs, computes a final signature, or stores keys. Any relay is limited to the exact wallet-authorized intent. |
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
- no command, MCP schema, chat helper, watch, or server route exposes Polymarket live submission or exchange credential handling;
- kill-switch-off, expired intent, changed wallet, changed intent, replay, oversized notional, excess slippage, and wrong mainnet confirmation all fail closed.
- Polymarket missing-wallet, wrong-chain, blocked-compliance, invalid expiry, changed maximum loss, and missing explicit confirmation all fail closed.

## Current Status

Hyperliquid connected-wallet execution is enabled only when the deployment kill switch is on. Polymarket agent tools remain read/draft only; eligible EOA buy, sell, and cancel actions use separate reviewed browser-wallet tickets. Passing this gate means the code preserves those boundaries; it does not replace controlled wallet acceptance or production incident-response review.
