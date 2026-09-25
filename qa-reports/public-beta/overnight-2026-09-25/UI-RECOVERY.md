# UI recovery — 25 September 2026, 19:57 UTC continuation

## Corrected: late request completion discarded newer drafts

The composer stays editable during a pending send. The old success path always
cleared the session's composer; the failure path restored the old submitted text
and attachments. Both discarded changes made while the request was pending.
Replaying these exact store operations reproduced loss in both cases.

Acceptance now clears only the exact immutable composer state captured at send.
Changes to text, attachments, mentions, or pasted content preserve the newer state.
A rejected send leaves current contents intact instead of restoring stale input.
Preview URLs are revoked only when the accepted snapshot is actually consumed.

Eight regressions cover unchanged success, newer text, text changed back to the
original, attachments, mentions, pasted content, another session, and missing or
already-consumed snapshots. Provider-recovery wiring assertions were updated to
the stronger current-state contract rather than the old destructive assignment.

## Browser evidence and limits

- Used the existing real React/Lexical composer fixture, extended with a deferred
  response and the production composer store. Its local preview server blocks
  outbound connections with CSP; it creates no accounts or provider requests.
- Success case: submitted original text, typed `New unsent draft 🏔️`, completed
  the older request. Browser showed `accepted` and retained the newer text.
- Failure case: submitted original text, typed `Keep this newer draft after
  failure`, completed the failing request. Browser showed `retry_available` and
  retained the newer text.
- These are isolated component/store checks, **not** a complete authenticated
  send-flow acceptance. The fixture deliberately has no app stylesheet, so it
  does not establish visual or responsive conformance.
- Read-only inspection of the existing local Bittensor preview at actual
  650×735 showed a labelled text area, Attach, Tools, Ask, model, privacy, and
  navigation controls. No horizontal document overflow at that width. Existing
  draft was not sent. It was restored after a preview remount cleared it.
- Requested 390×844 override was not reflected in the actual viewport; mobile
  acceptance remains **unverified**. Reset the override. Native app access was
  unavailable while the Mac was locked; Safari/Firefox, actual screen-reader
  operation, contrast measurement and 200% zoom were not accepted in this pass.

## Tests

- Focused state/provider/error/Stop tests: 16 pass / 82 assertions.
- Complete frontend: **1,198 pass / 7,588 assertions**.
- Frontend typecheck and production build pass. Existing large-chunk build
  warnings remain; these results do not establish live performance acceptance.
- Impeccable source detector: zero primary findings, 33 advisory notes.
  Impeccable hardening and Uncodixfy kept the fix behavioral and within the
  incumbent layout, with no new panels, palette, or decorative copy.

## Follow-ups

1. Cancelled gateway approval is now covered by parser, rendered-component and
   state/telemetry regressions (see the 20:27 continuation below). Full browser
   Stop-to-gateway acceptance remains separate from these local checks.
2. Test session/model/desk transitions with pending sends and unsent drafts.
   Plain text, collapsed paste and model/conversation switching are now covered
   in the local browser (20:57 continuation). File attachments and structured
   mention/context restoration across a full reload remain unverified.
3. Repeat responsive, keyboard, screen-reader and real hosted acceptance in an
   available environment. No launch signoff follows from this bounded pass.

Fixture reproduction: `bun apps/app/scripts/composer-fixture-preview.ts`; use its
printed loopback URL with `?managed&draftRace` or `?managed&draftRace&failFirst`.
The disposable fixture server and tab used for this pass were closed afterward.

## 20:27 continuation — cancelled approval presentation

Reproduced the gateway's exact `write_denied` / `details.reason: cancelled`
response rendering as a red generic failure with a Retry response button. Two
new tests failed before the correction. The parser now recognizes that exact
code/reason pair in direct API errors, SDK-serialized errors, and plain objects.
It reports “Request stopped” with the preserved draft; no automatic retry CTA.
Denial, timeout, unknown dispatch and privacy failure are not classified as Stop.

Both ordinary send and response-retry catches share the corrected settlement:
cancelled requests return to idle, clear stale error activity, and record a
cancellation rather than a provider failure. Tests exercise both orders of Stop
acknowledgement and send rejection, with exactly one cancellation metric and
newer drafts intact. Real failures retain the error state. This is frontend
telemetry, not a change to billing or server accounting.

Validation:

- Focused parser/component/state/recovery tests: **31 pass / 182 assertions**.
- Full frontend: **1,204 pass / 7,629 assertions**. Initial sandboxed run could
  not bind two HTTP fixture servers; the complete loopback-enabled rerun passed.
- Frontend typecheck and build pass; existing chunk-size warnings remain.
- Full ten-stage platform safety gate passes (local/offline regressions and
  acceptance-verifier tests, not evidence of hosted launch readiness).
- Neutral status markup has `role=status`, atomic announcement and labelled
  dismissal; no error alert or Retry response button. No CSS/layout change.
- Impeccable detector: zero primary findings, 33 advisory notes.
- No new live-provider, hosted, mobile or assistive-technology acceptance claimed.

## 20:57 continuation — draft reload and navigation

Used the existing authenticated disposable local preview; no requests were sent
to a model or chain, no accounts or wallet actions were created. Before editing:

- Existing Bittensor draft survived an ordinary reload, selection of ASI1 MINI,
  restoring ASI1, opening the existing Sui conversation and browser Back.
- The compact navigation drawer stayed open after choosing the Sui conversation;
  Escape dismissed it. This is a remaining navigation friction to investigate,
  not evidence that the Sui agent executed.
- Reproduced leading/trailing whitespace being stripped on reload.
- Reproduced clearing edited text allowing an older saved draft to reappear.
- Reproduced collapsed pasted content becoming only `[pasted text <label>]`
  after reload. Its text existed only in the in-memory paste-parts store.

Corrections:

- Restore exact text only into an absent composer state. Existing text, including
  an intentional empty/whitespace edit or attachment-only state, wins over a
  stale persisted snapshot. Removed text-keyed rehydration and trimming.
- Persist known pasted blocks as their plain text. Reload therefore restores an
  editable expanded draft, not a dangling chip. The conversion uses only typed
  text and paste parts, never resolved provider context, memory, or consent.
- Pasted text already lost before this fix cannot be recovered by the fix.
  Binary File attachments still are not persisted by this text-draft mechanism.

Browser confirmation after hot reload:

- Cleared a draft; it stayed empty, including after a full reload.
- Pasted five lines with leading indentation and trailing blank lines; reload
  restored the actual content. DOM paragraphs were exactly `  Paste QA one`,
  `    Paste QA two`, `Paste QA three`, empty, empty.
- Restored the original unsent `Subnet discovery on Bittensor` draft and ASI1.

Validation: six new runtime regressions cover exact formatting, stale snapshots,
intentional clearing, separate sessions, pasted content and privacy exclusions.
Focused suite: 19 pass / 86 assertions. Full frontend: **1,210 pass / 7,647
assertions**. Typecheck/build pass; pre-existing chunk-size warnings remain.
Updated the source-wiring assertion from storing raw paste placeholders to the
tested snapshot conversion. Design detector: zero primary findings, 33 advisory
notes. No new layout or styling; Impeccable hardening and Uncodixfy applied.

Scope remains local browser/component/state coverage. No hosted, real-agent,
mobile viewport, Safari/Firefox, or screen-reader acceptance was added here.
