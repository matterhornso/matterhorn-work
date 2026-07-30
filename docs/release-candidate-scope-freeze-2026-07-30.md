# Matterhorn Desks Release Candidate Scope Freeze

**Frozen on:** 2026-07-30
**Branch:** `codex/public-launch-acceptance-rc4`
**Baseline commit:** `68d7ca770767608e10dd0e7c14ab912c9b34ee44`
**Release priority:** Web first, unsigned macOS public-beta artifact second

## Release Scope

This candidate is limited to hardening functionality already visible in the
public-beta product. No new desk, protocol, connector, or autonomous execution
surface is included.

### Hosted account and model readiness

- Keep fresh hosted accounts inside their organization-owned workspace.
- Prevent desk tasks from starting without an available model.
- Route users to model settings when provider setup is required.
- Keep provider and command-palette copy aligned with the deployed runtime.
- Verify these behaviors in UI contract and live browser acceptance tests.

### Connected-wallet execution safety

- Keep Polymarket agent and server tools read/preview only.
- Permit the separate browser-wallet BUY ticket only after exact review,
  allowed compliance, supported wallet and chain checks, typed confirmation,
  preview freshness validation, and temporary credential cleanup.
- Preserve Hyperliquid, Bittensor, Sui, and Polymarket non-custodial boundaries.
- Keep execution documentation and static safety gates synchronized with the
  implemented behavior.

### Browser acceptance hardening

- Separate local fixture-workspace smoke coverage from fresh hosted-account
  certification.
- Reject silent workspace-route drift.
- Exercise the current model-required desk state and responsive chat controls.
- Keep the canonical local acceptance workspace at `ws_9d76fd6566f5`.

### Bittensor account isolation

- Scope chat-created watches and chat context to the authenticated account.
- Prevent another account from guessing or reading a Bittensor chat context.
- Remove internal owner-scope metadata from API and card payloads.
- Cover cross-account watch and context behavior with end-to-end auth tests.

## Release-Owned Paths

### Application

- `apps/app/src/app/lib/matterhorn-server.ts`
- `apps/app/src/react-app/domains/session/chat/session-page.tsx`
- `apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts`
- `apps/app/src/react-app/domains/settings/pages/ai-view.tsx`
- `apps/app/src/react-app/domains/wallet/polymarket-execution.ts`
- `apps/app/src/react-app/shell/session-route.tsx`
- `apps/app/tests/ai-provider-ui-contract.test.ts`
- `apps/app/tests/command-palette-contract.test.ts`
- `apps/app/tests/polymarket-execution.test.ts`
- `apps/app/tests/workflow-stage-card.test.ts`

### Server

- `apps/server/src/auth.e2e.test.ts`
- `apps/server/src/server.ts`
- `apps/server/src/tools/bittensor.ts`

### Safety, acceptance, and documentation

- `docs/market-execution-readiness-security-gate.md`
- `docs/polymarket-read-preview.md`
- `package.json`
- `scripts/market-execution-safety-gate.test.mjs`
- `scripts/matterhorn-full-platform-browser-audit.mjs`
- `scripts/matterhorn-full-platform-browser-audit.test.mjs`
- `scripts/matterhorn-product-browser-smoke.mjs`
- `scripts/matterhorn-product-browser-smoke.test.mjs`
- `scripts/rc16-control-acceptance.mjs`

## Explicitly Preserved And Excluded

The following local or generated paths are intentionally not part of the
release commit and must not be deleted:

- `.matterhorn-work/`
- `notes/`
- `outputs/`
- generated `qa-reports/` directories and fixtures
- parallel-agent handoffs, scratch files, duplicate smoke evidence, and local
  workspace state

## Candidate Gates

The release-owned paths may be committed only after all of the following pass:

1. `git diff --check`
2. source secret-pattern scan
3. locked dependency vulnerability audit
4. complete app and server test suites
5. app, server, and Electron TypeScript checks
6. production web, server, and desktop builds
7. Matterhorn platform safety gate
8. live customer-flow browser acceptance

The stable public-beta tag is created only after the exact committed source
passes the complete certification without source drift.
