# Protocol Desk Visual Contract

> **Status:** contract and fixtures only. This document defines the typed visual contract for protocol desks in Matterhorn Desks so that UI implementation can render desks from a single source of truth.

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
  launcherTitle: string;
  launcherDescription: string;
  launcherPrompt: string;
  rightRailSummary: string;
  logoAssetId: string;
  officialLogoAssetId: string;
  logoAlt: string;
  category: "web3" | "bittensor" | "markets" | "wellness" | "memory" | "mcps";
  status: "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live";
  readinessTone: "beta_ready" | "preview_only" | "workflow_ready" | "local_only";
  statusBadgeLabel: string;
  statusBadgeTone: "success" | "caution" | "info" | "neutral";
  routeOrPanelId: string;
  logoAssetKey: string;
  preferredColorToken: string;
  lightThemeTokenHints: ProtocolDeskThemeTokenHints;
  darkThemeTokenHints: ProtocolDeskThemeTokenHints;
  primaryActions: ProtocolDeskAction[];
  primaryActionLabel: string;
  secondaryActions: ProtocolDeskAction[];
  walletRequirements: ("none" | "evm_read_only" | "ss58_read_only" | "ss58_external_signer")[];
  walletRailMode: "external_signer" | "evm_preview" | "none";
  safetyBoundaries: ProtocolDeskSafetyBoundaries;
  customerVisible: boolean;
  capabilityBullets: string[];
  safetySummary: string;
  customerCapabilitySummary: string;
  noCustodySafetyLine: string;
  suggestedPromptTitles: string[];
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

| Desk | Category | Status | Readiness tone | Badge | Route | Wallet rail |
| --- | --- | --- | --- | --- | --- | --- |
| Bittensor | `bittensor` | `beta_ready` | `beta_ready` | Beta | `/workspaces/bittensor` | `external_signer` |
| Hyperliquid | `markets` | `preview_only` | `preview_only` | Preview | `/workspaces/hyperliquid` | `evm_preview` |
| Polymarket | `markets` | `preview_only` | `preview_only` | Preview | `/workspaces/polymarket` | `evm_preview` |
| Wellness | `wellness` | `workflow_ready` | `workflow_ready` | Ready | `/workspaces/wellness` | `none` |
| Memory | `memory` | `beta_ready` | `beta_ready` | Beta | `/memory` | `none` |
| MCPs | `mcps` | `planned_not_live` | `local_only` | Soon | `/mcps` | `none` |

### Production consumption helpers

Codex should consume desks through these helpers instead of reading the raw registry:

- `CUSTOMER_DESK_ORDER` — stable launchpad/rail order for customer-visible desks.
- `getProtocolDeskManifest(id)` — returns the full `ProtocolDeskManifest` or `undefined`.
- `listCustomerProtocolDesks()` — returns customer-visible desks in `CUSTOMER_DESK_ORDER`.
- `getDeskLauncherPrompt(id)` — returns the suggested chat prompt for a desk launcher.
- `getDeskSafetySummary(id)` — returns a short safety sentence for the right rail or badge tooltip.
- `getDeskWalletRequirementSummary(id)` — returns a human-readable wallet requirement line.
- `getDeskLogoFallback(id)` — returns the fallback initials for a desk logo.

#### Example app usage

```tsx
import {
  listCustomerProtocolDesks,
  getDeskSafetySummary,
  getDeskWalletRequirementSummary,
  getDeskLogoFallback,
} from "@matterhorn-work/types";

function DeskLauncherGrid() {
  const desks = listCustomerProtocolDesks();
  return (
    <div className="desk-grid">
      {desks.map((desk) => (
        <DeskCard
          key={desk.id}
          title={desk.launcherTitle}
          description={desk.launcherDescription}
          prompt={desk.launcherPrompt}
          badgeLabel={desk.statusBadgeLabel}
          badgeTone={desk.statusBadgeTone}
          safetySummary={getDeskSafetySummary(desk.id)}
          walletSummary={getDeskWalletRequirementSummary(desk.id)}
          logoFallback={getDeskLogoFallback(desk.id)}
          route={desk.routeOrPanelId}
        />
      ))}
    </div>
  );
}
```

#### Launcher fields

Each desk exposes launcher-ready copy:

| Field | Purpose |
| --- | --- |
| `launcherTitle` | Card/launcher title |
| `launcherDescription` | One-line value proposition |
| `launcherPrompt` | Suggested chat prompt shown in the launcher |
| `rightRailSummary` | Short summary for the right rail or empty state |
| `logoAssetId` | Canonical logo asset identity |
| `officialLogoAssetId` | Canonical logo asset key for the desk |
| `logoAlt` | Alt text for the desk logo |
| `readinessTone` | Visual readiness tone: `beta_ready`, `preview_only`, `workflow_ready`, `local_only` |
| `statusBadgeLabel` | Badge text (e.g., "Beta", "Preview") |
| `statusBadgeTone` | Badge color tone (`success`, `caution`, `info`, `neutral`) |
| `primaryActionLabel` | Default CTA label for the desk's primary action |
| `capabilityBullets` | Array of plain-language capability bullets |
| `safetySummary` | Short safety summary emphasizing non-custodial behavior |
| `customerCapabilitySummary` | Plain-language summary of what the desk can do |
| `noCustodySafetyLine` | Short safety line emphasizing non-custodial behavior |
| `suggestedPromptTitles` | Array of beginner-friendly prompt titles for the launcher |
| `walletRailMode` | Simplified wallet UX mode: `external_signer`, `evm_preview`, `none` |
| `customerVisible` | Whether the desk should appear in customer-facing surfaces |

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

1. Render the desk list with `listCustomerProtocolDesks()` in `CUSTOMER_DESK_ORDER`; do not hard-code desk order.
2. Use `getProtocolDeskManifest(id)` when you need a single desk by ID.
3. Resolve logos through `PROTOCOL_BRAND_ASSET_REGISTRY` by `logoAssetKey`; use `getDeskLogoFallback(id)` for initials fallback.
4. Apply theme tokens from `lightThemeTokenHints` or `darkThemeTokenHints` based on the active theme.
5. Surface `getDeskSafetySummary(id)` and `getDeskWalletRequirementSummary(id)` in the right rail or badge tooltips.
6. Use `launcherTitle`, `launcherDescription`, `launcherPrompt`, and `rightRailSummary` for launcher cards and empty states.
7. Render `statusBadgeLabel` with `statusBadgeTone`; tone is one of `success`, `caution`, `info`, `neutral`.
8. Enable primary and secondary actions based on the desk manifest; respect `requiresConfirmation`.
9. Show `emptyStateCopy` when the desk has no session context and `degradedStateCopy` when a provider or index is unavailable.
10. Gate wallet-dependent desks by `walletRailMode` and `walletRequirements` before exposing on-chain actions.

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
