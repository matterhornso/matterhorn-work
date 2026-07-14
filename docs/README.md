# Matterhorn Work Documentation

This directory contains implementation guides, contracts, QA runbooks, design specifications, plans, and dated agent handoffs.

## Documentation Status

Use this precedence when documents disagree:

1. Current source code and automated tests.
2. The current implementation guides linked from this page.
3. Contract documents tied to shared types or test gates.
4. Dated handoffs, QA reports, and launch runbooks.
5. Historical plans, prototypes, and speculative design documents.

Dated handoffs describe the tree at a moment in time. They are valuable evidence, but they are not evergreen product documentation. Files under `docs/superpowers/` and prototype directories under `docs/ui/` should be read as design history unless a current guide explicitly adopts them.

## Start Here

- [Platform architecture](platform-architecture.md) - app, server, engine, storage, providers, and trust boundaries.
- [Product surfaces](product-surfaces.md) - current customer-facing navigation and behavior.
- [Platform safety gate](platform-safety-gate.md) - the required 10-stage verification gate.
- [Production launch configuration](production-launch-configuration.md) - setup ownership, safe environment defaults, and the release verification path.
- [Matterhorn design system](ui/matterhorn-design-system.md) - production UI rules.
- [Engine naming boundary](opencode-runtime-abstraction.md) - when to say Matterhorn Work engine vs. OpenCode.

## Core Product Guides

- [Notes](notes.md) - storage, APIs, autosave, filters, deletion, and Memory suggestions.
- [Response perspectives](response-perspectives.md) - Cautious, Balanced, and Optimistic framing without safety drift.
- [Wallet and signing](wallet-and-signing.md) - EVM and Sui connections, policy checks, previews, and external signing.
- [Outputs and generated media](outputs-and-generated-media.md) - readable evidence, images, NFT drafts, and receipts.
- [Settings overview](settings-overview.md) - current Settings information architecture.
- [MCP install guide](agent-mcp-install.md) - Codex, Claude Code, Claude Desktop, Cursor, and generic MCP clients.
- [Built-in MCP catalog](mcp/README.md) - product cards, runtime connection semantics, and protocol boundaries.
- [Agent control surface](agent-control-surface.md) - external agent control capabilities.
- [Agent operator workflow](agent-operator-workflow.md) - session, prompt, event, file, approval, and Bittensor operator loop.
- [Memory vault](memory/local-vault.md) - explicit local memory lifecycle.

## Protocol And Workflow Guides

- [Bittensor operator playbook](bittensor-operator-playbook.md)
- [Bittensor beta go-live runbook](bittensor-beta-go-live-runbook.md)
- [Hyperliquid read and preview](hyperliquid-read-preview.md)
- [Polymarket read and preview](polymarket-read-preview.md)
- [Longevity creator workflow](wellness-creator-workflow.md)
- [Decentralized services capability contract](decentralized-services-capability-contract.md)

## Generated Media And Evidence

Start with [Outputs and generated media](outputs-and-generated-media.md) for the current implementation and [Product surfaces](product-surfaces.md#outputs-and-generated-media) for its place in the app. Important historical evidence includes:

- [Project data ledger handoff](handoffs/project-data-ledger-v1-2026-07-06.md)
- [Generated-media output receipts](handoffs/codex-generated-media-output-receipts-2026-07-08.md)
- [Generated-media support report](handoffs/codex-generated-media-support-report-2026-07-08.md)
- [Generated-media browser smoke](handoffs/codex-generated-media-browser-smoke-2026-07-08.md)

## Design And UX

- [Matterhorn product UI system](ui/matterhorn-product-ui-system.md)
- [Protocol desk contract](ui/protocol-desk-contract.md)
- [App shell v2 specification](ui/app-shell-v2/SPEC.md)
- [Response perspectives: current implementation](ui/matterhorn-chat-perspectives-media-nft/chat-usp-and-response-modes.md#current-implementation)
- [Monday beta implementation punch list](ui/monday-beta-implementation-punch-list.md)

## Handoffs

Start current continuation work with:

- [Next session context - 2026-07-11](handoffs/next-session-context-2026-07-11.md)
- [Platform hardening ledger - 2026-07-10](handoffs/codex-platform-hardening-start-2026-07-10.md)

The handoff directory intentionally retains parallel-agent reports and historical integration evidence. Do not delete or consolidate those files merely because they overlap.

## Verification Shortcuts

```bash
# Complete platform gate
pnpm test:matterhorn-platform-safety

# App and server typechecks
pnpm --filter @matterhorn-work/app exec tsc -p tsconfig.json --noEmit
pnpm --filter matterhorn-work-server exec tsc -p tsconfig.json --noEmit

# Notes-focused verification
pnpm --filter @matterhorn-work/app exec bun test tests/notes-integration-contract.test.ts
pnpm --filter matterhorn-work-server exec bun test src/notes-routes.e2e.test.ts
```
