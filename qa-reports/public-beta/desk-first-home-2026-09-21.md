# Desk-first Home — local verification

## Change

- Home presents Private AI, Bittensor, Hyperliquid, Polymarket, and Sui without an accordion, above workflows, project details, and activity.
- Model setup remains above the chooser only while a model is unavailable. Once available, desks are the first action section; resume appears below them.
- Private AI starts a blank chat. Crypto choices open the corresponding desk start screen without submitting a prompt.
- Short Home descriptions; existing safety details, provider gates, and launch flags retained. Custom workflows remain accessible in a secondary disclosure.

## Checks

- Frontend regression suite: 1,167 passed, 0 failed (170 files).
- App TypeScript check: passed.
- Production web build: passed; existing >500 kB chunk warning remains.
- `git diff --check`: passed.
- Browser: authenticated disposable localhost account, normal login. No production account or configuration changed.
- Desktop 1440 × 900: all five desk entries visible in the initial viewport; no horizontal overflow.
- Mobile 390 × 844: all five entries visible, last entry ends at y=598; no horizontal overflow.
- Clicked all four crypto entries and confirmed their matching start screens. Private AI opened an empty composer, not a desk-selection screen.
- Tab/Enter opened the Private AI details popover; Escape dismissed it. Custom workflow expands to the existing form and is collapsed initially.

## Limits and release status

- The disposable account has no real provider credentials. Model-ready ordering is covered by the source-contract regression; a real model-selection/response acceptance run was not performed here.
- No wallet signing, inference, cloud changes, push, merge, or deployment performed.
- Branch: `codex/desk-first-home`. Pre-existing Project goal icon changes and unrelated QA/handoff files were preserved.
- Preview tab closed and temporary viewport override reset after verification.
