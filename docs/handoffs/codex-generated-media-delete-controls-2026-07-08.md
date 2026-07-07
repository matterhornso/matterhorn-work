# Codex Handoff: Generated Media Delete Controls

## Branch
- `codex/generated-media-delete-controls`
- Base: `origin/dev` after PR #764 (`c93c03d3`)

## What Changed
- Added local delete support for generated media:
  - `DELETE /workspace/:workspaceId/images/:imageId`
  - `DELETE /workspace/:workspaceId/nft-drafts/:draftId`
- Generated image delete removes the image file and metadata only when no NFT drafts depend on it.
- NFT draft delete removes local draft metadata only before public storage, mint, or listing state exists.
- Public-storage, minted, and listed drafts are refused with `nft_draft_public_state_retained` so public evidence is not silently erased.
- Updated `/workspace/:workspaceId/backend/data-controls` so `imageOutputs.deletion` reports working local delete actions with explicit requirements.

## Verification
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts` - 70 pass, 0 fail.
- `apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit` - pass.
- `git diff --check` - pass.

## Notes
- This does not delete public Walrus blobs, Sui objects, mint receipts, listing receipts, audit entries, or task/event logs.
- The delete routes are collaborator-scope and writable-server guarded.
- Untracked scratch/runtime files were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`
