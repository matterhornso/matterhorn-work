# Matterhorn reliability deployment handoff

Engineering team: review and deploy the tested chat reliability candidate only after release approval. This handoff explains what changed, the required dependencies, configuration and evidence, and when to stop. It does not authorize changing production during the ongoing audit.

## Release and dependency order

Repository: `https://github.com/matterhornso/matterhorn-work`.

Review [PR #1029](https://github.com/matterhornso/matterhorn-work/pull/1029) followed by the published reliability [PR #1030](https://github.com/matterhornso/matterhorn-work/pull/1030). Neither was merged or deployed by this work block.

The reliability branch is `codex/chat-reliability-audit-2026-09-30`, built on PR #1029 at `22a696626847f139f58adfad86c6cd20f5d0e5ad`. The final source candidate is `652555e586597694be231787ec01ef5cbe13ddc2`; subsequent evidence/documentation commits must be included in review. PR #1029 was still open on 30 September at approximately 21:41 UTC. Review that base first. The reliability PR should initially target `codex/jev-chat-opt-in-2026-09-30` so its additional changes are reviewable. After the base merges into `dev`, retarget/rebase as necessary, then rerun required CI against the final merge candidate. Full test/i18n/UI-MCP workflows filter on `dev`; only applicable security checks are expected while stacked. Skipped workflows are not green acceptance. Do not deploy a floating “latest PR” or assume that a green base PR covers these changes.

Record the exact approved merge SHA, web build SHA, API build SHA, runtime/plugin artifact version and sidecar image digest. Deploy a coordinated web/API/runtime release: the new continuation acknowledgement, Sui schema and Jev lifecycle must not be validated against a stale backend. Preserve durable account data, sessions, memory, receipts, provider configuration and signing material. Do not copy the disposable developer test runtime into production.

The [audit report](../../qa-reports/reliability/2026-09-30/RESULTS.md) records scope, tests, live-read evidence and unresolved limitations. The final publication commit identifies the exact package; consult the PR head rather than assuming a screenshot identifies its server version.

## What the candidate changes

- Truthful incomplete/stopped/failed chat states, safe answer-only continuation, draft-safe retry and explicit rate-limit recovery.
- Terminal-error settlement, cumulative usage retained until acknowledgement, durable receipt verification after restart, and preserved capability audit evidence.
- Hard memory deletion, owner-only filesystem permissions, controlled audit-content redaction, offline legacy cleanup and browser account-boundary resets.
- Stop/disable handling during pending Jev classification without changing the selected answering model or granting permissions.
- Structurally read-only Bittensor requests, exact Polymarket market lookup, explicit Sui network selection and source limitations visible outside tool payloads.
- Patched dependency pins and a mobile input-size correction. This is not another redesign or new database platform.

## Identify the actual deployment before making changes

At 21:33 UTC on 30 September, `desks.matterhorn.so` reported web and API SHA `787d85bb830ff859a185d3bcd1a20c493dd008d4` and guarded runtime mode `off`. An older canary or accessible Railway project is not necessarily the service behind this hostname.

The operator must record:

1. Vercel project, deployment ID, production domain binding and approved source SHA.
2. Railway project/environment/service IDs actually serving the same-origin API, engine and Bittensor sidecar.
3. Proxy routes for `/workspaces`, `/workspace`, `/api` and `/opencode`; TLS, cookie origin and exact CORS origin.
4. Persistent volume/database paths, writer count, backup owner and recovery procedure.

Stop if service ownership or routing is ambiguous. Do not repair the wrong canary or rewrite production URLs to make a probe pass.

## Runtime and provider configuration

Use the existing deployment secret manager. Never put keys in the browser bundle, PR, screenshots, issue comments or this document.

- Run the approved guarded runtime configuration with `MATTERHORN_GUARDED_RUNTIME_MODE=enforce`. Verify the corresponding internal runtime authentication, persistent authorization state and plugin installation. Do not merely change a health response or enable a flag before its prerequisites are valid.
- Review `MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS` and `MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS`: acceptance here expects all relevant reads and preparation paths to be covered, not a narrower hidden subset. Leave unrelated Coworkers, STM and signing rollout decisions unchanged.
- Persist the selected CUDOS/ASI model configuration and provider-policy approval. ASI1 produced real local responses. ASI1 Mini returned 429 without Retry-After; verify entitlement/quota/concurrency with the provider before advertising it as ready. Do not silently substitute another model.
- Verify Bittensor live-chain service reachability and pinned sidecar artifact. Keep transaction submission disabled during acceptance. Check mainnet/testnet and freshness separately for each protocol.
- Keep one writer process per filesystem memory vault. Do not scale replicas against shared file storage on the assumption that the in-process queue is distributed locking.
- Populate `MATTERHORN_BUILD_COMMIT` and `VITE_MATTERHORN_BUILD_COMMIT` from the actual approved build commit in the existing build pipeline. Metadata must describe the deployed bytes, not just a desired release.

## Jev activation requires its own approval

Ordinary chat must work with Jev disabled. Keep `MATTERHORN_JEV_ENABLED` disabled until these steps are complete:

1. Provision a dedicated `TYPESAFE_API_KEY` securely. The CUDOS key is not a TypeSafe key.
2. Review the real TypeSafe training, retention and processing terms and approve the user-facing disclosure. Set `MATTERHORN_JEV_POLICY_REVIEWED_AT` to the genuine approved timestamp; the implementation rejects missing, future or stale approval. Do not manufacture a timestamp to bypass the check.
3. Set an operator budget and verify the pinned `jev-1.13.0` model is available. The current per-subject/per-store call limits are not a provider-wide monetary cap.
4. Enable `MATTERHORN_JEV_ENABLED=1` only in the approved staging environment first. Use explicit consenting disposable test accounts and non-sensitive prompts.
5. For every desk, test off, opt-in/on, remembered preference in a new chat, disable, Stop while classifying, failure and late result. Confirm off means no TypeSafe request and the chosen conversational model still answers.
6. Check actual classification quality, latency and separate usage records. Synthetic fixture results are not live TypeSafe acceptance. Reject permission widening or account/session/model mismatches.

If live verification fails, disable Jev and keep ordinary chat available. Do not downgrade its consent/privacy controls. [Implementation contract](../architecture/jev-integration-plan.md) and [TypeSafe HTTP reference](https://docs.typesafe.ai/api) provide the relevant boundaries.

## Preserve data and verify recovery

Before deployment or deletion maintenance, demonstrate an encrypted recovery backup with restricted access, retention policy, key owner and a successful restore into an isolated environment. Record time, source revision, checksums where appropriate, counts and restore outcome without exporting customer content into a public issue.

Verify a restored account can read its expected chats, notes and memory; verify another account cannot. Reconcile deletion requests before exposing restored data, so an old backup does not resurrect forgotten content. File mode 0600/0700 is not encryption, and a private plaintext copy is not encryption evidence.

No automatic legacy memory migration is included. If old soft-deleted content exists, obtain a maintenance window and follow [legacy deletion cleanup](../memory/legacy-deletion-cleanup.md): identify exact storage, stop all writers, inspect the read-only fingerprinted plan, review it, then explicitly apply. Never run broad recursive deletion or guess workspace ownership. Backups, exports, historical chat messages and provider copies require separate retention/deletion handling.

## Reproduce automated verification

Use repository-pinned pnpm 10.27.0 and the supported Bun/Node toolchain. Run in an isolated checkout with disposable test data and local networking. Install the frozen lockfile; follow the repository's vetted build prerequisites and lifecycle-script policy, not an unrestricted install from an unknown package source.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @matterhorn-work/types build
pnpm --filter @matterhorn-work/memory-vault build
pnpm --filter matterhorn-work-server test
pnpm --filter @matterhorn-work/app test
pnpm --filter matterhorn-work-server typecheck
pnpm --filter @matterhorn-work/app typecheck
pnpm --filter matterhorn-work-server build
pnpm --filter @matterhorn-work/app build
node --test scripts/matterhorn-memory-deletion.test.mjs
node scripts/matterhorn-memory-vault.test.mjs
node scripts/matterhorn-platform-safety-gate.mjs
pnpm audit:dependencies
pnpm release:secret-scan
git diff --check
```

Build any additional workspace dependencies required by the repository CI in a fresh checkout. Do not count a package filter matching zero projects as a successful build. Avoid running typecheck while another process cleans/rebuilds its dependency declarations. The secret-pattern scan intentionally excludes docs/tests/evidence; review the files being published separately.

## Hosted acceptance after approved deployment

Set `RELEASE_SHA` in your operator shell to the exact approved 40-character deployment commit. This variable is not a credential. Run the read-only probe:

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

Then use normal authenticated browser flows, not admin tokens or bypasses:

1. Create two controlled public-beta accounts with real inboxes. Verify email, normal login, password reset, old-link expiry/reuse rejection, logout and session revocation. Do not paste credentials into the report.
2. Select a model, open all five desks and complete a real response. For each public read, compare address/market/subnet, network, units, value, timestamp and limitations against the actual tool payload. A completed model message alone does not prove a successful read.
3. Test failed submission, stopped run, incomplete answer, safe continuation and retry with an unrelated draft present. Verify no repeated tools during continuation or double execution from repeated Send.
4. Compare cumulative provider-reported usage, run receipts and account allowance before/after requests and a controlled restart. Confirm no unexplained reserved/pending amounts. Treat unknown provider usage honestly.
5. Save/use/delete a disposable memory and note. Confirm the second account cannot access them. Switch accounts and check browser state contains no prior user's drafts, selected memory or conversation content.
6. Test supported integrations with authorized disposable resources; missing credentials must produce a truthful setup state. Do not sign transactions or run paid side effects as part of these read-only checks.
7. Check mobile, desktop, light/dark, keyboard, 200% zoom and actual Safari/Firefox. Record unavailable environments rather than substituting Chromium screenshots.

## Stop conditions and rollback

Do not approve public launch if the deployed SHA is wrong, guard enforcement is absent, account isolation fails, accounting double-charges or strands holds, any enabled core desk cannot complete its required read, or inbox/recovery/backup evidence is missing. Jev and Mini may remain explicitly unavailable; that requires an honest product/release decision, not a claim that their acceptance passed.

On failure, stop rollout and retain diagnostics without customer secrets. Restore the previous approved coordinated web/API/runtime artifacts only after checking data compatibility; preserve current persistent data. Do not overwrite live storage with an old snapshot as a routine code rollback. For Jev-only issues, disable that optional feature using the normal approved configuration path. For memory maintenance failures, keep writers stopped and follow the fingerprinted retry/recovery procedure.

## Return this evidence to the release owner

- Approved PRs and exact merge/deployed SHAs; service/deployment IDs and artifact digests.
- CI run URLs and the strict hosted probe JSON.
- Five-desk request outcomes with content-free identifiers, sources, timestamps and receipt/allowance totals.
- Jev enabled/disabled decision and live results if enabled; Mini quota outcome.
- Verification/reset inbox results and two-account isolation evidence.
- Encryption/access review and isolated restore result with recovery/deletion reconciliation.
- Remaining defects, rollback owner and explicit launch or no-launch decision.
