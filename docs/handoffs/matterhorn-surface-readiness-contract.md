# Matterhorn Surface Readiness Contract

> **Owner:** Kimi  
> **Audience:** Codex, product, QA, GTM  
> **Scope:** Typed feature-linkage matrix for every customer-facing Matterhorn surface.

## Goal

Provide a single machine-checkable registry that declares, for each customer-facing surface:

- What it is (desk, setting, MCP, wallet, memory, workflow)
- Its current readiness status
- Its UI route/panel, backend route/tool, MCP equivalent, and CLI equivalent
- Who owns it
- Its safety posture (submit, live submission, custody, secret inputs)

Production UI can render badges, filter surfaces, and block unsupported flows from this registry instead of hardcoding assumptions.

## Contract shape

```ts
interface MatterhornSurfaceReadinessEntry {
  version: "matterhorn.surface.readiness.v1";
  id: string;
  displayName: string;
  kind: "desk" | "setting" | "mcp" | "wallet" | "memory" | "workflow";
  status: "ready" | "needs_setup" | "preview" | "desktop_only" | "cloud_only" | "developer";
  routeOrPanelId: string;
  backendRouteOrTool?: string;
  mcpEquivalent?: string;
  cliEquivalent?: string;
  owner: "matterhorn" | "protocol" | "customer" | "third_party";
  safetyPosture: {
    canSubmit: boolean;
    liveSubmissionEnabled: boolean;
    custody: boolean;
    secretInputsAllowed: boolean;
  };
  notes?: string;
}
```

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `ready` | Live and usable by customers without additional setup. |
| `needs_setup` | Functional but requires user configuration before use. |
| `preview` | Available but not final; may change or lack full backend support. |
| `desktop_only` | Requires the desktop app and does not work in cloud/web. |
| `cloud_only` | Managed in the cloud; not available locally. |
| `developer` | Intended for advanced users/developers. |

## Feature-linkage matrix

| Surface | Kind | Status | UI route | Backend / tool | MCP equivalent | CLI equivalent | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bittensor Desk | desk | `preview` | `/workspaces/bittensor` | Subnet reads + handoff | `matterhorn-bittensor` | `matterhorn-work bittensor handoff` | protocol | External signer required |
| Hyperliquid Desk | desk | `preview` | `/workspaces/hyperliquid` | Market reads + handoff | `matterhorn-hyperliquid` | `matterhorn-work hyperliquid handoff` | protocol | No live order submission |
| Polymarket Desk | desk | `preview` | `/workspaces/polymarket` | Market reads + handoff | `matterhorn-polymarket` | `matterhorn-work polymarket handoff` | protocol | No live bet placement |
| Wellness Desk | desk | `ready` | `/workspaces/wellness` | Local workflow generation | — | `matterhorn-work workflow run wellness_creator_services` | matterhorn | Non-medical, no live services |
| Memory Desk | memory | `ready` | `/memory` | Memory API | `matterhorn-memory` | `matterhorn-work memory review` | matterhorn | User-confirmed only |
| MCP Tools Desk | mcp | `needs_setup` | `/mcps` | Catalog registry | `MATTERHORN_MCP_CATALOG_REGISTRY` | `matterhorn-work mcps browse` | matterhorn | Real MCPs require client setup |
| Wallet Settings | wallet | `needs_setup` | `/settings/wallet` | Wallet rail config | — | `matterhorn-work config wallet` | customer | Matterhorn never holds keys |
| Profile Settings | setting | `ready` | `/settings/profile` | Profile API | — | — | matterhorn | Basic profile/preferences |
| AI Providers Settings | setting | `cloud_only` | `/settings/ai-providers` | Encrypted cloud provider metadata | — | `matterhorn-work config providers` | matterhorn | Keys never exposed to UI |
| Environment Settings | setting | `developer` | `/settings/environment` | Local env store | — | `matterhorn-work config env` | customer | Desktop-only developer surface |
| Agent Marketplace | setting | `preview` | `/marketplace` | Static catalog API | — | `matterhorn-work marketplace list` | matterhorn | Browse only; install may need setup |
| Feedback | setting | `ready` | `/feedback` | Feedback API | — | `matterhorn-work feedback` | matterhorn | Safe user feedback |
| SubscribeToMe Integration | workflow | `needs_setup` | `/workflows/subscribetome` | Planned webhook handler | — | — | third_party | Future integration |

## Safety invariants

- Market desk surfaces (`bittensor_desk`, `hyperliquid_desk`, `polymarket_desk`) must have:
  - `canSubmit: false`
  - `liveSubmissionEnabled: false`
  - `custody: false`
  - `secretInputsAllowed: false`
- Demo/static/setup surfaces are never marked `ready`.
- AI providers settings are `cloud_only` because provider keys are stored encrypted in the cloud and never returned to the UI.
- Environment settings are `developer` because they are desktop-only and advanced.
- Wallet settings are `needs_setup` because the user must connect an external signer or read-only address.
- MCP Tools desk is `needs_setup` because real MCPs require installation in a compatible client.

## Consumption

```tsx
import {
  SURFACE_READINESS_REGISTRY,
  listMatterhornSurfaceReadinessEntries,
  listSurfacesByKind,
  listSurfacesByStatus,
} from "@matterhorn-work/types";

const surface = SURFACE_READINESS_REGISTRY["hyperliquid_desk"];
const desks = listSurfacesByKind("desk");
const readySurfaces = listSurfacesByStatus("ready");
```

## Verification

```bash
pnpm --dir packages/types build
pnpm test:surface-readiness-contract
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-workflow-contract
```
