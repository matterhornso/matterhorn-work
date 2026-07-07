# Codex Handoff: Generated Media Data Controls

## Branch
- `codex/generated-media-data-controls`
- Base: `origin/dev` after generated media browser receipts merged (`d01dd590`)

## What Changed
- Added first-class generated media export controls to `/workspace/:workspaceId/backend/data-controls`.
- The `imageOutputs` store now exposes:
  - Project history deep link filtered to generated images.
  - Generated media history API.
  - Generated image metadata API.
  - NFT draft state API.
  - Redacted image ledger export.
  - Redacted NFT ledger export.
- Marked generated media deletion as unsupported for now, because no image/NFT draft delete API is exposed yet.

## Why
- Kimi's image-generation + Sui NFT lane made generated images and NFT drafts real project data.
- The backend data-control contract now tells users where that data lives, how to review/export it, and what cannot be deleted yet.
- This keeps generated media aligned with the backend control-plane/data-policy story instead of treating it as a separate feature island.

## Verification
- `bun test apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts` - 38 pass, 0 fail.
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-nft-capabilities.test.ts apps/app/tests/image-generation-ui-contract.test.ts` - 60 pass, 0 fail.
- `apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit` - pass.
- `git diff --check` - pass.

## Notes
- No delete route was added in this slice.
- Untracked scratch/runtime files were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`
