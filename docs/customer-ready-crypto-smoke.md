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

Some agent sandboxes block temporary `127.0.0.1` test servers. If the smoke pass fails with `listen EPERM: operation not permitted 127.0.0.1`, rerun it in a normal local shell or an approved unsandboxed runner. That specific error is an environment bind restriction, not evidence of a product regression.

Strict JSON output for agents:

```bash
node scripts/customer-ready-crypto-smoke.mjs --offline --strict --json
```

## Default Offline Checks

The default smoke pass runs these existing gates:

```bash
pnpm test:unified-crypto-chat
pnpm test:agent-crypto-operator-loop
pnpm test:hermes-crypto-customer-qa
pnpm test:market-safety-contract
pnpm test:market-execution-safety-gate
pnpm test:market-official-sdk-validation-track
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

## Pass Criteria

Report ready for a test customer only when:

- The smoke runner exits 0.
- Market execution safety passes.
- Hyperliquid and Polymarket remain read/preview/external-signer only.
- Bittensor readiness, receipt, watch, scheduler, signing-handoff, and evidence-bundle gates pass.
- No response or evidence file contains secret-shaped fields.
- Any local-server smoke failures are explained as provider unavailable, not as signing/submission behavior.

## Red Lines

Stop immediately if any of these happen:

- Matterhorn asks for or stores a seed phrase, private key, API secret, raw signature, signed payload, or wallet export.
- A Hyperliquid or Polymarket route submits an order.
- A preview or handoff returns `canSubmit: true`.
- A Polymarket compliance-blocked response contains executable price, size, or share values.
- A public receipt mismatch is accepted.
