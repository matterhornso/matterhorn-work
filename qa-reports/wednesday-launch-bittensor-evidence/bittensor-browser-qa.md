# Wednesday Bittensor Browser QA

Date: 2026-07-14

Result: PASS for the controlled-beta browser and non-custodial workflow scope.

## Verified

- Two isolated launch workspaces completed all 20 product-smoke stages.
- Bittensor desk tasks completed with real assistant responses in both workspaces.
- The **Find useful subnets** desk task launched a session, sent its prompt,
  completed, and survived direct-link reload.
- Launched session evidence is attached for both clean launch workspaces.
- **Show my TAO balance** was exercised through the watch-only wallet snapshot
  route with a public SS58 example address.
- **Compare validators** was exercised on subnet 14 and returned an honest
  degraded-provider result instead of invented live rows.
- Degraded provider copy remained visible and did not block fallback research.
- **Prepare staking preview** produced an unsigned preview and a checksumed
  external-signer handoff using public address inputs only.
- Direct session reload, Project history, Notes, Memory, Wallet, Outputs, AI,
  MCPs, Billing, and Generated Media rendered without browser or network errors.
- The strict responsive audit passed 104 surfaces and 11 interactions across
  desktop, compact laptop, tablet, and mobile.
- The responsive audit inventoried 2,922 controls with zero layout, console,
  page, or tracked network issues.
- Bittensor public-address reads, validator comparison, subnet discovery,
  watches, unsigned staking preview, lower-level extrinsic preview, and
  checksumed external-signer handoff passed the authenticated live-route QA.
- The workflow never requested or accepted a seed phrase, private key,
  mnemonic, signature, signed payload, wallet export, or custody material.

## Launch Boundaries

- The Bittensor runtime reports a warning because no live provider or Subtensor
  sidecar is configured. Subnet 14 currently returns `curated-fallback` with no
  live validator rows. Public inputs used in QA were examples from official
  Bittensor documentation, not a funded customer wallet.
- The fallback state is acceptable for the controlled beta only when the UI and
  launch copy label it as fallback and do not claim live chain freshness.
- Staking and transfer actions stop at unsigned previews and require an
  external signer. Matterhorn does not sign or broadcast.
- MetaMask, Coinbase Wallet, and Phantom device acceptance is not covered by
  this browser pass because the required Chrome extension test environment was
  unavailable. Those connectors are not device-verified for launch.

## Evidence

- `qa-reports/wednesday-launch-user-one-product-smoke/summary.json`
- `qa-reports/wednesday-launch-user-two-product-smoke/summary.json`
- `qa-reports/wednesday-launch-full-platform-audit-green/summary.json`
- `qa-reports/wednesday-launch-bittensor-evidence/bittensor-live-qa.json`
- `qa-reports/wednesday-launch-bittensor-evidence/agent-control-live-qa.json`
- `qa-reports/wednesday-launch-bittensor-evidence/bittensor-beta-gate.json`
- `qa-reports/wednesday-launch-bittensor-evidence/customer-ready-crypto-smoke.json`
