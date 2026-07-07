# Sui Wallet Receipt Hardening Handoff

Date: 2026-07-08
Branch: `codex/sui-wallet-receipt-hardening`
Base: `origin/dev` at `833b6d09` (`Preserve NFT readiness capability details`)

## Why This Patch Exists

Matterhorn can now generate images, prepare Sui NFT mint/listing plans, and ask a connected Sui wallet to sign. The fragile seam is after wallet execution: the app must extract the public transaction digest and minted object id without ever recording signature material or guessing the wrong object.

The prior parser returned the first object-looking id it found while walking the wallet result. With Sui parsed effects, a transaction can include gas objects and mutated objects before the minted NFT. This could cause Matterhorn to record the gas object as the minted NFT object.

## What Changed

- `receiptFromSuiWalletResult` now only returns an object id when the wallet result marks it as created.
- Supported created-object signals include:
  - `type`, `$kind`, `kind`, or `idOperation` containing `created`.
  - Sui parsed effects shape where `inputState` is `DoesNotExist` and `outputState` exists.
- If no created object is found, the receipt keeps the digest but returns `objectId: null`, allowing the existing UI to ask the user to paste the minted object id instead of recording the wrong one.
- Added tests for:
  - dApp Kit documented `Transaction` result shape.
  - Parsed Sui `effects.changedObjects` shape.
  - Not mistaking gas/mutated objects for minted NFTs.
  - dApp Kit `FailedTransaction` message extraction.

## Files Changed

- `apps/app/src/react-app/domains/session/media/sui-nft-transaction-plan.ts`
- `apps/app/tests/image-generation-ui-contract.test.ts`

## Verification

```bash
bun test apps/app/tests/image-generation-ui-contract.test.ts
bun test apps/app/tests/image-generation-ui-contract.test.ts apps/app/tests/image-generation-backend-capability-contract.test.ts apps/app/tests/output-receipts.test.ts apps/app/tests/outputs-panel-contract.test.ts apps/app/tests/wallet-runtime-contract.test.ts
npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck
git diff --check
```

Observed results before commit:

- Image generation UI contract: 21 pass, 0 fail.
- Focused app media/output/wallet tests: 46 pass, 0 fail.
- App typecheck: pass.
- `git diff --check`: pass.

## Notes

- This is app-side wallet result parsing only; it does not add server custody, private-key handling, or direct backend transaction submission.
- Protected untracked scratch files were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
