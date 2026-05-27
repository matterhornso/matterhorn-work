# Feature 2: Chain-Aware Session Context

**Priority:** P0 — must land after wallet extension, before TX pipeline

## Goal

Every agent session inherits the connected wallet's address and chain. The agent always knows who it's acting for and on what chain. This is injected into the OpenCode system prompt.

## Dependencies

- Feature 1 (Wallet Extension) must be complete — wallet store exists

## Task 2.1: Create session context provider

**Create `apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx`:**

Reads wallet store → exposes chain context for injection into agent sessions.

```typescript
export type SessionWalletContext = {
  address: `0x${string}` | null;
  chainId: number | null;
  chainName: string | null;
  rpcUrl: string | null;
  usdcAddress: `0x${string}` | null;
};
```

When wallet is disconnected, all fields are null. When wallet is connected, populate from the wallet store + chains.ts + contracts.ts.

Expose via a React context so the session creation flow can read it.

## Task 2.2: Modify OpenCode agent prompt injection

Find where system prompts are composed. Search for "system prompt" or "system_prompt" or "appendSystemPrompt" in `apps/app/src/`, `apps/server/src/`, and `apps/desktop/`.

Inject this when wallet is connected:
```
You are connected to wallet {ADDRESS} on {CHAIN_NAME} (chain ID: {CHAIN_ID}).
USDC is deployed at {USDC_ADDRESS} on this chain.
You can propose on-chain transactions using the wallet MCP tools.
The user will approve or reject each transaction in the wallet panel.
```

When wallet is not connected, inject nothing (don't mention wallet at all).

## Task 2.3: Session context test

Manual verification:
1. Start Matterhorn Work with wallet disconnected
2. Create a new agent session
3. Ask the agent: "What wallet are you connected to?"
4. Expected: agent says no wallet is connected
5. Connect wallet (Base Sepolia)
6. Create a new agent session
7. Ask: "What wallet and chain are you connected to?"
8. Expected: agent reports correct address and chain
9. Disconnect wallet mid-session
10. Ask again — verify agent updates

## Task 2.4: Commit and push

```bash
git checkout dev
git pull origin dev
git checkout -b feat/session-context
git add -A
git commit -m "feat: chain-aware session context — wallet address + chain injected into agent prompt"
git push origin feat/session-context
```

Merge after wallet extension lands. Depends on feat/wallet-extension.
