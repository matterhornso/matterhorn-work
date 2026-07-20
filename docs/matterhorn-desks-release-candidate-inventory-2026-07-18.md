# Matterhorn Desks Release Candidate Inventory - 2026-07-18

This is the current scope-freeze ownership record for
`codex/product-hunt-hardening-2026-07-21`. It supplements the Product Hunt
execution ledger and the July 18 launch QA summary. It does not convert the
candidate to `GO`.

## Snapshot

- Base commit: `05bde6c446e75edb330f5add04e02d0428689790`
- Branch: `codex/product-hunt-hardening-2026-07-21`
- Expanded dirty-path inventory: 842 paths
- Candidate-review paths: 399
- Preserve-only paths: 443
- Candidate-review status: 371 modified, 2 deleted, 26 untracked
- Candidate review buckets: 7
- Staged candidate paths: 0
- Staged protected paths: 0
- Unclassified candidate paths: 0
- Index policy: no release staging until every candidate-review bucket is
  reviewed and the protected-path guard passes

The two tracked deletions replace the old eager wallet-provider components with
the launch-hardened lazy wallet runtime:

- `apps/app/src/react-app/shell/LazyWalletProvider.tsx`
- `apps/app/src/react-app/shell/LazyWalletShell.tsx`

The 26 untracked candidate-review paths are release source, tests, branding
documentation, pinned Docker setup, or release certification tooling:

- public theme bootstrap and app bootstrap CSS;
- public Cloud configuration, sign-in bootstrap, and authenticated shell split;
- lazy wallet runtime provider and shell replacements;
- experimental translation deferral;
- public Cloud configuration contract test;
- customer-safe MCP display naming;
- Matterhorn Desks branding migration;
- pinned OpenCode release checksum and installer;
- release scope and secret-scan guards with focused tests;
- release-candidate manifest and public-beta certifier with focused tests;
- this release-candidate inventory.

## Preserve-Only Boundary

The release candidate must not stage, delete, rewrite, copy, or publish:

- `.opencode/package-lock.json`;
- `.matterhorn-work/`;
- `notes/`;
- `qa-reports/`, except a separately reviewed compact evidence allowlist;
- duplicate desktop package directories such as `dist-electron 2`, `server 2`,
  and `server 3`;
- credentials, tokens, runtime logs, or generated package output.

The consolidation snapshot classifies 443 paths as preserve-only:

| Root | Paths |
|---|---:|
| `.opencode/package-lock.json` | 1 |
| `.matterhorn-work/` | 4 |
| `notes/` | 1 |
| `qa-reports/` | 437 |

Protected filenames below those roots are intentionally omitted from this
document. They may contain local or sensitive context and are not release
source.

## Candidate Review Buckets

1. Public branding and product truth: `PRODUCT.md`, `DESIGN.md`, public metadata,
   icons, onboarding, desktop display names, email templates, and current docs.
2. Public web security: authenticated bootstrap split, cookie-backed Cloud
   session discovery, same-origin proxy contracts, CSP-compatible theme
   bootstrap, exact-origin CORS, and deployment probes.
3. Runtime and recovery: managed engine reload behavior, request deadlines,
   error handling, persistence, backup/restore, and fail-closed capability
   reporting.
4. Wallet and market safety: lazy wallet runtime, Sui connection, Bittensor
   handoffs, Hyperliquid intent controls, approvals, receipts, and limits.
5. UI and accessibility: quiet healthy states, hidden reasoning by default,
   responsive panels, brighter text, clickable-control contrast, and truthful
   unavailable states.
6. Release engineering: CI, Docker, pinned sidecar checksums, dependency audit,
   desktop packaging, signing verification, rollback, and readiness gates.
7. Tests and current release documentation covering all of the above.

## Guard Commands

Run before and after every staging operation:

```bash
pnpm release:scope-inventory -- \
  --strict \
  --json-output qa-reports/product-hunt/release-scope-inventory.json

pnpm release:candidate-manifest -- \
  --output-dir qa-reports/public-beta/reviewed-candidate-manifest \
  --expected-head "$(git rev-parse HEAD)" \
  --strict
```

The inventory records every candidate-review path and summarizes preserve-only
roots without exposing their filenames. The manifest additionally hashes and
buckets every candidate path. The guards exit nonzero if a protected path is
staged; the manifest also blocks unclassified paths and an unexpected HEAD.

## Phase-One Exit Criteria

- named owner matrix is recorded in the launch room;
- the Cudos credential previously exposed outside the repository is revoked;
- every candidate-review bucket has a reviewer;
- preserve-only paths remain unstaged and unchanged;
- the scope inventory guard passes;
- no new customer capability is added.
