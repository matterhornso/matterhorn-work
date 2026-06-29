# Matterhorn UI Sweep - Profile And Wallet Rail

- Date: 2026-06-28
- Branch: `codex/profile-wallet-rail-v2`
- Local app: `http://127.0.0.1:58347`
- Viewport: 1440 x 1000

## Screenshots

| Surface | File | Result |
|---|---|---|
| Home | `01-home.png` | Pass: no horizontal overflow |
| Bittensor | `02-bittensor.png` | Pass: no horizontal overflow |
| MCPs | `03-mcps.png` | Pass: no horizontal overflow; still visually outline-heavy |
| Profile | `04-profile.png` | Pass: compact right-rail account surface renders |
| Wallet | `05-wallet.png` | Pass: compact right-rail wallet surface renders |
| Settings | `06-settings.png` | Pass: no horizontal overflow |

## Findings

- Profile now opens as a first-class right-rail Account panel instead of a full settings page crammed into the rail.
- Wallet now opens as a first-class right-rail Wallet panel with connection status, connector guidance, and visible safety boundaries.
- Wallet empty state is honest for the current runtime: no injected EVM wallet connector was detected, but public Bittensor reads and market previews can still be used.
- No requested surface produced horizontal overflow at the tested desktop viewport.
- MCPs remains the roughest visual surface: the automated sweep counted a large number of outline-heavy elements. It is functional but still deserves the next polish pass.
- Console output includes WebGL performance warnings from the runtime and unauthenticated 401s in signed-out mode. Those were observed during the sweep and should remain on the QA watchlist, but they did not block the requested surfaces from rendering.

## Test Commands

```bash
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 --filter @matterhorn-work/app typecheck
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:matterhorn-customer-onboarding-ui
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:customer-readiness-ui
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 test:market-execution-safety-gate
CI=true PNPM_CONFIG_MINIMUM_RELEASE_AGE=0 npx pnpm@10.27.0 dev:headless-web
```
