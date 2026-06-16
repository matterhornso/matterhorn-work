# Hyperliquid Read/Preview Operator Notes

This is Matterhorn Work's first Hyperliquid slice. It is intentionally read-only plus preview-only.

## Supported

- List Hyperliquid perpetual markets through the official `info` endpoint.
- Read a public account snapshot from a master or sub-account address.
- Normalize public position and open-order summaries from `clearinghouseState` and `openOrders`.
- Read current funding/open-interest context for a market from `metaAndAssetCtxs`.
- Read an L2 orderbook snapshot for a requested asset.
- Prepare a non-submittable order preview with consequence text, source labels, warnings, and `canSubmit: false`.

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
