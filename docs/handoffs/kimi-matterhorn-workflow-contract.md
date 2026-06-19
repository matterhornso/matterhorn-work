# Handoff: Generic Matterhorn Workflow Contract

**Owner:** Kimi (coding agent)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/406  
**Branch:** `kimi/workflow-contract-generic-layer`  
**Base:** `dev`  
**Scope:** Generic, reusable workflow contract layer for wellness, Web3, Bittensor, markets, decentralized services, and future vertical workflows. Contract/test/doc work only. No live provider execution, signing, submission, custody, or secrets.

## What was built

### New files

| File | What it contains |
| --- | --- |
| `packages/types/src/matterhorn-workflows.ts` | TypeScript schemas, constants, and fixture manifests for the workflow contract. |
| `docs/matterhorn-workflow-contract.md` | Contract doc describing the shared schema, fixture manifests, safety rules, and verification commands. |
| `scripts/matterhorn-workflow-contract.test.mjs` | Static test that verifies the contract types, fixture coverage, safety policies, and absence of credential-shaped material. |

### Modified files

| File | What changed |
| --- | --- |
| `packages/types/src/index.ts` | Added `export * from "./matterhorn-workflows"`. |
| `packages/types/package.json` | Added `./matterhorn-workflows` export entry. |
| `package.json` | Added script `test:matterhorn-workflow-contract: "node scripts/matterhorn-workflow-contract.test.mjs"`. |

## Contract types

Defined in `packages/types/src/matterhorn-workflows.ts`:

- `MatterhornWorkflowManifest`
- `MatterhornWorkflowStep`
- `MatterhornWorkflowArtifact`
- `MatterhornWorkflowServiceHook`
- `MatterhornWorkflowSafetyPolicy`
- `MatterhornWorkflowQAContract`
- `MatterhornWorkflowStatus`
- `MatterhornWorkflowServiceHookType`

Registries:

- `MATTERHORN_WORKFLOW_STATUSES` — `live_local`, `planned_not_live`, `preview_only`, `external_handoff_required`, `blocked_by_policy`
- `MATTERHORN_WORKFLOW_CATEGORIES` — `wellness`, `web3`, `bittensor`, `markets`, `decentralized_services`, `future`
- `MATTERHORN_WORKFLOW_SERVICE_HOOK_TYPES` — `hosting`, `storage`, `email`, `payments`, `identity`, `bittensor`, `hyperliquid`, `polymarket`

## Fixture manifests

| Constant | Workflow ID | Category | Status | Notes |
| --- | --- | --- | --- | --- |
| `WELLNESS_CREATOR_SERVICES_WORKFLOW` | `wellness_creator_services` | `wellness` | `planned_not_live` | Plans services/content; all service hooks planned_not_live. |
| `BITTENSOR_OPERATOR_WORKFLOW` | `bittensor_operator` | `bittensor` | `live_local` | Read-only previews + external-signer handoffs; `canExecute: true`, `requiresExternalSigner: true`. |
| `MARKET_READ_PREVIEW_WORKFLOW` | `market_read_preview` | `markets` | `preview_only` | Read-only Hyperliquid/Polymarket previews. |
| `DECENTRALIZED_SERVICES_PLANNER_WORKFLOW` | `decentralized_services_planner` | `decentralized_services` | `planned_not_live` | Plans future hosting/storage/email/payments/identity actions. |

Registry: `MATTERHORN_WORKFLOW_FIXTURES` maps all four workflow IDs to their manifests.

## Safety defaults

`DEFAULT_MATTERHORN_WORKFLOW_SAFETY_POLICY`:

```ts
{
  canExecute: false,
  liveExecutionEnabled: false,
  canSubmit: false,
  acceptsSecrets: false,
  acceptsPrivateKeys: false,
  acceptsRawSignatures: false,
  acceptsApiSecrets: false,
  requiresExternalSigner: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
}
```

Every fixture explicitly sets `liveExecutionEnabled: false` and `canSubmit: false`. No fixture accepts secrets, private keys, raw signatures, or API secrets.

## Static test assertions

`scripts/matterhorn-workflow-contract.test.mjs` verifies:

- Types package exports `./matterhorn-workflows` and root package exposes the test script.
- All required contract types and constants exist.
- All four fixture manifest constants exist.
- Every fixture has at least one input prompt, one artifact, one service hook, and a non-empty QA checklist.
- No fixture accepts secrets (`acceptsSecrets`, `acceptsPrivateKeys`, `acceptsRawSignatures`, `acceptsApiSecrets` are never `true`).
- All fixtures disable live execution and submission.
- Market fixture remains `preview_only` with `canExecute: false`.
- Service hooks in non-live workflows are not marked `live_local`.
- No submit route, sign route, or live provider route is implied.
- Doc coverage includes all required types and fixture IDs.

## Commands that pass on this PR

```bash
pnpm test:matterhorn-workflow-contract
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
```

## CI status

Awaiting CI results on PR #406.

## Non-overlap observed

No changes were made to:

- `docs/wellness-creator-workflow.md`
- `docs/handoffs/hermes-wellness-creator-qa.md`
- `scripts/wellness-creator-workflow.mjs`
- `scripts/wellness-creator-workflow.test.mjs`
- `apps/server/src/server.ts`
- `packages/matterhorn-work-mcp/index.mjs`
- `apps/orchestrator/src/cli.ts`
- stale PR #2

## Useful references

- Contract doc: `docs/matterhorn-workflow-contract.md`
- Types: `packages/types/src/matterhorn-workflows.ts`
- Test: `scripts/matterhorn-workflow-contract.test.mjs`
- Decentralized services contract: `docs/decentralized-services-capability-contract.md`
