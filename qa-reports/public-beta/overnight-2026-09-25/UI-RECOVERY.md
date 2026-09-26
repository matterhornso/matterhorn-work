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

## 21:27 continuation — compact navigation and notes workspace isolation

The legacy compact sidebar opened a selected chat but left its modal navigation
drawer covering the destination. Session selection now closes only the mobile
drawer, leaving desktop sidebar preferences unchanged. Browser confirmation at
the existing 650px preview width: choose Sui chat, drawer dismisses without Escape;
browser Back restores Bittensor with the original unsent draft. No send occurred.

Notes had a more serious UI-state race. Both a controlled execution of the actual
refresh callback and the real NotesPage browser fixture reproduced this sequence:
start slow workspace-A list request, switch to B, display B's notes, then finish A.
The UI displayed `Current workspace: B` alongside `Only workspace A`. This was
stale client state, not proof of a backend authorization bypass.

NotesPage now resolves workspace identity outside a keyed WorkspaceNotesPage.
The list, editor, pending operations and local filters belong to that workspace's
component instance. A workspace transition unmounts the previous instance, so
its late responses cannot populate the new instance. Existing unmount-save logic
remains bound to the original workspace; server authorization was not changed.

Browser confirmation using the actual NotesPage with synthetic responses:

- After B loaded, completing A kept `Only workspace B` visible.
- Switching to failing C showed the error/retry state without A or B's notes.
- The error view also says “No notes yet”; this is a remaining copy/state defect,
  not accepted as a truthful empty result. No broad visual polishing performed.

Reproduce with `pnpm --dir apps/app exec bun scripts/composer-fixture-preview.ts
--notes`, open its printed loopback URL, then Switch to B → Complete old A request
→ Switch to unavailable C. The fixture uses the real component, a synthetic
client and `connect-src 'none'`. It is unstyled functional evidence, not visual
or hosted acceptance. Both disposable fixture processes and the tab were closed.

Validation:

- Focused UI/data helpers: 33 pass / 166 assertions before the notes boundary;
  boundary/close-editor/navigation tests afterward: 24 pass / 196 assertions.
- Notes, memory and hosted-MCP API suites: **20 pass / 296 assertions**, using
  disposable local data. Covers review-only suggestions, forbidden-secret and
  policy rejection, workspace namespaces, corrupt vault errors, concurrent note
  patches and write permissions. No AWS/live integrations claimed.
- Final frontend: **1,211 pass / 7,655 assertions**. Typecheck and build pass;
  existing chunk warnings remain. Secret scan: 1,203 files / zero findings.
- Impeccable detector: zero primary findings, ten advisory notes. Impeccable
  hardening and Uncodixfy preserved the existing design; changes are behavioral.

Still unverified: same-workspace endpoint/client replacement during a pending
request, overlapping autosaves while typing, and full hosted two-account browser
acceptance. These are follow-up coverage, not claims of complete isolation.

## 21:57 continuation — notes save ordering and truthful failure state

Four regression cases failed against the previous production callback: an old
successful save permitted closing a newer draft, overlapping saves reached the
API concurrently, a revert matching the stale server value skipped persistence,
and a save could count as successful for a different selected note.

The editor now serializes its saves and considers a saved snapshot current only
if both the selected note and draft identity still match. Back/Memory actions
keep the editor open when newer edits remain. Saving stays visible until queued
writes finish. A failed save does not block subsequent queued work. The existing
workspace-bound unmount save remains intact. This is per-editor ordering, not a
claim of cross-tab/multi-user conflict resolution.

Initial load failure now shows the existing error and Retry without also
claiming “No notes yet” or offering “Create first note.” Stale same-workspace
notes remain available alongside an error when previously loaded.

Browser fixture confirmation (real NotesPage, synthetic client, no network):

1. Open B's note, type `First saved draft`, click Back while save is pending.
2. Type `Newer edit must survive`, complete the first save: editor stays open
   with the newer text while fixture storage reports the older saved text.
3. Complete queued saves: storage reaches the latest text, pending count is
   zero and Saving disappears. Back then closes to a list with the latest text.
4. Switch to failing C: only load error/Retry; no false empty state or prior list.

Repeat using the `--notes` fixture and its new Complete next note save button.
The loopback fixture server and temporary tab were stopped/closed. Original
authenticated preview data and unsent draft were not touched in this pass.

Validation: five callback regression tests plus one error-state contract;
**1,217 frontend tests pass / 7,670 assertions**. Typecheck/build pass; existing
chunk warnings persist. Secret scan: 1,203 files / zero findings. Impeccable
source detector: zero primary findings / four advisories. Hardening guidance
kept this to truthful states and draft preservation; no visual redesign.

No hosted acceptance or real-provider/chain request is claimed. Same-workspace
client replacement, cross-tab editing, and hosted browser isolation still need
coverage. No deployment/configuration changes.

## 22:27 continuation — connection identity boundary

Reproduced the remaining same-workspace connection race in the NotesPage browser
fixture: start connection 1's delayed list, replace the client while retaining
workspace A, display connection 2's notes, then complete connection 1. The old
list replaced the current one. Workspace ID alone was not a sufficient UI key.

The component key now combines workspace ID with an opaque, weakly-held client
identity. Tokens and URLs are never placed in the key. Ordinary rerenders retain
state; replacing the connection replaces its list/editor state owner. Old saves
remain bound to their original client. This is not cross-tab conflict resolution
or proof of backend authorization; hosted account isolation is still unverified.

Browser confirmation of the same sequence leaves `Connection 2 workspace A`
visible after completing the old response. Two scope-key unit tests and the
component wiring contract cover identity stability, separation and credential
exclusion. Frontend **1,219 pass / 7,677 assertions**, typecheck/build pass, secret
scan zero findings, design detector zero primary findings / four advisories.
Impeccable hardening preserved the existing layout; no visual changes.

## 23:57 continuation — account security truth and cache scope

Rendered-component tests reproduced an unscoped account-security cache showing
the previous account's session count. Another failing test showed a failed
lookup displaying “Only this session is active.” These are frontend state and
truthfulness defects, not evidence of backend cross-account authorization.

Security query keys now include account ID and opaque connection identity; no
credentials or email addresses appear in the key. The form/mutation-state owner
is also keyed to that scope. Unknown, failed, stale-after-failure or malformed
session counts are not reported as a single active session. A Retry security
check action is available, and session revocation/account deletion remain
disabled until status is verified. Server authorization is unchanged.

Six regressions cover cross-account cached counts, lookup failures, confirmed
counts, connection/key identity, stale failed refresh and malformed counts.
Full frontend: **1,225 pass / 7,698 assertions**. Typecheck/build pass (existing
large-chunk warnings). Impeccable hardening preserved the established layout.
This pass used actual component server rendering and controlled query state,
not browser interaction, real passwords or account mutations.
