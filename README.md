# Matterhorn Work

> **Cowork for Web3.** Matterhorn Work is a fork of [different-ai/openwork](https://github.com/different-ai/openwork) (MIT license), built by [Matterhorn](https://matterhorn.so).

[![Fork of OpenWork](https://img.shields.io/badge/fork%20of-different--ai%2Fopenwork-brightgreen)](https://github.com/different-ai/openwork)

Matterhorn Work is a desktop agentic workspace with native wallet support, on-chain actions, and Web3 skills. It wraps the OpenCode agent runtime in an Electron shell, adds wallet connect, transaction approval, chain-aware sessions, and a DePIN agent marketplace — all in a dark-only theme with violet-500 (`#7c3aed`) accents on a `#0a0a0f` background.

---

## What we kept

OpenWork's battle-tested core, intact:

- **Local-first agentic workspace** — sessions, tool execution, streaming
- **Desktop + server mode** — Electron shell for interactive use, headless API for remote clients
- **MCP extensions** — installable modules for new capabilities, registered via `opencode.jsonc`
- **OpenCode integration** — agent loop with tool execution, permission gating, template workflows
- **Session streaming** — SSE-based real-time updates so users can watch agent execution live

## What we changed

| Removed / Replaced | With |
|-------------------|------|
| OpenWork EE (cloud sync, den-api, den-web) | Stripped — Matterhorn brings its own infra |
| OpenWork branding (logos, colors, name) | Matterhorn dark theme + brand system |
| `@matterhorn-work/*` package namespace | `@matterhorn-work/*` |
| `openwork-ui-mcp` | `matterhorn-work-ui-mcp` |

## What we added

| Feature | Description |
|---------|-------------|
| **Wallet connect** | Connect MetaMask, Coinbase Wallet, or any injected provider via wagmi v2 + viem |
| **On-chain transactions** | Agent proposes a TX → user approves in-workspace → TX broadcasts to Base or Base Sepolia |
| **Chain context** | Every agent session inherits the connected wallet's address and chain (Base 8453 / Base Sepolia 84532) |
| **Web3 skill pack** | 24 MCP skills covering DeFi protocols (Uniswap, Aave, Pendle), bridges (deBridge), DePIN (Akash, Helium, Render), and payments (x402, RBF Protocol) |
| **Agent marketplace** | Browse, hire, and deploy agents to DePIN compute — credentialled with ERC-8004 passports |

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

```
apps/
  app/          React 19 UI (Vite SPA, Tailwind, shadcn/ui)
  desktop/      Electron shell
  server/       OpenCode agent server
packages/
  matterhorn-work-wallet-mcp/   Wallet MCP server (stdio transport)
  matterhorn-work-ui-mcp/       UI control MCP server
  ui/                           Shared component library
.opencode/
  skills/web3/                 24 Web3 skill definitions
```

Every session carries wallet context. The agent can propose on-chain actions, and the wallet panel surfaces them for user approval — no extension popups, no copy-pasting addresses.

---

## Acknowledgements

Built on [OpenWork](https://github.com/different-ai/openwork) by [Different AI](https://different.ai). OpenWork is powered by [OpenCode](https://opencode.ai). See the [upstream contributors](https://github.com/different-ai/openwork/graphs/contributors) for the foundation this project stands on.
