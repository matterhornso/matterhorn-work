# Matterhorn Work

> **Cowork for Web3.** A desktop agentic workspace with native wallet support and on-chain actions, built by [Matterhorn](https://matterhorn.so).

Matterhorn Work is a desktop agentic workspace where crypto-native AI agents plan and execute on-chain actions. Wallet connect, transaction approval, chain-aware sessions, and a DePIN agent marketplace — all in a dark-only theme with violet-500 (`#7c3aed`) accents on a `#0a0a0f` background.

---

## What Matterhorn Work Is

Matterhorn Work is a practical control surface for agentic work with crypto-native capabilities:

- **Local-first agentic workspace** — run agent workflows from one place with full tool execution and streaming
- **Desktop + server mode** — Electron shell for interactive use, headless API for remote clients
- **OpenCode integration** — agent loop with tool execution, permission gating, template workflows
- **MCP extensions** — installable modules for new capabilities, registered via `opencode.jsonc`
- **Session streaming** — SSE-based real-time updates so users can watch agent execution live
- **Crypto-native** — every session carries wallet + chain context; agents propose on-chain actions, user approves in-workspace
- **Composable** — use the desktop app, messaging connectors, or server mode based on the task

---

## Features

| Feature | Description |
|---------|-------------|
| **Wallet connect** | Connect MetaMask, Coinbase Wallet, or any injected provider via wagmi v2 + viem |
| **On-chain transactions** | Agent proposes a TX → user approves in-workspace → TX broadcasts to Base or Base Sepolia |
| **Chain context** | Every agent session inherits the connected wallet's address and chain (Base 8453 / Base Sepolia 84532) |
| **Bittensor workspace** | Watch-only SS58 wallet view, subnet explorer, subnet utility summaries, and quote-only TAO action prep |
| **Web3 skill pack** | 24 MCP skills covering DeFi protocols (Uniswap, Aave, Pendle), bridges (deBridge), DePIN (Akash, Helium, Render), and payments (x402, RBF Protocol) |
| **Agent marketplace** | Browse, hire, and deploy agents to DePIN compute — credentialled with ERC-8004 passports |
| **Background job scheduling** | Cron-based agent execution without keeping the workspace open |
| **ENS address book** | Resolve and manage ENS names with favorites and groups |
| **Token price feeds** | Real-time pricing via CoinGecko API |
| **Multi-protocol DeFi** | Aave V3 (borrow/repay/withdraw), CoW Swap (limit orders), cross-chain bridging |

---

### Optional Bittensor data

Set `TAO_APP_API_KEY` on the Matterhorn Work server to unlock TAO.app portfolio endpoints. Without it, subnet browsing still uses available public/fallback data and wallet portfolio views show a provider-unavailable state. Matterhorn Work never asks for Bittensor seed phrases or private keys.

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

## Download

Pre-built macOS (Apple Silicon):
- **[DMG](https://github.com/matterhornso/matterhorn-work/releases/latest)** — drag to Applications
- **[ZIP](https://github.com/matterhornso/matterhorn-work/releases/latest)** — unzip and run

Not code-signed yet — right-click → Open on first launch.
