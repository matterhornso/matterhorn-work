# MCPs Desk Non-Boxy UI Sweep

Date: 2026-06-28
Branch: codex/mcps-non-boxy-v2

## Scope

Focused QA for the MCPs & Tools right-rail surface after replacing the old boxed Matterhorn MCP product cards with a softer stream layout.

## Evidence

- `00-home.png` - baseline home surface before opening the MCP rail.
- `01-mcps-desktop-rail.png` - MCPs & Tools rail after the stream-layout change.

## Checks

- No horizontal overflow at 1440px desktop viewport.
- Matterhorn MCP entries render as a divider stream instead of nested bordered cards.
- Protocol MCP entries use protocol logo assets through `ProtocolBrandLogo`.
- Install commands wrap inline and are copyable without tiny nested scroll boxes.
- Supported tools render as compact summaries instead of chip piles.
- Safety boundaries remain visible through a disclosure.

## Commands

```bash
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:matterhorn-customer-onboarding-ui
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:customer-readiness-ui
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:market-execution-safety-gate
```

