# Matterhorn restored UI implementation guide

Status: active source-backed companion to [DESIGN.md](../../DESIGN.md), refreshed 13 October 2026 with the user's approval. The root guide owns the visual contract; [.impeccable/design.json](../../.impeccable/design.json) provides documentation-panel specimens. Runtime CSS and components remain the implementation authority.

## Supported interface

The approved restored workspace is the only supported layout. The retro/minimal switches, alternate branches and retro stylesheet have been removed. Do not enable old flags, follow superseded rollout plans or recreate the removed component examples. This is visual restoration, not a repository reset to #1027, a data migration or a change to backend authorization, consent, accounting or model state.

Desktop retains conversation/project navigation, the central workspace and tool/desk access on the right. Mobile uses existing navigation menus and overlays. Home preserves model setup/status, five desks, workflow/project controls and activity. The primary desks remain Private AI, Bittensor, Hyperliquid, Polymarket and Sui. Memory, notes, wallet and integrations remain workspace tools; Longevity stays standalone and non-medical.

Model selection, Profile, Account, sign-out, wallet and Settings access must remain available. Account navigation is independent of optional Cloud visibility. Suggestions fill editable drafts and never send automatically. Retain persisted chats, models, drafts and preferences.

## Source map and exact distinctions

| Concern | Active source | Contract |
| --- | --- | --- |
| Semantic palette, typography, radii, depth | [index.css](../../apps/app/src/app/index.css) | Light ink actions invert to ice actions in dark mode; preserve the CSS cascade and component-specific semantics. |
| Radix colors and wide gamut | [colors.css](../../apps/app/src/styles/colors.css) | Retain native variables and display-P3 overrides; hex specimen fallbacks are not replacements. |
| Buttons | [button.tsx](../../apps/app/src/components/ui/button.tsx) | Six variants; outline is a tinted muted fill with transparent border, not a heavy outline. |
| Input | [input.tsx](../../apps/app/src/components/ui/input.tsx) | One-pixel input border, 2px focus ring, invalid/disabled states; 1rem text below 768px, 0.875rem above. |
| Card and badge | [card.tsx](../../apps/app/src/components/ui/card.tsx), [badge.tsx](../../apps/app/src/components/ui/badge.tsx) | Shared radius formulas and semantic colors; status text is not readiness proof. |
| Sidebar | [sidebar.tsx](../../apps/app/src/components/ui/sidebar.tsx) | Selected rows use sidebar accent; desktop/mobile/icon defaults are 16rem/18rem/3rem, with workspace overrides. |
| Workspace sizing | [ui-state-store.ts](../../apps/app/src/react-app/shell/ui-state-store.ts) | Preserve persisted width behavior rather than treating primitive defaults as fixed workspace dimensions. |
| Mobile and context panels | [use-mobile.ts](../../apps/app/src/hooks/use-mobile.ts), [session-layout-policy.ts](../../apps/app/src/react-app/domains/session/chat/session-layout-policy.ts) | Mobile/full-screen below 1024px; context sheet through 1279px; docked from 1280px. |
| Settings | [settings-page.tsx](../../apps/app/src/react-app/domains/settings/shell/settings-page.tsx) | Existing fixed ink sidebar palette remains in Light mode; preserve mobile section selection and dismissal. |
| Signed-out first paint | [index.html](../../apps/app/index.html) | Critical auth font/theme path remains separate from main-app CSS; no retired root marker. |

The shared radius base is `0.45rem`: medium controls use `calc(var(--radius) * 0.8)`, and shared cards use the base. Older DLS wrappers separately retain 10px/12px values. Do not force all of these to a guessed 8px.

Shared Card uses `--dls-card-shadow`; the later `.ow-soft-card` declaration is shadowless through `--dls-glow: none`. Right-panel wrappers are transparent and borderless. Semantic overlay shadows do not authorize raising every panel.

The main body is the existing Aeonik-first stack; Geist Variable and IBM Plex Sans Variable are bundled. A preferred family name is not proof that its font asset supplies every rendered glyph. Preserve user sizing and theme choices.

## Component examples

The sidecar contains ten self-contained examples extracted from active shared components: primary, outline, secondary, ghost, destructive and link buttons; a labelled input; selected sidebar row; compact badge; and shared card. Each description identifies its source. CSS utilities are expanded into scoped `ds-` selectors, with native token bindings and isolated light fallbacks. No routing, submission, deletion or wallet action is wired into an example.

Tonal ramps are generated documentation swatches only. They must not become additional application colors. Specimens describe appearance and supported CSS states, not complete Base UI focus management, account access or real execution.

## Preserved product and safety boundaries

- Surface availability follows server capability and existing launch/permission gates. Generated-media publishing, billing, Cloud and STM are not enabled by this documentation; STM stays off.
- Provider privacy/consent, account/workspace isolation, request ownership, Stop/retry and usage accounting remain unchanged. Jev is optional and revocable, never an authorization shortcut.
- Read/preview cards disclose source, freshness, missing context and whether they can submit. Reviewed wallet paths require the supported exact ticket and explicit signer approval; never infer signing from a card or badge.
- Polymarket compliance-blocked previews must not expose executable price, size or share fields. Research-only venues and unsupported protocol writes must stay labelled unavailable.
- Memory suggestions remain visible and user-controlled with provenance and confirm/edit/dismiss actions; no hidden saves.
- Never solicit wallet private keys, seed phrases, mnemonics or raw signing material. Privileged credential-management flows retain their separately reviewed controls; this guide introduces none.
- Longevity remains non-medical and does not gain payment, email, hosting or token-gating capabilities through styling.

## Current verification entry points

From the repository root, use the pinned toolchain and disposable test data:

```sh
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app test
pnpm --filter @matterhorn-work/app build:web
pnpm --dir apps/app exec bun test scripts/platform-controls.browser.test.ts
UI_QA_BROWSER=firefox pnpm --dir apps/app exec bun test scripts/platform-controls.browser.test.ts
UI_QA_BROWSER=webkit pnpm --dir apps/app exec bun test scripts/platform-controls.browser.test.ts
```

The renamed browser fixture is [platform-controls.tsx](../../apps/app/scripts/fixtures/platform-controls.tsx), exercised by [platform-controls.browser.test.ts](../../apps/app/scripts/platform-controls.browser.test.ts). It uses `UI_QA_BROWSER` (Chromium default), `UI_QA_CAPTURES`, `UI_QA_CORE_CAPTURES`, `UI_QA_CHAT_CAPTURES` and optional loopback-only `UI_QA_DIST_URL`. There is no package-script alias for this browser suite. The old `retro-controls` filename and `RETRO_QA_*` invocation examples in historical plans are not current commands.

Inspect both themes, desktop/mobile, keyboard focus and return, long names, selected-model state, draft retention, empty/error/disabled states, wrapping Settings actions and no unintended overflow or composer overlap. The inherited compact mobile text remains an accessibility consideration, not a claim of WCAG certification.

The fixture uses synthetic data; successful component callbacks do not prove hosted login, live agents, mail delivery, usage settlement or wallet execution. Current candidate scope and deployment gates are recorded in the [worklog](../../qa-reports/ui-rollback/2026-10-13/WORKLOG.md) and [operator handoff](../handoffs/permanent-restored-ui-deployment-2026-10-13.md). Do not extend local Chromium evidence to Safari, Firefox or packaged desktop without those checks.

## Historical plans

The [minimal workspace plan](minimal-workspace-revamp.md), [retro implementation plan](retro-ui-plan-2026-09-28.md), [platform rollout plan](platform-retro-rollout-plan-2026-09-29.md) and [retro inventory](retro-platform-inventory-2026-09-29.md) are retained as dated history. Their flags, styling instructions, source paths and acceptance commands may no longer exist. They do not override this guide or the approved restored source.
