# Polymarket Operator Playbook

Read + preview-only operator guide for the Matterhorn Work Polymarket stream
(Phase 4 of `docs/parallel-agent-market-roadmap.md`). This stream is research,
compliance, orderbook, and preview-only. **No live trading, signing, or key
custody is implemented.**

## What this stream does

- Discovers Polymarket markets/events via the Gamma API.
- Reads market detail and CLOB orderbooks, shaping public price / spread /
  midpoint.
- Checks the Polymarket geoblock before any order preview.
- Plans and executes chat turns: discover, explain, orderbook, order preview.
- Produces **preview-only** order objects that can never be submitted.

## What this stream never does

- No live order placement or cancellation.
- No order signing or EIP-712 payload construction.
- No API key, API secret, or passphrase storage.
- No private key / seed phrase / mnemonic import.
- No wallet custody.

Every order preview carries `canSubmit: false`. There is no code path that flips
it true, and there is no HTTP `POST` to an order endpoint in
`apps/server/src/tools/polymarket.ts` or `scripts/polymarket-live-qa.mjs`.
`scripts/polymarket-live-qa.test.mjs` asserts both files statically.

## Components

| Component | Path | Role |
|-----------|------|------|
| Provider + planner + previews | `apps/server/src/tools/polymarket.ts` | Read-only provider, chat planner/executor, preview builders, secret sanitizer |
| Unit tests | `apps/server/src/tools/polymarket.test.ts` | Mocked Gamma/CLOB/geoblock coverage |
| Live QA harness | `scripts/polymarket-live-qa.mjs` | Read + preview QA against public Polymarket endpoints |
| Live QA test | `scripts/polymarket-live-qa.test.mjs` | Deterministic offline run + no-submit static proof |

The stream is self-contained and Polymarket-specific. It mirrors the shared
market safety vocabulary from `packages/types/src/markets.ts` (venue id, signer
policies, execution states, preview version, forbidden-credential pattern)
without editing the shared contract. `scripts/polymarket-live-qa.test.mjs`
asserts the local mirror stays aligned with the canonical pattern.

## Chat flows

| Ask | Intent | Execution |
|-----|--------|-----------|
| "find markets about AI" | `discover` | `read_only` |
| "explain this market" | `learn` | `read_only` |
| "show the orderbook" | `orderbook` | `read_only` |
| "prepare a $10 Yes order" | `order_preview` | `unsigned_preview` or `blocked_by_compliance` |
| "am I geoblocked?" | `compliance` | `read_only` / `blocked_by_compliance` |

Research, explain, and orderbook flows work regardless of compliance. Only
`order_preview` runs a geoblock check, and it runs it **before** producing any
executable parameters.

## Compliance gate

`PolymarketProvider.checkGeoblock()` calls the Polymarket geoblock endpoint
(default `https://polymarket.com/api/geoblock`) and maps the result:

- `blocked: true` -> `status: "blocked"`.
- `blocked: false` -> `status: "allowed"`.
- endpoint error -> `status: "unknown"` (research still works; previews degrade
  to a clear warning rather than a silent allow).

When `status` is `blocked`, the executor returns `blocked_by_compliance` and a
**non-executable** preview: `price`, `size`, and `estimatedShares` are all
`null`, `signerPolicy` is `blocked_by_compliance`, and `canSubmit` is `false`.

## Order preview semantics

For an allowed region, `buildOrderPreview` walks the ask side of the chosen
outcome's CLOB book (`estimateBuyFill`) to estimate an average fill probability
and share count for the requested USDC notional. The preview reports:

- `signerPolicy: "api_wallet_required"` — actually executing would require an
  API wallet Matterhorn does not provide.
- `execution: "unsigned_preview"`, `canSubmit: false`.
- A deterministic `previewSha256` over the canonical preview fields.
- A risk disclaimer: prediction-market shares are risk-bearing information
  instruments, never betting or investment advice.

## Secret handling

`assertNoForbiddenSecrets` deep-scans every inbound payload before any provider
call or preview. It rejects:

- Keys matching the shared forbidden-credential pattern (seed, mnemonic,
  private, secret, passphrase, apiKey, apiSecret, rawSignature, signedPayload,
  wallet export, etc.).
- Values that look like a hex private key, a raw ECDSA signature, a PEM/PGP
  private key block, or a BIP39 mnemonic.

`PolymarketSecretRejectedError` names only the field and category. It never
echoes the offending value — not in errors, logs, reports, or test snapshots.

## Verification

```bash
# Unit tests (mocked Gamma/CLOB/geoblock)
cd apps/server && bun test src/tools/polymarket.test.ts

# Deterministic live-QA harness test (offline) + no-submit static proof
node scripts/polymarket-live-qa.test.mjs

# Shared market safety contract (unchanged by this stream)
node scripts/market-safety-contract.test.mjs

# Type check (pre-existing bittensor errors are unrelated to this stream)
pnpm --filter matterhorn-work-server typecheck
```

Optional live read-only run against public Polymarket endpoints:

```bash
node scripts/polymarket-live-qa.mjs --json
```

## Out of scope (owned by Codex)

- Shared market chat routing / cards (Phase 5).
- MCP and CLI wiring for Polymarket (Phase 5).
- The shared market safety contract in `packages/types/src/markets.ts`.
- Hyperliquid and Bittensor streams.
