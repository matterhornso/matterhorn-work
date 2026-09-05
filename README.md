# Matterhorn Desks

Matterhorn Desks is a guarded agent workspace for chat, protocol research, persistent crypto coworkers, reviewed transaction preparation, project notes, Memory, encrypted Agent Files, and evidence-backed outputs.

The customer experience is organized around desks rather than raw tools:

- **Bittensor:** public TAO wallet reads, subnet and validator research, watches, and compatible connected-wallet review for supported testnet actions.
- **Hyperliquid:** market, funding, orderbook, account, and position research with exact connected-wallet order review.
- **Polymarket:** market discovery, outcome and liquidity research, jurisdiction-aware wallet previews, and receipts.
- **Sui:** wallet-standard connection, public account reads, dry-run transfer review, receipt evidence, and optional wallet-created testnet lifecycle actions for encrypted Walrus records.
- **Longevity:** non-medical service workflows for trainers, yoga instructors, dieticians, coaches, and client packet creation.
- **Memory, Notes, and Outputs:** project-owned context, explicit memory review, and readable evidence rather than hidden persistence.

Matterhorn does not ask for seed phrases, private keys, mnemonics, wallet exports, raw signatures, signed payloads, or API secrets. Matterhorn and its agents never sign or submit financial transactions; the connected wallet is the final authority on supported paths.

## Current Product Surfaces

| Surface | Current behavior |
| --- | --- |
| Chat | Matterhorn Desks engine with streaming, tools, permissions, and session state. OpenCode is the underlying runtime. |
| Response perspective | Per-session Cautious, Balanced, or Optimistic framing. Safety rules never change with perspective. |
| Project Home | Start chats, open desks, inspect wallet readiness, view recent activity, and reach notes or outputs. |
| Wallet | EVM and Sui connection, workspace safety policy, reviewed transaction previews, and an audit-oriented safety ledger. |
| Notes | Workspace-local notes with search, filters, buffered autosave, linked context, deletion, and explicit Memory suggestions. |
| Memory | Suggestion inbox and explicit confirm/edit/dismiss lifecycle. No hidden memory writes. |
| Outputs | Images, documents, receipts, and structured JSON summaries with raw data behind disclosure. |
| MCPs & Tools | Built-in Matterhorn MCP catalog plus live status for configured MCP server processes. |
| Settings | Profile, permissions, providers, generated media, MCPs, wallet policy, appearance, diagnostics, and cloud readiness. |

## Quick Start

```bash
git clone https://github.com/matterhornso/matterhorn-work.git
cd matterhorn-work
pnpm install
pnpm dev
```

Requirements:

- Node.js and pnpm 10+
- Bun for the server and test suites
- macOS for the current Electron development path

For the deterministic local web stack used by product QA:

```bash
pnpm dev:matterhorn-local
```

The launcher prints the UI, Matterhorn server, and managed OpenCode runtime URLs. Treat tokens printed by local launchers as secrets.

## Architecture

```text
apps/
  app/                React application and customer UI
  desktop/            Electron shell and trusted desktop IPC
  server/             Workspace-scoped control plane and storage APIs
  opencode-router/    Token-protected local messaging/router bridge
  orchestrator/       Local process and MCP configuration CLI
packages/
  matterhorn-work-mcp/          Server-control MCP
  matterhorn-work-wallet-mcp/   Local wallet MCP
  matterhorn-work-crypto-mcp/   Markets, protocol, security, and Bittensor MCP
  matterhorn-memory-vault/      Explicit memory lifecycle and storage
  types/                         Shared API and product contracts
  ui/                            Shared UI primitives
.opencode/
  agents/              Desk-specific agent profiles
  skills/              Workspace skills
```

Normal chat is routed through the managed **Matterhorn Desks engine**, powered by the underlying OpenCode coding-agent runtime. Direct provider APIs are reserved for specialized capabilities such as image generation or realtime voice; they are not the default chat path.

## Safety And Verification

Run focused tests for the area being changed, then run the complete platform gate before a PR:

```bash
pnpm test:matterhorn-platform-safety
```

The gate covers wallet behavior, money-path backend security, desk depth, billing integrity, local router and Electron boundaries, observability, design contracts, browser-smoke contracts, and product readiness.

## Documentation

Start with [docs/README.md](docs/README.md). It distinguishes current implementation docs from historical plans and dated handoffs.

Key guides:

- [Guarded Agent Architecture v3](docs/architecture/matterhorn-guarded-agent-architecture-v3.md)
- [Core platform architecture](docs/platform-architecture.md)
- [Product surfaces](docs/product-surfaces.md)
- [Notes](docs/notes.md)
- [Response perspectives](docs/response-perspectives.md)
- [Wallet and signing](docs/wallet-and-signing.md)
- [Outputs and generated media](docs/outputs-and-generated-media.md)
- [MCP installation](docs/agent-mcp-install.md)
- [Platform safety gate](docs/platform-safety-gate.md)
- [Matterhorn design system](docs/ui/matterhorn-design-system.md)
- [Engine/OpenCode naming boundary](docs/opencode-runtime-abstraction.md)

## Releases

Release artifacts are published through [GitHub Releases](https://github.com/matterhornso/matterhorn-work/releases). Packaging and code-signing readiness vary by build; check the release notes before distributing a desktop artifact.
