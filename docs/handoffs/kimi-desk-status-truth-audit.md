# Desk Status Truth Audit

> **Date:** 2026-06-26  
> **Branch:** `kimi/desk-status-truth-audit`  
> **PR:** #596  
> **Owner:** Kimi  
> **Audience:** Codex, product, QA, GTM  

## What changed

`ProtocolDeskManifest` now exposes three machine-checkable truth labels for every customer-facing desk:

- `backendStatus` — what the Matterhorn backend actually does today
- `actionStatus` — what kind of actions the desk supports
- `extensionStatus` — whether the desk is backed by live Matterhorn extensions, a static catalog, or requires user setup

These labels are separate from marketing readiness (`status` / `readinessTone`) so the UI can render honest "real / partial / preview / catalog" badges without guessing.

## Status vocabulary

### `backendStatus`

| Value | Meaning |
| --- | --- |
| `live` | Backend actively reads/writes real data for this desk. |
| `partial` | Backend has live reads but relies on external signer/client for writes. |
| `preview` | Backend produces previews only; no live submission. |
| `static_catalog` | Desk works from static/local content; no live backend integration. |
| `disabled` | Desk is not wired to a live backend yet. |

### `actionStatus`

| Value | Meaning |
| --- | --- |
| `read_only` | Actions read existing data only. |
| `preview_only` | Actions build previews that are never submitted. |
| `external_signer` | Actions prepare handoffs signed outside Matterhorn. |
| `workflow_only` | Actions run local workflows without on-chain or live provider execution. |

### `extensionStatus`

| Value | Meaning |
| --- | --- |
| `built_in_live` | Matterhorn ships live, built-in MCPs/tools for this desk today. |
| `built_in_partial` | Matterhorn ships some built-in tools; others are planned or external. |
| `static_catalog` | Desk is driven by a static catalog of templates/workflows, not live extensions. |
| `requires_setup` | User must install or configure an extension before the desk is functional. |

## Current desk truth table

| Desk | `status` | `readinessTone` | `backendStatus` | `actionStatus` | `extensionStatus` | What this means |
| --- | --- | --- | --- | --- | --- | --- |
| Bittensor | `beta_ready` | `beta_ready` | `partial` | `external_signer` | `built_in_partial` | Live reads; stake/unstake/transfer handoffs go to external signer. Some tools are live, others still maturing. |
| Hyperliquid | `preview_only` | `preview_only` | `preview` | `preview_only` | `built_in_live` | Live market reads and previews only; built-in MCPs prepare handoffs and verify receipts. No live submission. |
| Polymarket | `preview_only` | `preview_only` | `preview` | `preview_only` | `built_in_live` | Live market research and previews only; built-in MCPs prepare handoffs and verify receipts. No live bet placement. |
| Wellness | `workflow_ready` | `workflow_ready` | `static_catalog` | `workflow_only` | `static_catalog` | Local workflow generation from static templates. No live payments, email, hosting, or data access. |
| Memory | `beta_ready` | `beta_ready` | `live` | `read_only` | `built_in_live` | Reads and manages saved memory; writes are local/user-controlled. Built-in memory tools are live. |
| MCPs | `planned_not_live` | `local_only` | `disabled` | `workflow_only` | `requires_setup` | Desk is not wired to a live backend. Real MCP tools require user installation and setup. |

## Safety invariants enforced by tests

- `liveSubmissionEnabled: false` on every desk.
- All secret-acceptance flags (`acceptsPrivateKeys`, `acceptsSeedPhrases`, `acceptsApiSecrets`, `acceptsRawSignatures`, `acceptsSignedPayloads`, `acceptsWalletExports`) are `false`.
- Hyperliquid and Polymarket:
  - `backendStatus: "preview"`
  - `actionStatus: "preview_only"`
  - Manifest copy never mentions submit, sign, custody, API secrets, private keys, raw signatures, or signed payloads.
- Bittensor:
  - `backendStatus: "partial"`
  - `actionStatus: "external_signer"`
  - `requiresExternalSigner: true`
- Wellness:
  - `backendStatus: "static_catalog"`
  - `actionStatus: "workflow_only"`
  - Non-medical and educational.
  - Copy never mentions live payment, live email, or live hosting.
- MCPs:
  - `backendStatus: "disabled"`
  - `extensionStatus: "requires_setup"`

## What this unblocks

Codex can now render honest desk cards and extension surfaces without hard-coding assumptions:

```tsx
const desk = getProtocolDeskManifest("hyperliquid");
<TruthBadge backend={desk.backendStatus} action={desk.actionStatus} extension={desk.extensionStatus} />
```

GTM can use the truth table above to describe which desks are real, preview, or catalog-only in external messaging.

## Verification

```bash
pnpm --dir packages/types build
pnpm test:matterhorn-workflow-contract
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:market-execution-safety-gate
```

## Files changed

- `packages/types/src/matterhorn-workflows.ts`
- `scripts/protocol-desk-visual-contract.test.mjs`
- `docs/handoffs/kimi-desk-status-truth-audit.md`
