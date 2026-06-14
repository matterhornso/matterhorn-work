# Matterhorn Work Bittensor Operator Playbook

This playbook is the Bittensor-specific workflow for Codex, Claude Code, Claude Desktop, Cursor, or any MCP-capable agent operating Matterhorn Work.

Use the general [Agent Operator Workflow](./agent-operator-workflow.md) first to start Matterhorn Work, run the doctor, configure MCP, and confirm the server is healthy. Then use this playbook for Bittensor tasks.

For a repeatable pass/fail probe of this playbook, run [Matterhorn Work Bittensor Live QA](./bittensor-live-qa.md).

For direct subnet service execution planning, use [Bittensor Subnet Service Adapter Contracts](./bittensor-subnet-service-adapter-contracts.md). Matterhorn must pass the adapter contract gate before it can call any configured subnet service.

The product rule is:

```text
Chat is the primary Bittensor interface. Cards and tool output are for confirmation, context, and safety.
```

## Safety Rules

- Never ask for seed phrases, mnemonics, private keys, keyfiles, wallet exports, or raw signing material.
- Use public SS58 addresses for wallet reads.
- Keep Bittensor coldkey and hotkey concepts explicit. Do not map them onto EVM wallet assumptions.
- Treat staking, unstaking, moving stake, transfers, registration, and serving as action previews until an external signer is involved.
- Do not give financial advice. Explain exposure, risk, slippage, source/freshness, and tradeoffs in plain English.
- Never invent a validator hotkey, coldkey, netuid, amount, or destination.
- If a prompt is missing required public context, ask one clarifying question instead of guessing.
- If a subnet service adapter is missing, say that Matterhorn can explain, compare, monitor, and prepare guidance for that subnet, but cannot call the subnet service yet.

## 1. Readiness

Run readiness before any Bittensor workflow:

```bash
matterhorn-work bittensor readiness --json
```

With MCP, call:

```json
{ "tool": "matterhorn_bittensor_readiness", "arguments": {} }
```

Good readiness output should make these visible:

- whether chat workflow tools are available;
- whether sidecar/live reads are configured;
- whether Bittensor remains non-custodial;
- whether capability data has source/freshness labels;
- whether signing/submission is disabled or externally signed only.

## 2. Beginner Explanation

CLI:

```bash
matterhorn-work bittensor chat \
  --message "I'm new to Bittensor. Explain TAO, subnets, coldkeys, hotkeys, staking, and validators in simple language." \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "I'm new to Bittensor. Explain TAO, subnets, coldkeys, hotkeys, staking, and validators in simple language."
  }
}
```

Expected behavior:

- intent is `learn`;
- response uses beginner language;
- no wallet address is required;
- no action preview is created;
- output distinguishes “using a subnet service” from “staking exposure to a subnet.”

## 3. Show My TAO

Wallet reads require an SS58 public address.

CLI:

```bash
matterhorn-work bittensor chat \
  --message "Show my TAO." \
  --ss58-address "<public-ss58-address>" \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "Show my TAO.",
    "ss58Address": "<public-ss58-address>"
  }
}
```

Expected behavior:

- intent is `wallet`;
- output includes a `wallet_snapshot` card when data is available;
- balance, stake total, positions count, source, block, freshness, and warnings are visible;
- if the SS58 address is missing, Matterhorn asks one clarification question;
- Matterhorn never asks for a seed phrase or wallet export.

## 4. Where Am I Staked?

CLI:

```bash
matterhorn-work bittensor chat \
  --message "Where am I staked?" \
  --ss58-address "<public-ss58-address>" \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "Where am I staked?",
    "ss58Address": "<public-ss58-address>"
  }
}
```

Expected behavior:

- intent is `wallet`;
- stake positions are prioritized by TAO value where available;
- output explains subnet, netuid, validator hotkey, alpha amount, TAO value, and slippage or freshness warnings;
- missing SS58 address returns a clarification, not fake wallet data.

## 5. Find Subnets For A Goal

CLI:

```bash
matterhorn-work bittensor chat \
  --message "Which Bittensor subnet is useful for image generation?" \
  --limit 5 \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "Which Bittensor subnet is useful for image generation?",
    "limit": 5
  }
}
```

Expected behavior:

- intent is `discover`;
- output includes subnet comparison cards;
- each recommendation explains utility, category, user benefit, adapter support, source, and freshness where available;
- if a direct service adapter is unavailable, the answer says Matterhorn can explain/monitor/prepare guidance but cannot call the subnet service yet.

Other useful discovery prompts:

```text
Find subnets useful for data search and retrieval.
Find subnets useful for compute or GPU work.
Find subnets useful for agent tooling.
Compare subnets for a creative media workflow.
Which subnet category is relevant for this task: <task>?
```

## 6. Compare Validators On A Subnet

CLI:

```bash
matterhorn-work bittensor chat \
  --message "Compare validators on subnet 14 with a balanced strategy." \
  --netuid 14 \
  --strategy balanced \
  --limit 6 \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "Compare validators on subnet 14 with a balanced strategy.",
    "netuid": 14,
    "strategy": "balanced",
    "limit": 6
  }
}
```

Expected behavior:

- intent is validator comparison or staking guidance;
- output includes validator selection cards when data is available;
- strategy defaults to `balanced` when not specified;
- fallback-only data is clearly labeled;
- Matterhorn does not tell the user which validator to choose as financial advice.

Supported strategy labels:

- `balanced`;
- `yield`;
- `safety`.

## 7. Analyze A Subnet

Phase 1 of the advanced Bittensor interface adds explainable public-data intelligence reports. Use this when a user asks whether a subnet looks healthy, risky, stale, concentrated, adapter-ready, or worth investigating further.

CLI through chat:

```bash
matterhorn-work bittensor chat \
  --message "Analyze subnet 14 risk and explain the weak spots." \
  --netuid 14 \
  --json
```

Direct API:

```bash
curl -s \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  "$MATTERHORN_WORK_SERVER_URL/api/bittensor/intelligence/subnet/14" | python -m json.tool
```

MCP:

```json
{
  "tool": "bittensor_analyze_subnet",
  "arguments": {
    "netuid": 14
  }
}
```

Expected behavior:

- output includes an `intelligence_report` card;
- the score is explainable and sourced from public/provider data;
- market, metagraph, validator concentration, capability readiness, source, freshness, and mechanism-awareness status are visible;
- the answer is clearly not financial advice;
- unsupported or missing provider fields are warnings, not invented facts.

## 8. Analyze Wallet Exposure

Use this when a user asks about portfolio risk, stake exposure, concentration, slippage, or weak spots in their Bittensor wallet.

CLI through chat:

```bash
matterhorn-work bittensor chat \
  --message "Analyze my TAO portfolio risk and weak spots." \
  --ss58-address "<public-ss58-address>" \
  --json
```

Direct API:

```bash
curl -s \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  "$MATTERHORN_WORK_SERVER_URL/api/bittensor/intelligence/wallet/<public-ss58-address>" | python -m json.tool
```

MCP:

```json
{
  "tool": "bittensor_analyze_wallet",
  "arguments": {
    "ss58Address": "<public-ss58-address>"
  }
}
```

Expected behavior:

- output includes an `intelligence_report` card;
- Matterhorn shows free TAO, visible staked TAO, subnet count, validator hotkey count, largest-position share, slippage risk, source, block, and freshness where available;
- missing wallet context returns one clarification question;
- Matterhorn never asks for seed phrases, mnemonics, private keys, wallet exports, or signed payloads.

## 9. Prepare Staking 1 TAO Safely

Staking preparation needs explicit public context. Matterhorn must not guess the netuid or validator hotkey.

Clarification-first CLI:

```bash
matterhorn-work bittensor chat \
  --message "Prepare staking 1 TAO safely." \
  --amount-tao 1 \
  --json
```

Expected behavior:

- intent is `stake_plan`;
- execution is `clarification_required`;
- Matterhorn asks for missing netuid and validator hotkey;
- output may include guidance cards, but not a fake payload.

Complete unsigned-preview CLI:

```bash
matterhorn-work bittensor chat \
  --message "Prepare staking 1 TAO safely." \
  --netuid 14 \
  --amount-tao 1 \
  --validator-hotkey "<validator-hotkey>" \
  --coldkey "<public-coldkey-label-or-address>" \
  --rate-tolerance 0.01 \
  --json
```

MCP:

```json
{
  "tool": "matterhorn_bittensor_chat",
  "arguments": {
    "message": "Prepare staking 1 TAO safely.",
    "netuid": 14,
    "amountTao": "1",
    "validatorHotkey": "<validator-hotkey>",
    "coldkey": "<public-coldkey-label-or-address>",
    "rateTolerance": 0.01
  }
}
```

Expected behavior:

- execution is `unsigned_preview` when required context is present;
- output includes a `staking_quote` or `signed_action_review` style card;
- netuid, amount, validator hotkey, coldkey label, fee, slippage/rate tolerance, expected consequence, source, freshness, warnings, and external-signature requirement are visible;
- no signing happens inside Matterhorn;
- no seed phrase, mnemonic, private key, keyfile, or wallet export is requested.

Lower-level no-custody signing CLI:

```bash
matterhorn-work bittensor extrinsic prepare \
  --action stake \
  --netuid 14 \
  --amount-tao 1 \
  --validator-hotkey "<validator-hotkey>" \
  --coldkey "<public-coldkey-label-or-address>" \
  --rate-tolerance 0.01 \
  --json

matterhorn-work bittensor extrinsic handoff \
  --preview-json '<preview-json-from-prepare>' \
  --json

matterhorn-work bittensor extrinsic submit \
  --preview-json '<preview-json-from-prepare>' \
  --signature "<externally-signed-payload>" \
  --signer-address "<public-signer-address>" \
  --json
```

Lower-level no-custody MCP:

```json
{
  "tool": "matterhorn_bittensor_prepare_extrinsic",
  "arguments": {
    "action": "stake",
    "netuid": 14,
    "amountTao": "1",
    "hotkey": "<validator-hotkey>",
    "coldkey": "<public-coldkey-label-or-address>",
    "rateTolerance": 0.01
  }
}
```

Then:

```json
{
  "tool": "matterhorn_bittensor_create_signing_handoff",
  "arguments": {
    "preview": "<preview-object-from-prepare>"
  }
}
```

Only after an external signer returns a signed payload:

```json
{
  "tool": "matterhorn_bittensor_submit_signed_extrinsic",
  "arguments": {
    "preview": "<preview-object-from-prepare>",
    "signature": "<externally-signed-payload>",
    "signerAddress": "<public-signer-address>"
  }
}
```

Expected behavior:

- prepare returns an unsigned preview that requires external signing;
- handoff returns a payload SHA-256 and instructions for signing outside Matterhorn;
- submit accepts only an externally signed payload plus public signer metadata;
- Matterhorn still does not import keys, custody funds, or ask for raw signing material.

## 10. Follow-Up Context

Matterhorn can return reusable public Bittensor context. Use `contextId` for follow-ups when present.

Example:

```bash
matterhorn-work bittensor chat \
  --message "Show my TAO." \
  --ss58-address "<public-ss58-address>" \
  --json
```

Then:

```bash
matterhorn-work bittensor chat \
  --message "Where am I staked?" \
  --context-id "<context-id-from-previous-response>" \
  --json
```

Context may remember public values such as SS58 address, netuid, amount, validator hotkey, coldkey label, recipient, destination, last intent, and warnings. Context must not store or expose signing material.

## 11. Monitoring Watches And Alert Digest

Matterhorn watches are the bridge from one-off Bittensor answers to an ongoing copilot loop. Use them when a user asks to monitor subnet health, wallet exposure, validator drift, emissions, stale data, or slippage warnings.

Create a watch through chat when possible:

```bash
matterhorn-work bittensor chat \
  --message "Watch subnet 14 for validator concentration and stale data." \
  --netuid 14 \
  --json
```

For CLI operators, use the watch digest after watches exist:

```bash
matterhorn-work bittensor watch digest \
  --max-alerts 5 \
  --json
```

To act on one alert, use the alert key from the digest. Matterhorn will run the alert's suggested copilot prompt through Bittensor chat with public watch context only:

```bash
matterhorn-work bittensor watch act \
  --alert-key "<alert-key-from-digest>" \
  --json
```

For MCP operators, call the digest tool:

```json
{
  "tool": "matterhorn_bittensor_watch_digest",
  "arguments": {
    "maxAlerts": 5
  }
}
```

Expected behavior:

- output summarizes total watches, alert counts, and status counts;
- alert entries include watch id, kind, label, netuid, wallet or validator context when available, alert key, notification intent, reason, and a suggested next prompt/action;
- `maxAlerts` keeps the operator loop compact;
- `includeOk` can be enabled for full status sweeps;
- `watch act` executes only the alert's suggested public-data Bittensor chat prompt and does not sign or broadcast anything;
- digest output is read-only and never requests signing material.

## 12. Unsupported Subnet Service Calls

When the user asks to “use subnet X for this task,” Matterhorn should try the supported subnet adapter path only when a service adapter is configured.

Capability discovery CLI:

```bash
matterhorn-work bittensor capabilities --json

matterhorn-work bittensor capability \
  --netuid 14 \
  --json
```

Capability discovery MCP:

```json
{
  "tool": "matterhorn_bittensor_list_capabilities",
  "arguments": {}
}
```

```json
{
  "tool": "matterhorn_bittensor_get_subnet_capability",
  "arguments": { "netuid": 14 }
}
```

CLI:

```bash
matterhorn-work bittensor chat \
  --message "Use subnet 14 for this image generation task: create a cyberpunk mountain scene." \
  --netuid 14 \
  --json
```

Expected behavior when no adapter exists:

- execution is `unsupported` or an explanatory answer;
- output says Matterhorn can explain, compare, monitor, and prepare guidance for that subnet;
- output does not pretend it called the subnet service.

For lower-level MCP/API use, service calls should follow a preview-confirm-invoke sequence:

1. Read the subnet capability manifest and inspect supported chat intents, adapter support, auth, cost, schemas, user benefits, and safety notes.
2. Preview the subnet invocation and inspect adapter support, auth, cost, safety notes, warnings, and the request SHA-256.
3. Ask the user to confirm the exact preview, including the request SHA-256.
4. Invoke only when the adapter is configured and pass the preview request SHA-256 back as `previewRequestSha256`.

This keeps direct adapter execution explicit while letting Matterhorn explain unsupported subnets without pretending a service call happened.

### Mock Adapter Operator Loop

Use this loop to test subnet adapter behavior before any real direct subnet service is enabled.

Before configuring a real adapter, ask Matterhorn for a sanitized template. This returns placeholder JSON, allowlist value, credential env name, request/result schemas, and preflight steps, but never credential values:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/templates?adapter=data_search&netuid=77"
```

Equivalent MCP tool:

```text
bittensor_get_subnet_adapter_templates({
  "adapter": "data_search",
  "netuid": 77
})
```

Copy the template only after replacing `<NETUID>` where needed and setting the credential value outside Matterhorn. Then run the adapter doctor before previewing or invoking any user request.

For a real HTTPS adapter, expose a metadata document at the configured `metadataEndpoint` or at:

```text
https://<adapter-host>/.well-known/matterhorn-bittensor-adapter.json
```

Then run the conformance probe. This sends no user task text, wallet data, signing payload, or request body:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/conformance?netuid=77"
```

Equivalent MCP tool:

```text
bittensor_probe_subnet_adapter_conformance({
  "netuid": 77
})
```

Expected conformance behavior:

- metadata endpoint must be allowlisted;
- metadata declares `matterhorn.bittensor.adapter.v1`;
- metadata netuid and service adapter match Matterhorn config;
- `service_call`, `safeModeRequired`, and `requestHashRequired` are explicit;
- privacy explicitly forbids key material and wallet data;
- request/result schemas do not contain secret-shaped fields;
- response size is bounded.

The main Bittensor readiness audit also includes this conformance signal, so `GET /api/bittensor/readiness` should show `subnet_adapter_conformance` whenever operators review whether direct subnet service usage is safe enough to proceed.

Start Matterhorn Work with mock adapters enabled in the trusted local shell:

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

Run the adapter doctor before previewing anything:

```bash
curl -s http://localhost:8787/api/bittensor/adapters/doctor
```

Expected doctor behavior:

- configured mock adapters are `ready` only when `BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1`;
- real HTTPS adapters are blocked until their host or origin is listed in `BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST`;
- loopback HTTP adapters are blocked unless `BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS=1`;
- API-key adapters report whether a credential is present without returning the env var name or token value;
- request/result schemas with seed, mnemonic, private key, wallet export, or similar fields are blocked.

Then run the dry-run harness. It invokes only configured mock adapters and skips non-mock adapters:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/dry-run?netuid=77&task=Answer%20this%20Bittensor%20subnet%20question"
```

Expected dry-run behavior:

- preview reports the mock adapter as supported;
- invocation without the reviewed hash is rejected;
- invocation after changing the task text is rejected;
- invocation with the exact reviewed request hash succeeds;
- returned payloads do not expose token values, auth env names, seed phrases, private keys, wallet exports, or similar signing material.

Preview:

```bash
matterhorn-work bittensor subnet-preview \
  --netuid 77 \
  --intent service_call \
  --task "Answer this Bittensor subnet question in one sentence." \
  --ss58-address "<public-ss58-address>" \
  --json
```

Copy `.requestSha256` from the preview. Invoke only with the reviewed hash:

```bash
matterhorn-work bittensor subnet-invoke \
  --netuid 77 \
  --intent service_call \
  --task "Answer this Bittensor subnet question in one sentence." \
  --ss58-address "<public-ss58-address>" \
  --preview-request-sha256 "<requestSha256-from-preview>" \
  --json
```

Expected result:

- `supported` is true only when the adapter contract gate passes;
- the invocation refuses missing or mismatched preview hashes;
- the result card shows adapter mode, request hash, output summary, usage, and cost;
- `mode` is `mock`, proving no real Bittensor subnet service was called.

## 13. MCP Sequence For Bittensor Operators

Ask Codex or Claude to follow this exact Bittensor sequence:

```text
Use the Matterhorn Work MCP server for Bittensor.

1. Call matterhorn_bittensor_readiness.
2. For beginner questions, call matterhorn_bittensor_chat with:
   { "message": "I'm new to Bittensor. Explain it simply." }
3. For wallet reads, require a public SS58 address and call:
   { "message": "Show my TAO.", "ss58Address": "<public-ss58-address>" }
4. For stake-position reads, call:
   { "message": "Where am I staked?", "ss58Address": "<public-ss58-address>" }
5. For subnet discovery, call:
   { "message": "Which subnet is useful for image generation?", "limit": 5 }
6. For validator comparison, call:
   { "message": "Compare validators on subnet 14.", "netuid": 14, "strategy": "balanced", "limit": 6 }
7. For staking preparation, require netuid, amountTao, and validatorHotkey. If missing, ask one clarification question.
8. For complete staking preview, call:
   {
     "message": "Prepare staking 1 TAO safely.",
     "netuid": 14,
     "amountTao": "1",
     "validatorHotkey": "<validator-hotkey>",
     "coldkey": "<public-coldkey-label-or-address>",
     "rateTolerance": 0.01
   }
9. For lower-level action workflows, call `matterhorn_bittensor_prepare_extrinsic`, then `matterhorn_bittensor_create_signing_handoff`.
10. Submit only after external signing with `matterhorn_bittensor_submit_signed_extrinsic`, and only with public signer metadata plus the externally signed payload.
11. Before real adapter setup, call `bittensor_get_subnet_adapter_templates` for the target adapter kind and netuid; use placeholders only and set credential values outside Matterhorn.
12. Before any real adapter invocation, call `bittensor_probe_subnet_adapter_conformance`; proceed only if metadata, safe-mode, request-hash, privacy, schema, and response-bound checks pass.
13. For subnet service use, call `matterhorn_bittensor_get_subnet_capability` first to inspect adapter support, auth, cost, schemas, benefits, and safety notes.
14. Then call `matterhorn_bittensor_preview_subnet_invocation`, ask the user to confirm the request SHA-256, and call `matterhorn_bittensor_invoke_subnet` with `previewRequestSha256` only if a configured adapter exists.
15. For ongoing monitoring, create watches with chat or the lower-level watch APIs.
16. Call `matterhorn_bittensor_watch_digest` to get a compact alert queue, then use each alert's prompt/action label as the next safe chat step.
17. Treat every action output as unsigned preview or external-signing handoff unless Matterhorn explicitly reports a safe signed-submission path.
18. Never request seed phrases, mnemonics, private keys, keyfiles, wallet exports, or host tokens.
```

## 14. What Good Looks Like

A good Bittensor operator response:

- starts with the direct answer in beginner language;
- names the intent and required context only when useful;
- includes cards or structured output for wallet, subnet, validator, or staking data;
- labels source and freshness;
- warns when data is fallback-only, stale, unavailable, or unsupported;
- explains coldkey/hotkey meaning when staking is involved;
- says what the user must provide next when clarification is required;
- clearly says “external signature required” before any action that moves funds or changes stake.

A bad Bittensor operator response:

- asks for private keys or seed phrases;
- treats an EVM address as a Bittensor SS58 address;
- invents a validator hotkey;
- hides fallback or stale data;
- claims to have used a subnet service without an adapter;
- gives financial advice;
- submits or signs without explicit external confirmation.
