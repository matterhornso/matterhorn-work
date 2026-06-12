# Matterhorn Work Bittensor Operator Playbook

This playbook is the Bittensor-specific workflow for Codex, Claude Code, Claude Desktop, Cursor, or any MCP-capable agent operating Matterhorn Work.

Use the general [Agent Operator Workflow](./agent-operator-workflow.md) first to start Matterhorn Work, run the doctor, configure MCP, and confirm the server is healthy. Then use this playbook for Bittensor tasks.

For a repeatable pass/fail probe of this playbook, run [Matterhorn Work Bittensor Live QA](./bittensor-live-qa.md).

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

## 7. Prepare Staking 1 TAO Safely

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

## 8. Follow-Up Context

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

## 9. Unsupported Subnet Service Calls

When the user asks to “use subnet X for this task,” Matterhorn should try the supported subnet adapter path only when a service adapter is configured.

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

1. Preview the subnet invocation and inspect adapter support, auth, cost, safety notes, warnings, and the request SHA-256.
2. Ask the user to confirm the exact preview, including the request SHA-256.
3. Invoke only when the adapter is configured and pass the preview request SHA-256 back as `previewRequestSha256`.

This keeps direct adapter execution explicit while letting Matterhorn explain unsupported subnets without pretending a service call happened.

## 10. MCP Sequence For Bittensor Operators

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
9. For direct subnet service use, call `bittensor_preview_subnet_invocation` first, ask the user to confirm the request SHA-256, then call `bittensor_invoke_subnet` with `previewRequestSha256` only if a configured adapter exists.
10. Treat every action output as unsigned preview or external-signing handoff unless Matterhorn explicitly reports a safe signed-submission path.
11. Never request seed phrases, mnemonics, private keys, keyfiles, wallet exports, or host tokens.
```

## 11. What Good Looks Like

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
