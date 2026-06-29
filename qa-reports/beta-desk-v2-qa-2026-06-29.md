# Matterhorn Work Beta Desk V2 QA

- Date: 2026-06-29
- Base SHA before QA branch: `deba8df0c432`
- QA branch: `codex/beta-live-qa-harness-report`
- Live app URL used: `http://127.0.0.1:54022`
- Evidence directory: `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/`

## Product Truth / Desk V2 PRs Verified

| Phase | PR | Status | Notes |
|---|---|---:|---|
| Product Truth + Settings Readiness | #627 | Merged | Settings now show honest readiness statuses and demote developer/preview surfaces. |
| Bittensor Desk V2 beginner flow | #628 | Merged | Bittensor actions are beginner-first and include show TAO, subnet browse, validator compare, stake/unstake/transfer previews, watches, receipts, and coldkey/hotkey explanation. |
| MCP functionality + connector honesty | #629 | Merged | MCP cards distinguish built-in, configured, requires setup, needs API key, and catalog-only connectors. |
| Profile + Wallet right rail | #630 | Merged | Profile and Wallet compact panels explain auth, support, protocol support, EVM setup, SS58/public-address guidance, and external signer boundaries. |

## Static Gates

| Command | Result |
|---|---:|
| `pnpm --filter @matterhorn-work/app typecheck` | Pass |
| `pnpm test:matterhorn-customer-onboarding-ui` | Pass |
| `pnpm test:crypto-panel-ux` | Pass |
| `pnpm test:customer-readiness-ui` | Pass |
| `pnpm test:matterhorn-memory-ui` | Pass |
| `pnpm test:market-execution-safety-gate` | Pass |
| `pnpm test:mcp-catalog-contract` | Pass |
| `pnpm test:protocol-desk-visual-contract` | Pass |
| `pnpm test:settings-overview-ui` | Pass |
| `pnpm test:matterhorn-backend-frontend-linkage-audit` | Pass |
| `pnpm test:lighthouse-playwright-harness` | Pass |

## Live Browser + Lighthouse QA

The live app was started with:

```bash
npx -y pnpm@10.27.0 dev:headless-web
```

The server responded successfully:

- Web root: `200`
- Server health: `{"ok":true,"version":"0.13.12","opencodeVersion":"1.14.38",...}`

The live Lighthouse/Playwright pass was run with:

```bash
MATTERHORN_LIGHTHOUSE_URL=http://127.0.0.1:54022 \
  npx -y pnpm@10.27.0 test:lighthouse-playwright -- \
  --json \
  --output-dir qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29
```

### Result

The live harness completed after changing the screenshot readiness wait from `networkidle` to `domcontentloaded`. The app keeps long-lived HMR and agent connections open in dev mode, so `networkidle` was a false readiness signal.

| Form factor | Performance | Accessibility | Best practices | SEO | Result |
|---|---:|---:|---:|---:|---:|
| Desktop | 0.36 | 0.89 | 1.00 | 0.75 | Fail thresholds |
| Mobile | 0.46 | 1.00 | 1.00 | 0.83 | Fail thresholds |

Artifacts:

- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/summary.md`
- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/summary.json`
- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/127-0-0-1-54022-root-desktop-screenshot.png`
- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/127-0-0-1-54022-root-mobile-screenshot.png`
- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/network-dependency-graph.json`
- `qa-reports/lighthouse-playwright/beta-desk-v2-2026-06-29/network-dependency-graph.dot`

## Blockers Before Calling This Beta-Polished

1. Performance is below the non-strict threshold in dev Lighthouse.
   - Desktop performance: `0.36`
   - Mobile performance: `0.46`
   - The network graph shows a very large dev request set, including `998` requests from the web origin and `120` from the local server origin.
   - Next step: run the same harness against a production build or packaged app; then optimize route-level imports and isolate protocol/provider loading from initial Home render.

2. SEO is below threshold.
   - Desktop SEO: `0.75`
   - Mobile SEO: `0.83`
   - Next step: inspect Lighthouse HTML for missing metadata and crawlability issues; this matters more for the browser build than the desktop app.

3. Desktop accessibility is one point below threshold.
   - Desktop accessibility: `0.89`
   - Next step: inspect Lighthouse accessibility audit details and fix labels/contrast/focus order on the Home route.

4. Live dynamic protocol behavior still needs a tester pass.
   - The static gates verify UI contracts and safety copy.
   - A human or agent should still click through Home, Bittensor, Hyperliquid, Polymarket, Wellness, MCPs, Memory, Profile, Wallet, and Settings in the running app and compare against the screenshot evidence.

## Retest Commands

```bash
npx -y pnpm@10.27.0 test:matterhorn-customer-onboarding-ui
npx -y pnpm@10.27.0 test:crypto-panel-ux
npx -y pnpm@10.27.0 test:customer-readiness-ui
npx -y pnpm@10.27.0 test:matterhorn-memory-ui
npx -y pnpm@10.27.0 test:mcp-catalog-contract
npx -y pnpm@10.27.0 test:market-execution-safety-gate
npx -y pnpm@10.27.0 test:lighthouse-playwright-harness
```

Live QA:

```bash
npx -y pnpm@10.27.0 dev:headless-web
MATTERHORN_LIGHTHOUSE_URL=http://127.0.0.1:<web-port> \
  npx -y pnpm@10.27.0 test:lighthouse-playwright -- \
  --json \
  --output-dir qa-reports/lighthouse-playwright/<run-name>
```

## Release Recommendation

The Phase 1-4 product truth, desk copy, MCP honesty, and Profile/Wallet rail work is merged and statically green. Do not call the UI performance/SEO layer complete yet. The next product-polish PR should target Home route production performance and Lighthouse accessibility/SEO findings using the artifacts in this report.
