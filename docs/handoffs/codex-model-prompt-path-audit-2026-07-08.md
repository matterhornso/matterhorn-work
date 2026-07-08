# Codex Handoff: Model Prompt Path Audit

Date: 2026-07-08
Branch: `codex/model-prompt-path-audit-v2`

## Summary

This pass locks down the current Matterhorn model-selection behavior with a repeatable audit. The prompt path is already unified enough for production semantics:

- explicit app picker model wins for that app session;
- saved workspace default is used by stable workspace prompt routes when the request omits a model;
- engine/server default is used when neither exists.

The backend model contract had one stale sentence that implied prompt-path unification was still future work. That copy has been replaced with the real precedence rule.

## Files Changed

- `apps/server/src/backend-models.ts`
  - Replaced stale model-selection copy with the current precedence contract.
- `scripts/model-prompt-path-audit.mjs`
  - New static audit for server prompt route, app send paths, settings controls, readiness copy, and regression test coverage.
- `scripts/model-prompt-path-audit.test.mjs`
  - New self-test for package scripts, audit JSON/text output, required check IDs, and report writing.
- `package.json`
  - Adds `smoke:model-prompt-path-audit` and `test:model-prompt-path-audit`.

## Recommended Verification

```bash
node scripts/model-prompt-path-audit.test.mjs
node scripts/model-prompt-path-audit.mjs --json
bun test apps/app/tests/model-readiness-summary.test.ts apps/app/tests/session-model-selection.test.ts apps/app/tests/backend-capability-ui-contract.test.ts
bun test apps/server/src/session-read-model.e2e.test.ts apps/server/src/backend-control-plane.e2e.test.ts
apps/server/node_modules/.bin/tsc -p apps/server/tsconfig.json --noEmit
git diff --check
```

## Notes For The Next Agent

- Do not remove `opencode/big-pickle` from server fallback tests or fixtures in this pass; the audit only ensures the React prompt send path does not hardcode that fallback.
- The audit is intentionally static. It does not call providers, read model credentials, or start a local engine.
- If the prompt route changes names or moves files, update `scripts/model-prompt-path-audit.mjs` in the same PR as the route change.
