# Friday Production Go-Live Readiness - 2026-07-17

> Schedule update, July 16: Friday is now a controlled Beta and the public
> Product Hunt target is Tuesday, July 21. Use
> `friday-beta-and-product-hunt-launch-sequence-2026-07-16.md` and the
> machine-readable `launch-channel-readiness.mjs` gate for current decisions.
> The production stop-ship evidence below remains required for Product Hunt.

This is the decision ledger for the Matterhorn Work public production launch on
Friday, July 17, 2026. It supersedes the Wednesday controlled-beta decision for
launch purposes. Historical beta reports remain evidence and must not be
deleted or relabeled as production proof.

## Current Decision

**Public production status: NO-GO until the remaining distribution, device,
deployment, and operations gates below are closed.**

The software candidate is substantially green, but a production launch also
requires operator services, real wallet/device acceptance, and signed desktop
distribution. Matterhorn must not describe missing operator inputs as end-user
setup and must not publish an unsigned macOS build.

The frozen product scope and dirty-tree staging boundaries are recorded in
`docs/friday-launch-scope-freeze-and-consolidation-2026-07-16.md`.
The testing-team full-codebase review and the verified disposition of each
claim are recorded in
`docs/testing-team-full-codebase-review-triage-2026-07-16.md`.

The review did not change the public NO-GO decision. It produced focused code
hardening for compiled status colors, settings failure isolation, stable-locale
policy, trusted-peer rate limiting, symlink containment, token comparison,
stream shutdown, billing fail-closed defaults, and required CI coverage. Its
markdown-XSS claim was disproven against the current raw-HTML-disabled renderer
and exact malicious-payload test. Billing authority and broader transaction
coverage remain outside the stable launch scope and must not be enabled by
copy, route, or environment drift.

## Green Evidence

Verified from the Friday candidate worktree through July 16, 2026:

- production dependency audit: 1,199 installed packages and 1,341 resolved
  versions checked, with zero known advisories at low severity or higher;
- app suite: 555 passed, 0 failed, 3,723 assertions across 74 files;
- server suite: 711 passed, 0 failed, 5,001 assertions across 57 files;
- app and server TypeScript checks: passed;
- root production build, app bundle, and 50-method desktop bridge check: passed;
- full 10-stage Matterhorn platform safety gate: passed;
- customer-ready crypto smoke: 52 of 52 contract stages passed;
- strict production API probe: 12 passed, 3 failed for the explicit operator
  services that were still in the old launch scope;
- stable-scope production API probe: 11 required stages passed, 0 failed, and
  4 optional Billing/generated-media stages were explicitly skipped because
  those services are not included in this release;
- local Profile capability routing now uses the runtime workspace identifier;
  the panel reports the working local profile instead of a false unavailable
  state when the frontend route id and backend runtime id differ;
- release review: all version, dependency, OpenCode, and sidecar checks passed
  with no warnings;
- release workflow: draft-first, explicit publish, and mandatory macOS
  notarization policies passed their static safety gate;
- Electron 43.1.1 packaged successfully with electron-builder 26.15.6, and
  the fresh unsigned macOS app passed all 11 strict clean-profile smoke checks;
- local browser acceptance passed at 390x844 and 1440x900 with no console
  errors or horizontal overflow across project home, chat, Profile, Wallet,
  Outputs, MCPs & Tools, and Notes;
- the post-triage route matrix passed 14 stable desktop routes and 8 critical
  mobile routes with expected content, no crash signature, no horizontal
  overflow, and zero browser console errors;
- the post-triage production CSS contains representative restored numeric
  safety/status utilities for red, sky, amber, and emerald states;
- the final 390x844 Wallet/Overview pass on the fresh post-build UI confirmed
  the Hyperliquid review-and-sign boundary, no horizontal overflow, and no
  disabled Cloud/Billing setup prompts;
- historical mock image outputs display an explicit mock-preview state rather
  than an empty or broken media canvas;
- live local flows passed for all four protocol desks, the seven-stage
  Longevity workflow, AI provider discovery, all three response perspectives,
  and Notes create, autosave, reopen, and delete;
- secret-shaped tracked-file scan found no production credential. The
  wellness QA generator intentionally contains fake secret-shaped rejection
  fixtures; they are not credentials.

Durable reports:

- `qa-reports/friday-production-go-live-2026-07-17/product-readiness.json`;
- `qa-reports/friday-production-go-live-2026-07-17/stable-scope-product-readiness.json`;
- `qa-reports/friday-production-go-live-2026-07-17/release-review.json`;
- `qa-reports/friday-production-go-live-2026-07-17/dependency-release-audit.json`;
- `qa-reports/friday-production-go-live-2026-07-17/packaged-clean-profile.json`;
- `qa-reports/friday-production-go-live-2026-07-17/final-verification-summary.md`;
- `/tmp/matterhorn-friday-app-tests-final.log`;
- `/tmp/matterhorn-friday-app-typecheck-final.log`;
- `/tmp/matterhorn-friday-server-tests-final.log`;
- `/tmp/matterhorn-friday-server-typecheck-final.log`;
- `/tmp/matterhorn-friday-dependency-release-audit-final.json`;
- `/tmp/matterhorn-friday-platform-safety-final.log`;
- `/tmp/matterhorn-friday-build-final.log`;
- `/tmp/matterhorn-friday-root-build-final.log`;
- `/tmp/matterhorn-friday-electron-package-dir-final.log`;
- `/tmp/matterhorn-friday-packaged-clean-profile-final.json`;
- `/tmp/matterhorn-friday-release-review-final.json`;
- `/tmp/matterhorn-friday-build-sidecars.log`;
- `/tmp/matterhorn-friday-stable-readiness.json` (July 16 live stable-scope
  rerun; 11 pass, 0 fail, 4 deliberate skips).

## Stop-Ship Gates

| Gate | Owner | Current evidence | Required proof before GO |
|---|---|---|---|
| macOS signing and notarization | Matterhorn operator | Local keychain has zero valid code-signing identities; repository secret names are not present through the current GitHub access. | Add the five Apple release secrets, build the stable tag in CI, verify Developer ID signature, notarization, stapling, Gatekeeper, updater metadata, and a clean-Mac install. |
| Real wallet devices | Release QA | Automated connector, exact-intent signature recovery, replay, expiry, limit, and kill-switch contracts pass; no real-extension Hyperliquid order acceptance record is attached. | Test MetaMask/Coinbase on Hyperliquid testnet: connect, reject signature, approve a minimal order, verify public receipt/open order or fill, refresh/reconnect, and confirm no secret or signature is stored. Repeat mainnet only with an explicitly approved minimal-value test. Test Phantom/Sui connect and reject/approve handoff separately. |
| Visible MCP and OAuth connectors | Release QA | Notion, Linear, Sentry, and Stripe use real remote MCP endpoints and the implemented OAuth flow; no real-account acceptance packet is attached to the Friday candidate. | Connect and disconnect one test account for every visible connector, verify tools after reload/restart, and confirm token/error redaction. Any connector that cannot pass must be disabled and labeled `Coming soon` before tagging. |
| Deployed responsive/browser acceptance | Release QA | Fresh local acceptance passed mobile and desktop layouts, seven primary panels, all four protocol desks, Longevity, AI providers, response perspectives, and Notes CRUD with no console errors or horizontal overflow. This is loopback evidence, not deployed production proof. | Rerun strict multi-viewport audit and two-user product smoke against the final deployed commit. Require zero P0/P1 issues, console errors, failed requests, overlap, clipping, or horizontal overflow. |
| Production host and domain | Matterhorn operator | Current evidence is loopback-only. | Deploy exact commit behind HTTPS, set exact-origin CORS, validate TLS, CSP/security headers, health monitoring, backups, data deletion/export, and rollback. |

## Deferred Services

These services remain implemented and independently testable, but are not in
the stable launch promise. They are hidden by default and are not production
gates until their explicit build/CLI launch flags are enabled:

| Service | Enablement flag | Proof required before enablement |
|---|---|---|
| Billing | `VITE_MATTERHORN_BILLING_ENABLED=1` and `--launch-billing` | Stripe test checkout, signed webhooks, portal, entitlements, cancellation, and reconciliation. |
| Generated media and Sui NFT publishing | `VITE_MATTERHORN_GENERATED_MEDIA_ENABLED=1`, `--launch-generated-media`, and `--include-generated-media-flow` | Production image provider, Walrus upload/readback, verified Sui package IDs, external-wallet testnet mint/list, receipts, and paid entitlement. |
| Matterhorn Cloud | `VITE_MATTERHORN_CLOUD_ENABLED=1` | Account, organization, sync, team, worker, and recovery acceptance against the deployed control plane. |

## Product Scope At Launch

These boundaries are product behavior, not temporary warnings:

- Matterhorn never asks for seed phrases, private keys, mnemonics, raw
  signatures, signed payloads, API secrets, or wallet exports.
- Bittensor supports public SS58 reads, subnet/validator research, watches,
  receipts, and unsigned external-signer previews. Live provider coverage must
  be labeled by the actual source; fallback data is not live evidence.
- Hyperliquid supports research, previews, watches, and manual connected-wallet
  perpetual execution through an expiring one-time intent. Every order requires
  a fresh wallet signature; agents, MCP, CLI, and watches cannot submit.
- Polymarket remains research, preview, watch, and external handoff only.
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
release commit and the final stable tag. Any unsigned package, unverified real
wallet, failed in-scope production probe, or stale browser report is an
automatic NO-GO. Deferred services must remain disabled; a local mock success
cannot be used to enable them.
