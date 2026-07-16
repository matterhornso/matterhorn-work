# Hyperliquid Read, Preview, And Wallet Execution

Matterhorn Work supports Hyperliquid research, previews, and connected-wallet perpetual order execution. Chat, MCP, CLI, and watch surfaces remain read/preview only; live orders are available only in the dedicated web trade ticket.

## Supported

- List Hyperliquid perpetual markets through the official `info` endpoint.
- Read a public account snapshot from a master or sub-account address.
- Normalize public position and open-order summaries from `clearinghouseState` and `openOrders`.
- Read current funding/open-interest context for a market from `metaAndAssetCtxs`.
- Read an L2 orderbook snapshot for a requested asset.
- Create/check/digest read-only watches for funding, price/orderbook movement, position margin, open-order state, and market availability.
- Convert a triggered/degraded watch into a deterministic read-only alert review through `POST /api/hyperliquid/watches/act` without accepting custom prompts or signing material.
- Prepare a non-submittable order preview with consequence text, source labels, warnings, and `canSubmit: false`.
- Resolve close/reduce intent ("close half my ETH position") against the live public position when an address is supplied.
- Create a short-lived exact order intent, obtain an EIP-712 signature from the connected wallet, verify the recovered signer, and relay that one order when the deployment execution switch is enabled.

## Preview Risk Fields

Each chat, MCP, CLI, or watch preview carries structured risk context alongside `canSubmit: false`. Those planning surfaces remain read/preview-only. A user who wants to trade must separately open the web trade ticket and approve a fresh execution intent.

- `notionalUsd` — size times the explicit/mark price (or estimated fill when no price is given).
- `marketability` — best-effort fill estimate from the public orderbook: `referencePrice`, `estimatedFillPrice`, `estimatedSlippagePct`, `worstLevelPrice`, and `depthSufficient`. A warning is added when visible depth cannot fill the size or when estimated slippage exceeds the caller's tolerance.
- `funding` — `fundingRate`, `annualizedFundingPct`, and `openInterest` for the asset, with a plain-English note (positive funding means longs pay shorts).
- `reduceOnly` / `closeContext` — true for close/reduce intent, with a note that a reduce-only order can only shrink, never flip, exposure.
- `leverageContext` — `maxLeverage` from venue meta, plus `estimatedLeverage` and `liquidationPrice`. When no account address is known these are `null` with `requiresAccountContext: true` and an explicit "requires account context" note rather than a guess. When a public address is supplied they are read from the live position.
- `consequence` — a plain-English statement that explains the preview itself cannot sign or submit. It also points to the separate wallet-approved trade ticket when execution is enabled.

If a close/reduce request arrives without an account address, the workflow asks exactly one clarification (for the public address) instead of guessing the position size or side. Agent workflows never execute. The user can separately review and sign an order in the connected-wallet trade ticket.

## External-Signer Execution (non-custodial)

The legacy handoff flow remains available **without Matterhorn holding a key, signing, submitting, or broadcasting** — mirroring the shared `external_signer_required` / `MarketReceipt` contract:

1. **Preview** → an `unsigned_preview` (`canSubmit: false`).
2. **`buildHyperliquidSigningHandoff(preview)`** → a `HyperliquidSigningHandoff`: the public order terms (asset, side, size, price, reduce-only), the signing scheme (Hyperliquid L1 action signing), a `previewSha256` binding, a `handoffSha256`, and an expiry. `externalSignerOnly: true`, `canSubmit: false`. Never fabricates a signature.
3. **The user signs and submits with their own wallet** via Hyperliquid's official client — Matterhorn provides the economic terms only, never the signature, API wallet, or submission.
4. **`verifyHyperliquidReceipt(handoff, receipt)`** validates a returned **public** receipt (order id / tx hash / status) against the handoff and emits a `MarketReceipt`-shaped result. It **rejects any signing material** (raw signatures / signed payloads are never accepted).

The handoff flow stays non-custodial end to end and does not submit. The dedicated web ticket is a separate path: the connected wallet signs an exact server intent, and Matterhorn relays only that verified one-time intent.

## Connected-Wallet Execution

- Enable with `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=true`; absence of the flag keeps the routes disabled.
- Testnet is the default. Mainnet requires the exact phrase `SUBMIT LIVE ORDER` after reviewing real-funds consequences.
- The intent expires after 90 seconds and binds the action, nonce, `expiresAfter`, network, signer, price/slippage, size, and reduce-only state.
- The default maximum order notional is 1,000 USDC (`MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC`). Slippage is capped at 500 bps.
- The server accepts no private key or API secret. It stores no signature in the receipt and rejects expiry, replay, signer mismatch, extra submission fields, and modified intent data.
- Market orders use IOC at the reviewed slippage boundary; limit orders use GTC.
- Chat, MCP, CLI, watches, and agent prompts cannot call the execution path.

### Legacy handoff payload (validation-gated)

When the asset index is resolvable, the handoff also carries `signingPayload` — the **canonical Hyperliquid L1 order-action object** (`buildHyperliquidOrderActionPayload`): `{ type: "order", orders: [{ a, b, p, s, r, t:{limit:{tif}} }], grouping: "na" }`, plus the fixed EIP-712 **Agent** signing scaffold (domain `Exchange`/`1`/chainId `1337`, `Agent(source, connectionId)`).

This legacy handoff is a **template, not a signed action.** Matterhorn does **not** compute the `connectionId`, nonce, or signature for that handoff, and it remains marked `requiresClientValidation: true`. The dedicated web trade ticket is different: the server computes the exact msgpack action hash for a short-lived intent, the connected wallet signs the Hyperliquid Agent typed data, and the server recovers the signer before relaying that same one-time action. Both paths must be validated against the official Hyperliquid SDK (`hyperliquid-python-sdk`) and on testnet before using real funds.

## Not Supported

- API wallet creation or storage.
- Private keys, API secrets, signatures, signed actions, or signed payloads supplied outside the exact server-issued intent. The web ticket accepts only the matching signature for that intent and never stores it in the receipt.
- Agent-driven or unattended order submission.
- Cancellation, leverage updates, transfers, vault/subaccount actions, or scheduled cancel.
- Jurisdiction/compliance approval.

## Safety Rules

- Treat every order preview as a local planning artifact.
- Treat every execution intent as single-use and require a fresh wallet signature.
- Reject credential-shaped fields before planning or previewing.
- Require the user to provide a public `0x` account address for account reads.
- Ask a clarification question if asset, side, or size is missing.
- Keep Hyperliquid work separate from Polymarket branches while parallel agents are active.
- Keep Polymarket read/preview only; Hyperliquid execution does not grant a general market-submit capability.

## QA Harness

Run the repeatable read/preview harness with:

```bash
pnpm test:hyperliquid-read-preview-qa
```

Run the CLI smoke harness with:

```bash
pnpm test:hyperliquid-cli-fallback
```

For live local-server checks, see [Hyperliquid Read/Preview QA](./hyperliquid-read-preview-qa.md).

## CLI Operator Loop

The `matterhorn-work hyperliquid` command is a thin client for the local server routes. It does not accept API secrets, private keys, signatures, or signed payloads, and previews always remain `canSubmit: false`.

```bash
matterhorn-work hyperliquid markets \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --limit 5 \
  --json
```

```bash
matterhorn-work hyperliquid account \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --address 0x0000000000000000000000000000000000000001 \
  --json
```

```bash
matterhorn-work hyperliquid positions \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --address 0x0000000000000000000000000000000000000001 \
  --json
```

```bash
matterhorn-work hyperliquid open-orders \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --address 0x0000000000000000000000000000000000000001 \
  --json
```

```bash
matterhorn-work hyperliquid funding \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC \
  --json
```

```bash
matterhorn-work hyperliquid orderbook \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC \
  --json
```

```bash
matterhorn-work hyperliquid watch create \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --kind funding_rate \
  --asset BTC \
  --threshold 0.0001 \
  --direction above \
  --json
```

```bash
matterhorn-work hyperliquid watch check \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --json
```

```bash
matterhorn-work hyperliquid watch act \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --watch-file ./public-hyperliquid-watch.json \
  --alert-index 0 \
  --json
```

`watch act` only converts a triggered/degraded watch into a deterministic read-only crypto-chat review. It does not sign, submit, broadcast, auto-execute, or accept API secrets, private keys, raw signatures, or signed payloads.

```bash
matterhorn-work hyperliquid preview-order \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC \
  --side buy \
  --size 0.1 \
  --price 65000 \
  --json
```

```bash
matterhorn-work hl chat \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --message "preview buying 0.1 BTC at 65000" \
  --json
```

## Local API

```bash
curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/markets?limit=5" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

```bash
curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/account/0x0000000000000000000000000000000000000001" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

```bash
curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/account/0x0000000000000000000000000000000000000001/positions" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

```bash
curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/account/0x0000000000000000000000000000000000000001/open-orders" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

```bash
curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/funding/BTC" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

```bash
curl -sS -X POST "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/orders/preview" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  --data '{"asset":"BTC","side":"buy","size":0.1,"price":65000}'
```

```bash
curl -sS -X POST "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/chat/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  --data '{"message":"preview buying 0.1 BTC at 65000"}'
```

References:

- Hyperliquid info endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- Hyperliquid exchange endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
