# Polymarket Read/Preview Foundation

This is Matterhorn Work's first Polymarket slice. It is intentionally read-only plus preview-only and follows the Hyperliquid read/preview pattern (provider interface, deterministic planner, chat workflow, non-submittable previews, credential rejection).

Prediction-market prices are treated as risk-bearing information, never as betting or investment advice.

## Supported

- Search Polymarket markets via the Gamma API (keyword discovery).
- Read full market detail (outcomes, implied probabilities, liquidity, volume).
- Summarize odds/liquidity for a market.
- Read a CLOB orderbook for an outcome and shape best bid/ask, midpoint, and spread.
- Check the Polymarket geoblock/compliance status.
- Prepare a non-submittable bet preview with marketability/slippage estimate, consequence text, source labels, warnings, and `canSubmit: false`.

## Not Supported

- API wallet creation or storage.
- Private keys, API secrets, signatures, signed actions, or signed payloads.
- Order submission, signing, or any CLOB write path.
- Live betting, cancellation, or wallet custody.

## Compliance Gate

A geoblock check runs **before** any order preview:

- `blocked` → the workflow returns `blocked_by_compliance` and a non-executable preview (`price`, `size`, and `estimatedShares` are all `null`, `signerPolicy` is `blocked_by_compliance`).
- `allowed` → a normal `unsigned_preview` is built.
- `unknown` (geoblock endpoint error) → research and orderbook reads still work; the preview path surfaces the uncertainty in warnings.

Research, market detail, odds, and orderbook reads work regardless of compliance.

## Preview Fields

Each bet preview carries, alongside `canSubmit: false`:

- `size` (USDC notional) and `price` (expected average fill as a probability, 0..1).
- `estimatedShares` and a `marketability` estimate from the CLOB asks (`referencePrice`, `estimatedFillPrice`, `estimatedSlippagePct`, `depthSufficient`).
- `signerPolicy: "api_wallet_required"` — actually executing would require an API wallet Matterhorn does not provide.
- `compliance` status, `source`/freshness, `warnings`, a `consequence` statement, and explicit "external signing/execution not enabled" language.

## Safety Rules

- Reject credential-shaped fields (seed, mnemonic, private key, API secret, passphrase, wallet export, raw signature, signed payload) before planning or previewing. The scan is bounded and fails closed on hostile deep/oversized payloads.
- Untrusted provider outcome labels are never used to mutate object prototypes.
- Run the geoblock check before any executable preview.
- Ask one clarification when a market id, outcome, or amount is missing instead of guessing.
- Keep Polymarket work in Polymarket-specific files while parallel agents are active.

## Chat Intents

| Ask | Intent | Execution |
| --- | --- | --- |
| "find markets about AI" | `discover` | `read_only` |
| "explain this market" | `market` | `read_only` |
| "what are the odds and liquidity?" | `odds` | `read_only` |
| "show the orderbook" | `orderbook` | `read_only` |
| "am I geoblocked?" | `compliance` | `read_only` / `blocked_by_compliance` |
| "prepare a $10 Yes order" | `order_preview` | `unsigned_preview` / `blocked_by_compliance` |

## Verification

```bash
bun test apps/server/src/tools/polymarket.test.ts
pnpm --filter matterhorn-work-server typecheck
```

## Scope Notes

This PR is the read/preview tool foundation only. Server routes (`/api/polymarket/...`), MCP tools, CLI commands, the QA harness, and a readiness gate follow the Hyperliquid sequence and can be added in subsequent PRs.

References:

- Polymarket Gamma API: https://docs.polymarket.com/
- Polymarket CLOB API: https://docs.polymarket.com/
