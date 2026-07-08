# Codex Handoff: Generated Media Public Upload Hardening

Date: 2026-07-08
Branch: `codex/generated-media-public-upload-hardening`
Base: `origin/dev` after PR #779 (`6fe16c99`)

## Summary

This pass hardens the public Walrus upload boundary used by generated-image NFT drafts.

Matterhorn already prepares image generation, Walrus upload, Sui mint previews, wallet signing, mint receipts, and Sui Kiosk listing receipts. The weak production edge was public upload failure handling:

- uploads were not explicitly bounded by size, image content type, checksum, or timeout;
- failed publisher messages could be stored raw in local NFT draft state before response redaction;
- a failed public upload did not create a first-class project evidence event.

## What Changed

- `apps/server/src/walrus-storage.ts`
  - Adds connector-level validation before any public upload:
    - non-empty image bytes;
    - PNG/JPEG/WebP only;
    - default 25 MB max payload;
    - optional SHA-256 checksum verification against generated-image metadata;
    - 30 second default timeout covering both upload and response body read.
  - Adds structured errors:
    - `walrus_empty_blob`
    - `walrus_blob_too_large`
    - `walrus_unsupported_content_type`
    - `walrus_blob_integrity_mismatch`
    - `walrus_upload_timeout`
  - Bounds publisher error body parsing.

- `apps/server/src/generated-media-routes.ts`
  - Passes generated image `sha256` into Walrus upload.
  - Redacts upload failure text before storing it in NFT draft state or returning it.
  - Records failed uploads as:
    - audit action `workspace.nft.storage_upload_failed`;
    - task event `failed` with `nftOutputKind: "walrus_upload_failed"`.

- `apps/server/src/walrus-storage.test.ts`
  - New connector regression tests for bounded uploads and timeout behavior.

- `apps/server/src/generated-media-routes.e2e.test.ts`
  - Updates Walrus publisher fixture to support status/delay.
  - Adds regression coverage that failed publisher text is redacted and appears as project evidence.

## Verification

```bash
bun test apps/server/src/walrus-storage.test.ts apps/server/src/generated-media-routes.e2e.test.ts --timeout=15000
bun test apps/server/src/project-evidence-routes.e2e.test.ts apps/server/src/project-data-ledger-routes.e2e.test.ts --timeout=15000
bun test apps/server/src/image-nft-capabilities.test.ts apps/server/src/image-generation-provider.test.ts --timeout=15000
node scripts/generated-media-production-readiness.test.mjs
node scripts/generated-media-flow-smoke.test.mjs
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
git diff --check
```

## Boundaries

- This does not add custody, signing, or backend transaction submission.
- Real Walrus publisher/relay and real Sui package/Kiosk/TransferPolicy values are still required for a production environment smoke.
- No third-party NFT marketplace adapter beyond Sui Kiosk was added.
- Protected untracked scratch paths were left untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
  - `qa-reports/generated-media-browser-smoke/`
