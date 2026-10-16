# Public beta release handoff for 16 October 2026

For the team operating `https://desks.matterhorn.so`. The local candidate combines the permanently restored interface, merged #1036 model and read fixes, subsequent chat recovery and Polymarket read corrections, and release-owned desk guidance. All five desks completed real local response acceptance on 16 October; see the [candidate results](../../qa-reports/launch-candidate/2026-10-16/RESULTS.md) for exact source identity, receipts, checks and limits. Local acceptance does not certify the hosted service. No production deployment or configuration change has been performed by this release task.

## Release identity and approval

| Record | Value |
| --- | --- |
| Repository | `matterhornso/matterhorn-work` |
| Merged baseline | `c5f326b2a38ecc49817adcce5922ba5ad95991eb`, [PR #1036](https://github.com/matterhornso/matterhorn-work/pull/1036) |
| Candidate PR and exact reviewed head | **PENDING: record PR URL and full head SHA** |
| Exact head CI | **PENDING: record check links and results for that head** |
| Approved merged release SHA and merge CI | **PENDING: record the actual full release SHA and its checks after separate merge approval** |
| Production approval and operator | **PENDING: explicit deployment approval and named operator** |
| Canonical service IDs, artifact digests and rollback owner | **PENDING: record from the hosting control plane before cutover** |

Do not release while an applicable identity or approval remains pending. Do not use the baseline SHA to label artifacts containing additional local changes. Candidate CI must include both `public-beta-container-build` and `public-beta-web-container-build`, alongside the existing security, test and safety gates. Local Docker is unavailable: a source build or contract test is not a target-image build. The web-container smoke deliberately verifies a `503 control_plane_unavailable` health response without an upstream; it proves the configuration boundary, not working hosted backend connectivity.

The latest recorded hosted web marker is `ff0fee42b375e3dc58cbc73918d0093fa2eded40`; API is `0d209fb4d3ab0d4beb62610b801f455aed09e398`. GitHub ancestry places them 28 and 30 commits behind #1036 respectively; neither contains #1036. Reinspect at cutover. Healthy launch flags or open signup do not establish the candidate's deployment.

## Prepare the production services

1. Verify the project, environment, domain, branch binding and immutable deployment ID for the canonical web, API/managed runtime and Bittensor service. Determine whether web is Railway or Vercel; preserve the established topology and do not deploy an accessible canary by mistake.
2. Verify encryption on the persistent `/data` volume and preserve it, the single-writer storage topology, accounts, sessions, chats, drafts, files, notes, memory, provider configuration, signing/encryption keys and accounting. The API paths are `MATTERHORN_WORK_DATA_DIR=/data/matterhorn`, `MATTERHORN_WORK_WORKSPACES=/data/workspace`, `XDG_DATA_HOME=/data/opencode/xdg/data` and `XDG_STATE_HOME=/data/opencode/xdg/state`. This release needs no schema push, migration, reset or data cleanup.
3. Verify an access-restricted encrypted host backup and a successful application restore into a separate isolated target, including SQLite integrity and account/workspace access. An archive checksum or extracted tenant export alone is insufficient. Preserve `MATTERHORN_HOST_BACKUP_REQUIRED=1` and verified-upload freshness; never hand-edit its success marker. Record recovery owner and evidence privately. Use the [production recovery procedure](../production-launch-configuration.md), not a restore over live data.
4. Preserve server-only `MATTERHORN_CONTROL_PLANE_URL` and `MATTERHORN_PROXY_SECRET` on web, with the matching backend `MATTERHORN_WORK_TRUSTED_PROXY_SECRET`. Retain `MATTERHORN_WORK_TOKEN`, `MATTERHORN_WORK_HOST_TOKEN`, exact `MATTERHORN_WORK_CORS_ORIGINS=https://desks.matterhorn.so`, secure cookies and same-origin API/engine routes. Keep secrets in the approved secret manager, never in `VITE_*`, logs or this handoff.

## Build the reviewed artifacts

Build from a clean checkout of the approved release, using pnpm **10.27.0** and the repository's supported toolchain. Replace the placeholder below; keep the equality and clean-tree checks. Reuse neither developer dependencies nor preview data.

```sh
set -eu
RELEASE_SHA=$(git rev-parse HEAD)
test "$RELEASE_SHA" = "<APPROVED_FULL_40_CHARACTER_RELEASE_SHA>"
test -z "$(git status --porcelain)"
test "$(pnpm --version)" = "10.27.0"
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter matterhorn-work-server rebuild better-sqlite3 --pending
VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" pnpm --filter @matterhorn-work/app build:web
docker build --no-cache -f packaging/docker/Dockerfile.public-beta-web \
  --build-arg VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" \
  -t "matterhorn-web:$RELEASE_SHA" .
docker build --no-cache -f packaging/docker/Dockerfile.public-beta \
  -t "matterhorn-api:$RELEASE_SHA" .
```

The web output is `apps/app/dist`; use `build:web`, not the desktop/default `build`. Railway web uses `packaging/docker/railway.web.json`; API uses `railway.json`. Both gate promotion on `/health/ready`. The existing Vercel configuration is `vercel.json`. Set API runtime `MATTERHORN_BUILD_COMMIT` to the same actual release SHA as web. Remove stale build-marker overrides; record image digests and deployment IDs as well as source markers.

The API image uses Node 22, Bun **1.3.11**, pnpm **10.27.0** and checksum-verified OpenCode **1.18.31**. Web builds with Node 22 and runs `oven/bun:1.3-slim`; these base-image tags are not immutable digests. Record resolved bases and build for the production architecture. Preserve approved build-time `VITE_MATTERHORN_DEPLOYMENT`, `VITE_MATTERHORN_PUBLIC_BETA`, `VITE_MATTERHORN_REQUIRE_SIGNIN`, `VITE_MATTERHORN_CLOUD_ENABLED`, `VITE_MATTERHORN_CLOUD_URL` and `VITE_MATTERHORN_CLOUD_API_URL` settings for that topology. Runtime environment changes do not rewrite static assets. Do not restore the removed retro/minimal UI flags.

## Provision Bittensor privately

Use the existing approved, supervised sidecar packaging from the same release source, including `subnet-cache.mjs`. The API image is not a Python-sidecar deployment. Install the [pinned requirements](../../packages/bittensor-subtensor-sidecar/requirements.txt) in a clean Python 3.11 environment: `bittensor==10.5.0`, `async-substrate-interface==2.2.1`, `cyscale==0.5.0`. SDK 11 and older environments containing conflicting `scalecodec` are not supported by this bridge.

Set sidecar `BITTENSOR_SIDECAR_MODE=python`, `BITTENSOR_PYTHON` to its pinned interpreter, and deliberately select `BITTENSOR_NETWORK`. Configure matching API `BITTENSOR_NETWORK` and `BITTENSOR_SUBTENSOR_SIDECAR_URL`. Use loopback or a private access-controlled service network; this sidecar has no public authentication layer. Do not copy a laptop URL/temporary port or expose the service publicly.

Run `pnpm --filter @matterhorn-work/bittensor-subtensor-sidecar test` with the pinned Python environment. Require `/health` plus nonempty `/subnets` with real block, source, network and timestamp, then repeat the read through the ordinary authenticated desk. `/liveness`, mock or warming responses do not pass. Certified Crypto App execution requires its approved HTTPS endpoint and testnet contract; legacy Finney/mainnet reads require separate configuration and evidence. No wallet keys or submission: `/submit` stays disabled. See the [sidecar runbook](../../packages/bittensor-subtensor-sidecar/README.md).

## Preserve policy and accounting boundaries

Keep `MATTERHORN_PROVIDER_PRIVACY_MODE=verified-only`, `MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED=1`, approved guarded-runtime enforcement/selectors and the corresponding `MATTERHORN_AGENT_RUNTIME_SECRET` and `MATTERHORN_CAPABILITY_SIGNING_SECRET`. Do not disable a boundary to make health or a test pass. CUDOS/ASI:Cloud API training and retention terms remain unverified; owner-disabled training opt-in is not provider verification. Do not invent `MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT` or retention claims. Disclosed public research, private-context consent and secret blocking remain request-specific.

Production defaults to `MATTERHORN_WORK_APPROVAL_MODE=manual`. Local auto-approval is **not** the production default or an approved fix. Retain the approved mode and prove a timely supported approval workflow; any change needs a separate owner/security decision. Keep Jev optional and off (`MATTERHORN_JEV_ENABLED=0`) and STM off (`MATTERHORN_WORK_STM_ENABLED=0`). Ordinary chat must work without them; no optional connector is connected merely because its guidance appears in Skills.

Retain hard allowance enforcement and explicitly approved account/workspace/global budgets. Local QA allowances are not production allowances. Drain active runs before replacement and reconcile complete authoritative usage. Unknown stopped-request usage retains its reservation and receipts across restart/cutover until exact-parent complete usage settles once. Do not clear holds, reset counters, infer zero cost or weaken reservations to pass acceptance.

## Cutover and ordinary hosted acceptance

After explicit deployment approval, deploy the compatible backend/runtime and private sidecar, verify readiness and internal authentication, then deploy web. Use ordinary verified test accounts at the canonical domain, not host/admin tokens or fixtures, to record:

1. Matching approved web/API/runtime/sidecar identities and artifact IDs; HTML `matterhorn-build-commit`, API `X-Matterhorn-Build-Commit`, `/health/live`, `/health/ready`, `/health/launch` and `/api/auth/config`. Unauthenticated protected routes must return JSON `401`/`403`, not an HTML fallback.
2. Model selection, **Use for new chats**, reload persistence, restored desktop/mobile navigation and retained drafts. Complete a real response in Private AI and source-backed Bittensor, Hyperliquid, Polymarket and Sui public reads; record model, agent, final answer, session/run and tool source/network/freshness. Do not substitute testnet for mainnet or stale/empty output for a pass.
3. Stop, safe Retry, provider failure and consent denial/withdrawal; no duplicate dispatch or settlement. Verify unknown-usage holds survive restart, quota remains enforced, and complete late receipts settle once. No wallet signing or real transactions.
4. Two disposable accounts: sign-in/out, expired sessions, account switching and isolation of chats/files/notes/memory/integrations. Complete real verification-email and password-reset delivery, reject reused reset links, and preserve legal/verification gates. Keep `MATTERHORN_EMAIL_VERIFICATION_REQUIRED=true`; an email-provider acknowledgement alone is not inbox delivery.
5. Encrypted isolated application restore, recovery owner and dated evidence. Record Safari, Firefox and packaged desktop separately if claimed; local browser evidence does not certify them.

Polymarket read-only research is distinct from new-position preparation. The policy review deadline `2026-10-04T00:00:00.000Z` has expired; keep its denial until the authorized policy owner approves a separately tested update.

## Hold and rollback

Hold cutover for unresolved release identity/approval, failed exact-head or merge checks, artifact mismatch, ambiguous hosting ownership, failed restore/email/isolation/consent, missing required desk responses, discarded unknown holds or an unsupported approval workflow. Assign each remaining gate an owner; do not convert local results into hosted signoff.

For a serious regression, stop cutover, drain requests and preserve durable state. Roll back only to a recorded compatible, security-reviewed restored-interface artifact set, with explicit acceptance of any older model-save/accounting limitations. The observed hosted artifacts predate the restored release and are not an automatic safe rollback. If no acceptable set exists, hold and prepare a reviewed corrective artifact. Never force-reset the repository, reintroduce retired UI flags, delete volumes, overwrite live databases or disable controls. Database recovery is a separate approved operation.

Return the approved SHA/PR and CI links, service/domain mapping, deployment IDs/digests, hosted receipts and usage reconciliation, email/reset/restore evidence, rollback owner and every remaining limitation. Keep credentials, private prompts, databases and backup contents out of public evidence.
