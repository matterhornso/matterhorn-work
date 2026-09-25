# Security and unnecessary-code review — 24 September 2026

## Result and limits

Completed a risk-focused cross-layer review and local hardening pass on
`codex/desk-agent-runtime-repair`, based on `e6617234827776d80d531c7d042b82eab28fce92`.
Existing uncommitted agent-repair work was preserved. Nothing was pushed, merged,
deployed, or changed in production. No wallet was signed or funded.

This is **not an exhaustive line-by-line audit or public-beta certification**.
The backend alone has 394 source/test files and a roughly 23,000-line main server.
The review combined targeted source inspection, adversarial reproductions,
existing security regressions, dependency/secret scans, and a public-chain read.
No new authenticated browser walkthrough, production two-account isolation test,
email delivery test, backup restoration, or real-wallet acceptance was performed
in this pass. Earlier five-desk browser evidence remains in
`agent-repair-2026-09-24/README.md`; it is separate evidence, not rerun here.

## Changes made in this pass

### 1. Bound sidecar request and subprocess resources

**Finding:** The Bittensor HTTP sidecar buffered request bodies without a limit.
A synthetic 70,000-character body was accepted with HTTP 200 where the new
64-KiB contract requires 413. Python stdout/stderr were also accumulated without
limits; independent wallet/metagraph reads had no concurrency cap.

**Fix:** Limit request bodies to 64 KiB, including chunked requests; require a
JSON object; cap nesting at 64 levels. Use a shared four-process pool with a
20-second execution deadline, forced termination on timeout/output overflow,
and a 4-MiB stdout limit. Release process slots only when the child closes.
Parse on `close`, not `exit`, so buffered stdout is fully drained first.
HTTP request/header deadlines are 30/10 seconds.

Files: `packages/bittensor-subtensor-sidecar/index.mjs`, `python-process.mjs`,
`test-security.mjs`, `test-python-process.mjs`, `package.json`.

### 2. Remove unsafe diagnostic exposure and duplicated secret validation

**Finding:** SDK stderr could become an HTTP error or cached health message.
It may contain internal paths, endpoint details, or upstream diagnostics.
Forbidden input field names were reflected into errors. Mock quotes did not
reject secret fields at the same boundary as other POST routes.

**Fix:** Do not capture/return SDK stderr. Return fixed, useful process-failure
messages and generic unexpected HTTP errors. Validate secret fields once in
the common POST reader, including quotes, and remove duplicated route checks.
Do not reflect arbitrary input field names. Submission remains disabled.

This service remains unauthenticated by design and must remain on loopback or
a private access-controlled network. Resource bounds are defense in depth, not
permission to expose it publicly. The README now states that boundary and
corrects the outdated claim that liveness proves chain readiness.

### 3. Validate the main API's JSON object contract

**Finding:** The shared API parser asserted a TypeScript record type without
checking the parsed value. `POST /workspace/:id/mcp` with JSON `null` reproduced
HTTP 500 before validation, in an isolated authenticated fixture.

**Fix:** Validate the value with the existing record guard; reject null, arrays,
booleans, numbers, and strings with HTTP 400 / `invalid_json` before handlers
access fields. Remove the unchecked cast. Add a regression for each shape.

Files: `apps/server/src/server.ts`, `backend-security.e2e.test.ts`.

### 4. Remove a redundant bounded-body implementation

The dev-log endpoint duplicated the existing stream reader. It now reuses
`readBodyTextLimited` with its original 128,000-byte limit and error label.
Redaction, authentication and endpoint behavior remain unchanged. Existing
dev-log redaction/oversize regressions passed after the consolidation.

### 5. Include Python in release secret scanning

**Finding:** The scanner's source-extension allowlist omitted `.py`, including
the live Bittensor bridge.

**Fix:** Include Python source and add a synthetic-secret regression that
verifies a finding is emitted without exposing the matched value.
The scan still has its documented exclusions and pattern limits; zero findings
is not proof that every possible secret or Git-history leak has been ruled out.

## Review coverage

| Boundary | Work and evidence |
| --- | --- |
| Auth and account recovery | Inspected password hashing/token handling; auth, verification, outbox and maintenance suites |
| Workspace/filesystem | Inspected canonical-path confinement; path, symlink and backend-isolation suites |
| API input/logging | Inspected shared JSON and log readers; reproduced null-body error; fixed and tested |
| Agent permissions/results | Inspected managed configuration and rollout enforcement; guarded-runtime, MCP, privacy and capability suites |
| Protocol integrations | Inspected bounded pinned HTTPS transport; HTTPS/MCP, OAuth and guarded-authorization suites |
| Wallet/money paths | Inspected transaction guards; billing/accounting, money-path gate, wallet/crypto MCP suites |
| Data | Memory/Notes, durable-state authority and usage-store regressions |
| Rendered model content | Inspected Markdown renderer's escaping/URL handling; existing raw-HTML regression passed; no frontend changes |
| Sidecar | Inspected Node/Python bridge, request and process lifecycle; new adversarial tests and a real public-chain read |
| Supply chain | Current registry audit of lockfile and patched elliptic digest verification; source secret scan |
| Broader platform | Safety-gate stages for local router, Electron/daemon perimeter, observability, browser smoke and readiness contracts |

## Verification

- Initial focused suite: **266 passed, 0 failed**, 12 files, 1,757 assertions.
- After shared API edits: **140 passed, 0 failed**, 5 files, 1,340 assertions.
- Additional account/integration/desk suite: **346 passed, 0 failed**, 13 files,
  1,916 assertions. These batches overlap; do not add them as unique tests.
- Money-path safety stage rerun after the final parser edit: **157 passed,
  0 failed**, 12 files, 780 assertions.
- Sidecar package suite: all mock-contract, HTTP adversarial, subprocess,
  missing-SDK and Python compatibility tests passed.
- Secret-scanner synthetic regression passed; source scan found zero matches.
- Dependency audit: **1,457 locked versions, no low-or-higher advisories**;
  pinned elliptic patch proof passed.
- Server typecheck, wallet MCP security, crypto MCP security and diff whitespace
  checks passed.
- Hardened wrapper, actual public Finney read: health/read succeeded at block
  **9,139,014**; three subnet records returned with `freshness: live` and source
  `bittensor-python-sdk`. This was a direct public read, not a new chat acceptance
  or wallet transaction.

Initial sandbox runs could not bind loopback sockets or reach the advisory
registry. They were rerun with the needed permissions; the results above are
from those completed runs, not the failed sandbox attempts.

### Safety gate is not fully green

Stages 1–7 passed. Stage 8, `design.contract`, still fails at
`scripts/matterhorn-design-system.test.mjs:48`, expecting the old string
`Home, Bittensor, Hyperliquid, Polymarket, Longevity, Memory, MCPs, and Settings`.
This predates this review and conflicts with the current desk-first design work.
Stages 9–10 (`browser.smoke.contracts,product.readiness`) passed when run
separately. The design assertion was not deleted or bypassed.

## Remaining work / do not delete blindly

1. Reconcile the design contract with the approved five-desk UI and test actual
   navigation behavior; restore the complete safety gate before release.
2. Keep the Bittensor sidecar private. Check deployed topology and server-side
   authentication/rate limits before rollout; local tests do not prove them.
3. Rerun hosted acceptance against the exact release: real accounts/isolation,
   provider responses, wallet rejection/expiry/tamper/approval, email recovery,
   and verified backup restore. These are not satisfied by fixtures.
4. The main server's size is a maintainability risk. Split route groups in a
   separate behavior-preserving refactor with regression coverage. Deleting
   route groups, legacy migrations, fallback adapters, dormant desktop features,
   or tests without reachability/migration analysis would risk user data and
   supported installations. None were mass-deleted here.
5. The unchanged local browser supervisor/sidecar were not restarted with this
   pass's code. Tests exercised the edited source in disposable processes; the
   public-chain probe exercised the new wrapper directly. Production is unchanged.

## Reproduction commands

From the repository root:

```sh
pnpm --dir packages/bittensor-subtensor-sidecar test
node scripts/release-secret-scan.test.mjs
pnpm release:secret-scan
pnpm audit:dependencies
pnpm --dir apps/server exec tsc --noEmit
pnpm exec bun test apps/server/src/backend-security.e2e.test.ts apps/server/src/auth.e2e.test.ts apps/server/src/billing-routes.e2e.test.ts apps/server/src/memory-routes.e2e.test.ts apps/server/src/notes-routes.e2e.test.ts
pnpm test:matterhorn-platform-safety
pnpm test:matterhorn-platform-safety --only browser.smoke.contracts,product.readiness
node packages/matterhorn-work-wallet-mcp/test-security.mjs
node packages/matterhorn-work-crypto-mcp/test-security.mjs
git diff --check
```
