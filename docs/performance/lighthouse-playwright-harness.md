# Matterhorn Lighthouse + Playwright Harness

This harness gives Matterhorn Desks a repeatable performance, accessibility, best-practices, and SEO evidence path for the production app shell and desk surfaces.

It combines:

- Playwright page loading, console-error capture, and screenshots.
- Lighthouse category scoring for `performance`, `accessibility`, `best-practices`, and `SEO`.
- Network graph outputs for dependency review.
- Atomic design checkpoints so performance ownership is clear by UI layer.

The harness is opt-in because it needs a running local app URL.

## Quick Start

Start the local web stack:

```bash
pnpm dev:headless-web
```

Copy the printed web URL, then run:

```bash
MATTERHORN_LIGHTHOUSE_URL=http://127.0.0.1:<port> \
  pnpm test:lighthouse-playwright -- --strict --json
```

For a custom output folder:

```bash
MATTERHORN_LIGHTHOUSE_URL=http://127.0.0.1:<port> \
  pnpm test:lighthouse-playwright -- \
  --strict \
  --output-dir qa-reports/lighthouse-playwright/<run-name>
```

The fast contract gate is:

```bash
pnpm test:lighthouse-playwright-harness
```

## Outputs

The runner writes:

- `summary.json` — machine-readable scores, metrics, failures, artifacts, and graph data.
- `summary.md` — reviewer-readable report.
- `*-lighthouse.json` — raw Lighthouse JSON per URL and viewport.
- `*-lighthouse.html` — full Lighthouse report per URL and viewport.
- `*-screenshot.png` — Playwright screenshot per URL and viewport.
- `network-dependency-graph.json` — grouped request graph by origin.
- `network-dependency-graph.dot` — Graphviz-compatible dependency graph.

## Thresholds

Default mode records evidence and fails only on runtime errors.

Strict mode fails if a category misses:

| Category | Strict threshold |
|---|---:|
| performance | 0.75 |
| accessibility | 0.95 |
| best-practices | 0.95 |
| SEO | 0.95 |

Use strict mode for beta-release checks and relaxed mode while a desk is under active layout iteration.

## Recommended Surfaces

Run the harness on the root app URL first, then on stable deep links when available:

- Home / project launcher.
- Bittensor desk.
- Hyperliquid desk.
- Polymarket desk.
- Wellness workflow desk.
- Memory desk.
- MCPs desk.
- Settings overview.

If a route requires a workspace/session ID, create the session in the UI first, copy the URL, and pass it through `MATTERHORN_LIGHTHOUSE_URL`.

Multiple URLs can be comma-separated:

```bash
MATTERHORN_LIGHTHOUSE_URL="http://127.0.0.1:5173/,http://127.0.0.1:5173/workspace/<id>" \
  pnpm test:lighthouse-playwright -- --strict
```

## Atomic Design Performance Checklist

Use the Lighthouse report to locate which layer owns the fix.

### Atoms

- Buttons, badges, logos, chips, inputs, focus rings, and icons.
- Must not import desk data loaders, protocol clients, or page-level stores.
- Must keep accessible names and contrast intact in light and dark mode.

### Molecules

- Prompt chips, safety strips, wallet rows, status pills, and small card groups.
- Should receive normalized props from a parent and avoid starting network requests.
- Should avoid layout shifts by reserving dimensions for icons, badges, and dynamic labels.

### Organisms

- Desk landing sections, Memory inbox, MCP cards, Settings panels, and transcript cards.
- Own loading, empty, degraded-provider, and error states.
- Must keep actions visible without trapping scroll inside nested cards.

### Templates And Pages

- App shell, desk routes, session layout, and settings layout.
- Own route-level code splitting, preconnect/preload decisions, and SEO metadata.
- Must keep the composer and right rail from overlapping content on desktop, tablet, and mobile.

## Graph Outputs

The harness groups Lighthouse network requests by origin and writes Graphify-friendly artifacts:

- `network-dependency-graph.json` for automated analysis.
- `network-dependency-graph.dot` for visualization with Graphviz or other graph tooling.

Example:

```bash
dot -Tpng qa-reports/lighthouse-playwright/network-dependency-graph.dot \
  -o qa-reports/lighthouse-playwright/network-dependency-graph.png
```

Use the graph to spot heavy third-party origins, late-discovered script/style chains, and unnecessary assets.

## Security Notes

The harness never asks for wallet secrets. Do not put seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports in test URLs, env vars, screenshots, or reports.

For Bittensor, use public SS58 addresses only when the UI flow needs public wallet context. Hyperliquid and Polymarket remain preview/external-client only unless a future security gate changes that.

## CI Guidance

Use `pnpm test:lighthouse-playwright-harness` in standard CI because it is fast and does not require a live app.

Use `pnpm test:lighthouse-playwright` in nightly, release-candidate, or manual QA jobs where the app server is started first and `MATTERHORN_LIGHTHOUSE_URL` is supplied.
