# Matterhorn Workflow Contract

> Status: **contract plus local workflow runtime**. Matterhorn Desks can stage and track local workflow runs, link them to chat sessions, and persist customer-safe artifacts. It does not perform provider signing, transaction submission, custody, or secrets handling.

## Purpose

Matterhorn Desks should let users "do anything through chat." Workflows are reusable, typed, testable contracts rather than one-off docs. A workflow can describe a use case such as:

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
4. **External signer or provider handoff.** Where on-chain signing or third-party authorization is required, the user performs the action outside Matterhorn Desks.
5. **Public receipts only.** Generated artifacts contain public metadata, links, or hashes. No secret material is returned.
6. **Status-driven.** A workflow explicitly declares its maturity: `live_local`, `planned_not_live`, `preview_only`, `external_handoff_required`, or `blocked_by_policy`.

## Local Run Lifecycle

Launching a workflow task from a desk creates a chat session and one linked backend run. Passive desk navigation does not create a run. The backend lifecycle is:

| Status | UI label | Meaning |
| --- | --- | --- |
| `staged` | Prepared | The run record exists but model work has not started. |
| `running` | Running | The linked chat is actively processing the workflow. |
| `waiting` | Waiting | The linked chat is waiting for a user answer or approval. |
| `completed` | Completed | The linked chat produced its final visible result. |
| `failed` | Failed | The run ended with a display-safe failure reason. |
| `cancelled` | Cancelled | The user or system stopped the run. |

Question and approval requests move the run to `waiting`; resumed model streaming returns it to `running`. Reloading the linked chat restores its desk agent from the run record.

Each run owns one canonical workspace-relative output directory:

```text
outputs/<desk>/<sessionId>/
```

The session system context supplies this exact path to the desk agent. Every workflow artifact must be saved beneath it; agents must not create a second descriptive or custom session folder.

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

The contract ships with five example evidence bundles in `packages/types/src/matterhorn-workflows.ts`. Every fixture is scoped to one of the built-in workflows, declares the input prompt and generated artifact type, and is public/redacted only:

| Bundle ID | Workflow | Domain | Status | Purpose |
| --- | --- | --- | --- | --- |
| `wellness_creator_workflow` | `wellness_creator_services` | wellness | `planned_not_live` | Safe intake summary with customer PII redacted. |
| `bittensor_beta_workflow` | `bittensor_operator` | bittensor | `external_handoff_required` | Records public wallet address and external-signer requirement. |
| `hyperliquid_preview_workflow` | `market_read_preview` | hyperliquid | `preview_only` | Read-only Hyperliquid preview with no submission or signing. |
| `polymarket_preview_workflow` | `market_read_preview` | polymarket | `preview_only` | Read-only Polymarket preview with no submission or signing. |
| `decentralized_services_planned_workflow` | `decentralized_services_planner` | decentralized_services | `planned_not_live` | Captures planned storage action and example fixture provider. |

All bundles set `canExecute: false`, `liveExecutionEnabled: false`, `acceptsCustody: false`, `acceptsSigning: false`, and `acceptsSecrets: false`. Every `publicEvidence` item is `public: true`; sensitive values are redacted. Each bundle carries a SHA-256 `evidenceHash` over its canonical content so pilots and QA can verify integrity without handling secrets.

## Operator Evidence Export

Operators can list, inspect, and export workflow evidence bundles without running the app or touching any provider:

```bash
pnpm workflow:evidence:list
pnpm workflow:evidence:show hyperliquid_preview_workflow
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

## Evidence Bundles for Customer Pilots and Hermes QA

Workflow evidence bundles give customer pilots and Hermes QA a single, comparable way to prove that every vertical follows the same safety contract.

**Customer pilots** can:

- Compare wellness, crypto, market-preview, and decentralized-service workflows using the same bundle shape.
- Verify that each bundle states its workflow id, input prompt, generated artifact type, safety status, and custody/signing/secrets policy up front.
- Check the SHA-256 `evidenceHash` to confirm the bundle has not been altered.
- Share public evidence with stakeholders without exposing PII, private keys, API secrets, raw signatures, or signed payloads.

**Hermes QA** can:

- Run `pnpm test:matterhorn-workflow-evidence-bundles` to confirm every fixture is public/redacted only, has a valid hash, and rejects live execution.
- Use the evidence bundle as a regression gate: any new workflow must produce a bundle with `canExecute: false`, `liveExecutionEnabled: false`, and `acceptsSecrets: false`.
- Tie each bundle back to its workflow manifest and template registry entry, so the safety story is consistent from contract to fixture to operator export.

Because every bundle is domain-agnostic, a pilot can move from a wellness intake summary to a Bittensor staking preview to a Hyperliquid market preview without learning a new schema or trusting a new secrets model.

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

## Customer Workflow Template Registry

For chat-first goal selection, the contract also includes a customer-facing
`MatterhornCustomerWorkflowTemplate` registry
(`MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY`). These templates are
optimized for copy-paste prompts and safe onboarding:

```ts
interface MatterhornCustomerWorkflowTemplate {
  version: "matterhorn.customer.workflow.template.v1";
  id: string;
  name: string;
  summary: string;
  promise: string;
  category: MatterhornWorkflowCategory;
  examplePrompts: string[];
  expectedArtifacts: MatterhornWorkflowArtifact[];
  requiredContext: MatterhornWorkflowInputPrompt[];
  optionalContext: MatterhornWorkflowInputPrompt[];
  status: "beta_ready" | "preview_only" | "planned_not_live" | "workflow_ready" | "blank";
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  forbiddenInputs: string[];
  handoffReceiptSupport: {
    supported: boolean;
    types?: string[];
    description?: string;
  };
  serviceHooks: MatterhornWorkflowServiceHook[];
  chatMode: string;
  launch: {
    primaryCta: string;
    secondaryCta: string;
    defaultPrompt: string;
    handoffContextLabel: string;
    recommendedSurface: "protocol_desk" | "workflow_chat" | "evidence_packet" | "future_service";
  };
  ui: {
    iconHint: "bittensor" | "hyperliquid" | "polymarket" | "wellness" | "services" | "blank";
    accent: "matterhorn_blue" | "neutral" | "caution";
    shortDescription: string; // max 90 chars
  };
  routing: {
    chatMode: "bittensor" | "hyperliquid" | "polymarket" | "sui" | "wellness" | "services" | "general";
    opensPanel?: "bittensor" | "hyperliquid" | "polymarket" | "sui";
    startsSession: boolean;
  };
  recommendedCommands?: {
    cli?: string[];
    mcp?: string[];
  };
}
```

### Built-in customer templates

| Template ID | Category | Status | Surface | Panel | Notes |
| --- | --- | --- | --- | --- | --- |
| `bittensor_operator` | bittensor | `beta_ready` | `protocol_desk` | `bittensor` | Read-only previews + external-signer handoffs. |
| `hyperliquid_trader` | markets | `preview_only` | `protocol_desk` | `hyperliquid` | Read-only Hyperliquid previews. |
| `polymarket_researcher` | markets | `preview_only` | `protocol_desk` | `polymarket` | Read-only Polymarket previews. |
| `sui_wallet_workflow` | web3 | `preview_only` | `protocol_desk` | `sui` | Public reads, wallet-signed transfer previews, and public receipt evidence. |
| `wellness_creator_workflow` | wellness | `workflow_ready` | `workflow_chat` | — | Plans services/content; hooks remain planned_not_live. |
| `decentralized_services_operator` | decentralized_services | `planned_not_live` | `future_service` | — | Future-contract planning only. |
| `blank_chat_workflow` | future | `blank` | `workflow_chat` | — | Open-ended chat with baseline safety boundaries. |

Every customer template shares the same baseline safety boundary:
`liveExecutionEnabled: false`, `canSubmit: false`, `allowsRealFunds: false`, and
all secret-acceptance flags set to `false`. Bittensor is the only customer
template that sets `canExecute: true`, and only for preparing external-signer
handoffs.

Operators and agents can inspect the customer template registry without
starting the app:

```bash
node scripts/matterhorn-workflow-template-registry.mjs --json
node scripts/matterhorn-workflow-template-registry.mjs --category markets --json
node scripts/matterhorn-workflow-template-registry.mjs --customer-template bittensor_operator --json
pnpm test:matterhorn-customer-workflow-template-registry
```

The registry emits `matterhorn.customer.workflow.template.v1`; it is catalog-only
and rejects credential-shaped flags.

## Desk Manifest Registry

The contract includes a `MatterhornDeskManifest` registry
(`MATTERHORN_DESK_MANIFEST_REGISTRY`) that defines how each product desk is
presented to users and what safety posture it holds. This lets the production UI
render desks from a single source of truth without hard-coding labels, accents,
or safety strips.

```ts
interface MatterhornDeskManifest {
  version: "matterhorn.desk.manifest.v1";
  deskId: "bittensor" | "hyperliquid" | "polymarket" | "wellness" | "memory" | "mcp" | "settings" | "services";
  deskDisplayName: string;
  deskShortName: string;
  deskDescription: string;
  deskAccent: "matterhorn_blue" | "purple" | "green" | "orange" | "caution" | "neutral";
  customerPrimaryAction: string;
  customerSafetyStrip: string;
  status: "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live" | "blank";
  allowedSurfaces: string[];
  liveSubmissionEnabled: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  isPrimaryCustomerDesk: boolean;
}
```

| Desk | Status | Primary action | Safety strip |
| --- | --- | --- | --- |
| Bittensor | `beta_ready` | Preview stake or delegation handoff | Read-only previews and external-signer handoffs only. Never provide private keys or seed phrases. |
| Hyperliquid | `preview_only` | Preview market or manage watchlist | Preview-only. No live submission, signing, custody, or secrets. |
| Polymarket | `preview_only` | Research market or manage watchlist | Preview-only. No live submission, signing, custody, or secrets. |
| Wellness | `workflow_ready` | Build a wellness program packet | Educational content only. Not medical advice. No live payments, email, hosting, or data access. |
| Memory | `beta_ready` | Review and manage saved memory | User-controlled memory. Nothing hidden. Secrets, keys, and clinical records are rejected. |
| MCP | `beta_ready` | View managed tools and connection health | Managed web tools follow workspace access boundaries. Custom MCP configuration stays in Matterhorn Desktop; no secrets or custody. |
| Settings | `beta_ready` | Manage preferences | Settings never request private keys, seed phrases, API secrets, or signatures. |
| Services | `planned_not_live` | Plan future service capabilities | Planned-not-live. No provider execution, hosting, email, payments, or identity access today. |

Customer workflow templates map to desks one-to-one via
`MATTERHORN_CUSTOMER_TEMPLATE_TO_DESK`:

| Customer template | Desk |
| --- | --- |
| `bittensor_operator` | `bittensor` |
| `hyperliquid_trader` | `hyperliquid` |
| `polymarket_researcher` | `polymarket` |
| `wellness_creator_workflow` | `wellness` |
| `decentralized_services_operator` | `services` |
| `blank_chat_workflow` | `settings` |

### Desk safety rules

- Every desk keeps `liveSubmissionEnabled: false` and all secret-acceptance flags `false`.
- Market desks (Hyperliquid, Polymarket) are `preview_only` and never require an external signer.
- Bittensor is `beta_ready`, may prepare read/preview handoffs, and always requires an external signer.
- Wellness is `workflow_ready`, educational, non-medical, and never claims live payments, email, hosting, or data access.
- Services are `planned_not_live` and are not a primary customer desk.

## Protocol Workspace Manifest Registry

The contract includes a `MatterhornProtocolWorkspaceManifest` registry
(`MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY`) that maps customer
workflow templates to protocol workspaces without touching app UI code.

```ts
interface MatterhornProtocolWorkspaceManifest {
  version: "matterhorn.protocol.workspace.manifest.v1";
  id: "bittensor" | "hyperliquid" | "polymarket" | "wellness" | "decentralized_services";
  displayName: string;
  category: MatterhornWorkflowCategory;
  customerStatus: "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live";
  allowedIntents: string[];
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  primaryPanelRouteId: string;
  mcpCliHints: {
    cli?: string;
    mcp?: string;
  };
  supportedCardKinds: (
    | "balance_card"
    | "market_card"
    | "validator_card"
    | "preview_card"
    | "handoff_card"
    | "receipt_card"
    | "plan_card"
    | "schedule_card"
    | "package_card"
    | "capability_card"
    | "provider_card"
  )[];
  demoPrompt: string;
  launchBehavior: "starts_chat" | "opens_desk" | "planned_not_live";
}
```

Customer templates map to workspaces one-to-one (blank chat is intentionally
unmapped):

| Customer template | Workspace | `customerStatus` | `launchBehavior` | Panel route |
| --- | --- | --- | --- | --- |
| `bittensor_operator` | `bittensor` | `beta_ready` | `opens_desk` | `/workspaces/bittensor` |
| `hyperliquid_trader` | `hyperliquid` | `preview_only` | `opens_desk` | `/workspaces/hyperliquid` |
| `polymarket_researcher` | `polymarket` | `preview_only` | `opens_desk` | `/workspaces/polymarket` |
| `wellness_creator_workflow` | `wellness` | `planned_not_live` | `planned_not_live` | `/workspaces/wellness` |
| `decentralized_services_operator` | `decentralized_services` | `planned_not_live` | `planned_not_live` | `/workspaces/decentralized-services` |

The mapping is exported as `MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE`.

### Workspace safety

- Bittensor is `beta_ready`, may execute safe read/preview handoffs, and requires an external signer.
- Hyperliquid and Polymarket are `preview_only`, non-executing, and never submit or take custody.
- Wellness is `planned_not_live`, educational, and non-medical.
- Decentralized services are `planned_not_live` future contracts.
- Every workspace keeps `liveExecutionEnabled: false`, `canSubmit: false`, and all secret-acceptance flags `false`.

## Safety Rules

- No fixture may set `acceptsSecrets`, `acceptsPrivateKeys`, `acceptsRawSignatures`, or `acceptsApiSecrets` to `true`.
- Evidence bundles must set `canExecute: false`, `liveExecutionEnabled: false`, `acceptsCustody: false`, `acceptsSigning: false`, and `acceptsSecrets: false`.
- Evidence bundles must contain only `public: true` evidence items; sensitive values must be redacted, not hidden behind `public: false`.
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
