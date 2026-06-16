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
- `estimatedShares` and a `marketability` estimate from the CLOB asks (`referencePrice`, `estimatedFillPrice`, `estimatedSlippagePct`, `depthSufficient`). A warning is added when depth is insufficient or estimated slippage exceeds a supplied tolerance.
- `risk` — prediction-market payoff framing: `costUsdc`, `payoutIfWinUsdc` (each share pays $1 if the outcome resolves true), `maxProfitUsdc`, `maxLossUsdc` (the full stake), and `breakevenProbability`.
- `resolution` — `endDate` and `resolvesInDays`, with a warning when the market resolves within a day or the end date has already passed.
- `priceContext` — headline (Gamma) `impliedProbability` vs `estimatedFillProbability` and `bookMidpoint`, with a `gapVsImpliedPct` and a warning when the live book diverges from the headline odds.
- `liquidity` — market `liquidityUsd` and `volumeUsd`, with a thin-liquidity warning.
- `signerPolicy: "api_wallet_required"` — actually executing would require an API wallet Matterhorn does not provide.
- `compliance` status, `source`/freshness, `warnings`, a `consequence` statement (including the cost/payout/loss framing), and explicit "external signing/execution not enabled" language.

When compliance is blocked, `risk`, `resolution`, `priceContext`, `liquidity`, `price`, `size`, and `estimatedShares` are all `null` — no executable parameters are generated.

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
pnpm test:polymarket-readiness-gate
pnpm test:polymarket-read-preview-qa
node scripts/polymarket-read-preview-qa.mjs --self-test --strict --json
```

The QA harness self-test runs offline with mocked Gamma/CLOB/geoblock endpoints; without `--self-test` it makes read-only requests to the public Polymarket endpoints. It checks discovery, market detail, orderbook, geoblock, a preview-only order (`canSubmit: false`; blocked compliance yields no executable price/size), and credential-shaped payload rejection. The readiness gate statically asserts the tool keeps `canSubmit: false`, exposes no submit/sign/exchange route, and rejects the full forbidden-credential vocabulary.

## Scope Notes

This stream is the read/preview tool layer plus QA harness and readiness gate. Server routes (`/api/polymarket/...`), MCP tools, and CLI commands follow the Hyperliquid sequence and can be added in subsequent PRs (a natural Codex pickup point).

References:

- Polymarket Gamma API: https://docs.polymarket.com/
- Polymarket CLOB API: https://docs.polymarket.com/
