# Market Receipt QA

Matterhorn Work supports Hyperliquid and Polymarket execution only through a non-custodial loop:

1. Build a read/preview-only order plan.
2. Create an external-signer handoff.
3. The user signs and submits outside Matterhorn.
4. Matterhorn imports or verifies a public receipt only.

`pnpm test:market-receipt-qa` is an offline regression harness for step 4. It does not call Hyperliquid, Polymarket, wallets, CLOB/exchange endpoints, or any signing API. It validates that public receipt evidence can be matched back to the handoff and that raw signing material is rejected.

## What It Checks

- Hyperliquid public order-id receipt matches the original handoff.
- Hyperliquid side mismatch is rejected.
- Hyperliquid raw `signature` fields are rejected.
- Polymarket public tx receipt matches the original handoff.
- Polymarket outcome mismatch is rejected.
- Polymarket nested `signedPayload` fields are rejected.
- A receipt with no order id or tx hash is accepted only as review-needed public evidence, with a warning.

## Public receipt examples

A receipt carries **public status only** — order id / tx hash / status and the
public fields that identify which handoff it answers. It must **never** contain a
raw signature, a signed payload, a private key, an API secret, a seed phrase, or
a wallet export.

Hyperliquid public receipt (`receipt.json`):

```json
{
  "previewSha256": "<from the handoff>",
  "handoffSha256": "<from the handoff>",
  "orderId": "example-order-123",
  "status": "filled",
  "asset": "BTC",
  "side": "buy"
}
```

Polymarket public receipt (`receipt.json`):

```json
{
  "previewSha256": "<from the handoff>",
  "handoffSha256": "<from the handoff>",
  "txHash": "0xexamplepublictxhash",
  "status": "received",
  "outcome": "Yes",
  "side": "yes"
}
```

## Verify a receipt from files (not giant inline strings)

Save the handoff and the public receipt to files and pass paths, rather than
pasting large JSON on the command line:

```bash
matterhorn-work crypto receipt-check \
  --venue hyperliquid \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --output /tmp/matterhorn-market-receipt-check.json \
  --json

matterhorn-work hyperliquid receipt \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --json

matterhorn-work polymarket receipt \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --json
```

Individual flags (`--order-id`, `--tx-hash`, `--status`, `--asset`, `--outcome`,
`--side`, `--preview-sha`, `--handoff-sha`) still work and override matching
fields from `--receipt-file` / `--receipt-json`.

Use `matterhorn-work crypto receipt-check` for offline/customer evidence
validation when you already have handoff and receipt JSON files. Use the
venue-specific `hyperliquid receipt` / `polymarket receipt` commands when you
want to verify through the running Matterhorn server route.

To include receipt evidence in the customer bundle, pass the offline checker
output into the evidence bundle:

```bash
matterhorn-work crypto evidence-bundle \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --official-sdk-validation /tmp/matterhorn-market-sdk-evidence.json \
  --receipt-check /tmp/matterhorn-market-receipt-check.json \
  --require-receipt-check \
  --output /tmp/matterhorn-market-customer-evidence.md \
  --json-output /tmp/matterhorn-market-customer-evidence.json \
  --strict
```

`--require-receipt-check` should only be used when the demo claim includes an
external-signer receipt. Without it, receipt evidence stays optional.

## Mismatch and missing-evidence behavior

- A receipt whose `previewSha256` / `handoffSha256` / asset / side / outcome does
  not match the original handoff is **rejected** (`ok: false`, `matchesHandoff:
  false`). Example: importing a receipt with `"side": "sell"` against a `buy`
  handoff fails with a side mismatch.
- A receipt with **no order id and no tx hash** is accepted only as review-needed
  public evidence and carries a **warning** that the status cannot be
  independently located.
- Any `signature`, `signedPayload`, `privateKey`, `apiSecret`, `seed`, or
  `mnemonic` field fails immediately, before any matching is attempted.

## Command

```bash
pnpm test:market-receipt-qa
```

Run it with the cross-venue gate when touching Hyperliquid or Polymarket execution-adjacent code:

```bash
pnpm test:market-execution-safety-gate
pnpm test:market-receipt-qa
```

## Safety Rules

- Do not add receipt inputs for private keys, API secrets, raw signatures, signed payloads, seed phrases, or wallet exports.
- Keep `canSubmit: false` and `liveSubmissionEnabled: false`.
- Keep handoff/receipt tools separate from live submission code.
- If a venue-specific receipt has a public field that looks similar to signing metadata, document it and add a narrow exception only after confirming it is not a secret or a signed payload.
