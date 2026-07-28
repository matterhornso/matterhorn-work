# Matterhorn Desks Public Beta 0.13.15 RC6

Date: 2026-07-22

Status: release-workflow repair pending immutable-tag certification

## Candidate Delta

RC5 passed clean local certification, packaged-desktop smoke, browser
acceptance, and encrypted recovery testing. Its tag-triggered GitHub release
stopped before packaging because the version verifier treated the full
prerelease tag as the package version.

RC6:

- accepts a SemVer prerelease tag when release packages use either that exact
  prerelease version or its matching stable base version
- continues to reject tags whose base version differs from the release
  packages
- adds executable regression coverage for exact, prerelease, and mismatched
  release tags
- preserves the RC5 source behavior and user-facing product surface

## Promotion Rule

- RC1 through RC5 are superseded and must not be promoted.
- Build and test every release artifact from the RC6 tag only.
- Preserve `.matterhorn-work/`, `.opencode/package-lock.json`, `notes/`,
  `outputs/`, and `qa-reports/` as local state outside the source candidate.
- Public promotion still requires deployment, Apple distribution, wallet,
  authorization, operations, legal, and support acceptance.

## Required RC6 Proof

1. the complete platform safety gate passes before candidate creation
2. strict certification passes from a clean worktree at the exact RC6 tag
3. the tag-triggered GitHub workflow passes release-version verification
4. exact-tag browser and packaged-desktop acceptance pass
5. signed and notarized artifacts remain blocked unless the owner configures
   the required Apple release secrets
