# Polymarket Read/Preview Foundation

This is Matterhorn Desks's first Polymarket slice. It is intentionally read-only plus preview-only and follows the Hyperliquid read/preview pattern (provider interface, deterministic planner, chat workflow, non-submittable previews, credential rejection).

Prediction-market prices are treated as risk-bearing information, never as betting or investment advice.

## Supported

- Search Polymarket markets via the Gamma API (keyword discovery).
- Search Polymarket events (grouped related markets) via the Gamma API.
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
| "find events about AI" | `events` | `read_only` |
| "explain this market" | `market` | `read_only` |
| "what are the odds and liquidity?" | `odds` | `read_only` |
| "show the orderbook" | `orderbook` | `read_only` |
| "am I geoblocked?" | `compliance` | `read_only` / `blocked_by_compliance` |
| "watch this market" | `monitor` | `read_only` |
| "prepare a $10 Yes order" | `order_preview` | `unsigned_preview` / `blocked_by_compliance` |

## Watchlist / Monitor (read-only)

The `monitor` intent builds a read-only `PolymarketWatchDescriptor` for a market: a current-odds snapshot, suggested ±10pp alert thresholds per outcome, and a resolution reminder. The watch check reads market status, odds/liquidity, and compliance state, then returns a `watch_alert` card. It is research-only and **works even when order previews are geoblocked**. Matterhorn never auto-executes any order from a watch.

HTTP/MCP/CLI expose the same safe loop:

- `POST /api/polymarket/watches`
- `GET /api/polymarket/watches`
- `POST /api/polymarket/watches/check`
- `GET /api/polymarket/watches/digest`
- `POST /api/polymarket/watches/act`
- `matterhorn_polymarket_create_watch`
- `matterhorn_polymarket_check_watches`
- `matterhorn_polymarket_watch_digest`
- `matterhorn_polymarket_act_on_watch_alert`
- `matterhorn-work polymarket watch create|list|check|digest|act`

```bash
matterhorn-work polymarket watch create \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --market-id 0xmarket-id \
  --json
```

```bash
matterhorn-work polymarket watch check \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --json
```

```bash
matterhorn-work polymarket watch act \
  --openwork-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --watch-file ./public-polymarket-watch.json \
  --alert-index 0 \
  --json
```

`watch act` only converts a triggered/degraded watch into a deterministic read-only crypto-chat review. It does not sign, submit, broadcast, auto-execute, or accept API secrets, private keys, raw signatures, or signed payloads.

## Agent And External-Handoff Execution (non-custodial)

Agent, MCP, CLI, watch, and server routes never submit. Their flow mirrors the shared `external_signer_required` / `MarketReceipt` contract:

1. **Preview** → an `unsigned_preview` (`canSubmit: false`).
2. **Signing handoff** — `buildPolymarketSigningHandoff(preview)` produces a `PolymarketSigningHandoff`: the public order terms, the EIP-712 signing scheme (Polymarket CLOB on Polygon, chain 137), a `previewSha256` binding, a `handoffSha256`, and an expiry. `externalSignerOnly: true`, `canSubmit: false`. It refuses a compliance-blocked preview and never fabricates a signature.
3. **The user signs and submits with their own wallet**, either in an eligible browser-wallet ticket described below or outside Matterhorn. The tool layer produces economic terms only — never the signature, API key, or submission.
4. **Receipt verification** — `verifyPolymarketReceipt(handoff, receipt)` validates a returned **public** receipt (order id / tx hash / status) against the handoff hashes, market, outcome, and side, and emits a `MarketReceipt`-shaped result. It **rejects any signing material** in the receipt (raw signatures / signed payloads are never accepted).

Matterhorn stays non-custodial end to end: no key import, no server-side API-secret storage, no server signing, and no acceptance of signing material on the way back in. `liveSubmissionEnabled` for the agent/tool artifact remains `false`.

### Separate browser-wallet BUY ticket

The web app also has a separate, explicitly reviewed ticket for eligible EOA BUY orders. It is not an agent, MCP, CLI, watch, or server submit capability.

- A fresh server preview must identify the exact market, outcome, CLOB token, USDC spend, maximum loss, public hash, compliance result, and expiry.
- Compliance must be `allowed`; blocked or unknown results fail closed.
- The user connects an EOA wallet on Polygon and types `SUBMIT POLYMARKET ORDER`.
- The official `@polymarket/clob-client` creates temporary browser-local credentials and submits a BUY FAK market order.
- Temporary credentials are cleared immediately after the attempt. Only a public receipt is sent back to Matterhorn's server.
- Sell orders, proxy accounts, agents, watches, automatic submission, and unattended retries are not supported.

### EIP-712 order typed-data (opt-in, validation-gated)

When `POLYMARKET_EXCHANGE_ADDRESS` is configured (a validated CTF Exchange address), the handoff also carries `signingPayload` — an EIP-712 **order typed-data template** (`buildPolymarketOrderTypedData`) for the standard Polymarket CTF Exchange `Order` struct, computed with viem-compatible types.

This is a **template, not a final signing digest**. Matterhorn fills only the economic terms it can know (`tokenId`, `makerAmount`, `takerAmount`, `side`); the user's wallet/client fills the `walletMustSet` fields (`maker`, `signer`, `salt`, `nonce`, `expiration`) and produces the signature. No digest is emitted because Matterhorn deliberately does not know those wallet-supplied values, and it never holds a key.

`requiresClientValidation` is always `true`. **Validate the domain, `verifyingContract`, types, and amount rounding against Polymarket's official CLOB client (`@polymarket/clob-client`) and on testnet before signing with real funds.** When the exchange address is not configured, no typed-data is attached and the handoff stays purely descriptive.

Config: `POLYMARKET_EXCHANGE_ADDRESS` (required to emit typed-data), `POLYMARKET_CHAIN_ID` (default 137), `POLYMARKET_EXCHANGE_DOMAIN_NAME`, `POLYMARKET_EXCHANGE_DOMAIN_VERSION`.

## Security Posture

The tool layer was adversarially audited (12-probe sweep, codified as regression tests). It is read-only + preview-only, so there are no smart contracts, custody, signing, or key handling in that layer — the only key material it touches is material it **rejects**. The separate browser ticket has its own wallet, chain, compliance, expiry, exact-review, and credential-cleanup tests.

| Surface | Risk | Mitigation |
| --- | --- | --- |
| Credential scan | Deeply-nested payload → stack overflow | Iterative + bounded (`MAX_NODES`/`MAX_DEPTH`), fails closed |
| Credential scan | Multi-MB string → ReDoS | Bounded traversal; ~1MB scans in <1ms |
| Provider reads | SSRF / path traversal via market/token id | `encodeURIComponent` on ids; host only from fixed config base URLs |
| Market mapping & watch | Hostile `__proto__` outcome label | `__proto__`/`constructor`/`prototype` labels skipped — no prototype pollution |
| Preview math | Hostile orderbook / dates (negative, NaN, unparseable) | Non-finite filtered on parse; `Date.parse` guarded; division guarded |
| Agent/tool submission | A live-trade path slipping into automation | No server submit route; every tool preview keeps `canSubmit: false`; statically asserted by the readiness gate |
| Browser-wallet ticket | Changed or unattended live order | Separate UI only; exact unexpired review, allowed compliance, Polygon EOA wallet, typed confirmation, BUY-only FAK order, and immediate credential cleanup |

Forbidden values are never echoed in errors, logs, reports, or test snapshots. Known heuristic limits: phrases under 12 words, Unicode-homoglyph keys, and `Symbol`-keyed secrets are not flagged (JSON/HTTP payloads cannot carry `Symbol` keys). `responseText`/cards carry untrusted third-party strings (Gamma questions) — the renderer must escape them; this module returns data only.

## Verification

```bash
bun test apps/server/src/tools/polymarket.test.ts
pnpm --filter matterhorn-work-server typecheck
pnpm test:polymarket-readiness-gate
pnpm test:polymarket-read-preview-qa
node scripts/polymarket-read-preview-qa.mjs --self-test --strict --json
```

The QA harness self-test runs offline with mocked Gamma/CLOB/geoblock endpoints; without `--self-test` it makes read-only requests to the public Polymarket endpoints. It checks discovery, market detail, orderbook, geoblock, a preview-only order (`canSubmit: false`; blocked compliance yields no executable price/size), and credential-shaped payload rejection. The readiness gate statically asserts the tool keeps `canSubmit: false`, exposes no server submit/sign route, rejects the full forbidden-credential vocabulary, and confines browser submission to the reviewed ticket.

## Scope Notes

This stream is the read/preview/watch tool layer plus QA harness and readiness gate. Server routes (`/api/polymarket/...`), MCP tools, and CLI commands are available for read-only market data, preview-only orders, external-signer handoffs, public receipts, and watch checks.

References:

- Polymarket Gamma API: https://docs.polymarket.com/
- Polymarket CLOB API: https://docs.polymarket.com/
