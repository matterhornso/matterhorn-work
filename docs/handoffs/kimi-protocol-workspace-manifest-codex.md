# Handoff: Protocol Workspace Manifest Integration Layer

**From:** Kimi (workflow/template registry owner)  
**To:** Codex (runtime / CLI / MCP / HTTP owner)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/445  
**Branch:** `kimi/protocol-workspace-manifest`  
**Merged to:** `dev` (pending CI)  
**Date:** 2026-06-20

## TL;DR

I delivered the typed **Protocol Workspace Manifest** layer. It gives you a single, safe source of truth for launching protocol workspaces from customer workflow templates, without any app UI changes. You now have:

- `MatterhornProtocolWorkspaceManifest` and a registry of five workspaces.
- A one-to-one mapping from non-blank customer templates to those workspaces.
- Safety boundaries that prevent secrets, live submission, and custody by default.
- Tests that guarantee every template maps to exactly one manifest and every manifest stays within the safety contract.

## What I built

### New types in `packages/types/src/matterhorn-workflows.ts`

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
  mcpCliHints: { cli?: string; mcp?: string };
  supportedCardKinds: MatterhornProtocolWorkspaceCardKind[];
  demoPrompt: string;
  launchBehavior: "starts_chat" | "opens_desk" | "planned_not_live";
}
```

Union constants:

- `MATTERHORN_PROTOCOL_WORKSPACE_IDS`
- `MATTERHORN_PROTOCOL_WORKSPACE_CUSTOMER_STATUSES`
- `MATTERHORN_PROTOCOL_WORKSPACE_LAUNCH_BEHAVIORS`
- `MATTERHORN_PROTOCOL_WORKSPACE_CARD_KINDS`

Registry constants:

- `MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY` — `Record<string, MatterhornProtocolWorkspaceManifest>`
- `MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE` — `Record<string, MatterhornProtocolWorkspaceId>`

### Five manifest fixtures

| Workspace | Customer status | Launch behavior | Primary panel route | Demo prompt |
| --- | --- | --- | --- | --- |
| `bittensor` | `beta_ready` | `opens_desk` | `/workspaces/bittensor` | Show my TAO |
| `hyperliquid` | `preview_only` | `opens_desk` | `/workspaces/hyperliquid` | Preview a Hyperliquid BTC-PERP trade |
| `polymarket` | `preview_only` | `opens_desk` | `/workspaces/polymarket` | Summarize this Polymarket market |
| `wellness` | `workflow_ready` | `starts_chat` | `/workspaces/wellness` | Create a wellness program for my clients |
| `decentralized_services` | `planned_not_live` | `planned_not_live` | `/workspaces/decentralized-services` | Plan a decentralized storage upload |

### Mapping from customer templates

| Customer template | Maps to workspace |
| --- | --- |
| `bittensor_operator` | `bittensor` |
| `hyperliquid_trader` | `hyperliquid` |
| `polymarket_researcher` | `polymarket` |
| `wellness_creator_workflow` | `wellness` |
| `decentralized_services_operator` | `decentralized_services` |

`blank_chat_workflow` is intentionally **not mapped** because it is the general fallback.

## Why this matters for you

This is the integration layer between the **customer-facing template registry** (which I own) and the **runtime surfaces** you own (CLI, MCP, HTTP, panel routing). Instead of hard-coding workspace behavior in those surfaces, you can now:

1. Look up the customer template id in `MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE`.
2. Fetch the corresponding `MatterhornProtocolWorkspaceManifest` from `MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY`.
3. Use the manifest to decide:
   - Whether to start a chat session or open a panel (`launchBehavior`).
   - Which route to mount (`primaryPanelRouteId`).
   - Which intents the workspace accepts (`allowedIntents`).
   - Which CLI/MCP commands to expose (`mcpCliHints`).
   - Which card kinds the UI can render (`supportedCardKinds`).
   - What demo prompt to show (`demoPrompt`).
   - Whether the workspace is allowed to execute anything (`safetyBoundaries`).

## Safety contract

- Every manifest sets `liveExecutionEnabled: false`, `canSubmit: false`, and all secret-acceptance flags (`acceptsSecrets`, `acceptsPrivateKeys`, `acceptsRawSignatures`, `acceptsApiSecrets`) to `false`.
- `allowsRealFunds: false` everywhere.
- Bittensor is the only workspace with `canExecute: true`, and it requires `requiresExternalSigner: true`.
- Hyperliquid and Polymarket are `preview_only`, `canExecute: false`, and never require an external signer or custody.
- Wellness is `workflow_ready`, non-medical, educational.
- Decentralized services are `planned_not_live` future contracts.
- No private keys, seed phrases, API secrets, raw signatures, signed payloads, or wallet exports are accepted anywhere.

## Tests that now guard this

- `scripts/matterhorn-workflow-contract.test.mjs`
  - Asserts the new types and registry constants exist.
  - Extracts every manifest block and checks for version, allowed intents, panel route, card kinds, demo prompt, launch behavior, and safety flags.
  - Asserts market workspaces (`hyperliquid`, `polymarket`) are `preview_only`, `canExecute: false`, and `requiresExternalSigner: false`.
- `scripts/matterhorn-customer-workflow-template-registry.test.mjs`
  - Asserts every non-blank customer template maps to exactly one workspace.
  - Asserts the mapping is one-to-one (no workspace is double-assigned).

## Verification commands

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-workflow-catalog
pnpm test:market-execution-safety-gate
```

All pass locally.

## What I did NOT touch

I stayed in my owned layer:

- `packages/types/src/matterhorn-workflows.ts`
- `scripts/matterhorn-workflow-contract.test.mjs`
- `scripts/matterhorn-customer-workflow-template-registry.test.mjs`
- `docs/matterhorn-workflow-contract.md`
- `docs/handoffs/kimi-matterhorn-workflow-contract.md`

I did **not** touch:

- `apps/app/**`
- `apps/orchestrator/src/cli.ts`
- `packages/matterhorn-work-mcp/index.mjs`
- `apps/server/src/server.ts`
- `scripts/wellness-creator-workflow.mjs` or its test
- `docs/wellness-creator-workflow/**`
- `docs/ui/**`
- stale PR #2

## Suggested next steps for Codex

1. **Consume the registry at runtime.** Import `MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY` and `MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE` from `@matterhorn-work/types` (or `./matterhorn-workflows` export).
2. **Wire launch behavior.** When a user picks a customer template:
   - If `launchBehavior === "opens_desk"`, navigate to `primaryPanelRouteId`.
   - If `launchBehavior === "starts_chat"`, start a session with `demoPrompt`.
   - If `launchBehavior === "planned_not_live"`, show a future-contract preview instead of executing.
3. **Gate intents.** Before invoking a workspace-specific tool, check that the intent is in `allowedIntents`.
4. **Enforce safety at runtime.** The types layer already guarantees the static contract; consider adding a runtime assertion that rejects any manifest whose `safetyBoundaries` deviate from the baseline.

## Questions?

Ping me on PR #445 or in the `docs/handoffs/kimi-matterhorn-workflow-contract.md` handoff doc.
