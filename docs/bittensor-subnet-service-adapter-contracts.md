# Bittensor Subnet Service Adapter Contracts

This guide defines the contract layer that must exist before Matterhorn Work adds real direct execution against Bittensor subnet services.

The product rule remains:

```text
Chat is primary. Direct subnet service execution is optional, explicit, reviewed, and contract-gated.
```

Matterhorn can already explain, discover, compare, monitor, read wallet/stake context, and prepare unsigned Bittensor previews for every subnet. Calling a subnet's actual off-chain service is different. Subnets do not expose one universal service API, so every direct service call must go through a safe adapter contract.

## What The Contract Does

Each subnet capability manifest includes an `adapterContract` with:

- contract version;
- netuid;
- adapter kind: `inference`, `data_search`, `compute`, `creative_media`, `agent_tooling`, `universal`, or `unsupported`;
- supported intents;
- endpoint readiness;
- auth model;
- cost model;
- timeout;
- request schema;
- result schema;
- privacy declaration;
- safety notes;
- unsupported fallback behavior.

The contract is not a service call. It is a safety declaration and validation target. A direct service adapter cannot run unless the service-call gate passes.

## Service-Call Gate

Matterhorn only treats a subnet service call as supported when all of these are true:

- the chat/tool intent is explicitly `service_call`;
- a configured adapter endpoint exists for that netuid;
- the capability is not `unsupported`;
- `adapterContract.endpointConfigured` is true;
- `adapterContract.supportedIntents` includes `service_call`;
- `validateBittensorSubnetServiceAdapterContract(adapterContract).ok` is true.

If any condition fails, Matterhorn must return unsupported behavior:

```text
I can explain, compare, monitor, and prepare safe previews for this subnet, but I cannot call its direct service yet.
```

## Privacy Rules

Adapter contracts must never request, accept, store, log, or forward:

- seed phrases;
- mnemonics;
- private keys;
- keyfiles;
- wallet exports;
- SURI material;
- raw signing payloads that are not part of the external signing flow;
- wallet portfolio data unless a future explicit privacy review allows it.

The current adapter contract privacy fields must stay:

```json
{
  "sendsWalletData": false,
  "sendsKeyMaterial": false
}
```

Configured service adapters may receive visible task text and public routing context only when the preview card says so.

## Unsupported Behavior

Unsupported is a first-class state, not an error.

Use these statuses:

- `adapter_missing`: the subnet appears to need an adapter, but none is configured.
- `unsupported`: the subnet/category has no supported direct service adapter path.
- `explain_and_monitor_only`: the contract is present, but the safe fallback is still explanation, comparison, monitoring, and guidance.

Unsupported responses should still be useful. They should offer:

- subnet explanation;
- capability summary;
- metagraph context;
- wallet/stake guidance where a public SS58 address exists;
- validator comparison;
- monitoring/watch creation;
- unsigned staking preview guidance after the user chooses required public context.

## Adapter Author Checklist

Before adding any real adapter implementation:

1. Define the adapter kind and category fit.
2. Define request and result schemas with no secret-shaped field names.
3. Declare auth and cost model.
4. Declare privacy behavior.
5. Declare clear safety notes.
6. Add a contract fixture.
7. Run the contract harness.
8. Add preview behavior tests.
9. Add invocation refusal tests for invalid or missing contracts.
10. Add one explicit invocation test with a mocked adapter endpoint.
11. Confirm no payload contains seed, mnemonic, private key, key export, or auth env values.

## Test Harness

Use the server Bittensor test suite:

```bash
bun test apps/server/src/tools/bittensor.test.ts
```

The reusable harness is:

```ts
buildBittensorSubnetServiceAdapterContractTestFixtures()
runBittensorSubnetServiceAdapterContractTests(cases)
```

The default fixtures cover:

- a configured safe service adapter;
- a missing adapter that correctly falls back to explain/monitor behavior;
- an unsafe schema that is rejected.

Harness reports are sanitized. They report readiness, validation errors, warnings, supported intents, and unsupported status. They do not echo full raw contracts or auth env names.

## Mock Data-Search Adapter

The first direct-service adapter paths are mock-only adapters. They exist to prove the full preview, confirmation, invocation, and result-rendering loop without calling any real subnet service.

Enable data-search explicitly:

```bash
export BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1
export BITTENSOR_SUBNET_ADAPTERS_JSON='[
  {
    "netuid": 77,
    "name": "Mock data search adapter",
    "serviceAdapter": "data_search",
    "endpoint": "mock://data-search",
    "requiredAuth": "none",
    "costModel": "free_read",
    "safetyNotes": ["Mock data search adapter safety note."]
  }
]'
```

Enable inference explicitly:

```bash
export BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1
export BITTENSOR_SUBNET_ADAPTERS_JSON='[
  {
    "netuid": 77,
    "name": "Mock inference adapter",
    "serviceAdapter": "inference",
    "endpoint": "mock://inference",
    "requiredAuth": "none",
    "costModel": "free_read",
    "safetyNotes": ["Mock inference adapter safety note."]
  }
]'
```

Expected behavior:

- without `BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1`, `mock://` adapters are ignored and the subnet remains unsupported for direct service calls;
- with the flag enabled, preview returns a request SHA-256;
- invocation refuses to run unless `reviewedRequestSha256` matches the preview hash;
- successful invocation returns a standardized adapter runner envelope with `mode: "mock"`, `adapterKind`, `requestSha256`, `output`, `warnings`, `usage`, and `costEstimate`;
- real HTTPS adapter previews can be enabled for review with `BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1` plus an allowlisted endpoint, but actual invocation also requires the exact `BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON` request hash and `BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1` for that reviewed canary window;
- `mock://data-search` returns deterministic fixture search results;
- `mock://inference` returns a deterministic fixture completion with model `matterhorn-mock-inference-v0`;
- no real Bittensor subnet service is called.

## Adapter Runner Envelope

All direct service adapters must return the same runner envelope, whether they are mock adapters or future HTTP adapters:

```json
{
  "ok": true,
  "mode": "mock",
  "adapterKind": "data_search",
  "netuid": 77,
  "requestSha256": "<reviewed-request-hash>",
  "message": "Adapter completed.",
  "output": {},
  "warnings": [],
  "usage": { "units": 1, "label": "mock_request" },
  "costEstimate": { "amount": 0, "currency": "TAO", "model": "free_read" }
}
```

The runner is responsible for:

- routing supported adapter schemes such as `mock://...` and future `https://...`;
- preserving the reviewed request hash in the result;
- normalizing adapter warnings, usage, and cost estimates;
- preventing mock adapters from running unless the mock env gate is enabled.

## Required PR Shape For A Real Adapter

A real adapter PR should be split into small steps:

1. contract fixture and test harness coverage;
2. preview card coverage;
3. mocked invocation route/tool coverage;
4. docs for auth, cost, privacy, and failure modes;
5. only then, real endpoint configuration behind environment variables.

Do not combine a new service adapter with signing, custody, wallet import, or broadcast changes.

## Current Status

Current support is mock-execution-ready and real-canary-gated:

- capability manifests expose adapter contracts;
- preview and invocation paths are contract-gated;
- unconfigured subnets return unsupported behavior;
- chat cards show contract validity;
- the reusable test harness covers safe, missing, and unsafe contracts;
- mock data-search and inference adapters can prove the preview-confirm-invoke loop when explicitly enabled;
- real HTTPS adapters can be previewed for review, but invocation requires endpoint allowlisting, `BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1`, an exact short-lived request-hash approval, and `BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1`;
- operators can ask chat to audit the canary gate before and after a canary so stale acknowledgement flags or approvals are visible.

The next safe step is to run one reviewed real-adapter canary against a known provider endpoint, collect evidence, audit the gate afterward, and keep general direct subnet execution disabled until the canary report is accepted.
