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
- Public Beta web traffic must use the authenticated same-origin deployment
  proxy. Never put a Matterhorn Work URL, client bearer token, host token, or
  raw engine URL in a public `VITE_` variable.
- Keep public OAuth connectors in `Coming soon` state unless every visible
  connector has passed connect, reload, tool-call, disconnect, and revoked
  account acceptance. Allowlist accepted connector server names with
  `VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS`; an empty value fails closed.
- Keep wallet signing external. Matterhorn never requests seed phrases, private keys, mnemonics, raw signatures, or wallet exports.

## Configuration Order

1. Copy the root `.env.example` into the deployment secret/config system. Replace placeholders there, not in the repository.
2. Configure the backend workspace, client token, host token, exact CORS origin, request limits, and attached Matterhorn Work engine. Set `MATTERHORN_BUILD_COMMIT` to the exact 40-character release SHA.
3. For a private or local web bridge, configure `VITE_MATTERHORN_WORK_URL` only in its protected deployment configuration. It is never a public browser credential path.
4. For Public Beta web, set `VITE_MATTERHORN_DEPLOYMENT=web`, `VITE_MATTERHORN_PUBLIC_BETA=1`, `VITE_MATTERHORN_REQUIRE_SIGNIN=1`, and the reviewed Matterhorn Cloud URLs. Leave every browser-side Matterhorn Work URL and token variable unset so requests use the same-origin proxy.
5. Configure Stripe test credentials, webhook secret, Plus/Max test prices, and a test customer.
6. Configure OpenAI image generation, public HTTPS Walrus endpoints, and reviewed Sui testnet package IDs.
7. Leave Cloud disabled for desktop/local builds, or complete the separate Cloud acceptance flow before setting `VITE_MATTERHORN_CLOUD_ENABLED=1` for public web.
8. Restart the backend and rebuild the web app after changing server or `VITE_` values.

## Verification

The template contract validates variable names and safe defaults without reading
or printing deployment secrets:

```bash
pnpm test:production-launch-environment
```

For a public web candidate, verify the build configuration before deploying it.
This check intentionally fails if a Vite variable would expose a direct
backend, raw engine URL, client token, or host token to browser users:

```bash
pnpm test:public-beta-web-readiness
pnpm gate:public-beta-web --json \
  --json-output qa-reports/public-beta/public-web-config.json
```

The gate proves configuration only. The reverse proxy must still authenticate
the deployed Cloud session, bind that session to the correct workspace, proxy
both the root Matterhorn API and `/opencode`, and keep its upstream credentials
server-side. Prove that behavior with the deployed two-user acceptance gate.

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

Before any public announcement, challenge the deployed app and API from outside
the deployment network. This verifies HTTPS, browser security headers, exact
origin CORS, and rejection of an untrusted origin without reading credentials:

```bash
pnpm smoke:product-hunt-deployment -- \
  --app-url "$MATTERHORN_APP_URL" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --expected-commit "$MATTERHORN_BUILD_COMMIT" \
  --json-output qa-reports/product-hunt/deployment-probe.json
```

The public reverse proxy must add `Strict-Transport-Security` to both HTTPS
surfaces. The backend adds framing, MIME-sniffing, referrer, and browser
permissions defenses itself. A loopback run is useful for contract testing but
cannot produce a release-ready report.

Prove recovery with a separate, disposable restore workspace. The drill exports
only redacted portable state, waits for the matching manual approval, restores
the target, and compares a fresh export with the source backup:

```bash
pnpm drill:workspace-backup-restore -- \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --source-workspace "$MATTERHORN_WORKSPACE_ID" \
  --target-workspace "$MATTERHORN_RESTORE_WORKSPACE_ID" \
  --confirm-target "$MATTERHORN_RESTORE_WORKSPACE_ID" \
  --apply --json-output qa-reports/product-hunt/backup-restore.json
```

The Product Hunt operations gate also requires fresh external monitoring and a
real rollback rehearsal. Run the reviewed no-shell rollback hook against the
immutable current and last-known-good commits:

```bash
pnpm drill:product-hunt-rollback -- \
  --app-url "$MATTERHORN_APP_URL" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --from-commit "$MATTERHORN_BUILD_COMMIT" \
  --to-commit "$LAST_KNOWN_GOOD_COMMIT" \
  --owner "$ROLLBACK_OWNER" \
  --rollback-hook "$REVIEWED_ROLLBACK_HOOK" \
  --strict --json-output qa-reports/product-hunt/rollback.json
```

Fill
[`product-hunt-operations-evidence.example.json`](product-hunt-operations-evidence.example.json)
with report paths and non-secret observations, then run:

```bash
pnpm gate:product-hunt-operations -- \
  --evidence qa-reports/product-hunt/operations-evidence.json \
  --json-output qa-reports/product-hunt/operations-readiness.json
```

`--strict` still completes every safe read-only stage so one failed service
cannot hide another launch blocker. The command exits nonzero when any stage is
blocked and emits a `launchBlockers` list naming the responsible owner and next
action. When generated-media flow testing is included, entitlement failures are
reported separately from platform service configuration.

Then run the stable release gates. A public release is blocked unless the
platform safety gate, production backend probe, release review, deployed
browser smoke, real wallet/device acceptance, and packaged desktop checks all
pass:

```bash
pnpm test:matterhorn-platform-safety

node scripts/product-readiness-smoke.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --workspace-id "$MATTERHORN_WORKSPACE_ID" \
  --require-production --include-generated-media-flow --strict --json

SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
  pnpm --filter matterhorn-work-orchestrator build:sidecars
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
  node scripts/release/review.mjs --strict --json

pnpm desktop:release-doctor -- \
  --artifact-dir "$MATTERHORN_RELEASE_ARTIFACT_DIR" --strict --json
pnpm smoke:desktop-packaged-clean-profile -- \
  --artifact-dir "$MATTERHORN_RELEASE_ARTIFACT_DIR"
```

For public macOS assets, the release workflow runs a second, stricter verifier
after packaging and before upload. It requires Developer ID identity, Gatekeeper
acceptance, valid app and DMG notarization tickets, archive integrity, matching
updater metadata, and SHA-256 evidence:

```bash
pnpm desktop:public-release-verify -- \
  --dist-dir apps/desktop/dist-electron \
  --expected-version "$(node -p \"require('./apps/app/package.json').version\")" \
  --source-commit "$MATTERHORN_BUILD_COMMIT" \
  --json-output qa-reports/product-hunt/desktop-public-release.json
```

Do not mark the launch ready from a fixture/offline contract report or an
unsigned local artifact. The running production-required probe, exact deployed
browser evidence, real-wallet acceptance record, and signed/notarized package
evidence are the decision surfaces. The dated Friday execution and readiness
ledgers contain the complete launch-room sequence.
