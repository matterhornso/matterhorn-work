This is the master orchestration command. Read ALL rule files first, then execute the build in dependency order:

PHASE 1: Feature 1 — Wallet Extension
Run `/build-wallet` (or execute the tasks from `.claude/rules/wallet-extension.md`)

PHASE 2: Feature 2 — Session Context
Run `/build-session-context` (or execute the tasks from `.claude/rules/session-context.md`)
Depends on: Phase 1 complete

PHASE 3: Feature 3 — TX Pipeline
Run `/build-tx-pipeline` (or execute the tasks from `.claude/rules/tx-pipeline.md`)
Depends on: Phase 1 + Phase 2 complete

PHASE 4: Feature 4 — Web3 Skills
Run `/build-web3-skills` (or execute the tasks from `.claude/rules/web3-skills.md`)
Depends on: Phase 3 complete

PHASE 5: Feature 5 — Agent Marketplace
Run `/build-marketplace` (or execute the tasks from `.claude/rules/agent-marketplace.md`)
Depends on: Phase 1 complete (wallet gate only)

AFTER EACH PHASE:
- Report what was built, what branch it's on, and any issues
- Wait for confirmation before proceeding to next phase
- Do NOT proceed if the current phase has failures

CRITICAL RULES:
- Use pnpm only, never npm or yarn
- Never rename openwork.extension.* localStorage keys
- Add wagmi to apps/app only, not root workspace
- Follow existing code patterns exactly (Zustand stores, settings pages)
- Keep diffs minimal
- Never use `any`, typecasts, or `as`
- Test on Base Sepolia references only, never mainnet addresses
