# Matterhorn Platform Safety Gate

**Status:** Required pre-PR verification
**Source:** `scripts/matterhorn-platform-safety-gate.mjs`

Run the full gate before opening or updating a pull request that changes shared platform behavior:

```bash
pnpm test:matterhorn-platform-safety
```

Equivalent direct command:

```bash
node scripts/matterhorn-platform-safety-gate.mjs
```

## Stages

| ID | Stage | Protects |
| --- | --- | --- |
| `wallet.approval.behavior` | Wallet approval behavior | Reviewed values, chains, policy gates, connectors, address book, and safety logs. |
| `money.path.security` | Money-path backend security | Simulation sanitization, wallet policy routes, memory scopes, and backend secret handling. |
| `desk.depth` | Desk depth | Bittensor, Hyperliquid, Polymarket, Sui, Longevity, task launch, and evidence contracts. |
| `billing.integrity` | Billing integrity | Checkout, portal, webhook signatures, replay safety, subscription state, and live-mode blocking. |
| `local.router.perimeter` | Local router perimeter | Token checks, loopback CORS, health behavior, messaging, and workspace file boundaries. |
| `daemon.electron.perimeter` | Daemon and Electron perimeter | Trusted IPC, desktop fetch restrictions, daemon tokens, alpha packaging, and debug gates. |
| `observability.error_boundaries` | Observability and error boundaries | Route/panel isolation, redaction, stalled requests, and shared UI primitives. |
| `design.contract` | Matterhorn design contract | Tokens, desk-first UI, divider/radius rules, and source restrictions. |
| `browser.smoke.contracts` | Browser smoke contracts | Product, full-surface inventory, generated-media, and wallet browser-smoke harness wiring. |
| `product.readiness` | Product readiness | Production CORS, backend/data-policy contracts, and release smoke wiring. |

## Focused Runs

List stages:

```bash
node scripts/matterhorn-platform-safety-gate.mjs --list
```

Run selected stages:

```bash
node scripts/matterhorn-platform-safety-gate.mjs \
  --only wallet.approval.behavior,money.path.security,design.contract
```

Print the machine-readable plan without executing:

```bash
node scripts/matterhorn-platform-safety-gate.mjs --dry-run --json
```

## Expectations

- Run focused tests while implementing; do not use the full gate as the first feedback loop.
- Run both app and server typechecks for cross-layer changes.
- Run the complete authored-code suites for a release candidate:
  `bun test apps/app/tests` and `pnpm --filter matterhorn-work-server test`.
  The server command is intentionally scoped to `src/`; compiled `dist/` tests
  duplicate stale generated artifacts and are validated by the separate build.
- Run live browser verification for UI behavior; static smoke contracts do not replace screenshots and interaction checks.
- Do not stage or publish a shared dirty tree until the changed files have been inventoried and grouped.
- A previously passing gate is not evidence for a newly modified tree.

## Latest Local Verification

On 2026-07-12, the overnight whole-platform pass completed the 30-surface live
browser audit with zero issues, 507 app tests, 681 source server tests, app/server
production builds, Electron typechecking, and all 10 safety stages. The server
suite uses a 15-second integration timeout because isolated backend and watcher
startup can exceed Bun's 5-second default under full parallel load. This remains
historical evidence for that exact tree state; rerun the gate after further edits.
