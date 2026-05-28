# Build Command — Session Context

**IMPORTANT: After EVERY task, run the verification step. Do NOT skip. If verification fails, STOP — fix — re-verify — continue.**

**PREREQUISITE CHECK:**
```bash
ls apps/app/src/react-app/domains/wallet/state/wallet-store.ts 2>/dev/null && echo "PREREQ OK: wallet store exists" || echo "PREREQ FAIL: wallet store missing — Feature 1 must be merged first"
```
**STOP if prerequisite fails.**

---

## Task 2.1: Create SessionContextProvider

Create `apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx`.

Reads wallet store → exposes chain context via React context. Follow the pattern from `.claude/rules/session-context.md`.

**VERIFY:**
```bash
ls apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx
# Expected: file exists

pnpm --filter @matterhorn-work/app typecheck 2>&1 | grep -i "SessionContext" | head -5
# Expected: no type errors
```

---

## Task 2.2: Inject wallet context into agent prompts

Search the codebase for prompt injection points:
```bash
grep -rl "system.prompt\|systemPrompt\|appendSystemPrompt\|system_prompt" apps/ --include="*.ts" --include="*.tsx" --include="*.mjs" 2>/dev/null | head -10
```

Read the relevant files. Find where the agent's system prompt is assembled. Inject wallet+chain context when wallet is connected. Inject nothing when disconnected.

**VERIFY:**
```bash
pnpm --filter @matterhorn-work/app typecheck 2>&1 | head -20
# Expected: no type errors

# Trace verification: find the injection point and confirm the code path
grep -rn "wallet\|chainId\|USDC" apps/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -10
# Expected: shows the wallet context injection points in the prompt assembly code
```

---

## Task 2.3: Full build check

```bash
pnpm --filter @matterhorn-work/app typecheck
# Expected: no errors

pnpm --filter @matterhorn-work/app build
# Expected: build succeeds
```

**STOP if build fails.**

---

## Task 2.4: Commit and push

```bash
git checkout dev && git pull origin dev
git checkout -b feat/session-context
git add -A
git commit -m "feat: chain-aware session context — wallet address + chain injected into agent prompt"
git push origin feat/session-context
```

**VERIFY:**
```bash
git log --oneline -1
# Expected: shows the feat commit
```
