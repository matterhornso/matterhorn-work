# Market Live Read-Only Smoke

A focused smoke harness that exercises a **live local Matterhorn Work server** across the Hyperliquid and Polymarket **read / preview / external-signer-handoff** routes only.

It is strictly non-custodial and **never submits an order, never signs, never moves funds, and never accepts or echoes signing material**. Every preview and handoff must report `canSubmit: false`. There is no submit/sign/exchange route in scope.

## What it checks

**Hyperliquid**
- `GET /api/hyperliquid/markets?limit=3` — read-only market list.
- `POST /api/hyperliquid/chat/execute` — a read-only request.
- `POST /api/hyperliquid/orders/preview` — toy params; asserts `canSubmit: false`.
- `POST /api/hyperliquid/orders/handoff` — toy params; asserts `externalSignerOnly: true` and `canSubmit: false`.

**Polymarket**
- `GET /api/polymarket/markets?q=ai&limit=3` — read-only discovery.
- `GET /api/polymarket/compliance` — geoblock/compliance status.
- `POST /api/polymarket/chat/execute` — a discovery / read-only request.
- `POST /api/polymarket/orders/handoff` — tiny toy amount, only if a market id is available from discovery (otherwise the stage is **skipped**, not failed). A compliance-blocked region returns a blocked, **non-executable** preview (no price/size/shares) and is treated as a pass.

Every response is scanned: a secret-shaped field or any `canSubmit: true` fails the run.

## Usage

Against a running local server (use a test client token only):

```bash
node scripts/market-live-readonly-smoke.mjs \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --token "$MATTERHORN_WORK_TOKEN" \
  --strict --json
```

Offline self-test (mocked server, no network, deterministic):

```bash
node scripts/market-live-readonly-smoke.mjs --self-test --strict --json
```

Flags: `--server-url`, `--token`, `--strict` (exit 1 on any failure), `--json`, `--self-test`, `--asset` (default BTC), `--query` (default ai), `--timeout-ms`.

## Offline regression test

`scripts/market-live-readonly-smoke.test.mjs` runs the harness against an in-process mock server (allowed, geoblocked, and no-market variants), checks that secret-shaped input is rejected, and statically validates the script/docs/package wiring. It requires no real funds, wallets, or order submission.

```bash
pnpm test:market-live-readonly-smoke
```

## Safety rules

- Read / preview / external-signer-handoff only — no submit, no signing, no funds.
- No secret fields are sent; the harness fails if any response contains secret-shaped data or `canSubmit: true`.
- Polymarket compliance-blocked previews must not carry executable price/size/share fields.
