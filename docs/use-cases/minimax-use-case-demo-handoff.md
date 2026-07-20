# Minimax Handoff: Matterhorn Use-Case Demo Pack

## What This PR Adds

- `docs/use-cases/matterhorn-use-case-demo-pack.md` — Customer-facing overview of all five Matterhorn Desks use cases (Bittensor, Hyperliquid, Polymarket, Wellness Creator, Decentralized Services). Each use case includes audience, sample prompts, expected returns, artifacts produced, safety boundary, current status, and future path.
- `docs/use-cases/hermes-use-case-demo-qa.md` — Black-box browser QA guide for Hermes or any non-coding tester. Includes setup assumptions, step-by-step prompts per use case, expected answer shapes, forbidden behavior checklist, issue ledger format, and pass/fail rubric.
- `scripts/use-case-demo-pack.test.mjs` — Standalone Node test script (not added to `package.json`). Validates that all five use cases are present in the demo pack doc, that each includes required fields, that all safety phrases are present, and that forbidden affirmative claims are absent.

## Files Changed

```
docs/use-cases/matterhorn-use-case-demo-pack.md   [new]
docs/use-cases/hermes-use-case-demo-qa.md          [new]
docs/use-cases/minimax-use-case-demo-handoff.md   [new]
scripts/use-case-demo-pack.test.mjs               [new]
```

## Safety Boundaries Enforced

This PR adds documentation and a static gate only. It does not change any code paths.

- **No live market submit** — Hyperliquid and Polymarket remain preview-only.
- **No custody or signing** — no seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports.
- **No live external services** — storage, hosting, email, payments, identity/access are planned/future-contract only.
- **Wellness artifact-only** — no medical diagnosis, treatment, prescription, or guaranteed outcome.
- Forbidden affirmative claims (e.g., "live submit is enabled") must not appear in the demo pack doc.

## Commands Run

```bash
node scripts/use-case-demo-pack.test.mjs
pnpm test:market-execution-safety-gate
```

Both gates passed before PR creation.

## What the Next Agent Should Build Next

The demo pack documents five use cases. The most gap-rich areas for follow-on work:

1. **Bittensor adapter marketplace** — the demo pack describes the capability but the adapter marketplace catalog needs populated adapters and runtime allowlisting.
2. **Hyperliquid external signer integration** — preview cards are ready but a compatible external signer UX path is not yet wired end-to-end.
3. **Wellness delivery hooks** — artifact generation is live; the storage, email, payments, and access hooks are planned. The next agent could scaffold the service discovery fixtures for each hook.
4. **Decentralized services provider fixtures** — the demo pack describes the capability map. The next agent could add mock provider discovery for storage, email, and payments.
5. **Polymarket receipt validation** — public receipt check is wired; the next agent could add multi-market portfolio tracking.

## Branch and PR

- Branch: `minimax/use-case-demo-pack` from `origin/dev`
- PR target: `dev`
- Do not touch stale PR #2 or any other existing PR.
