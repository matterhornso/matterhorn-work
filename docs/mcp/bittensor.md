# Bittensor MCP

Use the Bittensor MCP when an agent needs Bittensor-specific public wallet, subnet, validator, watch, receipt, or unsigned action-preview context.

## What It Does

- Reads public SS58, coldkey, hotkey, TAO, subnet, validator, watch, and receipt context.
- Prepares unsigned staking, transfer, subnet invocation, and external-signing handoff previews.
- Creates customer evidence bundles and readiness checks before any external signing step.
- Keeps Bittensor concepts separate from EVM wallet flows.

## Tools

- `matterhorn_bittensor_chat`
- `matterhorn_bittensor_readiness`
- `matterhorn_bittensor_customer_evidence_bundle`
- `matterhorn_bittensor_list_capabilities`
- `matterhorn_bittensor_get_subnet_capability`
- `matterhorn_bittensor_adapter_canary_gate`
- `matterhorn_bittensor_prepare_extrinsic`
- `matterhorn_bittensor_create_signing_handoff`
- `matterhorn_bittensor_import_receipt`
- `matterhorn_bittensor_check_receipt`
- `matterhorn_bittensor_check_signing_handoff`
- `matterhorn_bittensor_submit_signed_extrinsic`
- `matterhorn_bittensor_preview_subnet_invocation`
- `matterhorn_bittensor_invoke_subnet`
- `matterhorn_bittensor_create_watch`
- `matterhorn_bittensor_list_watches`
- `matterhorn_bittensor_check_watches`
- `matterhorn_bittensor_watch_digest`
- `matterhorn_bittensor_act_on_watch_alert`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_bittensor_chat` or `matterhorn_bittensor_readiness` appears in the tool list.

## Safety Boundary

- Public reads and unsigned previews only by default.
- External signer required for real wallet actions.
- Never paste seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.
- Any live sidecar submission must be explicit and separate from the default MCP preview flow.

## Example Prompts

- Show my TAO balance and active stakes for this public SS58 address.
- Compare validators for subnet 1 and prepare an unsigned delegation preview.
- Create a watch for validator stake changes and summarize today's alerts.
