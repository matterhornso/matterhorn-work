# Matterhorn Memory Beta Readiness QA - 2026-06-24

## Scope

- Repo: `matterhornso/matterhorn-work`
- Branch: `codex/memory-beta-readiness-qa`
- Tested `dev` SHA before this report: `41c550219935b4c342b7090252550691a068fbb6`
- Focus: Matterhorn Memory contract alignment, visible suggestion inbox, producer wiring for Bittensor/Hyperliquid/Polymarket/Wellness, customer beta readiness, and execution-safety regressions.

## PR Sequence Verified

| PR | Status | Scope |
| --- | --- | --- |
| #525 | Merged | Aligned production Memory suggestion inbox entries with Kimi's lifecycle contract. |
| #526 | Merged | Added global Memory rail unread badge and refresh events for visible suggestions. |
| #527 | Merged | Added Hyperliquid and Polymarket preview-only memory suggestion producers plus executable tests. |

## Memory UX And Safety Findings

- Memory suggestions are visible and reviewable through the Memory panel.
- The right rail now behaves like an inbox and shows pending suggestion count.
- Suggestions remain `user_confirmed_only`; nothing is saved automatically.
- Bittensor suggestions are limited to public SS58/subnet/watch context.
- Hyperliquid and Polymarket suggestions are public watch contexts only and avoid execution-shaped fields such as `canSubmit` and `liveSubmissionEnabled`.
- Wellness suggestions remain restricted/educational and opt-in.
- Secret-shaped input is rejected before producing suggestions.

## Screenshot Evidence

Same-day production UI sweep evidence remains available at:

- `qa-reports/ui-sweep-2026-06-24/01-home-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/02-bittensor-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/03-hyperliquid-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/04-polymarket-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/05-wellness-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/06-memory-panel-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/07-tools-extensions-desktop.png`
- `qa-reports/ui-sweep-2026-06-24/08-home-tablet.png`
- `qa-reports/ui-sweep-2026-06-24/09-home-mobile.png`
- `qa-reports/ui-sweep-2026-06-24/console-events.json`
- `qa-reports/ui-sweep-2026-06-24/network-failures.json`

The related full UI/UX report is `qa-reports/full-ui-ux-e2e-qa-2026-06-24.md`.

## Commands Run

```bash
pnpm test:matterhorn-memory-contract
pnpm test:matterhorn-memory-api-cli
pnpm test:matterhorn-memory-producers
pnpm test:matterhorn-memory-ui
pnpm test:monday-beta-launch-readiness
pnpm test:customer-ready-crypto-smoke
pnpm smoke:customer-ready-crypto
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
pnpm test:market-execution-safety-gate
```

## Results

All commands above passed.

Important evidence from the customer crypto smoke:

- Overall status: `READY`
- Unified crypto chat, CLI, MCP/operator-loop, readiness UI, Bittensor customer readiness, market safety, market execution-readiness, official SDK validation, receipt evidence, watches, and Bittensor evidence gates all passed.
- The market execution safety gate still proves no Hyperliquid/Polymarket live submit routes, signing routes, API-secret paths, private-key paths, raw-signature paths, or signed-payload paths are present.

## Beta Readiness Conclusion

Matterhorn Memory is ready for a controlled beta pass as a visible, consent-first memory layer:

- It can suggest public/restricted context for the desks that Matterhorn currently exposes.
- It does not silently write memories.
- It keeps market memories read/preview/external-signer-only.
- It keeps Wellness restricted and educational.
- It preserves the broader market and crypto safety invariants.

Remaining product polish should focus on production UI refinement rather than backend correctness:

1. Show the Memory inbox badge in the final Stitch-driven shell design.
2. Add richer suggestion card visual states: new, edited, confirmed, dismissed, expired, blocked.
3. Add a production browser screenshot sweep after the next UI shell overhaul lands.
4. Add customer-facing explainer copy: "why Matterhorn suggested this" and "what happens if I confirm."
