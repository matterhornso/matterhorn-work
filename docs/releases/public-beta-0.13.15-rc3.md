# Matterhorn Desks Public Beta 0.13.15 RC3

Date: 2026-07-21

Status: replacement release candidate pending immutable-tag certification

## Candidate Delta

RC2 passed the clean technical certifier but failed its exact-tag browser
acceptance run. The headless launcher selected a dynamic web port while the
orchestrator retained a fixed-origin CORS default, so the browser could not
load workspace data.

RC3:

- launches the headless web stack with the secure `loopback` CORS policy
- supports local web acceptance on any loopback port without wildcard CORS
- adds the dynamic-port launcher to the production CORS readiness gate
- avoids host-only environment-key probes when the web client has no host
  credential
- retains the RC2 workspace credential-redaction and safe logging fixes

## Promotion Rule

- RC1 and RC2 are superseded and must not be promoted.
- Build and test all release artifacts from the RC3 tag only.
- Preserve `.matterhorn-work/`, `.opencode/package-lock.json`, `notes/`,
  `outputs/`, and `qa-reports/` as local state outside the source candidate.
- Public promotion still requires the external deployment, Apple distribution,
  real-wallet, authorization, operations, legal, and support gates.

## Required RC3 Proof

1. the exact-tag headless stack starts on non-default loopback ports
2. browser acceptance loads workspace data without CORS failures
3. full Matterhorn platform safety gate passes
4. strict certification passes from a clean worktree at the exact RC3 tag
5. desktop artifacts and release checks are rebuilt from that tag
