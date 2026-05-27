Read `.claude/rules/session-context.md` completely first. Then execute ALL 4 tasks IN ORDER:

1. Create `apps/app/src/react-app/domains/wallet/SessionContextProvider.tsx` — reads wallet store, exposes chain context via React context

2. Search the codebase for system prompt injection patterns. Look in `apps/app/src/`, `apps/server/src/`, and `apps/desktop/` for "system prompt", "system_prompt", "appendSystemPrompt", or similar patterns. Read the relevant files to understand how prompts are composed. Inject wallet+chain context when wallet is connected.

3. Manually verify (describe the verification steps — you cannot actually run the UI, but trace through the code to confirm the injection path is correct)

4. Run `git checkout -b feat/session-context && git add -A && git commit -m "feat: chain-aware session context — wallet address + chain injected into agent prompt" && git push origin feat/session-context`

IMPORTANT: This feature depends on Feature 1 (wallet extension). If wal-store.ts does not exist yet in the repo, stop and explain — Feature 1 must be merged first.
