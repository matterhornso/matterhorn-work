# Bittensor Beta Go-Live Runbook

This runbook turns the Bittensor beta release gate into a test-customer launch
procedure. The goal is to ship a Bittensor-first beta while Hyperliquid and
Polymarket continue separately as preview/R&D-only market surfaces.

## Scope

Customer-facing beta promise:

- chat-first Bittensor explanation, wallet reads, subnet discovery, validator
  comparison, staking preview, external signer handoff, watches, alerts, and
  public evidence;
- public SS58 addresses only for wallet reads;
- unsigned previews only until the user signs externally in their own
  Bittensor-compatible signer.

Not included in the Bittensor beta:

- seed import, private key custody, wallet export, or keyfile handling;
- automatic Bittensor signing;
- live Hyperliquid or Polymarket submission;
- market trading as a customer-facing beta promise.

## Required Flags

Set these before building or demoing the beta:

```bash
BITTENSOR_BETA_ENABLED=true
VITE_MATTERHORN_BITTENSOR_BETA=1
MARKETS_READ_PREVIEW_ENABLED=true
MARKETS_SIGN_REQUEST_ENABLED=false
MARKETS_LIVE_SUBMIT_ENABLED=false
EXPERIMENTAL_MARKET_EXECUTION=false
```

`MARKETS_READ_PREVIEW_ENABLED=true` is allowed only for internal read/preview
checks. Hyperliquid and Polymarket remain preview/R&D-only in this beta.

## Branch Cut

1. Start from latest green `dev`.
2. Create the beta branch:

```bash
git fetch origin dev
git switch -c beta/bittensor origin/dev
```

3. Confirm no local changes:

```bash
git status --short
```

4. Record the branch SHA in the customer packet.

## Automated Gates

Run these before sharing a build:

```bash
pnpm smoke:bittensor-beta
pnpm smoke:customer-ready-crypto
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server build
pnpm --dir packages/types build
```

If a localhost canary fails in an agent sandbox with `listen EPERM 127.0.0.1`,
rerun the same command in a normal local shell. That is an environment binding
restriction, not automatically a product failure.

## Optional Live Public-Data QA

Use only public Bittensor addresses and validator hotkeys:

```bash
matterhorn-work crypto live-public-qa \
  --output-dir /tmp/matterhorn-live-public-qa \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --ss58-address "$MATTERHORN_WORK_BITTENSOR_SS58" \
  --validator-hotkey "$MATTERHORN_WORK_BITTENSOR_VALIDATOR_HOTKEY" \
  --netuid 14 \
  --amount-tao 1 \
  --rate-tolerance 0.01 \
  --strict \
  --json
```

If public inputs are unavailable, use fixture fallback and mark the gap:

```bash
matterhorn-work crypto live-public-qa \
  --output-dir /tmp/matterhorn-live-public-qa \
  --fixture \
  --strict \
  --json
```

## Browser QA Checklist

Create `/tmp/matterhorn-bittensor-browser-qa.md` with evidence from desktop,
tablet, and mobile checks. It must mention:

- Bittensor desk;
- `Show my TAO balance` with public SS58 address intake;
- subnet discovery;
- validator comparison;
- staking preview;
- external signer handoff;
- no-wallet state;
- degraded-provider state;
- launched session remains visible after task start;
- mobile viewport;
- tablet viewport;
- desktop viewport.

Recommended local run:

```bash
VITE_MATTERHORN_BITTENSOR_BETA=1 pnpm dev:headless-web
```

Then use Playwright or the in-app browser to verify:

- the Bittensor desk shows balance, subnet, validator, and staking-preview tasks;
- public-address intake rejects invalid SS58 values and never asks for secrets;
- market copy says preview/R&D-only;
- no buttons imply custody, signing, or live market submission;
- prompt handoff inserts context into chat without auto-sending;
- cards do not overflow on desktop, tablet, or mobile.

## Release Candidate Packet

Generate the packet after gates and browser QA:

```bash
node scripts/bittensor-beta-release-gate.mjs \
  --offline \
  --strict \
  --json-output /tmp/matterhorn-bittensor-beta.json

matterhorn-work crypto customer-smoke \
  --offline \
  --strict \
  --json-output /tmp/matterhorn-crypto-smoke.json

matterhorn-work crypto bittensor-evidence-verify \
  --bundle-json /tmp/matterhorn-bittensor-customer-evidence.json \
  --bundle-md /tmp/matterhorn-bittensor-customer-evidence.md \
  --output /tmp/matterhorn-bittensor-evidence-verify.json \
  --strict \
  --json

node scripts/bittensor-beta-customer-packet.mjs \
  --output-dir /tmp/matterhorn-bittensor-beta-rc \
  --beta-gate /tmp/matterhorn-bittensor-beta.json \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --bittensor-evidence-verify /tmp/matterhorn-bittensor-evidence-verify.json \
  --live-public-qa /tmp/matterhorn-live-public-qa/matterhorn-live-public-qa.json \
  --browser-qa /tmp/matterhorn-bittensor-browser-qa.md \
  --strict \
  --json
```

For a template-only packet shape check:

```bash
pnpm beta:bittensor:packet
```

The real packet writes:

- `/tmp/matterhorn-bittensor-beta-rc/matterhorn-bittensor-beta-rc.json`
- `/tmp/matterhorn-bittensor-beta-rc/matterhorn-bittensor-beta-rc.md`
- `/tmp/matterhorn-bittensor-beta-rc/matterhorn-bittensor-beta-rc.sha256`

## Customer Onboarding

For the first beta cohort, use two or three test customers.

Ask only for:

- public SS58 coldkey address;
- public validator hotkey if they want staking preview;
- target subnet/netuid if they have one.

Never ask for seed phrases, private keys, API secrets, raw signatures, signed
payloads, wallet exports, keyfiles, SURI values, or real customer funds.

## Rollback Plan

If any P0/P1/P2 issue appears:

1. Stop customer onboarding.
2. Turn off `BITTENSOR_BETA_ENABLED`.
3. Rebuild without `VITE_MATTERHORN_BITTENSOR_BETA=1`.
4. Keep `MARKETS_LIVE_SUBMIT_ENABLED=false` and
   `EXPERIMENTAL_MARKET_EXECUTION=false`.
5. Move customers back to the previous stable Matterhorn Desks build.
6. Preserve the packet JSON, Markdown, SHA file, browser screenshots, and issue
   ledger.
7. Fix on `dev`, rerun `pnpm smoke:bittensor-beta`, regenerate the packet, and
   only then resume onboarding.

## Go/No-Go Criteria

Go only if:

- `pnpm smoke:bittensor-beta` passes;
- `pnpm smoke:customer-ready-crypto` passes;
- the release candidate packet is `READY_FOR_TEST_CUSTOMER_QA`;
- browser QA covers desktop, tablet, and mobile;
- no P0/P1/P2 issues remain;
- every market execution flag remains off.

No-go if:

- any route, CLI, MCP tool, fixture, or doc accepts secret material;
- any market path enables live submission;
- Bittensor external signer handoff is unclear;
- receipt/evidence import cannot prove public hash binding;
- UI implies custody or automatic signing.
