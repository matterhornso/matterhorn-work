# Matterhorn launch execution results

3 October 2026. Decision: **LAUNCH BLOCKED; local regression package passes.** This execution followed the approved launch plan, starting with release/desk readiness. Hosted access blocked completion of stage 1; independent provider-document review proceeded as preparation, not as a claim that stage 2 had fully passed. No merge, deployment, production configuration change, signup/indexing activation or paid inference was performed.

## Release baseline

Read-only GitHub checks on this date returned:

- `dev`: `e4342d6bef8d833d12e36bd8093a87c8dbe84856`.
- Local candidate before this work: `c3eb7cd7f231a338524b26e0585ff5f8c1dc42fc`, branch `codex/search-discovery-2026-10-02`, based on that same `dev`.
- Hosted web and API both report `9b74d923b8c999733fe698c29a6555dd2980460b`.
- GitHub compare reports the hosted SHA **27 commits behind** `dev` (zero ahead). This excludes the additional unpublished discovery commits.
- The branch API reports `protected: false`; do not infer branch protection from a successful CI run. Inspect applicable repository rules and use explicit review/head checks before merge.
- Current dev check-runs include successful platform safety, customer crypto gates, container build, macOS/Linux tests, CodeQL, repository security, Rust security and security audit. Dependency review is skipped; an eval image job is cancelled; stats includes queued/cancelled runs. This is not CI on the unpublished local candidate.

The remote open-PR query returned older stacked PRs and OpenWork compatibility PR 1013 in its first page. It was not an exhaustive inventory or authority to merge any of them. No current launch PR identity was established.

## Hosted public probe

Command, using expected current dev rather than claiming dev was deployed:

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://desks.matterhorn.so \
  --server-url https://desks.matterhorn.so \
  --allowed-origin https://desks.matterhorn.so \
  --expected-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-web-commit e4342d6bef8d833d12e36bd8093a87c8dbe84856 \
  --expected-guarded-mode enforce --expected-signup-status open --strict
```

Exit 1, BLOCKED. Three failing checks: web SHA mismatch, API SHA mismatch and guarded runtime mode (`off`, reported readiness true). No inference of exploitation or absence of every authorization control is made from the mode alone. The required guarded launch configuration is not proven.

Passing public checks: HTTPS, HTTP200 app/API health, same-origin responses, JSON401 for unauthenticated `/workspaces` and `/opencode/global/health`, CSP/referrer/permissions/content-type/HSTS headers, trusted-origin CORS and untrusted-origin rejection. Auth config reports signup open with email verification, reset, legal acceptance and Turnstile configured; `/health/launch` reports ready. Those assertions are not successful email delivery or restore evidence and do not override the strict probe failures.

The in-app browser initially displayed `/session` signed out with Create account and Forgot password disabled and an email-setup explanation. This conflicts with the API configuration result. A reload/rebind could not be completed because browser control repeatedly timed out. Treat this as an observed discrepancy needing reproduction, not a confirmed root cause or proof that production email is absent. No auth bypass, signup submission or reset email was attempted.

## Five desk acceptance matrix

| Desk | Local offline contract coverage | Fresh real response through hosted UI |
| --- | --- | --- |
| Private AI | Shared chat/frontend and runtime tests pass | BLOCKED: no controlled authenticated test session or approved spend ceiling |
| Bittensor | Desk-depth and read-only fixture contracts pass | BLOCKED: same; live chain service and result still unverified |
| Hyperliquid | Desk-depth and read-only fixture contracts pass | BLOCKED: same; real source/freshness/warning fidelity still unverified |
| Polymarket | Desk-depth and read-only fixture contracts pass | BLOCKED: same; real market/tool evidence still unverified |
| Sui | Desk-depth contracts pass | BLOCKED: same; real selected-network lookup still unverified |

Two-account hosted isolation, inbox delivery/reset, hosted memory/notes deletion, actual browser logout cleanup and production backup restore remain BLOCKED for access/evidence. Local fixture coverage is listed below; it must not be promoted to hosted acceptance. Existing user localhost preview, chats and data were not modified.

## Fixed readiness test regression

The full gate reproduced a failure at `scripts/public-beta-web-readiness.test.mjs:36`. The first `/(.*)` Vercel rule is now host-conditional crawler metadata. The test mistakenly treated it as the unconditional security-header rule, returning undefined for CSP.

The fix collects only unconditional all-path headers, retaining every existing security assertion. A negative regression makes security rules host-conditional and verifies they cannot satisfy the assertion, for both root and app-root Vercel configurations. No deployed security headers, crawler controls or runtime behavior were weakened or changed.

## Fresh local validation

| Command | Result and boundary |
| --- | --- |
| `node scripts/public-beta-web-readiness.test.mjs` | PASS after fix, including conditional-only negative fixtures |
| `pnpm test:matterhorn-platform-safety` | PASS all 11 stages after fix; offline/fixture/local-server coverage, not production acceptance |
| `pnpm --filter @matterhorn-work/app test` | 1,304 pass, zero fail; 8,030 assertions across 187 files |
| `node --test scripts/search-discovery-audit.test.mjs apps/app/scripts/build-public-guides.test.mjs` | 22 pass, zero fail |
| `bun test apps/server/src/model-usage-store.test.ts apps/server/src/agent-token-budget.test.ts apps/server/src/provider-privacy.test.ts apps/server/src/jev.test.ts apps/server/src/stm-runtime.test.ts apps/server/src/stm-mcp.test.ts apps/server/src/stm-mcp-launch.e2e.test.ts` | 59 pass, zero fail; 373 assertions; fixture TypeSafe and isolated STM services only |
| `pnpm --filter @matterhorn-work/app typecheck` | PASS |
| `pnpm --filter @matterhorn-work/app build:web` | PASS; existing chunk-size warnings remain |
| `git diff --check` | PASS |

The first sandboxed safety run failed on local socket binding. A scoped notes test reproduced `listen 127.0.0.1 EPERM`; the authorized loopback rerun passed those backend tests, then exposed the genuine header-selector assertion. The final permitted rerun passed all stages. No failures were suppressed or counted as live success.

Local machine logs, not committed because they are verbose fixture output: `/tmp/matterhorn-launch-safety-2026-10-03.log` (pre-fix permitted run), `/tmp/matterhorn-launch-safety-2026-10-03-rerun.log` (final pass), `/tmp/matterhorn-launch-frontend-2026-10-03.log`, `/tmp/matterhorn-launch-focused-2026-10-03.log`, `/tmp/matterhorn-launch-build-2026-10-03.log`. These temporary logs are supplementary, not durable hosted evidence.

## Privacy review and remaining claims

See [provider decision register](../../../docs/handoffs/provider-privacy-review-2026-10-03.md). Current official documents were read without sending customer data. The review does not establish account-specific agreements, training opt-in settings, hosting region, encryption/key configuration or retention values.

The public privacy source still says workspace deletion removes content immediately and leaves only security metadata. That wording needs qualification for backups, downloaded exports and provider-held copies before public claims sign-off. No legal/privacy-page text was silently changed in this pass. The owner should approve the proposed precise wording in the decision register, and an implementation pass should update copy and regression checks together.

## UI audit limits

Impeccable audit was used as a checklist for measurable acceptance, preserving the existing retro identity. One hosted signed-out accessibility tree was inspected. Browser-control timeouts prevented desktop/mobile capture rounds, saved-theme tests, keyboard/zoom verification and authenticated flows. Accessibility, performance, responsive design, theming and implementation integrity therefore have **no defensible fresh numerical score** in this pass. No new UI/CSS was generated. Historical screenshots and frontend test passes are not substituted for these missing checks.

The design context tool reported stale product metadata and surface-brief resolution; no design-document migration or unrelated redesign was performed. Target files exist in the repository despite the tool's app-root-relative orphan warnings.

## Next actions in order

1. Owner/operator supplies a controlled signed-in test session, second test account/inbox, bounded provider budget, and deployment/backup evidence. Credentials must not be pasted into reports or chat.
2. Operator coordinates the intended web/API/runtime release and guarded mode; do not blindly toggle enforcement without verifying authenticated gateway/runtime prerequisites. Production changes need separate approval.
3. Codex completes real responses/live reads on every desk, Jev off/on where approved/configured, accounting settlement, two-account and recovery checks. Diagnose the browser/API signup discrepancy on the actual release.
4. Complete account-specific provider terms, backup/encryption evidence and the privacy wording decision. Keep unverified optional Jev unavailable and STM off.
5. Publish/review the exact tested candidate and include this regression fix. The tech-team merge handoff remains conditional; no claim of launch-ready or merge-ready is made from this report.
