# Pre-handoff QA review — 26 September 2026

## Verdict and scope

Local regression candidate: **PASS within the tested scope**. Production launch:
**NOT SIGNED OFF**. Production health is green, but a browser navigation defect
was reproduced and authenticated/operational acceptance is incomplete.

Reviewed source: `2709d06022fd04ad960ed8611cbbdf131b87dd26`, branch
`codex/beta-launch-readiness-2026-09-25`. Its latest application change is
`314ccd6620e3022ad7e8cd00d51404a1871476fb`; the later commit is documentation.
QA completed before updating the handoffs, approximately 16:30–16:38 UTC.
No application code changed during this review. No push, merge, deployment,
production configuration change, account creation, paid external inference,
credential disclosure or wallet signing occurred. Tests used disposable local
data. Existing user tabs/drafts were not changed.

This is broad regression QA of the local candidate, not a claim to have manually
tested every platform button or every production integration. Passing acceptance
**verifier tests** does not mean the production evidence they validate exists.

## Fresh automated results

| Command | Result | Evidence scope |
| --- | --- | --- |
| `pnpm --dir apps/server test` | 1,751 pass, 0 fail; 11,658 assertions, 179 files | Local backend unit/integration fixtures |
| `pnpm --dir apps/app test` | 1,228 pass, 0 fail; 7,732 assertions, 179 files | Local frontend behavior/render/contracts |
| `pnpm test:matterhorn-platform-safety` | All ten stages pass | Wallet/approval, money-path security, desk offline matrix, billing, router, runtime/Electron, error handling, release/operations contracts |
| `pnpm --dir apps/server typecheck` and `build` | Pass | Source/build verification |
| `pnpm --dir apps/app typecheck` and `build` | Pass; large-chunk warnings | Source/build verification |
| `pnpm --dir apps/desktop typecheck:electron` and `check:electron` | Pass; bridge covers 50 renderer methods | Not packaged/signed desktop acceptance |
| `pnpm test:matterhorn-host-recovery` | Pass, including all 7 verified-upload tests | Disposable SQLite/erasure ledger + loopback AWS SDK fixture; no production S3 restore |
| `pnpm test:workspace-user-data-recovery` | Pass | Archive validation/encryption contract, not application import |
| `pnpm test:public-beta-container-contract` | Pass | Container/backup flag contract fixtures |
| `node --test scripts/workspace-backup-restore-drill.test.mjs` | Pass | Disposable restore evidence fixture |
| `node scripts/matterhorn-approval-disconnect-probe.mjs` | Pass: cancelled, zero dispatch | Actual Node socket disconnect after POST body |
| `pnpm exec bun scripts/matterhorn-approval-disconnect-probe.mjs` | Pass: cancelled, zero dispatch | Actual Bun socket disconnect after POST body |
| `pnpm release:secret-scan` | 1,206 source files; zero findings; zero oversized skips | Scanner exclusions still apply; not a whole-disk/history secret audit |
| `git diff --check` | Pass | No tracked application edits |

Logs: `/private/tmp/matterhorn-review-20260926-*.log`. These temporary logs are
not durable release artifacts; this report preserves the results and limitations.

### Real pinned runtime, synthetic provider

Each scenario ran the real local gateway, pinned OpenCode and guard plugin in
enforce mode, with a synthetic loopback provider and all five agents:
Private AI (`matterhorn`), Bittensor, Hyperliquid, Polymarket and Sui.
No external provider or chain call was made. Local fixture approval policy is
not evidence for the hosted ordinary-user approval journey.

Command prefix:

```sh
MATTERHORN_QA_OPENCODE_BIN=/private/tmp/matterhorn-overnight-runtime.ddJMOU/bin/opencode \
  pnpm exec bun scripts/matterhorn-runtime-regression-probe.ts --guarded-enforce
```

Append each scenario's flags in a separate run. The executable path is local;
other machines must use the official, checksum-verified pinned artifact required
by the script, not an arbitrary runtime.

| Flags | Observed result |
| --- | --- |
| `--lost-ack --retry-after-lost-ack` | Five completed answers; one provider call per desk despite 16 total prompt POST attempts. Fresh retry added zero inference/messages. Used = charged = 5,000; pending = 0. |
| `--abort-in-flight` | Stop returned 200, provider disconnected, pending 1 → 0, recovery answer completed. Used = charged = 6,000; final pending = 0. |
| `--denied-write-tool` | Write tool not advertised; attempted call failed; no file created. Used = charged = 7,000; pending = 0. |
| `--read-outside-root` | Read failed with “Path is outside the authorized workspace”; no outside content reached provider. Used = charged = 7,000; pending = 0. |
| `--read-symlink-outside` | Canonical target outside workspace denied; no outside content reached provider. Used = charged = 7,000; pending = 0. |

Every run also rejected credential-shaped input before inference (422) and raw
runtime calls without a bound gateway run before inference (binding 409). Raw
runtime's outward error remains a generic 500; this negative control is not a
successful user request. Cancellation reported `partialTextPersisted:false`:
partial-stream retention was **not** demonstrated. Every fixture needed its
forced runtime-stop fallback during cleanup; generated fixture data was removed.
Graceful runtime shutdown is therefore still not demonstrated.

## Fresh browser QA

Browser: Codex in-app browser. Only this browser was exposed by inventory.

| Surface | Actions and result |
| --- | --- |
| Production account access | Sign-in form loaded; Create account exposed the 12-character guidance and unchecked legal consent; Forgot password opened reset form and Back returned to sign-in. No form submitted, consent accepted or CAPTCHA completed. |
| Production Security | **FAIL:** Security → Back to app changed URL to `/session` but title/heading became Support. Screenshot and accessibility tree confirmed it; reload restored sign-in. |
| Freshly built local UI | Security → Back to app left the standalone trust bootstrap and reached the normal `/welcome` app bootstrap, not Support. This preview has no authenticated backend; it is only navigation evidence. |
| Real NotesPage with synthetic API | Delayed workspace A response did not replace B. Sequential pending saves retained the second edit and settled to pending 0. Replacing the connection reset the editor/list to connection 2. Unavailable C showed a load error and Retry, not old notes or a false empty state. |
| Real composer with synthetic submission | Two synchronous sends created one request. Failed request retained its draft; retry succeeded. Typing a newer draft while the previous send was pending preserved that newer draft on completion. |

The composer newer-draft test used actual typing and checked the field before
completion. An initial accessibility `setValue` attempt did not establish a
controlled-editor change and is not counted as application failure or proof.
Notes fixture issued three serialized saves across this interaction (including
blur); final persisted text was the newer edit, not the older edit. No real notes
or accounts were read or changed.

Attempted 390×844 viewport override was accepted by the control API, but the
actual page still measured **1280px** and the screenshot was desktop. Override
was reset. Do **not** count that as mobile acceptance. The desktop public page
measured scrollWidth = viewport = 1280 (no horizontal page overflow there).
No current authenticated mobile/tablet, 200% zoom, native screen-reader,
Safari/Firefox, light/dark or complete keyboard traversal sign-off was obtained.
Local fixtures omit full application styling and cannot prove visual acceptance.

## Findings and priorities

### P1 — Production Back to app still shows Support

- Category: implementation/navigation integrity. Reproduction above.
- Impact: ordinary users returning from Security land on the wrong page and
  need a reload to regain account/app access.
- Local source already includes fix `36c935283a01454df90f2f960e3d5ff4a4a688b8`:
  `apps/app/src/react-app/domains/public/public-trust-route.tsx` uses
  `reloadDocument` on the brand, Open app and Back to app links. Contract test
  `apps/app/tests/public-trust-routes-contract.test.ts` passes; fresh local build
  navigation passed. Do not create a duplicate fix without reconciling artifacts.
- Owner: deployment team. Verify actual deployed frontend asset/source identity,
  reconcile the approved release, then retest all three exits without a manual
  reload. Report PASS only when the browser reaches the correct app/sign-in view.
- This behavior supports concern about release drift, but does not independently
  prove every deployed byte or backend version is old.

### P2 — Large frontend chunks remain

- Category: performance. Production build reports chunks over 500KB, including
  Bittensor wallet (~896KB), translations (~946KB), syntax highlighting (~1.85MB)
  before gzip. User impact can include slower first use of those features.
- These are emitted artifact sizes, not measured first-load transfer or Core Web
  Vitals. Profile which chunks actually load before deciding on lazy-load changes;
  do not suppress the warning and call performance fixed.
- Suggested follow-up: `$impeccable optimize`, then `$impeccable polish` after
  functional release gaps are closed.

### UI audit confidence

Impeccable detector ran once across session-surface, notes-page and public-trust-
route: **zero primary findings; 37 typography advisories** (33 session, 4 notes).
These existing size/token mismatches are not 37 confirmed accessibility defects.
No design files or runtime UI were rewritten as a side effect of the audit.

| Dimension | Score | Evidence limit |
| --- | --- | --- |
| Accessibility | Unrated | Alert/label/render tests pass; no full contrast/keyboard/screen-reader audit |
| Performance | Unrated | Build succeeds with measured chunk warnings, but no representative field timing |
| Responsive | Unrated | Desktop capture only; attempted mobile override ineffective |
| Theming | Unrated | No complete current light/dark comparison |
| Implementation integrity | Unrated platform-wide | Local recovery paths pass; reproduced hosted navigation failure |

No /20 health score is justified by this partial browser access. Positives:
controlled draft recovery, honest note failure UI, workspace/connection isolation,
labelled account controls and local corrected trust navigation. Re-run
`$impeccable audit` against the authenticated release after fixes; the focused
follow-ups can be run individually or together without redesigning the app.

## Fresh production read-only evidence

Canonical origin: `https://desks.matterhorn.so`. Probe completed
**2026-09-26 16:32:15 UTC**: **29 checks passed, zero failed**. Signup open;
launch readiness green; required verification/reset/legal/Turnstile available;
HTTPS/headers, same-origin routing, anonymous denial and CORS checks passed.
Web and API still report `787d85bb830ff859a185d3bcd1a20c493dd008d4`.

The strict probe explicitly compared against that **previously observed SHA**,
not the local candidate or an independently verified deployment artifact. Its
green result confirms continuity of public metadata/configuration only. It does
not prove these local fixes are deployed or that real inboxes/restores/desks work.
Sanitized full probe: [PRODUCTION-PROBE.json](./PRODUCTION-PROBE.json).

## Required before release sign-off

1. Reconcile immutable frontend/backend deployment records, exact source SHA and
   image digest; resolve production Back to app, then prove the candidate served.
2. Supply ordinary verified accounts A/B and controlled inbox access securely,
   intended hosted approval policy and bounded model-test allowance.
3. Complete real answers/live public reads on all five desks via the user UI;
   verify Stop/retry/approval/usage with zero stranded holds. HTTP 202 is not proof.
4. Complete hosted two-account data isolation, memory use/delete, files, notes,
   enabled integrations and expired-session/failure recovery.
5. Prove verification/reset inbox delivery/events and a production-shaped restore
   covering databases **and** memory/notes/files/configuration/deletion ledger.
6. Supply alert delivery, rollback, required exact-release 48-hour shadow evidence
   and unavailable browser/device acceptance. Existing team evidence may satisfy
   these gates after review; do not rebuild working infrastructure blindly.

Detailed ownership, commands and copy-paste assignment:
[production handoff](../../../docs/handoffs/production-go-live-team-handoff-2026-09-26.md).
The repository-relative handoff path is `docs/handoffs/production-go-live-team-handoff-2026-09-26.md`.
