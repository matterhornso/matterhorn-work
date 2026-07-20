# Bittensor Beta Launch

This is the release contract for launching a Matterhorn Desks beta where
Bittensor is the customer-facing hero product. Hyperliquid and Polymarket can
continue to develop on separate market branches, but they are not part of the
Bittensor beta launch promise.

## Product Promise

The Bittensor beta lets a test customer use Bittensor through chat with a low
cognitive load:

- explain TAO, coldkeys, hotkeys, subnets, validators, Dynamic TAO, and staking
  in beginner language;
- inspect a public SS58 wallet without custody;
- discover useful subnets and compare validators;
- prepare safe unsigned staking or transfer previews;
- hand off actions to an external signer;
- create watches and inspect receipt/evidence bundles.

The beta does not promise market trading, automated execution, seed import,
private key custody, or live order submission.

## Required Flags

Use these values for a Bittensor beta build or customer demo environment:

```bash
BITTENSOR_BETA_ENABLED=true
VITE_MATTERHORN_BITTENSOR_BETA=1
MARKETS_READ_PREVIEW_ENABLED=true
MARKETS_SIGN_REQUEST_ENABLED=false
MARKETS_LIVE_SUBMIT_ENABLED=false
EXPERIMENTAL_MARKET_EXECUTION=false
```

`MARKETS_READ_PREVIEW_ENABLED=true` is allowed so internal operators can still
inspect read/preview surfaces, but Hyperliquid and Polymarket remain preview/R&D
only and should not be positioned as beta customer functionality.

## Release Gate

Run the Bittensor beta gate before showing this build to a customer:

```bash
pnpm smoke:bittensor-beta
```

For an agent-readable dry run:

```bash
node scripts/bittensor-beta-release-gate.mjs --dry-run --json
```

For a durable evidence file:

```bash
node scripts/bittensor-beta-release-gate.mjs \
  --offline --strict \
  --json-output /tmp/matterhorn-bittensor-beta.json
```

After the gate, browser QA, and optional live public-data QA are complete,
generate the release-candidate packet:

```bash
node scripts/bittensor-beta-customer-packet.mjs \
  --output-dir /tmp/matterhorn-bittensor-beta-rc \
  --beta-gate /tmp/matterhorn-bittensor-beta.json \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --bittensor-evidence-verify /tmp/matterhorn-bittensor-evidence-verify.json \
  --live-public-qa /tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.json \
  --browser-qa /tmp/matterhorn-bittensor-browser-qa.md \
  --strict --json
```

For packet shape validation without real customer evidence, run:

```bash
pnpm beta:bittensor:packet
```

The gate checks Bittensor customer readiness, receipts, watches, scheduler,
external signing handoff, evidence bundle verification, read-only adapter
canaries, customer readiness UI, prompt-safety tests, and the market
non-execution safety gates.

## Customer Demo Flow

1. Open Matterhorn Desks with `VITE_MATTERHORN_BITTENSOR_BETA=1`.
2. Open the Bittensor panel and use the Demo tab.
3. Refresh readiness.
4. Run `pnpm smoke:bittensor-beta`.
5. Optional: run the live public-data QA pack with a public SS58 coldkey and
   validator hotkey only.
6. Ask safe chat prompts:
   - `show my TAO` with a public SS58 address;
   - `where am I staked?`;
   - `which subnet is useful for image generation?`;
   - `compare validators on subnet 14`;
   - `prepare staking 1 TAO` with explicit netuid and validator hotkey.
7. Confirm every action preview says external signer required before anything
   can be broadcast.

## Safety Boundary

No seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live market submission are accepted in this beta.

Bittensor actions remain non-custodial. Matterhorn can prepare safe previews
and show external-signer instructions; the user's Bittensor-compatible signer is
the only place where an action can be signed.

Hyperliquid and Polymarket are not part of the Bittensor beta launch promise.
They may remain visible to internal operators as read/preview or preview/R&D
surfaces, but there must be no customer-facing claim that Matterhorn can execute
market trades in this beta.

## Customer-Ready Criteria

The beta is ready for a test customer only when:

- `pnpm smoke:bittensor-beta` passes on a clean checkout;
- `pnpm smoke:customer-ready-crypto` still passes;
- Bittensor live public QA is either passed with public inputs or clearly marked
  as fixture fallback;
- browser QA confirms the Demo tab, chat handoffs, wallet/no-wallet states,
  degraded-provider states, and mobile/tablet/desktop layouts;
- security negative tests reject prompt injection and secret-shaped inputs;
- there are No P0/P1/P2 issues in the customer-readiness ledger.

P3 issues can ship only if they are explicitly accepted as non-blocking and
listed in the handoff.
