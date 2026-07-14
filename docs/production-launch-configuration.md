# Production Launch Configuration

This guide is the authoritative operator path from a local Matterhorn Work build
to a launch candidate. Use the root [`.env.example`](../.env.example) as the
variable-name contract. It contains placeholders only; real credentials belong
in the deployment secret manager and must never be committed or attached to QA
evidence.

## Who Owns Setup

Matterhorn uses action-specific labels instead of treating every incomplete
capability as the same problem:

| UI label | Owner | Meaning |
|---|---|---|
| `Connect wallet` | User | Install or unlock MetaMask, Coinbase Wallet, Phantom, or another supported wallet and approve the connection in that wallet. |
| `Connect provider` | Workspace owner | Choose an available model or complete a supported provider connection. Never paste a provider key into chat. |
| `Platform setup` | Matterhorn operator | Configure and verify backend services such as Stripe test billing, OpenAI image generation, Walrus, or Sui packages. End users cannot fix this state. |
| `Configure cloud` | Matterhorn operator | Decide whether Matterhorn Cloud is included, then configure and acceptance-test its URL, sign-in callback, organization, sync, and shared workers. |

Healthy local features remain usable while an optional publishing or Cloud
capability is blocked. A blocked platform capability must not be shown as a
user failure.

## Safe Launch Defaults

- Bind the backend and attached engine to loopback behind the deployment proxy.
- Allow only the exact HTTPS app origin through CORS. Never use `*` in a launch environment.
- Keep approvals in `manual` mode.
- Keep Stripe in `phase1_stripe_test`. Live charging remains disabled.
- Keep Sui publishing on `sui-testnet` until reviewed mainnet packages and a separate money-path review exist.
- Keep Matterhorn Cloud disabled unless its full acceptance flow has passed.
- Keep wallet signing external. Matterhorn never requests seed phrases, private keys, mnemonics, raw signatures, or wallet exports.

## Configuration Order

1. Copy the root `.env.example` into the deployment secret/config system. Replace placeholders there, not in the repository.
2. Configure the backend workspace, client token, host token, exact CORS origin, request limits, and attached Matterhorn Work engine.
3. Build the web app with `VITE_MATTERHORN_WORK_URL` pointing to the deployed HTTPS backend.
4. Configure Stripe test credentials, webhook secret, Plus/Max test prices, and a test customer.
5. Configure OpenAI image generation, public HTTPS Walrus endpoints, and reviewed Sui testnet package IDs.
6. Leave Cloud disabled or complete the separate Cloud acceptance flow before setting `VITE_MATTERHORN_CLOUD_ENABLED=1`.
7. Restart the backend and rebuild the web app after changing server or `VITE_` values.

## Verification

The template contract validates variable names and safe defaults without reading
or printing deployment secrets:

```bash
pnpm test:production-launch-environment
```

Against the running release stack, use environment variables from the secret
manager and run the production-required probe:

```bash
node scripts/product-readiness-smoke.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --require-production \
  --include-generated-media-flow \
  --strict --json
```

`--strict` still completes every safe read-only stage so one failed service
cannot hide another launch blocker. The command exits nonzero when any stage is
blocked and emits a `launchBlockers` list naming the responsible owner and next
action. When generated-media flow testing is included, entitlement failures are
reported separately from platform service configuration.

Then run the complete release pack. It cannot report `ready: true` unless the
platform safety gate, production backend probe, deployed browser smoke, real
Bittensor evidence, and packaged desktop checks all pass:

```bash
pnpm --silent beta:monday-rc -- \
  --output-dir /tmp/matterhorn-launch-rc \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --app-url "$MATTERHORN_APP_URL" \
  --bittensor-beta-gate /tmp/matterhorn-bittensor-beta.json \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --bittensor-evidence-verify /tmp/matterhorn-bittensor-evidence-verify.json \
  --bittensor-browser-qa /tmp/matterhorn-bittensor-browser-qa.md \
  --strict --json
```

Do not mark the launch ready from the fixture/offline contract report. The
running production-required probe and the RC pack are the decision surfaces.
