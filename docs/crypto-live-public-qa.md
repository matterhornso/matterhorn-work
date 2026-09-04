# Matterhorn Desks Live Public-Data QA

This QA pack builds a customer-safe evidence bundle for a demo that uses only public read data. It combines Bittensor live-read checks, Hyperliquid/Polymarket read-only smoke checks, and existing customer crypto smoke evidence when those inputs are available.

The pack is intentionally non-custodial:

- Do not use seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or real customer funds.
- Hyperliquid and Polymarket agents remain read/draft only; supported actions require a separate connected-wallet ticket.
- Bittensor actions remain unsigned previews and external-signer handoffs only.
- Missing live public inputs produce `SKIPPED_WITH_FIXTURE_FALLBACK`, not a failure.

## Quick Run

Fixture fallback mode is safe for CI, customer dry runs, and agents without live public inputs:

```bash
matterhorn-work crypto live-public-qa \
  --output-dir /tmp/matterhorn-live-public-qa \
  --fixture \
  --strict \
  --json
```

This writes:

- `/tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.json`
- `/tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.md`
- `/tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.sha256`

## Live Public Inputs

When a local Matterhorn Desks server is running, add only public inputs:

```bash
matterhorn-work crypto live-public-qa \
  --output-dir /tmp/matterhorn-live-public-qa \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --ss58-address "$MATTERHORN_WORK_BITTENSOR_SS58" \
  --validator-hotkey "$MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY" \
  --hyperliquid-asset BTC \
  --polymarket-market-id "$MATTERHORN_WORK_POLYMARKET_MARKET_ID" \
  --netuid 14 \
  --amount-tao 1 \
  --rate-tolerance 0.01 \
  --strict \
  --json
```

Input rules:

- `--ss58-address` must be a public Bittensor coldkey/SS58 address.
- `--validator-hotkey` must be a public validator hotkey.
- `--hyperliquid-asset` is a public perp symbol used for read-only watch evidence.
- `--polymarket-market-id` is optional and must be a public market id; without it the Polymarket watch stage is fixture-skipped.
- `--token` is only the local Matterhorn client bearer token and is not persisted into the evidence bundle.
- Do not point this at customer funds for the pilot demo.

Market watch evidence runs the safe public loop: create, check, digest, and alert action review. The alert action route is called only when a watch check returns a triggered or degraded alert; otherwise the bundle records a public `skipped` action with `canSubmit:false`, `liveSubmissionEnabled:false`, and `autoExecutes:false`.

## Attach Existing Smoke Evidence

If you have already run the consolidated crypto smoke, attach its JSON output:

```bash
pnpm smoke:customer-ready-crypto

matterhorn-work crypto live-public-qa \
  --output-dir /tmp/matterhorn-live-public-qa \
  --customer-ready-smoke /tmp/matterhorn-customer-ready-crypto-smoke.json \
  --market-evidence-verify /tmp/matterhorn-market-customer-evidence-verify.json \
  --bittensor-evidence-verify /tmp/matterhorn-bittensor-customer-evidence-verify.json \
  --customer-packet /tmp/matterhorn-crypto-customer-packet.json \
  --fixture \
  --strict \
  --json
```

If one of these JSON files is not attached, its stage is marked `SKIPPED_WITH_FIXTURE_FALLBACK` with the command to rerun.

## Interpreting Status

- `READY`: all configured live public checks passed.
- `SKIPPED_WITH_FIXTURE_FALLBACK`: no failures, but one or more live public stages were skipped because inputs were absent or fixture mode was requested.
- `NOT_READY`: one or more configured stages failed.

Strict mode fails only on actual failures. Skipped public-live stages do not fail strict mode.

## Safety Audit Checklist

Before sharing the bundle with a test customer:

1. Confirm the SHA file matches `matterhorn-live-public-qa.json`.
2. Confirm `safety.liveSubmissionEnabled` is `false`.
3. Confirm `safety.signsOrSubmits` is `false`.
4. Confirm market previews remain `canSubmit: false`.
5. Confirm the report contains no seed phrase, private key, API secret, raw signature, signed payload, wallet export, or real-funds instruction.
