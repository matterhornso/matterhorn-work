# Matterhorn Work Crypto Agent Operator Loop

Use this after the general [Agent Operator Workflow](./agent-operator-workflow.md) is healthy. It is the copy-paste path for Codex, Claude Code, Hermes, Cursor, Claude Desktop, or another MCP-capable agent to operate the crypto surfaces without scraping the UI.

This loop is non-custodial. Do not paste seed phrases, mnemonics, private keys, API secrets, wallet exports, raw signatures, signed payloads, or signed extrinsics into prompts, CLI flags, HTTP bodies, or MCP tool arguments.

## 1. Prove The Local Agent Surface

```bash
matterhorn-work doctor --strict --json

pnpm test:agent-control-doctor
pnpm test:agent-control-mcp
pnpm test:agent-operator-workflow
pnpm test:agent-control-coverage-matrix
```

For a live local server pass:

```bash
node scripts/agent-control-live-qa.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --host-token "$MATTERHORN_WORK_HOST_TOKEN" \
  --expect-event session.snapshot \
  --expect-event session.status \
  --json
```

## 2. Run Unified Crypto Chat Through HTTP

The unified router is useful when the user prompt should decide the venue:

```bash
curl -sS -X POST "$MATTERHORN_WORK_SERVER_URL/api/crypto/chat/execute" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"message":"show BTC Hyperliquid funding"}' \
  | jq .

curl -sS -X POST "$MATTERHORN_WORK_SERVER_URL/api/crypto/chat/execute" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"message":"find Polymarket markets about AI","limit":5}' \
  | jq .

curl -sS -X POST "$MATTERHORN_WORK_SERVER_URL/api/crypto/chat/execute" \
  -H "Authorization: Bearer $MATTERHORN_WORK_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"message":"show my TAO","ss58Address":"<public-ss58-coldkey>"}' \
  | jq .
```

Expected response shape:

- `venue`: `bittensor`, `hyperliquid`, `polymarket`, or `auto` when clarification is required.
- `cards`: the original venue-specific cards for existing renderers.
- `sharedCards`: cross-venue categories such as `discovery`, `account_snapshot`, `market_context`, `orderbook_context`, `action_preview`, `compliance_block`, `watch_alert`, and `receipt_status`.
- Every `sharedCards[]` item uses `version: "matterhorn.crypto.shared-card.v1"`, a `kind`, `venue`, `status`, `warnings`, original-card `data`, and `safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false }`.
- `warnings`: safety/source warnings.
- `execution`: `read_only`, `answered`, `clarification_required`, `unsigned_preview`, `blocked_by_compliance`, or `unsupported`.

## 3. Run Crypto Chat Through MCP

Use the unified MCP tool when the user prompt should choose the venue:

- `matterhorn_crypto_chat`

Suggested prompt:

```text
Use matterhorn_crypto_chat for this request: "show BTC Hyperliquid funding". Keep it read-only unless the server returns a preview-only card.
```

Expected result:

- Bittensor, Hyperliquid, or Polymarket routing happens server-side.
- Responses may include both venue `cards` and customer-readable `sharedCards`.
- Hyperliquid and Polymarket remain read/preview/external-signer only.

## 4. Run Venue Chat Through MCP

Use these MCP tools when the venue is known:

- `matterhorn_bittensor_chat`
- `matterhorn_hyperliquid_chat`
- `matterhorn_polymarket_chat`

Suggested prompts:

```text
Use matterhorn_bittensor_chat to show my TAO for public SS58 address <public-ss58-coldkey>. Do not ask for seeds or private keys.
```

```text
Use matterhorn_hyperliquid_chat to show BTC funding and explain the funding risk without preparing or submitting a trade.
```

```text
Use matterhorn_polymarket_chat to find Polymarket markets about AI and explain that this is risk-bearing information, not betting advice.
```

## 5. Run Venue Chat Through CLI

When the prompt should choose the venue, use the unified crypto CLI. It calls `POST /api/crypto/chat/execute` and stays read/preview only (aliases: `matterhorn-work market chat`, `matterhorn-work markets chat`):

```bash
matterhorn-work crypto chat \
  --message "show BTC Hyperliquid funding" \
  --venue auto \
  --asset BTC \
  --json

matterhorn-work market chat \
  --message "find Polymarket markets about AI" \
  --venue polymarket \
  --limit 5 \
  --json
```

The unified CLI accepts only public routing/context flags (`--venue`, `--ss58-address`, `--netuid`, `--validator-hotkey`, `--amount-tao`, `--address`, `--asset`, `--market-id`, `--outcome`, `--side`, `--size`, `--price`, `--amount-usdc`, `--limit`, `--slippage-tolerance`, `--rate-tolerance`). Credential-shaped flags such as `--api-secret` or `--private-key` are rejected before any server call.

When the venue is known up front, use the venue CLIs directly:

```bash
matterhorn-work bittensor chat \
  --message "Which subnet is useful for image generation?" \
  --limit 5 \
  --json

matterhorn-work hyperliquid chat \
  --message "show BTC funding" \
  --asset BTC \
  --json

matterhorn-work polymarket chat \
  --message "find markets about AI" \
  --limit 5 \
  --json
```

Preview-only flows must remain non-submittable:

```bash
matterhorn-work hyperliquid preview-order \
  --asset BTC \
  --side buy \
  --size 0.01 \
  --price 65000 \
  --json

matterhorn-work polymarket preview-order \
  --market-id "<market-id>" \
  --side yes \
  --amount-usdc 10 \
  --json
```

Verify that responses keep `canSubmit: false`. Matterhorn does not sign or submit.

## 6. Receipt Evidence

After a user submits externally with their own wallet/client, Matterhorn may verify public receipt evidence only.

```bash
matterhorn-work hyperliquid receipt \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --json

matterhorn-work polymarket receipt \
  --handoff-file ./handoff.json \
  --receipt-file ./receipt.json \
  --json
```

Bittensor receipt evidence uses the Bittensor receipt checker:

```bash
node scripts/bittensor-receipt-check.mjs \
  --receipt /tmp/bittensor-receipt.json \
  --json-output /tmp/bittensor-receipt-check.json
```

Receipts must not include raw signatures, signed payloads, seed phrases, private keys, mnemonics, API secrets, keyfiles, or wallet exports.

## 7. Customer-Ready Evidence Gates

Before a test customer session:

```bash
pnpm smoke:customer-ready-crypto
pnpm test:unified-crypto-chat
pnpm test:crypto-cli-fallback
pnpm test:market-execution-safety-gate
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-capture
pnpm test:market-customer-evidence-bundle
pnpm test:bittensor-customer-readiness-gate
```

The official SDK validation-track and capture gates are not live SDK
submissions. They prove the repository still treats Hyperliquid and Polymarket
signing payloads as validation-gated templates, and they let operators attach
redacted official-client/testnet output to a customer evidence bundle without
importing secrets into Matterhorn.
