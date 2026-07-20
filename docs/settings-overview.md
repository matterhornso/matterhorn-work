# Matterhorn Desks Settings

**Status:** Current implementation overview
**Updated:** 2026-07-17

Settings is the product surface for account, workspace, provider, wallet, extension, appearance, and diagnostic controls. The session-side Profile and Wallet rails reuse focused Settings pages; they do not open the generic Settings index.

## Entry Points

- **Profile rail:** Matterhorn Cloud and account readiness.
- **Wallet rail:** connection, Sui, workspace policy, safety ledger, and protocol signer boundaries.
- **MCPs rail:** Extensions -> MCPs & Tools in compact mode.
- **Profile & Settings footer:** complete Settings navigation.

## Primary Sections

| Section | Purpose |
| --- | --- |
| Overview | Project status, activity, Notes, Memory, outputs, and support actions. |
| Preferences | Model reasoning visibility and workspace engine compaction. |
| Permissions | Workspace folder and agent-access boundaries. |
| Generated media | Image/NFT provider readiness, storage, upload, and listing setup. |
| MCPs & Tools | Runtime MCP status, install commands, plugins, skills, and connectors. |
| Wallet | EVM/Sui connection, workspace safety policy, safety ledger, and signer boundaries. |
| AI Providers | Provider discovery and model-routing readiness. |
| Matterhorn Cloud | Account, organization, teammate, and cloud-workspace readiness. |
| Appearance | Theme and text density. |
| Updates | Desktop version and update channel. |
| Billing | Local preview/test-mode billing and verified subscription state. |

Advanced, environment, recovery, cloud-worker, and developer surfaces remain capability- or mode-gated.

## Task History Truth

Overview Task History is derived from the append-only backend task-event ledger. It does not infer activity from a summary string and does not collapse every nonterminal run into `Running`.

- `workflow_staged` renders as **Prepared**.
- active stage, tool, and artifact events render as **Running**.
- `waiting_for_user` renders as **Waiting**.
- completed, failed, and cancelled events retain their terminal labels.

The row summary is display-safe backend copy, while artifact chips link the paths recorded by `artifact_saved` events. Workflow-run evidence is emitted only for terminal states; prepared, running, and waiting projections remain activity state rather than duplicate completion evidence.

## Readiness Language

Healthy status is intentionally quiet. Do not show `Working` beside functioning Settings entries.

Show status only when it helps the user act. Setup language must identify the owner:

- **Connect wallet** and **Connect provider** are user actions available in the app.
- **Platform setup** means a Matterhorn operator must configure a deployed service, credential, package, webhook, or price mapping. The end user should not be sent to environment variables.
- **Local preview** means the flow can be exercised locally but is not connected to an external provider and does not grant paid access.
- **Early access**, **Desktop only**, **Cloud only**, **Workspace needed**, **Degraded**, **Blocked**, and **Developer** describe availability rather than setup ownership.

Do not use the unqualified label **Needs setup** on customer-facing navigation when the owner is known.

Backend-backed readiness comes from the capability endpoint or the relevant live subsystem, not a hard-coded optimistic label.

## Models And Reasoning

AI Providers separates three levels of model configuration:

1. **Workspace default** persists the model and reasoning level for the workspace.
2. **Current app override** applies only to the current app session and inherits the workspace default when cleared.
3. **Provider default** is used when neither Matterhorn level specifies a reasoning variant.

The model picker labels capability rather than implying every model supports the same control:

- **Adjustable reasoning** exposes the provider-supported reasoning levels.
- **Built-in reasoning** reasons internally without a user-adjustable effort control.
- **Standard** has no separate reasoning-effort setting.

CUDOS / ASI:Cloud uses its OpenAI-compatible endpoint and documented hosted model IDs. Opening **Connect CUDOS** shows a masked key field. The provider is not added to routing until the credential is saved; disconnecting removes both the stored credential and the workspace provider route.

Operational model metrics are metadata-only and bounded in memory. They may include provider/model IDs, selected reasoning level and source, latency, token counts, cancellations, and sanitized provider error classes. Prompts, model responses, reasoning content, credentials, and raw provider errors are never recorded by this collector.

## Compact Rail Rules

Compact Settings pages use the same canvas as the workspace:

- open sections rather than cards around every group;
- subtle spacing and one quiet grouped list where needed;
- no bright header divider;
- visibly interactive inputs;
- setup and safety details behind progressive disclosure;
- one scroll owner per panel.

Profile opens `cloud-account`; Wallet opens `wallet`; MCPs opens `extensions`. Query parameter changes replace the active panel so clicking the rail always shows the requested destination.

## Safety Invariants

- No claim that Matterhorn holds wallet keys or signs on the user's behalf.
- No seed phrase, private key, mnemonic, wallet export, raw signature, signed payload, or API secret fields.
- Bittensor writes require an external compatible signer.
- Hyperliquid and Polymarket customer paths remain preview/handoff oriented.
- Billing live mode remains blocked until production configuration and release gates are satisfied.
- Mock billing is a local plan preview, not a test checkout. It must not open mock provider URLs, imply that Stripe is connected, or grant paid entitlement state.
- Notes do not become Memory without explicit suggestion and review.

## Source Pointers

- Shell: `apps/app/src/react-app/domains/settings/shell/`
- Route: `apps/app/src/react-app/shell/settings-route.tsx`
- Overview: `apps/app/src/react-app/domains/settings/pages/overview-view.tsx`
- Profile: `apps/app/src/react-app/domains/settings/pages/cloud-account-view.tsx`
- Wallet: `apps/app/src/react-app/domains/settings/pages/wallet-view.tsx`
- MCPs: `apps/app/src/react-app/domains/settings/pages/mcp-view.tsx`

## Verification

```bash
pnpm --filter @matterhorn-work/app exec bun test \
  tests/settings-general-hub-contract.test.ts \
  tests/backend-capability-ui-contract.test.ts \
  tests/settings-overview-ui.test.ts \
  tests/shared-primitives-ui-contract.test.ts
pnpm --filter matterhorn-work-server exec bun test \
  src/workflow-run-routes.e2e.test.ts \
  src/project-evidence-routes.e2e.test.ts
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
```
