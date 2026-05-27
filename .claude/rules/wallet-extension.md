# Feature 1: Wallet Extension

**Priority:** P0 — everything depends on this

## Goal

Users connect a wallet (MetaMask, Coinbase, injected) inside Matterhorn Work. The wallet state is available to the agent via MCP tools. The agent can propose transactions; user approves in-workspace.

## Dependencies

- wagmi v2 (install: `pnpm add wagmi viem @tanstack/react-query` in apps/app)
- @tanstack/react-query (wagmi peer dep)

## Task 1.1: Port chain config and contract constants

Create two files porting constants from matterhorn-lite's wagmi.ts.

**Create `apps/app/src/react-app/infra/chains.ts`:**
```typescript
import { base, baseSepolia } from "wagmi/chains";

export const MATTERHORN_CHAINS = {
  baseSepolia,
  base,
} as const;

export type MatterhornChainId = (typeof MATTERHORN_CHAINS)[keyof typeof MATTERHORN_CHAINS]["id"];

export const CHAIN_NAMES: Record<number, string> = {
  [baseSepolia.id]: "Base Sepolia",
  [base.id]: "Base",
};

export const DEFAULT_CHAIN = baseSepolia;
```

**Create `apps/app/src/react-app/infra/contracts.ts`:**
```typescript
import { base, baseSepolia } from "wagmi/chains";

export const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  [baseSepolia.id]: "0x036CbD53842c5426634e7949541eC2318f3dCF7e",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export const USDC_DECIMALS = 6;

export const RECEIVER_ADDRESS: `0x${string}` = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
```

## Task 1.2: Install wagmi + viem dependencies

Run in apps/app directory:
```bash
cd apps/app && pnpm add wagmi viem @tanstack/react-query
```

Verify: `grep wagmi apps/app/package.json` shows the dep.

## Task 1.3: Create wallet Zustand store

**Create `apps/app/src/react-app/domains/wallet/state/wallet-store.ts`:**

The store must follow the existing Zustand+useSyncExternalStore pattern from extensions-store.ts.

Store shape:
```typescript
type WalletStoreSnapshot = {
  address: `0x${string}` | null;
  chainId: number | null;
  ethBalance: string | null;       // formatted ETH string
  usdcBalance: string | null;      // formatted USDC string
  isConnected: boolean;
  isConnecting: boolean;
  connector: string | null;        // "metaMask" | "coinbaseWallet" | "injected"
  transactions: TxRecord[];        // last 20 TXs
  error: string | null;
};
```

Actions:
- `connect(connectorName: string)` — trigger wagmi connect
- `disconnect()` — disconnect wallet
- `switchChain(chainId: number)` — switch network
- `refreshBalance()` — fetch ETH + USDC balance
- `sendTransaction(to, value, data?)` — prepare TX for approval

Pattern:
```typescript
// Use subscribe/getSnapshot pattern, NOT React hooks in the store
const listeners = new Set<() => void>();
let snapshot: WalletStoreSnapshot = { /* initial state */ };

function emitChange() {
  for (const listener of listeners) listener();
}

function mutate(updater: (s: WalletStoreSnapshot) => WalletStoreSnapshot) {
  snapshot = updater(snapshot);
  emitChange();
}

export function createWalletStore(): WalletStore {
  // return object with subscribe, getSnapshot, and action methods
}

export function useWalletStore(store: WalletStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
}
```

Do NOT import wagmi hooks inside the store. The store is a plain object factory. Wagmi hooks are used in React components (Tasks 1.4-1.6) that read from the store.

## Task 1.4: Create WalletConnect component

**Create `apps/app/src/react-app/domains/wallet/WalletConnect.tsx`:**

- Uses wagmi hooks (useAccount, useConnect, useDisconnect, useChainId, useSwitchChain)
- "Connect Wallet" button when disconnected
- Shows truncated address (0x1234...abcd) + chain badge when connected
- Dropdown: Copy Address, Switch Chain, Disconnect
- Style: follow existing button patterns (use @/components/ui/button)

Pattern for truncation:
```typescript
function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
```

## Task 1.5: Create WalletPanel sidebar component

**Create `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`:**

Collapsible panel showing:
- Connected address (truncated + copy button)
- Chain name badge (Base / Base Sepolia) with colored dot
- ETH balance
- USDC balance
- Recent transactions (last 5, with hash truncated + status)

Style: match existing sidebar panel styling. Use `cn()` for conditional classes. Import lucide-react icons (Wallet, Copy, ExternalLink, ChevronDown).

## Task 1.6: Create TransactionApproval component

**Create `apps/app/src/react-app/domains/wallet/TransactionApproval.tsx`:**

Modal that appears when an agent proposes a transaction. Shows:
- **To:** recipient address (truncated + full on hover)
- **Value:** ETH or USDC amount
- **Data:** call data (truncated, expandable)
- **Gas estimate:** estimated gas in ETH
- **Approve** button (violet-500, primary)
- **Reject** button (secondary/ghost)

Use existing modal patterns from the app (check `apps/app/src/react-app/domains/settings/modals/` for patterns).

## Task 1.7: Create wallet MCP package

**Create `packages/matterhorn-work-wallet-mcp/package.json`:**
```json
{
  "name": "matterhorn-work-wallet-mcp",
  "version": "0.1.0",
  "description": "MCP server for Matterhorn Work wallet",
  "type": "module",
  "bin": {
    "matterhorn-work-wallet-mcp": "index.mjs"
  },
  "license": "MIT"
}
```

**Create `packages/matterhorn-work-wallet-mcp/index.mjs`:**

Implement a Model Context Protocol server using stdio transport. Tools:
- `wallet_connect` — returns JSON: `{ address, chainId, chainName }`
- `wallet_sendTransaction` — params: `{ to, value, data? }`, returns `{ status: "pending_approval" | "approved" | "rejected", txHash? }`
- `wallet_signMessage` — params: `{ message }`, returns `{ signature }`
- `wallet_getBalance` — returns `{ eth, usdc, chainId }`

MCP stdio protocol basics:
- Read JSON-RPC messages from stdin (one per line)
- Write JSON-RPC responses to stdout
- Handle `initialize`, `tools/list`, `tools/call` methods

For the MVP, wallet MCP communicates with the browser wallet via a message channel. The actual wallet operations happen in the browser (wagmi). The MCP server acts as a bridge: it returns pending_approval status, and the UI handles the actual approval flow.

## Task 1.8: Register wallet MCP in opencode.jsonc

Add to `apps/app/.opencode/opencode.json` (or create if it doesn't exist):
```jsonc
{
  "mcp": {
    "wallet": {
      "command": ["node", "../../packages/matterhorn-work-wallet-mcp/index.mjs"],
      "type": "local"
    }
  }
}
```

## Task 1.9: Wallet unit tests

**Create `apps/app/src/react-app/domains/wallet/state/wallet-store.test.ts`:**

Test state transitions:
- Initial state: isConnected=false, address=null
- After connect: isConnected=true, address set
- After disconnect: back to disconnected state
- balance updates
- TX history append

Use vitest. Pattern: `import { describe, it, expect } from "vitest"`

Run: `pnpm --filter @matterhorn-work/app test -- wallet-store`

## Task 1.10: E2E smoke test (manual)

1. Run dev server: `pnpm dev:ui`
2. Open in browser
3. Verify WalletConnect button renders
4. Connect MetaMask (Base Sepolia)
5. Verify address appears in wallet panel
6. Verify agent MCP discovers wallet tools

## Task 1.11: Commit and push

```bash
git checkout -b feat/wallet-extension
git add -A
git commit -m "feat: wallet extension — connect, panel, MCP server, TX approval"
git push origin feat/wallet-extension
```

Create a PR to dev from the feat/wallet-extension branch.

## Verification Checklist

After completing all tasks:
- [ ] `pnpm --filter @matterhorn-work/app typecheck` passes (or new errors are only from wagmi types)
- [ ] `pnpm --filter @matterhorn-work/app build` succeeds
- [ ] Wallet icon renders in app shell
- [ ] Connect flow works with MetaMask on Base Sepolia
- [ ] Wallet panel shows balance after connect
- [ ] Wallet MCP server starts: `node packages/matterhorn-work-wallet-mcp/index.mjs`
- [ ] MCP is registered in opencode config
