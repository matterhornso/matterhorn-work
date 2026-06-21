> This handoff is written for a CEO-level reviewer (e.g., Codex). It states what
> was built, why, and how to verify it.

# Monday Beta Customer Demo Scenario Layer — Kimi handoff

## What was built

A typed `CustomerBetaDemoScenario` registry and contract gate for the
10-customer Monday beta.

- **Type and registry** in `packages/types/src/matterhorn-workflows.ts`:
  - `CustomerBetaDemoScenario`
  - `CustomerBetaDemoPassFailCriteria`
  - `MondayBetaCustomerDemoStatus`
  - `MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS`
- **Five scenarios** covering all 10 beta customers (2 customers per scenario):
  1. Bittensor TAO staking preview
  2. Hyperliquid order preview
  3. Polymarket market research and preview
  4. Wellness client program packet
  5. Decentralized services future plan
- **Registry emitter** `scripts/customer-demo-scenarios.mjs` outputs the catalog
  as JSON and supports `--scenario` filtering.
- **Contract gate** `scripts/customer-demo-scenarios.test.mjs` validates every
  scenario for safety, completeness, and mapping to existing workflow/customer
  templates.
- **Documentation** in `docs/customer-demo-scenarios.md`.
- **Package script** `test:customer-demo-scenarios` added to `package.json`.

## Why

The Monday beta needs a single, safe, typed contract layer that tells the team
exactly what each customer will see, what artifacts will be produced, what
commands prove readiness, and what claims are forbidden. This layer does not
build any UI or execute provider actions; it only describes and validates the
demo contract.

## Safety decisions

- Every scenario keeps `liveExecutionEnabled: false`, `canSubmit: false`, and
  all secret-acceptance flags `false`.
- Hyperliquid and Polymarket are `preview_only` with `canExecute: false`.
- Services are `planned_not_live` with `canExecute: false`.
- Bittensor is the only scenario with `canExecute: true`, and only to prepare
  unsigned external-signer handoffs (`requiresExternalSigner: true`).
- Entry prompts and readiness commands never request private keys, seed phrases,
  mnemonics, API secrets, raw signatures, signed payloads, signed orders, or
  wallet exports.
- Each scenario maps to an existing `MatterhornWorkflowManifest` and
  `MatterhornCustomerWorkflowTemplate`.

## Owned files changed

- `packages/types/src/matterhorn-workflows.ts`
- `scripts/customer-demo-scenarios.mjs`
- `scripts/customer-demo-scenarios.test.mjs`
- `docs/customer-demo-scenarios.md`
- `docs/handoffs/kimi-monday-beta-customer-demo-scenarios.md`
- `package.json` (one script addition)

## Files intentionally not touched

- `apps/app/**`
- `apps/desktop/**`
- `apps/server/**`
- `packages/matterhorn-work-mcp/**`
- `wellness` artifact docs owned by Claude
- `docs/ui/**` owned by Minimax

## Verification

```bash
pnpm --dir packages/types build
pnpm test:market-execution-safety-gate
pnpm test:matterhorn-customer-workflow-template-registry
pnpm test:matterhorn-workflow-contract
pnpm test:customer-demo-scenarios
```

All commands pass on the feature branch.

## PR

Branch: `kimi/monday-beta-customer-demo-scenarios`
Opened against `origin/dev`.
