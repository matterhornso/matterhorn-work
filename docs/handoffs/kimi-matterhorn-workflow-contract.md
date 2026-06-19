# Handoff: Generic Matterhorn Workflow Contract

**Owner:** Kimi (coding agent)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/406  
**Branch merged to dev:** `kimi/workflow-contract-generic-layer`  
**Merge commit:** `2798467e`  
**Merged at:** 2026-06-19T16:17:12Z  
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

## CI status on merge

All GitHub checks on PR #406 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## PR #415: generic workflow evidence bundle contract

**PR:** https://github.com/matterhornso/matterhorn-work/pull/415  
**Branch merged to dev:** `kimi/workflow-evidence-bundle-contract`  
**Scope:** Generic, customer-safe evidence bundles that capture workflow inputs, planned service hooks, and safety flags across wellness, crypto, decentralized services, research, and content domains.

### New types added

In `packages/types/src/matterhorn-workflows.ts`:

- `MatterhornWorkflowEvidenceItem`
- `MatterhornWorkflowEvidenceBundle`
- `WELLNESS_CUSTOMER_INTAKE_EVIDENCE_BUNDLE`
- `CRYPTO_STAKING_DECISION_EVIDENCE_BUNDLE`
- `DECENTRALIZED_SERVICES_PLAN_EVIDENCE_BUNDLE`
- `RESEARCH_SUMMARY_EVIDENCE_BUNDLE`
- `CONTENT_PUBLISH_PLAN_EVIDENCE_BUNDLE`
- `MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES` — a record mapping each bundle ID to its bundle

Each evidence bundle:

- Uses `version: "matterhorn.workflow.evidence-bundle.v1"`.
- Sets `canExecute: false`.
- Includes `workflowId`, `domain`, `requestedOutcome`, `publicEvidence`, `plannedServiceHooks`, `safetyFlags`, `createdAt`, and `source`.
- Contains no secrets, private keys, API secrets, raw signatures, signed payloads, wallet exports, passwords, passphrases, keyfiles, or SURI.
- Contains no executable provider payloads.

### Doc updates

`docs/matterhorn-workflow-contract.md` gained an Evidence Bundle schema section and an Evidence Bundle Fixtures table.

### Test extensions

`scripts/matterhorn-workflow-contract.test.mjs` was extended to assert:

- `MatterhornWorkflowEvidenceItem`, `MatterhornWorkflowEvidenceBundle`, and `MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES` exist.
- All five evidence bundle fixture constants exist.
- Each bundle block uses the evidence bundle version and includes `workflowId`, `domain`, `requestedOutcome`, at least one `publicEvidence` item, at least one `plannedServiceHook`, `safetyFlags`, `createdAt`, and `source`.
- Every bundle sets `canExecute: false`.
- No bundle contains credential-shaped values.
- The evidence bundle registry covers all five bundle IDs.

### Commands that pass on PR #415

```bash
pnpm test:decentralized-services-contract
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
pnpm --dir packages/types build
```

### CI status on PR #415

All GitHub checks on PR #415 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## Non-overlap observed

No changes were made to:

- `docs/wellness-creator-workflow.md`
- `docs/handoffs/hermes-wellness-creator-qa.md`
- `scripts/wellness-creator-workflow.mjs`
- `scripts/wellness-creator-workflow.test.mjs`
- `apps/desktop/**`
- `apps/desktop/package.json`
- `apps/desktop/scripts/electron-after-pack.cjs`
- `scripts/electron-packaging-sources.test.mjs`
- `apps/server/src/server.ts`
- `packages/matterhorn-work-mcp/index.mjs`
- `apps/orchestrator/src/cli.ts`
- stale PR #2

## Useful references

- Contract doc: `docs/matterhorn-workflow-contract.md`
- Types: `packages/types/src/matterhorn-workflows.ts`
- Test: `scripts/matterhorn-workflow-contract.test.mjs`
- Decentralized services contract: `docs/decentralized-services-capability-contract.md`
