# Hyperliquid Read/Preview Operator Notes

This is Matterhorn Work's first Hyperliquid slice. It is intentionally read-only plus preview-only.

## Supported

- List Hyperliquid perpetual markets through the official `info` endpoint.
- Read a public account snapshot from a master or sub-account address.
- Normalize public position and open-order summaries from `clearinghouseState` and `openOrders`.
- Read current funding/open-interest context for a market from `metaAndAssetCtxs`.
- Read an L2 orderbook snapshot for a requested asset.
- Create/check/digest read-only watches for funding, price/orderbook movement, position margin, open-order state, and market availability.
- Prepare a non-submittable order preview with consequence text, source labels, warnings, and `canSubmit: false`.
- Resolve close/reduce intent ("close half my ETH position") against the live public position when an address is supplied.

## Preview Risk Fields

Each order preview now carries structured risk context alongside `canSubmit: false`. None of it changes the read-only/preview-only posture; it only explains the planned action.

- `notionalUsd` — size times the explicit/mark price (or estimated fill when no price is given).
- `marketability` — best-effort fill estimate from the public orderbook: `referencePrice`, `estimatedFillPrice`, `estimatedSlippagePct`, `worstLevelPrice`, and `depthSufficient`. A warning is added when visible depth cannot fill the size or when estimated slippage exceeds the caller's tolerance.
- `funding` — `fundingRate`, `annualizedFundingPct`, and `openInterest` for the asset, with a plain-English note (positive funding means longs pay shorts).
- `reduceOnly` / `closeContext` — true for close/reduce intent, with a note that a reduce-only order can only shrink, never flip, exposure.
- `leverageContext` — `maxLeverage` from venue meta, plus `estimatedLeverage` and `liquidationPrice`. When no account address is known these are `null` with `requiresAccountContext: true` and an explicit "requires account context" note rather than a guess. When a public address is supplied they are read from the live position.
- `consequence` — a plain-English statement that ends with explicit "Matterhorn will not sign or submit it" language.

If a close/reduce request arrives without an account address, the workflow asks exactly one clarification (for the public address) instead of guessing the position size or side. External signing/execution is not enabled; Matterhorn never holds keys or submits to Hyperliquid.

## External-Signer Execution (non-custodial)

Users can take a preview live **without Matterhorn holding a key, signing, submitting, or broadcasting** — mirroring the shared `external_signer_required` / `MarketReceipt` contract:

1. **Preview** → an `unsigned_preview` (`canSubmit: false`).
2. **`buildHyperliquidSigningHandoff(preview)`** → a `HyperliquidSigningHandoff`: the public order terms (asset, side, size, price, reduce-only), the signing scheme (Hyperliquid L1 action signing), a `previewSha256` binding, a `handoffSha256`, and an expiry. `externalSignerOnly: true`, `canSubmit: false`. Never fabricates a signature.
3. **The user signs and submits with their own wallet** via Hyperliquid's official client — Matterhorn provides the economic terms only, never the signature, API wallet, or submission.
4. **`verifyHyperliquidReceipt(handoff, receipt)`** validates a returned **public** receipt (order id / tx hash / status) against the handoff and emits a `MarketReceipt`-shaped result. It **rejects any signing material** (raw signatures / signed payloads are never accepted).

Matterhorn stays non-custodial end to end: no API-wallet key, no signing, no broadcasting, and no acceptance of signing material on the way back in. Matterhorn still never submits — the **user** executes.

### L1 order-action payload (validation-gated)

When the asset index is resolvable, the handoff also carries `signingPayload` — the **canonical Hyperliquid L1 order-action object** (`buildHyperliquidOrderActionPayload`): `{ type: "order", orders: [{ a, b, p, s, r, t:{limit:{tif}} }], grouping: "na" }`, plus the fixed EIP-712 **Agent** signing scaffold (domain `Exchange`/`1`/chainId `1337`, `Agent(source, connectionId)`).

This is a **template, not a signed action.** Matterhorn does **not** compute the `connectionId` (the msgpack action hash over action+nonce+vault), the nonce, or the signature — those are in `clientMustCompute` and are produced by the official Hyperliquid SDK from a key Matterhorn never holds. `requiresClientValidation` is always `true`: **validate the action format, asset index, tif, and agent domain against Hyperliquid's official SDK and on testnet before signing real funds.** A market order (no limit price) needs the SDK's IOC + slippage-price handling; the template uses `tif=Gtc`.

## Not Supported Yet

- API wallet creation or storage.
- Private keys, API secrets, signatures, signed actions, or signed payloads.
- Exchange endpoint order submission.
- Live trading, cancellation, leverage updates, transfers, vault actions, or scheduled cancel.
- Jurisdiction/compliance approval.

## Safety Rules

- Treat every order preview as a local planning artifact.
- Reject credential-shaped fields before planning or previewing.
- Require the user to provide a public `0x` account address for account reads.
- Ask a clarification question if asset, side, or size is missing.
- Keep Hyperliquid work separate from Polymarket branches while parallel agents are active.

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
