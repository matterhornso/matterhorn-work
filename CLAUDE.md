# Matterhorn Work — Cowork for Web3

> Fork of [different-ai/openwork](https://github.com/different-ai/openwork). Desktop agentic workspace with native wallet, on-chain actions, and Web3 skills.

## What You're Building

You're a Claude Code agent implementing crypto-native features into matterhorn-work. The repo is currently a clean fork — OpenWork with branding stripped and EE removed. Your job is to inject Web3 capabilities: wallet connect, on-chain transactions, session chain context, DeFi skills, and agent marketplace.

## Tech Stack

- **UI:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui (Base UI) — NOT Radix
- **State:** Zustand stores with React.useSyncExternalStore pattern
- **Package manager:** pnpm 10.27.0 — NEVER use npm or yarn
- **Wallet:** wagmi v2 + viem (to be installed)
- **Chains:** Base (8453) and Base Sepolia (84532)
- **MCP:** stdio transport, registered in opencode.jsonc
- **Brand:** background #0a0a0f, accent violet-500 (#7c3aed), dark theme only, no light mode

## Source Code Patterns (Read these files before writing any code)

### Zustand Store Pattern
The app uses Zustand-style stores exposed via React.useSyncExternalStore. See:
- `apps/app/src/react-app/domains/settings/state/extensions-store.ts` — full store with snapshot/emit/mutate pattern
- `apps/app/src/react-app/domains/settings/state/model-controls-store.ts` — simpler type-only store

Pattern: export a factory function that returns a store object. Stores have `getSnapshot()`, `subscribe()`, and action methods. Components use `useSyncExternalStore(store.subscribe, store.getSnapshot)`.

### Settings Page Pattern
- `apps/app/src/react-app/domains/settings/pages/general-view.tsx` — card grid layout with icons
- `apps/app/src/react-app/domains/settings/pages/skills-view.tsx` — list/detail pattern
- `apps/app/src/react-app/domains/settings/shell/tabs.tsx` — sidebar tab navigation

Settings pages use: `/** @jsxImportSource react */` pragma, lucide-react icons, `@/components/ui/button` for Button, `@/lib/utils` for cn().

### MCP Extension Pattern
Extensions are registered as MCP servers in opencode.jsonc:
```json
{
  "mcp": {
    "wallet": {
      "command": ["node", "packages/matterhorn-work-wallet-mcp/index.mjs"],
      "type": "local"
    }
  }
}
```
Extension state is managed via localStorage with `openwork.extension.*` key prefix. DO NOT rename this prefix — it's legacy from the fork and renaming would break existing extension state.

### Component Styling
- Use `cn()` from `@/lib/utils` for conditional classes
- Import components from `@/components/ui/` (Button, Card, Input, Modal, etc.)
- Use lucide-react for icons
- Colors: `bg-dls-sidebar`, `border-dls-border`, `text-gray-8` etc. from the design system
- Brand overrides: use violet-500 (#7c3aed) for wallet-themed elements

## Port Source: matterhorn-lite

The existing matterhorn-lite project has working wallet infra. Port from these files:
- `/Users/thebiglebowski/matterhorn/matterhorn-lite/lib/wagmi.ts` — chain config, USDC addresses, ERC-20 ABI, SKU constants
- `/Users/thebiglebowski/matterhorn/matterhorn-lite/lib/chains.ts` — additional chain metadata
- `/Users/thebiglebowski/matterhorn/Matterhorn-Agent/src/data/mcpSkills.ts` — 24 skill definitions for Web3 skill pack
- `/Users/thebiglebowski/matterhorn/Matterhorn-Agent/src/data/blueprints.ts` — 16 agent blueprints for marketplace

## Key Constants from matterhorn-lite (embed directly)

```typescript
// Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
// Base mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// USDC decimals: 6
// Dev receiver: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Anvil #1 — NOT a real matterhorn address)
```

## Architecture: Where Everything Goes

```
apps/app/src/react-app/domains/
  wallet/                               ← NEW: wallet domain
    state/
      wallet-store.ts                   ← Zustand store
    WalletPanel.tsx                     ← Sidebar panel
    WalletConnect.tsx                   ← Connect button + chain switcher
    TransactionApproval.tsx             ← TX preview + approve/reject

apps/app/src/react-app/
  infra/
    chains.ts                           ← NEW: Base/Base Sepolia config
    contracts.ts                        ← NEW: USDC addresses, ERC-20 ABI

packages/matterhorn-work-wallet-mcp/    ← NEW: MCP server
  package.json
  index.mjs

apps/app/public/
  matterhorn-wallet.svg                 ← NEW: wallet icon

.opencode/skills/web3/                  ← NEW: Web3 skill pack (Feature 4)
```

## Pitfalls

- **pnpm only** — pnpm 10.27.0. npm/yarn will break the workspace
- **Add wagmi to apps/app only** — not root workspace, not desktop, not server
- **Don't rename openwork.extension.* localStorage keys** — legacy from fork
- **Test on Base Sepolia only** — never test TX flows on mainnet
- **The RECEIVER_ADDRESS default is Anvil dev key** — explicitly NOT a real Matterhorn address. Don't change it.
- **No SSR** — this is a Vite SPA, not Next.js. No cookieStorage needed (unlike matterhorn-lite which uses Next.js).
- **Wallet MCP is stdio** — runs locally as a child process, talks to the browser wallet via window.ethereum
- **Never use `any`, typecasts, or `as`** unless 100% necessary
- **Keep diffs minimal** — smallest possible change to accomplish the task
