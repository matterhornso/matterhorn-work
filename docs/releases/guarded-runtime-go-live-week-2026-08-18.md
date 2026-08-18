# Matterhorn Desks go-live plan — week of 18 August 2026

Status: execution started 18 August 2026. Target: invite-only Public Beta launch
on Friday, 21 August 2026, with the guarded agent runtime deployed in `shadow`.
Full desk-by-desk enforcement continues after launch; it must not be compressed
to meet the launch date.

## Launch definition

Friday's launch is a production Public Beta with:

- Public signup, email ownership verification, legal acknowledgement and
  Turnstile protection working end to end.
- Authenticated same-origin frontend-to-control-plane routing.
- Server-managed ASI:Cloud inference and hard per-account/platform usage caps.
- Public research across Bittensor, Hyperliquid, Polymarket, Sui and generic
  crypto chat.
- Transaction preparation through reviewed-action v2 handoffs. The connected
  wallet remains the only signer and submitter.
- Guarded runtime decisions recorded in `shadow` for 48 hours. Shadow cannot
  weaken an existing privacy, permission or wallet denial.
- Run receipts, user-content purge and 365-day content-free security receipts.
- Free Beta only. Stripe live charging and autonomous agent execution remain
  disabled.

Go-live does **not** mean enabling every guarded-runtime capability in
`enforce`. The required observation windows place full staged enforcement after
the Public Beta launch:

1. Sui prepare calls.
2. Bittensor prepare calls.
3. Hyperliquid prepare calls.
4. Polymarket prepare calls.
5. Read calls for the same desks.
6. Generic crypto chat.

Each step needs its own clean evidence window and one-switch rollback.

## Authoritative baseline at start

Captured on 18 August 2026:

| Surface | Evidence | State |
|---|---|---|
| Git default branch | `dev` at `ae7935a90c31bde063529c054e81c86749e406e9` | Current source baseline |
| Public app | `https://matterhorn-desks-canary.vercel.app` | Online |
| Deployed API commit | `094f7ed820295bd9ed6481cff4440281e6aaaeed` | Healthy but behind `dev` |
| Deployment perimeter | Strict external probe | READY: HTTPS, headers, same-origin proxy, exact CORS and untrusted-origin rejection pass |
| Railway control plane | `control-plane-production-d46b.up.railway.app` | Online with encrypted `/data` volume |
| CUDOS / ASI:Cloud | Server credential configured | Present |
| Provider policy | Opt-in-only, opt-in disabled, reviewed policy URL/date | Configured |
| Turnstile | Site key, server secret and exact production hostname | Configured |
| Email delivery | Resend and authenticated SMTP | **Missing — signup blocker** |
| Public signup | `MATTERHORN_SIGNUPS_ENABLED=false` | Correctly disabled |
| Guarded runtime | Mode and two runtime secrets | Both secrets and `off` are staged in Railway without a deploy; guarded code is not deployed yet |
| Live autonomous execution | Submission flags | Unset/disabled |

Do not copy secret values into release evidence. Presence checks may record only
`configured`, length, or a public policy value.

## Owners

| Owner | Responsibilities |
|---|---|
| Release engineer | Release branch/PR, CI, exact-SHA builds, Railway/Vercel deployment, probes, rollback rehearsal and evidence packet |
| Product owner | Add the Resend credential, approve Terms/Privacy text and versions, approve invite list and final GO |
| QA operator | Two-account hosted acceptance, wallet rejection/expiry/tamper cases, viewport/accessibility sweep |
| On-call owner | Monitor readiness, failed inference, signup/email delivery, capability denials and support inbox during launch |

One person may hold several roles, but each gate requires a named owner in the
final evidence packet.

## Schedule

### Tuesday night, 18 August — release candidate

1. Freeze `dev` as the release base.
2. Commit guarded-runtime source, tests, threat model, benchmark and this
   runbook on `codex/guarded-agent-runtime`.
3. Open a draft PR to `dev` and attach exact validation results.
4. Require all GitHub checks; resolve failures without weakening a gate.
5. Configure two independently generated 32-byte-or-longer Railway secrets:
   `MATTERHORN_AGENT_RUNTIME_SECRET` and
   `MATTERHORN_CAPABILITY_SIGNING_SECRET`.
6. Set `MATTERHORN_GUARDED_RUNTIME_MODE=off`. Do not set enforce selectors.
7. Keep `MATTERHORN_SIGNUPS_ENABLED=false`.

Exit evidence:

- Reviewable PR with no unrelated QA artifacts.
- 945 app tests and 927 server tests pass or improve on the exact release tree.
- Typecheck/build, 10-stage safety gate, secret scan, dependency audit,
  container contract and bundle budget pass.

### Wednesday, 19 August — deploy off, then begin shadow

1. Product owner adds `MATTERHORN_RESEND_API_KEY` in Railway. Do not send it in
   chat or add it to a Vercel browser variable.
2. Send one real verification email and one real password-reset email from
   `Matterhorn Desks <updates@matterhorn.so>`.
3. Merge the guarded-runtime PR only after required checks and review.
4. Deploy the exact merge SHA to Railway with guarded mode `off` and update
   `MATTERHORN_BUILD_COMMIT` to that SHA.
5. Deploy the same exact merge SHA to Vercel and promote the immutable
   deployment to the canonical alias.
6. Run the strict deployment probe. The frontend/API commit, same-origin proxy,
   security headers and CORS must match.
7. Run authenticated smoke with signups still disabled.
8. Change only `MATTERHORN_GUARDED_RUNTIME_MODE` from `off` to `shadow` and
   restart Railway. Record the shadow start timestamp and deployment id.
9. Capture the content-free starting counter snapshot with
   `pnpm capture:guarded-runtime-shadow`; keep the host token only in the
   operator environment.

Exit evidence:

- `/health/ready` returns 200 and the exact release commit.
- Missing either guarded secret makes a shadow startup/readiness check fail.
- Public research, private-context consent and secret blocking behave the same
  as the accepted release tree.
- Shadow decisions are visible in bounded operational evidence without raw
  prompts, arguments, secrets or capabilities.
- The starting snapshot is integrity-bound to the exact merge commit and
  reports `shadow`, ready, and the current process uptime.

### Thursday, 20 August — hosted acceptance and observation

Keep the backend single-instance. Capability issuance and consumption are
process-local in this release; horizontal scaling is prohibited until a shared
transactional nonce store exists.

Run two-account acceptance with separate browsers/profiles:

1. Account A cannot read Account B's workspace, sessions, memories, preflights,
   grants, receipts or reviewed actions; repeat in the opposite direction.
2. Each account completes a normal model response and receives a usage/privacy
   receipt after reload.
3. Private selected memory through ASI:Cloud produces exact-request disclosure
   and consent. Editing prompt, model, provider, attachment or memory invalidates
   consent.
4. A secret-shaped prompt creates no provider call, usage reservation or raw
   audit entry.
5. Malicious instruction text in MCP/protocol evidence cannot broaden tools or
   request capabilities.
6. Cancel, failure and timeout runs produce content-free receipts and restore a
   usable composer.
7. Owner purge removes user-controlled content while the minimal security chain
   remains until normal expiry.

Protocol matrix for each account where applicable:

| Desk | Public read | Reviewed test action | Negative cases |
|---|---|---|---|
| Bittensor | Balance, validators/subnets | Transfer and stake preview | reject, expire, mutate amount/validator |
| Hyperliquid | Markets, positions, orderbook | Order/modify/cancel/close preview | reject, expire, mutate price/slippage |
| Polymarket | Discovery and compliance | Eligible wallet ticket | geoblock, reject, mutate market/outcome |
| Sui | Balance, coin/object reads | Native, coin and object transfer preview | reject, expire, mutate recipient/network |

No test may broadcast mainnet funds. Wallet tests use testnet, rejected signatures
or non-broadcast previews.

Record these outcomes in the v2 hosted-acceptance contract. Start from the
checked-in template, fill only observed results, and attach an existing report
file for every passing journey:

```bash
mkdir -p qa-reports/guarded-hosted
cp docs/product-hunt-acceptance-evidence.example.json \
  qa-reports/guarded-hosted/acceptance-input.json

pnpm gate:product-hunt-acceptance -- \
  --evidence qa-reports/guarded-hosted/acceptance-input.json \
  --json-output qa-reports/guarded-hosted/acceptance-readiness.json \
  --json --strict
```

`matterhorn.product-hunt-acceptance-evidence.v2` fails closed unless it proves
the complete signup journey, two-account isolation across guarded artifacts,
privacy and adversarial capability cases, generic crypto completion, and every
desk's public/private, model, receipt, prepare, reject, expiry, tamper, wallet
review, reload, and protocol-specific scenarios. Evidence contains outcomes and
references only—never accounts, prompts, wallet addresses, signatures,
credentials, capabilities, or unrestricted tool output.

Also run:

- 320, 375, 768 and 1440 pixel viewport checks.
- Keyboard-only signup, chat, receipt and wallet-review traversal.
- Axe/WCAG 2.2 AA scan of public entry, trust routes, Home, chat, Settings and
  each desk.
- Browser console/network audit with zero unexplained errors.
- Encrypted user-data backup and disposable restore rehearsal.
- Rollback rehearsal to the previous immutable Railway/Vercel deployment.

After the full 48-hour window, capture the final counter snapshot and run
`pnpm gate:guarded-runtime-shadow`. The gate fails if the commit or origin
changed, process uptime does not cover the window, counters reset, read or
prepare calls were not exercised, or any `would_deny`/`bypassed` observation
lacks an exact snapshot-bound human review. Evidence files must never contain
the host token, prompts, tool arguments, wallet identities or capabilities.

### Friday, 21 August — GO/NO-GO and Public Beta

At or after the full 48-hour shadow window:

1. Freeze deploys except launch-blocker fixes.
2. Re-run the strict deployment probe, health, signup, model completion,
   two-account isolation and one wallet handoff per desk.
3. Review shadow results:
   - query `matterhorn_guarded_capability_decisions_total` by `stage`,
     `decision` and bounded `reason`; investigate every `would_deny` and any
     unexpected `bypassed` count before enforcement;
   - no unexplained privacy allows;
   - no unexplained capability grants;
   - no cross-tenant access;
   - no capability replay or argument mutation accepted;
   - no agent-accessible submit path;
   - no material increase in failed valid read/prepare flows;
   - no raw content in receipts or telemetry.
4. Confirm support inbox and on-call owner for the launch window.
5. Enable signups only after email, Turnstile, legal and usage-limit acceptance:
   `MATTERHORN_SIGNUPS_ENABLED=true`.
6. Restart Railway and create one final account through the public UI.
7. Product owner signs the GO record and releases the invite list.

Launch with guarded mode still in `shadow`. If shadow evidence is ambiguous,
launch may proceed only with the existing safe privacy and wallet controls still
enforced and the guarded runtime kept `off`; never enable `enforce` to meet a
calendar date.

## Required gates

### Source and supply chain

- Exact release SHA on `dev`, Railway and Vercel.
- Required GitHub checks green.
- `pnpm release:secret-scan` reports zero findings.
- Dependency audit reports zero known low-or-higher advisories.
- OpenWork/OpenCode compatibility remains OpenWork `0.18.23` and OpenCode
  `1.18.18` for this launch.
- Container image is built from `packaging/docker/Dockerfile.public-beta`.

### Authentication and abuse protection

- Sign in, sign out, signup, email verification, password reset and cookie
  renewal pass in production.
- Turnstile verifies the `signup` action and exact production hostname.
- Terms and Privacy versions are stored against the account.
- Account cap and persistent rate-limit database survive restart.
- Signups fail closed if email or Turnstile becomes unavailable.

### Inference and usage

- Selected model is actually used and completes a response.
- Provider/model/privacy/retention disclosure matches server configuration.
- Hard daily/monthly account and platform limits are active.
- Usage reservation occurs before provider dispatch and reconciles after
  completion.
- Run receipt shows input/output/cache/reasoning tokens, duration and estimated
  cost without storing the prompt.

### Privacy and agent security

- Preflight precedes usage, audit, OpenCode and provider contact.
- Consent is exact, five-minute and single-use.
- Secrets are blocked locally without echo.
- Capabilities expire after 60 seconds and reject replay, changed arguments,
  wrong tool, wrong desk, wrong session and wrong workspace.
- Active desk exposes only its read/prepare tools.
- Untrusted evidence cannot alter policy, agents, providers, consent or grants.

### Wallet and transaction safety

- Agent/MCP/CLI paths have zero sign, relay and submit authority.
- v1 handoffs display only and require v2 regeneration.
- v2 includes exact action/policy hashes, signer, network, terms, expiry and
  fresh simulation reference.
- Changed terms invalidate review.
- Wallet rejection/timeout produces no public chain receipt.
- Imported receipts must reconcile to the reviewed intent hash.

### Operations

- `/health/live` and `/health/ready` are externally monitored.
- Same-origin `/workspaces` and `/opencode` return JSON authentication failures,
  never SPA HTML.
- Backup/restore and rollback rehearsals are recent and attached.
- Support and vulnerability-reporting routes are staffed/working.
- Launch dashboard has bounded metrics only; no prompts, wallet identities,
  tool arguments or secrets.
- `matterhorn_guarded_capability_decisions_total` is present after a shadow
  read/prepare flow and contains only the documented bounded labels.

## Commands

Run against the exact release tree:

```bash
bun test apps/app/tests --only-failures
bun test apps/server/src --only-failures
pnpm --filter @matterhorn-work/app typecheck
pnpm --dir apps/server typecheck
pnpm --filter @matterhorn-work/app build:web
pnpm --dir apps/server build
pnpm --dir packages/types build
pnpm test:matterhorn-platform-safety
pnpm release:secret-scan
pnpm gate:task-first-bundle-budget
node scripts/public-beta-container-contract.test.mjs
node scripts/opencode-runtime-compatibility.test.mjs
```

Production perimeter, with the release SHA substituted:

```bash
node scripts/product-hunt-deployment-probe.mjs \
  --app-url https://matterhorn-desks-canary.vercel.app \
  --server-url https://matterhorn-desks-canary.vercel.app \
  --expected-commit <release-sha> \
  --health-path /health/ready \
  --expected-guarded-mode off \
  --expected-signup-status paused \
  --strict
```

After switching the backend to shadow, repeat the probe with
`--expected-guarded-mode shadow`. On launch day, repeat it only after enabling
signups with `--expected-signup-status open`; that check fails unless the public
auth config also proves email verification, password reset, legal acceptance,
and Turnstile are all available. This prevents a healthy API from masking an
unusable or incompletely protected signup flow.

Start and end shadow snapshots, using the direct Railway control-plane origin
and an operator-only host token environment variable:

```bash
export MATTERHORN_WORK_HOST_TOKEN='<read from the Railway secret manager>'
mkdir -p qa-reports/guarded-shadow
pnpm capture:guarded-runtime-shadow -- \
  --server-url https://control-plane-production-d46b.up.railway.app \
  --expected-commit <release-sha> \
  --output qa-reports/guarded-shadow/shadow-start.json

# Repeat after at least 48 hours with shadow-end.json, then evaluate:
pnpm template:guarded-runtime-shadow-review -- \
  --baseline qa-reports/guarded-shadow/shadow-start.json \
  --final qa-reports/guarded-shadow/shadow-end.json \
  --reviewer '<release-owner-name>' \
  --output qa-reports/guarded-shadow/shadow-review.json

# Review every generated REVIEW_REQUIRED item. Replace its disposition with
# expected_test or accepted_policy, add a specific note, and attach the cited
# evidence file. Leave the generated commit and snapshot hashes unchanged.
pnpm gate:guarded-runtime-shadow -- \
  --baseline qa-reports/guarded-shadow/shadow-start.json \
  --final qa-reports/guarded-shadow/shadow-end.json \
  --review qa-reports/guarded-shadow/shadow-review.json \
  --output qa-reports/guarded-shadow/shadow-evidence.json \
  --json
unset MATTERHORN_WORK_HOST_TOKEN
```

The template command binds `matterhorn.guarded-runtime-shadow-review.v1` to the
SHA-256 of both snapshot files and generates one fail-closed
`REVIEW_REQUIRED` item for every exact denial or rollout bypass delta. A clean
window produces an empty item list. For an anomalous window, the named reviewer
must classify every generated stage, decision, reason and delta as
`expected_test` or `accepted_policy`, write a specific note, and cite an
existing evidence file. The gate rejects untouched templates, missing evidence,
hash changes and incomplete reviews. A product or policy fix requires a new
commit and a new observation window; it cannot be waived in the review file.

The public configuration gate must run from a controlled environment that has
the deployment variables. Its JSON output must be stored under the final QA
evidence directory; never attach the environment itself.

## GO criteria

GO requires every gate above and all of the following:

- Email verification and password reset succeed with a real mailbox.
- Two-account hosted isolation passes in both directions.
- A real hosted model completion and receipt pass for each crypto desk.
- Every wallet handoff negative case fails closed.
- Shadow has completed 48 hours with no unexplained allow/grant.
- Exact release SHA is proven on the public API.
- Backup restore and rollback are rehearsed.
- Product owner, QA operator and on-call owner are named.

Any missing evidence is a NO-GO, not a warning.

## Rollback

Before the first candidate deploy, record all of the following in the private
release evidence packet: current commit, last-known-good commit, Railway project
id, service id, environment id, last-known-good immutable Railway deployment id,
last-known-good immutable Vercel deployment URL, Vercel scope, rollback owner and
on-call owner. Do not record CLI credentials or deployment secrets.

Inspect the exact plan without mutation:

```bash
pnpm rollback:public-beta -- \
  --railway-project "$RAILWAY_PROJECT_ID" \
  --railway-service "$RAILWAY_SERVICE_ID" \
  --railway-environment "$RAILWAY_ENVIRONMENT" \
  --railway-deployment-id "$LAST_KNOWN_GOOD_RAILWAY_DEPLOYMENT_ID" \
  --vercel-deployment "$LAST_KNOWN_GOOD_VERCEL_DEPLOYMENT_URL" \
  --vercel-scope "$VERCEL_SCOPE" \
  --current-commit "$MATTERHORN_BUILD_COMMIT" \
  --target-commit "$LAST_KNOWN_GOOD_COMMIT" \
  --json
```

Apply rollback only through `pnpm drill:product-hunt-rollback` and
`scripts/public-beta-rollback-hook.mjs`, following the full command in
[`docs/production-launch-configuration.md`](../production-launch-configuration.md).
The hook is dry-run by default. Application requires both `--apply` and the
literal confirmation `rollback:<last-known-good-commit>`. The rehearsal first
proves the current commit. Before mutation, the hook verifies that both rollback
targets exist, are healthy or successful and belong to the exact configured
Railway project/service/environment and Vercel production project. The
rehearsal then proves the target commit is healthy twice.

1. Set `MATTERHORN_SIGNUPS_ENABLED=false` to stop account creation without
   affecting existing accounts.
2. Set `MATTERHORN_GUARDED_RUNTIME_MODE=off` to remove guarded-runtime routing
   while preserving existing safe privacy and wallet controls.
3. Disable `VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED` and redeploy the web
   app to hide reviewed action entry points if a wallet issue is suspected.
4. Promote the last accepted immutable Vercel deployment.
5. Roll Railway back to the last accepted immutable deployment while preserving
   the encrypted `/data` volume.
6. Re-run health and the strict external probe after every rollback step.

Never delete the persistent volume, rotate account-password hashes, clear usage
ledgers or discard security receipts as part of application rollback.

## First 24 hours after launch

- Review readiness, signup success, email delivery, model completion latency,
  provider errors, usage reservations, capability shadow denials and wallet
  handoff failures at 15 minutes, one hour, four hours and 24 hours.
- Keep signups capped at 100 and model limits at 250k weighted tokens/day and
  2m/month per account.
- Freeze mainnet enablement, live Stripe charging and public OAuth connectors.
- Triage any privacy, tenant-isolation or transaction-binding anomaly as an
  immediate signup freeze and guarded-runtime rollback.
- Start Sui prepare enforcement only in a separate approved change after the
  launch window and shadow review are complete.
