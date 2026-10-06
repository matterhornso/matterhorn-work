# Public guides — design conformance

Date: 2026-10-02. Result: conforms as an incumbent Read-mode extension within the source-and-capture scope below. The independent [finish review](FINISH-REVIEW.md) records `disposition: ship`; this document does not authorize deployment or certify complete accessibility/runtime acceptance.

## Authority and scope

Reviewed `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, the public-guide surface brief, the shipped Impeccable documenter instructions and complete `reference/document.md`. The existing Matterhorn workbench remains authoritative: paper/charcoal planes, violet actions, ice selection, inherited typography and quiet reading surfaces. No new visual world or system change was approved. `DESIGN.md` and `.impeccable/design.json` are preserved; neither needs a guide-specific token addition to describe this extension.

Implementation examined: `apps/app/content/public-guides.mjs`, `apps/app/scripts/build-public-guides.mjs`, `apps/app/public/learn.css`, shared `apps/app/src/styles/retro.css`, `apps/app/public/theme-bootstrap.js`, and the existing composition at `apps/app/src/react-app/domains/public/public-trust-route.tsx:640`. Seven guide records provide a question/direct answer, practical evidence checks, explicit unavailable-service boundaries, sources and an existing app exit. No account, provider or worker action is introduced by reading a guide.

## Reused system evidence

| System role | Source evidence and application |
| --- | --- |
| Paper and text | `learn.css:4`–`:12` aliases `--retro-paper`, `--retro-panel`, `--retro-ink`, `--retro-muted`, `--retro-line`, `--retro-action`, `--retro-action-text`, `--retro-subtle` and `--retro-focus`. Shared `retro.css:2` uses paper `#f7f5f0`, panel `#ffffff`, ink `#18171c`, muted `#55505f`, line `#24212c`; dark overrides at `:75` use `#18171c`, `#232128`, `#faf8f3`, `#d3cedb`, `#aaa2b5`. The document planes and section text consume these roles directly. |
| Actions and selection | Violet action/hover remains `#6d28d9`/`#5b21b6` in light and `#c4a0ff`/`#d4bcff` in dark. App-entry links carry the shared `data-matterhorn-button` and default-variant attributes (`build-public-guides.mjs:107`, `:119`). Guide current navigation and text selection repeat the established ice `#d1f2ff`/ink `#18171c` pair (`learn.css:39`, `:54`); those two rules use literal existing values, not live selection-token aliases. |
| Typography | `learn.css:14` exactly uses the documented public-auth stack: Avenir Next, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif. It imports no new font. H1 reuses the public heading emphasis (750, −0.03em); H2 uses the compact title emphasis (700, −0.02em). The actual guide ramp is H1 `clamp(1.75rem, 3vw, 2.25rem)`, H2 `1.25rem`, H3/body `1rem`, lead `1.125rem`, note/footer `0.875rem`; heading line-height is `1.25`, body `1.65` (`:38`, `:55`–`:62`). |
| Composition | The trust route already uses a centered max-width-6xl container, a 180px desktop navigation column, a 40px gap, and wrapping navigation on small screens. The guide applies the same column/gap vocabulary inside a 1152px container (`learn.css:43`, `:50`), with a 72ch article measure and one-column layout below 768px (`:82`). It is a composition reuse, not reuse of the React route component. |
| Geometry and depth | Radius aliases shared `--retro-radius` (3px), with an 8px legacy fallback. The two app-entry links inherit the shared 2px outline and `3px 3px 0` action shadow; hover and press rules remain in `retro.css:113`–`:160`. Article sections are unraised, with 1px dividers (`learn.css:63`); prompt examples use a quiet 1px panel border and 20px padding (`:70`). No new card grid or elevated reading plane is introduced. |
| Focus and motion | Guide CSS provides 3px focus outlines and a focus-revealed skip link (`learn.css:42`, `:80`). Shared retro anchor focus has 3px offset; the guide fallback/main-focus rule uses 4px. The actual cascade, not one universal offset, is the contract. Reduced-motion rules remove guide transitions/animations (`:93`); this is source evidence, not observed animation acceptance. |
| Brand and semantics | The header reuses `/matterhorn-logo-square.svg` at 24×24 with adjacent visible product name, ordinary app links target `/session`, and generated markup provides labelled navigation, `aria-current`, heading hierarchy, lists, `time`, and focusable main content. Metadata reuses `/matterhorn-logo.png`. No shipping raster was created or changed; the captures are QA evidence, not shipping imagery. |

## Implementation-specific adaptations, not new system rules

- The standalone guides use the incumbent **public-auth** font stack. Public Security instead loads the main-app stylesheet and its broader body stack/bundled Variable fonts, as `DESIGN.md` already explains. These paths must not be described as identical computed typography. Guides do not load the app's stored font-size machinery; browser/root sizing and actual rendered font selection were not measured in this pass.
- Reading copy increases from the app's documented 0.875rem operational body role to 1rem/1.65; the direct answer is 1.125rem. This is an explicit local reading hierarchy, not a replacement app type scale.
- Compared with the trust route, guide header/footer retain paper rather than the trust route's retro panel fill, and use 1px rather than 2px dividers. Guide current navigation retains ice/ink without the trust route's 2px inset outline. These quieter local treatments appear in the captures and remain compatible with the reading-plane rule; they are not canonized as replacement public-page primitives.
- Guide navigation replaces trust destinations with seven guide destinations and keeps 44px minimum targets on desktop and mobile. It wraps above the article rather than using the application's drawer. Breadcrumbs appear only on detail guides. The two app exits stay explicit links; prompt examples have no send/copy/run behavior.
- Local spacing includes 40px/56px layout padding, 28px section padding, 24px container inset and a 20px inset below 421px. Safe-area-aware insets are present at the larger rule; the narrow override is a fixed 20px. These are surface dimensions, not additions to the system spacing scale.
- Legacy fallbacks are local literals; this stylesheet does not import the entire incumbent semantic system. Its no-JavaScript dark media rule also supplies literal retro-dark guide colors. Full legacy-dark/no-JavaScript combinations are outside the supplied capture matrix and should not be claimed equivalent to the hydrated app.
- The existing theme bootstrap is loaded before styles and resolves persisted canonical/legacy keys or the current system preference. It is a one-time bootstrap, with no live system-change listener in that file. Real preference transitions remain unverified here.

## Built output and captured result

Read-only comparison found all seven `apps/app/dist/learn/*.html` guide pages byte-identical to `renderGuide` with the build SHA read from each existing artifact. `dist/learn.css` and `dist/learn/retro.css` match their source stylesheets byte-for-byte. The later extensionless-entry correction emits `dist/learn.html`; `cmp` confirms it is identical to `dist/learn/index.html`. This is a routing-entry addition, not a visual change. No build, browser or runtime was started by this documentation pass.

Opened all five supplied full-page images under `.impeccable/review/search-guides/`:

- `desktop-light.jpg` and `desktop-dark.jpg` (1280×2351): guide index, left navigation, strong title/direct answer, divided sections and footer. Their structure matches emitted markup; paper/charcoal, violet actions and ice selection match the source roles.
- `mobile-390-light.jpg` (390×3158): Bittensor guide, wrapping navigation, breadcrumb, multiline title, bordered read-only example, evidence list and footer. Text and actions stay visibly within the captured width.
- `mobile-320-dark.jpg` (320×4006): index reflows to one reading column and wrapping footer links; no obvious clipping or blank capture region.
- `tablet-legacy-light.jpg` (768×2556): index retains the desktop column breakpoint, pale legacy ground and softer unraised app-entry controls, consistent with omission of shared retro styling.

Images were displayed scaled to fit; this is qualitative correspondence, not pixel sampling or a computed-style audit. Dark and legacy images are fixture evidence. The complete default generated output is current by file comparison, but file comparison cannot prove how the fixture theme was selected or that screenshots represent hosted behavior. Other guide contents were reviewed in source/output, not individually rendered in this pass.

## Drift and verification limits

Pre-existing documentary drift is not repaired: `DESIGN.md` calls retro the approved release default while retaining a later “do not enable … before live runtime acceptance” guardrail. The broad AGENTS brand-color instruction and PRODUCT desk list also differ from the more specific current retro contract/primary-desk list. This extension follows the explicit existing retro surface authority; it does not silently reconcile those documents. Prior metadata drift was reported by the finish review, but its exact diagnostic was unavailable and is not reconstructed here.

No craft defect is promoted into a reusable system rule. The finish review reports no material fix in its scoped artifact/capture review. This document preserves that bounded result, not blanket approval: 200% zoom, Safari/Firefox, assistive-technology behavior, actual font metrics, full contrast/target audits, persisted/system-theme transitions, hosted headers/routing, external documentation freshness, and live agent/tool or wallet behavior remain unverified. Builder-reported tests/build/typecheck and focus/overflow measurements were not rerun here. Generated default metadata remains `noindex, follow`; publication and index inclusion are separate acceptance questions.

Only this conformance report was written. No design-system/source edit, asset creation, deployment, push or runtime mutation was performed.
