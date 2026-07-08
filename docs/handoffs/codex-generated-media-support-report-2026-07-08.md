# Generated Media Support Report Handoff - 2026-07-08

Branch: `codex/generated-media-support-report`

## What changed

- Backend support reports now include generated-media diagnostics under `generatedMedia.diagnostics`.
- The included diagnostics expose the same production smoke plan used by Generated Media settings:
  - safe diagnostics
  - chat image generation
  - Walrus public upload
  - Sui wallet mint
  - Sui Kiosk listing
- The support report keeps the generated-media contract non-custodial:
  - no image generation during report creation
  - no public media upload
  - no wallet signing
  - no transaction submission
  - no raw OpenAI key, Walrus bearer token, bearer token, host token, or Authorization header in the exported JSON

## Files changed

- `packages/types/src/backend-support-report.ts`
- `apps/server/src/backend-support-report.ts`
- `apps/server/src/backend-control-plane.e2e.test.ts`

## Verification

- `bun test apps/server/src/backend-control-plane.e2e.test.ts`
- `bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-nft-capabilities.test.ts`
- `npm exec --package pnpm@10.27.0 -- pnpm --filter matterhorn-work-server typecheck`
- `npm exec --package pnpm@10.27.0 -- pnpm --filter @matterhorn-work/app typecheck`
- `node scripts/product-readiness-smoke.test.mjs && node scripts/generated-media-flow-smoke.test.mjs && node scripts/generated-media-browser-smoke.test.mjs`
- `bun test apps/app/tests/`
- `bun test apps/server/src/`

Final broad results:

- App tests: 356 pass, 0 fail.
- Server tests: 586 pass, 0 fail.

## Notes

- The support-report route performs only safe diagnostics. If Walrus endpoints are configured, it may issue `OPTIONS` and `HEAD` probes, but never `PUT`/`POST` upload calls.
- Production smoke can still only become a true production candidate when OpenAI image generation, Walrus, Sui NFT package, and Kiosk/TransferPolicy setup all pass.
- Real public upload and wallet-signed Sui actions remain explicit user actions outside support-report generation.
