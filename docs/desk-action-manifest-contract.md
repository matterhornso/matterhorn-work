# Desk Action Manifest Contract

> **Status:** contract and fixtures only. Defines every user-facing action for Desk V2 surfaces.

## Purpose

The Desk Action Manifest contract makes every desk action typed, testable, and safe to render in production UI. Each action declares its required and optional context, safety boundary, execution state, prompt template, MCP/CLI hints, and result card kinds.

Codex should render action surfaces from this contract rather than hard-coding actions per desk.

## Core types

```ts
interface DeskActionSafetyBoundary {
  liveSubmissionEnabled: false;
  canSubmit: boolean;
  canRequestSecrets: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
}

interface DeskActionManifest {
  version: "matterhorn.desk.action.manifest.v1";
  id: string;
  deskId: string;
  title: string;
  description: string;
  requiredContextFields: string[];
  optionalContextFields: string[];
  safetyBoundary: DeskActionSafetyBoundary;
  executionState: "live_read" | "preview_only" | "external_signer_required" | "planned_not_live";
  promptTemplate: string;
  mcpToolHints?: string[];
  cliCommandHints?: string[];
  resultCardKinds: ("summary_card" | "preview_card" | "handoff_card" | "watch_card" | "receipt_card" | "education_card" | "settings_card" | "empty_card")[];
}
```

## Registries

- `BITTENSOR_DESK_ACTION_REGISTRY`
- `HYPERLIQUID_DESK_ACTION_REGISTRY`
- `POLYMARKET_DESK_ACTION_REGISTRY`
- `WELLNESS_DESK_ACTION_REGISTRY`
- `MEMORY_DESK_ACTION_REGISTRY`
- `MCPS_DESK_ACTION_REGISTRY`
- `DESK_ACTION_REGISTRY` — combined registry keyed by `deskId` then `actionId`

## Actions per desk

### Bittensor (`beta_ready`)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `bittensor_show_tao` | Show my TAO | `live_read` | summary |
| `bittensor_wallet_stake_read` | Where am I staked? | `live_read` | summary, watch |
| `bittensor_discover_subnets` | Discover subnets | `live_read` | summary |
| `bittensor_compare_validators` | Compare validators | `live_read` | summary |
| `bittensor_prepare_stake` | Prepare stake handoff | `external_signer_required` | preview, handoff |
| `bittensor_prepare_unstake` | Prepare unstake handoff | `external_signer_required` | preview, handoff |
| `bittensor_prepare_transfer` | Prepare transfer handoff | `external_signer_required` | preview, handoff |
| `bittensor_create_watch` | Watch subnet or validator | `live_read` | watch |
| `bittensor_import_receipt` | Import receipt | `live_read` | receipt |
| `bittensor_explain_keys` | Explain coldkey vs hotkey | `live_read` | education |

### Hyperliquid (`preview_only`)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `hyperliquid_market_read` | Read market | `live_read` | summary |
| `hyperliquid_orderbook_read` | Show orderbook | `live_read` | summary |
| `hyperliquid_account_exposure` | Show exposure | `live_read` | summary |
| `hyperliquid_funding_read` | Show funding | `live_read` | summary |
| `hyperliquid_open_orders` | Show open orders | `live_read` | summary |
| `hyperliquid_preview_order` | Preview order | `preview_only` | preview |
| `hyperliquid_external_signer_handoff` | Prepare handoff | `external_signer_required` | preview, handoff |
| `hyperliquid_create_watch` | Watch market | `live_read` | watch |
| `hyperliquid_import_receipt` | Import receipt | `live_read` | receipt |

### Polymarket (`preview_only`)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `polymarket_market_discovery` | Discover markets | `live_read` | summary |
| `polymarket_outcome_probabilities` | Outcome probabilities | `live_read` | summary |
| `polymarket_liquidity_orderbook` | Show orderbook | `live_read` | summary |
| `polymarket_compliance_check` | Compliance check | `preview_only` | preview |
| `polymarket_preview_trade` | Preview trade | `preview_only` | preview |
| `polymarket_external_signer_handoff` | Prepare handoff | `external_signer_required` | preview, handoff |
| `polymarket_create_watch` | Watch market | `live_read` | watch |
| `polymarket_import_receipt` | Import receipt | `live_read` | receipt |

### Wellness (`workflow_ready`)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `wellness_build_program` | Build program | `live_read` | education |
| `wellness_generate_artifacts` | Generate artifacts | `live_read` | education |
| `wellness_package_service` | Package service | `live_read` | summary, education |
| `wellness_plan_live_service` | Plan live service | `planned_not_live` | preview |

### Memory (`beta_ready`)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `memory_review` | Review memory | `live_read` | summary |
| `memory_manage_suggestions` | Manage suggestions | `live_read` | summary, settings |
| `memory_forget_record` | Forget record | `live_read` | settings |
| `memory_export` | Export memory | `live_read` | summary |

### MCPs (`beta_ready`, managed web tools)

| Action ID | Title | Execution state | Result cards |
| --- | --- | --- | --- |
| `mcps_browse_tools` | Browse tools | `live_read` | summary |
| `mcps_install_tool` | Install tool | `planned_not_live` | settings |
| `mcps_manage_permissions` | Manage permissions | `planned_not_live` | settings |
| `mcps_view_usage_guide` | Usage guide | `live_read` | education |

Web workspaces expose the managed tool inventory, connection health, and usage guidance. Custom MCP installation, credentials, and permission changes remain desktop-only and therefore stay `planned_not_live` in the web action contract.

## Safety invariants

- `canRequestSecrets` is always `false`.
- `acceptsPrivateKeys`, `acceptsSeedPhrases`, `acceptsApiSecrets`, `acceptsRawSignatures`, `acceptsSignedPayloads`, `acceptsWalletExports`, and `allowsRealFunds` are always `false`.
- Hyperliquid and Polymarket actions always set `canSubmit: false` and `executionState` is never live submission.
- Bittensor actions never mention seed phrases, private keys, mnemonics, raw signatures, or wallet exports.
- Wellness actions are educational and non-medical; live-service actions are `planned_not_live`.
- MCPs actions are install/use guidance only and never involve secrets or custody.

## Consumption helpers

```ts
import {
  getDeskActionManifest,
  listDeskActions,
  listAllDeskActionIds,
} from "@matterhorn-work/types";

const actions = listDeskActions("bittensor");
const action = getDeskActionManifest("bittensor", "bittensor_prepare_stake");
const allIds = listAllDeskActionIds();
```

## UI implementation guidance

1. Render action cards from `listDeskActions(deskId)`.
2. Use `title` and `description` for action labels and tooltips.
3. Surface `executionState` as a badge or safety hint.
4. Use `promptTemplate` to prefill the chat input when the user taps an action.
5. Resolve missing context by prompting for `requiredContextFields` before invoking the action.
6. Render results using `resultCardKinds`.
7. Route MCP/CLI hints to the appropriate runtime surface when available.

## Verification

```bash
pnpm --dir packages/types build
pnpm test:desk-action-manifest
pnpm test:market-execution-safety-gate
```

## Source files

- Typed schema and registries: `packages/types/src/desk-actions.ts`
- Static test: `scripts/desk-action-manifest.test.mjs`
- This doc: `docs/desk-action-manifest-contract.md`
