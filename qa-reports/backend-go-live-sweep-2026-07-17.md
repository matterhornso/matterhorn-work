# Matterhorn Work Backend Go-Live Sweep

Date: 2026-07-17

Branch: `codex/product-hunt-hardening-2026-07-21`

Starting commit: `9e887998`

Scope: backend functionality, persistence, concurrency, authentication, authorization, edge cases, recovery, security, and local end-to-end readiness

## Executive Decision

The local release candidate is green for code-controlled backend behavior.

- Full server suite: **728 passed, 0 failed**
- Server assertions: **5,130**
- Server test files: **61**
- Server typecheck: **passed**
- Full app suite: **591 passed, 0 failed**
- Matterhorn platform safety gate: **all 10 stages passed**
- Dependency audit: **1,341 locked versions, no low-or-higher advisories**
- Recovery drill: **passed with 19 of 19 imported entries unchanged on re-preview**
- Live app and server health probes: **HTTP 200**

This is not evidence that external production accounts are configured. Real Stripe
charging, production provider credentials, mainnet wallet signing, and signed desktop
distribution remain operator-controlled launch gates and were intentionally not
performed by automated QA.

## Surface Inventory

Static route inventory found **333 backend routes**:

| Authentication mode | Route count | Intended use |
| --- | ---: | --- |
| Client bearer token | 303 | Workspace reads and scoped mutations |
| Host or owner token | 15 | Privileged local control operations |
| Host-token header only | 4 | Secret-bearing environment controls |
| None | 11 | Health, explicitly enabled local UI assets, development logging, and Stripe webhook ingress |

The unauthenticated routes were reviewed individually. They either expose bounded
health/static behavior, apply payload limits and redaction, or require independent
provider signature verification.

## Defects Fixed

### 1. Cross-platform path containment

**Risk:** Windows-style paths could be evaluated with the host platform's path rules.

**Fix:** Path-scope checks now use explicit `win32` or `posix` path implementations
based on the candidate path shape.

**Coverage:** Added Windows sibling, descendant, traversal, and case-folding tests.

### 2. Malformed URL routing

**Risk:** A malformed percent-encoded route parameter could throw during
`decodeURIComponent`, bypassing the normal hardened not-found response.

**Fix:** Route and workspace mount decoding is now guarded. Invalid encoding returns a
JSON 404 with the normal security headers.

**Coverage:** Added malformed-route and post-error health checks.

### 3. Literal static-route matching

**Risk:** Route punctuation such as `.` was interpreted as a regular-expression
wildcard.

**Fix:** Static route fragments are escaped before parameter patterns are inserted.

**Coverage:** Exact `toy.css` matches; a near-match such as `toyXcss` returns 404.

### 4. Workspace credential exposure

**Risk:** Serialized workspace objects included remote workspace tokens and managed
OpenCode usernames/passwords.

**Fix:** Workspace serialization now omits `openworkToken`, `opencodeUsername`, and
`opencodePassword`, including nested OpenCode credentials.

**Coverage:** Workspace, status, capability, and mounted workspace responses are
checked for both values and forbidden field names.

### 5. NFT draft lost updates

**Risk:** Concurrent metadata, storage, mint, or listing transitions could read the
same stale draft and overwrite one another.

**Fix:** Draft mutations are serialized per draft. Writes use a unique temporary file
and atomic rename. Walrus storage and public image metadata now commit in one
transaction.

**Coverage:** Concurrent independent metadata edits and storage/mint transitions
preserve every field.

### 6. Billing webhook races and replay

**Risk:** Concurrent Stripe events could lose provider event IDs or race between
read/validate/write phases.

**Fix:** Billing account mutations now execute under a per-file queue and commit
atomically with owner-only file permissions. Checkout reconciliation, duplicate-event
tracking, stale-event rejection, and subscription identity checks happen inside the
same mutation.

**Coverage:** Concurrent event IDs, duplicate replay, stale updates, checkout
mismatch, unpaid checkout, subscription mismatch, invalid signatures, stale
signatures, oversized payloads, and read-only mode.

### 7. Token-store durability and fail-closed behavior

**Risk:** Concurrent token creation could lose entries. A failed create or revoke
write could change in-memory authorization without changing disk. A corrupt token
file was silently treated as empty.

**Fix:** Token mutations are serialized, written atomically with mode `0600`, and
published to memory only after durable replacement succeeds. Corrupt or unreadable
stores now fail closed and are preserved for recovery.

**Coverage:** Forty concurrent creates, restart persistence, permissions, corrupt
store preservation, failed-create rollback, and failed-revoke rollback.

### 8. Feedback and workspace policy persistence

**Risk:** Concurrent feedback append/delete operations and direct JSON writes could
lose data or leave partial files.

**Fix:** Feedback mutations are serialized; rewrites are atomic; malformed unrelated
lines are preserved. Model selection, data policy, wallet safety policy, and generated
image metadata use atomic file replacement.

**Coverage:** Thirty concurrent submissions plus deletion racing with a new
submission, note patch concurrency, policy route persistence, and read-only guards.

### 9. Cold-start timeouts

**Risk:** A healthy managed OpenCode process could be classified as failed during a
cold start because discovery and readiness timeouts were shorter than observed startup
time.

**Fix:** The local launcher now allows 45 seconds for workspace discovery and 20
seconds per discovery request. The orchestrator waits up to 30 seconds for its router.

**Coverage:** Launcher contract tests and a live local boot.

### 10. Recovery-drill correctness

**Risk:** The backup drill compared raw portable-file digests even though skill YAML is
canonically serialized during import, producing a false failure after a semantically
correct restore. Its CLI also mishandled the standard `--` separator.

**Fix:** The drill accepts `--` and verifies restore idempotence with a second real
import preview. A successful restore must report every imported item unchanged and no
create, update, replace, or delete actions.

**Coverage:** Real drill restored a temporary workspace and reported 19/19 unchanged.

### 11. Readiness contracts aligned with shipped behavior

**Risk:** Static readiness gates still asserted an obsolete read-only Hyperliquid
contract and an older reasoning-variant implementation.

**Fix:** Gates now verify guarded client-signer Hyperliquid execution without custody
or server-side secrets, retain non-submitting behavior for unsupported surfaces, and
assert the current reasoning variant contract.

## Verification Ledger

### Focused regression tests

Covered:

- token persistence and failure rollback
- NFT draft concurrency
- project feedback concurrency
- billing account concurrency
- malformed routes and static-route matching
- workspace credential redaction
- billing webhook lifecycle and replay
- launcher and recovery-drill contracts

Result: passed.

### Complete server suite

Command:

```bash
pnpm --filter matterhorn-work-server test
```

Result:

```text
728 pass
0 fail
5130 expect() calls
61 files
```

### Server typecheck

Command:

```bash
pnpm --filter matterhorn-work-server typecheck
```

Result: passed.

### Complete app suite

Result:

```text
591 pass
0 fail
3864 assertions
81 files
```

### Matterhorn platform safety gate

All 10 stages passed, including:

- wallet approval and money-path guards
- backend scopes, authentication, secret rejection, and concurrent notes
- Bittensor, Hyperliquid, Polymarket, Sui, and Longevity desk contracts
- Stripe signatures, replay, and billing lifecycle
- router and daemon/Electron perimeters
- observability and error boundaries
- product design and browser-smoke contracts
- production-readiness checks

### Dependency audit

Result: 1,341 locked dependency versions inspected with no low, moderate, high, or
critical advisories.

## Live Local Evidence

App:

`http://127.0.0.1:5197/workspace/ws_028bfb4e9ee2/session`

Server:

`http://127.0.0.1:4117`

Verified:

- app route returns HTTP 200
- server `/health` returns HTTP 200
- protected workspace routes reject missing and invalid tokens with 401
- authenticated workspace routes return 200
- workspace responses do not contain managed-engine credentials
- malformed encoded routes return hardened JSON 404 responses
- readiness and control-plane endpoints return 200 with no local blocking checks
- CSP, `nosniff`, frame denial, referrer, and permissions headers are present
- browser renders the project home and five desks
- no warning or error console entries originate from the active app build

## Recovery Evidence

The drill imported workspace `ws_028bfb4e9ee2` into an isolated temporary workspace,
then re-ran a real import preview.

Result:

- total portable entries: 19
- unchanged after restore: 19
- create/update/replace/delete actions: 0
- temporary workspace registration removed after verification
- evidence report: `/tmp/matterhorn-backend-drill-evidence-b/report.json`

The local launcher uses automatic approval for isolated QA. The production/manual
approval path remains separately covered by import-preview fingerprint, stale-review,
and revalidation tests.

## External Launch Gates

These cannot be honestly closed by local automated tests:

1. Configure and verify production AI/provider credentials without committing secrets.
2. Run wallet-extension acceptance with MetaMask, Coinbase Wallet, Phantom/Sui Wallet
   Standard, and the intended WalletConnect surface.
3. Perform testnet signer acceptance for every enabled transaction path. Do not use
   mainnet funds for launch QA.
4. Configure the production Stripe account, prices, webhook endpoint, and signing
   secret; run a Stripe test-mode purchase and portal cycle.
5. Lock production origins and CORS, TLS termination, monitoring, alerting, and log
   retention in the deployment environment.
6. Build, sign, notarize, install, upgrade, and rollback the desktop artifacts on each
   supported OS.
7. Re-run the safety gate against the exact release commit and archive its evidence.

## Release Recommendation

The backend code and local end-to-end candidate are suitable for PR review and release
candidate promotion. Public deployment should proceed only after the external launch
gates above are recorded as passed or explicitly disabled in the product UI. No surface
should be labeled connected, live, or production-ready solely because its local mock or
fallback implementation passes.
