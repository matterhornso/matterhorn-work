# Protocol Desk Visual Contract

> **Status:** contract and fixtures only. This document defines the typed visual contract for protocol desks in Matterhorn Work so that UI implementation can render desks from a single source of truth.

## Purpose

The desk visual redesign requires every customer-facing desk to expose:

- Stable identity (`id`, `displayName`, `shortDescription`)
- Visual assets (`logoAssetKey`, theme token hints for light and dark modes)
- Navigation (`routeOrPanelId`)
- Actions (`primaryActions`, `secondaryActions`)
- Wallet expectations (`walletRequirements`)
- Safety boundaries (`safetyBoundaries`)
- Empty and degraded states (`emptyStateCopy`, `degradedStateCopy`)

This contract lets Codex implement production UI without guessing desk identity, logo assets, wallet behavior, or safety boundaries.

## Core types

```ts
interface ProtocolDeskManifest {
  version: "matterhorn.protocol.desk.manifest.v1";
  id: string;
  displayName: string;
  shortDescription: string;
  category: "web3" | "bittensor" | "markets" | "wellness" | "memory" | "mcps";
  status: "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live";
  routeOrPanelId: string;
  logoAssetKey: string;
  preferredColorToken: string;
  lightThemeTokenHints: ProtocolDeskThemeTokenHints;
  darkThemeTokenHints: ProtocolDeskThemeTokenHints;
  primaryActions: ProtocolDeskAction[];
  secondaryActions: ProtocolDeskAction[];
  walletRequirements: ("none" | "evm_read_only" | "ss58_read_only" | "ss58_external_signer")[];
  safetyBoundaries: ProtocolDeskSafetyBoundaries;
  emptyStateCopy: {
    headline: string;
    body: string;
    primaryActionId?: string;
  };
  degradedStateCopy: {
    headline: string;
    body: string;
    primaryActionId?: string;
  };
}

interface ProtocolDeskThemeTokenHints {
  background: string;
  surface: string;
  accent: string;
  accentHover: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  safetyStrip: string;
  iconFill: string;
}

interface ProtocolDeskSafetyBoundaries {
  liveSubmissionEnabled: false;
  canExecute: boolean;
  canSubmit: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
  medicalClaimsAllowed: false;
}

interface ProtocolBrandAssetManifest {
  version: "matterhorn.protocol.brand.asset.v1";
  assetKey: string;
  protocol: string;
  sourceUrl?: string;
  allowedUseNote: string;
  lightAssetPath: string;
  darkAssetPath: string;
  monochromeAssetPath?: string;
  fallbackInitials: string;
}
```

## Desk registry

`PROTOCOL_DESK_MANIFEST_REGISTRY` covers six customer-facing desks:

| Desk | Category | Status | Route | Wallet |
| --- | --- | --- | --- | --- |
| Bittensor | `bittensor` | `beta_ready` | `/workspaces/bittensor` | SS58 read-only + external signer |
| Hyperliquid | `markets` | `preview_only` | `/workspaces/hyperliquid` | EVM read-only |
| Polymarket | `markets` | `preview_only` | `/workspaces/polymarket` | EVM read-only |
| Wellness | `wellness` | `workflow_ready` | `/workspaces/wellness` | None |
| Memory | `memory` | `beta_ready` | `/memory` | None |
| MCPs | `mcps` | `planned_not_live` | `/mcps` | None |

## Brand asset registry

`PROTOCOL_BRAND_ASSET_REGISTRY` maps `logoAssetKey` values to brand asset manifests:

| Asset key | Protocol | Light path | Dark path | Fallback |
| --- | --- | --- | --- | --- |
| `bittensor-logo` | bittensor | `/assets/desks/bittensor/logo-light.svg` | `/assets/desks/bittensor/logo-dark.svg` | TAO |
| `hyperliquid-logo` | hyperliquid | `/assets/desks/hyperliquid/logo-light.svg` | `/assets/desks/hyperliquid/logo-dark.svg` | HL |
| `polymarket-logo` | polymarket | `/assets/desks/polymarket/logo-light.svg` | `/assets/desks/polymarket/logo-dark.svg` | PM |
| `wellness-logo` | matterhorn | `/assets/desks/wellness/logo-light.svg` | `/assets/desks/wellness/logo-dark.svg` | WL |
| `memory-logo` | matterhorn | `/assets/desks/memory/logo-light.svg` | `/assets/desks/memory/logo-dark.svg` | ME |
| `mcp-logo` | matterhorn | `/assets/desks/mcps/logo-light.svg` | `/assets/desks/mcps/logo-dark.svg` | MCP |

## Safety invariants

- Every desk sets `liveSubmissionEnabled: false`.
- Every desk sets all secret-acceptance flags to `false`.
- Market desks (`hyperliquid`, `polymarket`) are `preview_only`, do not require an external signer, and do not mention private keys, API secrets, raw signatures, signed payloads, custody, or live submission in manifest copy.
- Bittensor is `beta_ready`, requires an external signer, and distinguishes SS58/coldkey/hotkey from EVM wallets.
- Wellness is `workflow_ready`, requires no wallet, and is explicitly non-medical and non-Web3.
- MCPs is `planned_not_live`.
- Memory is `beta_ready` and includes a `forget record` action.

## UI implementation guidance

1. Render the desk list from `PROTOCOL_DESK_MANIFEST_REGISTRY`.
2. Resolve logos through `PROTOCOL_BRAND_ASSET_REGISTRY` by `logoAssetKey`; fall back to `fallbackInitials` if the asset is missing.
3. Apply theme tokens from `lightThemeTokenHints` or `darkThemeTokenHints` based on the active theme.
4. Surface `customerSafetyStrip` or equivalent copy from `safetyBoundaries` near the desk header.
5. Enable primary and secondary actions based on the desk manifest; respect `requiresConfirmation`.
6. Show `emptyStateCopy` when the desk has no session context and `degradedStateCopy` when a provider or index is unavailable.
7. Gate wallet-dependent desks by `walletRequirements` before exposing on-chain actions.

## Verification

```bash
pnpm --dir packages/types build
pnpm test:protocol-desk-visual-contract
pnpm test:matterhorn-workflow-template-registry
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:market-execution-safety-gate
```

## Source files

- Typed schema: `packages/types/src/matterhorn-workflows.ts`
- Static test: `scripts/protocol-desk-visual-contract.test.mjs`
- This doc: `docs/ui/protocol-desk-contract.md`
