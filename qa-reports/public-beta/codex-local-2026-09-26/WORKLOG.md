# Codex local delivery and rolling tech-team handoff

## Scope

User asked Codex to execute the local delivery plan while the tech team handles
production work. Started 26 September 2026, approximately 16:05 UTC. Solo work.
No push, merge, deployment, production settings/secrets, signup changes, paid
resource creation, auth bypass or wallet signing in this work block.

Checkout: `/Users/abhinavramesh/Documents/Matterhorn-work/matterhorn-post1011-mcp-runtime`.
Branch: `codex/beta-launch-readiness-2026-09-25`.
Starting HEAD: `8f22f324b4b8d5b93f9163d96fb70ac8dbee0c4f`.
Preserve unrelated untracked files. Existing handoff edits from the preceding
turn belong to this task and are retained.

## Ordered queue

1. Reconcile local source against production's reported revision, without
   confusing version metadata with independently verified deployed artifacts.
2. Cover all-five-desk provisioning/gateway recovery and approval boundaries.
   Fix reproducible defects; do not invent a replacement hosted approval policy.
3. Expand ordinary-account runtime, data-isolation and failure-path coverage.
4. Run targeted and full relevant regression checks; prepare reviewable local
   commits and report exact outcomes to the team.
5. Run authenticated real-provider/hosted acceptance only after designated test
   sessions, intended policy and test allowance are available. Fixture acceptance
   is not live-model acceptance.

## Release reconciliation

- Canonical production: `https://desks.matterhorn.so`, not canary.
- Last read-only production check was 26 September at 01:45 UTC: public signup
  open, launch/email/reset/backup health green. Not repeated in this local block.
- Reported web/API SHA: `787d85bb830ff859a185d3bcd1a20c493dd008d4`, which is an
  ancestor of local merged base `084880d7aad8321bd8b3a09104b5ac7cf9dff037`.
  There are 31 commits in that graph range, including merges (not 31 distinct
  missing fixes). It includes PRs #1017, #1019–#1025. The local branch then adds
  13 implementation commits and the overnight documentation commit.
- This proves Git ancestry only. Team must confirm source/image/deployment
  identity to determine whether the production metadata is stale.
- Fetched `origin/dev` read-only during this block: it still resolves to
  `084880d7aad8321bd8b3a09104b5ac7cf9dff037`. Starting local HEAD is 14 commits
  ahead and zero behind it (13 implementation + one documentation commit).
  No merge/rebase or remote write performed. Other team branches are not
  inferred from this check.

## Completed local work

Code/test commit: `314ccd6620e3022ad7e8cd00d51404a1871476fb`
(`fix(agents): reject missing permission policies before approval`). Local only.

### Five-desk gateway recovery matrix

- Extended the existing mock runtime to include Hyperliquid and Polymarket and
  controllable missing-agent / missing-permission conditions for all five desks.
- Added ten tests: reject unavailable agent or absent permission policy without
  dispatch, no usage charge/reservation, retry with the same request ID after
  repair, selected agent/directory preserved, repeated acknowledgement does not
  dispatch twice.
- Uses local loopback runtime fixtures and a client bearer; not an ordinary
  hosted account, live provider, live chain or completed response.
- First run failed because the new test expected the wrong usage JSON field
  shape. Corrected the assertion to the existing `status.*Tokens` contract; this
  was a test-authoring error, not a reproduced application bug.
- Corrected matrix: **10 pass / 110 assertions**. This confirmed existing safe
  retry/usage behavior; no backend change was necessary for those ten cases.

### Reproduced defect: unusable desk waits for host approval

- Added five manual-mode cases with an agent present but its permission policy
  absent. All five failed before correction: expected setup status 503, received
  approval timeout 403. The runtime policy was checked only after host approval.
- Moved the existing nonempty-policy check into authoritative agent-context
  resolution, before privacy preflight/host approval/reservation. It is still
  invoked again immediately before dispatch; no new permission or approval
  policy, fallback agent, or production setting was introduced.
- Added preflight assertions for every desk and two late-change tests: agent
  removal or permission removal while waiting for approval. Both reject after
  approval with no dispatch and no stranded charge/hold.
- UI reproduced an unhelpful error (including `[object Object]` for direct API
  objects). Added explicit permission-setup copy, owner recovery guidance and no
  ineffective Retry action. Plain, serialized and server-client errors tested.
- Render tests confirm accessible alert/dismiss semantics, draft guidance and
  no raw error code. No layout/style changes. Impeccable hardening and Uncodixfy
  used; detector: zero primary findings, 33 existing typography advisories,
  outside the edited error mapping. Fresh browser/device visual acceptance was
  not performed for this copy-only change.

### Validation

- Full backend: **1,751 pass / 11,658 assertions / 179 files**.
- Full frontend: **1,228 pass / 7,732 assertions / 179 files**.
- Server typecheck passes. App typecheck/build pass, including the final repeat
  after the complete UI mapping. Existing >500KB chunk warnings remain.
- Full ten-stage safety gate passed, including the final repeat with the complete
  backend and UI changes (`/private/tmp/matterhorn-20260926-local-final-safety.log`).
- Source secret scan: **1,206 files, zero findings** (normal scanner exclusions
  apply). Diff whitespace check passes.
- Reproduction logs: `/private/tmp/matterhorn-20260926-agent-policy-before.log`
  and `/private/tmp/matterhorn-20260926-agent-policy-ui-before.log`.
- Full logs: `/private/tmp/matterhorn-20260926-local-{backend,frontend}.log`.
  These logs are temporary; this record preserves outcomes and scope.

## Fresh pre-handoff QA — 26 September, approximately 16:30–16:38 UTC

User requested thorough QA before updating handoffs. Reviewed clean tracked
source at `2709d06022fd04ad960ed8611cbbdf131b87dd26`; no application-code edits.
Detailed outcomes and limits: [QA-REVIEW.md](./QA-REVIEW.md).

- Backend 1,751 / frontend 1,228 tests pass; full ten-stage safety gate passes.
  App/server typechecks/builds, desktop typecheck/50-method bridge, host and
  tenant recovery, verified-upload and restore/container fixtures pass.
- Five pinned-runtime scenarios pass: lost-ack retry, Stop/recovery, denied
  writes, direct outside-root reads, symlink-outside reads. Every run exercises
  all five agents with synthetic inference; settled charges match usage and
  final holds are zero. Not live-provider/hosted evidence.
- Node/Bun socket probes both cancelled pending approval without dispatch.
  Source scan 1,206 files/zero findings; diff check clean.
- Browser notes/draft failure and race recovery pass with disposable synthetic
  state. Mobile override was ineffective (actual viewport still 1280px), so
  mobile acceptance remains outstanding. Only in-app browser is available.
- Production rechecked read-only at 16:32:15 UTC: 29 checks pass; signup open,
  launch ready; web/API still report `787d85bb830ff859a185d3bcd1a20c493dd008d4`.
  Strict comparison used this previously reported SHA, not the candidate.
- **Live P1 reproduced:** Security → Back to app shows Support at `/session`;
  reload restores sign-in. Local fix `36c935283a01454df90f2f960e3d5ff4a4a688b8`
  is present and its freshly built navigation reaches normal app onboarding.
  Team must reconcile/release assets and verify all three app exits.
- Reviewed handoff after QA: updated stale test counts, implementation identity,
  current production timestamp, self-contained team prompt and remaining gates.
  Historical overnight report remains historical; only its superseding pointer
  is updated. No push/merge/deployment or production changes.

## Next local milestone

Final checks and the code commit are complete; the handoff delta is recorded
locally and fresh QA is recorded above. Next expand ordinary-account gateway tests (current new matrix
uses a client bearer, not a hosted user), and run actual-provider tests only
with approved test access/allowance. Production approval-policy redesign remains
a decision dependency, not permission to bypass the current host queue.

## Rolling team handoff / required inputs

The self-contained starting handoff is
`docs/handoffs/production-go-live-team-handoff-2026-09-26.md`.

| Team input/action | Why it is needed | Current status |
| --- | --- | --- |
| Verified deployed source SHA, image/deployment IDs and intended PR target | Reconcile actual release and avoid duplicate changes | Awaiting team |
| Files/branches team is editing | Avoid conflicts while working in parallel | Awaiting team |
| Effective production approval mode and intended hosted policy | Source defaults manual and host queue is privileged; no global bypass | Awaiting team |
| Two ordinary verified accounts, controlled inboxes and secure browser access | Live five-desk, reset and cross-account acceptance | Awaiting team |
| Approved bounded model-testing allowance | Real provider tests incur usage | Awaiting team |
| Restore/monitoring/rollback/shadow evidence | Operational release sign-off is not supplied by local fixtures | Team-owned |

Do not send passwords, cookies, provider keys or reset links in the report.
Working on independent local checks while these inputs are pending.

### Team delta from this block

The new code correction is setup-error ordering, not a solution to the hosted
host-only approval workflow. Verify that the deployed runtime advertises each
agent's nonempty permission policy. A missing policy must now fail before asking
for approval, and restoring it permits a safe same-request retry. No schema,
environment-variable or dependency update is required for this patch. Review
the shared agent-context helper because the early validation also covers
preflight and compaction paths. All tests are local; do not mark hosted launch
acceptance complete from this handoff.
