# Matterhorn Workflow Contract

> Status: **contract and fixtures only**. This document defines a generic, reusable workflow layer for Matterhorn Work. It does not implement live provider execution, signing, submission, custody, or secrets handling.

## Purpose

Matterhorn Work should let users "do anything through chat." Workflows are reusable, typed, testable contracts rather than one-off docs. A workflow can describe a use case such as:

- wellness creator services
- Bittensor operator playbooks
- market trading previews (Hyperliquid, Polymarket)
- decentralized hosting, storage, email, payments, identity
- future vertical workflows

This contract provides one shared schema so all workflows can be discovered, validated, rendered, and tested without custom UI.

## Core Principles

1. **Contract first.** Every workflow has a manifest, steps, artifacts, service hooks, safety policy, and QA contract before any provider is wired up.
2. **No secrets in chat.** Workflows never accept private keys, seed phrases, API secrets, raw signatures, signed payloads, wallet exports, passwords, passphrases, or keyfiles.
3. **Preview before execution.** Any execution-capable step must require a preview and a confirmation.
4. **External signer or provider handoff.** Where on-chain signing or third-party authorization is required, the user performs the action outside Matterhorn Work.
5. **Public receipts only.** Generated artifacts contain public metadata, links, or hashes. No secret material is returned.
6. **Status-driven.** A workflow explicitly declares its maturity: `live_local`, `planned_not_live`, `preview_only`, `external_handoff_required`, or `blocked_by_policy`.

## Shared Schema

### Workflow Manifest

```ts
interface MatterhornWorkflowManifest {
  version: "matterhorn.workflow.manifest.v1";
  workflowId: string;
  name: string;
  category: "wellness" | "web3" | "bittensor" | "markets" | "decentralized_services" | "future";
  targetUserPersona: string;
  description: string;
  status: "live_local" | "planned_not_live" | "preview_only" | "external_handoff_required" | "blocked_by_policy";
  inputPrompts: MatterhornWorkflowInputPrompt[];
  requiredPublicContext: string[];
  generatedArtifacts: MatterhornWorkflowArtifact[];
  steps: MatterhornWorkflowStep[];
  serviceHooks: MatterhornWorkflowServiceHook[];
  safetyPolicy: MatterhornWorkflowSafetyPolicy;
  qaContract: MatterhornWorkflowQAContract;
}
```

### Input Prompt

```ts
interface MatterhornWorkflowInputPrompt {
  id: string;
  label: string;
  required: boolean;
  type: "text" | "number" | "boolean" | "select" | "multiselect" | "file_reference";
  options?: string[];
  helpText?: string;
}
```

### Artifact

```ts
interface MatterhornWorkflowArtifact {
  id: string;
  name: string;
  mimeType: string;
  public: boolean;
  generatedByStep?: string;
  description?: string;
}
```

### Step

```ts
interface MatterhornWorkflowStep {
  id: string;
  name: string;
  description: string;
  serviceHook?: "hosting" | "storage" | "email" | "payments" | "identity" | "bittensor" | "hyperliquid" | "polymarket";
  inputPromptIds: string[];
  outputArtifactIds: string[];
  status: MatterhornWorkflowStatus;
  requiresExternalSigner: boolean;
  requiresCustomerConfirmation: boolean;
}
```

### Service Hook

```ts
interface MatterhornWorkflowServiceHook {
  hook: "hosting" | "storage" | "email" | "payments" | "identity" | "bittensor" | "hyperliquid" | "polymarket";
  status: MatterhornWorkflowStatus;
  requiredAuth?: string[];
}
```

### Safety Policy

```ts
interface MatterhornWorkflowSafetyPolicy {
  canExecute: boolean;
  liveExecutionEnabled: boolean;
  canSubmit: boolean;
  acceptsSecrets: boolean;
  acceptsPrivateKeys: boolean;
  acceptsRawSignatures: boolean;
  acceptsApiSecrets: boolean;
  requiresExternalSigner: boolean;
  requiresPreviewBeforeExecution: boolean;
  requiresConfirmationBeforeExecution: boolean;
}
```

The default safety policy for new fixtures is:

```ts
const DEFAULT_MATTERHORN_WORKFLOW_SAFETY_POLICY = {
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
};
```

### QA Contract

```ts
interface MatterhornWorkflowQAContract {
  checklist: string[];
  requiredTests: string[];
  successCriteria: string[];
  owner: string;
}
```

### Evidence Bundle

Workflows produce customer-safe evidence bundles that capture what was requested, what public evidence was collected, which service hooks are planned, and which safety flags apply. Evidence bundles are always read-only: `canExecute: false`.

```ts
interface MatterhornWorkflowEvidenceItem {
  id: string;
  label: string;
  value: string | number | boolean | null;
  mimeType?: string;
  public: boolean;
  source?: string;
  verifiedAt?: string | null;
}

interface MatterhornWorkflowEvidenceBundle {
  version: "matterhorn.workflow.evidence-bundle.v1";
  workflowId: string;
  domain: string;
  requestedOutcome: string;
  publicEvidence: MatterhornWorkflowEvidenceItem[];
  plannedServiceHooks: MatterhornWorkflowServiceHook[];
  safetyFlags: string[];
  createdAt: string;
  source: "operator" | "agent" | "customer" | "system";
  status: MatterhornWorkflowStatus;
  canExecute: false;
}
```

Evidence bundles are domain-agnostic: wellness, crypto, decentralized services, research, content, and future verticals can all use the same shape. They never contain secrets, private keys, API secrets, raw signatures, signed payloads, or wallet exports.

## Fixture Manifests

The contract ships with four fixture manifests in `packages/types/src/matterhorn-workflows.ts`:

| Workflow ID | Category | Status | Purpose |
| --- | --- | --- | --- |
| `wellness_creator_workflow` | wellness | `live_local` | Full seven-stage wellness creator workflow for trainers, gym instructors, yoga instructors, and dieticians. |
| `wellness_creator_services` | wellness | `planned_not_live` | Plans wellness services, content, and customer touchpoints. |
| `bittensor_operator` | bittensor | `live_local` | Staking/delegation previews and external-signer handoffs for TAO. |
| `market_read_preview` | markets | `preview_only` | Read-only market data and previews for Hyperliquid/Polymarket. |
| `decentralized_services_planner` | decentralized_services | `planned_not_live` | Plans future hosting, storage, email, payments, and identity actions. |

## Evidence Bundle Fixtures

The contract ships with five example evidence bundles in `packages/types/src/matterhorn-workflows.ts`:

| Bundle ID | Workflow | Domain | Status | Purpose |
| --- | --- | --- | --- | --- |
| `wellness_customer_intake` | `wellness_creator_services` | wellness | `planned_not_live` | Safe intake summary with no PII in public evidence. |
| `crypto_staking_decision` | `bittensor_operator` | crypto | `external_handoff_required` | Records public wallet address and external-signer requirement. |
| `decentralized_services_plan` | `decentralized_services_planner` | decentralized_services | `planned_not_live` | Captures planned storage action and example fixture provider. |
| `research_summary` | `research_summary` | research | `preview_only` | Public topic and source count for a generated summary. |
| `content_publish_plan` | `content_publish` | content | `planned_not_live` | Plan for newsletter/content publish without live provider action. |

All bundles set `canExecute: false` and contain no secrets or executable provider payloads.

## Operator Evidence Export

Operators can list, inspect, and export workflow evidence bundles without running the app or touching any provider:

```bash
pnpm workflow:evidence:list
pnpm workflow:evidence:show decentralized_services_plan
pnpm workflow:evidence:export /tmp/evidence-bundles.json --checksum
```

The helper script is `scripts/matterhorn-workflow-evidence-bundles.mjs`. It supports:

- `--list` — list all evidence bundle IDs.
- `--id <bundle-id>` — print one evidence bundle as JSON.
- `--export <path>` — write all bundles to a public JSON file (public evidence only).
- `--checksum` — write a SHA-256 checksum file next to the export.
- `--include-non-public` — include non-public evidence items in export (not the default).

By default, exports contain only `public: true` evidence items and always preserve `canExecute: false`. The export contains no private keys, seed phrases, mnemonics, API secrets, raw signatures, signed payloads, wallet exports, passwords, passphrases, keyfiles, or SURI.

Run the operator helper gate:

```bash
pnpm test:matterhorn-workflow-evidence-bundles
```

## Workflow Catalog

Operators and agents can inspect the cross-vertical workflow catalog without
starting the app or touching any provider:

```bash
matterhorn-work workflows catalog --json
matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json
matterhorn-work workflows catalog --category wellness --json
matterhorn-work workflows prompts --workflow wellness_creator_workflow --json
pnpm test:matterhorn-workflow-catalog
```

The catalog emits `matterhorn.workflow.catalog.v1`; the prompt-pack view emits
`matterhorn.workflow.prompt-pack.v1` for copy-pasteable staged prompts. Both
views cover the typed fixture manifests plus the full Wellness Creator Workflow.
They are catalog-only:

- no provider execution;
- no custody;
- no live market submission;
- no live storage, hosting, email, payments, or identity/access action;
- no seed phrase, private key, API secret, raw signature, signed payload, wallet
  export, password, passphrase, token, keyfile, or SURI input.

Use this before adding a new vertical workflow so the workflow has a discoverable
status, safety policy, service hooks, artifacts, commands, references, and QA
gate.

## Workflow Template Registry

The contract includes a `MatterhornWorkflowTemplate` registry (`MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY`) so agents can pick a reusable workflow template from user intent without custom UI or live provider integration.

```ts
interface MatterhornWorkflowTemplate {
  version: "matterhorn.workflow.template.v1";
  templateId: string;
  title: string;
  category: MatterhornWorkflowCategory;
  intendedUser: string;
  promptStarters: string[];
  requiredPublicInputs: MatterhornWorkflowInputPrompt[];
  optionalPublicInputs: MatterhornWorkflowInputPrompt[];
  generatedArtifacts: MatterhornWorkflowArtifact[];
  evidenceBundleIds: string[];
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  serviceHooks: MatterhornWorkflowServiceHook[];
}
```

Every template declares safety boundaries:

```ts
interface MatterhornWorkflowTemplateSafetyBoundary {
  liveExecutionEnabled: false;
  canExecute: boolean;
  canSubmit: false;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
  acceptsApiSecrets: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
}
```

### Built-in templates

| Template ID | Category | Status | Intended user |
| --- | --- | --- | --- |
| `wellness_creator_service_workflow` | wellness | `planned_not_live` | personal trainer, gym instructor, yoga instructor, or dietician |
| `bittensor_beta_operator_workflow` | bittensor | `live_local` | TAO operator or delegator in beta |
| `hyperliquid_preview_workflow` | markets | `preview_only` | trader wanting read-only Hyperliquid previews |
| `polymarket_preview_workflow` | markets | `preview_only` | trader wanting read-only Polymarket previews |
| `decentralized_services_future_workflow` | decentralized_services | `planned_not_live` | builder or operator planning future decentralized service actions |

Agents should:

1. Choose a template from user intent.
2. Ask only for public/non-secret inputs.
3. Produce artifacts and evidence bundles.
4. Never claim live service execution unless the capability contract explicitly says the capability is live.

Run the template registry gate:

```bash
pnpm test:matterhorn-workflow-template-registry
```

## Safety Rules

- No fixture may set `acceptsSecrets`, `acceptsPrivateKeys`, `acceptsRawSignatures`, or `acceptsApiSecrets` to `true`.
- Market fixtures must remain read/preview only (`status: "preview_only"`, `canExecute: false`, `liveExecutionEnabled: false`, `canSubmit: false`).
- Service hooks must be marked `planned_not_live` when the underlying provider integration is not implemented.
- No fixture may imply a submit route, sign route, or live provider route.
- `liveExecutionEnabled` must be `false` in every fixture manifest.

## Verification

```bash
pnpm test:matterhorn-workflow-contract
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
```

## References

- Typed schema: `packages/types/src/matterhorn-workflows.ts`
- Static test: `scripts/matterhorn-workflow-contract.test.mjs`
- Decentralized services contract: `docs/decentralized-services-capability-contract.md`
