# Matterhorn Lighthouse + Playwright Report

- Generated: 2026-06-29T04:04:08.819Z
- Git SHA: deba8df0c432
- Strict mode: no

## Thresholds

| Category | Threshold |
|---|---:|
| performance | 0.6 |
| accessibility | 0.9 |
| best-practices | 0.9 |
| seo | 0.9 |

## Runs

| URL | Form factor | Performance | Accessibility | Best practices | SEO | Console errors | Status |
|---|---|---:|---:|---:|---:|---:|---|
| http://127.0.0.1:54022 | desktop | 0.36 | 0.89 | 1.00 | 0.75 | 0 | FAIL |
| http://127.0.0.1:54022 | mobile | 0.46 | 1.00 | 1.00 | 0.83 | 0 | FAIL |

## Atomic Design Performance Notes

- Atoms: buttons, badges, logos, and chips should not import page-level data or protocol clients.
- Molecules: cards and safety strips should receive already-normalized props and avoid new network fetches.
- Organisms/desks: route-level shells own data loading, suspense/loading states, and degraded-provider copy.
- Templates/pages: use this report to catch layout shifts, oversize bundles, inaccessible controls, and missing SEO metadata before a customer build.

## Graph Outputs

- `network-dependency-graph.json` groups Lighthouse network requests by origin.
- `network-dependency-graph.dot` can be rendered with Graphviz or graph tooling.
