# CUDOS model selection and desk read deployment handoff

Prepared on 15 October 2026 for the team operating `https://desks.matterhorn.so`. This candidate fixes saving a workspace model preference and clarifies Bittensor read selectors while preserving the permanently restored UI and existing request-level safeguards. **Draft PR only: do not merge or deploy.** Bittensor's complete app live-read flow, clean Stop/cancellation acceptance and a clean exact-head safety gate remain outstanding. No production deployment or configuration change has been made or authorized by this handoff.

## Release identity and change scope

| Item | Value |
| --- | --- |
| Repository | `matterhornso/matterhorn-work` |
| Base | `4085d83cb23e9e2f4f4c639d3a990f9b93196771`, merged [PR #1035](https://github.com/matterhornso/matterhorn-work/pull/1035) |
| Candidate branch | `codex/cudos-model-selection-2026-10-14` |
| Model preference fix | `3c8eaf00df6efcd004214a16c71f9f74638a2317` |
| Latest tested behavior commit | `8b7878d538ff5a584b2ab80a2c16ffa6cee195d7`, Bittensor guidance and missing-selector validation |
| Candidate PR | [Draft PR #1036](https://github.com/matterhornso/matterhorn-work/pull/1036), targeting `dev` |
| Final head and CI | Resolve with `gh pr view 1036 --repo matterhornso/matterhorn-work --json headRefOid,statusCheckRollup`; verify checks belong to that exact head, not an earlier revision |
| Approved release SHA | Not yet merged or approved for deployment; record the actual immutable release revision after review |

The model change removes the provider-privacy assertion from `PATCH /workspace/:id/backend/model-selection`. Saving a preference sends no inference prompt. The endpoint still validates the connected chat catalogue, collaborator permission, writable workspace, selection shape and variant; it persists the preference and records an audit event. Updated UI text distinguishes preference saving from request authorization. It does not claim the provider is privacy-verified.

The follow-up Bittensor change makes the model-facing contract explicit: `discovery` lists/searches subnets; `subnet` and `validators` require an exact non-negative integer `netuid`; `wallet` requires a public address. Invalid singular selectors fail before backend access with sanitized allowlisted errors. It does not silently convert ambiguous requests or change network, capability, privacy or wallet authority. Its regression coverage passes; full app live-read acceptance does not yet pass.

Prompt privacy checks, request-bound consent, secret blocking, account isolation, guarded execution, usage accounting and wallet approvals are unchanged. No database migration, dependency update, model-provider replacement or sidecar packaging change is included. The restored UI remains permanent: do not reintroduce `VITE_MATTERHORN_RETRO_UI`, `VITE_MATTERHORN_MINIMAL_UI`, their styles, or an opt-in to the rejected layouts.

This candidate builds on #1035; it is not a repository reset to #1027 and does not require importing unrelated unmerged branches. The [restored-UI handoff](permanent-restored-ui-deployment-2026-10-13.md) remains the baseline for state preservation and dependency requirements; its pre-merge placeholders are historical, not the release identity for this candidate.

## What has been demonstrated

The [QA report and 15 October follow-up](../../qa-reports/cudos-model-selection/2026-10-14/RESULTS.md) record local normal-auth selection, **Use for new chats**, reload persistence and real CUDOS `asi1` concept responses from all five expected agents. The initial five receipts total 19,881 charged tokens, zero reserved tokens and zero pending requests at that checkpoint. These were synthetic public concept prompts, not live-chain acceptance, all-model certification or evidence of monetary cost.

The subsequent local public-read pass is separate:

| Desk | Final local evidence | Remaining signoff |
| --- | --- | --- |
| Private AI | Real `asi1` concept response passed | Repeat on the hosted candidate |
| Sui | Public `0x5` balance, mainnet, `sui.grpc`, fetched `2026-10-14T20:11:44.690Z`; completed answer; 5,385 tokens | Hosted replay |
| Hyperliquid | BTC orderbook, mainnet, `hyperliquid.info`, fetched `2026-10-14T20:13:23.478Z`; completed answer; 8,224 tokens | Hosted replay |
| Polymarket | Active market `3229167`, public Gamma search, fetched `2026-10-14T20:14:19Z`; completed answer; 8,739 tokens | Hosted read-only replay; trade preparation remains separately blocked |
| Bittensor | SDK independently returned live testnet block 8,221,939 and five subnets; app flow did not complete a live read | Repeat the complete app journey on an awake, stable machine |

The Bittensor model initially selected `subnet` without `netuid`. After the correction, that invalid call produced the actionable `bittensor_netuid_required` error; the explicit `discovery` follow-up reached the tool but timed out across a roughly 18-minute machine suspension. Power logs confirmed repeated **Dark Wake Thermal Emergency** sleeps. These runs do not establish a provider/sidecar fault or valid latency acceptance. A live read outside the app is not proof of the complete app journey.

Stop during **Preparing** produced a partial answer and an active-run provider-context binding error across a 947-second suspension gap. Its hold released, and a short recovery request completed (7,935 tokens), but **cancellation is not signed off**. A potential early-Preparing abort/dispatch race also remains by code inspection; add a deterministic paused-dispatch regression before deciding whether a fix is needed. Do not relabel the guard error as a successful cancellation or relax binding expiry to make the test pass. Repeat both Bittensor and Stop on an awake, thermally stable machine without disabling thermal protections or merely increasing timeouts.

Final authenticated account readback at `2026-10-14T21:34:12.162Z`: **15 settled requests; 84,668 reported used/charged tokens; 0 reserved; 0 pending; 15,332 remaining** under the unchanged 100,000-token limits. Reported assistant token totals reconcile to 84,668. Failed/retried requests are included. Interrupted usage may be unreported; reconcile provider billing separately and make no zero-cost claim. Do not raise limits simply to finish acceptance.

Local host approvals were initially manual. The user later authorized automatic **host** approval only for this isolated local test runtime. That does not authorize transaction signing, private-data consent, integration access or production auto-approval. The local service, test accounts, temporary sidecar, screenshots and scratch launcher are not deployment artifacts and must not be copied into production.

The implementation report records 41 backend control-plane tests, 31 provider/agent privacy tests, one authoritative-gateway E2E test, 1,322 frontend tests, app/server typechecks and an isolated production-format web build passing. The Bittensor follow-up adds **55 passing contract/managed-MCP/read-only-route tests**; types build and server typecheck passed afterward. Other focused regressions and their limits are in the QA report.

**The full monolithic safety gate did not pass in one clean run.** One aggregate run timed out in memory-inbox; a later run failed a Polymarket child; another desk run failed a different SDK-normalizer child. Those exact children and stage-selective reruns passed independently, which is not a one-shot green gate. Keep the PR draft until clean exact-head CI and the remaining awake-machine acceptance pass. Safari, Firefox, light-theme and full accessibility coverage were not reverified in this bounded fix. Earlier #1035 evidence does not automatically certify this candidate's hosted behavior.

## Privacy and approval decisions that remain with the operator

CUDOS API training and prompt/output-retention terms remain **unverified**. The owner has declared training opt-in disabled; this is not a provider attestation, zero-retention commitment or proof that every model has identical processing terms. Unknown terms are not evidence that training occurs, and are not evidence that it does not.

Keep `MATTERHORN_PROVIDER_PRIVACY_MODE=verified-only`, `MATTERHORN_GUARDED_RUNTIME_MODE=enforce` and `MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED=1`. The existing authoritative gateway evaluates each request: disclosed public research can be allowed; private context may require exact request-bound consent or be denied; secrets remain blocked. Unguarded and opaque paths have their own restrictions. A saved model or green catalogue must never be treated as authorization to bypass those decisions.

Before offering private-context use, the owner must decide the supported policy and obtain applicable CUDOS/ASI:Cloud API evidence covering training, retention, deletion and onward processing. Do not fabricate `MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT`, substitute ASI:One consumer terms for the CUDOS API, set an invented retention period, or enable disclosure mode to make a test pass. Keep the UI truthful while verification is missing. Relevant reviewed sources are the [ASI:Cloud overview](https://docs.cudos.org/docs/asi-cloud/introduction/overview), [API FAQ](https://docs.cudos.org/docs/asi-cloud/support/faqs) and [CUDOS privacy policy](https://www.cudos.org/legal/privacy-policy).

The production API Dockerfile defaults `MATTERHORN_WORK_APPROVAL_MODE=manual`. Retain the approved production setting. If manual approval remains, prove that legitimate ordinary-user requests receive timely approval through a staffed/operator-supported workflow; a request that times out waiting for the host is not working chat. Any change to production approval mode requires a separate explicit owner/security decision. **Do not copy local `approvalMode: auto` as the production fix.**

Keep hard usage enforcement and explicit per-account/workspace/global budgets. The local pass used 100,000-token daily/monthly limits and 10,000-token reservations; these are bounded QA settings, not approved commercial production allowances. Keep Jev and STM disabled for this release scope. Neither passing concept chats nor a model preference enables them.

## Bittensor service requirements

The temporary local sidecar used Python SDK mode on testnet, Python **3.11.15**, `bittensor==10.5.0`, `async-substrate-interface==2.2.1` and `cyscale==0.5.0`, on loopback port 59285. The Python dependencies match the existing [requirements](../../packages/bittensor-subtensor-sidecar/requirements.txt). Use a clean virtual environment; older `scalecodec` environments conflict with `cyscale`. SDK 11 is not supported by the existing bridge. See the [sidecar runbook](../../packages/bittensor-subtensor-sidecar/README.md).

For hosting, provision a persistent, supervised service with a pinned Python runtime and the existing pinned dependencies. Configure the approved network deliberately. Keep it on loopback or a private access-controlled network: the sidecar has no public authentication layer and must not be exposed directly to the internet. The API uses `BITTENSOR_SUBTENSOR_SIDECAR_URL` and the selected `BITTENSOR_NETWORK`; the sidecar uses `BITTENSOR_SIDECAR_MODE=python` and `BITTENSOR_PYTHON`. A laptop loopback URL and temporary port cannot serve a hosted API.

Distinguish the two existing paths:

- Legacy desk read transport can use the private sidecar URL. A successful local HTTP testnet read validates only that read path and network.
- Certified Crypto App execution requires the approved HTTPS endpoint and matching certification/network contract; the existing Bittensor certified contract is testnet-only. Do not weaken HTTPS/certification requirements or report legacy reads as certified-app acceptance. Finney/mainnet reads require separate configuration and evidence.

Check `/health` and a nonempty `/subnets` result with real block, source, network and timestamp. `/liveness`, mock data, warming status or a running Python process is not live-chain readiness. Then complete the same read through the ordinary authenticated Bittensor desk. Do not introduce wallet keys, enable submission or perform trades; `/submit` remains disabled. Packaging and deploying this service is an operator task, not a product change supplied by this PR.

## Review and build the exact candidate

Use a clean checkout and record the current production web/API/runtime/sidecar revisions, service IDs, domain ownership, artifact digests and rollback owner first. Verify which branch is actually bound to `desks.matterhorn.so`; neither `dev` nor a canary URL proves production ownership. Review the candidate diff against #1035, then recheck CI on the final head. Merge and deployment require their own approval.

Use pnpm **10.27.0**, the supported Node/Bun toolchain, disposable test storage and permitted loopback networking. Do not run suites against production data. These commands are verification instructions, not a claim they were all rerun in the live-read pass:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter matterhorn-work-server rebuild better-sqlite3 --pending
pnpm --filter @matterhorn-work/types build
pnpm --filter @matterhorn-work/memory-vault build
pnpm --filter @matterhorn-work/crypto-app-sdk build
bun --no-env-file test apps/server/src/backend-control-plane.e2e.test.ts
bun --no-env-file test apps/server/src/provider-privacy.test.ts apps/server/src/agent-privacy.test.ts
bun --no-env-file test apps/server/src/session-read-model.e2e.test.ts --test-name-pattern 'allows disclosed public research only through the authoritative gateway'
bun --no-env-file test apps/server/src/managed-opencode-mcp.test.ts apps/server/src/bittensor-chat-routes.e2e.test.ts apps/server/src/crypto-action-registry.test.ts
bun --no-env-file test apps/app/tests
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app test:composer-browser
pnpm audit:dependencies
pnpm test:security-workflow-contract
pnpm test:matterhorn-platform-safety
pnpm release:secret-scan
```

For sidecar changes in the operator's deployment packaging, additionally run `pnpm --filter @matterhorn-work/bittensor-subtensor-sidecar test` with the pinned Python environment, then the live service/app acceptance. Missing prerequisites or skipped tests are unverified, not passes. Preserve the baseline Rust/dependency checks in the #1035 handoff when those artifacts are rebuilt; do not lower security thresholds or add suppressions.

After an approved merge, record the actual full release SHA rather than assuming it equals the tested behavior commit. Build web and API/runtime artifacts from that exact revision:

```sh
set -eu
RELEASE_SHA=$(git rev-parse HEAD)
test "$RELEASE_SHA" = "<APPROVED_FULL_40_CHARACTER_RELEASE_SHA>"
VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" pnpm --filter @matterhorn-work/app build:web
docker build --no-cache -f packaging/docker/Dockerfile.public-beta-web \
  --build-arg VITE_MATTERHORN_BUILD_COMMIT="$RELEASE_SHA" \
  -t "matterhorn-web:$RELEASE_SHA" .
docker build --no-cache -f packaging/docker/Dockerfile.public-beta \
  -t "matterhorn-api:$RELEASE_SHA" .
```

Replace the placeholder with the approved revision; do not remove the equality check. The web command is `build:web`, not the desktop/default `build`. Its output is `apps/app/dist`. Preserve approved build-time web/public-beta/sign-in/Cloud settings: `VITE_*` values are compiled into assets, not runtime switches. Never put the CUDOS key or proxy secrets in `VITE_*`. Stale `VITE_MATTERHORN_BUILD_COMMIT`, `VERCEL_GIT_COMMIT_SHA` or `MATTERHORN_BUILD_COMMIT` overrides must not mislabel the bundle. Record actual artifact digests as well as source markers.

The existing API image uses Node 22, Bun 1.3.11 and checksum-verified OpenCode 1.18.31; successful target-image builds remain required. Set runtime `MATTERHORN_BUILD_COMMIT` to the actual release SHA. Preserve the verified control-plane URL, same-origin proxy routes, service-to-service authentication, cookies and CORS. Do not replace an established hosting topology just to match these Docker examples.

## State preservation and hosted acceptance

Before cutover, preserve accounts, auth databases, chats, files, notes, memory, workspace defaults, persistent volumes, provider configuration, signing/integrity/encryption keys and accounting stores. Verify an encrypted, access-restricted backup and a successful isolated restore. This PR needs no migration, account reset, schema push or data cleanup. Drain active runs and reconcile holds before replacing the API/runtime.

After separately approved deployment, use ordinary verified test accounts at the canonical hosted domain. Record:

1. **Artifact identity:** HTML `matterhorn-build-commit`, API `X-Matterhorn-Build-Commit`, image digests and deployment IDs match the approved revision. Check `/health/live`, `/health/ready`, `/health/launch` and `/api/auth/config`; health alone is not acceptance.
2. **Model journey:** catalogue loads; selecting `asi1` and clicking **Use for new chats** succeeds; reload and authenticated readback preserve the same workspace default. Test failure/error recovery without losing drafts. The provider warning remains unverified unless supported operator evidence has actually changed.
3. **Five desks:** complete a real Private AI answer and source-backed Bittensor subnet, Hyperliquid orderbook/funding, Polymarket market/liquidity and Sui public checkpoint/object/account reads. Record exact network, source, observation time/block, agent, model, final answer, session/run and tool receipts. Do not substitute testnet for a mainnet claim or stale/empty output for a pass.
4. **Privacy and controls:** test public research, harmless synthetic private-context consent/denial, expired or changed consent, Stop, safe retry, offline/provider error and approval waiting. Verify no duplicate requests/settlements and no leftover completed-run holds. Do not submit actual secrets as test inputs.
5. **UI:** restored desktop/mobile UI, all desk entries, model picker, Profile/Account, wallet/tools, settings, theme persistence, keyboard focus, 390px layout and draft retention. Public sign-in, Privacy, Terms, Security, Support and Back to app links must remain usable; no retro/minimal root marker or old-layout switch.
6. **Operations:** two-account chat/file/memory/note isolation; normal signup and real verification-email delivery; password-reset delivery and reused-link rejection; logout/account-change cache cleanup; encrypted backup/restore and named recovery owner. None of these hosted/email/backup claims is proven by this local pass.

Polymarket read-only research is distinct from trade preparation. The existing jurisdiction policy review deadline is `2026-10-04T00:00:00.000Z`; expired policy intentionally denies new-position preparation. This PR neither extends the deadline nor changes jurisdiction restrictions. Keep the denial and any trade-preparation claim blocked until an authorized policy owner approves a separately tested update. No wallet signing, real-fund transaction or venue-policy bypass is part of this release acceptance.

## Hold and rollback criteria

The current disposition is **hold: draft PR, no merge, no deployment**. Clear the clean exact-head CI/safety gate, awake-machine Bittensor app read, and Stop/cancellation regression/acceptance first. Do not sign off if final-head/merge CI is missing or failing; any required read lacks a real completed answer; model save/readback fails; accounts mix; privacy/approval boundaries fail; completed runs leave unexplained holds; production identity is unclear; or required email/recovery/restore evidence is absent. Assign each failure an owner and remedy. A public-research-only release must state that scope explicitly; it is not unrestricted private-context or transaction readiness.

If a serious regression appears, stop cutover, drain requests and preserve durable state. Roll back application artifacts only to a recorded compatible, security-reviewed **restored-UI** set. An approved artifact built from #1035 may be a candidate, but rolling back this fix restores its model-save privacy blocker; assess and disclose that impact. Do not restore the rejected retro UI, reintroduce flags, reset to #1027, force-push, overwrite databases, delete volumes or disable safeguards. Database recovery is a separate operation, not an automatic application rollback.

Return the PR URL, exact approved head/merge SHA, CI links, hosting service/domain/branch mapping, artifact/deployment IDs, completed local and hosted evidence, policy/approval decisions, final usage reconciliation, email/reset/backup proof and rollback owner. Keep account credentials, tokens, private content and backup contents out of GitHub and the public handoff.
