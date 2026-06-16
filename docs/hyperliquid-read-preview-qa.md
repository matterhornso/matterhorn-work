# Hyperliquid Read/Preview QA

This harness verifies the first Matterhorn Work Hyperliquid milestone without trading.

It checks:

- market list reads;
- orderbook reads;
- optional public account reads;
- non-submittable order previews;
- chat execution for a natural-language preview prompt;
- rejection of credential-shaped input.

The harness must never require or send API wallet secrets, private keys, signatures, or signed actions.

## Self-Test

Run this in CI or locally without a Matterhorn server:

```bash
node scripts/hyperliquid-read-preview-qa.mjs --self-test --strict --json
```

## Live Local Server

Run against a local Matterhorn Work server:

```bash
node scripts/hyperliquid-read-preview-qa.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --asset BTC \
  --side buy \
  --size 0.1 \
  --price 65000 \
  --json \
  --strict
```

Add `--address <public-0x-master-or-sub-account>` to include account reads.

Use `--require-account` only when a test account address is supplied or when running the built-in self-test.

## Expected Pass

- `markets`: returns at least one market.
- `orderbook`: returns the requested asset.
- `account`: passes when a public address is supplied, otherwise skips unless `--require-account` is set.
- `order.preview`: returns `venue: "hyperliquid"` and `canSubmit: false`.
- `chat.execute`: returns `venue: "hyperliquid"` and any preview card still has `canSubmit: false`.
- `secret.rejection`: returns a non-2xx response for `apiSecret`.

## Safety Invariants

- No API wallet secret fields.
- No private key fields.
- No signatures or signed payload fields.
- No exchange submission.
- No `canSubmit: true`.
