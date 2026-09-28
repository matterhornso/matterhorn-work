# Bounded visual review

Build-thread inspection rounds used: **1/2**. Independent finish review still
pending. No hosted or authenticated runtime acceptance is implied.

## Round 1 — 28 September, 19:57–20:00 UTC

60 captures prepared under `/private/tmp/matterhorn-retro-captures-2026-09-28`.
All are synthetic compositions of real production components, not screenshots
of a signed-in hosted workspace. The sidebar fixture uses real AppSidebar and
SidebarProvider with disposable props; desk callbacks record selection, not
actual agent provisioning. Composer uses the real editor/submission hook.

Inspected this representative batch together:

- launcher-composer-light-390, launcher-composer-dark-390
- sidebar-light-1440, sidebar-dark-390
- models-light-1440, models-dark-390
- wallet-light-390, wallet-dark-390
- auth-light-1440, auth-dark-390
- memory-light-390, memory-dark-390
- notes-light-768
- integrations-light-390, integrations-dark-1440
- public-dark-768

The list hierarchy, desk marks, paper/charcoal surfaces, action outlines and
light/dark model/composer controls are coherent. Sampled pages show no clipped
controls or horizontal page overflow. Long integration/public text remains
scrollable. Fixture debug controls beneath the composer are QA-only, not shipped
UI. Empty Notes/Memory remain intentionally sparse, not fabricated data.

## One correction batch

1. Mobile sidebar had no visible dismiss button (the shared sheet close was
   hidden). Reveal it only under the retro marker, keep Base UI behavior, place
   it in flow above workspace controls, and provide a 44px target. Browser checks
   cover close button, Escape, desk selection, focus return and preserved draft.
2. Integration Ready/Needs setup colors were faint on light surfaces. Add scoped
   semantic status colors without changing server readiness. Contrast tests cover
   both palettes; real rendered light values are asserted in browser tests.
3. Transaction step numbers were faint; use main text color. Enlarge the labelled
   close-review control to 44px. Preserve exact guard/approval/execution behavior.

Wallet warning/error text already uses the intended palette; the actual rendered
error color was verified as rgb(185,28,28), not inferred from screenshot pixels.

Correction behavior tests pass. **Do not call visual confirmation complete**:
the second/last inspection round is reserved until the remaining settings and
responsive/zoom coverage is ready. Do not start another open-ended polish loop.

## Outstanding evidence

Authenticated whole-shell routing/model requests and provider/chain services;
full settings/account/privacy routes; real content/streaming tool output;
200% browser zoom; actual Codex-width captures; Firefox/Safari/native package.
Existing component callbacks and HTTP fixtures are not a substitute for these.

No production config, secrets, wallet actions or persisted user data changed.
