# Retro surface coverage

This is an implementation/QA ledger, not a claim that the whole app is verified.
All work is behind `VITE_MATTERHORN_RETRO_UI=1`. Production is unchanged.

| Surface | Implementation so far | Evidence / next check |
| --- | --- | --- |
| Shared buttons/forms/tabs/dialogs | Scoped light/dark tokens, outlines, hard shadows, focus, disabled states | Real-component Chromium fixture: both themes/390px; no hosted acceptance |
| Checkbox/switch/sheets/command palette | Retro states and panel boundaries, preserve native/Base UI semantics | Consent/switch browser checks; sheet/palette visual pass pending |
| Sidebar/mobile navigation | Anchored outline, selected state, mobile panel | Actual full-shell interaction/capture pending |
| Five-desk launcher | One outlined list, retained server readiness and existing desk entry | Existing routing/starter contract tests; actual capture pending |
| Models settings | List/filter/selected state; restored pending-task return action | Browser fixture: persistence before navigation, mismatch/403/retry, empty/loading/setup; actual server unverified |
| Chat model dialog | Shared dialog/button tokens inherited | Raw search/option controls and keyboard/visual pass pending |
| Chat/composer | Composer outline, user message boundary, wrap long starters | Draft/starter regression contracts; full chat capture/streaming still pending |
| Tool results | Bittensor result boundaries retain tone and metadata | Other tool presentations and long payloads pending |
| Settings | Shared section rhythm and headings, controls inherited | Account/models/workspace/privacy route captures and navigation pending |
| Public auth | Critical initial HTML and scoped auth styles | Flag-on/off production builds; form layout/recovery captures pending |
| Privacy/Terms/Security/Support/Status | Shared tokens inherited, copy untouched | Dedicated page styling/navigation/readability pending |
| Wallet + approvals | Shared controls inherited, transaction logic untouched | Native wallet connection/signing NOT run; review-ticket visual checks pending |
| Memory | Shared controls inherited | Saved/review/add/delete/consent visual checks pending |
| Notes | Shared controls inherited | List/editor/save/error responsive checks pending |
| Integrations + crypto catalog | Shared controls inherited | Authoritative availability/connected/setup/error visual checks pending |
| STM | Default-off unchanged, controls inherit if local feature enabled | Synthetic settings consent regression/captures pending; real vault prohibited |
| Desktop overlay | Same opt-in root marker | Packaged/native validation pending |

## Environment limits

- Browser fixtures use synthetic in-memory responses and no real credentials.
- No hosted release, provider request, chain read or financial action has been
  exercised as part of this redesign. Prior acceptance does not substitute for
  new-layout acceptance.
- Chromium is available. Safari/Firefox and signed desktop are unverified.
- Screenshot inspection rounds used: **0/2**. Batch complete surfaces before
  taking the first visual-review round; avoid repeated piecemeal polish loops.
- No image-generation comps approved. User requested code-first progress while
  asleep; existing brand/font assets retained under the pinned retro reference.
