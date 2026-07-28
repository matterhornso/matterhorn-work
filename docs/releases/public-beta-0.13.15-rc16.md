# Matterhorn Desks Public Beta 0.13.15 RC16

Date: 2026-07-24

Status: source candidate frozen; external owner acceptance and distribution
certification pending

## Candidate

- Branch: `codex/public-launch-acceptance-rc4`
- Tag: `v0.13.15-public-beta-rc.16`
- Parent candidate: RC15
- Candidate source manifest:
  `qa-reports/public-beta/v0.13.15-rc16-exact-sha/candidate/release-candidate-manifest/release-candidate-manifest.json`
- Local certification:
  `qa-reports/public-beta/v0.13.15-rc16-exact-sha/candidate/candidate-certification.json`

The QA paths above are local evidence only. They are excluded from the release
commit by the protected-path guard.

## Frozen Scope

RC16 is a hardening release. It adds no launch features.

### Customer-facing product truth

- hide internal OpenCode and OpenWork provider naming from customer surfaces;
- present the bundled catalog as Matterhorn Models;
- keep internal server and storage identifiers compatible without exposing
  them as product labels;
- remove the internal release command from the customer command menu.

### Chat and composer reliability

- preserve session drafts across navigation and reload;
- pass the selected model, agent, and reasoning variant to command execution;
- make copy, revert, and message actions produce observable success or failure;
- keep message actions reachable by mouse, keyboard, and touch;
- expose only extensions supported by the current runtime and route incomplete
  extension setup to Settings;
- keep command and skill execution confined to Work mode.

### Wallet and protocol clarity

- present EVM and Sui wallet connections in one Wallets section;
- keep Phantom branding on the Sui connection path;
- align Hyperliquid and Polymarket extension readiness with real backend routes;
- preserve fail-closed approval, wrong-chain, cancellation, and mainnet-block
  behavior;
- keep Bittensor and Polymarket preview-only boundaries explicit.

### UI and accessibility

- remove nested main landmarks from session and settings shells;
- increase dark-theme secondary-text contrast while preserving hierarchy;
- improve action affordance and focus behavior without adding divider-heavy or
  box-heavy treatment;
- keep setup states honest instead of presenting unavailable integrations as
  ready.

### Dependency security

- update React Router to `7.18.1`;
- update PostCSS to `8.5.22`;
- retain exact dependency overrides in the lockfile.

## Verification

The frozen working tree passed:

- app suite: 667 tests, 0 failures;
- server suite: 748 tests, 0 failures;
- app, server, and desktop bridge typechecks;
- production app, server, and desktop builds;
- dependency audit with no low-or-higher advisories;
- source secret scan with zero findings;
- encrypted user-data backup and restore with digest verification;
- production CORS and web-readiness contracts;
- the complete ten-stage Matterhorn platform safety gate;
- RC16 control acceptance: 37 cases passed and 276 controls inventoried;
- full browser audit: 104 surfaces, 11 stateful interactions, 3,322 controls,
  and zero reported issues;
- wallet approval acceptance, including cancellation and fail-closed paths;
- notes, memory, outputs, billing, and product browser smoke flows.

The macOS production build completes locally. Developer ID signing,
notarization, stapling, Gatekeeper acceptance, clean-Mac installation, and
public download verification require release-owner credentials and must be
performed against this exact tag.

## Deliberately Excluded

Do not stage, delete, or rewrite:

- `.matterhorn-work/`;
- `notes/`;
- `outputs/`;
- `qa-reports/`, including screenshots, logs, manifests, and local acceptance
  evidence;
- unrelated scratch or parallel-agent handoff files.

## Promotion Boundary

This tag freezes an immutable source candidate. It does not by itself authorize
public promotion. Public GO still requires:

- proof that any previously shared credentials were revoked and replacements
  live only in the approved secret store;
- production HTTPS, authentication, exact-origin CORS, security headers,
  tenant isolation, monitoring, backup, and rollback evidence;
- deployed two-user acceptance;
- real MetaMask or Coinbase, Phantom/Sui, and Hyperliquid test-account
  acceptance using test assets;
- signed, notarized, stapled, Gatekeeper-approved macOS artifacts plus clean
  install, update, reinstall, checksum, and public-download evidence;
- approved privacy, terms, support, launch-room, and release-owner records.

No owner-controlled gate may be marked passed from local simulation or fixture
evidence.
