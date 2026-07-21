# Matterhorn Desks Public Beta 0.13.15 RC2

Date: 2026-07-21

Status: replacement release candidate pending immutable-tag certification

## Candidate Delta

RC1 passed the static and build gates but failed a fresh orchestrator runtime
start. The server intentionally removes engine credentials from client-visible
workspace responses, while the orchestrator still expected those hidden values
during startup verification.

RC2:

- keeps engine username and password redacted from workspace APIs
- verifies the engine URL, workspace directory, server version, and host-token
  approval endpoint without expecting secrets from a client response
- removes credential-bearing payloads from structured readiness logs
- adds the regression contract to the full Matterhorn platform safety gate

## Promotion Rule

- RC1 (`v0.13.15-public-beta-rc.1`) is superseded and must not be promoted.
- Build and test all release artifacts from the RC2 tag only.
- Preserve `.matterhorn-work/`, `.opencode/package-lock.json`, `notes/`,
  `outputs/`, and `qa-reports/` as local state outside the source candidate.
- Public promotion still requires the external deployment, Apple distribution,
  real-wallet, authorization, operations, legal, and support gates.

## Required RC2 Proof

1. orchestrator fresh-start check reaches `Ready` and `Checks ok`
2. structured readiness log contains no username, password, or token fields
3. full Matterhorn platform safety gate passes
4. strict certification passes from a clean worktree at the exact RC2 tag
5. browser acceptance and desktop artifacts are rebuilt from that tag
