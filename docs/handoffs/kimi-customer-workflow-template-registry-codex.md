# Handoff: Customer Workflow Template Registry

**From:** Kimi  
**To:** Codex  
**Branch:** `kimi/customer-workflow-template-registry`  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/436  
**Status:** Opened, all local gates passing, awaiting CI/review.

## What I was asked to do

Continue the Customer Workflow Template Registry PR: add a canonical, typed, customer-facing set of workflow templates that chat UI / MCP / CLI can discover without custom code, while keeping the same safety contract as the existing generic workflow layer.

## What I did

1. **Extended the typed contract** in `packages/types/src/matterhorn-workflows.ts`:
   - Added `MatterhornCustomerWorkflowStatus` (`beta_ready`, `preview_only`, `planned_not_live`, `workflow_ready`, `blank`).
   - Added `MatterhornCustomerWorkflowTemplate` interface.
   - Added six customer template fixtures and `MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY`.
   - Added `serviceHooks` to the existing `MatterhornWorkflowTemplate` interface so both registries share hook metadata.

2. **Added the registry CLI** `scripts/matterhorn-workflow-template-registry.mjs`:
   - Thin wrapper over `scripts/matterhorn-workflow-catalog.mjs`.
   - Emits `matterhorn.customer.workflow.template.v1` JSON.
   - Supports `--category`, `--status`, `--customer-template`, and rejects credential-shaped flags.

3. **Updated `scripts/matterhorn-workflow-catalog.mjs`**:
   - Added `CUSTOMER_TEMPLATES` array with six templates.
   - Added `--customer-templates` and `--customer-template <id>` filters.
   - Added `serviceHooks` to every customer template (blank uses `[]`).
   - Customer catalog envelope includes counts by category/status and safety flags.

4. **Added tests**:
   - `scripts/matterhorn-customer-workflow-template-registry.test.mjs` — runtime gate for the registry script.
   - Extended `scripts/matterhorn-workflow-catalog.test.mjs` to assert `customerTemplates` array and per-template safety boundaries.

5. **Updated docs**:
   - `docs/matterhorn-workflow-contract.md` — added Customer Workflow Template Registry section with schema, template table, and commands.
   - `docs/handoffs/kimi-matterhorn-workflow-contract.md` — added PR #436 section.
   - `package.json` — added `test:matterhorn-customer-workflow-template-registry`.

## Files changed in the PR

| File | Change |
| --- | --- |
| `packages/types/src/matterhorn-workflows.ts` | New customer template types, statuses, six fixtures, and registry constant. |
| `scripts/matterhorn-workflow-template-registry.mjs` | New CLI entry point (customer template catalog). |
| `scripts/matterhorn-customer-workflow-template-registry.test.mjs` | New runtime test. |
| `scripts/matterhorn-workflow-catalog.mjs` | Added `CUSTOMER_TEMPLATES`, filters, and `serviceHooks`. |
| `scripts/matterhorn-workflow-catalog.test.mjs` | Added customer template safety assertions. |
| `docs/matterhorn-workflow-contract.md` | Added customer registry documentation. |
| `docs/handoffs/kimi-matterhorn-workflow-contract.md` | Added PR #436 notes. |
| `package.json` | Added `test:matterhorn-customer-workflow-template-registry`. |

## Verification commands (all passing locally)

```bash
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:matterhorn-workflow-catalog
```

## How to inspect the output

```bash
# Full customer template catalog
node scripts/matterhorn-workflow-template-registry.mjs --json

# Filter by category
node scripts/matterhorn-workflow-template-registry.mjs --category markets --json

# Single template
node scripts/matterhorn-workflow-template-registry.mjs --customer-template bittensor_operator --json
```

## Safety design notes

- Every customer template keeps the baseline boundary: `liveExecutionEnabled: false`, `canSubmit: false`, `allowsRealFunds: false`, and all secret-acceptance flags `false`.
- `bittensor_operator` is the only template with `canExecute: true`, and only for preparing external-signer handoffs (`requiresExternalSigner: true`).
- Market templates (`hyperliquid_trader`, `polymarket_researcher`) are `preview_only` and non-executing.
- Wellness/decentralized-services templates are non-executing with all service hooks `planned_not_live`.
- Blank chat template has no hooks, artifacts, or context.
- The registry script rejects credential-shaped flags like `--private-key`.

## What I did NOT touch

- No live provider execution, signing, submission, custody, or secrets handling.
- No changes to `apps/desktop/**`, `apps/app/src/react-app/**`, `apps/server/src/server.ts`, `packages/matterhorn-work-mcp/index.mjs`, or the wellness-creator helper scripts.
- The untracked `docs/ui/` directory was left out of the commit.

## Known follow-ups / where you may want to pick up

- If CI fails, the most likely culprits are TypeScript strictness in `packages/types` or linting on the new `.mjs` test files. Re-run `pnpm --dir packages/types build` and `pnpm test:matterhorn-customer-workflow-template-registry`.
- The catalog script duplicates customer template data that also lives in `packages/types/src/matterhorn-workflows.ts`. A future refactor could import from the built types package instead of maintaining two copies.
- Consider wiring the registry into the MCP / CLI `workflows` commands if the product wants `matterhorn-work workflows customer-templates`.

## PR link

https://github.com/matterhornso/matterhorn-work/pull/436
