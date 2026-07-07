# NFT Preview Activity Labels Handoff - 2026-07-08

## Branch

- `codex/nft-preview-activity-labels`
- Base: `origin/dev` after PR #761 (`ddf259cb`)

## What Changed

This pass makes generated-media NFT preview handoffs read clearly across the evidence layer.

- Project Activity now labels NFT preview output events as `Mint preview ready` or `Listing preview ready` instead of generic `Output saved`.
- NFT preview output events now show the status line `Saved to Outputs for wallet review.`
- The activity detail sheet labels preview JSON as `NFT preview`; finalized on-chain receipts still use `NFT receipt`.
- Project History now has `Images` and `NFTs` filters backed by the existing ledger summary counts.
- Project History output rows use the same `Mint preview ready` / `Listing preview ready` labels when ledger metadata includes `nftOutputKind`.

## Files Changed

- `apps/app/src/react-app/domains/recent-activity/recent-activity-section.tsx`
- `apps/app/src/react-app/domains/recent-activity/project-history-page.tsx`
- `apps/app/tests/recent-activity-normalize.test.ts`
- `apps/app/tests/recent-activity-contract.test.ts`

## Verification

Ran from `/Users/abhinavramesh/Documents/Matterhorn-work/wallet-copy-readability-latest`:

```bash
bun test apps/app/tests/recent-activity-normalize.test.ts apps/app/tests/recent-activity-contract.test.ts
apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit
bun test apps/app/tests/
git diff --check
```

Results:

- Focused recent activity/history tests: 51 pass, 0 fail.
- Full app tests: 349 pass, 0 fail.
- App typecheck: pass.
- Diff whitespace check: pass.

## Boundaries

- No backend schema or route changes.
- No NFT custody, signing, Walrus upload, or marketplace transaction behavior changed.
- Existing untracked scratch and generated QA files were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`

## Follow-Up

Next best generated-media work is to add a browser smoke around the Activity -> Outputs -> NFT preview detail path once the local app server is stable.
