Read `.claude/rules/agent-marketplace.md` completely first. Then execute ALL 7 tasks IN ORDER:

1. Create `apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx` — settings page with Browse/My Agents/Deploy tabs, following existing page patterns (general-view.tsx, skills-view.tsx). Use lucide-react icons.

2. Create `apps/app/src/react-app/domains/settings/state/marketplace-store.ts` — Zustand store following extensions-store.ts pattern with agents[], myAgents[], filters, and browse/hire/deploy/pause actions.

3. Create `apps/app/src/react-app/domains/settings/data/agent-blueprints.ts` — port all 16 blueprints. Each has: id, name, description, category, skills, dailyCost, reputation, emoji. Make the data realistic.

4. Implement deploy agent flow in marketplace-view.tsx:
   - Select blueprint → configure (DePIN provider dropdown, max daily budget) → review → mock deployment log → success
   - Show ERC-8004 passport minting step (mock TX hash)

5. Implement hire agent flow in marketplace-view.tsx:
   - Click Hire → wallet gate → review agent details → confirm → success with mock TX hash

6. Verify: trace through each flow in the code to confirm it's wired correctly (no UI testing possible, describe the verification)

7. Run `git checkout -b feat/agent-marketplace && git add -A && git commit -m "feat: agent marketplace — browse, deploy, hire agents with wallet gate" && git push origin feat/agent-marketplace`

IMPORTANT: Feature 1 (wallet extension) must be merged first. If wallet-store.ts and WalletConnect.tsx don't exist, stop.
