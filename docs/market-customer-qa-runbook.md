# Market Customer QA Runbook

This runbook is for Hermes, Claude Code, Codex, or a human tester validating the customer-facing crypto-market surfaces before a test-customer demo.

Scope:

- Bittensor remains the mature flow: wallet reads, validator/subnet intelligence, watch/autopilot, unsigned previews, external-signer handoff, and receipt evidence.
- Hyperliquid and Polymarket are read/preview/external-signer only.
- Matterhorn Work must never ask for, store, log, or transmit private keys, seed phrases, API secrets, raw signatures, or signed payloads.
- No live Hyperliquid or Polymarket order submission should happen from Matterhorn Work.

## 1. Static Safety Gates

Run these first from the repository root:

```bash
pnpm test:market-safety-contract
pnpm test:market-execution-safety-gate
pnpm test:market-receipt-qa
pnpm test:hyperliquid-readiness-gate
pnpm test:polymarket-readiness-gate
```

Expected result:

- All commands exit 0.
- Every market preview stays `canSubmit: false`.
- `liveSubmissionEnabled` stays `false`.
- No `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit` route exists.
- Receipt checks reject raw signatures and signed payloads.

## 2. Offline Venue QA

Run the deterministic mocked venue checks:

```bash
pnpm test:hyperliquid-read-preview-qa
pnpm test:polymarket-read-preview-qa
```

Expected result:

- Hyperliquid: market discovery, public account/position/open-order normalization, funding, orderbook, preview-only order, close/reduce preview, and secret rejection pass.
- Polymarket: discovery, event grouping, market detail, orderbook, geoblock/compliance, preview-only order, watch descriptor, and secret rejection pass.
- No network wallets or exchange submission are used by the self-tests.

## 3. Local Server Smoke

Start Matterhorn Work locally, then run read-only server calls. Use a test server token only.

```bash
export MATTERHORN_WORK_SERVER_URL="http://localhost:8787"
export MATTERHORN_WORK_TOKEN="<client-token>"

curl -sS "$MATTERHORN_WORK_SERVER_URL/api/hyperliquid/markets?limit=3" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"

curl -sS "$MATTERHORN_WORK_SERVER_URL/api/polymarket/markets?q=ai&limit=3" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN"
```

Expected result:

- HTTP 200 from read routes.
- Source/freshness fields are present where the provider returns them.
- Failures are clear and do not expose tokens or secrets.

## 4. Preview And Handoff Smoke

Use toy amounts and no real funds. These commands should produce preview/handoff JSON only.

```bash
matterhorn-work hyperliquid preview-order \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC --side buy --size 0.001 --price 65000 --json

matterhorn-work hyperliquid handoff \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC --side buy --size 0.001 --price 65000 --json

matterhorn-work polymarket markets \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --query "AI" --limit 3 --json
```

Expected result:

- Hyperliquid preview includes `canSubmit: false`, `signerPolicy`, `previewSha256`, risk fields, and consequence text.
- Hyperliquid handoff includes `externalSignerOnly: true`, `canSubmit: false`, `previewSha256`, `handoffSha256`, and validation-gated signing payload metadata where available.
- Polymarket market search returns active read-only markets. Pick one market id before previewing a Polymarket order.

## 5. Receipt Evidence Smoke

Do not paste raw signatures or signed payloads. Import only public order id / tx hash / status evidence.

```bash
matterhorn-work hyperliquid receipt \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --handoff-json '<handoff-json>' \
  --receipt-json '{"orderId":"example-order","status":"received"}' \
  --json
```

Expected result:

- Public receipt evidence is validated against the original handoff fields.
- Mismatched asset/side/market/outcome fails.
- Any `signature`, `privateKey`, `apiSecret`, `signedPayload`, `seed`, or `mnemonic` field fails immediately.

## 6. UI/UX Checks

Use the desktop app or web UI and capture screenshots for:

- Bittensor chat: wallet/subnet/validator/readiness cards still render without overflow.
- Hyperliquid chat: a read-only market/account request and a preview-only order response.
- Polymarket chat: search/events/market detail and geoblock/compliance response.
- Handoff cards: show external-signer language, hashes, expiry, and `canSubmit: false`.
- Error states: missing parameters ask one clear clarification question; secret-shaped input is rejected without echoing the secret value.

## 7. Security Red Lines

Fail the QA run if any of these happen:

- Matterhorn asks for a seed phrase, private key, API secret, raw signature, or signed payload.
- Matterhorn stores or logs a secret value.
- A Hyperliquid or Polymarket route submits an order.
- A preview or handoff reports `canSubmit: true`.
- A Polymarket compliance-blocked preview includes executable price/size/share fields.
- A receipt mismatch is accepted as matching the original handoff.

## 8. Evidence To Report Back

Return a short report with:

- Commit SHA and PR numbers tested.
- Exact commands run and pass/fail output.
- Browser screenshots for the UI checks.
- Any P0/P1/P2 issues with reproduction steps.
- Confirmation that no live funds, no private keys, no API secrets, and no raw signatures were used.
