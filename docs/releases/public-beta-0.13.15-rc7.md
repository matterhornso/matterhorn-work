# Matterhorn Desks Public Beta 0.13.15 RC7

Date: 2026-07-22

Status: security remediation pending immutable-tag certification

## Candidate Delta

RC6 repaired prerelease-tag verification, then its clean certification found
newly published advisories in the locked release graph. RC6 is not eligible for
promotion.

RC7:

- upgrades `@hono/node-server` to `2.0.10` and `hono` to `4.12.27`
- upgrades `fast-uri` to `3.1.4` and `sharp` to `0.35.3`
- limits the release-age exception to the exact `fast-uri@3.1.4` security patch
- makes the release dependency gate audit `pnpm-lock.yaml` directly so stale
  installed modules cannot change certification results
- adds executable coverage for the locked-audit command used by the candidate
  certifier

## Promotion Rule

- RC1 through RC6 are superseded and must not be promoted.
- Build and test every release artifact from the RC7 tag only.
- Preserve `.matterhorn-work/`, `.opencode/package-lock.json`, `notes/`,
  `outputs/`, and `qa-reports/` as local state outside the source candidate.
- Public promotion still requires deployment, Apple distribution, wallet,
  authorization, operations, legal, and support acceptance.

## Required RC7 Proof

1. the locked dependency audit reports no low-or-higher advisories
2. the complete platform safety gate passes before candidate creation
3. strict certification passes from a clean worktree at the exact RC7 tag
4. the tag-triggered GitHub workflow passes release-version verification
5. exact-tag browser and packaged-desktop acceptance pass
6. signed and notarized artifacts remain blocked unless the owner configures
   the required Apple release secrets
