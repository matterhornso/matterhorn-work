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

## Frozen Wednesday Candidate - July 14

Decision: **GO for a controlled local beta for named internal testers.**

This decision covers the verified local, non-custodial journeys only. It does
not approve public macOS distribution, live charging, production media
publishing, Matterhorn Cloud, protocol execution, or claims that real wallet
extensions completed device acceptance.

Release version: `0.13.13`

Release branch: `codex/wednesday-beta-rc-2026-07-15`

Clean release worktree:
`/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-wednesday-rc`

Durable launch workspaces:
`/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-wednesday-launch-workspaces/server.json`

Canonical URLs after cutover:

- app: `http://127.0.0.1:5190/workspace/ws_18dc91c9102a/session`;
- backend: `http://127.0.0.1:4130`.

The launch operator must start the canonical stack with the durable server
configuration, the complete Bittensor beta flags, and an explicit authenticated
read-request budget of 5,000 requests per 60 seconds. This raised budget is for
the multi-surface local release audit; write limits, approvals, entitlements,
external-signer boundaries, and execution blocks remain unchanged.

| Release surface | Decision | Evidence and boundary |
| --- | --- | --- |
| Controlled local web beta | GO | Two independent durable workspaces passed 20/20 product stages with zero browser errors or network failures. |
| Responsive UI and primary interactions | GO | The strict audit passed 104 surfaces and 11 interactions, inventoried 2,922 controls, and reported zero issues, console errors, page errors, or network failures. |
| Notes, Memory, Outputs, History, Settings, and MCP UI | GO | Covered at desktop, compact-laptop, tablet, and mobile widths by the strict audit and by the complete ten-stage platform safety gate. |
| Workspace activation and persistence | GO | Client and host credentials remain separate, host-auth activation is tested, and new workspace configuration persists through the durable server config. |
| Wallet safety and previews | GO for automated non-custodial scope | Connector, approval, rejection, preview, receipt, and secret-redaction contracts pass. Matterhorn does not accept wallet secrets or submit transactions. |
| Real MetaMask, Coinbase Wallet, and Phantom devices | NO-GO pending device QA | Chrome control reported `Browser is not available: extension`. No real-extension acceptance record is attached, so connectors must not be described as device-verified. |
| Bittensor workflow | GO for limited test-customer QA | The formal packet is ready, the static gate passed 16/16, the customer-ready crypto smoke passed 52/52, and live-route QA passed 21/21. Public data currently uses curated fallback; no live validator/provider rows were returned. |
| Hyperliquid and Polymarket | GO for research and external handoff only | Public reads, previews, watches, and unsigned handoffs are covered. Live execution and submission stay disabled. |
| Sui | GO for questions, public reads, and unsigned wallet handoff only | Automated Wallet Standard and Phantom fallback contracts pass. Production minting/listing and real-device signing are excluded. |
| Generated Media local test flow | GO for local test only | Mock image history and local draft surfaces work. Production provider, Walrus, and Sui publishing inputs are absent. |
| Billing local test UI | GO for truthful test-mode UI only | The UI exposes test mode and limitations. Live charging and paid entitlement activation remain disabled. |
| Matterhorn Cloud | NOT INCLUDED | Account, cross-device sync, shared Cloud teammates, and Cloud workers are disabled in this build. Local work requires no Cloud account. |
| Internal unsigned macOS tester artifact | GO for named internal testers with warning | Built from `19ca5c5d`; DMG and ZIP integrity pass, desktop doctor passes 11/11, and packaged clean-profile smoke passes 16/16. |
| Public macOS distribution | NO-GO | No Developer ID identity, notarization credentials, clean-Mac Gatekeeper pass, or signed updater metadata is available. |
| Production Billing | NO-GO | Stripe test checkout, portal, signed webhook, prices, and reconciliation are not configured. |
| Production image-to-Sui publishing | NO-GO | Image provider, Walrus publisher/relay, Sui NFT package, Kiosk package, and TransferPolicy are not configured. |

## Frozen Evidence

- Full platform safety gate: all 10 stages passed after the final source fixes.
- Launch user one:
  `qa-reports/wednesday-launch-user-one-product-smoke/summary.json` - 20/20.
- Launch user two:
  `qa-reports/wednesday-launch-user-two-product-smoke/summary.json` - 20/20.
- Strict responsive audit:
  `qa-reports/wednesday-launch-full-platform-audit-green/summary.json` -
  104 surfaces, 11 interactions, 2,922 controls, zero issues.
- Durable responsive audit digest:
  `qa-reports/wednesday-launch-full-platform-audit-green/launch-summary.md`.
- Production readiness:
  `qa-reports/wednesday-launch-production-readiness.json` and
  `qa-reports/wednesday-launch-production-readiness.md` - 12 pass, 3 expected
  production-only failures.
- Bittensor formal packet:
  `qa-reports/wednesday-launch-bittensor-packet-green/matterhorn-bittensor-beta-rc.json`.
- Bittensor live-route QA:
  `qa-reports/wednesday-launch-bittensor-evidence/bittensor-live-qa.json` -
  21/21.
- Customer-ready crypto smoke:
  `qa-reports/wednesday-launch-bittensor-evidence/customer-ready-crypto-smoke.json` -
  52/52.
- Live public-data report:
  `qa-reports/wednesday-launch-live-public-qa/matterhorn-live-public-qa.json` -
  ready with fixture fallback for three optional stages.

The strict production probe has 12 passing stages and three expected failures:

1. Billing is still `phase0_mock`; verified Stripe test checkout and webhooks
   are operator-owned release inputs.
2. Generated Media is missing the production image key, Walrus publisher and
   relay, and three Sui package identifiers.
3. The production image-to-NFT flow correctly stops at the Free-plan Walrus
   entitlement instead of bypassing Billing.

These failures are not user setup requests. They are platform-operator work and
remain outside the controlled beta promise.

## Final Artifact Record

The final private artifact is hash-bound to the frozen source candidate. The
first artifact from `07a9c82a` remains diagnostic evidence only and must not be
distributed as the final Wednesday build.

- frozen source candidate: `19ca5c5d`;
- evidence-ledger release ref: `v0.13.13-beta.1`;
- artifact directory:
  `/Users/abhinavramesh/Desktop/matterhorn-work-controlled-beta-19ca5c5d`;
- DMG: `Matterhorn-Work-19ca5c5d-arm64-unsigned.dmg`;
- DMG SHA-256:
  `4f168ca1221f65dc21e97371f5cb65664205fff012a7c600c4b6f3d41e4c06f6`;
- ZIP: `Matterhorn-Work-19ca5c5d-arm64-unsigned.zip`;
- ZIP SHA-256:
  `61a27cb71208ab8636af9c87918f06bee792ea699535d004870d87cac37570a3`;
- `hdiutil verify`: valid;
- `unzip -t`: no errors;
- desktop doctor: 11/11 pass;
- packaged clean-profile smoke: 16/16 pass.

## Remaining Owners

1. **Wallet QA owner:** run MetaMask, Coinbase Wallet, and Phantom acceptance
   on supported browsers and record connect, reject, approve, network mismatch,
   reload, and disconnect evidence without exposing secrets.
2. **macOS release owner:** provide Developer ID and notarization credentials,
   publish signed DMG/ZIP and updater metadata, verify Gatekeeper on a separate
   clean Mac, and document rollback before public distribution.
3. **Matterhorn Billing owner:** configure Stripe test keys, prices, checkout
   returns, signed webhooks, portal, and entitlement reconciliation before any
   paid beta.
4. **Matterhorn media owner:** configure the production image provider, Walrus
   publisher and relay, Sui NFT package, Kiosk package, and TransferPolicy;
   then rerun production diagnostics and the real publishing flow.
5. **Bittensor provider owner:** replace curated fallback with an accepted live
   public provider and rerun the public-data packet before claiming live network
   data or validator coverage.

Until those owners close their gates, all launch copy must say **controlled
local beta** and must not promise public macOS installation, live paid plans,
production NFT publishing, live Bittensor provider data, or device-verified
wallet support.
