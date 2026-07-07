# Codex Handoff: Product Readiness Smoke

Date: 2026-07-08
Branch: `codex/product-readiness-smoke`
Base: `origin/dev` at `f9923883` (`Add generated media browser smoke`)

## What Changed

Added a backend/product readiness smoke harness:

- `scripts/product-readiness-smoke.mjs`
- `scripts/product-readiness-smoke.test.mjs`
- package scripts:
  - `pnpm smoke:product-readiness`
  - `pnpm test:product-readiness-smoke`

The smoke checks the backend/product spine against a running Matterhorn server:

1. active workspace resolution
2. backend capabilities
3. workspace readiness
4. workspace control plane
5. redacted backend support report
6. data map
7. data controls
8. local team access summary
9. project data ledger
10. redacted data ledger export
11. generated media history
12. optional generated media flow: image generation, Walrus upload, Sui mint receipt, and Sui Kiosk listing receipt

Default strict package command includes the generated media flow. It is intended to run after starting:

```bash
pnpm dev:generated-media-smoke
pnpm smoke:product-readiness
```

For static/CI contract checks:

```bash
pnpm test:product-readiness-smoke
```

## Security Fix Found While Testing

The first live smoke run found that `/workspace/:id/generated-media/history` could surface stale on-disk generated-image prompt metadata containing `sk-proj-...` shaped API keys.

Fix:

- `apps/server/src/image-generation-provider.ts`
  - widened image prompt secret detection from `sk-[a-zA-Z0-9]{20,}` to `sk-[a-zA-Z0-9_-]{20,}`.
- `apps/server/src/generated-media-routes.ts`
  - widened generated-media sensitive input detection the same way.
  - redacts stale secret-shaped generated-image `prompt` and `promptRevised` fields in:
    - `GET /workspace/:id/images`
    - `GET /workspace/:id/generated-media/history`
  - marks redacted image metadata with `promptRedacted: true` and `safety.secretsRejected: true`.
- `apps/server/src/generated-media-routes.e2e.test.ts`
  - added regression coverage for stale prompt metadata redaction.
  - added regression coverage for modern `sk-proj-...` prompt rejection.

This preserves public Sui object/package ids in NFT receipts while preventing old prompt metadata from leaking provider keys.

## Verification

Static:

```bash
node scripts/product-readiness-smoke.test.mjs
node scripts/product-readiness-smoke.mjs --dry-run --include-generated-media-flow --json
```

Result: pass.

Focused server:

```bash
bun test apps/server/src/generated-media-routes.e2e.test.ts apps/server/src/image-generation-provider.test.ts
```

Result: 30 pass, 0 fail.

Typecheck:

```bash
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
```

Result: pass.

Live product smoke:

```bash
MATTERHORN_MEDIA_SMOKE_SERVER_PORT=4168 MATTERHORN_MEDIA_SMOKE_APP_PORT=5208 node scripts/dev-generated-media-smoke.mjs
node scripts/product-readiness-smoke.mjs --server-url http://127.0.0.1:4168 --token matterhorn-media-smoke-client-token --strict --include-generated-media-flow --json-output /tmp/matterhorn-product-readiness-smoke.json
```

Result: pass.

Report:

```text
Matterhorn product-readiness smoke: PASS
- PASS workspace.resolve
- PASS backend.capabilities
- PASS workspace.readiness
- PASS backend.control_plane
- PASS backend.support_report
- PASS backend.data_map
- PASS backend.data_controls
- PASS team.access_summary
- PASS ledger.project
- PASS ledger.export
- PASS generated_media.history
- PASS generated_media.flow
```

JSON report:

```text
/tmp/matterhorn-product-readiness-smoke.json
```

## Boundaries

- This is not a full browser UX sweep.
- The generated-media flow still uses the local fake Walrus/Sui smoke environment unless real environment values are provided.
- Sui mint/listing remain wallet-preview/receipt paths; Matterhorn still does not custody keys, sign, or live-submit.
- The protected scratch paths remain untouched:
  - `.matterhorn-work/`
  - `.opencode/agents/matterhorn-sui.md`
