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
