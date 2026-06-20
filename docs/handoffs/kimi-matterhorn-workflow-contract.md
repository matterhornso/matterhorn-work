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

## PR #420: Workflow Evidence Bundle Operator Helper

**PR:** https://github.com/matterhornso/matterhorn-work/pull/420  
**Branch:** `kimi/workflow-evidence-bundle-operator-helper`  
**Scope:** Command-line helper that makes workflow evidence bundles operator-usable without running the app or touching providers.

### New files

| File | What it contains |
| --- | --- |
| `scripts/matterhorn-workflow-evidence-bundles.mjs` | Operator helper: list, show, export public evidence bundles, optional SHA-256 checksum, rejects credential-shaped flags. |
| `scripts/matterhorn-workflow-evidence-bundles.test.mjs` | Static/runtime gate for the helper. |

### Modified files

| File | What changed |
| --- | --- |
| `package.json` | Added `test:matterhorn-workflow-evidence-bundles`, `workflow:evidence:list`, `workflow:evidence:show`, `workflow:evidence:export`. |
| `docs/matterhorn-workflow-contract.md` | Added Operator Evidence Export section. |

### Helper commands

```bash
pnpm workflow:evidence:list
pnpm workflow:evidence:show decentralized_services_plan
pnpm workflow:evidence:export /tmp/evidence-bundles.json --checksum
pnpm test:matterhorn-workflow-evidence-bundles
```

### Test assertions

`scripts/matterhorn-workflow-evidence-bundles.test.mjs` verifies:

- Package scripts are exposed.
- Helper fixture IDs match the typed registry in `packages/types/src/matterhorn-workflows.ts`.
- `--list` returns all five bundle IDs.
- `--id <bundle-id>` returns a bundle with `canExecute: false` and no credential-shaped values.
- `--export <path> --checksum` writes a public-only JSON file and a valid SHA-256 checksum.
- Exported bundles contain only `public: true` evidence items.
- Credential-shaped flags such as `--private-key` are rejected.
- Helper source contains no submit/sign/live execution patterns.

### Commands that pass on PR #420

```bash
pnpm test:matterhorn-workflow-contract
pnpm test:market-execution-safety-gate
pnpm --dir packages/types build
pnpm test:matterhorn-workflow-evidence-bundles
```

### CI status on PR #420

All GitHub checks on PR #420 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## PR #423: Matterhorn Workflow Template Registry

**PR:** https://github.com/matterhornso/matterhorn-work/pull/423  
**Branch:** `kimi/workflow-template-registry-contract`  
**Scope:** Reusable workflow template registry so agents can choose a template from user intent without custom UI or live provider execution.

### New types added

In `packages/types/src/matterhorn-workflows.ts`:

- `MatterhornWorkflowTemplate`
- `MatterhornWorkflowTemplateSafetyBoundary`
- `DEFAULT_MATTERHORN_WORKFLOW_TEMPLATE_SAFETY_BOUNDARY`
- `WELLNESS_CREATOR_SERVICE_WORKFLOW_TEMPLATE`
- `BITTENSOR_BETA_OPERATOR_WORKFLOW_TEMPLATE`
- `HYPERLIQUID_PREVIEW_WORKFLOW_TEMPLATE`
- `POLYMARKET_PREVIEW_WORKFLOW_TEMPLATE`
- `DECENTRALIZED_SERVICES_FUTURE_WORKFLOW_TEMPLATE`
- `MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY`

### Template fixture summary

| Template ID | Category | Status | `canExecute` | Notes |
| --- | --- | --- | --- | --- |
| `wellness_creator_service_workflow` | wellness | `planned_not_live` | `false` | Trainers, instructors, dieticians |
| `bittensor_beta_operator_workflow` | bittensor | `live_local` | `true` | Requires external signer |
| `hyperliquid_preview_workflow` | markets | `preview_only` | `false` | Read-only previews |
| `polymarket_preview_workflow` | markets | `preview_only` | `false` | Read-only previews |
| `decentralized_services_future_workflow` | decentralized_services | `planned_not_live` | `false` | Future-contract planning |

Every template sets `liveExecutionEnabled: false`, `canSubmit: false`, `allowsRealFunds: false`, and all secret acceptance flags to `false`.

### Test assertions

`scripts/matterhorn-workflow-template-registry.test.mjs` verifies:

- Required types and constants exist.
- All five template fixture constants exist.
- Every template has prompt starters and safety boundaries.
- No template asks for private keys, seed phrases, API secrets, raw signatures, signed payloads, wallet exports, passwords, passphrases, keyfiles, SURI, or real funds.
- Market templates remain `preview_only` with `canExecute: false`.
- Decentralized services template remains `planned_not_live` with all service hooks `planned_not_live`.
- All templates set `liveExecutionEnabled: false` and `canSubmit: false`.
- Registry covers all five template IDs.
- Doc coverage includes all required types and template IDs.

### Commands that pass on PR #423

```bash
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-workflow-template-registry
```

### CI status on PR #423

All GitHub checks on PR #423 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## PR #436: Customer Workflow Template Registry

**PR:** https://github.com/matterhornso/matterhorn-work/pull/436  
**Branch:** `kimi/customer-workflow-template-registry`  
**Scope:** Customer-facing workflow template registry for chat-first goal selection. Extends the generic workflow contract with copy-paste prompts, promises, expected artifacts, forbidden inputs, handoff/receipt support, and service hook metadata.

### New files

| File | What it contains |
| --- | --- |
| `scripts/matterhorn-workflow-template-registry.mjs` | Thin CLI entry point that emits the canonical customer template catalog from `matterhorn-workflow-catalog.mjs`. |
| `scripts/matterhorn-customer-workflow-template-registry.test.mjs` | Runtime gate for the customer template registry: envelope shape, safety boundaries, filtering, and credential-flag rejection. |

### Modified files

| File | What changed |
| --- | --- |
| `packages/types/src/matterhorn-workflows.ts` | Added `MatterhornCustomerWorkflowTemplate`, `MatterhornCustomerWorkflowStatus`, six customer template fixtures, and `MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY`. Added `serviceHooks` to existing `MatterhornWorkflowTemplate` interface. |
| `scripts/matterhorn-workflow-catalog.mjs` | Added `CUSTOMER_TEMPLATES` with six customer-facing templates, `--customer-templates` / `--customer-template` filtering, and `serviceHooks` on each template. |
| `scripts/matterhorn-workflow-catalog.test.mjs` | Extended to assert `customerTemplates` array and per-template safety boundaries. |
| `docs/matterhorn-workflow-contract.md` | Added Customer Workflow Template Registry section with schema, built-in template table, and CLI commands. |
| `package.json` | Added `test:matterhorn-customer-workflow-template-registry` script. |

### Customer template fixture summary

| Template ID | Category | Status | `canExecute` | Notes |
| --- | --- | --- | --- | --- |
| `bittensor_operator` | bittensor | `beta_ready` | `true` | External-signer handoffs only; no custody. |
| `hyperliquid_trader` | markets | `preview_only` | `false` | Read-only previews. |
| `polymarket_researcher` | markets | `preview_only` | `false` | Read-only previews. |
| `wellness_creator_workflow` | wellness | `workflow_ready` | `false` | Service planning; hooks remain planned_not_live. |
| `decentralized_services_operator` | decentralized_services | `planned_not_live` | `false` | Future-contract planning only. |
| `blank_chat_workflow` | future | `blank` | `false` | Open-ended chat baseline. |

Every customer template sets `liveExecutionEnabled: false`, `canSubmit: false`, `allowsRealFunds: false`, and all secret acceptance flags to `false`. Bittensor is the only template with `canExecute: true`, and it requires an external signer.

### Test assertions

`scripts/matterhorn-customer-workflow-template-registry.test.mjs` verifies:

- Required customer template types and the typed registry exist.
- The registry script emits `matterhorn.customer.workflow.template.v1` with `catalog_only` status and safety flags.
- All six expected customer template IDs are present in order.
- Every template has example prompts, expected artifacts, required/optional context, forbidden inputs, service hooks, and safety boundaries.
- Baseline safety boundaries reject secrets, private keys, API secrets, raw signatures, real funds, live execution, and submission.
- Bittensor is `beta_ready`, `canExecute: true`, and requires an external signer with a `live_local` bittensor hook.
- Market templates are `preview_only`, non-executing, and have `preview_only` service hooks.
- Wellness and decentralized-services templates are non-executing and all service hooks are `planned_not_live`.
- Blank chat template has no artifacts, context, or service hooks.
- `--category` and `--customer-template` filters work.
- Credential-shaped flags such as `--private-key` are rejected.

`scripts/matterhorn-workflow-catalog.test.mjs` additionally verifies that the main catalog JSON includes `customerTemplates` with six entries and the same safety baseline.

### Commands that pass on PR #436

```bash
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:matterhorn-workflow-catalog
```

### CI status on PR #436

Pending merge.

## PR #TBD: Customer Template Launch Metadata

**PR:** TBD — opened from `kimi/customer-template-launch-metadata` to `dev`  
**Branch:** `kimi/customer-template-launch-metadata`  
**Scope:** Adds launch, UI, and routing metadata to every customer workflow template so the UI and agents can launch templates consistently without touching runtime bridge files or wellness workflow internals.

### Modified files

| File | What changed |
| --- | --- |
| `packages/types/src/matterhorn-workflows.ts` | Added `MatterhornCustomerWorkflowLaunchMetadata`, `MatterhornCustomerWorkflowUiMetadata`, `MatterhornCustomerWorkflowRoutingMetadata`, and supporting union constants. Added `launch`, `ui`, and `routing` blocks to each customer template fixture. |
| `scripts/matterhorn-workflow-catalog.mjs` | Mirrored the new `launch`/`ui`/`routing` metadata in `CUSTOMER_TEMPLATES` so the registry CLI emits it. |
| `scripts/matterhorn-customer-workflow-template-registry.test.mjs` | Added assertions for launch/UI/routing fields, defaultPrompt safety, preview-only wording on market templates, and wellness non-medical safety. |
| `docs/matterhorn-workflow-contract.md` | Updated the customer registry schema and built-in template table to document launch/UI/routing fields. |

### Launch metadata design

| Template ID | `recommendedSurface` | `opensPanel` | `routing.chatMode` | `startsSession` |
| --- | --- | --- | --- | --- |
| `bittensor_operator` | `protocol_desk` | `bittensor` | `bittensor` | `true` |
| `hyperliquid_trader` | `protocol_desk` | `hyperliquid` | `hyperliquid` | `true` |
| `polymarket_researcher` | `protocol_desk` | `polymarket` | `polymarket` | `true` |
| `wellness_creator_workflow` | `workflow_chat` | — | `wellness` | `true` |
| `decentralized_services_operator` | `future_service` | — | `services` | `true` |
| `blank_chat_workflow` | `workflow_chat` | — | `general` | `true` |

### Safety rules enforced in tests

- Every template has `launch.defaultPrompt` and `routing.startsSession: true`.
- No `defaultPrompt` or `handoffContextLabel` asks for private keys, seed phrases, mnemonics, API secrets, raw signatures, signed payloads, signed orders, or wallet exports.
- Market templates include preview-only wording (`preview`, `read-only`, `no live submission`, or `can submit: no`).
- Wellness template includes non-medical/educational safety wording.
- `ui.shortDescription` is `<= 90` characters.
- All existing baseline safety boundaries remain unchanged.

### Commands that pass on PR #TBD

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-workflow-catalog
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:market-execution-safety-gate
```

### CI status on PR #TBD

Pending merge.

## Non-overlap observed

No changes were made to:

- `docs/wellness-creator-workflow.md`
- `docs/handoffs/hermes-wellness-creator-qa.md`
- `scripts/wellness-creator-workflow.mjs`
- `scripts/wellness-creator-workflow.test.mjs`
- `apps/desktop/**`
- `apps/app/src/react-app/**`
- `scripts/electron-*.mjs`
- `scripts/desktop-beta-*.mjs`
- `docs/desktop-beta-first-run.md`
- `apps/server/src/server.ts`
- `packages/matterhorn-work-mcp/index.mjs`
- `apps/orchestrator/src/cli.ts`
- stale PR #2

## Useful references

- Contract doc: `docs/matterhorn-workflow-contract.md`
- Types: `packages/types/src/matterhorn-workflows.ts`
- Test: `scripts/matterhorn-workflow-contract.test.mjs`
- Decentralized services contract: `docs/decentralized-services-capability-contract.md`
