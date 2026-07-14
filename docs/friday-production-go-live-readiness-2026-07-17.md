# Friday Production Go-Live Readiness - 2026-07-17

This is the decision ledger for the Matterhorn Work public production launch on
Friday, July 17, 2026. It supersedes the Wednesday controlled-beta decision for
launch purposes. Historical beta reports remain evidence and must not be
deleted or relabeled as production proof.

## Current Decision

**Public production status: NO-GO until the stop-ship gates below are closed.**

The software candidate is substantially green, but a production launch also
requires operator services, real wallet/device acceptance, and signed desktop
distribution. Matterhorn must not describe missing operator inputs as end-user
setup and must not publish an unsigned macOS build.

## Green Evidence

Verified from the Friday candidate worktree on July 14-15, 2026:

- production dependency audit: zero known vulnerabilities;
- app suite: 540 passed, 0 failed, 3,620 assertions across 70 files;
- server suite: 700 passed, 0 failed, 4,966 assertions across 55 files;
- app and server TypeScript checks: passed;
- production app/desktop bridge build: passed;
- full 10-stage Matterhorn platform safety gate: passed;
- customer-ready crypto smoke: 52 of 52 contract stages passed;
- strict production API probe: 12 passed, 3 failed for the explicit operator
  blockers below;
- release review: all version, dependency, OpenCode, and sidecar checks passed
  with no warnings;
- release workflow: draft-first, explicit publish, and mandatory macOS
  notarization policies passed their static safety gate;
- secret-shaped tracked-file scan found no production credential. The
  wellness QA generator intentionally contains fake secret-shaped rejection
  fixtures; they are not credentials.

Durable reports:

- `qa-reports/friday-production-go-live-2026-07-17/product-readiness.json`;
- `qa-reports/friday-production-go-live-2026-07-17/release-review.json`;
- `/tmp/matterhorn-friday-app-tests.log` when regenerated;
- `/tmp/matterhorn-friday-server-tests.log`;
- `/tmp/matterhorn-friday-build.log`;
- `/tmp/matterhorn-friday-platform-safety.log`.

## Stop-Ship Gates

| Gate | Owner | Current evidence | Required proof before GO |
|---|---|---|---|
| Stripe test billing | Matterhorn operator | Backend reports `phase0_mock`; checkout and webhooks are not production-ready. | Configure Stripe test secret, signed webhook secret, Plus/Max test prices, and test customer. Pass checkout, webhook, portal, entitlement, cancellation, and reconciliation QA while live charging remains disabled. |
| Production image provider | Matterhorn operator | `OPENAI_API_KEY` is missing from the deployment secret manager. | Generate an image through the deployed app, persist it as an Output, and verify usage/entitlement accounting without exposing the key. |
| Walrus public storage | Matterhorn operator | Publisher and relay URLs are missing. | Configure reviewed public HTTPS endpoints, verify reachability and upload/readback, and retain a redacted receipt. |
| Sui NFT publishing | Matterhorn operator | NFT, Kiosk, and TransferPolicy package IDs are missing. | Verify each package on the selected Sui network, mint/list on testnet with an external wallet, and retain the public receipt. |
| Image-to-Sui entitlement | Matterhorn operator | Free plan correctly blocks Walrus storage. | Activate the tested paid entitlement or deliberately remove the flow from the launch promise. The gate must never be bypassed in code. |
| macOS signing and notarization | Matterhorn operator | Local keychain has zero valid code-signing identities; repository secret names are not present through the current GitHub access. | Add the five Apple release secrets, build the stable tag in CI, verify Developer ID signature, notarization, stapling, Gatekeeper, updater metadata, and a clean-Mac install. |
| Real wallet devices | Release QA | Automated connector and signing-boundary contracts pass; no real-extension acceptance record is attached. | Test MetaMask, Coinbase Wallet, and Phantom/Sui on supported browsers: install/unlock, connect, reject, approve, network mismatch, reconnect, refresh, and external-signing handoff. Confirm no secret is requested or stored. |
| Deployed responsive/browser acceptance | Release QA | The prior candidate passed 104 surfaces and 11 interactions with zero issues. A fresh in-app-browser reload was blocked by the browser-control URL policy after the local-stack restart. | Rerun strict deployed multi-viewport audit and two-user product smoke against the final deployed commit. Require zero P0/P1 issues, console errors, failed requests, overlap, clipping, or horizontal overflow. |
| Production host and domain | Matterhorn operator | Current evidence is loopback-only. | Deploy exact commit behind HTTPS, set exact-origin CORS, validate TLS, CSP/security headers, health monitoring, backups, data deletion/export, and rollback. |

## Product Scope At Launch

These boundaries are product behavior, not temporary warnings:

- Matterhorn never asks for seed phrases, private keys, mnemonics, raw
  signatures, signed payloads, API secrets, or wallet exports.
- Bittensor supports public SS58 reads, subnet/validator research, watches,
  receipts, and unsigned external-signer previews. Live provider coverage must
  be labeled by the actual source; fallback data is not live evidence.
- Hyperliquid and Polymarket support research, previews, watches, and external
  handoffs only. Matterhorn does not submit live orders.
- Sui supports public reads and external-wallet handoffs. Minting/listing enters
  the public promise only after the operator and device gates pass.
- Matterhorn Cloud is not included unless its account, sync, organization, and
  shared-worker acceptance flow is separately configured and proven.
- Marketplace deployment, hiring, and payment are coming soon and remain
  disabled.

## Setup Ownership In The UI

- `Connect wallet`: user action in an installed wallet.
- `Connect provider`: workspace-owner action using a supported provider flow.
- `Platform setup`: Matterhorn operator service or deployment configuration.
- `Configure cloud`: Matterhorn operator decision and Cloud deployment.
- `Not available in this release`: intentionally disabled functionality with no
  fake or dead action.

Normal customer surfaces no longer say Monday beta or Beta-ready. The legacy
operator demo tab is available only when
`VITE_MATTERHORN_BITTENSOR_BETA=1`; stable builds omit that tab.

## Go Decision Rule

Friday is GO only when every stop-ship row has attached evidence from the exact
release commit and the final stable tag. Any missing service, unsigned package,
unverified real wallet, failed production probe, or stale browser report is an
automatic NO-GO. A local mock success cannot waive a production failure.
