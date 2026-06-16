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

## Security posture

This stream was adversarially audited. Threat model and mitigations:

| Surface | Risk | Mitigation |
|---------|------|------------|
| Secret sanitizer | Deeply-nested payload → stack overflow (DoS) | Iterative, bounded traversal (`MAX_SCAN_NODES`, `MAX_SCAN_DEPTH`); fails **closed** (rejects) rather than crashing |
| Secret sanitizer | Multi-MB string → ReDoS | Mnemonic detection is a linear token scan, not a backtracking regex; hex/PEM checks are linear |
| Secret sanitizer | Cyclic object → infinite loop | Bounded by the node budget |
| Market mapping | Hostile outcome label `__proto__` used as a key | `__proto__` / `constructor` / `prototype` labels are skipped; no prototype pollution |
| Provider reads | SSRF / path traversal via `marketId` | Path segments are `encodeURIComponent`-escaped; host comes only from fixed config base URLs, never from user input |
| Order preview | Hostile orderbook (negative / NaN / huge levels) | Non-finite values filtered on parse; division guarded; preview stays `canSubmit: false` |
| Order submission | A live trade path slipping in | No HTTP `POST`, no signing, no order-submission path in the tool or harness; statically asserted by `polymarket-live-qa.test.mjs` |

**No smart contracts, wallet custody, signing, or private-key handling exist in
this stream**, so reentrancy / contract / custody attack classes do not apply to
this code. The only key material the stream ever touches is material it
**rejects**.

### Accepted limitations (by design)

- Free-text in `message` that is not a recognized secret pattern is echoed back
  in `responseText` / `data` (reflection, not storage). Callers should not paste
  secrets into chat; recognized secrets are still rejected.
- Detection is heuristic: phrases shorter than 12 words, homoglyph/Unicode key
  names, and secrets carried on `Symbol` keys are not flagged. JSON payloads
  cannot carry `Symbol` keys, so the HTTP path is unaffected.
- `responseText` and card payloads contain untrusted third-party strings (Gamma
  market questions/descriptions). **The eventual renderer must escape them** —
  this server module returns data only and renders no HTML.

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
