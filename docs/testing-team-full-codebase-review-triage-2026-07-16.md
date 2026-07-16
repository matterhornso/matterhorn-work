# Testing-Team Full Codebase Review Triage - 2026-07-16

This ledger records the engineering disposition of the testing-team review of
commit `8a6272db` on `codex/wednesday-beta-rc-2026-07-15`. The review was useful
input, but each claim was rechecked against the current source and executable
tests before it was accepted as a launch blocker.

The public production decision remains **NO-GO** until the external stop-ship
gates in `friday-production-go-live-readiness-2026-07-17.md` are closed for the
exact release commit. A green local codebase does not replace signed desktop,
real-wallet, deployed-host, connector, monitoring, backup, or rollback proof.

## Launch-Blocking Findings

| Review finding | Recheck | Disposition | Verification |
|---|---|---|---|
| Tailwind default numeric colors do not compile | Confirmed | Fixed by merging Tailwind's standard palette with the existing Radix and `dls` colors. This is the conservative release fix; a later semantic-token migration must not be mixed into the release candidate. | `apps/app/tests/tailwind-palette-contract.test.ts`; production bundle must contain representative `red`, `amber`, and `sky` utilities. |
| Markdown raw-HTML XSS | Not reproducible; the cited sink was assessed without the renderer policy | Closed as a stale/incorrect finding. The current renderer drops raw HTML, escapes dynamic code/attribute content, and rejects unsafe links before `dangerouslySetInnerHTML` receives the generated markup. | `apps/app/tests/markdown-security-contract.test.tsx` includes the cited `<img src=x onerror=...>` payload and verifies it is absent from server-rendered output. |
| Settings conditional hook and unguarded tab failure | Confirmed | Fixed. `openExtensionDetail` is declared before every redirect return. Each settings tab now has a tab-keyed `SurfaceErrorBoundary`, so a failing tab does not blank the settings shell. | `apps/app/tests/settings-route-stability-contract.test.ts`; app typecheck. |
| Non-English onboarding still exposes inherited coding-agent copy | Confirmed | Contained for stable launch. English is the only stable language option. Existing locales are behind `VITE_MATTERHORN_EXPERIMENTAL_LOCALES_ENABLED=1` until their terminology and onboarding review is complete. | `apps/app/tests/launch-language-policy.test.ts`; `.env.example`. |
| CI does not gate full suites or typechecks | Confirmed | Fixed in `.github/workflows/ci-tests.yml`. The required platform-safety job now runs app and server typechecks plus both complete test suites before custom safety gates. | Local full-suite/typecheck rerun and GitHub Actions on the release PR. |

## Backend And Security Findings

| Review finding | Recheck | Disposition | Verification |
|---|---|---|---|
| Rate limiter trusts spoofable forwarding headers and retains stale buckets | Confirmed | Fixed. The Node adapter supplies the socket peer address; the limiter ignores client-controlled forwarding headers and periodically sweeps expired buckets. Deployments behind a reverse proxy must enforce their own edge rate limit because the app intentionally sees the trusted proxy peer. | `apps/server/src/serve-node.test.ts`; spoofed-header case in `apps/server/src/backend-security.e2e.test.ts`. |
| Child-path resolver is lexical and permits symlink escape | Confirmed | Fixed. The workspace root and nearest existing ancestor are resolved through the filesystem before a child path is accepted, including not-yet-created files below a symlink. | `apps/server/src/server.normalizeWorkspaceRelativePath.test.ts`. |
| Host/client token equality is not constant-time | Confirmed | Fixed. Configured bearer and host tokens are compared as equal-length SHA-256 buffers with `timingSafeEqual`; stored issued tokens remain hash lookups. | `apps/server/src/utils.test.ts` and backend security suite. |
| SSE enqueue can race a closed stream | Confirmed | Fixed. Enqueue failure closes local stream state and clears the heartbeat instead of throwing on each tick. | Server typecheck and complete server suite. |
| Unknown billing event fields default open | Confirmed | Fixed. Missing checkout payment status no longer synchronizes an entitlement and unknown subscription status maps to `none`. | `apps/server/src/billing-security-defaults.test.ts`. |

## Launch-Contained Findings

These findings are real risks but do not justify expanding the frozen stable
scope one day before release. Their surfaces stay disabled or constrained until
separate acceptance evidence exists.

| Finding | Stable-launch containment | Required before enablement |
|---|---|---|
| Generated-media usage can be reset by deleting artifacts; workspace-local entitlement state is not a production billing authority | Billing and generated-media creation are hidden and their direct routes are blocked by default. Live payments remain off. | Append-only authoritative usage ledger with atomic reservation; server-controlled or signed entitlement state; Stripe checkout, webhook, portal, cancellation, and reconciliation acceptance. |
| Non-USDC swaps, router calls, batch transactions, and some typed-data paths do not share the complete single-transaction guard pipeline | They are outside the frozen public execution promise. Hyperliquid is the only in-scope execution path and remains kill-switched until real-wallet testnet acceptance. | Asset-aware pricing, router classification, per-step validation/simulation, `parseUnits` encoding, limit coverage, and behavioral tests before exposing each path. |
| Electron renderer-compromise hardening chain | Local package tests do not constitute a signed public desktop release. | Navigation allowlist, permission allowlist, validated `openPath`, loopback fetch-header review, sandbox assessment, signed/notarized package, and clean-Mac acceptance. |
| Large route/shell modules, untyped event seams, no lint baseline, and `noUncheckedIndexedAccess` disabled | Refactoring them now would create broad release risk. Existing focused and full tests remain mandatory. | Post-launch architecture workstream with incremental extraction, typed events/RPC, lint/format baseline, stricter TypeScript, and behavioral coverage. |
| Radix status/desk tokens are not consistently adopted; type-scale and contrast drift remain | Restoring the compiled palette fixes missing safety/status affordances without a high-churn codemod. | Dedicated semantic-token/contrast/a11y pass with visual regression evidence after launch. |

## Claims Requiring Context

- Root `package.json` version `0.0.0` is the private workspace aggregator, not
  the shipped app/server/desktop product version. Release review must still
  confirm all distributable package versions and artifacts match.
- Historical QA reports and duplicate desktop build directories are preserved
  because the release owner explicitly forbids deleting them during this dirty
  integration. They are not automatically release artifacts and must not be
  staged without review.
- Script-level string contracts are not counted as substitutes for behavioral
  tests. The CI change adds the complete Bun app/server suites; custom safety
  scripts remain an additional layer.
- The stable English-only policy is a deliberate release limitation, not a
  claim that the inherited locale files are production-ready.

## Verification Required For Closure

Run on the exact candidate after all source changes:

```bash
pnpm --filter @matterhorn-work/app typecheck
pnpm --dir apps/server typecheck
pnpm --filter @matterhorn-work/app test
pnpm --dir apps/server test
pnpm --filter @matterhorn-work/app build
pnpm test:matterhorn-platform-safety
pnpm build
git diff --check
```

Browser acceptance must cover Project home, chat, every visible desk, Wallet,
Profile, Memory, Notes, Outputs, MCPs & Tools, and every stable Settings route
at desktop and 390-pixel mobile widths. Require no error boundary, console
error, failed required request, clipped control, overlap, or horizontal
overflow. Verify safety/status colors in the production CSS, not only source.

## Closure Evidence - July 16

The code-level closure rerun completed against this dirty candidate without
staging or deleting integration evidence:

- final app suite: 556 passed, 0 failed, 3,727 assertions across 74 files;
- final server suite: 711 passed, 0 failed, 5,007 assertions across 57 files;
- focused frontend stability/security: 7 passed and 28 assertions;
- focused backend security: 67 passed and 190 assertions;
- focused billing security/routes: 38 passed and 263 assertions;
- app and server typechecks: passed;
- app production build and root build: passed;
- full 10-stage Matterhorn platform-safety gate: passed;
- production CSS emitted representative restored numeric status utilities;
- fresh loopback acceptance at `http://127.0.0.1:5192` passed 14 stable
  desktop routes at 1440x900 and 8 critical mobile routes at 390x844 with
  expected content, no crash signature, no horizontal overflow, and zero
  browser console errors.
- the exact-source Electron directory package rebuilt and passed all 16
  isolated-profile checks; signing and notarization remain external stop-ship
  requirements.
- a live Bittensor fallback retest no longer fabricates subnet IDs or
  capabilities when the tool response lacks matching evidence.

This closes the reproducible code findings in the review. It does not close
the operator-owned release gates below, and it does not authorize enabling
Billing, generated-media creation, Cloud, or Hyperliquid submission.

## External Stop-Ship Gates

The code triage does not close:

1. Developer ID signing, notarization, stapling, Gatekeeper, updater, and clean
   Mac installation proof.
2. MetaMask, Coinbase Wallet, Phantom/Sui, and minimal Hyperliquid testnet
   rejection/approval/receipt acceptance.
3. Exact-commit deployment behind HTTPS with exact CORS, security headers,
   monitoring, backup, export/delete, support, and rollback evidence.
4. Connect/disconnect/restart acceptance for every visible third-party MCP or a
   disabled `Coming soon` state before tagging.
5. Final multi-viewport and two-user acceptance against the deployed URL.

The release owner records GO only when this code verification is green and
every stop-ship row in the Friday readiness ledger has exact-commit evidence.
