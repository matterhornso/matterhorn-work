# Build Command — Agent Marketplace

**PREREQUISITE CHECK:**
```bash
ls apps/app/src/react-app/domains/wallet/WalletConnect.tsx 2>/dev/null && echo "PREREQ OK: wallet extension exists" || echo "PREREQ FAIL — Feature 1 must be merged first"
```
**STOP if prerequisite fails.**

---

## Task 5.1: Create marketplace settings page

Create `apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx`.
Follow the pattern from `general-view.tsx` and `skills-view.tsx`. Tabs: Browse Agents, My Agents, Deploy.

**VERIFY:**
```bash
ls apps/app/src/react-app/domains/settings/pages/marketplace-view.tsx && echo "EXISTS" || echo "MISSING"
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "marketplace" | head -5
# Expected: no type errors
```

---

## Task 5.2: Create marketplace Zustand store

Create `apps/app/src/react-app/domains/settings/state/marketplace-store.ts`.
Follow extensions-store.ts pattern. Actions: browseAgents, hireAgent, deployAgent, pauseAgent.

**VERIFY:**
```bash
ls apps/app/src/react-app/domains/settings/state/marketplace-store.ts && echo "EXISTS" || echo "MISSING"
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "marketplace-store" | head -5
# Expected: no type errors
```

---

## Task 5.3: Port agent blueprints

Create `apps/app/src/react-app/domains/settings/data/agent-blueprints.ts`.
Port all 16 from `.claude/rules/agent-marketplace.md`. Each has id, name, description, category, skills, dailyCost, reputation, emoji.

**VERIFY:**
```bash
node -e "import('./apps/app/src/react-app/domains/settings/data/agent-blueprints.ts').then(m => console.log('BLUEPRINTS:', Array.isArray(m.agentBlueprints) ? m.agentBlueprints.length : 'NOT ARRAY'))" 2>&1
# Expected: BLUEPRINTS: 16
```

---

## Task 5.4-5.5: Implement deploy and hire flows

Wire deploy flow (select blueprint → configure → mock deploy → success) and hire flow (Hire → wallet gate → confirm → success) into marketplace-view.tsx.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -iE "marketplace|deploy|hire" | head -10
# Expected: no type errors
```

---

## Task 5.6: Full build

```bash
pnpm --filter @matterhorn-work/app typecheck && pnpm --filter @matterhorn-work/app build
# Expected: both succeed
```

---

## Task 5.7: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/agent-marketplace
git add -A
git commit -m "feat: agent marketplace — browse, deploy, hire agents with wallet gate"
git push origin feat/agent-marketplace
```
