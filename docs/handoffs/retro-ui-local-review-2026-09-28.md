# Matterhorn retro UI — local delivery and release handoff

## Decision

**Ready for code/visual review; not approved for hosted rollout.** The retro UI
is implemented behind one default-off build flag. The independent Impeccable
reviewer scored all four requested corrections resolved. That verdict is limited
to those fixes and the declared local component evidence, not every product page
or live desk execution.

Nothing was pushed, merged, deployed or enabled in production. No account or
provider credentials were read, no real vault entries migrated, no authentication
or consent bypassed, and no wallet transaction signed. Existing unrelated files
were left untouched. STM remains separately default-off.

## Repository and exact implementation revision

- Repository: `matterhornso/matterhorn-work`.
- Local branch: `codex/retro-ui-2026-09-28`.
- Base `dev`: `ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`.
- Reviewed application implementation:
  `515c634319f71c0c698618f914744c00232da075`.
- Later delivery commits may update QA isolation/evidence/handoff only. Check the
  branch log, not an assumed GitHub or deployed revision. This branch is local.

Implementation commits, oldest first:

| Commit | Scope |
| --- | --- |
| `edbec86b6717bd30768cdf57a00fa729e9a66ac0` | Opt-in tokens, primitives and control regressions |
| `9516afd67ddfbd86df19918073aaeacce24259e2` | Core surfaces and model-selection recovery |
| `fbc4135f8e02f81800684d94f5fd950b6c572b22` | Workspace tools and public pages |
| `6f10bd7a8d357b4f75638181fb9894be41d706c4` | Wallet review, integrations and auth outage handling |
| `b3f986339794f7ae53ad9bd710eb1639baa1fec0` | Desk/composer evidence and accessible controls |
| `c90355e298ac1aa4cde2f0292b78667268a8aece` | Settings semantics and enlarged-text reflow |
| `515c634319f71c0c698618f914744c00232da075` | Model picker, independent corrections and design documentation |

## What changed

The existing Matterhorn identity is retained: logo, protocol marks and font
assets. The replacement visual system uses paper/charcoal surfaces, ink outlines,
small corners, hard offset shadows, violet actions and ice selected states.
It reuses the existing React/Base UI components, routing and data stores. No
dependency replacement or database migration is part of this branch.

Shared hooks cover navigation, five-desk launcher, composer/messages, model
settings and picker, settings groups, public/auth pages, wallet review, Memory,
Notes and integrations. The coverage ledger distinguishes representative checks
from untouched or unverified states; a shared style is not proof every action works.

Bounded defects corrected alongside the styling:

- Model selection can return to its pending task after persistence.
- Auth recovery remains disabled during account-service outage/checking.
- Mobile navigation has a visible close control and restores trigger focus.
- Settings layout forwards accessibility attributes.
- Enlarged-text settings/wallet/integration controls wrap instead of overflowing.
- Explicitly disabled chat models cannot be selected; selected/expanded states
  are exposed to assistive technology.
- Dark selected-model text uses a coherent high-contrast foreground/background.

## Flag and rollback

`VITE_MATTERHORN_RETRO_UI=1` enables retro and the existing desk-first minimal
layout. The exact value `true` also works. Omitted/`0` leaves retro off.
`VITE_MATTERHORN_MINIMAL_UI` is a pre-existing independent layout flag; keep its
current value during rollback unless intentionally changing that layout too.

This is a **build-time** flag: changing an environment variable without rebuilding
does not change the served JavaScript. Rollback is a rebuild of the same approved
revision with retro off, or restoration of the prior artifact. It does not delete
chats, drafts, model selections or preferences. Do not enable STM as part of this.

## Verified evidence

| Check | Result / limitation |
| --- | --- |
| Frontend regressions, flag on | 1,234 pass; 7,782 assertions |
| Frontend regressions, flag off | 1,234 pass; 7,781 assertions |
| Typecheck | Pass |
| Default and public-web builds, flag on/off | All four pass; artifact assertions pass; existing large-chunk warnings remain; not native packaging |
| Chromium / Firefox / Playwright WebKit | Each 16 pass, 116 assertions, 1 optional capture test skipped; includes local dist comparison |
| Composer + STM capture suites | 15 pass, 125 assertions; synthetic only |
| Full repository safety gate | All 10 offline/fixture stages pass; not hosted acceptance |
| QA isolation guard | 3 tests pass; local env files are refused before tools start and are left intact |
| Visual evidence | 112 captures produced; 18 representative files inspected; two build-thread rounds plus one reviewer correction batch |
| Accessibility | Keyboard/focus/dialog dismissal, explicit selection, disabled/busy states, reduced-motion CSS and 200% root-text reflow checked |
| Font fidelity | Auth fixture matches lightweight production entry; public Security loads both bundled Variable faces in fixture and local dist |

Canonical evidence:

- `qa-reports/retro-ui/2026-09-28/WORKLOG.md`: dated commands, failures, corrections,
  exact log paths and final build-mode outcomes.
- `COVERAGE.md`: per-surface implementation and acceptance limits.
- `FINISH-REVIEW.md` and `FINISH-VERDICT.md`: independent findings and scored fixes.
- `font-proof.txt`: recorded local distribution/fixture and first-paint proof.
- `BUILD-MATRIX.md`: default/public-web flag-on/off artifacts and exact logs.
- Full safety log: `/private/tmp/matterhorn-retro-qa-garMUt/safety-full-1.log`.
- `.impeccable/review/retro-2026-09-28/`:18 committed synthetic screenshots.
- `DESIGN.md` and `.impeccable/design.json`: actual scoped tokens and component rules.

## Local preview / reproducibility

Follow `qa-reports/retro-ui/2026-09-28/PREVIEW.md`. Use pinned pnpm/Bun and the
isolated `run-check.mjs` runner; stages must run sequentially because prebuilds
share generated package output. It uses disposable HOME/XDG directories and
refuses local env files without reading their contents. Browser fixtures use
synthetic in-memory data and block remote calls where applicable.

The public preview is a random-port loopback server built from production frontend
assets. It deliberately has no backend, rejects writes and blocks remote
connections. It is **not a test login**, and unavailable auth there is intentional.
The current temporary URL/process is recorded in WORKLOG; restart if it expires.

## Remaining release gates — operator/team actions

Do not treat the visual verdict as permission to publish. Obtain publishing and
staging/deployment approval separately; the overnight task forbids those actions.

1. Review the complete branch diff against the stated base, then publish a PR
   targeting `dev` when authorized. If `dev` moved, reconcile without overwriting
   unrelated changes and rerun affected tests/CI against the exact resulting SHA.
2. Provision an approved staging environment with normal verified test accounts
   and a working provider/agent backend. Keep secrets server-side; do not put
   credentials into screenshots, browser fixture source, public bundles or PRs.
3. With retro on, complete model selection → all five desks → real response in
   Private AI, Bittensor, Hyperliquid, Polymarket and Sui. Crypto desks must also
   return a read-only live result with source/freshness. Confirm server readiness,
   not wallet-support labels. Record request IDs and sanitized evidence.
4. Verify full authenticated routing/history, existing conversations and drafts
   across model changes, desk changes, reloads, cancellation, offline recovery,
   expired sessions and safe retry. Check streamed/tool-result/error content,
   not only empty-state fixtures. No real-fund signing is needed for UI acceptance.
5. Complete account/workspace settings, saved Memory/provenance/deletion, Notes,
   integrations and permission-denied routes with real test data. Recheck two-user
   isolation and approval/token-accounting behavior on that exact backend release.
6. Validate actual 200% browser zoom, screen-reader behavior and installed Safari
   and native desktop/overlay. Playwright WebKit and 200% root text enlargement
   are useful but not substitutes. Recheck 390px, tablet, desktop and actual preview
   width with production fonts and full shell. Correct material defects through
   a new bounded review; do not silently extend this verdict.
7. Verify signup/verification/recovery delivery, backup/restore readiness and
   hosted release identity using the existing operational runbooks. This redesign
   neither changes nor certifies those services. Rerun the full platform safety
   gate and required release CI against the exact approved rollout SHA before
   enabling the flag for users; the local gate already passes on this branch.
8. After explicit rollout approval, deploy matching frontend/backend artifacts,
   record exact SHA/build identifiers, enable only the approved UI flag, smoke-test
   the hosted domain, and keep the prior artifact available for rollback.

## Reviewer/tech-team prompt

Review local branch `codex/retro-ui-2026-09-28` against
`ad5b7298a1c53b4aff70ad9fd5b254ecaf4385ca`; application changes are reviewed through
`515c634319f71c0c698618f914744c00232da075`. Read this handoff and the dated QA ledger.
This branch adds a default-off retro UI, not new backend capabilities. Preserve
Matterhorn identity, user data, server readiness, consent, approvals, signing and
token accounting. Do not enable STM. Verify the documented tests/CI and complete
all eight remaining gates above in an approved environment. Keep synthetic,
local-distribution and hosted evidence separate. Report failures as blockers,
not passes. Publish/merge/deploy only with explicit approval, recording exact
revisions and rollback artifacts. Do not fetch or expose secrets merely to review
the branch, and do not infer launch readiness from the styling or wallet labels.
