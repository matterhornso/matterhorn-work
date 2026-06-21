# Monday Beta Customer Demo Scenarios

This document describes the typed `CustomerBetaDemoScenario` registry for the
10-customer Monday beta. Each scenario maps to an existing workflow manifest and
customer workflow template, defines a safe entry prompt, expected artifacts,
readiness commands, safety boundaries, forbidden claims, and pass/fail criteria.

## Registry

- Type: `CustomerBetaDemoScenario`
- Registry constant: `MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS`
- Source: `packages/types/src/matterhorn-workflows.ts`
- Gate: `pnpm test:customer-demo-scenarios`

## Scenarios

| Scenario | Display name | Persona | Status | Workflow | Customer template |
|---|---|---|---|---|---|
| `bittensor_tao_staking_preview` | Bittensor TAO staking preview | TAO operator or delegator | `demo_ready` | `bittensor_operator` | `bittensor_operator` |
| `hyperliquid_order_preview` | Hyperliquid order preview | Crypto trader reviewing Hyperliquid markets | `preview_only` | `market_read_preview` | `hyperliquid_trader` |
| `polymarket_market_research` | Polymarket market research and preview | Prediction market researcher | `preview_only` | `market_read_preview` | `polymarket_researcher` |
| `wellness_client_program_packet` | Wellness client program packet | Wellness creator or coach | `planned_not_live` | `wellness_creator_services` | `wellness_creator_workflow` |
| `decentralized_services_future_plan` | Decentralized services future plan | Builder planning future decentralized service actions | `planned_not_live` | `decentralized_services_planner` | `decentralized_services_operator` |

## Monday beta customers

Each scenario is assigned to two beta customers, covering 10 customers total:

- **Bittensor**: Alpha Node DAO, TensorVault Labs
- **Hyperliquid**: Arbor Trading, PerpPrime Capital
- **Polymarket**: Forecast Collective, EdgeBet Research
- **Wellness**: Summit Wellness Co, FitPath Studio
- **Services**: OpenResearch DAO, StackSafe Labs

## Safety contract

Every scenario enforces:

- `liveExecutionEnabled: false`
- `canSubmit: false`
- `acceptsSecrets: false`
- `acceptsPrivateKeys: false`
- `acceptsRawSignatures: false`
- `acceptsApiSecrets: false`
- `allowsRealFunds: false`

Additional per-scenario rules:

- **Hyperliquid / Polymarket**: `canExecute: false` and `preview_only` status.
- **Services**: `planned_not_live` status; no live provider execution.
- **Bittensor**: `canExecute: true` only to prepare unsigned external-signer
  handoffs; `requiresExternalSigner: true`.

## Forbidden inputs

No scenario entry prompt or readiness command may request:

- private key
- seed phrase
- mnemonic
- API secret
- raw signature
- signed payload
- signed order
- wallet export

## Entry prompts

| Scenario | Entry prompt |
|---|---|
| Bittensor | "Show my TAO, compare validators on subnet 1, and prepare an unsigned 1 TAO staking preview" |
| Hyperliquid | "Preview a Hyperliquid BTC-PERP long without signing or submitting anything" |
| Polymarket | "Summarize this Polymarket market and preview a yes position without signing or submitting" |
| Wellness | "Create a 6-week strength program packet for busy professionals with a weekly check-in workflow" |
| Services | "Plan a decentralized storage and email workflow for my research group" |

## Evidence output

Each scenario writes evidence to a path with a `{customer}` placeholder:

- `docs/evidence/monday-beta/bittensor/{customer}-scenario-evidence.json`
- `docs/evidence/monday-beta/hyperliquid/{customer}-scenario-evidence.json`
- `docs/evidence/monday-beta/polymarket/{customer}-scenario-evidence.json`
- `docs/evidence/monday-beta/wellness/{customer}-scenario-evidence.json`
- `docs/evidence/monday-beta/services/{customer}-scenario-evidence.json`

## Commands

List all scenarios:

```bash
node scripts/customer-demo-scenarios.mjs --json
```

Filter to a single scenario:

```bash
node scripts/customer-demo-scenarios.mjs --scenario bittensor_tao_staking_preview --json
```

Run the contract gate:

```bash
pnpm test:customer-demo-scenarios
```

## References

- `packages/types/src/matterhorn-workflows.ts`
- `scripts/customer-demo-scenarios.mjs`
- `scripts/customer-demo-scenarios.test.mjs`
- `docs/matterhorn-workflow-contract.md`
- `docs/handoffs/kimi-monday-beta-customer-demo-scenarios.md`
