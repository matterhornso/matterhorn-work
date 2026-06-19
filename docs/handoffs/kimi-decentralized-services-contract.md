# Handoff: Decentralized Services Capability Contract

**Owner:** Kimi (coding agent)  
**PR:** https://github.com/matterhornso/matterhorn-work/pull/392  
**Branch merged to dev:** `kimi/decentralized-services-contract`  
**Merge commit:** `36061d7c`  
**Merged at:** 2026-06-19T12:37:01Z  
**Scope:** First provider-neutral contract for future hosting, storage, email, payments, and identity/access integrations. No live providers are wired yet.

## What was built

### New files

| File | What it contains |
| --- | --- |
| `docs/decentralized-services-capability-contract.md` | Contract doc describing the five capabilities (hosting, storage, email, payments, identity/access). For each capability it documents user intent examples, provider capability manifest requirements, required auth models, safe preview step, confirmation step, execution/receipt shape, secret handling rules, customer-facing artifact outputs, and JSON examples. |
| `packages/types/src/decentralized-services.ts` | TypeScript schemas and constants: `DECENTRALIZED_SERVICE_CAPABILITIES`, `DecentralizedServiceProviderManifest`, `DecentralizedServicePreview`, `DecentralizedServiceConfirmation`, `DecentralizedServiceHandoff`, `DecentralizedServiceReceipt`, `DecentralizedServiceUnsupportedResponse`, `DecentralizedServiceFailureResult`, `DECENTRALIZED_SERVICE_FORBIDDEN_CREDENTIAL_KEY_PATTERN`, `DECENTRALIZED_SERVICE_SAFETY_DEFAULTS`, `DecentralizedServiceSafetyChecklist`. |
| `scripts/decentralized-services-contract.test.mjs` | Static test that reads the doc, types, and `package.json` and verifies the contract coverage and safety rules. |

### Modified files

| File | What changed |
| --- | --- |
| `packages/types/src/index.ts` | Added `export * from "./decentralized-services"`. |
| `packages/types/package.json` | Added `./decentralized-services` export entry. |
| `package.json` | Added script `test:decentralized-services-contract: "node scripts/decentralized-services-contract.test.mjs"`. |
| `docs/agent-control-coverage-matrix.md` | Added a "Decentralized Services (Future Contracts)" row and added `pnpm test:decentralized-services-contract` to the Required Checks list. |

## Five capabilities covered

1. **Hosting** — user intents: "Host this app", "Deploy my frontend", "Publish this site"
2. **Storage** — user intents: "Store this file on decentralized storage", "Pin this CID", "Back up this artifact"
3. **Email** — user intents: "Send emails to my customers", "Send a newsletter", "Verify a user by email"
4. **Payments** — user intents: "Collect payments", "Create a paid creator program", "Issue an invoice"
5. **Identity / Access** — user intents: "Create a customer login", "Gate this file by wallet", "Issue a membership"

## Safety defaults encoded in the contract

From `packages/types/src/decentralized-services.ts`:

```ts
const DECENTRALIZED_SERVICE_SAFETY_DEFAULTS = {
  custody: "none",
  liveExecutionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
  rejectsRawSigningMaterial: true,
};
```

All provider manifests in the contract default to `status: "future_contract"` and `liveExecutionEnabled: false`.

## Static test assertions

`scripts/decentralized-services-contract.test.mjs` verifies:

- All five capabilities are covered in both `docs/decentralized-services-capability-contract.md` and `packages/types/src/decentralized-services.ts`.
- No JSON examples in the doc request `privateKey`, `seedPhrase`, `mnemonic`, `apiSecret`, `rawSignature`, `signedPayload`, `walletExport`, `passphrase`, `password`, `keyfile`, or `suri`.
- Safety defaults and `DECENTRALIZED_SERVICE_FORBIDDEN_CREDENTIAL_KEY_PATTERN` exist in types.
- Every execution-capable flow schema includes preview (`DecentralizedServicePreview`), confirmation (`DecentralizedServiceConfirmation`), receipt (`DecentralizedServiceReceipt`), and failure/rollback (`DecentralizedServiceFailureResult`) fields.
- Docs state that the capabilities are future-only contracts (`future contract only`, `"future_contract"`, `No real provider is wired up`, `allContractsFutureOnly: true`).
- All five schema versions are documented and typed: `matterhorn.services.provider-manifest.v1`, `matterhorn.services.preview.v1`, `matterhorn.services.external-action-handoff.v1`, `matterhorn.services.receipt.v1`, `matterhorn.services.unsupported.v1`.
- Type package exports the module and root `package.json` exposes the test script.

## Commands that pass on this PR

```bash
node scripts/decentralized-services-contract.test.mjs
pnpm test:decentralized-services-contract
pnpm test:market-execution-safety-gate
pnpm test:customer-ready-crypto-smoke
pnpm test:agent-control-coverage-matrix
```

## CI status on merge

All GitHub checks on PR #392 passed:

- `openwork-tests (blacksmith-4vcpu-ubuntu-2204)` — SUCCESS
- `openwork-tests (macos-14)` — SUCCESS
- `customer-crypto-gates` — SUCCESS
- `i18n-audit` — SUCCESS

## Non-overlap observed

No changes were made to:

- `apps/server/src/server.ts`
- `apps/server/src/tools/bittensor.ts`
- `apps/server/src/tools/hyperliquid.ts`
- `apps/server/src/tools/polymarket.ts`
- `docs/wellness-creator-pilot.md`
- `docs/handoffs/hermes-wellness-creator-qa.md`

## Next fixture layer

The PR also added readonly provider-discovery fixture constants in `packages/types/src/decentralized-services.ts`:

- `HOSTING_DISCOVERY_FIXTURES`
- `STORAGE_DISCOVERY_FIXTURES`
- `EMAIL_DISCOVERY_FIXTURES`
- `PAYMENTS_DISCOVERY_FIXTURES`
- `IDENTITY_DISCOVERY_FIXTURES`
- `DECENTRALIZED_SERVICE_DISCOVERY_FIXTURES` — a record mapping each capability to its fixture array

Each fixture is typed as `DecentralizedServiceDiscoveryFixture` with:

- `status: "future_contract"`
- `discoveryMode: "fixture"`
- `liveExecutionEnabled: false`
- `canExecute: false`
- `acceptsSecrets: false`, `acceptsPrivateKeys: false`, `acceptsRawSignatures: false`
- `publicMetadata` containing only public/redacted provider metadata

The static test was extended to assert at least one fixture block per capability and to verify each fixture block contains the readonly/future-contract fields and no forbidden credential keys.

## Useful references

- Contract doc: `docs/decentralized-services-capability-contract.md`
- Types: `packages/types/src/decentralized-services.ts`
- Test: `scripts/decentralized-services-contract.test.mjs`
- Coverage matrix: `docs/agent-control-coverage-matrix.md`
- Related safety patterns: `packages/types/src/markets.ts`
