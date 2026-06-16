# Hyperliquid Read/Preview Operator Notes

This is Matterhorn Work's first Hyperliquid slice. It is intentionally read-only plus preview-only.

## Supported

- List Hyperliquid perpetual markets through the official `info` endpoint.
- Read a public account snapshot from a master or sub-account address.
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

For live local-server checks, see [Hyperliquid Read/Preview QA](./hyperliquid-read-preview-qa.md).

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
