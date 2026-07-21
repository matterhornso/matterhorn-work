# Matterhorn Desks Public Beta 0.13.15 RC1

Date: 2026-07-21

Status: immutable local release candidate

## Candidate Identity

- Version: `0.13.15`
- Candidate tag: `v0.13.15-public-beta-rc.1`
- Branch: `codex/public-launch-acceptance-rc4`
- Baseline: `c558de6f689f3a1976239bf4c7697b78b23b1ea3` (`v0.13.14`)
- Promotion rule: promote this exact commit only; do not rebuild from a later dirty tree

## Included Scope

- Matterhorn Desks UI and interaction hardening across chat, panels, settings,
  wallet, notes, memory, outputs, generated media, and MCP surfaces
- Route recovery, panel URL state, settings state synchronization, and sanitized
  user-facing errors
- Wallet policy, approval, connector, and runtime safety contracts
- Model/provider readiness and local provider-label abstraction
- Desktop packaging source checks and dependency security overrides
- Product browser smoke, backup/restore drill, and focused contract tests
- Full-platform user acceptance cases in
  `docs/qa/full-platform-user-acceptance-test-cases-2026-07-21.md`

## Deliberately Excluded

These paths are local runtime state or generated evidence. They are preserved in
the working directory but are not part of the source candidate:

- `.matterhorn-work/`
- `.opencode/package-lock.json`
- `notes/`
- `outputs/`
- `qa-reports/`

## Required Verification

Before tagging, the reviewed source set must pass:

1. dependency audit and frozen-lockfile install
2. app and server tests
3. app, server, and desktop typechecks
4. production app build
5. Matterhorn platform safety gate
6. browser acceptance smoke
7. release-scope and secret-scan checks

After tagging, repeat certification and artifact generation from a clean
worktree at the tag. Evidence must record the tag, full source commit, hashes,
and any external gates that remain incomplete.

## Promotion Gates

The candidate is not a public macOS or web release until all applicable owner
and external gates are complete, including Apple signing/notarization,
production web deployment and CORS verification, and owner acceptance on the
actual distributed artifacts.
