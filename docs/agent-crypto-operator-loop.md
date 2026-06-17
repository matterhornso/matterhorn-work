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
- `sharedCards`: cross-venue categories such as `clarification`, `discovery`, `account_snapshot`, `market_context`, `orderbook_context`, `action_preview`, `compliance_block`, `external_signer_handoff`, `receipt_status`, `watch_alert`, and `generic`.
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

Before a test customer session, use the public CLI path first. This is the
copy-paste loop for Codex, Claude Code, Hermes, Cursor, or a human operator:

```bash
matterhorn-work crypto customer-smoke --offline --strict \
  --json-output /tmp/matterhorn-crypto-smoke.json

matterhorn-work crypto sdk-loop \
  --fixture \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --output-dir /tmp/matterhorn-market-sdk-loop \
  --json

matterhorn-work crypto sdk-manifest-check \
  --manifest /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-run-manifest.json \
  --output /tmp/matterhorn-market-sdk-manifest-check.json \
  --strict --json

matterhorn-work crypto evidence-bundle \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --official-sdk-validation /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-evidence.json \
  --operator-summary /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-operator-summary.md \
  --sdk-manifest-check /tmp/matterhorn-market-sdk-manifest-check.json \
  --require-sdk-manifest-check \
  --output /tmp/matterhorn-crypto-customer-evidence.md \
  --json-output /tmp/matterhorn-crypto-customer-evidence.json \
  --title "Matterhorn Work Crypto Customer Evidence" \
  --strict

matterhorn-work crypto evidence-verify \
  --bundle-json /tmp/matterhorn-crypto-customer-evidence.json \
  --bundle-md /tmp/matterhorn-crypto-customer-evidence.md \
  --require-sdk-manifest-check \
  --output /tmp/matterhorn-crypto-customer-evidence-verify.json \
  --strict --json

matterhorn-work crypto customer-packet \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --market-evidence-verify /tmp/matterhorn-crypto-customer-evidence-verify.json \
  --require-market-evidence \
  --output /tmp/matterhorn-crypto-customer-packet.md \
  --json-output /tmp/matterhorn-crypto-customer-packet.json \
  --strict
```

The CLI path stays offline, public, and non-custodial. It must not receive
private keys, API secrets, raw signatures, signed payloads, seed phrases,
mnemonics, keyfiles, or wallet exports. For repository gates, run:

MCP-capable agents can also validate already-loaded public evidence without
shelling out or giving the MCP server filesystem access:

- `matterhorn_market_customer_evidence_verify` accepts the public JSON object
  from `matterhorn-work crypto evidence-bundle` plus optional Markdown text.
- `matterhorn_bittensor_customer_evidence_verify` accepts the public Bittensor
  evidence bundle JSON object plus optional Markdown text.
- `matterhorn_crypto_customer_packet` builds the top-level customer packet from
  already-loaded customer smoke, market verification, and optional Bittensor
  verification objects.

These MCP tools are offline-only. They reject credential-shaped fields such as
seed phrases, private keys, API secrets, raw signatures, signed payloads, and
wallet exports.

When a Hyperliquid or Polymarket demo includes an external-signer public
receipt, validate it with `matterhorn-work crypto receipt-check` and add the
result to the bundle:

```bash
matterhorn-work crypto receipt-check \
  --venue hyperliquid \
  --handoff-file /tmp/hyperliquid-handoff.json \
  --receipt-file /tmp/hyperliquid-public-receipt.json \
  --output /tmp/matterhorn-market-receipt-check.json

matterhorn-work crypto evidence-bundle \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --official-sdk-validation /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-evidence.json \
  --operator-summary /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-operator-summary.md \
  --sdk-manifest-check /tmp/matterhorn-market-sdk-manifest-check.json \
  --require-sdk-manifest-check \
  --receipt-check /tmp/matterhorn-market-receipt-check.json \
  --require-receipt-check \
  --output /tmp/matterhorn-crypto-customer-evidence.md \
  --json-output /tmp/matterhorn-crypto-customer-evidence.json \
  --strict

matterhorn-work crypto evidence-verify \
  --bundle-json /tmp/matterhorn-crypto-customer-evidence.json \
  --bundle-md /tmp/matterhorn-crypto-customer-evidence.md \
  --require-sdk-manifest-check \
  --require-receipt-check \
  --output /tmp/matterhorn-crypto-customer-evidence-verify.json \
  --strict --json

matterhorn-work crypto customer-packet \
  --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \
  --market-evidence-verify /tmp/matterhorn-crypto-customer-evidence-verify.json \
  --require-market-evidence \
  --output /tmp/matterhorn-crypto-customer-packet.md \
  --json-output /tmp/matterhorn-crypto-customer-packet.json \
  --strict
```

Use the receipt-check requirement only for demos that actually include public
receipt evidence. The evidence file must be public/redacted only and must match
the original handoff hashes and venue fields. The final `evidence-verify`
command re-checks the completed customer bundle without calling the server.
Use `customer-packet` as the final cross-venue handoff artifact once the smoke
report and market evidence verifier are ready; attach Bittensor evidence with
`--bittensor-evidence-bundle` pointing at the Bittensor verifier JSON when that
evidence is part of the customer QA.
When Bittensor evidence is attached, verify it first:

```bash
matterhorn-work crypto bittensor-evidence-verify \
  --bundle-json /tmp/matterhorn-bittensor-customer-evidence.json \
  --bundle-md /tmp/matterhorn-bittensor-customer-evidence.md \
  --output /tmp/matterhorn-bittensor-customer-evidence-verify.json \
  --strict --json
```

The SDK loop also writes
`/tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-run-manifest.json`, which
is the machine-readable index of public artifacts, hashes, venue validation
status, and safety flags for the run.

Validate that manifest before handing the packet to another agent:

```bash
matterhorn-work crypto sdk-manifest-check \
  --manifest /tmp/matterhorn-market-sdk-loop/matterhorn-market-sdk-run-manifest.json \
  --output /tmp/matterhorn-market-sdk-manifest-check.json \
  --strict --json
```

For repository gates, run:

```bash
pnpm smoke:customer-ready-crypto
pnpm test:unified-crypto-chat
pnpm test:unified-crypto-shared-card-contract
pnpm test:crypto-cli-fallback
pnpm test:market-execution-safety-gate
pnpm test:market-official-sdk-validation-track
pnpm test:market-official-sdk-validation-capture
pnpm test:market-sdk-run-manifest-check
pnpm test:market-customer-evidence-bundle
pnpm test:market-customer-evidence-verify
pnpm test:crypto-customer-packet
pnpm test:bittensor-customer-evidence-verify
pnpm test:bittensor-customer-readiness-gate
```

The official SDK validation-track and capture gates are not live SDK
submissions. They prove the repository still treats Hyperliquid and Polymarket
signing payloads as validation-gated templates, and they let operators attach
redacted official-client/testnet output to a customer evidence bundle without
importing secrets into Matterhorn.
