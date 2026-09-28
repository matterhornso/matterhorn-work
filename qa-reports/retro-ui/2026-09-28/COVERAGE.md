# Retro surface coverage

This is an implementation/QA ledger, not a claim that the whole app is verified.
All work is behind `VITE_MATTERHORN_RETRO_UI=1`. Production is unchanged.

| Surface | Implementation so far | Evidence / next check |
| --- | --- | --- |
| Shared buttons/forms/tabs/dialogs | Scoped light/dark tokens, outlines, hard shadows, focus, disabled states | Real-component Chromium fixture: both themes/390px; no hosted acceptance |
| Checkbox/switch/sheets/command palette | Retro states and panel boundaries, preserve native/Base UI semantics | Consent/switch browser checks; sheet/palette visual pass pending |
| Sidebar/mobile navigation | Anchored outline, selected state, mobile panel, visible 44px close control | Real AppSidebar fixture: selection/Escape/close, focus return, preserved draft; representative light desktop/dark mobile reviewed. Authenticated whole shell unverified |
| Five-desk launcher | Existing list extracted as PrimaryDeskLauncher; same callbacks and desk marks | All five buttons keyboard reachable, exact selection callback/no submit/draft retained; both themes/390px visually reviewed. Real agent navigation unverified |
| Models settings | List/filter/selected state; restored pending-task return action | Browser fixture: persistence before navigation, mismatch/403/retry, empty/loading/setup; actual server unverified |
| Chat model dialog | Outlined labelled search, explicit pressed state, shared dialog tokens | Full keyboard/visual pass pending |
| Chat/composer | Composer outline, user message boundary, wrap long starters | Actual composer/browser: Enter/click/Stop, single-flight sends, explicit consent, token-free retry pass with flag on/off; fixture captures reviewed. Full live chat/streaming pending |
| Tool results | Bittensor result boundaries retain tone and metadata | Other tool presentations and long payloads pending |
| Settings | Shared section rhythm and headings, controls inherited | Account/models/workspace/privacy route captures and navigation pending |
| Public auth | Critical initial HTML/scoped styles; recovery now disabled during account outage/checking, outage fallback preserved | Real browser preview reproduced/fixed failure; synthetic recovery transition passes. Auth captures saved, visual review pending; real signup/email unverified |
| Privacy/Terms/Security/Support/Status | Outlined page chrome and active navigation, copy untouched | Security → Privacy fixture interaction, app href and 390px overflow pass; actual app handoff/status health unverified |
| Wallet + approvals | Shared controls/custom overlays and transaction batch outlined; theme-safe warning/error text; labelled close and failure announcements | Real component fixture: blockers prevent execution, explicit click fails locally, retry does not execute, dismissal works. 54 wallet safety tests pass. Native signing NOT run; captures saved, visual review pending |
| Memory | Saved record outlines, responsive view actions, readable policy/error colors, native select/checkbox theme | Real component fixture: Saved/Review/Add, confirmation required before capture, failed save retains draft; delete/provenance/full visuals pending |
| Notes | Labelled title/body/tags, outlined list/search, mobile filters stack, editor headers | Real component fixture: failed save retains draft, retry persists before list return, 390px no overflow; full visuals pending |
| Integrations + crypto catalog | Shared controls, native select, responsive heading and catalog row boundaries | Real component fixture: Ready/Needs setup, server-gated external access, failed status/retry, failed key creation reveals no key. Synthetic captures saved; hosted integration unverified |
| STM | Default-off unchanged, controls inherit if local feature enabled | Synthetic settings consent regression/captures pending; real vault prohibited |
| Desktop overlay | Same opt-in root marker | Packaged/native validation pending |

## Environment limits

- Browser fixtures use synthetic in-memory responses and no real credentials.
- No hosted release, provider request, chain read or financial action has been
  exercised as part of this redesign. Prior acceptance does not substitute for
  new-layout acceptance.
- Chromium is available. Safari/Firefox and signed desktop are unverified.
- Screenshot inspection rounds used: **1/2**. See `VISUAL-REVIEW.md` for the
  representative batch and single correction pass. Reserve confirmation until
  remaining settings/zoom coverage is ready; no repeated polish loops.
- No image-generation comps approved. Code-first progress was assumed from the
  request to start while asleep; existing brand/font assets are retained.
- The expanded browser fixture explicitly sets the Vite retro env key and disables
  env-file loading. Whole-object env replacement previously left compact Memory
  off; the corrected fixture now exercises the real compact layout. No real
  workspace data or provider/chain requests are included.
- 42 synthetic captures saved at `/private/tmp/matterhorn-retro-captures-2026-09-28`:
  auth/models/notes/memory/transaction batch/integrations/Security × both themes
  × 390/768/1440px. Another18 cover the actual launcher/composer/sidebar fixtures.
  No-horizontal-overflow assertions pass. Sixteen representative captures across
  the combined batch were visually inspected in round1; not all60 individually.
