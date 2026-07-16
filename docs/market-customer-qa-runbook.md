# Market Customer QA Runbook

This runbook is for Hermes, Claude Code, Codex, or a human tester validating the customer-facing crypto-market surfaces before a test-customer demo.

Scope:

- Bittensor remains the mature flow: wallet reads, validator/subnet intelligence, watch/autopilot, unsigned previews, external-signer handoff, and receipt evidence.
- Hyperliquid provides read/preview/external-signer flows plus a separate web-only, wallet-approved execution ticket. Polymarket remains read/preview/external-signer only.
- Matterhorn Work must never ask for, store, log, or transmit private keys, seed phrases, API secrets, raw signatures, or signed payloads.
- No chat, MCP, CLI, watch, workflow, or agent prompt may submit an order. Hyperliquid submission is allowed only through the guarded web ticket after the connected wallet signs an exact, expiring server intent; Polymarket submission is unavailable.

## 1. Static Safety Gates

For the fastest customer-readiness pass, start with the consolidated smoke runner:

```bash
pnpm smoke:customer-ready-crypto
```

For a single black-box handoff that Hermes can follow from checkout through final report, use [Hermes Crypto Customer QA Pass](./handoffs/hermes-crypto-customer-qa.md).

Use `docs/customer-ready-crypto-smoke.md` for dry-run, JSON, and local-server options. The rest of this runbook remains the expanded manual checklist when a tester needs per-surface evidence.

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
- Legacy preview, handoff, sign-request, and artifact-validation contracts keep `liveSubmissionEnabled: false`.
- The guarded `/api/hyperliquid/orders/execution-intent` and `/api/hyperliquid/orders/submit` routes exist but return disabled unless `MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED` is explicitly enabled. No `/api/polymarket/orders/submit` route exists.
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

## 5. Testnet Sign-Request And Redacted Artifact Validation Smoke

This step demonstrates the future external-signer chain without giving
Matterhorn a signature or a submit path. Use testnet/operator-owned examples
only. Do not paste raw signatures, signed payloads, API secrets, private keys,
or real customer funds.

```bash
matterhorn-work hyperliquid sign-request \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC --side buy --size 0.001 --price 65000 \
  --execution-mode testnet_external_signer \
  --json > /tmp/matterhorn-hyperliquid-sign-request.json

matterhorn-work hyperliquid validate-artifact \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --sign-request-file /tmp/matterhorn-hyperliquid-sign-request.json \
  --artifact-file ./redacted-hyperliquid-artifact.json \
  --json

matterhorn-work polymarket sign-request \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --market-id "<testnet-market-id>" --side yes --amount-usdc 1 \
  --execution-mode testnet_external_signer \
  --json > /tmp/matterhorn-polymarket-sign-request.json

matterhorn-work polymarket validate-artifact \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --sign-request-file /tmp/matterhorn-polymarket-sign-request.json \
  --artifact-file ./redacted-polymarket-artifact.json \
  --json
```

Expected result:

- Sign requests use `matterhorn.market.external-sign-request.v1`,
  `executionMode: testnet_external_signer`, `canSubmit: false`,
  `liveSubmissionEnabled: false`, and `submitSignedAllowedByContract: false`.
- Artifact validation accepts only
  `matterhorn.market.redacted-signed-artifact-envelope.v1` public/redacted
  metadata and returns `matterhorn.market.artifact-validation.v1`.
- Accepted artifact validation may emit a public audit receipt candidate, but it
  is not exchange submission evidence.
- hash mismatches between the artifact and sign request fail.
- Any raw `signature`, `rawSignature`, `signedPayload`, `privateKey`, or
  `apiSecret` field fails immediately.

## 6. Receipt Evidence Smoke

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

For the final customer evidence packet, also run the offline public receipt
checker and attach its output to the market evidence bundle:

```bash
matterhorn-work crypto receipt-check \
  --venue hyperliquid \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --output /tmp/matterhorn-market-receipt-check.json

matterhorn-work crypto evidence-bundle \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --official-sdk-validation /tmp/matterhorn-market-sdk-evidence.json \
  --receipt-check /tmp/matterhorn-market-receipt-check.json \
  --require-receipt-check \
  --output /tmp/matterhorn-market-customer-evidence.md \
  --json-output /tmp/matterhorn-market-customer-evidence.json \
  --strict
```

If no external-signer receipt is part of the demo, omit `--receipt-check` and
`--require-receipt-check`.

## 7. UI/UX Checks

Use the desktop app or web UI and capture screenshots for:

- Bittensor chat: wallet/subnet/validator/readiness cards still render without overflow.
- Customer readiness panel: `Crypto Gate`, `Venue Checks`, blockers, next actions, `Refresh Crypto Gate`, and `Ask Crypto Chat` are visible and do not imply live submission.
- Hyperliquid chat: a read-only market/account request and a preview-only order
  response; then separately inspect the web order ticket without signing or
  submitting during automated QA.
- Polymarket chat: search/events/market detail and geoblock/compliance response.
- Handoff cards: show external-signer language, hashes, expiry, and `canSubmit: false`.
- Error states: missing parameters ask one clear clarification question; secret-shaped input is rejected without echoing the secret value.

## 8. Security Red Lines

Fail the QA run if any of these happen:

- Matterhorn asks for a seed phrase, private key, API secret, raw signature, or signed payload.
- Matterhorn stores or logs a secret value.
- A Polymarket route submits an order, or any chat/MCP/CLI/watch/agent surface
  can call the Hyperliquid submit route.
- The Hyperliquid web ticket accepts modified, expired, replayed, oversized, or
  mismatched-signer intents, bypasses the deployment kill switch, skips the
  exact mainnet confirmation phrase, or persists a wallet signature.
- A preview or handoff reports `canSubmit: true`.
- A sign request or artifact validation reports `canSubmit: true` or
  `submitSignedAllowedByContract: true`.
- A redacted artifact validation accepts raw signatures, signed payloads, API
  secrets, private keys, or a hash mismatch.
- A Polymarket compliance-blocked preview includes executable price/size/share fields.
- A receipt mismatch is accepted as matching the original handoff.

## 9. Evidence To Report Back

Return a short report with:

- Commit SHA and PR numbers tested.
- Exact commands run and pass/fail output.
- Browser screenshots for the UI checks.
- Any P0/P1/P2 issues with reproduction steps.
- Confirmation that no live funds, no private keys, no API secrets, and no raw signatures were used.
