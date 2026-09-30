# Matterhorn retro release deployment handoff

Prepared on 30 September 2026 for the engineer deploying **https://desks.matterhorn.so**.
Publication update: the pending commits below are included in the combined
`codex/jev-chat-opt-in-2026-09-30` PR to `dev`. Do not create a duplicate retro-only
PR using the historical publishing commands below. Also review the
[Jev handoff](jev-chat-opt-in-2026-09-30.md); Jev remains disabled until separately
configured, consented and accepted in staging.
Deploy the security correction and enabled retro UI described here, not PR #1028 alone.
Local checks pass, but fresh-install CI, production deployment and authenticated hosted
acceptance remain release gates. No production settings, secrets or services were changed.

## Exact source and scope

- Repository: https://github.com/matterhornso/matterhorn-work
- Base: PR #1028, merged into `dev` as `9b74d923b8c999733fe698c29a6555dd2980460b`.
- Follow-up branch: `codex/retro-release-security-2026-09-30`.
- Implementation commit: `1a7f19ac7ab86f9a48f8828b4900e75cfc9a09fb`.
- This handoff is a subsequent documentation commit. Deploy the reviewed merge of
  this branch, record its full SHA and require both PR and merge CI to pass.
- At handoff preparation the follow-up is local, not merged. Do not assume that
  pulling `dev` includes it. Publish/review it first using the instructions below.

The patch pins `brace-expansion` to **5.0.12**, `engine.io` to **6.6.10**, and
`fast-uri` to **3.1.8**. Both override locations agree for these dependencies; the
legacy brace-expansion 2.x override is also raised to **2.1.7** defensively, though
the current lockfile resolves the 5.x package. Unrelated peer-resolution and
optional-package changes were removed. Audit thresholds and suppressions are unchanged.

The findings were three high and two moderate advisories:
[nested braces](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
[comma parsing](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p),
[brace rewrite CPU usage](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[Engine.IO protocol mismatch](https://github.com/advisories/GHSA-2gc4-cqfq-p2gv), and
[URI host normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj).

Retro is now the default for new builds, including the public sign-in first paint,
main app and desktop entry. It uses the existing five-desk, one-sidebar layout.
The existing Settings → Appearance controls provide **System, Light and Dark**:
System remains the first-use preference, existing selections persist, and startup
now reads the same preference keys as the app. Clicking the active choice no longer
sets an invalid value. The Settings sidebar now follows the selected theme instead
of retaining a fixed dark background with unreadable Light-mode navigation.

No database migration, provider replacement, new billing flow, wallet signing,
signup change, auth bypass or STM activation is included. Keep STM disabled.

## Obtain and review the source

From the source checkout on the build machine, publish the branch if it is not yet
available on GitHub:

```sh
git push -u origin codex/retro-release-security-2026-09-30
gh pr create --base dev --head codex/retro-release-security-2026-09-30 \
  --title "Patch release advisories and enable themed retro UI" \
  --body-file docs/handoffs/retro-security-deployment-2026-09-30.md
```

If receiving the accompanying Git bundle instead, work in a normal clone of the
repository that already contains the base merge, then import the supplied branch:

```sh
git fetch origin dev
git bundle verify /absolute/path/to/matterhorn-retro-release-2026-09-30.bundle
git fetch /absolute/path/to/matterhorn-retro-release-2026-09-30.bundle \
  refs/heads/codex/retro-release-security-2026-09-30:refs/heads/codex/retro-release-security-2026-09-30
git switch codex/retro-release-security-2026-09-30
git merge-base --is-ancestor 1a7f19ac7ab86f9a48f8828b4900e75cfc9a09fb HEAD
```

Review the actual diff and new dependency smoke test. Require all applicable CI
checks for the exact head, merge through the normal protected-branch process, then
recheck the merge commit. Never suppress the audit or use an admin bypass because
the earlier PR passed: its post-merge audit exposed these five findings.

## Local verification and limits

| Check | Result |
| --- | --- |
| Complete lockfile advisory audit | 1,457 versions, zero low-or-higher findings at check time |
| Frozen lockfile resolution | Passed with pnpm 10.27.0 |
| Fresh isolated patched-package smoke | 4 passed: pins/lock, glob expansion, encoded-host normalization, Engine.IO allowed/rejected polling |
| Frontend default retro layout | 1,248 passed |
| Frontend explicit legacy rollback | 1,248 passed |
| Browser fixtures in Chromium, Firefox and WebKit | Each 18 passed, 2 optional screenshot tests skipped |
| Frontend typecheck and public web build | Passed; existing large-chunk warnings remain |
| Full platform safety gate | Passed on final rerun |
| Security workflow contract and tracked release secret scan | Passed; no findings |
| Authenticated local appearance UI | Light/dark at 1280×720 and 390×844; reload persistence; no page overflow; System restored |

The initial sandboxed frontend run could not bind two loopback test servers; the
rerun with loopback access passed. The first browser setup timed out while the app
was building; the isolated rerun passed. One Hyperliquid CLI stage initially failed;
its direct offline test and the subsequent full gate passed with the explicit Bun
binary. No safety assertion was weakened to obtain these results.

The three patched packages were freshly installed into a disposable directory and
tested there. The full workspace's running previews retain their existing installed
packages; frontend/build checks used those packages. Fresh-install CI on the final
branch is therefore mandatory. WebKit fixture coverage is not certification of an
installed Safari or packaged Electron application. Actual inbox delivery, restored
backups, production two-account isolation and hosted five-desk responses are not
certified by this local run.

The preceding release's real-provider evidence is in
[the five-desk acceptance report](../../qa-reports/retro-ui/2026-09-29/runtime-acceptance/RESULTS.md)
and [runtime handoff](retro-runtime-release-2026-09-30.md). It includes real ASI1
responses and read-only crypto tools through an enforced isolated app. A subsequent
ASI1 Mini request completed successfully; its isolated ledger reconciled with zero
pending holds. This is local evidence, not proof of permanent provider capacity or
hosted readiness. Do not silently substitute another model if Mini is throttled.

Reproduce on a clean checkout with Node 22, pnpm 10.27.0 and Bun 1.3.11:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter matterhorn-work-server rebuild better-sqlite3 --pending
pnpm --filter @matterhorn-work/crypto-app-sdk build
pnpm audit:dependencies
pnpm test:release-dependency-patches
pnpm test:security-workflow-contract
bun test apps/app/tests
VITE_MATTERHORN_RETRO_UI=0 bun test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm test:matterhorn-platform-safety
pnpm release:secret-scan
```

The browser fixture command is `bun test apps/app/scripts/retro-controls.browser.test.ts`.
Repeat with `RETRO_QA_BROWSER=firefox` and `RETRO_QA_BROWSER=webkit` when the test
engines are installed. Record a missing engine as unverified, not passed.

## Confirm the real production targets

The canonical domain is **desks.matterhorn.so**, not
`matterhorn-desks-canary.vercel.app`. The last read-only hosted inspection reported
web/API SHA `787d85bb830ff859a185d3bcd1a20c493dd008d4`, guarded runtime mode `off`,
open signup with verification/legal acceptance, and green health flags. These are
historical diagnostics; inspect again before cutover. Green flags are not proof of
mail delivery, a successful restore or working agents.

Identify and record the actual Railway project, environment, web, API/managed-runtime
and Bittensor sidecar service IDs. Confirm domain routing and repository/build source
for each. The account visible during development contained an older `control-plane`
service without a custom domain and an old Vercel canary; neither was established as
the canonical deployment. Do not deploy to those merely because they are accessible.

Before replacement, record each immutable rollback deployment and image digest.
Verify a recent application-consistent backup and restore it to an isolated target;
record restored account/workspace integrity without exposing data. Preserve persistent
volumes and the supported single-writer database topology. Drain active runs before
restarting the API/managed runtime so requests and token holds are not abandoned.

## Build configuration

Use the same reviewed source revision for the web, API/runtime and sidecar. Build
fresh images from the lockfile; do not upload the developer's existing `node_modules`
or local preview data. The release source includes prior guard-plugin and Bittensor
cache repairs, so deploying only frontend assets is insufficient if production is
still on the older release.

| Target | Configuration |
| --- | --- |
| Railway web | `packaging/docker/railway.web.json`, using `packaging/docker/Dockerfile.public-beta-web` |
| Web source attestation | Build argument `VITE_MATTERHORN_BUILD_COMMIT` = exact deployed 40-character SHA |
| Retro activation | Build argument `VITE_MATTERHORN_RETRO_UI=1`; remove any old explicit `0` override |
| API source attestation | Runtime `MATTERHORN_BUILD_COMMIT` = the same actual source SHA |
| API/runtime image | Existing canonical configuration; repository public-beta image is `packaging/docker/Dockerfile.public-beta` |
| Web API proxy | Preserve the correct `MATTERHORN_CONTROL_PLANE_URL` and securely configured `MATTERHORN_PROXY_SECRET` |
| Bittensor | Use its existing approved service/build topology; include `subnet-cache.mjs` and the pinned Python dependencies |

Retro is a **build-time** choice: changing an environment variable after serving
static assets does not activate or disable it. The Dockerfile exposes an ARG/ENV
pair so the build can receive the choice. For an explicit local image build, from
the clean reviewed checkout:

```sh
RELEASE_SHA=$(git rev-parse HEAD)
docker build -f packaging/docker/Dockerfile.public-beta-web \
  --build-arg VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" \
  --build-arg VITE_MATTERHORN_RETRO_UI=1 \
  -t "matterhorn-web:$RELEASE_SHA" .
```

Configure the equivalent build arguments in the canonical deployment service.
Do not fake source markers on an older image. Verify artifact contents as well as
the markers. Preserve existing managed-provider credentials, verified provider policy,
email/reset/legal configuration, allowed origins, persistent storage and backup settings.
Never place secrets in `VITE_*`, source control, build logs or a public handoff.

Do not silently change guarded-runtime mode. Check the actual mode and its rollout
requirements. Enforced operation requires matching runtime/capability credentials
(`MATTERHORN_AGENT_RUNTIME_SECRET` and `MATTERHORN_CAPABILITY_SIGNING_SECRET`) and the
compatible guard plugin. Missing credentials or unavailable agents are blockers,
not a reason to turn off authorization, consent or account isolation. Keep STM off.

## Deployment sequence

1. Confirm green final-head and merge CI, verified targets, rollback images and
   restore evidence. Record the exact release SHA.
2. Deploy the compatible Bittensor service and API/managed runtime from that revision.
   Verify service-to-service authentication, provider connectivity, agent provisioning
   and live-chain readiness without signing or changing real funds.
3. Deploy the web image with retro enabled. Confirm it proxies to the intended API
   and the canonical domain serves this image. Preserve secure same-origin cookies.
4. Inspect `/health/live`, `/health/ready`, `/health/launch` and `/api/auth/config`.
   Check the HTML `matterhorn-build-commit` meta tag and API
   `X-Matterhorn-Build-Commit` header against the recorded release. Inspect logs without
   exporting credentials or private prompts.
5. Complete the hosted acceptance below before announcing public beta. A successful
   deployment job alone does not satisfy the launch gate.

## Hosted acceptance checklist

Use ordinary verified accounts, never host/admin tokens to stand in for a customer.

- Create an account through the real public flow; receive verification in a real
  inbox; sign in, sign out and recover the account through password reset. Verify
  old reset links cannot be reused. Do not bypass legal acceptance or verification.
- Select a chat-compatible model, reload and confirm persistence. Open all five
  desks in one action without a Home flash. Save a draft and verify navigation,
  model changes, Stop, failure and safe retry retain it without duplicate sends.
- Private AI: obtain a real answer using the selected provider/model.
- Bittensor: request a live subnet read; record chain block/fetch time and source.
  Warming or stale results must remain labelled and do not count as a live pass.
- Hyperliquid: read a current orderbook/funding value with source/freshness.
- Polymarket: read a current market/liquidity result with source/freshness.
- Sui: read a public account/object/checkpoint with source/freshness.
- For each run, record final status, model, session/run reference, receipt and tool
  evidence. Reconcile provider usage including cache with charged usage. Require
  no stuck pending holds or duplicate settlement after Stop/retry.
- With two disposable hosted accounts, verify chats, memory, notes, files and
  integration configuration cannot be read or changed across account boundaries.
- Check memory only enters context after explicit confirmation; failed saves remain
  visible. Exercise supported integrations without granting unintended permissions.
- In Settings → Appearance, check Light, Dark and System, reload persistence, sidebar
  legibility, model picker, transcript, composer, tools and public pages. Test narrow
  Codex preview, 390px mobile, tablet and desktop, keyboard and 200% zoom.
- Confirm Security → Back to app returns to the application rather than Support.
- Verify offline, provider unavailable/429, expired-session, denied-permission and
  missing-agent recovery. Do not hide failures with mock data or provider substitution.
- Independently record the backup restore result and operational monitoring/owner.
  No wallet signing, real trades or real-fund transfers are required for this gate.

## Rollback

For a visual-only issue, rebuild this **security-patched source** with
`VITE_MATTERHORN_RETRO_UI=0`. Set `VITE_MATTERHORN_MINIMAL_UI=1` to retain desk-first
navigation, or explicitly `0` to restore the legacy shell. This does not migrate or
delete chats, drafts, model selections or theme preferences. Avoid reverting to a
known vulnerable image merely to change appearance.

For a serious runtime regression, stop cutover, drain requests and use the previously
recorded compatible API/sidecar/web rollback set. Preserve volumes and investigate
any in-flight accounting holds. Do not reset customer data, restore a database over
new writes without an incident plan, or disable authorization to keep the app online.

## Return evidence

Send the owner the PR URL, merge SHA, final CI links, canonical project/service IDs,
deployed source SHAs and image/deployment IDs; public URL; dated hosted acceptance
matrix; run/receipt references and usage reconciliation; real email/reset and restore
results; rollback IDs; and any failed or unverified checks with an owner. Keep the
evidence private where it contains customer information. Never include API keys,
passwords, cookies, database copies or raw private prompts in the report.
