# Beta UI Performance And SEO Polish QA

Date: 2026-06-29

Branch: `codex/beta-ui-perf-seo-polish`

Source baseline:

- QA report: `/private/tmp/matterhorn-lighthouse-harness/qa-reports/beta-desk-v2-qa-2026-06-29.md`
- Evidence: `/private/tmp/matterhorn-lighthouse-harness/qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29`

## Summary

This pass focused on getting the beta desk UI into a cleaner Lighthouse/Playwright posture without changing the product safety model. The highest-impact fixes were SEO metadata, accessible control labels, route-level code splitting, lazy transcript rendering, and lazy heavy side-panel/modals.

The page is now SEO green and accessibility green. Performance improved substantially from the baseline, but the live harness still reports one non-blocking performance threshold miss in preview mode.

## Score Progression

| Run | Form factor | Performance | Accessibility | Best practices | SEO | Notes |
|---|---:|---:|---:|---:|---:|---|
| Baseline beta desk V2 | desktop | 0.36 | 0.89 | 1.00 | 0.75 | Missing SEO metadata, accessibility issues, dev-size initial request set. |
| Baseline beta desk V2 | mobile | 0.46 | 1.00 | 1.00 | 0.83 | Missing SEO metadata and mobile perf gap. |
| SEO and accessibility pass | desktop | 0.54 | 0.97 | 0.96 | 1.00 | Metadata, robots, accessible labels, and first lazy side-panel split. |
| Settings lazy split | desktop | 0.56 | 0.97 | 0.96 | 1.00 | Settings route removed from the initial Home/session path. |
| Transcript lazy split | desktop | 0.56 | 0.97 | 0.96 | 1.00 | Markdown/Shiki transcript path removed from the empty Home initial load. |

Latest evidence:

- `/private/tmp/matterhorn-lighthouse-harness/qa-reports/lighthouse-playwright/beta-ui-perf-seo-polish-transcript-lazy-2026-06-29`
- Latest summary: `/private/tmp/matterhorn-lighthouse-harness/qa-reports/lighthouse-playwright/beta-ui-perf-seo-polish-transcript-lazy-2026-06-29/summary.md`

## Latest Harness Metrics

| Metric | Value |
|---|---:|
| First Contentful Paint | 4.4 s |
| Largest Contentful Paint | 6.9 s |
| Total Blocking Time | 10 ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 4.4 s |
| Initial transfer | 994,096 bytes |
| Network requests | 26 total, including one expected local server health fetch |

Status: `FAILED_THRESHOLDS` because performance is `0.56` against a `0.60` target. `strict` is false, and all non-performance categories pass.

## Changes Verified

- Added production metadata to `apps/app/index.html`: description, application name, theme colors, Open Graph, and Twitter card.
- Swapped the main SVG favicon to the Matterhorn logo asset.
- Added `apps/app/public/robots.txt` so Lighthouse sees a crawlable robots file.
- Renamed the overlay document title from OpenWork to Matterhorn Work.
- Fixed the Docs status-bar accessible name so the visible label and aria label align.
- Added an accessible label/title to the session row overflow button.
- Lazy-loaded session-only heavy panels: provider auth, workspace sharing, browser, artifacts, voice, wallet, memory, and command palette.
- Lazy-loaded embedded settings in session route.
- Lazy-loaded transcript/Markdown rendering so Shiki and Markdown chunks are no longer part of the empty Home initial network path.
- Added `content-visibility` hints to below-the-fold Home sections.
- Increased the low-contrast right-rail `Desks` label contrast.

## Remaining Performance Seam

The next performance PR should target the always-on session shell dependencies:

- The Home path still loads the wallet vendor because wallet hooks/provider state are still wired through the global session shell.
- The composer path still loads editor dependencies before the user starts typing.
- The `app` and `session-route` chunks remain the largest active Home chunks.

Recommended next optimization:

1. Split the Home/new-session launcher away from the full session execution shell.
2. Defer wallet provider and wallet hooks until the Wallet rail, protocol action preview, or transaction approval path is opened.
3. Use a lightweight composer shell on Home and lazy-load the rich editor on focus.

## Preview Harness Caveat

The latest live run logs one console error:

`Failed to load resource: net::ERR_CONNECTION_REFUSED`

This is the preview-only health fetch to `http://127.0.0.1:4096`. It is expected when the static preview runs without the local Matterhorn server. It is not a regression in the packaged desktop runtime when the server is present.

## Verification Commands

```bash
npx -y pnpm@10.27.0 --filter @matterhorn-work/app typecheck
npx -y pnpm@10.27.0 build:ui
npx -y pnpm@10.27.0 test:matterhorn-customer-onboarding-ui
npx -y pnpm@10.27.0 test:customer-readiness-ui
npx -y pnpm@10.27.0 test:settings-overview-ui
npx -y pnpm@10.27.0 test:market-execution-safety-gate
npx -y pnpm@10.27.0 test:lighthouse-playwright-harness
MATTERHORN_LIGHTHOUSE_URL=http://localhost:4173 MATTERHORN_LIGHTHOUSE_OUTPUT_DIR=qa-reports/lighthouse-playwright/beta-ui-perf-seo-polish-transcript-lazy-2026-06-29 npx -y pnpm@10.27.0 test:lighthouse-playwright -- --desktop-only --json
```

## Result

Ready for review with a clear remaining optimization path. SEO, accessibility, best practices, typecheck, production build, UI static gates, market safety, and the Lighthouse/Playwright harness contract pass. The only remaining live harness miss is desktop performance at `0.56`, now narrowed to wallet/composer/session-shell deferral work.
