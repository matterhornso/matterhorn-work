# Feature 5: Agent Marketplace Integration

**Priority:** P2 — depends on Feature 1 (wallet gate)

## Goal

Users can browse, hire, and deploy agents from the Matterhorn-Agent marketplace. Agents are deployed to DePIN compute (mock for MVP), credentialed with ERC-8004 passports, and listed for hire.

## Dependencies

- Feature 1 (Wallet Extension) — marketplace needs wallet connect for hiring and payment

## Port Source

Reference files from Matterhorn-Agent:
- `Matterhorn-Agent/src/data/blueprints.ts` — 16 agent blueprint templates
- `Matterhorn-Agent/src/components/HireAgentModal.tsx` — hire flow
- `Matterhorn-Agent/src/components/ListAgentModal.tsx` — list/deploy flow
- `Matterhorn-Agent/src/pages/Marketplace.tsx` — marketplace UI
- `Matterhorn-Agent/src/pages/studio/` — 5-step deploy wizard

## Task 5.1: Create Agent Marketplace settings page

**Create `apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx`:**

Follow the existing settings page pattern (see `general-view.tsx`, `skills-view.tsx`).

Tabs:
- **Browse Agents** — grid of agent cards with: name, description, skills (tag chips), price (per call / per day), reputation badge, "Hire" button
- **My Agents** — list of user's deployed agents: name, status (live/paused), revenue, "Pause"/"Edit" actions
- **Deploy** — "Deploy New Agent" button → opens deploy wizard

Use lucide-react icons: Bot, DollarSign, Clock, Star, Plus.

Agent card pattern (from Matterhorn-Agent):
```typescript
type AgentBlueprint = {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  skills: string[];
  dailyCost: number;
  reputation: number;
};
```

## Task 5.2: Create marketplace Zustand store

**Create `apps/app/src/react-app/domains/settings/state/marketplace-store.ts`:**

Follow the extensions-store.ts Zustand pattern.

Store shape:
```typescript
type MarketplaceStoreSnapshot = {
  agents: AgentBlueprint[];           // available agents on marketplace
  myAgents: DeployedAgent[];          // user's deployed agents
  selectedAgentId: string | null;
  filters: { category: string | null; minReputation: number };
  isDeploying: boolean;
  deployStep: number;                 // for multi-step wizard
};
```

Actions:
- `browseAgents(category?, minReputation?)` — filter agents
- `selectAgent(id)` — open agent detail
- `hireAgent(id)` — start hire flow
- `deployAgent(blueprintId, config)` — start deploy flow
- `pauseAgent(id)` — pause a deployed agent
- `getAgentDetails(id)` — full agent info

For MVP, use static data from agent blueprints (no real backend). Import blueprints from the ported data.

## Task 5.3: Port agent blueprints from Matterhorn-Agent

**Create `apps/app/src/react-app/domains/settings/data/agent-blueprints.ts`:**

Port the 16 blueprints from `Matterhorn-Agent/src/data/blueprints.ts` into this file. Each blueprint:
```typescript
{
  id: "yield-hunter",
  name: "Yield Hunter",
  description: "Scans DeFi protocols for optimal yield and auto-compounds earnings.",
  category: "defi",
  skills: ["aave-v4", "pendle", "lido", "uniswap-v5"],
  dailyCost: 2.50,
  reputation: 94,
  emoji: "🏹",
}
```

16 blueprints to port:
1. yield-hunter — DeFi yield optimization
2. mev-sentinel — MEV protection
3. portfolio-rebalancer — Auto portfolio rebalancing
4. governance-voter — DAO governance participation
5. social-alpha — Social signal monitoring
6. liquidation-guardian — Collateral protection
7. hyperliquid-mm — Market making on Hyperliquid
8. cross-chain-arb — Cross-chain arbitrage
9. revenue-based-lender — Revenue-based lending
10. agent-treasury — Treasury management agent
11. agent-insurer — On-chain insurance agent
12. smart-escrow — Escrow automation
13. intent-router — Intent-based routing
14. restaking-strategist — EigenLayer restaking strategy
15. solana-defi-agent — Solana DeFi operations
16. prediction-trader — Polymarket prediction trading

## Task 5.4: Deploy agent flow

Integrate into marketplace-view.tsx:

"Deploy Agent" flow (MVP — mock deployment):
1. Select blueprint from grid
2. Configure: display name, DePIN provider (Akash/io.net — dropdown, mock for now), max daily budget
3. Review: shows config summary + estimated cost
4. Deploy: shows mock deployment log (animated terminal output)
5. Success: agent appears in "My Agents" with status "live"

ERC-8004 passport credentialing: show a step in the deploy flow where a "passport is minted" (mock TX hash for MVP).

## Task 5.5: Hire agent flow

"Hire Agent" flow (MVP):
1. Click "Hire" on an agent card
2. Wallet gate: if not connected, prompt to connect wallet
3. Review: agent name, price, description
4. Confirm: "Hire Agent" button
5. Success: confirmation with mock TX hash

Use the existing TransactionApproval modal pattern for the confirmation step.

## Task 5.6: Marketplace integration test

Manual verification:
1. Navigate to Settings → Marketplace
2. Browse tab: verify agent cards render with names, skills, prices
3. Click an agent → verify detail view
4. My Agents tab: verify "No agents deployed yet" empty state
5. Deploy tab: select blueprint → configure → deploy → verify agent appears in My Agents
6. Hire: click Hire → verify wallet gate → verify confirmation modal
7. Without wallet: click Hire → verify wallet connect prompt

## Task 5.7: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/agent-marketplace
git add -A
git commit -m "feat: agent marketplace — browse, deploy, hire agents with wallet gate"
git push origin feat/agent-marketplace
```
