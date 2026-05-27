# Matterhorn Work

> **Cowork for Web3.** A fork of [different-ai/openwork](https://github.com/different-ai/openwork) by [Matterhorn](https://matterhorn.so).

[![Fork of OpenWork](https://img.shields.io/badge/fork%20of-different--ai%2Fopenwork-brightgreen)](https://github.com/different-ai/openwork)

Matterhorn Work is the agentic workspace reimagined for Web3. Same desktop experience as OpenWork — local-first, composable, session-based — with crypto-native additions: wallet-connected actions, on-chain transaction approval, DePIN agent deployment, and a Web3 skill marketplace.

---

## What we kept

| Component | What it is | Why we kept it |
|-----------|-----------|----------------|
| Desktop shell | Electron app with session management | Proven multi-platform packaging |
| OpenCode integration | Agent loop with tool execution | Battle-tested agent runtime |
| Permission system | Allow-once / always / deny gating | Critical for autonomous on-chain actions |
| Server mode | Headless API for remote clients | Enables headless agents and team sharing |
| Session streaming | SSE-based real-time updates | Users need to watch agent execution live |
| Template workflows | Saved, repeatable task patterns | Reusable agent workflows save time |
| Extension system | Installable modules for new capabilities | Wallet is an extension, not a bolt-on |

## What we changed

| Removed / Replaced | With |
|-------------------|------|
| OpenWork EE (cloud sync, den-api, den-web) | Stripped — Matterhorn brings its own infra |
| OpenWork branding (logos, colors, name) | Matterhorn dark theme + brand system |
| Generic skills | 24 Web3 MCP skills (DeFi protocols, bridges, DEXes) |
| `@openwork/*` package namespace | `@matterhorn-work/*` |
| `openwork-ui-mcp` | `matterhorn-work-ui-mcp` |

## What we added

```
packages/
  matterhorn-work-ui-mcp/         ← MCP server for Matterhorn Work UI control
```

Phase 2 additions (in progress):
- Wallet panel extension (wagmi + viem, EVM + Solana)
- `send_transaction` agent tool (routed through connected wallet)
- Agent marketplace (deploy agents to DePIN, list for hire)
- ERC-8004 passport credentialing for deployed agents
- Chain-aware session context (every session knows wallet + chain)

---

## Quick start

```bash
git clone https://github.com/matterhornso/matterhorn-work.git
cd matterhorn-work
pnpm install
pnpm dev
```

Requires pnpm 10+. The desktop app launches with an Electron shell connected to an OpenCode agent instance.

---

## Architecture

Matterhorn Work inherits OpenWork's architecture: an Electron desktop app (`apps/desktop`) that wraps a React UI (`apps/app`), which consumes an OpenCode agent server. The server can run locally or connect to a remote worker.

What's different: every session carries wallet context. The agent can propose on-chain actions, and the wallet panel surfaces them for user approval — no extension popups, no copy-pasting addresses.

---

## Acknowledgements

Built on [OpenWork](https://github.com/different-ai/openwork) by [Different AI](https://different.ai). OpenWork is powered by [OpenCode](https://opencode.ai). See the [upstream contributors](https://github.com/different-ai/openwork/graphs/contributors) for the foundation this project stands on.
