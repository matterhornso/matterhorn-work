# Matterhorn MCP Catalog Contract

> **Owner:** Kimi  
> **Audience:** Codex, MCP tooling, product, QA  
> **Scope:** Typed contracts and registry for customer-facing Matterhorn MCPs. Does not cover third-party MCP discovery or generic MCP server hosting.

## Goal

Make the MCPs desk data-driven so the production UI can render Matterhorn MCP cards without hardcoded copy islands. Every customer-facing Matterhorn MCP is declared in `MATTERHORN_MCP_CATALOG_REGISTRY` in `packages/types/src/matterhorn-workflows.ts`.

## Contract shape

```ts
interface MatterhornMcpCatalogItem {
  version: "matterhorn.mcp.catalog.item.v1";
  id: string;
  displayName: string;
  deskId: string;
  description: string;
  installCommand: string;
  supportedTools: MatterhornMcpToolDescriptor[];
  safetyBoundary: MatterhornMcpSafetyBoundary;
  compatibleClients: MatterhornMcpCompatibleClient[];
  status: MatterhornMcpStatus;
  documentationUrl?: string;
  isBuiltIn: boolean;
}
```

### Tool descriptor

```ts
interface MatterhornMcpToolDescriptor {
  name: string;
  description: string;
  isReadOnly: boolean;
}
```

### Safety boundary

```ts
interface MatterhornMcpSafetyBoundary {
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
  requiresUserConfirmation: boolean;
  operatesOnPublicDataOnly: boolean;
}
```

### Status values

| Status | Meaning |
| --- | --- |
| `live` | MCP is implemented and available for install today. |
| `preview` | MCP is implemented but still in preview; expect changes. |
| `requires_setup` | MCP requires additional user configuration before use. |
| `planned` | MCP is planned but not yet implemented. |

### Compatible clients

- `codex`
- `claude_code`
- `claude_desktop`
- `cursor`
- `windsurf`
- `generic_sse`

## Current catalog

| ID | Display name | Desk | Status | Built-in | Notes |
| --- | --- | --- | --- | --- | --- |
| `matterhorn-bittensor` | Matterhorn Bittensor | `bittensor` | `preview` | yes | Public reads and unsigned previews; external signer required for handoffs. |
| `matterhorn-hyperliquid` | Matterhorn Hyperliquid | `hyperliquid` | `live` | yes | Read/preview/handoff/receipt only; no live submission. |
| `matterhorn-polymarket` | Matterhorn Polymarket | `polymarket` | `live` | yes | Search/read/preview/handoff/receipt only; no live bet placement. |
| `matterhorn-memory` | Matterhorn Memory | `memory` | `live` | yes | User-confirmed memory only; no hidden saves. |
| `matterhorn-workflow` | Matterhorn Workflow | `workflow` | `preview` | yes | Invoke workflow templates locally; reviewed before external step. |
| `matterhorn-ui-control` | Matterhorn UI Control | `ui_control` | `planned` | yes | Local UI actions only; no backend execution. |

## Relationship to desk manifests

Each MCP catalog item maps to a desk via `deskId`. The desk manifest (`ProtocolDeskManifest`) describes the customer-facing surface; the MCP catalog item describes the installable extension that backs the desk for agent clients. For example:

- `matterhorn-hyperliquid` → `hyperliquid` desk
- `matterhorn-memory` → `memory` desk
- `matterhorn-ui-control` → not a customer desk; a cross-cutting UI control MCP

## Safety invariants

- `liveSubmissionEnabled: false` on every catalog item.
- `canSubmit: false` on every catalog item.
- `acceptsPrivateKeys`, `acceptsSeedPhrases`, `acceptsApiSecrets`, `acceptsRawSignatures`, `acceptsSignedPayloads`, and `acceptsWalletExports` are all `false`.
- Market MCPs (Hyperliquid, Polymarket) do not allow real funds and do not require an external signer at the MCP boundary (the client signs).
- Bittensor MCP requires an external signer and operates on public data only.
- Memory MCP requires user confirmation and has no hidden saves.
- UI Control MCP is local-only and cannot execute backend operations.

## Consumption

```tsx
import {
  MATTERHORN_MCP_CATALOG_REGISTRY,
  listMatterhornMcpCatalogItems,
  getMatterhornMcpCatalogItem,
} from "@matterhorn-work/types";

const item = getMatterhornMcpCatalogItem("matterhorn-hyperliquid");
const all = listMatterhornMcpCatalogItems();
```

## Verification

```bash
pnpm --dir packages/types build
pnpm test:mcp-catalog-contract
pnpm test:market-execution-safety-gate
```
