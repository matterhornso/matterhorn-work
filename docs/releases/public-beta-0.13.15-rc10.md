# Matterhorn Desks Public Beta 0.13.15 RC10

Date: 2026-07-22

Status: source candidate frozen; owner acceptance and deployment certification pending

## Baseline

- Branch: `codex/public-launch-acceptance-rc4`
- Parent commit: `095277ca37e49ff2cb2746c785859afd7c441dfe`
- Parent candidate: RC9
- Full acceptance report: `qa-reports/full-platform-user-acceptance-2026-07-22-rerun/report.md`
- Fresh certification packet: `qa-reports/public-beta/production-readiness-2026-07-22-gym/`

The QA paths above are local evidence only. They are not source inputs and are
excluded from the release commit by the protected-path guard.

## Candidate Delta

RC10 freezes the post-RC9 interface, runtime, and acceptance fixes requested in
the final production-readiness review.

### Product truth and runtime metadata

- emit `matterhorn` for new runtime capability source metadata while retaining
  backward-compatible readers for historical payloads;
- keep legacy engine and storage identifiers internal rather than presenting
  them as customer-facing product copy;
- normalize customer-visible Matterhorn Desks naming across settings and
  session surfaces.

### Models and provider experience

- simplify the Models settings hierarchy and distinguish included models from
  external provider setup;
- use the Matterhorn logo for the included model catalog;
- align provider status, model browsing, and connection recovery with the
  current product contract;
- refresh browser acceptance selectors and UI contract coverage for the final
  Models experience.

### Wallet and protocol clarity

- use the Phantom mark for the Sui wallet path and preserve the external-wallet
  approval boundary;
- distinguish status labels from actionable controls and reduce explanatory
  density without removing safety-critical meaning;
- keep empty safety ledgers honest instead of rendering fixture events;
- harden wallet approval browser coverage for current policy and ledger states.

### Settings and MCP usability

- align settings navigation and cards with the Matterhorn ink-and-ice palette;
- improve contrast and action affordance across Overview, Memory, Feedback,
  Wallet, and MCP surfaces;
- use the Matterhorn logo for the active Matterhorn Desks MCP app;
- report clipboard success and failure explicitly when copying generated MCP
  client configuration;
- update the full-platform and product browser harnesses for the current
  customer-facing surface.

### Runtime recovery

- harden JSON-with-comments parsing and recovery behavior;
- preserve backend capability compatibility while emitting current product
  metadata;
- add focused backend and app regressions for the final candidate behavior.

## Fresh Technical Certification

The RC10 working tree passed the production candidate certifier before commit:

- protected-path and dirty-tree inventory;
- hashed candidate manifest;
- strict source secret scan;
- locked dependency audit at `low` severity;
- complete app and server suites;
- app, server, and Electron typechecks;
- production web, server, and desktop build;
- the complete Matterhorn platform safety gate;
- live customer-flow browser acceptance.

The certifier reported `technicalGatesPass: true`, `sourceStable: true`, and
`localReady: true`. It correctly withheld public GO while the source was still
mutable and while external owner evidence remained absent.

## Deliberately Excluded

The release commit must not stage, delete, or rewrite:

- `.opencode/package-lock.json`;
- `.matterhorn-work/`;
- `notes/`;
- `outputs/`;
- `qa-reports/`, including screenshots, manifests, logs, and local acceptance
  evidence.

## Promotion Boundary

This commit creates an immutable source candidate. It does not authorize public
promotion. Before tagging or deploying RC10, complete real MetaMask/Coinbase,
Phantom/Sui, Hyperliquid test-account, and launch OAuth acceptance; production
HTTPS, authentication, tenant-isolation, monitoring, backup, and rollback
certification; and signed/notarized macOS distribution verification from the
exact candidate commit.
