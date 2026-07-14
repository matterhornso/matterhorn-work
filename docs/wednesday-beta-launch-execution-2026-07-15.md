# Matterhorn Work Wednesday Beta Launch Execution

Launch date: 2026-07-15

This is the operational decision record for the Wednesday release. It narrows
the launch promise to the customer journeys that have passed live browser,
backend, and safety verification. It does not convert missing production
services into customer setup or bypass billing, wallet, or signing controls.

## Release Decision

Target: controlled, non-custodial beta for the first 10 users.

The release candidate may ship only when every core gate in this document is
green. Optional production services may remain disabled when their state is
truthfully labeled and no customer action leads to a dead end.

## Included Customer Journeys

| Surface | Wednesday scope | Required outcome |
| --- | --- | --- |
| Project Home | Included | Create/open a project, start a chat or desk, and open recent work. |
| Chat | Included | Real model response, recovery from terminal failure, Stop, and direct-link reload. |
| Bittensor | Included | Public reads, research, comparison, and unsigned external-signer previews. |
| Hyperliquid | Included as preview only | Public market research, watches, and external-client handoffs. No submission. |
| Polymarket | Included as preview only | Public research, compliance, and external-client handoffs. No submission. |
| Sui | Included as wallet-guided preview | Wallet detection, required questions, transfer/NFT previews, and external signing. |
| Longevity | Included as educational workflow | Intake, plans, progress, and handoffs without medical or live-service claims. |
| Notes, Memory, Outputs, History | Included | Workspace-scoped persistence, review-first memory, readable outputs, and reload. |
| Wallet | Included as non-custodial | Connect/read/preview/review. Never request secrets or sign without the wallet. |
| MCPs and Tools | Included where runtime-ready | Name real connections. Unsupported web connectors remain disabled or Coming soon. |
| Settings and Appearance | Included | Persisted controls, truthful status ownership, and no dead-end actions. |

## Excluded Until Separately Green

| Surface | Wednesday default | Enable only after |
| --- | --- | --- |
| Live charging | Disabled | Separate live-money review. Stripe test mode alone is not live approval. |
| Paid upgrades | Disabled unless Stripe test gate passes | Checkout, portal, signed webhook, cancellation, and entitlement reconciliation. |
| Production image-to-Sui publishing | Platform setup | Production image provider, Walrus publisher/relay, all three Sui packages, entitlement, and wallet receipt flow. |
| Matterhorn Cloud | Not included | Sign-in, callback, organization, sync, shared worker, and recovery acceptance. |
| Hyperliquid/Polymarket execution | Not included | Separate custody, signing, submission, compliance, and money-path review. |

## Change Freeze

From scope approval through launch:

- accept P0 fixes for data loss, unsafe signing/submission, secret leakage,
  unavailable core chat, broken installation, or false billing state;
- accept P1 fixes for blocked primary journeys, persistent backend disconnects,
  unusable responsive layouts, or misleading capability states;
- defer P2/P3 polish, new integrations, structural refactors, dependency
  upgrades, and broad copy changes;
- do not weaken rate limits, approval gates, entitlements, CORS, secret
  redaction, external-signer boundaries, or read-only enforcement to make a
  smoke pass;
- keep one backend/engine owner per checkout.

## Required Evidence

1. Clean-workspace first-run and all five desks.
2. Real MetaMask, Coinbase Wallet, and Phantom acceptance where the extensions
   are available; otherwise record the missing device evidence as a release
   blocker and keep the connector unavailable.
3. Generated Media and Billing customer surfaces match backend production
   readiness and cannot imply unavailable services are working.
4. Packaged macOS app is hash-bound, launches with isolated user data, and has
   an explicit signing/notarization result.
5. Final product smoke, paced full-platform browser audit, app typecheck,
   `git diff --check`, production-readiness probe, and ten-stage platform safety
   gate are captured from the frozen candidate.

## Stop-Ship Conditions

- any P0 or P1 remains open;
- the app asks for or stores a seed phrase, private key, mnemonic, API secret,
  raw signature, signed payload, or wallet export;
- a protocol surface claims Matterhorn signs, broadcasts, or submits when it
  does not;
- checkout or a local preview grants paid entitlement before verified webhook
  reconciliation;
- a core route is unavailable, loops indefinitely, overflows horizontally, or
  loses workspace state after reload;
- the distributed macOS app is unsigned, unnotarized, fails Gatekeeper, or
  points its updater at an unsigned artifact;
- production readiness reports an unexplained blocker outside the explicitly
  excluded launch scope.

## Go/No-Go Rule

GO means the controlled beta scope is green and every excluded feature is
truthfully unavailable. NO-GO means a stop-ship condition exists. A fixture,
mock, or contract-only pass cannot override failed live or packaged evidence.

Primary evidence ledger:
`docs/handoffs/matterhorn-end-to-end-go-live-readiness-2026-07-11.md`.

## Final Candidate Result - July 14

Decision: **GO for the controlled local beta on the canonical managed stack.**
This approval covers only the included journeys above and an explicitly
unsigned internal macOS tester artifact. It is **not** approval for public
macOS distribution, live charging, production media publishing, or a claim
that real wallet extensions have completed device acceptance.

Canonical customer URL:
`http://127.0.0.1:5190/workspace/ws_d6a5b5572860/session`

Canonical backend:
`http://127.0.0.1:4130`

At final verification the backend health route returned version `0.13.12`, the
app returned HTTP 200, and exactly one process owned each canonical port. Any
parallel fixture or smoke stack must use a different checkout and workspace
root.

| Release surface | Decision | Evidence and boundary |
| --- | --- | --- |
| Controlled local web beta | GO | Final browser smoke passed 20/20, including real Bittensor, Hyperliquid, and Polymarket responses plus the expected Sui question stop. |
| Clean-workspace onboarding | GO | A separate workspace passed 20/20 first-run journeys without relying on the seeded project. |
| Notes, Memory, Outputs, History, Settings, MCP UI | GO | Covered by the browser suites and the complete ten-stage platform safety gate. |
| Wallet safety and previews | GO for automated non-custodial scope | Safety, approval, connector, and preview contracts pass. Matterhorn does not accept wallet secrets or submit transactions. |
| Real MetaMask, Coinbase Wallet, and Phantom devices | NO-GO pending device QA | No real-extension acceptance record is attached. Do not describe these connectors as device-verified. |
| Generated Media local test flow | GO for local test only | The isolated fixture flow passed all 14 stages. Production publishing remains disabled. |
| Billing local test UI | GO for truthful test-mode UI only | Live charging and paid entitlement activation remain disabled. |
| Bittensor formal test-customer packet | NO-GO pending customer evidence | The static beta gate passes 16/16, but a real customer smoke, Bittensor evidence verification, and browser checklist are not attached. |
| Internal unsigned macOS tester artifact | GO for named internal testers with warning | Packaged clean-profile smoke passed 16/16 and desktop doctor passed 11/11. |
| Public macOS distribution | NO-GO | No Developer ID identity, notarization credentials, Gatekeeper pass, or signed updater-channel metadata is available. |
| Production Billing | NO-GO | Stripe test checkout, portal, signed webhook, prices, and reconciliation are not configured. |
| Production image-to-Sui publishing | NO-GO | Image provider, Walrus publisher/relay, Sui NFT package, Kiosk package, and TransferPolicy are not configured. |

## Frozen Evidence

- Full platform safety gate: all 10 stages passed.
- Final canonical browser result:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-14-canonical-final/summary.json`.
- Clean-workspace result:
  `qa-reports/matterhorn-product-browser-smoke-2026-07-14-clean-launch-workspace-r4/summary.json`.
- Generated Media local-test result:
  `qa-reports/generated-media-browser-smoke-2026-07-14-launch-final-r2/summary.json`.
- Bittensor beta gate:
  `qa-reports/matterhorn-bittensor-beta-2026-07-14.json`.
- Customer-ready crypto gate:
  `qa-reports/matterhorn-crypto-smoke-2026-07-14-r2.json`.
- Production readiness:
  `qa-reports/product-readiness-2026-07-14-canonical-final.json` and
  `qa-reports/product-readiness-2026-07-14-canonical-final.md`.
- Corrected release-candidate pack:
  `qa-reports/matterhorn-wednesday-rc-pack-2026-07-14-final-r2/matterhorn-monday-beta-rc.json`.
- Packaged clean-profile result:
  `qa-reports/desktop-packaged-clean-profile-2026-07-14.json`.
- Desktop doctor:
  `qa-reports/matterhorn-desktop-beta-doctor-2026-07-14.md`.

The corrected RC pack has 13 passing stages and two truthful evidence
failures: the real-customer Bittensor packet and production integration
readiness. Its deployed browser stage passes semantically. The pack parser was
fixed to parse complete child JSON before redacting and truncating output, so a
large successful browser report can no longer be falsely labeled `NOT_READY`.

Internal tester artifact:
`/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-a6dcfe10`

- DMG SHA-256:
  `ae07cc5eb17c09b8988874237ac0bf4952e52be277bab5489cc3f3d94973ffe9`
- ZIP SHA-256:
  `3a044e9cc1d1a762cb122f537f8bcb6f01b8531d07e467c959c69de4d2ecd8b8`

## Remaining Owners

1. **Matterhorn release operator:** configure Stripe test keys, prices,
   checkout return URLs, signed webhooks, portal, and entitlement
   reconciliation; rerun the strict production probe with live charging still
   off.
2. **Matterhorn media operator:** configure and review the production image
   provider, Walrus publisher and relay, Sui NFT package, Kiosk package, and
   TransferPolicy; rerun production diagnostics and the real publishing flow.
3. **Wallet QA owner:** run MetaMask, Coinbase Wallet, and Phantom acceptance
   on supported browsers and record connect, reject, approve, network mismatch,
   reload, and disconnect evidence without exposing secrets.
4. **Bittensor customer QA owner:** attach a real customer-ready smoke result,
   Bittensor evidence verification result, and browser checklist to regenerate
   the formal customer packet.
5. **macOS release owner:** provide Developer ID and notarization credentials,
   bump the version beyond `0.13.12`, publish signed DMG/ZIP and updater
   metadata, verify Gatekeeper on a clean Mac, and document rollback.

Until those owners close their gates, the launch message must say **controlled
local beta** and must not promise public macOS installation, live paid plans,
production NFT publishing, or device-verified wallet support.
