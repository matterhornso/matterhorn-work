# Evidence MCP

Use the Evidence MCP when an agent needs customer-safe readiness reports, public QA, reconciliation, verification, and receipt evidence.

## What It Does

- Runs crypto, Bittensor, and market readiness checks.
- Builds customer-safe public QA and evidence packets.
- Validates market SDK behavior and external artifacts.
- Reconciles market artifacts and verifies customer evidence.

## Tools

- `matterhorn_crypto_chat`
- `matterhorn_crypto_readiness`
- `matterhorn_crypto_live_public_qa`
- `matterhorn_market_execution_readiness`
- `matterhorn_market_execution_chain`
- `matterhorn_market_sdk_validation`
- `matterhorn_market_customer_evidence_verify`
- `matterhorn_market_artifact_reconcile`
- `matterhorn_bittensor_customer_evidence_verify`
- `matterhorn_crypto_customer_packet`

## Setup

```bash
matterhorn-work mcp config --target codex --profile full
matterhorn-work mcp config --target claude --profile full
matterhorn-work mcp config --target claude-desktop --profile full
matterhorn-work mcp config --target cursor --profile full
```

After installing, restart the client and confirm `matterhorn_crypto_readiness` or `matterhorn_market_execution_readiness` appears.

## Safety Boundary

- Public or redacted evidence only.
- No keys, exchange secrets, raw signatures, signed payloads, wallet exports, or custody credentials.
- Market evidence does not submit trades or bets.
- Receipts are validation artifacts, not execution authority.

## Example Prompts

- Run market execution readiness and list blockers for the customer demo.
- Build a customer packet for this public Bittensor wallet context.
- Reconcile this market artifact and explain whether it is safe to show.
