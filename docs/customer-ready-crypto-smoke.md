# Customer-Ready Crypto Smoke

Run this before putting Matterhorn Work in front of a test customer. It combines the existing Bittensor, Hyperliquid, Polymarket, receipt, readiness, and safety checks into one operator loop.

The smoke pass is non-custodial:

- It never asks for seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports.
- It never submits Hyperliquid or Polymarket orders.
- It never signs or broadcasts transactions.
- Every Hyperliquid and Polymarket preview/handoff must stay `canSubmit: false`.

## Quick Start

Dry-run the exact checks:

```bash
node scripts/customer-ready-crypto-smoke.mjs --dry-run --json
```

Run the offline/default customer-readiness pass:

```bash
pnpm smoke:customer-ready-crypto
```

CI also runs this smoke pass through the `customer-crypto-gates` job in the Matterhorn Work Tests workflow, so crypto regressions are visible on pull requests instead of remaining local-only.

Some agent sandboxes block temporary `127.0.0.1` test servers. If the smoke pass fails with `listen EPERM: operation not permitted 127.0.0.1`, rerun it in a normal local shell or an approved unsandboxed runner. That specific error is an environment bind restriction, not evidence of a product regression.

Strict JSON output for agents:

```bash
node scripts/customer-ready-crypto-smoke.mjs --offline --strict --json
```

## Default Offline Checks

The default smoke pass runs these existing gates:

```bash
pnpm test:unified-crypto-chat
pnpm test:crypto-cli-fallback
pnpm test:agent-crypto-operator-loop
pnpm test:hermes-crypto-customer-qa
pnpm test:market-safety-contract
pnpm test:market-execution-safety-gate
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-capture
pnpm test:market-official-sdk-validation-doctor
pnpm test:market-official-sdk-normalize
pnpm test:market-official-sdk-operator-loop
pnpm test:market-official-sdk-validation-fixtures
pnpm test:market-customer-evidence-bundle
pnpm test:market-receipt-qa
pnpm test:market-receipt-evidence
pnpm test:hyperliquid-readiness-gate
pnpm test:polymarket-readiness-gate
pnpm test:hyperliquid-read-preview-qa
pnpm test:polymarket-read-preview-qa
pnpm test:hyperliquid-cli-fallback
pnpm test:polymarket-cli-fallback
pnpm test:market-live-readonly-smoke
pnpm test:bittensor-customer-readiness-gate
pnpm test:bittensor-receipt-check
pnpm test:bittensor-watch-autopilot
pnpm test:bittensor-watch-autopilot-scheduler
pnpm test:bittensor-signing-handoff-check
pnpm test:bittensor-customer-evidence-bundle
```

## Optional Local Server Smoke

When a local Matterhorn Work server is running, include read/preview/handoff-only live route checks:

```bash
node scripts/customer-ready-crypto-smoke.mjs \
  --offline --include-live-server \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --strict --json
```

This delegates to `scripts/market-live-readonly-smoke.mjs` and checks:

- Hyperliquid market reads, chat reads, order previews, and external-signer handoff.
- Polymarket market reads, compliance reads, chat reads, and external-signer handoff when a market is available.
- No submit route, no signing route, no funds movement, and no `canSubmit: true`.

## Optional Bittensor Live QA

For a full Bittensor demo, run the live QA harness separately with a public SS58 address and, when available, a validator hotkey:

```bash
node scripts/bittensor-live-qa.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --ss58-address "$MATTERHORN_WORK_BITTENSOR_SS58" \
  --validator-hotkey "$MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY" \
  --netuid 14 --amount-tao 1 --rate-tolerance 0.01 \
  --strict --json
```

Then feed the generated JSON into `scripts/bittensor-customer-readiness-gate.mjs` and `scripts/bittensor-customer-evidence-bundle.mjs` as described in `docs/bittensor-customer-readiness-gate.md`.

## Optional Market Evidence Bundle

For customer demos involving Hyperliquid or Polymarket previews, attach the
official-SDK validation evidence to the market evidence bundle. The bundle is
public/redacted only; it does not sign, submit, store secrets, or authorize live
execution.

```bash
node scripts/customer-ready-crypto-smoke.mjs --offline --strict --json > /tmp/matterhorn-crypto-smoke.json
node scripts/market-official-sdk-validation-evidence.mjs --sample --json > /tmp/matterhorn-market-sdk-evidence.json

# Optional when an operator has redacted official-client output:
# MARKET_OFFICIAL_SDK_VALIDATION_MODE=operator_owned_testnet \
# HYPERLIQUID_VALIDATION_NETWORK=hyperliquid-testnet \
# HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION=<hyperliquid-python-sdk-version> \
# POLYMARKET_VALIDATION_NETWORK=polygon-amoy \
# POLYMARKET_CHAIN_ID=80002 \
# POLYMARKET_EXCHANGE_ADDRESS=<public-amoy-exchange-address> \
# POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION=<clob-client-version> \
# node scripts/market-official-sdk-validation-doctor.mjs --strict --json
# matterhorn-work crypto sdk-loop \
#   --hyperliquid-official-public /tmp/operator-hyperliquid-official-client-public.json \
#   --polymarket-official-public /tmp/operator-polymarket-official-client-public.json \
#   --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
#   --output-dir /tmp/matterhorn-market-sdk-loop \
#   --json
# node scripts/market-official-sdk-normalize.mjs \
#   --venue hyperliquid \
#   --input /tmp/operator-hyperliquid-official-client-public.json \
#   --output /tmp/hyperliquid-official-normalized-action.json
# node scripts/market-official-sdk-normalize.mjs \
#   --venue polymarket \
#   --input /tmp/operator-polymarket-official-client-public.json \
#   --output /tmp/polymarket-official-normalized-typed-data.json
# node scripts/market-official-sdk-validation-capture.mjs \
#   --hyperliquid-normalized /tmp/hyperliquid-official-normalized-action.json \
#   --hyperliquid-package-version <version> \
#   --polymarket-normalized /tmp/polymarket-official-normalized-typed-data.json \
#   --polymarket-package-version <version> \
#   --output /tmp/matterhorn-market-sdk-evidence.json

# Fixture-backed strict validation path:
# pnpm test:market-official-sdk-validation-fixtures

node scripts/market-customer-evidence-bundle.mjs \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --official-sdk-validation /tmp/matterhorn-market-sdk-evidence.json \
  --output /tmp/matterhorn-market-customer-evidence.md \
  --json-output /tmp/matterhorn-market-customer-evidence.json \
  --strict
```

Use `--require-official-sdk-validated` only when every venue has real
operator-owned official-client/testnet evidence. Pending validation evidence is
acceptable for read/preview-only customer QA, but it is not authorization for
live Hyperliquid or Polymarket execution.

## Pass Criteria

Report ready for a test customer only when:

- The smoke runner exits 0.
- Market execution safety passes.
- Hyperliquid and Polymarket remain read/preview/external-signer only.
- Bittensor readiness, receipt, watch, scheduler, signing-handoff, and evidence-bundle gates pass.
- Market customer evidence bundle accepts the redacted official-SDK validation evidence.
- No response or evidence file contains secret-shaped fields.
- Any local-server smoke failures are explained as provider unavailable, not as signing/submission behavior.

## Red Lines

Stop immediately if any of these happen:

- Matterhorn asks for or stores a seed phrase, private key, API secret, raw signature, signed payload, or wallet export.
- A Hyperliquid or Polymarket route submits an order.
- A preview or handoff returns `canSubmit: true`.
- A Polymarket compliance-blocked response contains executable price, size, or share values.
- A public receipt mismatch is accepted.
