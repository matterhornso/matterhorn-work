# Sui Wallet Receipt Extraction Hardening

Date: 2026-07-08
Branch: `codex/sui-wallet-receipt-extraction-hardening`
Base: `origin/dev` at `95501d10` (`Save NFT preview handoff outputs (#760)`)

## What changed

- Hardened Sui wallet execution receipt extraction for the image-to-NFT browser path.
- The parser now handles:
  - dApp Kit discriminated `Transaction` / `FailedTransaction` results
  - direct wallet adapter transaction objects with a top-level `digest`
  - Sui core `effects.changedObjects`
  - JSON-RPC `effects.created`
  - GraphQL-style `effects.objectChanges.nodes`
  - object and string transaction failure messages
- The parser still avoids treating gas/mutated objects as minted NFT object ids.

## Why

The NFT panel already attempts to auto-record a public mint/listing receipt after browser wallet signing. This makes that path more likely to work with real Sui wallet result shapes, instead of forcing users back to manual digest/object-id copy-paste when the wallet returns a valid public receipt.

## Verification

- `bun test apps/app/tests/image-generation-ui-contract.test.ts`
  - 26 pass, 0 fail
- `apps/app/node_modules/.bin/tsc -p apps/app/tsconfig.json --noEmit`
  - pass
- `bun test apps/app/tests/`
  - 348 pass, 0 fail
- `git diff --check`
  - pass

## Boundaries

- No custody, key handling, raw signatures, or live backend submission was added.
- Real signing still happens in the user's connected Sui wallet on web.
- Desktop/Electron remain external-handoff surfaces where direct wallet-standard connect is unavailable.
