# Matterhorn deployment owner handoff

This runbook is for the owner or technical release team deploying Matterhorn Desks to `https://desks.matterhorn.so`. Codex must not deploy under the owner's 5 October instruction. Code readiness, deployment and public launch are separate decisions: green CI does not establish working hosted accounts, models or recovery backups.

## Candidate and approval

Review [PR #1032](https://github.com/matterhornso/matterhorn-work/pull/1032), targeting `dev`. The one-hour follow-up fixes ordinary Account access when optional Cloud features are disabled and records the missing local provider configuration. Obtain the final pushed head and exact merge SHA from the PR, not a floating branch or an older SHA in historical reports. Current execution evidence is in [the one-hour work log](../../qa-reports/launch/2026-10-05/ONE-HOUR-WORKLOG.md) and [the PR review record](../../qa-reports/launch/2026-10-05/PR-1032.md).

The owner explicitly approved dismissing only CodeQL #205 as a false positive. GitHub recorded that dismissal at `2026-10-05T12:53:04Z`; the aggregate CodeQL check subsequently passed on `77c1ad2b78f0c7c0af193c6c9dfc1b2938658b6e`. Passwords remain scrypt-hashed. No other alert was dismissed and no query was disabled. New commits still need their own exact-head checks.

Before merging, check Vercel and Railway Git integration settings. If merging `dev` would deploy automatically, treat the merge as a deployment action requiring the owner's go-ahead. No automatic-deployment setting was changed or verified by this local work block.

## Deployment prerequisites

1. Capture the currently deployed web/API revisions, image digest and configuration version. The last read-only check reported `0d209fb4d3ab0d4beb62610b801f455aed09e398` on both services and guarded runtime `off`. Recheck rather than assuming this remains current.
2. Produce a recoverable backup of the persistent data volume before replacing the release. Record encryption, key ownership, retention, access restrictions and an isolated restore result. Do not delete, reinitialize or relocate the existing volume. File permissions and backup-variable presence are not restore or encryption proof.
3. Confirm provider credentials and policy evidence in the existing backend secret manager. `CUDOS_API_KEY` must reach the managed runtime; it must never appear in a `VITE_` variable, browser bundle, PR or chat. The local preview has no key; its empty model list is not evidence that the deployed key is valid or invalid.
4. Keep the approved scope: all five core desks, optional Jev, STM off. Keep unaccepted billing, Cloud, generated-media and integration promotions disabled. The Account fix does not require enabling Matterhorn Cloud.

## Deploy the coordinated backend and runtime

Use the repository-root `railway.json`, which selects `packaging/docker/Dockerfile.public-beta` and `/health/ready`. Do not substitute a stock OpenCode binary. This candidate requires the maintained source distribution `1.18.31-matterhorn.1`, its matching server/plugin code and the pinned source/catalog/patch manifest at `patches/runtime/distribution.json`. SDK/plugin dependency baseline remains `1.18.31`.

The Docker recipe builds the maintained runtime and runs 30 strict native cases against the copied binary in the final environment. Keep these checks enabled. Record the newly built image and binary digests; different platform artifacts have different hashes. See [runtime build and verification](../../patches/runtime/README.md). No published desktop prebuilts exist, and local experimental `.2`/`.3` binaries are not release artifacts.

Preserve the existing persistent `/data` mount and all server-only secrets. Supply `MATTERHORN_BUILD_COMMIT` from the exact approved release commit. Set exact HTTPS CORS origin `https://desks.matterhorn.so`; preserve manual approvals and hard model-usage enforcement. Verify the trusted proxy secret matches the Vercel-side proxy secret without printing either value.

The launch acceptance target is `MATTERHORN_GUARDED_RUNTIME_MODE=enforce`, with independent configured runtime and capability-signing secrets and the managed plugin actually installed. Do not change a flag merely to make health green. Verify all required desks and access paths are covered; a selector limited to one desk is not five-desk enforcement. Historical staged rollout examples using `off`, `shadow` or a Sui-only selector are not the final public-beta acceptance target.

## Provider setup and model selection

Use [`.env.example`](../../.env.example) for exact variable names, not as a populated production configuration. Retain `MATTERHORN_PROVIDER_PRIVACY_MODE=verified-only`. Populate the CUDOS training-use, opt-in, reviewed-policy URL/date and retention declarations only from evidence for the actual inference account and endpoint. Do not invent numeric retention or reuse an unrelated product policy. See [provider evidence still required](provider-privacy-review-2026-10-03.md).

After backend startup, sign in as an ordinary test user and open Settings → Models. Confirm the server returns connected chat models, select the intended model, reload and verify the saved default. An empty catalog requires checking server credential availability, managed runtime startup and provider connectivity; Refresh models cannot create missing credentials. Never present embedding-only models as chat choices.

Test ASI1 and ASI1 Mini separately. Mini previously returned HTTP 429; do not silently substitute ASI1 or advertise Mini as available without current entitlement/quota evidence. Jev requires its own approved TypeSafe configuration and explicit user opt-in; a CUDOS key is not a TypeSafe key. Ordinary chat must work with Jev off.

## Deploy the web app

Build the same approved release revision using root `vercel.json`: `pnpm --filter @matterhorn-work/app build:web`, output `apps/app/dist`. Set `VITE_MATTERHORN_BUILD_COMMIT` to that exact revision, not the pre-merge head if deploying a merge commit.

Use public web mode and required sign-in: `VITE_MATTERHORN_DEPLOYMENT=web`, `VITE_MATTERHORN_PUBLIC_BETA=1`, `VITE_MATTERHORN_REQUIRE_SIGNIN=1`, and `MATTERHORN_PUBLIC_PROXY_MODE=same-origin`. Configure the existing server-only `MATTERHORN_CONTROL_PLANE_URL` and `MATTERHORN_PROXY_SECRET`. Do not expose direct backend URLs or client/host tokens via browser variables. Preserve the approved same-origin auth URLs and proxy routes.

Retro UI is the current default, with explicit rollback supported by its existing flag. Preserve users' theme preferences. Keep `VITE_MATTERHORN_CLOUD_ENABLED=0` unless separate Cloud acceptance has passed; ordinary Account/profile/sign-out must work with that flag off. Rebuild after changing `VITE_` configuration. Do not fix account access by activating unrelated Cloud services.

## Required hosted checks before public launch

Set `RELEASE_SHA` to the full approved deployed revision, then run this credential-free probe from the release checkout:

```sh
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://desks.matterhorn.so \
  --server-url https://desks.matterhorn.so \
  --allowed-origin https://desks.matterhorn.so \
  --expected-commit "$RELEASE_SHA" \
  --expected-web-commit "$RELEASE_SHA" \
  --expected-guarded-mode enforce \
  --expected-signup-status open \
  --strict --json-output deployment-acceptance.json
```

Then complete the following with two controlled accounts and inboxes. Store sanitized evidence, never credentials or customer transcripts.

- **Accounts:** normal signup, real verification delivery, login, Account/profile, logout, session revocation, password reset, expired/reused-link rejection and account-switch cache cleanup. The earlier hosted page disabled registration/recovery despite open API flags; verify the rendered page, not flags alone. Do not bypass Turnstile or verification.
- **Five desks:** Private AI answers a normal prompt; Bittensor performs a public-chain read; Hyperliquid reads a public market/orderbook; Polymarket reads a public market; Sui reads public chain/object data. Each must complete through the normal UI with the selected model. Record source, network, freshness, outcome and limitations. Navigation, wallet badges, synthetic tests and generic model knowledge do not prove live desk tools.
- **Failure and usage paths:** cancel during preparation and streaming, retry after a controlled failure, provider unavailable/throttled, approval denial and reconnect. Verify no duplicate dispatch or double accounting. Known authoritative usage must settle once. Unknown post-dispatch usage legitimately retains a reservation pending reconciliation; do not clear holds on a timer merely to get a green result.
- **Isolation and data:** one account cannot access the other's chats, memory, notes, files or exports. Verify memory save/use/delete, notes persistence and logout/account-change cleanup. Keep downloaded exports, provider copies and backups distinct from active-store deletion.
- **UI:** model selection, all desk entries, draft preservation, Account routing and Back to app at desktop and 390px width; keyboard focus and recovery feedback. Retest in supported browsers. Record unavailable environments as unverified.
- **Operations:** actual SES delivery/bounce/complaint event handling and real reset delivery; encrypted storage and backup evidence; successful isolated restore with deleted-data handling. See [production configuration](../production-launch-configuration.md) for variable names and [reliability acceptance](chat-reliability-deployment-2026-10-01.md) for supporting checks, while using this release's current SHAs and runtime requirements.

Do not announce public launch while a core desk cannot execute, model selection is empty, guards are absent, auth/isolation/accounting fails, or required inbox/restore evidence is missing. A deployment can be staged for acceptance without being declared launch-ready.

## Rollback and evidence to return

Keep the previous coordinated web, backend, plugin/runtime artifacts and configuration available. Roll back them together if identity, auth, execution or accounting regresses; never pair this server with stock OpenCode. Stop admission of new work before coordinated recovery when needed, preserve durable data and unknown-usage evidence, and do not automatically restore an old data snapshot over newer user data.

Return the exact merge and deployed SHAs, Vercel/Railway deployment IDs, image/runtime hashes, health/probe report, five desk outcomes, account/inbox results, usage/isolation results, restore evidence and any remaining failures. Do not return keys or unredacted user content. Codex has not deployed or certified these hosted checks.
