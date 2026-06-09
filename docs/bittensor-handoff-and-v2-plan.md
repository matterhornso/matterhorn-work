# Bittensor Handoff And V2 Plan

## Current Phase 2 PR

- PR: https://github.com/matterhornso/matterhorn-work/pull/3
- Branch: `codex/bittensor-chat-phase-2-20260609203515`
- Base branch: `dev`
- Phase 2 direction: chat-first Bittensor. The Bittensor panel remains useful for inspection, but chat is the primary workflow surface.

## What PR #3 Adds

PR #3 turns the V1 watch-only panel into a chat-native Bittensor foundation.

### Chat And MCP Surface

New Bittensor MCP tools:

- `bittensor_plan_from_chat`
- `bittensor_find_subnets_for_goal`
- `bittensor_get_subnet_capabilities`
- `bittensor_get_sidecar_status`
- `bittensor_prepare_extrinsic`
- `bittensor_submit_signed_extrinsic`
- `bittensor_invoke_subnet`
- `bittensor_create_watch`
- `bittensor_list_watches`

The chat prompt rules now treat TAO, Bittensor, subnet, netuid, coldkey, hotkey, validator, miner, alpha, emissions, metagraph, and staking language as Bittensor mode triggers.

### Chat Cards

Server and MCP responses can now include compact Bittensor chat cards:

- subnet comparison
- wallet snapshot
- staking quote
- signed action review
- signer status
- subnet invocation result
- unsupported adapter
- watchlist

The session transcript recognizes `output.cards` from Bittensor tool calls and renders those cards above the raw expandable JSON.

### Subtensor Sidecar

Set `BITTENSOR_SUBTENSOR_SIDECAR_URL` to enable sidecar-backed reads and unsigned payload preparation.

When configured, Matterhorn can request:

- subnet metagraph data
- wallet snapshot data
- Dynamic TAO quote enrichment
- unsigned extrinsic payload preparation
- externally signed payload submission

Signing still happens outside Matterhorn. The sidecar must not receive seed phrases, mnemonic text, raw keyfiles, or key material through Matterhorn APIs.

Optional network selector:

- `BITTENSOR_NETWORK=finney`
- `BITTENSOR_NETWORK=test`
- `BITTENSOR_NETWORK=local`

### Desktop External-Signing Handoff

Matterhorn now supports a deterministic handoff step between preview and submission:

1. `bittensor_prepare_extrinsic` builds the unsigned preview.
2. `bittensor_create_signing_handoff` creates a handoff bundle with:
   - canonical payload JSON
   - SHA-256 checksum
   - suggested filename
   - expiry timestamp
   - plain-English review instructions
   - consequence summary
3. The user signs the payload in an external Bittensor-compatible wallet or CLI flow.
4. `bittensor_submit_signed_extrinsic` can submit the externally signed payload only when a Subtensor sidecar is configured.

The handoff helper rejects payloads containing signing-material field names before returning a bundle. This keeps the Phase 2 flow non-custodial while making desktop/CLI signing practical from chat.

### Subnet Service Adapters

Set `BITTENSOR_SUBNET_ADAPTERS_JSON` to opt a subnet into direct service invocation.

Example:

```json
[
  {
    "netuid": 14,
    "name": "Example compute adapter",
    "serviceAdapter": "compute",
    "endpoint": "http://127.0.0.1:8750/invoke",
    "requiredAuth": "api_key",
    "authEnv": "BITTENSOR_EXAMPLE_ADAPTER_TOKEN",
    "costModel": "provider_priced",
    "timeoutMs": 20000,
    "safetyNotes": ["Review provider pricing before running large jobs."]
  }
]
```

Only the `authEnv` variable name is exposed in config. The token value is read server-side and is not returned through MCP or UI payloads.

Without an adapter, direct `service_call` returns a clear unsupported-adapter result. Universal support still works for explanation, discovery, metagraph context, wallet guidance, staking guidance, and monitoring.

### Goal-Based Discovery

`bittensor_find_subnets_for_goal` now uses server-side deterministic scoring instead of simple substring filtering. It recognizes goals such as:

- image generation and creative media
- data, search, crawl, retrieval, and knowledge tasks
- compute, GPU, hosting, and infrastructure tasks
- agent tools and workflow automation
- inference, model, chat, and text tasks
- finance, trading, price, and risk tasks
- science and research tasks

Each match includes a score and reasons so chat can explain why a subnet was recommended.

## Current PR

- PR: https://github.com/matterhornso/matterhorn-work/pull/2
- Branch: `codex/bittensor-mvp`
- Latest pushed commit at handoff time: `df8ca4b930c0d79fe0ae4cc44fd6233bb74144f4`
- Base branch: `dev`
- Status at handoff time: open and mergeable, waiting on the GitHub runner-backed Ubuntu and i18n jobs.

## What PR #2 Builds

PR #2 adds a read-only plus quote-only Bittensor MVP to Matterhorn Work.

### Product Surface

- Adds a `Bittensor` quick action in the existing wallet panel.
- Opens a new `BittensorPanel` with four tabs:
  - `Overview`: network/subnet source summary, watched wallet summary, favorite subnets, recent subnet changes.
  - `Subnets`: searchable subnet list by name, netuid, category, utility, symbol, source, and freshness.
  - `Wallet`: watch-only SS58 coldkey address input, saved locally under `matterhorn:bittensor:watchAddress`.
  - `Actions`: quote-only stake, unstake, transfer, and compare actions.
- Adds favorite subnet storage under `matterhorn:bittensor:favorites`.
- Clearly labels V1 as watch-only and externally signed.

### Server Surface

Adds server-side Bittensor routes:

- `GET /api/bittensor/subnets`
- `GET /api/bittensor/subnets/:netuid`
- `GET /api/bittensor/wallet/:ss58Address`
- `POST /api/bittensor/actions/quote`

Adds `apps/server/src/tools/bittensor.ts` as the provider layer:

- `BittensorProvider` interface.
- TAO.app-backed provider where endpoints are available.
- Fallback subnet data when live provider data is unavailable.
- Provider-unavailable wallet state when `TAO_APP_API_KEY` is absent or locked.
- SS58-style public address validation.
- Quote generation and warning generation.
- No custody, no signing, no broadcast.

### Shared Types

Adds shared Bittensor response types:

- `BittensorSubnetSummary`
- `BittensorSubnetDetail`
- `BittensorWalletSnapshot`
- `BittensorStakePosition`
- `BittensorActionQuote`
- `BittensorActionQuoteInput`

### MCP Surface

Adds Bittensor tools to `packages/matterhorn-work-crypto-mcp/index.mjs`:

- `bittensor_list_subnets`
- `bittensor_explain_subnet`
- `bittensor_compare_subnets`
- `bittensor_get_wallet_positions`
- `bittensor_prepare_action`

The latest commit also lazy-loads `viem` in the crypto MCP package. This matters because Bittensor MCP tools do not need EVM clients, and eager `viem` startup was causing the Bittensor smoke test to time out in the local environment.

### Documentation

Updates `README.md` with:

- Bittensor workspace feature entry.
- Optional `TAO_APP_API_KEY`.
- Provider-unavailable behavior.
- No seed/private-key custody statement.

## Files Changed In PR #2

- `README.md`
- `apps/app/src/react-app/domains/wallet/WalletPanel.tsx`
- `apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx`
- `apps/server/src/server.ts`
- `apps/server/src/tools/bittensor.ts`
- `apps/server/src/tools/bittensor.test.ts`
- `packages/types/src/bittensor.ts`
- `packages/types/src/index.ts`
- `packages/matterhorn-work-crypto-mcp/index.mjs`
- `packages/matterhorn-work-crypto-mcp/package.json`
- `packages/matterhorn-work-crypto-mcp/test-bittensor.mjs`
- `docs/bittensor-handoff-and-v2-plan.md`

## Safety Constraints Already Implemented

Matterhorn Work V1 for Bittensor must remain:

- Read-only for wallet/subnet data.
- Quote-only for Bittensor actions.
- Non-custodial.
- External-signer-only.
- Explicitly free of seed phrase, mnemonic, and private-key inputs.

Do not add UI, API, logs, localStorage keys, MCP schemas, or prompts that ask for or store:

- seed phrases
- mnemonics
- private keys
- raw keyfiles
- coldkey secrets
- hotkey secrets

Coldkey and hotkey wording should stay precise:

- Coldkey public address can be watched.
- Coldkey private key authorizes sensitive operations and must not enter Matterhorn.
- Hotkeys are operational identities for validators/miners/subnets, not user custody keys.

## Verification Status

Passed locally after the latest MCP fix:

- `bun test apps/server/src/tools/bittensor.test.ts`
  - 7 tests passed.
- `node --check packages/matterhorn-work-crypto-mcp/index.mjs`
- `node --check packages/matterhorn-work-crypto-mcp/test-bittensor.mjs`
- `node packages/matterhorn-work-crypto-mcp/test-bittensor.mjs`
  - Output: `All Bittensor MCP smoke tests passed.`

Passed on GitHub for latest head at handoff time:

- `Matterhorn Work Tests / openwork-tests (macos-14)`
  - Includes dependency install and `pnpm --filter @matterhorn-work/app test:e2e`.

Still pending on GitHub at handoff time:

- `Matterhorn Work Tests / openwork-tests (blacksmith-4vcpu-ubuntu-2204)`
- `i18n Audit / i18n-audit`

Not fully verified locally:

- `pnpm --filter @matterhorn-work/app build`
  - Attempted multiple times.
  - Local process hung in the existing `packages/ui` `tsup` prebuild/declaration phase.
  - Treat production build as not locally certified until CI or a clean Node/pnpm environment completes it.

## Known Local Environment Notes

The local checkout showed intermittent hangs for simple `git`, `sed`, `node`, `tsc`, and `tsup` commands. There was no `.git/*.lock` found. Because local Git was unreliable and the remote branch had newer GitHub-API commits, updates were pushed through GitHub's contents API rather than local `git push`.

Do not force-push from this stale local branch unless you first fetch and confirm the branch is at least `df8ca4b930c0d79fe0ae4cc44fd6233bb74144f4`.

## Phase 2 Product Goal

Phase 2 should make Bittensor usable from chat, not only visible in a panel.

Target experience:

> A user says what they want in normal language. Matterhorn chooses the right Bittensor subnet or Bittensor action path, explains the tradeoffs, prepares safe quotes, and never requires the user to understand Bittensor internals unless they ask.

Examples:

- "Find the best Bittensor subnet for image generation."
- "Use Bittensor to analyze this document."
- "Compare SN14 and SN64 for compute."
- "Explain my TAO exposure."
- "Prepare a 1 TAO stake quote for subnet 14."
- "Which subnets are useful for agents?"

The user should not need to know these concepts upfront:

- `netuid`
- alpha token
- metagraph
- emissions
- tempo
- hotkey
- coldkey
- Dynamic TAO
- subnet AMM

Matterhorn should translate these concepts into plain-English choices and risk labels.

## Phase 2 Architecture

Build three layers on top of the PR #2 provider interface.

### 1. Bittensor Data Layer

Purpose: make every subnet explainable and monitorable.

Add or extend:

- `BittensorDataProvider`
- `BittensorSubnetRegistry`
- cache freshness metadata
- source confidence metadata

Inputs:

- TAO.app data
- Subtensor SDK/RPC where practical
- subnet metadata/social/docs sources
- existing fallback data
- manually curated launch registry for important subnets

Output shape should include:

- identity: name, netuid, symbol, owner coldkey/hotkey
- user utility summary
- category
- supported tasks
- access method
- live/economic metrics
- metagraph summary
- risks
- docs/social links
- freshness and source confidence

### 2. Bittensor Capability Layer

Purpose: decide what a subnet can actually do for a user.

Add `SubnetCapability` records:

- `capabilityId`
- `netuid`
- `category`
- `taskTypes`
- `inputTypes`
- `outputTypes`
- `accessStatus`
- `accessMethod`
- `requiresWallet`
- `requiresExternalSigner`
- `estimatedCost`
- `latencyExpectation`
- `riskLevel`
- `adapterStatus`

Use these `accessStatus` values:

- `available`: Matterhorn can call it now.
- `limited`: Matterhorn can partially use it.
- `research_only`: Matterhorn can explain/compare/monitor only.
- `unavailable`: known subnet, no safe or stable interaction path yet.

### 3. Bittensor Chat Orchestrator

Purpose: route normal chat requests into Bittensor tools.

Add an intent router that classifies:

- subnet discovery
- subnet explanation
- subnet comparison
- task routing to a subnet
- wallet inspection
- quote preparation
- risk explanation
- external signer preparation
- monitoring/watchlist

The router should decide whether to:

- answer directly
- ask one clarifying question
- call Bittensor data tools
- call a subnet adapter
- prepare a quote
- refuse unsafe execution
- explain why a subnet cannot be used yet

## Phase 2 Backend Interfaces

Add these server/MCP-level tools:

- `bittensor_chat`
- `bittensor_route_task`
- `bittensor_find_capability`
- `bittensor_get_subnet_capabilities`
- `bittensor_use_subnet`
- `bittensor_get_subnet_health`
- `bittensor_get_subnet_news`
- `bittensor_explain_wallet_risk`
- `bittensor_prepare_external_signing`
- `bittensor_monitor_watchlist`

Recommended route additions:

- `POST /api/bittensor/chat`
- `GET /api/bittensor/capabilities`
- `GET /api/bittensor/subnets/:netuid/capabilities`
- `POST /api/bittensor/subnets/:netuid/invoke`
- `GET /api/bittensor/subnets/:netuid/health`
- `POST /api/bittensor/intent`
- `POST /api/bittensor/external-signing/prepare`
- `POST /api/bittensor/watchlist`

## Subnet Adapter Interface

All subnet usage should go through a narrow adapter contract.

```ts
type SubnetAdapterStatus = "available" | "limited" | "research_only" | "unavailable";

type SubnetAdapter = {
  netuid: number;
  capabilityId: string;
  status: SubnetAdapterStatus;
  explain(): Promise<SubnetCapabilityExplanation>;
  estimate(input: unknown): Promise<SubnetUsageEstimate>;
  invoke(input: unknown): Promise<SubnetUsageResult>;
};
```

Important: not all subnets will be invokable from Matterhorn. Phase 2 should make every subnet understandable first, then add direct usage adapter by adapter.

## Phase 2 UX Requirements

Chat should show compact, actionable cards:

- top subnet matches
- why this subnet fits
- current freshness/source
- capability status
- estimated cost
- risk level
- "Ask more"
- "Compare"
- "Prepare quote"
- "Use this subnet" only when an adapter is available

Avoid making users manually choose netuids unless they want expert mode.

Example flow:

1. User: "I need decentralized image generation."
2. Matterhorn: finds relevant subnets and explains the top 3.
3. User: "Use the best one."
4. Matterhorn: either invokes an available adapter or explains why this subnet is research-only.
5. If staking/payment is involved, Matterhorn prepares a quote and requires external signing.

## Phase 2 Safety Rules

Do:

- state uncertainty and data freshness.
- distinguish explanation from financial advice.
- require explicit confirmation before preparing action quotes.
- show transaction/action warnings.
- keep external signing mandatory.
- add risk labels for dTAO alpha exposure, liquidity/slippage, validator choice, source freshness, and subnet churn.

Do not:

- say "you should buy/stake" as financial advice.
- hide alpha/slippage risk when subnet staking is discussed.
- auto-select validators without explaining why.
- create seed phrase/private key fields.
- execute or broadcast Bittensor transactions inside Matterhorn V2 unless the product explicitly changes custody/signing policy.

## Phase 2 Milestones

1. Subnet registry and capability schema.
2. Chat intent router for Bittensor requests.
3. Capability-aware subnet search and comparison.
4. Wallet-aware explanations using watch-only coldkey data.
5. External signer preparation flow.
6. First 5 to 10 high-value subnet adapters.
7. Watchlist and monitoring alerts.
8. Agent/MCP tools for chat-native Bittensor operations.
9. Safety and no-secret regression suite.
10. Production build/CI hardening before merge.

## Phase 2 Test Plan

Add tests for:

- intent classification
- capability ranking
- no hallucinated `available` adapters
- provider unavailable states
- stale cache states
- external signing payloads
- no secret fields in UI/API/MCP/localStorage/logs
- quote warning generation
- wallet risk explanations
- subnet adapter unavailable fallback
- production app build

## Immediate Next Steps For Another Agent

1. Wait for PR #2 CI on latest head `df8ca4b930c0d79fe0ae4cc44fd6233bb74144f4`.
2. If Ubuntu or i18n fails, inspect logs before changing code.
3. Re-run or repair production build verification. The unresolved command is `pnpm --filter @matterhorn-work/app build`.
4. Do not merge until CI is green or the failing/queued runner situation is explicitly accepted.
5. For Phase 2, start by adding the subnet registry/capability schema and chat intent router. Do not start with signing or transaction execution.
