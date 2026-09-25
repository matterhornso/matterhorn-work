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

1. Verify cancelled gateway approval (`write_denied`, reason `cancelled`) is
   presented as stopped, not a generic failure. Current streamed
   `MessageAbortedError` has a stopped presentation; the gateway rejection path
   requires a separate regression.
2. Test session/model/desk transitions with pending sends and unsent drafts.
   Draft durability across an app reload remains unverified/not guaranteed by
   the in-memory composer store; do not claim it from this fix.
3. Repeat responsive, keyboard, screen-reader and real hosted acceptance in an
   available environment. No launch signoff follows from this bounded pass.

Fixture reproduction: `bun apps/app/scripts/composer-fixture-preview.ts`; use its
printed loopback URL with `?managed&draftRace` or `?managed&draftRace&failFirst`.
The disposable fixture server and tab used for this pass were closed afterward.
