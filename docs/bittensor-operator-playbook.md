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
- whether subnet adapter doctor, marketplace, conformance, preflight, and operator handoff checks are safe before any service execution;
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

## 4. Wallet Timeline Controls

Wallet timeline persistence is opt-in and public-data-only. It is useful for customer demos where a user wants "what changed since last time?" to survive process restarts.

Enable it only when needed:

```bash
export BITTENSOR_WALLET_TIMELINE_ENABLE_PERSISTENCE=1
export BITTENSOR_WALLET_TIMELINE_PATH="$HOME/.matterhorn-work/bittensor-wallet-timeline.json"
```

CLI status:

```bash
matterhorn-work bittensor wallet-timeline status --json
```

CLI export for one public wallet:

```bash
matterhorn-work bittensor wallet-timeline export \
  --ss58-address "<public-ss58-address>" \
  --json
```

CLI clear for one public wallet:

```bash
matterhorn-work bittensor wallet-timeline clear \
  --ss58-address "<public-ss58-address>" \
  --json
```

Expected behavior:

- status says whether persistence is enabled and where the local file lives;
- export returns versioned public wallet snapshots with content hashes;
- clear removes in-memory and persisted public baselines for that SS58 address;
- no seed phrases, private keys, mnemonics, wallet exports, signatures, or signing payloads appear in timeline output.

## 5. Where Am I Staked?

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

## 6. Find Subnets For A Goal

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

## 7. Compare Validators On A Subnet

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

Start with the combined onboarding plan. This gives an agent or operator the candidate profile, sanitized template, adapter doctor status, metadata conformance status, gate list, warnings, and next actions in one response without invoking any subnet service:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/onboarding-plan?adapter=data_search&netuid=77"
```

The response also includes an `adapter_onboarding` chat card with gate counts and a `send_to_chat` continuation action for the next safe step.

Equivalent MCP tool:

```text
bittensor_plan_subnet_adapter_onboarding({
  "adapter": "data_search",
  "netuid": 77
})
```

After onboarding is clean, check the launch gate. This does not invoke subnet services; it only reports whether the adapter path is still blocked, mock-ready, or requires manual review for a real HTTPS canary:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/launch-gate?adapter=data_search&netuid=77"
```

The response includes an `adapter_launch_gate` card with mock-ready, real-review, blocked, and manual-review counts plus a safe chat continuation action.

Equivalent MCP tool:

```text
bittensor_check_subnet_adapter_launch_gate({
  "adapter": "data_search",
  "netuid": 77
})
```

Before any real HTTPS canary, generate the manual canary review checklist:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/canary-review?adapter=data_search&netuid=77"
```

Equivalent MCP tool:

```text
bittensor_get_subnet_adapter_canary_review({
  "adapter": "data_search",
  "netuid": 77
})
```

For review handoff or audit, export the evidence bundle. It combines onboarding, launch gate, adapter preflight, canary review, required artifacts, warnings, and next actions without authorizing execution:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/evidence-bundle?adapter=data_search&netuid=77"
```

The response includes an `adapter_evidence_bundle` card with review status, preflight readiness, required artifact count, warnings, and a safe chat continuation action. Preflight readiness is evidence only: it means the manifest and bounded sample result are non-failing, not that a real subnet service may be invoked.

Equivalent MCP tool:

```text
bittensor_get_subnet_adapter_evidence_bundle({
  "adapter": "data_search",
  "netuid": 77
})
```

For a copy-pasteable redacted review packet, export the same evidence as markdown. The export includes preflight status and readiness flags, but intentionally avoids raw manifest/result payloads. This remains evidence only; it does not authorize or invoke subnet services:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/evidence-export?adapter=data_search&netuid=77" \
  | jq -r '.evidenceExport.markdown'
```

Equivalent MCP tool:

```text
bittensor_export_subnet_adapter_evidence({
  "adapter": "data_search",
  "netuid": 77
})
```

When an agent needs a deterministic go/no-go label, run the evidence review. It classifies the bundle as blocked, mock-dry-run-ready, or manual real-canary-review-required. It is still a planning artifact, not execution approval:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/evidence-review?adapter=data_search&netuid=77"
```

The response includes an `adapter_evidence_review` card with the decision, missing required artifact count, blocked reason count, and a safe continuation prompt.

Equivalent MCP tool:

```text
bittensor_review_subnet_adapter_evidence({
  "adapter": "data_search",
  "netuid": 77
})
```

Use lower-level candidate profiles when you want to inspect only the no-execution canary contract. This describes the adapter category, required gates, canary fixture, forbidden field classes, and operator questions before any provider endpoint is configured:

Real HTTPS or loopback HTTP subnet service adapters are blocked by default even when endpoint allowlists and credentials are configured. Mock adapters remain the only runnable adapter path unless `BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1` is explicitly set after evidence review and operator approval.

That flag is only the outer lock. Each real adapter invocation also requires `BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON` to include the exact preview request SHA-256 for the adapter and netuid:

```json
[
  {
    "netuid": 77,
    "serviceAdapter": "data_search",
    "requestSha256": "<preview-request-sha256>",
    "approvedBy": "operator",
    "approvedAt": "2026-06-09T00:00:00.000Z",
    "expiresAt": "2026-06-09T01:00:00.000Z",
    "reason": "Reviewed canary fixture and rollback plan."
  }
]
```

Audit approvals without exposing full hashes:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/approvals"
```

The response includes an `adapter_approval_audit` card with active, expired, and invalid approval counts plus a safe continuation prompt.

Equivalent MCP tool:

```text
bittensor_audit_subnet_adapter_approvals()
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/candidates?adapter=data_search&netuid=77"
```

Equivalent MCP tool:

```text
bittensor_get_subnet_adapter_candidates({
  "adapter": "data_search",
  "netuid": 77
})
```

Before configuring a real adapter, ask Matterhorn for a sanitized template. This returns placeholder JSON, allowlist value, credential env name, request/result schemas, and preflight steps, but never credential values:

Before writing or reviewing any adapter, inspect the machine-readable adapter
contract:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/spec"
```

MCP equivalent:

```text
bittensor_get_subnet_adapter_spec()
```

The spec defines required metadata fields, preview-confirm-invoke behavior,
response-size limits, forbidden secret-shaped fields, and the default-off real
adapter boundary.

To start from a safe example instead of a blank manifest:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/spec/examples?adapter=data_search&netuid=77"
```

Equivalent MCP tool:

```text
bittensor_get_subnet_adapter_manifest_examples({
  "adapter": "data_search",
  "netuid": 77
})
```

Each example includes its own manifest validation result and `adapter_manifest_validation` card. Copy it only as a starting point, then validate again after every edit.

Validate the adapter manifest before endpoint conformance. This is a no-execution check: it does not send task text, wallet data, signing payloads, or request bodies to any subnet service.

```bash
curl -s -X POST "http://localhost:8787/api/bittensor/adapters/spec/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "version": "matterhorn.bittensor.adapter.v1",
      "name": "Example data search adapter",
      "netuid": 77,
      "serviceAdapter": "data_search",
      "supportedIntents": ["explain", "metagraph", "service_call"],
      "safeModeRequired": true,
      "requestHashRequired": true,
      "maxResponseBytes": 64000,
      "healthStatus": "ok",
      "requiredAuth": "api_key",
      "costModel": "provider_priced",
      "endpointConfigured": true,
      "requestSchema": { "type": "object" },
      "resultSchema": { "type": "object" },
      "privacy": {
        "sendsTaskText": true,
        "sendsSs58Address": false,
        "sendsWalletData": false,
        "sendsKeyMaterial": false
      },
      "safetyNotes": ["No wallet data, key material, host token, or credential values are accepted."]
    }
  }'
```

Equivalent MCP tool:

```text
bittensor_validate_subnet_adapter_manifest({
  "manifest": {
    "version": "matterhorn.bittensor.adapter.v1",
    "netuid": 77,
    "serviceAdapter": "data_search",
    "supportedIntents": ["explain", "metagraph", "service_call"],
    "safeModeRequired": true,
    "requestHashRequired": true,
    "maxResponseBytes": 64000,
    "healthStatus": "ok",
    "privacy": {
      "sendsWalletData": false,
      "sendsKeyMaterial": false
    }
  }
})
```

Treat `status=fail` as a hard stop. Fix manifest errors before configuring endpoints, running conformance, building canary packets, or asking an operator for a real-adapter review.

Validate sample result envelopes before using them as canary evidence. This is also no-execution: it checks a supplied JSON object for size, renderability, request-hash auditability, and obvious secret leakage.

```bash
curl -s -X POST "http://localhost:8787/api/bittensor/adapters/result/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "result": {
      "mode": "mock",
      "requestSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "output": "Bounded adapter output.",
      "warnings": [],
      "usage": { "inputTokens": 12, "outputTokens": 8 },
      "costEstimate": { "amount": 0, "currency": "TAO" }
    }
  }'
```

Equivalent MCP tool:

```text
bittensor_validate_subnet_adapter_result({
  "result": {
    "mode": "mock",
    "requestSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "output": "Bounded adapter output.",
    "warnings": []
  }
})
```

Treat `status=fail` as a hard stop for canary evidence and chat rendering. Fix result envelope errors before asking for a real-adapter review.

For a combined manifest + result preflight packet:

```bash
curl -s -X POST "http://localhost:8787/api/bittensor/adapters/preflight" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "version": "matterhorn.bittensor.adapter.v1",
      "netuid": 77,
      "serviceAdapter": "data_search",
      "supportedIntents": ["explain", "metagraph", "service_call"],
      "safeModeRequired": true,
      "requestHashRequired": true,
      "maxResponseBytes": 64000,
      "healthStatus": "ok",
      "privacy": { "sendsWalletData": false, "sendsKeyMaterial": false }
    },
    "result": {
      "mode": "mock",
      "requestSha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "output": "Bounded adapter output.",
      "warnings": []
    }
  }'
```

Equivalent MCP tool:

```text
bittensor_build_subnet_adapter_preflight_packet({
  "manifest": { "...": "adapter metadata" },
  "result": { "...": "sample adapter result" }
})
```

Use the preflight packet before endpoint conformance or canary review. `readyForConformance=true` means metadata can move to endpoint checks; `readyForCanaryEvidence=true` means both manifest and sample result are non-failing.

For handoff to another agent, export the preflight packet as redacted markdown. The export intentionally omits raw manifest and result payloads:

```bash
curl -s -X POST "http://localhost:8787/api/bittensor/adapters/preflight-export" \
  -H "Content-Type: application/json" \
  -d '{ "manifest": { "...": "adapter metadata" }, "result": { "...": "sample adapter result" } }' \
  | jq -r '.preflightExport.markdown'
```

MCP equivalent:

```text
bittensor_export_subnet_adapter_preflight_packet({
  "manifest": { "...": "adapter metadata" },
  "result": { "...": "sample adapter result" }
})
```

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

For review handoff, export the conformance result as redacted markdown. This sends no user task text or wallet/signing payloads and omits raw metadata payloads plus endpoint URLs:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/conformance-export?netuid=77" \
  | jq -r '.conformanceExport.markdown'
```

Equivalent MCP tool:

```text
bittensor_export_subnet_adapter_conformance({
  "netuid": 77
})
```

Expected conformance export behavior:

- includes pass/fail/skipped counts and per-case metadata gate status;
- records no-user-task, privacy, request-hash, schema, and response-bound checks;
- omits raw metadata payloads, endpoint URLs, credentials, and wallet/private data;
- repeats that passing conformance is evidence only, not approval for real subnet execution.

Before deep-diving one adapter, ask for the read-only adapter marketplace. This is the operator-friendly status surface for every direct subnet service path Matterhorn knows about:

Chat:

```text
Which Bittensor subnet service adapters can Matterhorn call directly?
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/marketplace?adapter=data_search&limit=10" \
  | jq '.marketplace.summary'
```

Equivalent MCP tool:

```text
bittensor_list_subnet_adapter_marketplace({
  "adapter": "data_search",
  "limit": 10
})
```

For handoff, export the same marketplace status as redacted markdown:

Chat:

```text
Export the Bittensor adapter marketplace as markdown.
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/marketplace-export?adapter=data_search&limit=10" \
  | jq -r '.marketplaceExport.markdown'
```

Equivalent MCP tool:

```text
bittensor_export_subnet_adapter_marketplace({
  "adapter": "data_search",
  "limit": 10
})
```

Expected marketplace behavior:

- classifies entries as `universal_only`, `needs_adapter`, `mock_ready`, `manual_review_required`, `blocked`, or `unsupported`;
- shows netuid, category, utility, adapter kind, auth/cost model, source/freshness, endpoint mode, and next action;
- returns an `adapter_marketplace` card with a safe continuation prompt;
- never invokes a subnet service, never returns credential values, and never authorizes real subnet execution.

To decide what adapter work should happen next, ask for a roadmap:

Chat:

```text
What Bittensor subnet service adapter should we build next for data search?
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/roadmap?goal=data%20search&limit=3" \
  | jq '.roadmap.recommendations'
```

Equivalent MCP tool:

```text
bittensor_plan_subnet_adapter_roadmap({
  "goal": "data search",
  "limit": 3
})
```

Expected roadmap behavior:

- ranks adapter categories using marketplace status and an optional goal;
- returns candidate netuids, priority, rationale, next prompt, and safety warnings;
- remains planning evidence only: it does not configure endpoints, invoke adapters, approve requests, or sign/broadcast anything.

For a copy-pasteable roadmap handoff, export the same planning evidence as redacted markdown:

Chat:

```text
Export the Bittensor adapter roadmap as markdown for data search.
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/roadmap-export?goal=data%20search&limit=3" \
  | jq -r '.roadmapExport.markdown'
```

Equivalent MCP tool:

```text
bittensor_export_subnet_adapter_roadmap({
  "goal": "data search",
  "limit": 3
})
```

The export intentionally omits endpoint URLs, credential values, auth environment names, raw task text, wallet data, signing payloads, and full request hashes.

The main Bittensor readiness audit also includes this roadmap signal, so `GET /api/bittensor/readiness` should show `subnet_adapter_roadmap` with recommendation counts and the top adapter candidate before operators choose the next direct subnet service slice.
The readiness operator card should also offer a safe follow-up prompt to export the adapter roadmap as markdown, giving Codex/Claude a redacted next-adapter handoff without enabling real subnet execution.

When an agent or operator needs one compact packet instead of separate evidence, conformance, and dry-run exports, build the operator handoff. It summarizes the evidence review, conformance export, and mock dry-run export into one redacted go/no-go artifact:

Chat:

```text
Build a data search adapter operator handoff packet for subnet 77.
```

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/operator-handoff?adapter=data_search&netuid=77&task=Answer%20this%20Bittensor%20subnet%20question" \
  | jq -r '.handoff.markdown'
```

Equivalent MCP tool:

```text
bittensor_build_subnet_adapter_operator_handoff({
  "adapter": "data_search",
  "netuid": 77,
  "task": "Answer this Bittensor subnet question"
})
```

Expected operator handoff behavior:

- status is `blocked`, `mock_rehearsal_ready`, or `manual_review_required`;
- summarizes evidence review, conformance, and dry-run counts;
- names blockers and next actions without embedding raw metadata, task text, adapter output, endpoint URLs, full hashes, or credentials;
- repeats that real adapter execution still requires separate preview, exact request SHA-256 confirmation, short-lived approval, and explicit operator/user confirmation.

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

For review handoff, export the same dry-run evidence as redacted markdown. This export is mock-adapter evidence only and does not authorize any real subnet service execution:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/dry-run-export?netuid=77&task=Answer%20this%20Bittensor%20subnet%20question" \
  | jq -r '.dryRunExport.markdown'
```

Equivalent MCP tool:

```text
bittensor_export_subnet_adapter_dry_run({
  "netuid": 77,
  "task": "Answer this Bittensor subnet question"
})
```

Expected dry-run export behavior:

- includes pass/fail/skipped counts and per-case gate status;
- shows only short request SHA-256 prefixes;
- omits raw task text, raw adapter result payloads, credentials, and wallet/private data;
- repeats the safety boundary that real subnet service execution needs separate reviewed approval.

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

## 13. Real Adapter Approval Template

Real subnet adapters stay blocked by default. After a reviewed preview, evidence
bundle, evidence review, provider identity check, rollback owner, and canary
fixture review, operators can generate a short-lived approval manifest template
for the exact preview request hash.

The template does not authorize anything by itself and does not invoke any
subnet service. It is a copy-paste helper for the operator who intentionally
sets `BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON` during a reviewed canary window.

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/approval-template?netuid=77&serviceAdapter=data_search&requestSha256=<64-char-preview-request-sha256>&ttlMinutes=15"
```

MCP equivalent:

```json
{
  "tool": "bittensor_create_subnet_adapter_approval_template",
  "arguments": {
    "netuid": 77,
    "serviceAdapter": "data_search",
    "requestSha256": "<64-char-preview-request-sha256>",
    "ttlMinutes": 15,
    "reason": "Reviewed canary fixture, evidence bundle, and rollback plan."
  }
}
```

Use the returned `env.value` only after manual review. Keep approvals short-lived,
remove them after the canary, and run the approval audit afterwards:

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/approvals"
```

The response includes an `adapter_approval_template` card with the adapter,
netuid, short request hash, expiry, copy-payload action, and safe follow-up
prompt for post-canary approval audit.

For a single combined operator artifact, build the canary packet. It combines
the evidence export, evidence review, and a gated approval-template decision.
If evidence is blocked or only mock-ready, the packet returns no approval env
value.

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/canary-packet?adapter=data_search&netuid=77&requestSha256=<64-char-preview-request-sha256>&ttlMinutes=15"
```

MCP equivalent:

```json
{
  "tool": "bittensor_build_subnet_adapter_canary_packet",
  "arguments": {
    "adapter": "data_search",
    "netuid": 77,
    "requestSha256": "<64-char-preview-request-sha256>",
    "ttlMinutes": 15
  }
}
```

The response includes an `adapter_canary_packet` card. Only a packet with
`status: "approval_template_ready"` contains a copyable approval env value.

For review handoff to another agent, export the canary packet as redacted
markdown. The markdown intentionally omits full approval env values.

```bash
curl -s "http://localhost:8787/api/bittensor/adapters/canary-packet-export?adapter=data_search&netuid=77&requestSha256=<64-char-preview-request-sha256>&ttlMinutes=15" \
  | jq -r '.canaryPacketExport.markdown'
```

MCP equivalent:

```json
{
  "tool": "bittensor_export_subnet_adapter_canary_packet",
  "arguments": {
    "adapter": "data_search",
    "netuid": 77,
    "requestSha256": "<64-char-preview-request-sha256>",
    "ttlMinutes": 15
  }
}
```

## 14. MCP Sequence For Bittensor Operators

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
11. Before real adapter setup, call `bittensor_plan_subnet_adapter_onboarding` for the target adapter kind and netuid; it combines candidate, template, doctor, conformance, gates, warnings, and next actions without invoking a subnet service.
12. After onboarding is clean, call `bittensor_check_subnet_adapter_launch_gate`; `mock_ready` means only mock rehearsal can proceed, while `manual_review_required` means a real adapter still needs provider/canary/rollback review.
13. Before any real HTTPS canary, call `bittensor_get_subnet_adapter_canary_review` and collect evidence for every blocker item: provider identity, metadata conformance, fixture review, preview hash, bounded result handling, redaction, rollback, and monitoring.
14. For review handoff, call `bittensor_get_subnet_adapter_evidence_bundle`; treat it as evidence only, not authorization for real subnet execution.
15. If an operator has reviewed the preview hash and evidence, prefer `bittensor_build_subnet_adapter_canary_packet`; use its approval env value only when packet status is `approval_template_ready`.
16. For handoff to another agent, call `bittensor_export_subnet_adapter_canary_packet`; it returns redacted markdown and omits full approval env values.
17. For lower-level approval generation, call `bittensor_create_subnet_adapter_approval_template`; use the returned env value only for a short-lived reviewed canary window.
18. If you need lower-level detail, call `bittensor_get_subnet_adapter_candidates` to inspect the no-execution candidate profile and canary contract.
19. Before writing adapter code, call `bittensor_get_subnet_adapter_spec` to inspect metadata fields, forbidden fields, response limits, and preview-confirm-invoke rules.
20. To start from a known-safe shape, call `bittensor_get_subnet_adapter_manifest_examples` and copy one example as a draft only.
21. Validate the proposed metadata with `bittensor_validate_subnet_adapter_manifest`; treat `status=fail` as a hard stop before endpoint setup.
22. Validate sample adapter results with `bittensor_validate_subnet_adapter_result` before using them in canary evidence or chat rendering.
23. Build a combined packet with `bittensor_build_subnet_adapter_preflight_packet`; use it to decide whether metadata is ready for conformance and whether sample output is ready for canary evidence.
24. For handoff, call `bittensor_export_subnet_adapter_preflight_packet`; the markdown omits raw manifest/result payloads.
25. Then call `bittensor_get_subnet_adapter_templates` for sanitized placeholders only; set credential values outside Matterhorn.
26. Before any real adapter invocation, call `bittensor_probe_subnet_adapter_conformance`; proceed only if metadata, safe-mode, request-hash, privacy, schema, and response-bound checks pass.
27. For handoff, call `bittensor_export_subnet_adapter_conformance`; the markdown omits raw metadata payloads, endpoint URLs, credentials, and private wallet data.
28. For one compact handoff, call `bittensor_build_subnet_adapter_operator_handoff`; it summarizes evidence review, conformance, and mock dry-run state without authorizing execution.
29. For mock adapter rehearsal, call `bittensor_dry_run_subnet_adapters`; it should pass preview support, missing-hash rejection, mismatched-hash rejection, confirmed invocation, and redaction checks.
30. For handoff, call `bittensor_export_subnet_adapter_dry_run`; the markdown omits raw task text, full hashes, credentials, and private wallet data.
31. For subnet service use, call `matterhorn_bittensor_get_subnet_capability` first to inspect adapter support, auth, cost, schemas, benefits, and safety notes.
32. Then call `matterhorn_bittensor_preview_subnet_invocation`, ask the user to confirm the request SHA-256, and call `matterhorn_bittensor_invoke_subnet` with `previewRequestSha256` only if a configured adapter exists.
33. For ongoing monitoring, create watches with chat or the lower-level watch APIs.
34. Call `matterhorn_bittensor_watch_digest` to get a compact alert queue, then use each alert's prompt/action label as the next safe chat step.
35. Treat every action output as unsigned preview or external-signing handoff unless Matterhorn explicitly reports a safe signed-submission path.
36. Never request seed phrases, mnemonics, private keys, keyfiles, wallet exports, or host tokens.
```

## 15. What Good Looks Like

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
