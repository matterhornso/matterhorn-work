# Permanent restored UI deployment handoff

Prepared on 13 October 2026 for the tech team operating `https://desks.matterhorn.so`. Deploy the reviewed permanent restored-interface candidate only after the release gates below pass. This handoff does not authorize a merge, deployment, production configuration change or data reset.

## Release identity and scope

| Item | Value |
| --- | --- |
| Repository | `matterhornso/matterhorn-work` |
| Candidate branch | `codex/permanent-restored-ui-2026-10-13` |
| Implementation base | `origin/dev` at `ff0fee42b375e3dc58cbc73918d0093fa2eded40`, merged PR #1033 |
| Candidate PR | [#1035](https://github.com/matterhornso/matterhorn-work/pull/1035), targeting `dev` |
| Tested UI implementation commit | `d688fdeed02c26f77cbc8008a9d0dba783e13f45`; subsequent commits add documentation and CI-test corrections, not UI/backend production behavior |
| Exact approved release commit | **PENDING: fill the full 40-character commit actually built after merge** |
| Final candidate and merge CI | **PENDING: fill exact-head check links and results** |

The observed production frontend reported the base SHA above and still carried the retro root marker. That observation is not proof of the current API revision or of which hosting branch is bound to production. Reinspect before cutover.

The candidate permanently removes `VITE_MATTERHORN_RETRO_UI`, `VITE_MATTERHORN_MINIMAL_UI`, their retired layout branches and retro CSS. The approved pre-retro layout remains, including model, Profile, wallet, Account and mobile Settings access. Old UI flag values must not reactivate the removed design. Remove obsolete UI flag overrides from the verified deployment configuration as cleanup; they are no longer a supported rollback mechanism.

This is not a whole-repository reset to PR #1027 and does not depend on merging unmerged PR #1032 or #1034. It preserves the merged backend behavior, authorization, consent, accounting, routing and data schema. There is no migration or account/workspace reset. Dependency changes require fresh frontend and backend artifacts even though backend source behavior is unchanged. Jev remains optional, and its controls remain available to inspect or revoke a remembered opt-in.

Scope and dependency details: [worklog](../../qa-reports/ui-rollback/2026-10-13/WORKLOG.md) and [dependency security report](../../qa-reports/ui-rollback/2026-10-13/DEPENDENCY-SECURITY.md).

## Evidence and outstanding gates

The full platform safety gate, app/server typechecks and production `build:web` passed. The web build also passed with both retired UI flags set to `1`. Final frontend regression: **1,321 passed, zero failed**; composer Chromium: **9 passed**, one optional screenshot test skipped. The built production bundle passed normal local sign-in, `/session` entry, Profile and model-setup navigation, and visibility of all five desks at 390/1440px in both themes. No browser errors or retro root marker were observed. Final-head and merge CI still require verification at release time; do not infer them from these local results. See the [verification report](../../qa-reports/ui-rollback/2026-10-13/RESULTS.md).

The complete JavaScript lockfile audit went from **16 advisories to zero**, including development and optional dependencies, with the low-severity gate unchanged. Rust `quinn-proto` is now **0.11.19**; locked compilation and resolved-graph policy passed, and cargo-audit found zero vulnerabilities using only the existing `RUSTSEC-2023-0071` exception. Existing unmaintained/yanked Rust informational warnings remain as recorded in the dependency report. Do not add suppressions, skip optional packages or lower the audit threshold.

GitHub default-branch Dependabot alert #43 (`http-cache-semantics <=4.2.0`) was still open when this branch was pushed. This candidate pins 4.3.0, outside that range. The alert has not been manually dismissed: verify GitHub's reevaluation after the approved merge reaches the tracked branch.

Local browser evidence covers normal-auth UI only, without an engine or provider. It does not establish real inference, production login, usage settlement, inbox delivery or backup recovery. Safari, Firefox and packaged desktop acceptance remain unverified. Desktop dependency smoke tests do not certify a packaged installer or its proxy behavior on a customer's machine.

**Polymarket trade-preparation limitation:** the existing server-owned jurisdiction policy's review deadline was `2026-10-04T00:00:00.000Z`. It now intentionally denies new-position preparation with `policy_review_required` / `capability_polymarket_jurisdiction_denied`. This PR does not extend that policy, change restricted jurisdictions or bypass venue checks. An authorized policy owner must review current official venue restrictions and approve a separately tested policy update before claiming trade preparation is available. Read-only market research acceptance is separate. A CI test had incorrectly assumed the policy was current on every wall-clock date; it now tests both the allowed historical interval and the expired denial using isolated storage, restoring the clock afterward.

From a clean checkout of the approved revision, use pinned pnpm **10.27.0** and the supported Node/Bun toolchain. Dependency smoke evidence used Node **24.20.0**; the existing production Dockerfiles use Node **22** and the API image pins Bun **1.3.11**, so successful target-image builds remain required. Run tests with disposable data and permitted loopback networking:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter matterhorn-work-server rebuild better-sqlite3 --pending
pnpm --filter @matterhorn-work/types build
pnpm --filter @matterhorn-work/memory-vault build
pnpm --filter @matterhorn-work/crypto-app-sdk build
pnpm audit:dependencies
node --test scripts/release-dependency-patches.test.mjs scripts/rust-dependency-policy.test.mjs
pnpm test:security-workflow-contract
bun --no-env-file test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
pnpm test:matterhorn-platform-safety
pnpm release:secret-scan
node scripts/rust-dependency-policy.mjs
cargo check --locked --manifest-path examples/microsandbox-openwork-rust/Cargo.toml --all-targets
cargo audit --file examples/microsandbox-openwork-rust/Cargo.lock --ignore RUSTSEC-2023-0071 --json
```

Use the repository CI prerequisites for any additional workspace packages. A missing executable, missing browser engine or package filter matching no projects is not a pass. Do not run concurrent builds that overwrite dependency declarations during typecheck.

## Verify production ownership and preserve state

Before making any changes, record the actual hosting project, environment, service, production domain and deployment IDs. Verify the production branch binding in the hosting control plane; neither the `dev` branch name nor repository configuration proves what is deployed. Confirm whether the canonical web tier is Vercel or Railway, and identify the matching Railway API/managed runtime and Bittensor sidecar. Do not deploy to an accessible canary merely because it appears in the account.

Record the current immutable web/API/runtime/sidecar artifact IDs and digests, source revisions, proxy targets and rollback owner. Verify the same-origin API/engine routes, TLS/cookie origin and exact CORS origin. Preserve the approved `MATTERHORN_CONTROL_PLANE_URL`, web proxy secret, backend trusted-proxy secret and service-to-service authentication.

Preserve databases, persistent volumes, accounts, chats, drafts, memory, notes, files, provider configuration, signing material and encryption keys. Do not run schema pushes, migrations, volume deletion, account resets or destructive cleanup for this release. Keep the supported single-writer storage topology. Verify an encrypted, access-restricted backup and a successful isolated restore before cutover; record recovery ownership and test-account integrity without publishing customer data. Never restore an old database over new writes as an automatic UI rollback.

Keep STM off. Preserve the approved guarded-runtime configuration, authorization, provider consent, privacy disclosures, model policy and wallet approval gates. Missing credentials or unavailable agents are release blockers, not a reason to weaken those controls. Do not change provider/model selection silently. Ordinary chat must work with Jev disabled; any Jev activation requires separate operator approval, policy review, explicit user consent and live acceptance. Never put secrets in `VITE_*`, source control, public evidence or screenshots.

## Build and deploy the reviewed artifacts

Use one approved release SHA for all rebuilt tiers, and record it before building. Build metadata must describe the actual bytes, not a desired release. Do not reuse developer `node_modules`, local preview data or a stale build cache as the release artifact.

The frontend's supported production command is `pnpm --filter @matterhorn-work/app build:web`, not the desktop/default `build` command. From the clean reviewed checkout:

```sh
set -eu
RELEASE_SHA=$(git rev-parse HEAD)
test "$RELEASE_SHA" = "<APPROVED_FULL_40_CHARACTER_RELEASE_SHA>"
VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" pnpm --filter @matterhorn-work/app build:web
```

Replace the placeholder with the approved release SHA; do not remove the equality check to build another revision. The output is `apps/app/dist`. The build script otherwise accepts commit metadata from `VITE_MATTERHORN_BUILD_COMMIT`, `VERCEL_GIT_COMMIT_SHA`, `MATTERHORN_BUILD_COMMIT`, then Git, in that order; remove stale attestation overrides rather than mislabelling an artifact.

For the existing Docker topology, build fresh artifacts from the same checkout:

```sh
docker build --no-cache -f packaging/docker/Dockerfile.public-beta-web \
  --build-arg VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" \
  -t "matterhorn-web:$RELEASE_SHA" .
docker build --no-cache -f packaging/docker/Dockerfile.public-beta \
  -t "matterhorn-api:$RELEASE_SHA" .
```

The web service configuration is `packaging/docker/railway.web.json`; the existing API configuration is `railway.json`. The API Dockerfile installs the frozen lockfile, rebuilds `better-sqlite3`, builds the crypto SDK and starts the existing server entrypoint. Preserve its canonical runtime configuration and set runtime `MATTERHORN_BUILD_COMMIT` to the actual release SHA. Do not replace a differently configured production topology merely to match these examples; reconcile it with the operator first. Rebuild applicable dependency-consuming services through their existing approved packaging, including the sidecar when required by that topology.

After approval, drain active runs before API/runtime replacement and reconcile in-flight usage holds. Deploy the compatible backend artifacts, verify health and internal authentication, then deploy the web artifact through the verified production service. No UI flag is needed. Confirm `https://desks.matterhorn.so` serves the intended artifact, not a cached or alternate deployment.

## Hosted acceptance before release signoff

Use ordinary verified test accounts and existing approved providers. Host/admin credentials, synthetic fixtures and green health flags cannot substitute for these checks.

- Verify `/health/live`, `/health/ready`, `/health/launch` and `/api/auth/config`. Compare the HTML `matterhorn-build-commit` meta tag and API `X-Matterhorn-Build-Commit` header with the exact recorded release SHA. Verify artifact/deployment IDs too; a marker alone is not sufficient.
- Confirm `html[data-matterhorn-ui="retro"]` is absent on first paint and after hydration, including sign-in and public guides. Confirm the restored layout, desktop tool rail, Profile/Account/wallet access, model picker, Light/Dark/System persistence and responsive mobile navigation. Check keyboard focus, 390px mobile and desktop, draft retention and no horizontal overflow or composer overlap. Do not assert the historical Settings sidebar changes palette merely because the main theme changes.
- Select a supported chat model, reload and verify persistence. Obtain one real completed response in each of the five desks: Private AI answer; Bittensor live subnet read; Hyperliquid current orderbook/funding read; Polymarket market/liquidity read; Sui public account/object/checkpoint read. Record source and freshness for protocol reads. A stale/warming card or empty transcript is not a successful response.
- For those runs, record selected model, final status, session/run references and relevant tool/receipt evidence. Reconcile charged/provider usage and pending holds; verify Stop, failure and explicit retry do not duplicate sends or settlement. Do not perform real trades or wallet signing for this read-only acceptance gate.
- With two disposable accounts, verify sign-in/sign-out, expired-session handling and isolation of chats, files, memory, notes and integration configuration. Complete real verification-email and password-reset delivery, including rejection of reused reset links. Preserve legal acceptance and verification requirements.
- Demonstrate backup restoration in an isolated target, expected account/workspace integrity and cross-account denial. Record dated recovery evidence and owner. Do not expose secrets, private prompts or backup contents in the release report.
- Test ordinary chat with Jev off and inspect/remove any remembered opt-in. If Jev is separately approved for use, verify its consent, disable/Stop and late-result behavior without broadening permissions or changing the answering model.

Record Safari, Firefox and packaged desktop results separately if those platforms are in the release claim. Until tested, label them unverified rather than extending Chromium or local UI evidence to them.

## Hold criteria and rollback

Hold the release if any release placeholder remains unresolved; exact-head or merge CI fails; dependency/security gates fail; source SHA or artifact identity differs between tiers; hosting branch/domain ownership is ambiguous; backups cannot be restored; auth/isolation/consent fails; the retired UI reappears; or required real desk responses, usage reconciliation or email/reset evidence is missing. Hold any Polymarket new-position/trade-preparation claim until the expired policy has been separately reviewed and updated. Assign an owner and remedy without bypassing checks.

For a serious regression, stop cutover, drain active requests and preserve all durable state. Roll back only to a recorded, compatible, security-reviewed artifact set with an explicitly accepted interface. The observed pre-release artifact contains the rejected retro UI and older dependencies: do not automatically restore it or call it a safe visual rollback. If no acceptable restored-interface artifact exists, hold deployment and prepare a reviewed corrective artifact from this candidate. An incident rollback to a known-risk artifact requires a separate explicit incident decision and disclosure of its UI/security consequences.

Do not roll back by reintroducing the removed flags, resetting the repository to #1027, force-pushing, deleting volumes, overwriting live databases or disabling authorization. Keep database recovery separate from application-artifact rollback and investigate any interrupted accounting state.

Return the reviewed PR URL, approved release SHA, exact-head/merge CI links, verified hosting branch and service IDs, artifact digests/deployment IDs, frontend/API attestations, dated hosted acceptance results, backup/email/reset evidence, usage reconciliation and rollback owner/artifacts. Keep sensitive evidence private and list every remaining failure or unverified platform explicitly.
