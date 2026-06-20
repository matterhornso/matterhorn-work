# Handoff: Workflow Evidence Bundle Consistency

**Owner:** Kimi (coding agent)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/427  
**Branch merged to dev:** `kimi/workflow-evidence-bundle-consistency`  
**Merge commit:** `8e984d02`  
**Merged at:** 2026-06-20T03:20:35Z  
**Scope:** Extend the generic Matterhorn workflow evidence bundle contract so wellness, crypto (Bittensor), market previews (Hyperliquid, Polymarket), and decentralized services all produce comparable, customer-safe evidence. No live provider execution, signing, submission, custody, or secrets.

## What was built

### Modified files

| File | What changed |
| --- | --- |
| `packages/types/src/matterhorn-workflows.ts` | Extended `MatterhornWorkflowEvidenceBundle` and replaced the five evidence fixtures with workflow-scoped, public/redacted-only bundles. Linked bundle IDs into template `evidenceBundleIds`. |
| `scripts/matterhorn-workflow-evidence-bundles.mjs` | Updated fixtures, added canonical SHA-256 hash helper, kept list/show/export/checksum commands. |
| `scripts/matterhorn-workflow-evidence-bundles.test.mjs` | Validates new fields, public/redacted-only evidence, and evidence hash integrity. |
| `scripts/matterhorn-workflow-contract.test.mjs` | Validates new evidence bundle IDs and required fields. |
| `docs/matterhorn-workflow-contract.md` | Updated schema, fixtures table, safety rules, and added customer-pilot / Hermes QA section. |

## Contract changes

### Extended `MatterhornWorkflowEvidenceBundle`

```ts
interface MatterhornWorkflowEvidenceBundle {
  version: "matterhorn.workflow.evidence-bundle.v1";
  workflowId: string;
  domain: string;
  requestedOutcome: string;
  inputPrompt: string;
  generatedArtifactType: string;
  safetyStatus: MatterhornWorkflowStatus;
  liveExecutionEnabled: false;
  acceptsCustody: false;
  acceptsSigning: false;
  acceptsSecrets: false;
  publicEvidence: MatterhornWorkflowEvidenceItem[];
  plannedServiceHooks: MatterhornWorkflowServiceHook[];
  safetyFlags: string[];
  createdAt: string;
  source: "operator" | "agent" | "customer" | "system";
  status: MatterhornWorkflowStatus;
  canExecute: false;
  evidenceHash: string;
}
```

`safetyStatus` mirrors `status` and is explicit for handoff/QA readability.

### Evidence fixtures

Replaced the previous five bundles (`wellness_customer_intake`, `crypto_staking_decision`, `decentralized_services_plan`, `research_summary`, `content_publish_plan`) with five bundles scoped to the built-in workflow/templates:

| Bundle ID | Workflow | Domain | Status | Generated artifact | Notes |
| --- | --- | --- | --- | --- | --- |
| `wellness_creator_workflow` | `wellness_creator_services` | wellness | `planned_not_live` | `service_plan` | Customer goal redacted; service tier/delivery public. |
| `bittensor_beta_workflow` | `bittensor_operator` | bittensor | `external_handoff_required` | `stake_preview` | Public wallet stub, subnet, external-signer flag. |
| `hyperliquid_preview_workflow` | `market_read_preview` | hyperliquid | `preview_only` | `market_preview` | Read-only preview; no submission/signing. |
| `polymarket_preview_workflow` | `market_read_preview` | polymarket | `preview_only` | `market_preview` | Read-only preview; no submission/signing. |
| `decentralized_services_planned_workflow` | `decentralized_services_planner` | decentralized_services | `planned_not_live` | `service_preview` | Future-contract storage plan. |

Registry: `MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES` maps all five bundle IDs.

### Public/redacted-only rule

- Every `publicEvidence` item is `public: true`.
- Sensitive values (e.g., customer goal, wallet address) are redacted to `REDACTED` or truncated stubs like `5F3xxx...xxxx` / `0x1234...abcd`.
- No `public: false` evidence items remain.

### Evidence hash

Each bundle carries a SHA-256 `evidenceHash` computed over the canonical JSON of the bundle **excluding** the `evidenceHash` field itself. Keys are sorted recursively. The operator helper and tests recompute the hash independently to verify integrity.

### Safety flags on every bundle

Every fixture sets:

- `canExecute: false`
- `liveExecutionEnabled: false`
- `acceptsCustody: false`
- `acceptsSigning: false`
- `acceptsSecrets: false`

No fixture contains private keys, seed phrases, mnemonics, API secrets, raw signatures, signed payloads, wallet exports, passwords, passphrases, keyfiles, or SURI.

### Template registry links

Updated `evidenceBundleIds` in `packages/types/src/matterhorn-workflows.ts`:

- `wellness_creator_service_workflow` → `["wellness_creator_workflow"]`
- `bittensor_beta_operator_workflow` → `["bittensor_beta_workflow"]`
- `hyperliquid_preview_workflow` → `["hyperliquid_preview_workflow"]`
- `polymarket_preview_workflow` → `["polymarket_preview_workflow"]`
- `decentralized_services_future_workflow` → `["decentralized_services_planned_workflow"]`

## Operator helper

`scripts/matterhorn-workflow-evidence-bundles.mjs` still supports:

```bash
pnpm workflow:evidence:list
pnpm workflow:evidence:show hyperliquid_preview_workflow
pnpm workflow:evidence:export /tmp/evidence-bundles.json --checksum
```

It now exports `computeEvidenceHash` logic and rejects credential-shaped flags.

## Test assertions

### `scripts/matterhorn-workflow-evidence-bundles.test.mjs`

- Package scripts are exposed.
- Helper contains required patterns including `liveExecutionEnabled: false`, `acceptsCustody: false`, `acceptsSigning: false`, `acceptsSecrets: false`, `evidenceHash`, `computeEvidenceHash`.
- Helper fixture IDs match the typed registry.
- `--list` returns all five bundle IDs.
- `--id <bundle-id>` returns a bundle with all required fields.
- Every bundle has `canExecute: false`, `liveExecutionEnabled: false`, `acceptsCustody: false`, `acceptsSigning: false`, `acceptsSecrets: false`.
- `safetyStatus` matches `status`.
- Every evidence item is `public: true`.
- `evidenceHash` matches a canonical SHA-256 recomputed by the test.
- No credential-shaped values appear in any bundle.
- `--export --checksum` writes public-only JSON and a valid SHA-256 checksum file.
- Credential-shaped flags such as `--private-key` are rejected.
- Helper source contains no submit/sign/live execution patterns.

### `scripts/matterhorn-workflow-contract.test.mjs`

- Checks the five new evidence bundle constants exist.
- Checks each bundle block includes `inputPrompt`, `generatedArtifactType`, `safetyStatus`, `liveExecutionEnabled: false`, `acceptsCustody: false`, `acceptsSigning: false`, `acceptsSecrets: false`, `evidenceHash`.
- Checks each bundle contains at least one `publicEvidence` item and one `plannedServiceHook`.
- Checks each bundle sets `canExecute: false`.
- Checks each bundle contains `public: true` and no `public: false` items.
- Checks the evidence bundle registry covers all five bundle IDs.

## Commands that pass on this PR

```bash
pnpm test:matterhorn-workflow-evidence-bundles
pnpm test:matterhorn-workflow-contract
pnpm test:market-execution-safety-gate
pnpm --dir packages/types build
```

Also verified:

```bash
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-workflow-catalog
```

## CI status on merge

All GitHub checks on PR #427 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## Customer pilots and Hermes QA

A new doc section explains how the bundles help:

- **Customer pilots:** compare verticals with one shape, verify safety fields and hashes, share evidence without exposing secrets.
- **Hermes QA:** run `pnpm test:matterhorn-workflow-evidence-bundles` as a regression gate requiring `canExecute: false`, `liveExecutionEnabled: false`, and `acceptsSecrets: false` for every new workflow.

## Non-overlap observed

No changes were made to:

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
- Evidence helper: `scripts/matterhorn-workflow-evidence-bundles.mjs`
- Evidence helper test: `scripts/matterhorn-workflow-evidence-bundles.test.mjs`
- Workflow contract test: `scripts/matterhorn-workflow-contract.test.mjs`
