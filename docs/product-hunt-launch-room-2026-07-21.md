# Matterhorn Desks Product Hunt Launch Room - 2026-07-21

This runbook is the single decision path for Product Hunt. If this file,
`launch-channel-readiness.mjs`, and an older launch document disagree, the
machine gate and the stricter stop-ship rule win.

## Decision Rule

Launch only when all five evaluated reports are ready, their commits match the
stable tag, the Product Hunt channel gate says `GO`, and the final packet has no
blockers. A local, fixture, preview, stale, unsigned, or differently committed
report is not evidence.

## Owners

Replace every `UNASSIGNED` before T-12 hours. Any unassigned critical role is
**NO-GO**.

| Role | Owner | Backup | Responsibility |
|---|---|---|---|
| Launch owner | UNASSIGNED | UNASSIGNED | Final GO/NO-GO and listing publication. |
| Engineering | UNASSIGNED | UNASSIGNED | Stable tag, deploy, health, and build consistency. |
| Security | UNASSIGNED | UNASSIGNED | CORS, headers, dependencies, secrets, and wallet boundaries. |
| Product and QA | UNASSIGNED | UNASSIGNED | Deployed journeys, copy, screenshots, and deferred-state truth. |
| Wallet QA | UNASSIGNED | UNASSIGNED | MetaMask, Coinbase, Phantom/Sui, and Hyperliquid testnet evidence. |
| Operations | UNASSIGNED | UNASSIGNED | Monitoring, backup, restore, rollback, and alerts. |
| Support | UNASSIGNED | UNASSIGNED | Inbox, response triage, user updates, and escalation. |
| Communications | UNASSIGNED | UNASSIGNED | Product Hunt listing, maker replies, and social posts. |

Record the private incident channel, public support URL, dashboard URL, and
deployment console in the operator-only launch note. Never commit credentials
or private escalation links.

## T-24 Hours - Freeze

1. Freeze one full 40-character commit and create the stable tag from it.
2. Confirm deferred services are still hidden or disabled: Billing,
   generated-media publishing, Matterhorn Cloud, unaccepted OAuth connectors,
   and any wallet execution lane without external evidence.
3. Deploy that exact commit with `MATTERHORN_BUILD_COMMIT` set to the same SHA.
4. Build the app with the accepted OAuth allowlist only.
5. Generate signed and notarized macOS assets in CI from that commit.
6. Stop feature work. Only P0/P1 release fixes may reopen the candidate, and
   any fix creates a new commit, deploy, desktop build, and evidence cycle.

## T-12 Hours - External Proof

Run against the stable deployment and save reports under one new, immutable
evidence directory:

```bash
export RELEASE_COMMIT="$(git rev-parse <stable-tag>^{commit})"

pnpm smoke:product-hunt-deployment -- \
  --app-url "$MATTERHORN_APP_URL" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --expected-commit "$RELEASE_COMMIT" \
  --json-output qa-reports/product-hunt-2026-07-21/deployment.json

pnpm gate:product-hunt-acceptance -- \
  --evidence qa-reports/product-hunt-2026-07-21/acceptance-evidence.json \
  --expected-oauth "$ACCEPTED_OAUTH_CONNECTORS" \
  --json-output qa-reports/product-hunt-2026-07-21/acceptance.json

pnpm gate:product-hunt-operations -- \
  --evidence qa-reports/product-hunt-2026-07-21/operations-evidence.json \
  --json-output qa-reports/product-hunt-2026-07-21/operations.json
```

Run the signed desktop verifier in the release workflow with
`--source-commit "$RELEASE_COMMIT"`. Then complete a clean install, update, and
reinstall on a separate Mac user profile.

## T-6 Hours - Recovery Proof

Use a disposable restore workspace and the last known-good deployment. The
rollback hook must be a reviewed executable that accepts no secrets in its
arguments and routes the deployment to the immutable target commit.

```bash
pnpm drill:workspace-backup-restore -- \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --source-workspace "$MATTERHORN_WORKSPACE_ID" \
  --target-workspace "$MATTERHORN_RESTORE_WORKSPACE_ID" \
  --confirm-target "$MATTERHORN_RESTORE_WORKSPACE_ID" \
  --apply --json-output qa-reports/product-hunt-2026-07-21/backup-restore.json

export MATTERHORN_BACKUP_PASSPHRASE="<from the approved secret manager>"

pnpm backup:workspace-user-data -- \
  --workspace-root "$MATTERHORN_WORKSPACE_ROOT" \
  --opencode-db "$OPENCODE_DB" \
  --output "$MATTERHORN_ENCRYPTED_BACKUP_PATH" \
  --json-output qa-reports/product-hunt-2026-07-21/user-data-backup.json

pnpm backup:workspace-user-data -- \
  --restore \
  --workspace-root "$MATTERHORN_WORKSPACE_ROOT" \
  --archive "$MATTERHORN_ENCRYPTED_BACKUP_PATH" \
  --restore-to "$MATTERHORN_USER_DATA_RESTORE_ROOT" \
  --confirm-restore-to "$MATTERHORN_USER_DATA_RESTORE_ROOT" \
  --json-output qa-reports/product-hunt-2026-07-21/user-data-restore.json

pnpm drill:product-hunt-rollback -- \
  --app-url "$MATTERHORN_APP_URL" \
  --server-url "$MATTERHORN_WORK_SERVER_URL" \
  --from-commit "$RELEASE_COMMIT" \
  --to-commit "$LAST_KNOWN_GOOD_COMMIT" \
  --owner "$ROLLBACK_OWNER" \
  --rollback-hook "$REVIEWED_ROLLBACK_HOOK" \
  --json-output qa-reports/product-hunt-2026-07-21/rollback.json \
  --strict
```

Redeploy the release commit after the rollback drill and rerun the deployed
probe. Do not mutate an existing release artifact or tag.

## T-2 Hours - Final Gate

1. Run the complete Matterhorn platform safety gate, full suites, typechecks,
   production build, and dependency audit from the stable commit.
2. Confirm monitoring covers health, error rate, latency, and provider failures;
   send one test alert to the staffed owner.
3. Confirm privacy, terms, support, pricing/availability copy, screenshots,
   demo, and Product Hunt listing all use the approved launch kit. Verify
   `/privacy`, `/terms`, `/security`, `/support`, and `/status` load without an
   account. The legal owner approves Privacy and Terms; the Support owner proves
   the published contact is staffed.
4. Generate the Product Hunt readiness report from fresh evidence.
5. Bind every evaluated report into the final packet:

```bash
pnpm pack:product-hunt-evidence -- \
  --commit "$RELEASE_COMMIT" \
  --readiness qa-reports/product-hunt-2026-07-21/readiness.json \
  --deployment qa-reports/product-hunt-2026-07-21/deployment.json \
  --operations qa-reports/product-hunt-2026-07-21/operations.json \
  --acceptance qa-reports/product-hunt-2026-07-21/acceptance.json \
  --desktop qa-reports/product-hunt-2026-07-21/desktop-public-release.json \
  --output-dir qa-reports/product-hunt-2026-07-21/final
```

Engineering, Security, Product/QA, and Operations each record `GO` against the
packet SHA-256. The launch owner records the final decision last.

## Launch Window

- Watch app/API health, 5xx errors, p95 latency, provider failures, task
  completion, wallet reject/approve outcomes, and support volume.
- Reply to Product Hunt questions with the capability boundary in the launch
  kit. Do not promise deferred services in comments.
- Check support and incident channels every 15 minutes for the first two hours,
  every 30 minutes through T+6, and hourly through T+12.
- Preserve public-safe receipts and redacted support reports. Never ask users
  to paste credentials or signing material.

## Incident Rules

| Severity | Examples | Action |
|---|---|---|
| P0 | Auth bypass, key/signature exposure, wallet action without exact review, data loss, widespread outage. | Stop promotion, disable affected capability, begin rollback immediately, and post a user update. |
| P1 | Core chat/desk unusable, repeated task loss, broken wallet reject path, bad release artifact, major provider failure without truthful fallback. | Freeze new traffic, assign an owner within 15 minutes, fix or roll back. |
| P2 | Recoverable UX defect, isolated connector failure that is already disabled, minor copy or layout issue. | Log, communicate workaround, and schedule a reviewed fix. |

Never recover by bypassing auth, approvals, CORS, wallet signing, entitlement,
secret redaction, or data controls.

## Hard Stop-Ship

- Any report is missing, stale, not ready, or tied to another commit.
- Any P0/P1 is open.
- A visible OAuth connector lacks acceptance evidence.
- A public macOS artifact is unsigned, unnotarized, unstapled, or rejected by
  Gatekeeper.
- The rollback or restore drill fails.
- Privacy, terms, support, pricing, or owner fields remain unapproved.
- Product copy claims custody, unattended execution, mainnet readiness, or a
  deferred service.
