# Matterhorn Desks Public Beta 0.13.15 RC4

Date: 2026-07-21

Status: replacement release candidate pending immutable-tag certification

## Candidate Delta

RC3 passed clean technical certification and browser acceptance, but the
stronger packaged-desktop smoke found that opening the embedded browser could
drop the Browser panel under Electron's `HashRouter`. The native tab opened,
but a stale raw browser location sent React Router to the wrong route.

RC4:

- derives side-panel transitions from the latest React Router location in both
  browser and packaged desktop runtimes
- keeps async desk launches from navigating with stale session state
- extends the packaged clean-profile smoke with authenticated remote-workspace,
  deep-link, embedded-browser navigation, panel-close, and process-stability
  checks
- records bounded browser diagnostics on failure without storing credentials
- retains the RC2 credential-redaction and RC3 dynamic-port CORS fixes

## Promotion Rule

- RC1, RC2, and RC3 are superseded and must not be promoted.
- Build and test all release artifacts from the RC4 tag only.
- Preserve `.matterhorn-work/`, `.opencode/package-lock.json`, `notes/`,
  `outputs/`, and `qa-reports/` as local state outside the source candidate.
- Public promotion still requires the external deployment, Apple distribution,
  real-wallet, authorization, operations, legal, and support gates.

## Required RC4 Proof

1. strict certification passes from a clean worktree at the exact RC4 tag
2. exact-tag browser acceptance passes on isolated loopback ports
3. exact-tag packaged desktop deep links into an authenticated workspace
4. exact-tag embedded browser opens, navigates, snapshots, and closes cleanly
5. desktop artifacts and release checks are rebuilt from the exact tag
